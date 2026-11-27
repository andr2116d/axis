from dataclasses import dataclass

from axis.normativa.dominio.valores import Fragmento, Norma, Pertinencia


@dataclass(frozen=True, slots=True)
class OrdenIndexarNorma:
    norma: Norma
    texto: str


@dataclass(frozen=True, slots=True)
class ResumenNorma:
    norma: Norma
    fragmentos: int


@dataclass(frozen=True, slots=True)
class OrdenCitar:
    """Qué se quiere saber y sobre qué caso. El contexto es el hallazgo u observación."""

    pregunta: str
    contexto: str | None = None
    maximo_citas: int = 5


@dataclass(frozen=True, slots=True)
class ConsultaLector:
    """Lo que lee el modelo: las leyes enteras y, del resto, los fragmentos candidatos."""

    pregunta: str
    contexto: str | None
    leyes: tuple[Fragmento, ...]
    nombres: dict[str, str]  # id de norma → nombre, para que el lector sepa qué lee
    candidatos: tuple[Fragmento, ...]
    maximo_citas: int


@dataclass(frozen=True, slots=True)
class CitaPropuesta:
    """Lo que propone el lector, antes de verificar que el fragmento y el extracto existen."""

    id_fragmento: str
    extracto: str
    razon: str
    pertinencia: Pertinencia
