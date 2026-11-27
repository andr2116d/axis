from dataclasses import dataclass

from axis.compartido.dominio.motores import Hallazgo, Severidad
from axis.compartido.dominio.valores import Semaforo
from axis.orquestador.dominio.plan import Plan


@dataclass(frozen=True, slots=True)
class FallaMotor:
    """Un motor que se cayó o tardó demasiado. No tumba la evaluación: se informa."""

    id_motor: str
    razon: str


@dataclass(frozen=True, slots=True)
class Evaluacion:
    plan: Plan
    hallazgos: tuple[Hallazgo, ...]
    fallas: tuple[FallaMotor, ...]
    duracion_ms: int

    @property
    def semaforo(self) -> Semaforo:
        severidades = {h.severidad for h in self.hallazgos}
        if Severidad.ROJO in severidades:
            return Semaforo.ROJO
        if Severidad.AMBAR in severidades or self.fallas:
            return Semaforo.AMBAR
        return Semaforo.VERDE
