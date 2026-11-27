"""Partidas a partir de palabras con posición.

No se lee el texto línea por línea: en un presupuesto S10 real, el texto plano separa las
descripciones de los números. Se agrupan las palabras por altura en la página (filas) y se
interpreta cada fila: ítem, descripción, unidad y números. Cada fila trae su propio control:
cantidad × precio ≈ parcial.
"""

import re
import statistics
from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

# Unidades de medida de presupuestos peruanos. Es vocabulario físico, no un criterio de revisión.
UNIDADES = frozenset(
    {
        "m",
        "ml",
        "m2",
        "m3",
        "km",
        "ha",
        "p2",
        "und",
        "un",
        "u",
        "unid",
        "glb",
        "gbl",
        "est",
        "kg",
        "t",
        "tn",
        "lt",
        "l",
        "gln",
        "gal",
        "mes",
        "dia",
        "día",
        "sem",
        "hh",
        "hm",
        "h",
        "pto",
        "pza",
        "jgo",
        "bol",
        "bls",
        "rll",
        "var",
        "cja",
        "par",
        "mll",
        "%mo",
        "m3k",
    }
)
# Símbolos de moneda que algunas plantillas ponen como palabra aparte ("S/ 1,539.91").
_MONEDA = frozenset({"s/", "s/.", "$", "us$", "soles"})
_SUPERINDICES = str.maketrans({"²": "2", "³": "3"})
_ITEM = re.compile(r"^\d{1,2}(?:\.\d{1,3}){0,6}\.?$")
_NUMERO = re.compile(r"^\(?-?[\d.,]*\d[\d.,]*\)?$")
_PALABRA_CON_LETRAS = re.compile(r"[A-Za-zÁÉÍÓÚÑáéíóúñ]{3,}")
# Margen del cuadre: S10 redondea el precio a 2 decimales y el parcial aparte.
_TOLERANCIA_ABSOLUTA = Decimal("0.05")
_TOLERANCIA_RELATIVA = Decimal("0.002")
# Dos palabras son de la misma fila si sus centros están a menos de esta fracción de su altura.
_MISMA_FILA = 0.5
_NUMEROS_PARA_CUADRE = 3


@dataclass(frozen=True, slots=True)
class Palabra:
    """Una palabra y su caja en puntos, con el origen arriba a la izquierda de la página."""

    texto: str
    x0: float
    y0: float
    x1: float
    y1: float
    # Línea que reconoció el OCR. En un escaneo torcido, la altura no basta para saber qué
    # palabras van juntas; Tesseract endereza la página y sí lo sabe.
    linea: int | None = None

    @property
    def centro_y(self) -> float:
        return (self.y0 + self.y1) / 2

    @property
    def alto(self) -> float:
        return max(0.1, self.y1 - self.y0)


@dataclass(frozen=True, slots=True)
class Partida:
    pagina: int
    item: str
    descripcion: str
    unidad: str | None  # None: es un título que agrupa partidas, con su subtotal
    numeros: tuple[Decimal, ...]  # todo lo que trae la fila, de izquierda a derecha
    cantidad: Decimal | None
    precio_unitario: Decimal | None
    parcial: Decimal | None
    cuadra: bool | None  # None si la fila no trae lo necesario para verificarlo

    @property
    def es_titulo(self) -> bool:
        return self.unidad is None


def numero(texto: str) -> Decimal | None:
    """Lee 1,883.63 · 1.883,63 · 2921.93 · 1,00 · (1,200.00). None si no es un número."""
    limpio = texto.strip().replace("S/", "").rstrip("%")
    if not _NUMERO.match(limpio):
        return None
    negativo = limpio.startswith("(") or limpio.startswith("-")
    limpio = limpio.strip("()-")
    if "," in limpio and "." in limpio:
        decimal = "," if limpio.rfind(",") > limpio.rfind(".") else "."
        miles = "." if decimal == "," else ","
        limpio = limpio.replace(miles, "").replace(decimal, ".")
    elif "," in limpio:
        partes = limpio.split(",")
        es_miles = len(partes) > 2 or (len(partes) == 2 and len(partes[1]) == 3)  # noqa: PLR2004
        limpio = limpio.replace(",", "") if es_miles else limpio.replace(",", ".")
    elif limpio.count(".") > 1:
        limpio = limpio.replace(".", "")
    try:
        valor = Decimal(limpio)
    except InvalidOperation:
        return None
    return -valor if negativo else valor


def agrupar_filas(palabras: Sequence[Palabra]) -> list[list[Palabra]]:
    if not palabras:
        return []
    if all(p.linea is not None for p in palabras):
        return _filas_por_linea(palabras)
    alto_tipico = statistics.median(p.alto for p in palabras)
    filas: list[list[Palabra]] = []
    centro_fila = 0.0
    for palabra in sorted(palabras, key=lambda p: p.centro_y):
        if filas and abs(palabra.centro_y - centro_fila) < alto_tipico * _MISMA_FILA:
            filas[-1].append(palabra)
            continue
        filas.append([palabra])
        centro_fila = palabra.centro_y
    return [sorted(f, key=lambda p: p.x0) for f in filas]


def _filas_por_linea(palabras: Sequence[Palabra]) -> list[list[Palabra]]:
    lineas: dict[int, list[Palabra]] = {}
    for palabra in palabras:
        lineas.setdefault(palabra.linea or 0, []).append(palabra)
    filas = [sorted(ps, key=lambda p: p.x0) for ps in lineas.values()]
    return sorted(filas, key=lambda f: statistics.fmean(p.centro_y for p in f))


def extraer_partidas(pagina: int, palabras: Sequence[Palabra]) -> tuple[Partida, ...]:
    partidas: list[Partida] = []
    anterior_era_partida = False
    for fila in agrupar_filas(palabras):
        partida = _leer_fila(pagina, fila)
        if partida is not None:
            partidas.append(partida)
            anterior_era_partida = True
            continue
        # Una descripción larga sigue en la línea de abajo, sin ítem ni números.
        if anterior_era_partida and _es_continuacion(fila):
            partidas[-1] = _con_descripcion(partidas[-1], " ".join(p.texto for p in fila))
            continue
        anterior_era_partida = False
    return tuple(partidas)


def _leer_fila(pagina: int, fila: list[Palabra]) -> Partida | None:
    # El OCR suele leer "01.02" como "01,02".
    item = fila[0].texto.replace(",", ".") if fila else ""
    if len(fila) < 2 or not _ITEM.match(item):  # noqa: PLR2004
        return None
    resto = [p for p in fila[1:] if p.texto.lower() not in _MONEDA]
    indice_unidad = _indice_unidad(resto)
    fin_descripcion = indice_unidad if indice_unidad is not None else _inicio_numeros(resto)
    descripcion = " ".join(p.texto for p in resto[:fin_descripcion]).strip()
    if not _PALABRA_CON_LETRAS.search(descripcion):
        return None
    desde = fin_descripcion + (1 if indice_unidad is not None else 0)
    numeros = tuple(n for p in resto[desde:] if (n := numero(p.texto)) is not None)
    unidad = _unidad(resto[indice_unidad].texto) if indice_unidad is not None else None
    return _interpretar(pagina, item.rstrip("."), descripcion, unidad, numeros)


def _indice_unidad(resto: list[Palabra]) -> int | None:
    # La unidad es la última palabra no numérica, siempre que todo lo que sigue sean números.
    for i in range(len(resto) - 1, -1, -1):
        if numero(resto[i].texto) is not None:
            continue
        return i if _unidad(resto[i].texto) in UNIDADES and i > 0 else None
    return None


def _unidad(texto: str) -> str:
    """m² y m2 son la misma unidad; "Und." y "und" también; el OCR lee "GL8" por "GLB"."""
    unidad = texto.lower().translate(_SUPERINDICES).strip(".").replace("rn", "m")
    if unidad not in UNIDADES and unidad.endswith("8") and f"{unidad[:-1]}b" in UNIDADES:
        return f"{unidad[:-1]}b"
    return unidad


def _inicio_numeros(resto: list[Palabra]) -> int:
    fin = len(resto)
    while fin > 0 and numero(resto[fin - 1].texto) is not None:
        fin -= 1
    return fin


def _interpretar(
    pagina: int, item: str, descripcion: str, unidad: str | None, numeros: tuple[Decimal, ...]
) -> Partida:
    if unidad is None:
        parcial = numeros[-1] if numeros else None
        return Partida(pagina, item, descripcion, None, numeros, None, None, parcial, None)
    cantidad = numeros[0] if numeros else None
    precio = numeros[1] if len(numeros) >= _NUMEROS_PARA_CUADRE else None
    parcial = numeros[-1] if len(numeros) >= 2 else None  # noqa: PLR2004
    cuadra = None
    if cantidad is not None and precio is not None and parcial is not None:
        diferencia = abs(cantidad * precio - parcial)
        cuadra = diferencia <= max(_TOLERANCIA_ABSOLUTA, abs(parcial) * _TOLERANCIA_RELATIVA)
    return Partida(pagina, item, descripcion, unidad, numeros, cantidad, precio, parcial, cuadra)


def _es_continuacion(fila: list[Palabra]) -> bool:
    texto = " ".join(p.texto for p in fila)
    sin_numeros = all(numero(p.texto) is None for p in fila)
    return sin_numeros and bool(_PALABRA_CON_LETRAS.search(texto)) and len(fila) <= 8  # noqa: PLR2004


def _con_descripcion(partida: Partida, extra: str) -> Partida:
    return Partida(
        partida.pagina,
        partida.item,
        f"{partida.descripcion} {extra}",
        partida.unidad,
        partida.numeros,
        partida.cantidad,
        partida.precio_unitario,
        partida.parcial,
        partida.cuadra,
    )
