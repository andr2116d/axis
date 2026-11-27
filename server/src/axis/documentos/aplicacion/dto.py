from dataclasses import dataclass

from axis.compartido.dominio.valores import Fase
from axis.documentos.dominio.entidades import Documento, Huella
from axis.documentos.dominio.valores import IdDocumento


@dataclass(frozen=True, slots=True)
class PaginaLeida:
    """Lo que el lector saca de una página antes de cualquier OCR o modelo."""

    numero: int
    texto: str
    cobertura_imagen: float
    ancho_pt: float
    alto_pt: float


@dataclass(frozen=True, slots=True)
class LecturaArchivo:
    huella: Huella
    paginas: tuple[PaginaLeida, ...]


@dataclass(frozen=True, slots=True)
class TextoReconocido:
    texto: str
    confianza: float


@dataclass(frozen=True, slots=True)
class OrdenAnalizarDocumento:
    nombre: str
    contenido: bytes
    fase: Fase | None


@dataclass(frozen=True, slots=True)
class ResultadoAnalisis:
    documento: Documento
    desde_cache: bool
    duracion_ms: int


@dataclass(frozen=True, slots=True)
class OrdenObtenerPagina:
    id_documento: IdDocumento
    numero: int
