"""Reglas físicas del archivo. Lo que requiere juicio (qué es, si es raro) es de los modelos."""

from collections import Counter
from collections.abc import Sequence
from datetime import timedelta

from axis.documentos.dominio.entidades import Huella, Pagina, Parte, SenalEdicion
from axis.documentos.dominio.valores import (
    Clasificacion,
    CodigoSenal,
    OrigenPagina,
)

# Una imagen que tapa la mitad de la página o más se trata como página escaneada.
COBERTURA_IMAGEN_ESCANEO = 0.5
# Menos caracteres que esto en una página con imagen: no hay capa de texto útil.
CARACTERES_MINIMOS_TEXTO = 30
# Exportar desde Word o escanear deja creación y modificación casi iguales.
HOLGURA_MODIFICACION = timedelta(minutes=10)
# Proporción a partir de la cual un origen es "el normal" del documento.
MAYORIA_ORIGEN = 0.6
# Diferencia de tamaño (en proporción) para considerar que una página no es del mismo papel.
TOLERANCIA_TAMANO = 0.02


def clasificar_origen(caracteres: int, cobertura_imagen: float) -> OrigenPagina:
    if cobertura_imagen >= COBERTURA_IMAGEN_ESCANEO:
        if caracteres < CARACTERES_MINIMOS_TEXTO:
            return OrigenPagina.ESCANEADA
        return OrigenPagina.MIXTA
    if caracteres == 0:
        return OrigenPagina.VACIA
    return OrigenPagina.DIGITAL


def segmentar(paginas: Sequence[Pagina]) -> tuple[Parte, ...]:
    """Agrupa páginas seguidas del mismo tipo. Las vacías continúan la parte anterior."""
    etiquetadas = _suavizar([p.clasificacion for p in paginas])
    partes: list[Parte] = []
    confianzas: list[float] = []
    for pagina, clasificacion in zip(paginas, etiquetadas, strict=True):
        if clasificacion is None:
            if partes:
                partes[-1] = _extender(partes[-1], pagina.numero)
            continue
        if partes and partes[-1].etiqueta == clasificacion.etiqueta:
            partes[-1] = _extender(partes[-1], pagina.numero)
            confianzas[-1] = confianzas[-1] + clasificacion.confianza
            continue
        if partes:
            partes[-1] = _con_confianza(partes[-1], confianzas[-1])
        partes.append(Parte(clasificacion.etiqueta, pagina.numero, pagina.numero, 0.0))
        confianzas.append(clasificacion.confianza)
    if partes:
        partes[-1] = _con_confianza(partes[-1], confianzas[-1])
    return tuple(partes)


def _suavizar(
    clasificaciones: Sequence[Clasificacion | None],
) -> list[Clasificacion | None]:
    # Una página suelta entre dos del mismo tipo, y menos segura que ellas, suele ser un error
    # del clasificador (una tabla dentro de la memoria, por ejemplo), no una parte nueva.
    resultado = list(clasificaciones)
    for i in range(1, len(resultado) - 1):
        anterior, actual, siguiente = resultado[i - 1], resultado[i], resultado[i + 1]
        if anterior is None or actual is None or siguiente is None:
            continue
        mismo_vecino = anterior.etiqueta == siguiente.etiqueta != actual.etiqueta
        if mismo_vecino and actual.confianza < min(anterior.confianza, siguiente.confianza):
            resultado[i] = Clasificacion(anterior.etiqueta, actual.confianza)
    return resultado


def _extender(parte: Parte, hasta: int) -> Parte:
    return Parte(parte.etiqueta, parte.desde, hasta, parte.confianza)


def _con_confianza(parte: Parte, suma: float) -> Parte:
    return Parte(parte.etiqueta, parte.desde, parte.hasta, min(1.0, suma / parte.total_paginas))


def detectar_senales(huella: Huella, paginas: Sequence[Pagina]) -> tuple[SenalEdicion, ...]:
    senales = [
        _senal_modificacion(huella),
        _senal_revisiones(huella),
        _senal_firma(huella),
        _senal_programa(huella),
        _senal_origen(paginas),
        _senal_tamano(paginas),
    ]
    return tuple(s for s in senales if s is not None)


def _senal_modificacion(huella: Huella) -> SenalEdicion | None:
    if huella.creado_en is None or huella.modificado_en is None:
        return None
    diferencia = huella.modificado_en - huella.creado_en
    if diferencia <= HOLGURA_MODIFICACION:
        return None
    return SenalEdicion(
        CodigoSenal.MODIFICADO_TRAS_CREACION,
        f"Se modificó {_humanizar(diferencia)} después de crearse.",
    )


def _senal_revisiones(huella: Huella) -> SenalEdicion | None:
    if huella.revisiones <= 1:
        return None
    return SenalEdicion(
        CodigoSenal.GUARDADO_INCREMENTAL,
        f"Tiene {huella.revisiones} versiones guardadas una encima de otra.",
    )


def _senal_firma(huella: Huella) -> SenalEdicion | None:
    if huella.firmas_que_no_cubren_todo == 0:
        return None
    return SenalEdicion(
        CodigoSenal.FIRMA_NO_CUBRE_TODO,
        "Hay contenido agregado después de una firma digital.",
    )


def _senal_programa(huella: Huella) -> SenalEdicion | None:
    creador, productor = huella.programa_creador, huella.programa_productor
    if not creador or not productor:
        return None
    if _familia(creador) == _familia(productor):
        return None
    return SenalEdicion(
        CodigoSenal.PROGRAMA_DISTINTO,
        f"Se creó con «{creador}» y se guardó por última vez con «{productor}».",
    )


def _familia(programa: str) -> str:
    # "Microsoft® Word 2019" y "Microsoft Word" son el mismo programa.
    palabras = [p for p in programa.lower().replace("®", " ").split() if p.isalpha()]
    return " ".join(palabras[:2])


def _senal_origen(paginas: Sequence[Pagina]) -> SenalEdicion | None:
    relevantes = [p for p in paginas if p.origen is not OrigenPagina.VACIA]
    if len(relevantes) < 3:  # noqa: PLR2004 - con menos páginas no hay "normal" que comparar
        return None
    digitales = [p.numero for p in relevantes if p.origen is OrigenPagina.DIGITAL]
    escaneadas = [p.numero for p in relevantes if p.origen is not OrigenPagina.DIGITAL]
    if not digitales or not escaneadas:
        return None
    if len(digitales) / len(relevantes) >= MAYORIA_ORIGEN:
        return SenalEdicion(
            CodigoSenal.ORIGEN_MEZCLADO,
            "Es un documento digital con páginas escaneadas intercaladas.",
            tuple(escaneadas),
        )
    if len(escaneadas) / len(relevantes) >= MAYORIA_ORIGEN:
        return SenalEdicion(
            CodigoSenal.ORIGEN_MEZCLADO,
            "Es un documento escaneado con páginas digitales intercaladas.",
            tuple(digitales),
        )
    return None


def _senal_tamano(paginas: Sequence[Pagina]) -> SenalEdicion | None:
    if len(paginas) < 3:  # noqa: PLR2004
        return None
    tamanos = Counter(_tamano_normalizado(p) for p in paginas)
    comun, _ = tamanos.most_common(1)[0]
    distintas = tuple(
        p.numero
        for p in paginas
        if abs(_tamano_normalizado(p)[0] - comun[0]) > comun[0] * TOLERANCIA_TAMANO
        or abs(_tamano_normalizado(p)[1] - comun[1]) > comun[1] * TOLERANCIA_TAMANO
    )
    if not distintas:
        return None
    return SenalEdicion(
        CodigoSenal.TAMANO_DE_PAGINA_DISTINTO,
        "Hay páginas de otro tamaño de papel (es normal en planos; raro en el resto).",
        distintas,
    )


def _tamano_normalizado(pagina: Pagina) -> tuple[int, int]:
    # Una hoja apaisada es el mismo papel que una vertical.
    lado_menor, lado_mayor = sorted((pagina.ancho_pt, pagina.alto_pt))
    return round(lado_menor), round(lado_mayor)


def _humanizar(diferencia: timedelta) -> str:
    dias = diferencia.days
    if dias >= 1:
        return f"{dias} día{'s' if dias != 1 else ''}"
    horas = diferencia.seconds // 3600
    if horas >= 1:
        return f"{horas} hora{'s' if horas != 1 else ''}"
    return f"{diferencia.seconds // 60} minutos"
