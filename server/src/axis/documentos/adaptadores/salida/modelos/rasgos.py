"""Rasgos que ven los modelos. El entrenamiento y la inferencia usan exactamente estas funciones."""

import math
import re
import unicodedata
from collections.abc import Sequence

from axis.documentos.dominio.entidades import Huella, Pagina
from axis.documentos.dominio.servicios import detectar_senales
from axis.documentos.dominio.valores import CodigoSenal, OrigenPagina

# Lo que se lee de cada página para clasificarla: el encabezado y el primer cuerpo bastan.
MAX_CARACTERES_PAGINA = 4000
# Proporción mínima de páginas para que un tipo cuente como "presente" en el documento.
PRESENCIA_MINIMA = 0.05

_DIGITOS = re.compile(r"\d")
_ESPACIOS = re.compile(r"\s+")


def normalizar_texto(texto: str) -> str:
    """Minúsculas, sin tildes y con los dígitos igualados: importa la forma, no la cifra."""
    recortado = texto[:MAX_CARACTERES_PAGINA].lower()
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", recortado) if not unicodedata.combining(c)
    )
    return _ESPACIOS.sub(" ", _DIGITOS.sub("0", sin_tildes)).strip()


def rasgos_documento(paginas: Sequence[Pagina], etiquetas: Sequence[str]) -> list[float]:
    """Composición del documento: qué proporción de páginas es de cada tipo."""
    clasificadas = [p.clasificacion for p in paginas if p.clasificacion is not None]
    total = max(1, len(clasificadas))
    proporcion = dict.fromkeys(etiquetas, 0.0)
    ponderada = dict.fromkeys(etiquetas, 0.0)
    for clasificacion in clasificadas:
        if clasificacion.etiqueta in proporcion:
            proporcion[clasificacion.etiqueta] += 1 / total
            ponderada[clasificacion.etiqueta] += clasificacion.confianza / total
    presentes = sum(1 for v in proporcion.values() if v >= PRESENCIA_MINIMA)
    escaneadas = sum(1 for p in paginas if p.origen is OrigenPagina.ESCANEADA)
    return [
        *proporcion.values(),
        *ponderada.values(),
        math.log1p(len(paginas)),
        float(presentes),
        escaneadas / max(1, len(paginas)),
    ]


COLUMNAS_EDICION = (
    "revisiones_extra",
    "log_minutos_entre_creacion_y_cambio",
    "sin_fechas",
    "firmas",
    "firmas_parciales",
    "proporcion_escaneadas",
    "proporcion_mixtas",
    "paginas_de_otro_tamano",
    "log_paginas",
    "log_kb_por_pagina",
    *(f"senal_{c.value}" for c in CodigoSenal),
)


def rasgos_edicion(huella: Huella, paginas: Sequence[Pagina]) -> list[float]:
    total = max(1, len(paginas))
    minutos = 0.0
    if huella.creado_en and huella.modificado_en:
        minutos = max(0.0, (huella.modificado_en - huella.creado_en).total_seconds() / 60)
    senales = {s.codigo: s for s in detectar_senales(huella, paginas)}
    otro_tamano = senales.get(CodigoSenal.TAMANO_DE_PAGINA_DISTINTO)
    return [
        float(huella.revisiones - 1),
        math.log1p(minutos),
        float(huella.creado_en is None and huella.modificado_en is None),
        float(huella.firmas),
        float(huella.firmas_que_no_cubren_todo),
        sum(1 for p in paginas if p.origen is OrigenPagina.ESCANEADA) / total,
        sum(1 for p in paginas if p.origen is OrigenPagina.MIXTA) / total,
        len(otro_tamano.paginas) / total if otro_tamano else 0.0,
        math.log1p(len(paginas)),
        math.log1p(huella.tamano_bytes / 1024 / total),
        *(float(c in senales) for c in CodigoSenal),
    ]
