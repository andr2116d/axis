from dataclasses import dataclass
from enum import StrEnum


class TipoNorma(StrEnum):
    LEY = "ley"
    REGLAMENTO = "reglamento"
    NORMA_TECNICA = "norma_tecnica"


@dataclass(frozen=True, slots=True)
class Norma:
    """Un texto legal tal como se publicó, con la fecha hasta la que está actualizado."""

    id: str  # "ley_32069", "reglamento_32069"…
    nombre: str
    tipo: TipoNorma
    vigente_al: str  # fecha del texto consolidado (AAAA-MM-DD)


@dataclass(frozen=True, slots=True)
class Fragmento:
    """La unidad que se cita: un artículo o una disposición, con su texto completo."""

    id_norma: str
    clave: str  # "art-45", "dcf-primera"…
    etiqueta: str  # "Artículo 45", "Primera Disposición Complementaria Final"
    titulo: str
    texto: str
    ubicacion: tuple[str, ...]  # ("TÍTULO III — …", "CAPÍTULO I — …")
    orden: int

    @property
    def id(self) -> str:
        return f"{self.id_norma}:{self.clave}"


class Pertinencia(StrEnum):
    ALTA = "alta"  # el fragmento regula directamente el caso
    MEDIA = "media"  # lo enmarca o lo complementa


class OrigenCita(StrEnum):
    LECTOR = "lector"  # un modelo leyó la norma y eligió el fragmento
    BUSQUEDA = "busqueda"  # solo coincide en palabras: nadie lo leyó todavía


@dataclass(frozen=True, slots=True)
class Cita:
    fragmento: Fragmento
    nombre_norma: str
    extracto: str  # literal: se comprobó que está en el texto del fragmento
    razon: str
    pertinencia: Pertinencia
    origen: OrigenCita


@dataclass(frozen=True, slots=True)
class RespuestaNormativa:
    citas: tuple[Cita, ...]
    origen: OrigenCita
    lector: str | None  # qué modelo leyó, si alguno
    descartadas: int  # citas del lector que no pasaron la verificación
    duracion_ms: int
    desde_cache: bool = False
