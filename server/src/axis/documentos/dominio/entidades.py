from dataclasses import dataclass
from datetime import datetime

from axis.compartido.dominio.valores import Fase
from axis.documentos.dominio.valores import (
    Clasificacion,
    CodigoSenal,
    Etiqueta,
    IdDocumento,
    OrigenPagina,
    TipoArchivo,
    TipoDocumento,
)


@dataclass(frozen=True, slots=True)
class Pagina:
    numero: int
    origen: OrigenPagina
    texto: str
    ancho_pt: float
    alto_pt: float
    clasificacion: Clasificacion | None = None
    confianza_ocr: float | None = None  # None si el texto no vino de OCR

    def __post_init__(self) -> None:
        if self.numero < 1:
            raise ValueError("las páginas se numeran desde 1")


@dataclass(frozen=True, slots=True)
class Parte:
    """Un tramo continuo de páginas del mismo tipo, por ejemplo metrados de la 13 a la 80."""

    etiqueta: Etiqueta
    desde: int
    hasta: int
    confianza: float

    def __post_init__(self) -> None:
        if self.desde > self.hasta:
            raise ValueError("una parte no puede terminar antes de empezar")

    @property
    def total_paginas(self) -> int:
        return self.hasta - self.desde + 1


@dataclass(frozen=True, slots=True)
class Huella:
    """Lo que el propio archivo cuenta de su historia. Nunca guarda nombres de personas."""

    tipo_archivo: TipoArchivo
    tamano_bytes: int
    programa_creador: str | None
    programa_productor: str | None
    creado_en: datetime | None
    modificado_en: datetime | None
    revisiones: int
    firmas: int
    firmas_que_no_cubren_todo: int


@dataclass(frozen=True, slots=True)
class SenalEdicion:
    """Un hecho observable del archivo; no es un veredicto de adulteración."""

    codigo: CodigoSenal
    descripcion: str
    paginas: tuple[int, ...] = ()


@dataclass(frozen=True, slots=True)
class EvaluacionEdicion:
    senales: tuple[SenalEdicion, ...]
    # Qué tan raro es el archivo frente al corpus real (0 = típico, 1 = el más raro visto).
    rareza: float | None

    @property
    def hay_indicios(self) -> bool:
        return bool(self.senales) or (self.rareza is not None and self.rareza >= UMBRAL_RAREZA)


# Por encima de este percentil el archivo es más raro que el 95 % del corpus real.
UMBRAL_RAREZA = 0.95


@dataclass(frozen=True, slots=True)
class Documento:
    id: IdDocumento
    hash_contenido: str
    nombre_original: str
    huella: Huella
    paginas: tuple[Pagina, ...]
    partes: tuple[Parte, ...]
    tipo: TipoDocumento
    edicion: EvaluacionEdicion
    fase_subida: Fase | None
    version_modelos: str
    subido_en: datetime

    def corresponde_a(self, fase: Fase | None) -> bool | None:
        """None cuando no se puede decir: sin fase, tipo sin fase o el modelo no está seguro."""
        if fase is None or self.tipo.fase is None or not self.tipo.es_confiable:
            return None
        return self.tipo.fase is fase

    def contar_por_origen(self) -> dict[OrigenPagina, int]:
        conteo = dict.fromkeys(OrigenPagina, 0)
        for pagina in self.paginas:
            conteo[pagina.origen] += 1
        return conteo
