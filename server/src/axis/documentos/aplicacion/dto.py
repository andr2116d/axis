from dataclasses import dataclass

from axis.compartido.dominio.valores import Fase
from axis.documentos.dominio.entidades import Correccion, Documento, Huella
from axis.documentos.dominio.partidas import Palabra
from axis.documentos.dominio.valores import Etiqueta, IdDocumento


@dataclass(frozen=True, slots=True)
class PaginaLeida:
    """Lo que el lector saca de una página antes de cualquier OCR o modelo."""

    numero: int
    texto: str
    cobertura_imagen: float
    ancho_pt: float
    alto_pt: float
    # Con su posición: es lo que permite rearmar las filas de una tabla.
    palabras: tuple[Palabra, ...] = ()


@dataclass(frozen=True, slots=True)
class LecturaArchivo:
    huella: Huella
    paginas: tuple[PaginaLeida, ...]


@dataclass(frozen=True, slots=True)
class TextoReconocido:
    texto: str
    confianza: float
    palabras: tuple[Palabra, ...] = ()


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


@dataclass(frozen=True, slots=True)
class OrdenCorregir:
    id_documento: IdDocumento
    pagina: int | None  # None: se corrige el tipo del documento completo
    etiqueta: str
    fase: Fase | None = None


@dataclass(frozen=True, slots=True)
class ResultadoCorreccion:
    documento: Documento
    correccion: Correccion
    es_etiqueta_nueva: bool  # el modelo vigente no la conoce: la aprenderá al reentrenar


@dataclass(frozen=True, slots=True)
class EtiquetasConocidas:
    version: str
    paginas: tuple[Etiqueta, ...]
    documentos: tuple[tuple[Etiqueta, Fase | None], ...]
