"""Grupos de partidas parecidas y la distribución de sus precios.

Para cada unidad (m2, m3, kg…) se agrupan las descripciones por similitud de texto y, en cada
grupo, se guarda la distribución del precio en escala logarítmica: un precio el doble de caro
pesa lo mismo que uno a la mitad. La dispersión se mide con la mediana de las desviaciones
(MAD), que no se deja arrastrar por los mismos precios raros que se quieren encontrar.
"""

import math
import re
import unicodedata
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np
from sklearn.cluster import AgglomerativeClustering
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion
from sklearn.preprocessing import normalize

_ESPACIOS = re.compile(r"\s+")
# Factor que convierte el MAD en una desviación estándar equivalente si los datos fueran normales.
_MAD_A_DESVIO = 1.4826
# Un precio global depende de todo el alcance de la obra (la movilización de una obra grande
# no se compara con la de una chica): esas unidades no se comparan.
UNIDADES_NO_COMPARABLES = frozenset({"glb", "gbl", "est"})


@dataclass(frozen=True, slots=True)
class Umbrales:
    """Cuándo un precio llama la atención. Los elige la validación cruzada; viajan en el modelo."""

    veces_minimas: float  # la diferencia tiene que importar en plata (p. ej. 1.5 = ±50 %)
    desvios_ambar: float
    desvios_rojo: float


# Palabras que no dicen qué trabajo es; la actividad es la primera palabra con contenido.
_VACIAS = frozenset(
    {
        "de",
        "del",
        "la",
        "el",
        "los",
        "las",
        "y",
        "en",
        "con",
        "para",
        "a",
        "por",
        "al",
        "nes",
        "partida",
        "item",
    }
)
_PALABRA = re.compile(r"[a-z]{3,}")


def actividad(descripcion: str) -> str:
    """El trabajo que describe la partida: "remocion", "relleno", "eliminacion", "corte"…

    Sacar una carpeta asfáltica y colocarla comparten casi todas las letras pero no el precio:
    solo se comparan partidas de la misma actividad.
    """
    for palabra in _PALABRA.findall(normalizar_descripcion(descripcion)):
        if palabra not in _VACIAS:
            return str(palabra)
    return ""


_SUMINISTRO = re.compile(r"\bsuministr|\bincl?\.?\s*(?:suministro|material)|\bprovision")
_INSTALACION = re.compile(r"\binstalac|\bcolocac|\bmontaje|\btendido")
_MEDIDAS = (
    ("dn", re.compile(r"\bdn\s*=?\s*(\d+(?:[.,]\d+)?)")),
    ("fc", re.compile(r"\bf'?\s*c\s*=?\s*(\d{3})")),
    ("e", re.compile(r"\be\s*=\s*(\d+(?:[.,]\d+)?\s*(?:mm|cm|m|\"|pulg)?)")),
    ("mm", re.compile(r"(\d+(?:[.,]\d+)?)\s*mm\b")),
    ("pulg", re.compile(r"(\d+(?:\s+\d/\d)?|\d/\d)\s*(?:\"|pulg)")),
)


def alcance(descripcion: str) -> str:
    """Si la partida incluye el material, la mano de obra o ambos: cambia el precio por completo."""
    texto = normalizar_descripcion(descripcion)
    suministra = bool(_SUMINISTRO.search(texto))
    instala = bool(_INSTALACION.search(texto))
    if suministra and instala:
        return "suministro_instalacion"
    return "suministro" if suministra else ("instalacion" if instala else "")


def medida(descripcion: str) -> str:
    """La primera medida que define el precio: diámetro, resistencia del concreto o espesor.

    Una tubería DN 20 y una DN 200 comparten casi todas las palabras, pero no el precio.
    """
    texto = normalizar_descripcion(descripcion)
    for nombre, patron in _MEDIDAS:
        encontrada = patron.search(texto)
        if encontrada:
            valor = _ESPACIOS.sub("", encontrada.group(1)).replace(",", ".")
            return f"{nombre}{valor}"
    return ""


def clave_de_grupo(unidad: str, descripcion: str, esquema: int) -> str:
    """Esquema 1: unidad y actividad. Esquema 2: además, alcance y medida."""
    base = f"{unidad}|{actividad(descripcion)}"
    if esquema == 1:
        return base
    return f"{base}|{alcance(descripcion)}|{medida(descripcion)}"


def normalizar_descripcion(texto: str) -> str:
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto.lower()) if not unicodedata.combining(c)
    )
    return _ESPACIOS.sub(" ", sin_tildes).strip()


@dataclass(frozen=True, slots=True)
class PrecioObservado:
    descripcion: str
    unidad: str
    precio: float
    obra: str  # proceso o archivo de origen: dos precios de la misma obra no son independientes


@dataclass(frozen=True, slots=True)
class Grupo:
    unidad: str
    ejemplo: str  # la descripción más representativa, para explicar
    precios: int
    obras: int
    mediana_log: float
    dispersion_log: float
    p10: float
    p90: float

    @property
    def mediana(self) -> float:
        return math.exp(self.mediana_log)


@dataclass(frozen=True, slots=True)
class Comparacion:
    grupo: Grupo
    similitud: float
    desvios: float  # cuántas dispersiones se aleja el precio de la mediana (con signo)
    veces: float  # precio / mediana


@dataclass
class ModeloPrecios:
    vectorizador: FeatureUnion
    centroides: dict[str, np.ndarray]  # por unidad y actividad: una fila por grupo
    grupos: dict[str, list[Grupo]]
    similitud_minima: float
    umbrales: Umbrales
    # Los modelos guardados antes de existir el campo usan el esquema 1 (vía el valor de clase).
    esquema_clave: int = 1

    def comparar(self, descripcion: str, unidad: str, precio: float) -> Comparacion | None:
        """None si no hay un grupo parecido con la misma unidad: sin con qué comparar, no opina."""
        clave = clave_de_grupo(unidad, descripcion, self.esquema_clave)
        if precio <= 0 or unidad in UNIDADES_NO_COMPARABLES or clave not in self.centroides:
            return None
        vector = normalize(self.vectorizador.transform([normalizar_descripcion(descripcion)]))
        similitudes = (vector @ self.centroides[clave].T).ravel()
        indice = int(np.argmax(similitudes))
        similitud = float(similitudes[indice])
        if similitud < self.similitud_minima:
            return None
        grupo = self.grupos[clave][indice]
        desvios = (math.log(precio) - grupo.mediana_log) / grupo.dispersion_log
        return Comparacion(grupo, similitud, desvios, precio / grupo.mediana)


def entrenar(  # noqa: PLR0913 - todos son hiperparámetros que elige la validación cruzada
    observados: Sequence[PrecioObservado],
    *,
    distancia_maxima: float,
    minimo_precios: int,
    minimo_obras: int,
    similitud_minima: float,
    dispersion_minima: float,
    umbrales: Umbrales,
    esquema_clave: int = 2,
) -> ModeloPrecios:
    # Palabras completas distinguen "préstamo" de "propio"; letras toleran errores de OCR.
    vectorizador = FeatureUnion(
        [
            ("palabras", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)),
            ("letras", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),
        ]
    )
    vectorizador.fit([normalizar_descripcion(o.descripcion) for o in observados])
    por_unidad: dict[str, list[PrecioObservado]] = defaultdict(list)
    for observado in observados:
        if observado.precio > 0 and observado.unidad not in UNIDADES_NO_COMPARABLES:
            clave = clave_de_grupo(observado.unidad, observado.descripcion, esquema_clave)
            por_unidad[clave].append(observado)
    centroides: dict[str, np.ndarray] = {}
    grupos: dict[str, list[Grupo]] = {}
    for unidad, lista in por_unidad.items():
        hallados = _agrupar(
            lista, vectorizador, distancia_maxima, (minimo_precios, minimo_obras), dispersion_minima
        )
        if hallados:
            grupos[unidad] = [g for g, _ in hallados]
            centroides[unidad] = normalize(np.vstack([c for _, c in hallados]))
    return ModeloPrecios(
        vectorizador, centroides, grupos, similitud_minima, umbrales, esquema_clave
    )


def _agrupar(
    lista: list[PrecioObservado],
    vectorizador: FeatureUnion,
    distancia_maxima: float,
    minimos: tuple[int, int],
    dispersion_minima: float,
) -> list[tuple[Grupo, np.ndarray]]:
    minimo_precios, minimo_obras = minimos
    if len(lista) < minimo_precios:
        return []
    matriz = normalize(
        vectorizador.transform([normalizar_descripcion(o.descripcion) for o in lista])
    )
    # Distancia coseno desde el producto disperso (n × n): densificar la matriz de n-gramas
    # (n × decenas de miles de columnas) costaba minutos con grupos de miles de partidas.
    similitudes = matriz @ matriz.T
    distancias = 1.0 - (similitudes.toarray() if hasattr(similitudes, "toarray") else similitudes)
    np.clip(distancias, 0.0, 2.0, out=distancias)
    np.fill_diagonal(distancias, 0.0)
    etiquetas = AgglomerativeClustering(
        n_clusters=None,
        metric="precomputed",
        linkage="average",
        distance_threshold=distancia_maxima,
    ).fit_predict(distancias)
    salida = []
    for etiqueta in set(etiquetas.tolist()):
        indices = np.flatnonzero(etiquetas == etiqueta)
        miembros = [lista[i] for i in indices]
        obras = {m.obra for m in miembros}
        if len(miembros) < minimo_precios or len(obras) < minimo_obras:
            continue
        centroide = np.asarray(matriz[indices].mean(axis=0)).ravel()
        grupo = _resumir(miembros, matriz[indices], centroide, len(obras), dispersion_minima)
        salida.append((grupo, centroide))
    return salida


def _resumir(
    miembros: list[PrecioObservado],
    vectores: object,
    centroide: np.ndarray,
    obras: int,
    dispersion_minima: float,
) -> Grupo:
    logs = np.log([m.precio for m in miembros])
    mediana = float(np.median(logs))
    dispersion = max(dispersion_minima, _MAD_A_DESVIO * float(np.median(np.abs(logs - mediana))))
    cercania = np.asarray(vectores @ centroide).ravel()
    return Grupo(
        unidad=miembros[0].unidad,
        ejemplo=miembros[int(np.argmax(cercania))].descripcion,
        precios=len(miembros),
        obras=obras,
        mediana_log=mediana,
        dispersion_log=dispersion,
        p10=float(np.exp(np.percentile(logs, 10))),
        p90=float(np.exp(np.percentile(logs, 90))),
    )
