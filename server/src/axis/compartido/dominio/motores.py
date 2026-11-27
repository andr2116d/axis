"""El contrato que cumple todo motor: lo ejecuta el orquestador, lo reentrena aprendizaje.

Vive en el núcleo compartido porque lo usan tres lados que no se conocen entre sí.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from enum import StrEnum
from typing import Protocol

from axis.compartido.dominio.partidas import Partida
from axis.compartido.dominio.valores import Fase


class Severidad(StrEnum):
    ROJO = "rojo"  # muy probablemente un error: hay que corregir o justificar
    AMBAR = "ambar"  # inusual: merece una mirada


@dataclass(frozen=True, slots=True)
class FichaMotor:
    """Lo que el motor declara de sí mismo. Con esto el orquestador decide si prenderlo."""

    id: str
    version: str
    nombre: str
    que_detecta: str
    fases: frozenset[Fase]
    # Tipos de parte que tienen que estar en el documento (por ejemplo, "presupuesto").
    partes_requeridas: frozenset[str]
    # None: sirve para cualquier tipología de obra.
    tipologias: frozenset[str] | None = None
    aprende_de: str = ""


@dataclass(frozen=True, slots=True)
class PartidaUbicada:
    """Una partida con el tipo de la página donde está (presupuesto, metrados, ACU…)."""

    partida: Partida
    tipo_pagina: str | None


@dataclass(frozen=True, slots=True)
class EntradaMotor:
    """Lo que un motor puede leer. No trae el archivo: trae lo que ya se extrajo de él."""

    id_fuente: str  # el documento (o expediente) evaluado
    fase: Fase | None
    tipologia: str | None
    partes_presentes: frozenset[str]
    partidas: tuple[PartidaUbicada, ...] = ()

    def partidas_de(self, tipo_pagina: str) -> tuple[Partida, ...]:
        return tuple(p.partida for p in self.partidas if p.tipo_pagina == tipo_pagina)


@dataclass(frozen=True, slots=True)
class Factor:
    """Un dato que pesó en el hallazgo, dicho para una persona: "mediana en 9 obras: S/ 14.95"."""

    nombre: str
    valor: str


@dataclass(frozen=True, slots=True)
class Hallazgo:
    id_motor: str
    version_motor: str
    severidad: Severidad
    titulo: str
    explicacion: str
    confianza: float
    factores: tuple[Factor, ...]
    pagina: int | None = None
    item: str | None = None
    metadatos: dict[str, str] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not 0.0 <= self.confianza <= 1.0:
            raise ValueError("la confianza va de 0 a 1")
        # Un hallazgo que no se puede explicar no se muestra.
        if not self.factores or not self.explicacion:
            raise ValueError("un hallazgo necesita explicación y factores")


class Motor(Protocol):
    @property
    def ficha(self) -> FichaMotor: ...

    async def evaluar(self, entrada: EntradaMotor) -> Sequence[Hallazgo]: ...
