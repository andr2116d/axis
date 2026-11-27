from axis.documentos.aplicacion.dto import OrdenObtenerPagina
from axis.documentos.aplicacion.puertos import RepositorioDocumentos
from axis.documentos.dominio.entidades import Documento, Pagina
from axis.documentos.dominio.errores import DocumentoNoEncontrado, PaginaNoEncontrada
from axis.documentos.dominio.valores import IdDocumento


class ObtenerDocumento:
    def __init__(self, repositorio: RepositorioDocumentos) -> None:
        self._repositorio = repositorio

    async def ejecutar(self, id_documento: IdDocumento) -> Documento:
        documento = await self._repositorio.obtener(id_documento)
        if documento is None:
            raise DocumentoNoEncontrado(f"no existe el documento {id_documento}")
        return documento


class ObtenerPagina:
    """Devuelve el texto completo de una página; el resumen del documento no lo incluye."""

    def __init__(self, repositorio: RepositorioDocumentos) -> None:
        self._documentos = ObtenerDocumento(repositorio)

    async def ejecutar(self, orden: OrdenObtenerPagina) -> Pagina:
        documento = await self._documentos.ejecutar(orden.id_documento)
        for pagina in documento.paginas:
            if pagina.numero == orden.numero:
                return pagina
        raise PaginaNoEncontrada(f"el documento no tiene página {orden.numero}")
