from dataclasses import dataclass

from axis.compartido.dominio.motores import Hallazgo, ResultadoMotor, semaforo_de
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
    resultados: tuple[ResultadoMotor, ...]
    fallas: tuple[FallaMotor, ...]
    duracion_ms: int

    @property
    def hallazgos(self) -> tuple[Hallazgo, ...]:
        return tuple(h for r in self.resultados for h in r.hallazgos)

    @property
    def semaforo(self) -> Semaforo:
        return semaforo_de(self.hallazgos, bool(self.fallas))

    @property
    def reutilizados(self) -> tuple[str, ...]:
        return tuple(r.id_motor for r in self.resultados if r.reutilizado)
