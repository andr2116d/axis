from dataclasses import dataclass

from axis.compartido.dominio.motores import ResultadoMotor
from axis.expediente.dominio.entidades import EvaluacionExpediente, Expediente, OmisionMotor


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
