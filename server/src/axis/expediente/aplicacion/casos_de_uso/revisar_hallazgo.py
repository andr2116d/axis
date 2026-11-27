from axis.compartido.dominio.reloj import Reloj
from axis.expediente.aplicacion.casos_de_uso.gestionar import armar_vista, cargar_expediente
from axis.expediente.aplicacion.dto import OrdenRevisarHallazgo, VistaExpediente
from axis.expediente.aplicacion.puertos import RepositorioExpedientes
from axis.expediente.dominio.errores import HallazgoNoEncontrado
from axis.expediente.dominio.revisiones import RevisionHallazgo


class RevisarHallazgo:
    """El evaluador confirma, descarta o justifica un hallazgo de la última evaluación.

    La decisión cambia el semáforo y queda como etiqueta para reentrenar: se guarda junto con
    una copia del hallazgo tal como lo vio el evaluador.
    """

    def __init__(self, *, repositorio: RepositorioExpedientes, reloj: Reloj) -> None:
        self._repositorio = repositorio
        self._reloj = reloj

    async def ejecutar(self, orden: OrdenRevisarHallazgo) -> VistaExpediente:
        expediente = await cargar_expediente(self._repositorio, orden.id_expediente)
        evaluacion = await self._repositorio.ultima_evaluacion(orden.id_expediente)
        hallazgo = next(
            (h for h in (evaluacion.hallazgos if evaluacion else ()) if h.clave == orden.clave),
            None,
        )
        if evaluacion is None or hallazgo is None:
            raise HallazgoNoEncontrado(f"el hallazgo {orden.clave} no está en la última evaluación")
        await self._repositorio.guardar_revision(
            RevisionHallazgo(
                id_expediente=expediente.id,
                hallazgo=hallazgo,
                decision=orden.decision,
                motivo=(orden.motivo or "").strip() or None,
                numero_evaluacion=evaluacion.numero,
                revisado_en=self._reloj.ahora(),
            )
        )
        return await armar_vista(self._repositorio, expediente, evaluacion)
