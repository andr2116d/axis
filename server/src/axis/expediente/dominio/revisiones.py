"""Lo que el evaluador decide sobre cada hallazgo.

Es la etiqueta con la que aprenden el enrutador y los motores: qué alarmas sirvieron, cuáles
no y por qué. Se guarda el historial completo; vale la última decisión de cada hallazgo.
"""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from axis.compartido.dominio.motores import Hallazgo
from axis.expediente.dominio.entidades import IdExpediente
from axis.expediente.dominio.errores import RevisionInvalida

LARGO_MAXIMO_MOTIVO = 2000


class DecisionHallazgo(StrEnum):
    CONFIRMADO = "confirmado"  # es un problema: se observa al consultor
    DESCARTADO = "descartado"  # falsa alarma: el motor se equivocó
    JUSTIFICADO = "justificado"  # es inusual, pero tiene una razón válida

    @property
    def sigue_abierto(self) -> bool:
        """Un hallazgo descartado o justificado ya no pinta la sección."""
        return self is DecisionHallazgo.CONFIRMADO


@dataclass(frozen=True, slots=True)
class RevisionHallazgo:
    id_expediente: IdExpediente
    hallazgo: Hallazgo  # copia de lo que vio el evaluador: con esto se entrena
    decision: DecisionHallazgo
    motivo: str | None
    numero_evaluacion: int
    revisado_en: datetime

    def __post_init__(self) -> None:
        motivo = (self.motivo or "").strip()
        if self.decision is not DecisionHallazgo.CONFIRMADO and not motivo:
            raise RevisionInvalida(f"para marcar {self.decision} hace falta el motivo")
        if len(motivo) > LARGO_MAXIMO_MOTIVO:
            raise RevisionInvalida(f"el motivo pasa de {LARGO_MAXIMO_MOTIVO} caracteres")

    @property
    def clave(self) -> str:
        return self.hallazgo.clave


def decisiones_vigentes(revisiones: Iterable[RevisionHallazgo]) -> dict[str, RevisionHallazgo]:
    """La última revisión de cada hallazgo: el evaluador puede cambiar de opinión."""
    vigentes: dict[str, RevisionHallazgo] = {}
    for revision in sorted(revisiones, key=lambda r: r.revisado_en):
        vigentes[revision.clave] = revision
    return vigentes


def claves_cerradas(vigentes: Mapping[str, RevisionHallazgo]) -> frozenset[str]:
    """Los hallazgos que el evaluador descartó o justificó: ya no cuentan para el semáforo."""
    return frozenset(c for c, r in vigentes.items() if not r.decision.sigue_abierto)
