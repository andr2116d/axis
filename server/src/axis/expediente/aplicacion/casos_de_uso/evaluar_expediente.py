from uuid import uuid4

from axis.compartido.dominio.reloj import Reloj
from axis.expediente.aplicacion.casos_de_uso.gestionar import armar_vista
from axis.expediente.aplicacion.dto import VistaExpediente
from axis.expediente.aplicacion.puertos import EvaluadorMotores, RepositorioExpedientes
from axis.expediente.dominio.entidades import EvaluacionExpediente, IdEvaluacion, IdExpediente
from axis.expediente.dominio.errores import ExpedienteNoEncontrado, ExpedienteSinDocumentos


class EvaluarExpediente:
    """Evalúa las secciones vigentes. Lo que no cambió desde la última vez no se vuelve a correr."""

    def __init__(
        self, *, repositorio: RepositorioExpedientes, evaluador: EvaluadorMotores, reloj: Reloj
    ) -> None:
        self._repositorio = repositorio
        self._evaluador = evaluador
        self._reloj = reloj

    async def ejecutar(self, id_expediente: IdExpediente) -> VistaExpediente:
        expediente = await self._repositorio.obtener(id_expediente)
        if expediente is None:
            raise ExpedienteNoEncontrado(f"no existe el expediente {id_expediente}")
        secciones = expediente.secciones_vigentes()
        if not secciones:
            raise ExpedienteSinDocumentos("el expediente todavía no tiene documentos")
        anterior = await self._repositorio.ultima_evaluacion(id_expediente)
        previos = {r.id_motor: r for r in anterior.resultados} if anterior else {}
        resultado = await self._evaluador.evaluar(expediente, secciones, previos)
        evaluacion = EvaluacionExpediente(
            id=IdEvaluacion(uuid4()),
            id_expediente=id_expediente,
            numero=(anterior.numero + 1) if anterior else 1,
            creada_en=self._reloj.ahora(),
            resultados=resultado.resultados,
            omitidos=resultado.omitidos,
            fallas=resultado.fallas,
            secciones_revisadas=resultado.secciones_revisadas,
            duracion_ms=resultado.duracion_ms,
        )
        await self._repositorio.guardar_evaluacion(evaluacion)
        return await armar_vista(self._repositorio, expediente, evaluacion)
