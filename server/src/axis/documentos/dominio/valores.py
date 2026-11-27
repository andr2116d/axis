from dataclasses import dataclass
from enum import StrEnum
from typing import NewType
from uuid import UUID

from axis.compartido.dominio.valores import Fase

IdDocumento = NewType("IdDocumento", UUID)

# El conjunto de etiquetas lo define el modelo entrenado, no el código:
# si el modelo aprende un tipo nuevo de parte, el dominio no cambia.
Etiqueta = NewType("Etiqueta", str)


class TipoArchivo(StrEnum):
    PDF = "pdf"
    HOJA_CALCULO = "hoja_calculo"
    IMAGEN = "imagen"
    DESCONOCIDO = "desconocido"


class OrigenPagina(StrEnum):
    DIGITAL = "digital"  # el texto viene del programa que generó el archivo
    ESCANEADA = "escaneada"  # es una imagen: hace falta OCR
    MIXTA = "mixta"  # imagen con capa de texto (escáner con OCR propio)
    VACIA = "vacia"  # sin texto ni imagen relevante


class CodigoSenal(StrEnum):
    MODIFICADO_TRAS_CREACION = "modificado_tras_creacion"
    GUARDADO_INCREMENTAL = "guardado_incremental"
    FIRMA_NO_CUBRE_TODO = "firma_no_cubre_todo"
    PROGRAMA_DISTINTO = "programa_distinto"
    ORIGEN_MEZCLADO = "origen_mezclado"
    TAMANO_DE_PAGINA_DISTINTO = "tamano_de_pagina_distinto"


@dataclass(frozen=True, slots=True)
class Clasificacion:
    etiqueta: Etiqueta
    confianza: float

    def __post_init__(self) -> None:
        if not 0.0 <= self.confianza <= 1.0:
            raise ValueError("la confianza va de 0 a 1")


# Por debajo de esta confianza el tipo se informa, pero no se usa para avisar ni decidir.
CONFIANZA_MINIMA_TIPO = 0.6


@dataclass(frozen=True, slots=True)
class TipoDocumento:
    """Qué es el archivo completo y a qué fase pertenece, según el modelo."""

    etiqueta: Etiqueta
    confianza: float
    fase: Fase | None

    def __post_init__(self) -> None:
        if not 0.0 <= self.confianza <= 1.0:
            raise ValueError("la confianza va de 0 a 1")

    @property
    def es_confiable(self) -> bool:
        return self.confianza >= CONFIANZA_MINIMA_TIPO
