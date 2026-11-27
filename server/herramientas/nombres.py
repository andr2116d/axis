"""Cómo se reconoce por el nombre un archivo de precios. Lo usan la descarga y la base de precios.

Vive aparte de la descarga para que la imagen de entrenamiento no necesite su cliente HTTP.
"""

import re
import unicodedata

ES_DE_PRECIOS = re.compile(
    r"PRESUP|VALOR REFERENCIAL|COSTOS? UNITARIO|ANALISIS DE (PRECIO|COSTO)|ACU\b|METRADO|"
    r"DESAGREGADO|FORMULA POLINOMICA|GASTOS GENERALES|RELACION DE INSUMOS"
)


def normalizar_nombre(texto: str) -> str:
    sin_tildes = unicodedata.normalize("NFKD", texto.upper())
    return "".join(c for c in sin_tildes if not unicodedata.combining(c)).replace("_", " ")
