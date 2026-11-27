"""Leer la estructura de una norma y comprobar que lo que se cita está en ella.

La estructura (artículos, disposiciones, títulos) se lee del texto oficial. Ningún número de
artículo está escrito aquí: qué artículo aplica lo decide el lector, no el código.
"""

import re
import unicodedata
from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field

from axis.normativa.dominio.errores import NormaSinFragmentos
from axis.normativa.dominio.valores import Fragmento, Norma

_INICIO_CUERPO = re.compile(r"^\s*T[ÍI]TULO\s+I\s*$")
_FIN_CUERPO = re.compile(r"^\s*FE\s+DE\s+ERRATAS\s*$")
_ARTICULO = re.compile(r"^\s*Art[íi]culo\s+(\d+(?:-[A-Z])?)\s*\.\s*-?\s*(.*)$")
_NIVEL = re.compile(r"^\s*(T[ÍI]TULO|CAP[ÍI]TULO|SUBCAP[ÍI]TULO)\s+(\S+)\s*$")
_GRUPO_DISPOSICIONES = re.compile(
    r"^\s*DISPOSICI(?:ONES|ÓN|ON)\s+COMPLEMENTARIAS?\s+"
    r"(FINAL|TRANSITORIA|MODIFICATORIA|DEROGATORIA)(?:E?S)?\s*$"
)
_ORDINAL = (
    r"PRIMERA|SEGUNDA|TERCERA|CUARTA|QUINTA|SEXTA|S[ÉE]PTIMA|OCTAVA|NOVENA|"
    r"D[ÉE]CIMA|UND[ÉE]CIMA|DUOD[ÉE]CIMA|VIG[ÉE]SIMA|TRIG[ÉE]SIMA|[ÚU]NICA"
)
_DISPOSICION = re.compile(rf"^((?:(?:{_ORDINAL})\s*)+)\s*\.\s*-?\s*(.*)$")
_SIGLAS_GRUPO = {
    "FINAL": ("dcf", "Disposición Complementaria Final"),
    "TRANSITORIA": ("dct", "Disposición Complementaria Transitoria"),
    "MODIFICATORIA": ("dcm", "Disposición Complementaria Modificatoria"),
    "DEROGATORIA": ("dcd", "Disposición Complementaria Derogatoria"),
}
_LINEAS_MAXIMAS_TITULO = 3
_LARGO_MINIMO_TROZO = 15
# Palabras de 4 letras o más: "obra", "plazo"; "de", "la" o "por" no distinguen nada.
LARGO_MINIMO_PALABRA = 4


@dataclass
class _Borrador:
    clave: str
    etiqueta: str
    titulo: list[str]
    ubicacion: tuple[str, ...]
    lineas: list[str] = field(default_factory=list)
    titulo_cerrado: bool = False


@dataclass
class _Lectura:
    niveles: dict[str, str] = field(default_factory=dict)
    nivel_pendiente: str | None = None
    grupo: tuple[str, str] | None = None
    actual: _Borrador | None = None
    listos: list[_Borrador] = field(default_factory=list)

    def cerrar(self) -> None:
        if self.actual is not None:
            self.listos.append(self.actual)
        self.actual = None

    def ubicacion(self) -> tuple[str, ...]:
        orden = ("TITULO", "CAPITULO", "SUBCAPITULO")
        return tuple(self.niveles[n] for n in orden if n in self.niveles)


def partir_en_fragmentos(norma: Norma, texto: str) -> tuple[Fragmento, ...]:
    """Divide el texto oficial en artículos y disposiciones, con su título y su ubicación."""
    lectura = _Lectura()
    for linea in _cuerpo(texto.splitlines()):
        _leer_linea(lectura, linea)
    lectura.cerrar()
    if not lectura.listos:
        raise NormaSinFragmentos(f"no se encontraron artículos en {norma.id}")
    return tuple(_fragmentos(norma, lectura.listos))


def _cuerpo(lineas: Sequence[str]) -> Iterable[str]:
    # Lo anterior al Título I es el decreto que aprueba la norma; lo posterior a la fe de
    # erratas son fragmentos entre comillas que repetirían artículos.
    dentro = False
    for linea in lineas:
        if _FIN_CUERPO.match(linea):
            return
        if not dentro and _INICIO_CUERPO.match(linea):
            dentro = True
        if dentro:
            yield linea


def _leer_linea(lectura: _Lectura, linea: str) -> None:
    limpia = " ".join(linea.split())
    if _leer_estructura(lectura, limpia):
        return
    encabezado = _encabezado(lectura, limpia)
    if encabezado is not None:
        lectura.cerrar()
        lectura.actual = encabezado
        return
    actual = lectura.actual
    if actual is None:
        return
    if not actual.titulo_cerrado:
        # Un título largo sigue en la línea de abajo y empieza en minúscula; el cuerpo, no.
        if _continua_titulo(actual, limpia):
            actual.titulo.append(limpia)
            return
        actual.titulo_cerrado = True
    actual.lineas.append(limpia)


def _continua_titulo(borrador: _Borrador, limpia: str) -> bool:
    return (
        bool(borrador.titulo)
        and len(borrador.titulo) < _LINEAS_MAXIMAS_TITULO
        and limpia[:1].islower()
    )


def _leer_estructura(lectura: _Lectura, limpia: str) -> bool:
    """Títulos, capítulos y grupos de disposiciones: dicen dónde está cada artículo."""
    if lectura.nivel_pendiente is not None and limpia:
        nivel = lectura.nivel_pendiente
        lectura.nivel_pendiente = None
        if not _ARTICULO.match(limpia):
            lectura.niveles[nivel] = f"{lectura.niveles[nivel]} — {limpia}"
            return True
    encontrado = _NIVEL.match(limpia)
    if encontrado:
        clave = _sin_tildes(encontrado.group(1)).upper()
        lectura.niveles[clave] = f"{encontrado.group(1)} {encontrado.group(2)}"
        for menor in ("TITULO", "CAPITULO", "SUBCAPITULO")[
            ("TITULO", "CAPITULO", "SUBCAPITULO").index(clave) + 1 :
        ]:
            lectura.niveles.pop(menor, None)
        lectura.nivel_pendiente = clave
        return True
    grupo = _GRUPO_DISPOSICIONES.match(limpia)
    if grupo:
        lectura.cerrar()
        lectura.grupo = _SIGLAS_GRUPO[grupo.group(1)]
        lectura.niveles = {}
        return True
    return False


def _encabezado(lectura: _Lectura, limpia: str) -> _Borrador | None:
    if lectura.grupo is None:
        articulo = _ARTICULO.match(limpia)
        if articulo is None:
            return None
        numero, titulo = articulo.groups()
        return _Borrador(
            f"art-{numero.lower()}", f"Artículo {numero}", _no_vacio(titulo), lectura.ubicacion()
        )
    disposicion = _DISPOSICION.match(limpia)
    if disposicion is None:
        return None
    ordinal = " ".join(disposicion.group(1).split())
    sigla, nombre = lectura.grupo
    clave = f"{sigla}-{_sin_tildes(ordinal).lower().replace(' ', '-')}"
    return _Borrador(clave, f"{ordinal.capitalize()} {nombre}", _no_vacio(disposicion.group(2)), ())


def _fragmentos(norma: Norma, borradores: Sequence[_Borrador]) -> Iterable[Fragmento]:
    vistas: dict[str, int] = {}
    for orden, borrador in enumerate(borradores):
        # Una clave repetida (un artículo citado entero en otro lugar) no pisa a la primera.
        # En el texto consolidado, eso pasa cuando una modificación transcribe el texto nuevo.
        vistas[borrador.clave] = vistas.get(borrador.clave, 0) + 1
        repetida = vistas[borrador.clave] > 1
        yield Fragmento(
            id_norma=norma.id,
            clave=f"{borrador.clave}~{vistas[borrador.clave]}" if repetida else borrador.clave,
            etiqueta=f"{borrador.etiqueta} (texto modificado)" if repetida else borrador.etiqueta,
            titulo=" ".join(borrador.titulo),
            texto=_parrafos(borrador.lineas),
            ubicacion=borrador.ubicacion,
            orden=orden,
        )


def _parrafos(lineas: Sequence[str]) -> str:
    parrafos: list[list[str]] = [[]]
    for linea in lineas:
        if linea:
            parrafos[-1].append(linea)
        elif parrafos[-1]:
            parrafos.append([])
    return "\n\n".join(" ".join(p) for p in parrafos if p)


def _no_vacio(texto: str) -> list[str]:
    return [texto] if texto.strip() else []


def _sin_tildes(texto: str) -> str:
    descompuesto = unicodedata.normalize("NFKD", texto)
    return "".join(c for c in descompuesto if not unicodedata.combining(c))


def normalizar_para_busqueda(texto: str) -> str:
    """Minúsculas y sin tildes: así "contratación" y "CONTRATACION" son la misma palabra."""
    return " ".join(_sin_tildes(texto).lower().split())


def _para_comparar(texto: str) -> str:
    unificado = unicodedata.normalize("NFKC", texto)
    for comilla in "“”«»„‟":
        unificado = unificado.replace(comilla, '"')
    for apostrofo in "‘’‚‛":
        unificado = unificado.replace(apostrofo, "'")
    for guion in "‐‑‒–—":
        unificado = unificado.replace(guion, "-")
    return " ".join(unificado.lower().split())


def es_extracto_literal(extracto: str, texto: str) -> bool:
    """El extracto está tal cual en el texto. Se admiten omisiones marcadas con "…" o "(...)".

    Es la defensa contra una cita inventada: si el lector parafrasea, la cita no se muestra.
    """
    trozos = [
        t.strip(" .")
        for t in re.split(r"\(?\s*(?:\.\.\.|…)\s*\)?", _para_comparar(extracto))
        if t.strip(" .")
    ]
    if not trozos or any(len(t) < _LARGO_MINIMO_TROZO for t in trozos):
        return False
    completo = _para_comparar(texto)
    desde = 0
    for trozo in trozos:
        posicion = completo.find(trozo, desde)
        if posicion < 0:
            return False
        desde = posicion + len(trozo)
    return True


def palabras_de(texto: str) -> frozenset[str]:
    """Las palabras que distinguen un texto, sin tildes ni puntuación."""
    return frozenset(
        p
        for p in re.findall(r"[a-z0-9]+", normalizar_para_busqueda(texto))
        if len(p) >= LARGO_MINIMO_PALABRA
    )


def parrafo_mas_cercano(texto: str, consulta: str) -> str:
    """El párrafo del fragmento que comparte más palabras con la consulta."""
    palabras = palabras_de(consulta)
    parrafos = [p for p in texto.split("\n\n") if p.strip()] or [texto]
    return max(parrafos, key=lambda p: len(palabras & palabras_de(p)))
