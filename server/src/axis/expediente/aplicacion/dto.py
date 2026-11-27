from collections.abc import Mapping
from dataclasses import dataclass, field

from axis.compartido.dominio.motores import ResultadoMotor
from axis.expediente.dominio.entidades import (
    EvaluacionExpediente,
    Expediente,
    IdExpediente,
    OmisionMotor,
)
from axis.expediente.dominio.revisiones import DecisionHallazgo, RevisionHallazgo, claves_cerradas


@dataclass(frozen=True, slots=True)
class ResumenDocumento:
    """Lo que el expediente necesita saber de un documento ya analizado."""

    id_documento: str
    nombre: str
    tipo: str
    partes: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class OrdenCrearExpediente:
    nombre_obra: str
    cui: str | None = None
    entidad: str | None = None
    tipologia: str | None = None


@dataclass(frozen=True, slots=True)
class ResultadoDeMotores:
    resultados: tuple[ResultadoMotor, ...]
    omitidos: tuple[OmisionMotor, ...]
    fallas: tuple[tuple[str, str], ...]
    secciones_revisadas: frozenset[str]
    duracion_ms: int


@dataclass(frozen=True, slots=True)
class VistaExpediente:
    expediente: Expediente
    ultima_evaluacion: EvaluacionExpediente | None
    # La decisión vigente de cada hallazgo, por su clave.
    revisiones: Mapping[str, RevisionHallazgo] = field(default_factory=dict)

    @property
    def cerrados(self) -> frozenset[str]:
        return claves_cerradas(self.revisiones)


@dataclass(frozen=True, slots=True)
class OrdenRevisarHallazgo:
    id_expediente: IdExpediente
    clave: str
    decision: DecisionHallazgo
    motivo: str | None = None
