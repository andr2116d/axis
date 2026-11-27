import asyncio
import hashlib
import time
from collections.abc import Mapping, Sequence
from dataclasses import replace
from uuid import uuid4

from axis.compartido.dominio.avance import Avance, Avisador, sin_aviso
from axis.compartido.dominio.partidas import Palabra, Partida, extraer_partidas
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

# Cambia cuando cambia cómo se lee un archivo (por ejemplo, el extractor de partidas). Entra en
# la clave de caché junto con la versión de los modelos: un lector nuevo obliga a releer.
VERSION_LECTURA = "lectura-3"


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

    async def ejecutar(
        self, orden: OrdenAnalizarDocumento, avisar: Avisador = sin_aviso
    ) -> ResultadoAnalisis:
        inicio = time.perf_counter()
        if not orden.contenido:
            raise ArchivoVacio("el archivo está vacío")
        modelos = self._modelos.actual()
        if modelos is None:
            raise ModelosNoDisponibles("todavía no hay modelos de documentos entrenados")

        hash_contenido = await asyncio.to_thread(_sha256, orden.contenido)
        # El mismo archivo ya analizado no se vuelve a procesar: es la respuesta más rápida posible.
        existente = await self._repositorio.buscar_por_hash(hash_contenido)
        version = _version(modelos)
        if existente is not None and existente.version_modelos == version:
            await avisar(Avance("ya_analizado", "Este archivo ya se había analizado."))
            return ResultadoAnalisis(existente, desde_cache=True, duracion_ms=_ms(inicio))

        documento = await self._analizar(orden, hash_contenido, modelos, avisar)
        # Lo que el evaluador ya corrigió de este archivo no se pierde con un modelo nuevo.
        correcciones = await self._correcciones.listar(hash_contenido)
        documento = await aplicar_correcciones(documento, correcciones, modelos)
        await self._repositorio.guardar(documento)
        await avisar(_avance_documento(documento))
        return ResultadoAnalisis(documento, desde_cache=False, duracion_ms=_ms(inicio))

    async def _analizar(
        self,
        orden: OrdenAnalizarDocumento,
        hash_contenido: str,
        modelos: ModelosDocumentos,
        avisar: Avisador,
    ) -> Documento:
        tipo_archivo = self._lector.detectar_tipo(orden.contenido)
        if tipo_archivo is TipoArchivo.DESCONOCIDO:
            raise ArchivoNoSoportado("solo se aceptan PDF, Excel (.xlsx) e imágenes")

        # Guardar el original y leerlo no dependen uno del otro: van en paralelo.
        lectura, _ = await asyncio.gather(
            self._lector.leer(orden.contenido, tipo_archivo),
            self._almacen.guardar(_clave(hash_contenido), orden.contenido, tipo_archivo),
        )
        paginas, palabras = await self._leer_paginas(orden.contenido, tipo_archivo, lectura, avisar)
        # Clasificar y extraer partidas no dependen uno del otro: van en paralelo.
        paginas, partidas = await asyncio.gather(
            self._clasificar_paginas(paginas, modelos),
            asyncio.to_thread(_extraer_todas, palabras),
        )
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
            version_modelos=_version(modelos),
            subido_en=self._reloj.ahora(),
            partidas=partidas,
        )

    async def _leer_paginas(
        self,
        contenido: bytes,
        tipo_archivo: TipoArchivo,
        lectura: LecturaArchivo,
        avisar: Avisador,
    ) -> tuple[tuple[Pagina, ...], dict[int, tuple[Palabra, ...]]]:
        origenes = [
            clasificar_origen(len(p.texto.strip()), p.cobertura_imagen) for p in lectura.paginas
        ]
        # Solo pasan por OCR las páginas que lo necesitan: es el paso más lento de todos.
        escaneadas = [
            p.numero
            for p, origen in zip(lectura.paginas, origenes, strict=True)
            if origen is OrigenPagina.ESCANEADA
        ]
        total, escaneos = len(lectura.paginas), len(escaneadas)
        await avisar(
            Avance(
                "lectura",
                f"{total} páginas leídas; {escaneos} son escaneos y pasan por OCR.",
                {"paginas": total, "escaneadas": escaneos},
            )
        )
        reconocidos: Mapping[int, TextoReconocido] = {}
        if escaneadas:
            hechas = 0

            async def al_leer(numero: int) -> None:
                nonlocal hechas
                hechas += 1
                await avisar(
                    Avance(
                        "ocr",
                        f"OCR: {hechas} de {escaneos} páginas.",
                        {"pagina": numero, "hechas": hechas, "total": escaneos},
                    )
                )

            reconocidos = await self._ocr.reconocer(contenido, tipo_archivo, escaneadas, al_leer)
        paginas = tuple(
            _a_pagina(p, origen, reconocidos.get(p.numero))
            for p, origen in zip(lectura.paginas, origenes, strict=True)
        )
        palabras = {
            p.numero: reconocidos[p.numero].palabras if p.numero in reconocidos else p.palabras
            for p in lectura.paginas
        }
        return paginas, palabras

    async def _clasificar_paginas(
        self, paginas: Sequence[Pagina], modelos: ModelosDocumentos
    ) -> tuple[Pagina, ...]:
        con_texto = [p for p in paginas if p.texto.strip()]
        clasificaciones = await modelos.paginas.clasificar([p.texto for p in con_texto])
        por_numero = {p.numero: c for p, c in zip(con_texto, clasificaciones, strict=True)}
        return tuple(replace(p, clasificacion=por_numero.get(p.numero)) for p in paginas)


def _avance_documento(documento: Documento) -> Avance:
    partes = sorted({p.etiqueta for p in documento.partes})
    cuadran = sum(1 for p in documento.partidas if p.cuadra)
    return Avance(
        "documento",
        f"Es {documento.tipo.etiqueta}: {len(partes)} partes y {len(documento.partidas)} partidas.",
        {
            "id_documento": str(documento.id),
            "tipo": str(documento.tipo.etiqueta),
            "partes": ", ".join(partes),
            "partidas": len(documento.partidas),
            "partidas_que_cuadran": cuadran,
        },
    )


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


def _extraer_todas(palabras: dict[int, tuple[Palabra, ...]]) -> tuple[Partida, ...]:
    # Se extrae de todas las páginas, no solo de las clasificadas como presupuesto: es barato
    # (milisegundos) y así una corrección del tipo de página no obliga a volver a leer el archivo.
    return tuple(p for numero, ps in sorted(palabras.items()) for p in extraer_partidas(numero, ps))


def _version(modelos: ModelosDocumentos) -> str:
    return f"{modelos.version}+{VERSION_LECTURA}"


def _sha256(contenido: bytes) -> str:
    return hashlib.sha256(contenido).hexdigest()


def _clave(hash_contenido: str) -> str:
    # La clave es el hash: el mismo archivo subido dos veces ocupa un solo lugar.
    return f"originales/{hash_contenido[:2]}/{hash_contenido}"


def _ms(inicio: float) -> int:
    return round((time.perf_counter() - inicio) * 1000)
