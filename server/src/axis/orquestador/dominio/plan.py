"""Qué motores se prenden y por qué. Hoy decide la ficha; luego se suman el enrutador aprendido,
el asesor LLM y la exploración, cada uno como otra fuente de activaciones."""

from collections.abc import Sequence
from dataclasses import dataclass
from enum import StrEnum

from axis.compartido.dominio.motores import EntradaMotor, FichaMotor


class OrigenActivacion(StrEnum):
    FICHA = "ficha"
    ENRUTADOR = "enrutador"
    ASESOR = "asesor"
    EXPLORACION = "exploracion"


@dataclass(frozen=True, slots=True)
class Activacion:
    id_motor: str
    origen: OrigenActivacion
    razon: str


@dataclass(frozen=True, slots=True)
class Omision:
    """Un motor que no se prendió, con la razón: le dice al ingeniero qué falta subir."""

    id_motor: str
    nombre: str
    razon: str
    faltan: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Plan:
    activaciones: tuple[Activacion, ...]
    omisiones: tuple[Omision, ...]

    @property
    def motores(self) -> tuple[str, ...]:
        return tuple(a.id_motor for a in self.activaciones)


def planificar_por_ficha(fichas: Sequence[FichaMotor], entrada: EntradaMotor) -> Plan:
    activaciones: list[Activacion] = []
    omisiones: list[Omision] = []
    for ficha in sorted(fichas, key=lambda f: f.id):
        omision = _por_que_no(ficha, entrada)
        if omision is not None:
            omisiones.append(omision)
            continue
        partes = ", ".join(sorted(ficha.partes_requeridas)) or "nada en particular"
        activaciones.append(
            Activacion(ficha.id, OrigenActivacion.FICHA, f"Tiene lo que necesita: {partes}.")
        )
    return Plan(tuple(activaciones), tuple(omisiones))


def _por_que_no(ficha: FichaMotor, entrada: EntradaMotor) -> Omision | None:
    if entrada.fase is not None and entrada.fase not in ficha.fases:
        fases = ", ".join(sorted(f.value for f in ficha.fases))
        return Omision(ficha.id, ficha.nombre, f"Solo aplica en: {fases}.")
    if ficha.tipologias is not None and entrada.tipologia not in ficha.tipologias:
        return Omision(ficha.id, ficha.nombre, "No aplica a esta tipología de obra.")
    faltan = tuple(sorted(ficha.partes_requeridas - entrada.partes_presentes))
    if faltan:
        lista = ", ".join(f.replace("_", " ") for f in faltan)
        return Omision(ficha.id, ficha.nombre, f"Falta subir: {lista}.", faltan)
    return None
