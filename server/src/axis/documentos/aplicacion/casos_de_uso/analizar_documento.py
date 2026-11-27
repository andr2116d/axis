import asyncio
import hashlib
import time
from collections.abc import Mapping, Sequence
from dataclasses import replace
from uuid import uuid4

from axis.compartido.dominio.reloj import Reloj
from axis.documentos.aplicacion.dto import (
    LecturaArchivo,
    OrdenAnalizarDocumento,
    PaginaLeida,
    ResultadoAnalisis,
    TextoReconocido,
)
from axis.documentos.aplicacion.puertos import (
    AlmacenArchivos,
    LectorArchivos,
    ModelosDocumentos,
    MotorOcr,
    ProveedorModelos,
    RepositorioCorrecciones,
    RepositorioDocumentos,
)
from axis.documentos.aplicacion.servicios import aplicar_correcciones
from axis.documentos.dominio.entidades import Documento, EvaluacionEdicion, Pagina
from axis.documentos.dominio.errores import (
    ArchivoNoSoportado,
    ArchivoVacio,
    ModelosNoDisponibles,
)
from axis.documentos.dominio.servicios import clasificar_origen, detectar_senales, segmentar
from axis.documentos.dominio.valores import IdDocumento, OrigenPagina, TipoArchivo


class AnalizarDocumento:
    """Dice qué es un archivo, sus partes, el origen de cada página y si fue editado."""

    def __init__(  # noqa: PLR0913 - son los puertos del caso de uso
        self,
        *,
        repositorio: RepositorioDocumentos,
        correcciones: RepositorioCorrecciones,
        almacen: AlmacenArchivos,
        lector: LectorArchivos,
        ocr: MotorOcr,
        modelos: ProveedorModelos,
        reloj: Reloj,
    ) -> None:
        self._repositorio = repositorio
        self._correcciones = correcciones
        self._almacen = almacen
        self._lector = lector
        self._ocr = ocr
        self._modelos = modelos
        self._reloj = reloj

    async def ejecutar(self, orden: OrdenAnalizarDocumento) -> ResultadoAnalisis:
        inicio = time.perf_counter()
        if not orden.contenido:
            raise ArchivoVacio("el archivo está vacío")
        modelos = self._modelos.actual()
        if modelos is None:
            raise ModelosNoDisponibles("todavía no hay modelos de documentos entrenados")

        hash_contenido = await asyncio.to_thread(_sha256, orden.contenido)
        # El mismo archivo ya analizado no se vuelve a procesar: es la respuesta más rápida posible.
        existente = await self._repositorio.buscar_por_hash(hash_contenido)
        if existente is not None and existente.version_modelos == modelos.version:
            return ResultadoAnalisis(existente, desde_cache=True, duracion_ms=_ms(inicio))

        documento = await self._analizar(orden, hash_contenido, modelos)
        # Lo que el evaluador ya corrigió de este archivo no se pierde con un modelo nuevo.
        correcciones = await self._correcciones.listar(hash_contenido)
        documento = await aplicar_correcciones(documento, correcciones, modelos)
        await self._repositorio.guardar(documento)
        return ResultadoAnalisis(documento, desde_cache=False, duracion_ms=_ms(inicio))

    async def _analizar(
        self, orden: OrdenAnalizarDocumento, hash_contenido: str, modelos: ModelosDocumentos
    ) -> Documento:
        tipo_archivo = self._lector.detectar_tipo(orden.contenido)
        if tipo_archivo is TipoArchivo.DESCONOCIDO:
            raise ArchivoNoSoportado("solo se aceptan PDF, Excel (.xlsx) e imágenes")

        # Guardar el original y leerlo no dependen uno del otro: van en paralelo.
        lectura, _ = await asyncio.gather(
            self._lector.leer(orden.contenido, tipo_archivo),
            self._almacen.guardar(_clave(hash_contenido), orden.contenido, tipo_archivo),
        )
        paginas = await self._leer_paginas(orden.contenido, tipo_archivo, lectura)
        paginas = await self._clasificar_paginas(paginas, modelos)
        tipo, rareza = await asyncio.gather(
            modelos.documentos.clasificar(paginas),
            modelos.rareza.medir(lectura.huella, paginas),
        )
        return Documento(
            id=IdDocumento(uuid4()),
            hash_contenido=hash_contenido,
            nombre_original=orden.nombre,
            huella=lectura.huella,
            paginas=paginas,
            partes=segmentar(paginas),
            tipo=tipo,
            edicion=EvaluacionEdicion(detectar_senales(lectura.huella, paginas), rareza),
            fase_subida=orden.fase,
            version_modelos=modelos.version,
            subido_en=self._reloj.ahora(),
        )

    async def _leer_paginas(
        self, contenido: bytes, tipo_archivo: TipoArchivo, lectura: LecturaArchivo
    ) -> tuple[Pagina, ...]:
        origenes = [
            clasificar_origen(len(p.texto.strip()), p.cobertura_imagen) for p in lectura.paginas
        ]
        # Solo pasan por OCR las páginas que lo necesitan: es el paso más lento de todos.
        escaneadas = [
            p.numero
            for p, origen in zip(lectura.paginas, origenes, strict=True)
            if origen is OrigenPagina.ESCANEADA
        ]
        reconocidos: Mapping[int, TextoReconocido] = {}
        if escaneadas:
            reconocidos = await self._ocr.reconocer(contenido, tipo_archivo, escaneadas)
        return tuple(
            _a_pagina(p, origen, reconocidos.get(p.numero))
            for p, origen in zip(lectura.paginas, origenes, strict=True)
        )

    async def _clasificar_paginas(
        self, paginas: Sequence[Pagina], modelos: ModelosDocumentos
    ) -> tuple[Pagina, ...]:
        con_texto = [p for p in paginas if p.texto.strip()]
        clasificaciones = await modelos.paginas.clasificar([p.texto for p in con_texto])
        por_numero = {p.numero: c for p, c in zip(con_texto, clasificaciones, strict=True)}
        return tuple(replace(p, clasificacion=por_numero.get(p.numero)) for p in paginas)


def _a_pagina(
    leida: PaginaLeida, origen: OrigenPagina, reconocido: TextoReconocido | None
) -> Pagina:
    return Pagina(
        numero=leida.numero,
        origen=origen,
        texto=reconocido.texto if reconocido else leida.texto,
        ancho_pt=leida.ancho_pt,
        alto_pt=leida.alto_pt,
        confianza_ocr=reconocido.confianza if reconocido else None,
    )


def _sha256(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()


def _clave(hash_contenido: str) -> str:
    # La clave es el hash: el mismo archivo subido dos veces ocupa un solo lugar.
    return f"originales/{hash_contenido[:2]}/{hash_contenido}"


def _ms(inicio: float) -> int:
    return round((time.perf_counter() - inicio) * 1000)
