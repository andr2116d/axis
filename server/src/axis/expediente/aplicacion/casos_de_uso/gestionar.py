from uuid import uuid4

from axis.compartido.dominio.reloj import Reloj
from axis.expediente.aplicacion.dto import OrdenCrearExpediente, VistaExpediente
from axis.expediente.aplicacion.puertos import ConsultaDocumentos, RepositorioExpedientes
from axis.expediente.dominio.entidades import DocumentoAdjunto, Expediente, IdExpediente
from axis.expediente.dominio.errores import DocumentoNoEncontrado, ExpedienteNoEncontrado


class CrearExpediente:
    def __init__(self, *, repositorio: RepositorioExpedientes, reloj: Reloj) -> None:
        self._repositorio = repositorio
        self._reloj = reloj

    async def ejecutar(self, orden: OrdenCrearExpediente) -> Expediente:
        expediente = Expediente(
            id=IdExpediente(uuid4()),
            nombre_obra=orden.nombre_obra.strip(),
            cui=orden.cui,
            entidad=orden.entidad,
            tipologia=orden.tipologia,
            documentos=(),
            creado_en=self._reloj.ahora(),
        )
        await self._repositorio.guardar(expediente)
        return expediente


async def _cargar(repositorio: RepositorioExpedientes, id_expediente: IdExpediente) -> Expediente:
    expediente = await repositorio.obtener(id_expediente)
    if expediente is None:
        raise ExpedienteNoEncontrado(f"no existe el expediente {id_expediente}")
    return expediente


class AdjuntarDocumento:
    """Suma un documento ya analizado; sus partes pasan a ser las secciones vigentes."""

    def __init__(
        self, *, repositorio: RepositorioExpedientes, documentos: ConsultaDocumentos, reloj: Reloj
    ) -> None:
        self._repositorio = repositorio
        self._documentos = documentos
        self._reloj = reloj

    async def ejecutar(self, id_expediente: IdExpediente, id_documento: str) -> Expediente:
        expediente = await _cargar(self._repositorio, id_expediente)
        resumen = await self._documentos.resumen(id_documento)
        if resumen is None:
            raise DocumentoNoEncontrado(f"no existe el documento {id_documento}")
        actualizado = expediente.adjuntar(
            DocumentoAdjunto(
                id_documento=resumen.id_documento,
                nombre=resumen.nombre,
                tipo=resumen.tipo,
                partes=resumen.partes,
                adjuntado_en=self._reloj.ahora(),
            )
        )
        await self._repositorio.guardar(actualizado)
        return actualizado


class ObtenerExpediente:
    def __init__(self, *, repositorio: RepositorioExpedientes) -> None:
        self._repositorio = repositorio

    async def ejecutar(self, id_expediente: IdExpediente) -> VistaExpediente:
        expediente = await _cargar(self._repositorio, id_expediente)
        ultima = await self._repositorio.ultima_evaluacion(id_expediente)
        return VistaExpediente(expediente, ultima)
