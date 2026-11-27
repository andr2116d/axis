import structlog

from axis.normativa.aplicacion.dto import OrdenIndexarNorma
from axis.normativa.aplicacion.puertos import RepositorioNormativa
from axis.normativa.dominio.servicios import partir_en_fragmentos

log = structlog.get_logger()


class IndexarNorma:
    """Parte el texto oficial en artículos y disposiciones y lo deja listo para citar."""

    def __init__(self, *, repositorio: RepositorioNormativa) -> None:
        self._repositorio = repositorio

    async def ejecutar(self, orden: OrdenIndexarNorma) -> int:
        fragmentos = partir_en_fragmentos(orden.norma, orden.texto)
        await self._repositorio.reemplazar(orden.norma, fragmentos)
        log.info("norma_indexada", norma=orden.norma.id, fragmentos=len(fragmentos))
        return len(fragmentos)
