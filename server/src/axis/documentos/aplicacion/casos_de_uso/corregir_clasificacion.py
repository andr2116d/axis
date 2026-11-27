from uuid import uuid4

from axis.compartido.dominio.reloj import Reloj
from axis.documentos.aplicacion.dto import (
    EtiquetasConocidas,
    OrdenCorregir,
    ResultadoCorreccion,
)
from axis.documentos.aplicacion.puertos import (
    ProveedorModelos,
    RepositorioCorrecciones,
    RepositorioDocumentos,
)
from axis.documentos.aplicacion.servicios import aplicar_correcciones
from axis.documentos.dominio.entidades import Correccion, Documento
from axis.documentos.dominio.errores import (
    DocumentoNoEncontrado,
    ModelosNoDisponibles,
    PaginaNoEncontrada,
)
from axis.documentos.dominio.valores import Etiqueta, IdCorreccion, IdDocumento, validar_etiqueta


class CorregirClasificacion:
    """El evaluador corrige qué es una página o el documento; queda como etiqueta para entrenar."""

    def __init__(
        self,
        *,
        documentos: RepositorioDocumentos,
        correcciones: RepositorioCorrecciones,
        modelos: ProveedorModelos,
        reloj: Reloj,
    ) -> None:
        self._documentos = documentos
        self._correcciones = correcciones
        self._modelos = modelos
        self._reloj = reloj

    async def ejecutar(self, orden: OrdenCorregir) -> ResultadoCorreccion:
        modelos = self._modelos.actual()
        if modelos is None:
            raise ModelosNoDisponibles("todavía no hay modelos de documentos entrenados")
        documento = await self._documentos.obtener(orden.id_documento)
        if documento is None:
            raise DocumentoNoEncontrado(f"no existe el documento {orden.id_documento}")
        etiqueta = validar_etiqueta(orden.etiqueta)
        correccion = Correccion(
            id=IdCorreccion(uuid4()),
            hash_contenido=documento.hash_contenido,
            pagina=orden.pagina,
            etiqueta_anterior=_etiqueta_actual(documento, orden.pagina),
            etiqueta=etiqueta,
            fase=orden.fase,
            version_modelos=documento.version_modelos,
            corregido_en=self._reloj.ahora(),
        )
        await self._correcciones.guardar(correccion)
        todas = await self._correcciones.listar(documento.hash_contenido)
        corregido = await aplicar_correcciones(documento, todas, modelos)
        await self._documentos.guardar(corregido)
        conocidas = (
            modelos.documentos.etiquetas
            if correccion.es_del_documento
            else modelos.paginas.etiquetas
        )
        return ResultadoCorreccion(
            corregido, correccion, es_etiqueta_nueva=etiqueta not in conocidas
        )


def _etiqueta_actual(documento: Documento, pagina: int | None) -> Etiqueta | None:
    if pagina is None:
        return documento.tipo.etiqueta
    for p in documento.paginas:
        if p.numero == pagina:
            return p.clasificacion.etiqueta if p.clasificacion else None
    raise PaginaNoEncontrada(f"el documento no tiene página {pagina}")


class ListarCorrecciones:
    def __init__(
        self, *, documentos: RepositorioDocumentos, correcciones: RepositorioCorrecciones
    ) -> None:
        self._documentos = documentos
        self._correcciones = correcciones

    async def ejecutar(self, id_documento: IdDocumento) -> list[Correccion]:
        documento = await self._documentos.obtener(id_documento)
        if documento is None:
            raise DocumentoNoEncontrado(f"no existe el documento {id_documento}")
        return await self._correcciones.listar(documento.hash_contenido)


class ObtenerEtiquetas:
    """Las etiquetas que conoce la versión vigente: sirven para el selector de la corrección."""

    def __init__(self, modelos: ProveedorModelos) -> None:
        self._modelos = modelos

    async def ejecutar(self) -> EtiquetasConocidas:
        modelos = self._modelos.actual()
        if modelos is None:
            raise ModelosNoDisponibles("todavía no hay modelos de documentos entrenados")
        return EtiquetasConocidas(
            version=modelos.version,
            paginas=modelos.paginas.etiquetas,
            documentos=tuple(
                (e, modelos.documentos.fase_de(e)) for e in modelos.documentos.etiquetas
            ),
        )
