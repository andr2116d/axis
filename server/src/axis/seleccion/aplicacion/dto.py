from dataclasses import dataclass
from datetime import date

from axis.compartido.dominio.motores import Hallazgo
from axis.seleccion.dominio.valores import FuenteAntecedentes, Postor, Proceso


@dataclass(frozen=True, slots=True)
class OrdenRevisarProceso:
    id_proceso: str
    # None: a la fecha de la convocatoria; si el proceso no la tiene, a la fecha de hoy.
    al_dia: date | None = None


@dataclass(frozen=True, slots=True)
class RevisionPostor:
    postor: Postor
    hallazgos: tuple[Hallazgo, ...]
    revisado: bool  # False: sin RUC propio (p. ej. un consorcio) no se pudo consultar


@dataclass(frozen=True, slots=True)
class RevisionProceso:
    proceso: Proceso
    al_dia: date
    fuente: FuenteAntecedentes
    postores: tuple[RevisionPostor, ...]
    duracion_ms: int

    @property
    def hallazgos(self) -> tuple[Hallazgo, ...]:
        return tuple(h for p in self.postores for h in p.hallazgos)
