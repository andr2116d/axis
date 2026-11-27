from collections.abc import Mapping, Sequence
from typing import Protocol

from axis.compartido.dominio.avance import Avisador
from axis.compartido.dominio.motores import ResultadoMotor
from axis.expediente.aplicacion.dto import ResultadoDeMotores, ResumenDocumento
from axis.expediente.dominio.entidades import (
    EvaluacionExpediente,
    Expediente,
    IdExpediente,
    Seccion,
)
from axis.expediente.dominio.revisiones import RevisionHallazgo


class RepositorioExpedientes(Protocol):
    async def guardar(self, expediente: Expediente) -> None: ...
    async def obtener(self, id_expediente: IdExpediente) -> Expediente | None: ...
    async def guardar_evaluacion(self, evaluacion: EvaluacionExpediente) -> None: ...
    async def ultima_evaluacion(
        self, id_expediente: IdExpediente
    ) -> EvaluacionExpediente | None: ...
    async def guardar_revision(self, revision: RevisionHallazgo) -> None: ...
    async def revisiones(self, id_expediente: IdExpediente) -> tuple[RevisionHallazgo, ...]:
        """Todo el historial de revisiones del expediente, en cualquier orden."""
        ...


class ConsultaDocumentos(Protocol):
    async def resumen(self, id_documento: str) -> ResumenDocumento | None: ...


class EvaluadorMotores(Protocol):
    """Corre los motores sobre las secciones vigentes; reutiliza lo que no cambió."""

    async def evaluar(
        self,
        expediente: Expediente,
        secciones: Sequence[Seccion],
        previos: Mapping[str, ResultadoMotor],
        avisar: Avisador,
    ) -> ResultadoDeMotores: ...
