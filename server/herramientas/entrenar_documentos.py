"""Entrena los modelos de documentos y, con --subir, los publica en el registro (S3).

    uv run python -m herramientas.entrenar_documentos            # entrena y evalúa en local
    docker compose run --rm entrenar                              # lo mismo, y publica

Tres modelos:
  1. Clasificador de páginas: texto de la página → tipo de parte.
  2. Clasificador de documentos: composición de páginas → qué es el archivo completo.
  3. Medidor de rareza: huella del archivo frente al corpus real de SEACE.

Se evalúa siempre con datos que el modelo no vio: por documento (nunca páginas del mismo
documento a ambos lados), separando lo real de lo sintético, y con los expedientes de prueba
que hizo otro generador.
"""

import argparse
import asyncio
import json
import os
import random
import time
from collections import Counter
from dataclasses import replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import aioboto3
import numpy as np
from sklearn.ensemble import IsolationForest
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import FeatureUnion, Pipeline

from axis.arranque.config import Config
from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.adaptadores.salida.modelos import registro
from axis.documentos.adaptadores.salida.modelos.rasgos import (
    normalizar_texto,
    rasgos_documento,
    rasgos_edicion,
)
from axis.documentos.adaptadores.salida.modelos.sklearn import ArtefactoDocumentos
from axis.documentos.dominio.entidades import Pagina
from axis.documentos.dominio.servicios import clasificar_origen, segmentar
from axis.documentos.dominio.valores import Clasificacion, Etiqueta, OrigenPagina, TipoArchivo
from herramientas import corpus_real, sintetico
from herramientas.taxonomia import FASES, RECETAS

# Métricas en forma de JSON: se guardan tal cual junto al artefacto.
type Metricas = dict[str, Any]

MAX_PAGINAS_REALES_POR_TIPO = 3000
MAX_PAGINAS_POR_DOCUMENTO_REAL = 40
# Una versión nueva no se publica si empeora más que esto frente a la publicada.
TOLERANCIA_PROMOCION = 0.01


def main() -> None:
    argumentos = _argumentos()
    inicio = time.perf_counter()
    datos = Path(os.environ.get("AXIS_DATOS_CRUDOS", "../../datos-crudos")).resolve()
    pruebas = Path(
        os.environ.get("AXIS_EXPEDIENTES_PRUEBA", str(datos.parent / "expedientes-de-prueba"))
    )
    cache = Path(".cache")
    r = random.Random(argumentos.semilla)

    vocabulario = sintetico.Vocabulario.desde(datos)
    print(
        f"Vocabulario: {len(vocabulario.partidas)} partidas, {len(vocabulario.obras)} obras reales"
    )
    reales = corpus_real.cargar(datos, cache) if datos.exists() else []
    print(
        f"Corpus real: {len(reales)} documentos "
        f"({sum(1 for d in reales if d.tipo)} con etiqueta débil)"
    )

    paginas = _dataset_paginas(r, vocabulario, reales, argumentos.docs_por_tipo)
    modelo_eval, metricas_paginas, grupos_prueba = _evaluar_paginas(paginas, argumentos.semilla)
    modelo_paginas = _modelo_paginas().fit(
        [normalizar_texto(t) for t in paginas["textos"]], paginas["etiquetas"]
    )
    etiquetas_pagina = tuple(str(c) for c in modelo_paginas.classes_)

    modelo_documentos, metricas_documentos = _entrenar_documentos(
        r,
        vocabulario,
        reales,
        grupos_prueba,
        modelo_paginas,
        modelo_eval,
        etiquetas_pagina,
        argumentos.docs_por_tipo // 2,
        argumentos.semilla,
    )
    medidor, puntajes, metricas_rareza = _entrenar_rareza(reales, argumentos.semilla)
    metricas_externas = _evaluar_expedientes_de_prueba(
        pruebas, modelo_paginas, modelo_documentos, etiquetas_pagina
    )

    version = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    metricas = {
        "version": version,
        "paginas": metricas_paginas,
        "documentos": metricas_documentos,
        "rareza": metricas_rareza,
        "expedientes_de_prueba": metricas_externas,
        "segundos_entrenamiento": round(time.perf_counter() - inicio),
    }
    artefacto = ArtefactoDocumentos(
        version=version,
        clasificador_paginas=modelo_paginas,
        clasificador_documentos=modelo_documentos,
        etiquetas_pagina=etiquetas_pagina,
        fases_documento=dict(FASES),
        medidor_rareza=medidor,
        puntajes_corpus=puntajes,
        metricas=metricas,
    )
    contenido = registro.serializar(artefacto)
    destino = cache / "modelos" / registro.clave_artefacto(version)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_bytes(contenido)
    (destino.parent / "metricas.json").write_text(
        json.dumps(metricas, indent=2, ensure_ascii=False)
    )
    _imprimir_resumen(metricas, destino, len(contenido))
    if argumentos.subir:
        asyncio.run(_publicar(version, contenido, metricas, forzar=argumentos.forzar))


def _argumentos() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--subir", action="store_true", help="publica en el registro de modelos (S3)"
    )
    parser.add_argument("--forzar", action="store_true", help="publica aunque empeore")
    parser.add_argument("--docs-por-tipo", type=int, default=120)
    parser.add_argument("--semilla", type=int, default=7)
    return parser.parse_args()


# ---------- 1. Páginas ----------


def _dataset_paginas(
    r: random.Random, v: sintetico.Vocabulario, reales: list[corpus_real.DocumentoReal], n: int
) -> dict[str, list[str]]:
    textos: list[str] = []
    etiquetas: list[str] = []
    grupos: list[str] = []
    origen: list[str] = []
    for tipo in RECETAS:
        for k in range(n):
            for parte, texto in sintetico.documento(tipo, r, v):
                textos.append(texto)
                etiquetas.append(parte)
                grupos.append(f"sintetico:{tipo}:{k}")
                origen.append("sintetico")
    por_tipo: Counter[str] = Counter()
    for documento in reales:
        if documento.tipo is None:
            continue
        for texto in corpus_real.paginas_etiquetadas(documento)[:MAX_PAGINAS_POR_DOCUMENTO_REAL]:
            if por_tipo[documento.tipo] >= MAX_PAGINAS_REALES_POR_TIPO:
                break
            por_tipo[documento.tipo] += 1
            textos.append(texto)
            etiquetas.append(documento.tipo)
            grupos.append(f"real:{documento.ruta}")
            origen.append("real")
    print(
        f"Páginas: {len(textos)} ({origen.count('real')} reales). Reales por tipo: {dict(por_tipo)}"
    )
    return {"textos": textos, "etiquetas": etiquetas, "grupos": grupos, "origen": origen}


def _modelo_paginas() -> Pipeline:
    rasgos = FeatureUnion(
        [
            (
                "palabras",
                TfidfVectorizer(
                    ngram_range=(1, 2), min_df=2, max_features=120_000, sublinear_tf=True
                ),
            ),
            (
                "caracteres",
                TfidfVectorizer(
                    analyzer="char_wb",
                    ngram_range=(3, 5),
                    min_df=3,
                    max_features=150_000,
                    sublinear_tf=True,
                ),
            ),
        ]
    )
    clasificador = LogisticRegression(C=4.0, max_iter=400, class_weight="balanced")
    return Pipeline([("rasgos", rasgos), ("clasificador", clasificador)])


def _evaluar_paginas(
    paginas: dict[str, list[str]], semilla: int
) -> tuple[Pipeline, Metricas, set[str]]:
    division = GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=semilla)
    entrenamiento, prueba = next(division.split(paginas["textos"], groups=paginas["grupos"]))
    normalizados = [normalizar_texto(t) for t in paginas["textos"]]
    x = np.array(normalizados, dtype=object)
    y = np.array(paginas["etiquetas"])
    origen = np.array(paginas["origen"])
    modelo = _modelo_paginas().fit(x[entrenamiento], y[entrenamiento])
    predichas = modelo.predict(x[prueba])
    reales = origen[prueba] == "real"
    metricas = {
        "exactitud": round(float(np.mean(predichas == y[prueba])), 4),
        "exactitud_reales": round(float(np.mean(predichas[reales] == y[prueba][reales])), 4)
        if reales.any()
        else None,
        "exactitud_sinteticas": round(float(np.mean(predichas[~reales] == y[prueba][~reales])), 4),
        "paginas_prueba": len(prueba),
        "paginas_prueba_reales": int(reales.sum()),
        "por_tipo": {
            k: {"f1": round(v["f1-score"], 3), "soporte": int(v["support"])}
            for k, v in classification_report(
                y[prueba], predichas, output_dict=True, zero_division=0
            ).items()
            if isinstance(v, dict) and k not in {"macro avg", "weighted avg"}
        },
    }
    if reales.any():
        metricas["por_tipo_reales"] = {
            k: {"f1": round(v["f1-score"], 3), "soporte": int(v["support"])}
            for k, v in classification_report(
                y[prueba][reales], predichas[reales], output_dict=True, zero_division=0
            ).items()
            if isinstance(v, dict) and k not in {"macro avg", "weighted avg"}
        }
    grupos_prueba = {paginas["grupos"][i] for i in prueba}
    return modelo, metricas, grupos_prueba


# ---------- 2. Documentos ----------


def _clasificar_paginas(modelo: Pipeline, paginas: tuple[Pagina, ...]) -> tuple[Pagina, ...]:
    con_texto = [p for p in paginas if p.texto.strip()]
    if not con_texto:
        return paginas
    probabilidades = modelo.predict_proba([normalizar_texto(p.texto) for p in con_texto])
    clases = modelo.classes_
    por_numero = {
        p.numero: Clasificacion(Etiqueta(str(clases[i])), float(fila[i]))
        for p, fila, i in zip(
            con_texto, probabilidades, np.argmax(probabilidades, axis=1), strict=True
        )
    }
    return tuple(replace(p, clasificacion=por_numero.get(p.numero)) for p in paginas)


def _entrenar_documentos(  # noqa: PLR0913, PLR0917 - todo lo que el paso necesita, en orden
    r: random.Random,
    v: sintetico.Vocabulario,
    reales: list[corpus_real.DocumentoReal],
    grupos_prueba: set[str],
    modelo_paginas: Pipeline,
    modelo_eval: Pipeline,
    etiquetas: tuple[str, ...],
    n: int,
    semilla: int,
) -> tuple[LogisticRegression, Metricas]:
    x: list[list[float]] = []
    y: list[str] = []
    origen: list[str] = []
    # Documentos sintéticos nuevos: el clasificador de páginas no los vio al entrenar.
    for tipo in RECETAS:
        for _ in range(n):
            paginas = tuple(
                Pagina(i, OrigenPagina.DIGITAL, texto, 595.0, 842.0)
                for i, (_, texto) in enumerate(sintetico.documento(tipo, r, v), 1)
            )
            x.append(rasgos_documento(_clasificar_paginas(modelo_paginas, paginas), etiquetas))
            y.append(tipo)
            origen.append("sintetico")
    # Reales que quedaron fuera del entrenamiento de páginas: se clasifican con ese modelo.
    for documento in reales:
        if documento.tipo is None or f"real:{documento.ruta}" not in grupos_prueba:
            continue
        x.append(rasgos_documento(_clasificar_paginas(modelo_eval, documento.paginas), etiquetas))
        y.append(documento.tipo)
        origen.append("real")
    xa, ya, oa = np.array(x), np.array(y), np.array(origen)
    entrenamiento, prueba = train_test_split(
        np.arange(len(ya)), test_size=0.25, random_state=semilla, stratify=ya
    )
    modelo = LogisticRegression(C=2.0, max_iter=3000, class_weight="balanced")
    modelo.fit(xa[entrenamiento], ya[entrenamiento])
    predichos = modelo.predict(xa[prueba])
    reales_prueba = oa[prueba] == "real"
    metricas = {
        "exactitud": round(float(np.mean(predichos == ya[prueba])), 4),
        "exactitud_reales": round(
            float(np.mean(predichos[reales_prueba] == ya[prueba][reales_prueba])), 4
        )
        if reales_prueba.any()
        else None,
        "documentos_prueba": len(prueba),
        "documentos_prueba_reales": int(reales_prueba.sum()),
    }
    return LogisticRegression(C=2.0, max_iter=3000, class_weight="balanced").fit(xa, ya), metricas


# ---------- 3. Rareza ----------


def _entrenar_rareza(
    reales: list[corpus_real.DocumentoReal], semilla: int
) -> tuple[IsolationForest | None, tuple[float, ...], Metricas]:
    con_huella = [d for d in reales if d.huella is not None]
    if len(con_huella) < 50:
        return None, (), {"documentos": len(con_huella), "nota": "sin corpus real suficiente"}
    x = np.array([rasgos_edicion(d.huella, d.paginas) for d in con_huella])  # type: ignore[arg-type]
    modelo = IsolationForest(n_estimators=300, random_state=semilla).fit(x)
    puntajes = tuple(sorted(float(s) for s in modelo.score_samples(x)))
    return modelo, puntajes, {"documentos": len(con_huella)}


# ---------- Expedientes de prueba (otro generador, nunca vistos) ----------


def _evaluar_expedientes_de_prueba(
    carpeta: Path,
    modelo_paginas: Pipeline,
    modelo_documentos: LogisticRegression,
    etiquetas: tuple[str, ...],
) -> list[Metricas]:
    if not carpeta.exists():
        return []
    lector = LectorArchivosLocal()
    resultados = []
    for ruta in sorted(carpeta.glob("*.pdf")):
        lectura = asyncio.run(lector.leer(ruta.read_bytes(), TipoArchivo.PDF))
        paginas = tuple(
            Pagina(
                p.numero,
                clasificar_origen(len(p.texto.strip()), p.cobertura_imagen),
                p.texto,
                p.ancho_pt,
                p.alto_pt,
            )
            for p in lectura.paginas
        )
        paginas = _clasificar_paginas(modelo_paginas, paginas)
        probabilidades = modelo_documentos.predict_proba([rasgos_documento(paginas, etiquetas)])[0]
        indice = int(np.argmax(probabilidades))
        resultados.append(
            {
                "archivo": ruta.name,
                "tipo": str(modelo_documentos.classes_[indice]),
                "confianza": round(float(probabilidades[indice]), 3),
                "partes": [f"{p.etiqueta} {p.desde}-{p.hasta}" for p in segmentar(paginas)],
            }
        )
    return resultados


# ---------- Publicación ----------


async def _publicar(version: str, contenido: bytes, metricas: Metricas, *, forzar: bool) -> None:
    config = Config()
    sesion = aioboto3.Session()
    async with sesion.client(
        "s3", endpoint_url=config.s3_endpoint, region_name=config.s3_region
    ) as s3:
        registro_s3 = registro.RegistroModelosS3(s3, config.s3_bucket_modelos)
        anterior = await registro_s3.version_actual()
        bucket = config.s3_bucket_modelos
        await s3.put_object(
            Bucket=bucket,
            Key=registro.clave_artefacto(version),
            Body=contenido,
            ContentType="application/octet-stream",
        )
        await s3.put_object(
            Bucket=bucket,
            Key=f"{registro.PREFIJO}/{version}/metricas.json",
            Body=json.dumps(metricas, ensure_ascii=False).encode(),
            ContentType="application/json",
        )
        if anterior is not None and not forzar:
            previas = await s3.get_object(
                Bucket=bucket, Key=f"{registro.PREFIJO}/{anterior['version']}/metricas.json"
            )
            previo = json.loads(await previas["Body"].read())["documentos"]["exactitud"]
            nuevo = metricas["documentos"]["exactitud"]
            if nuevo < previo - TOLERANCIA_PROMOCION:
                print(
                    f"No se promueve: exactitud de documentos {nuevo} < {previo} "
                    f"de {anterior['version']}"
                )
                return
        await s3.put_object(
            Bucket=bucket,
            Key=registro.CLAVE_PUNTERO,
            Body=registro.puntero(version, contenido),
            ContentType="application/json",
        )
        print(f"Publicada y promovida la versión {version}")


def _imprimir_resumen(metricas: Metricas, destino: Path, tamano: int) -> None:
    p, d = metricas["paginas"], metricas["documentos"]
    print("\n=== Resultado ===")
    print(
        f"Páginas    exactitud {p['exactitud']}  reales {p['exactitud_reales']}  "
        f"sintéticas {p['exactitud_sinteticas']}"
        f"  ({p['paginas_prueba']} de prueba, {p['paginas_prueba_reales']} reales)"
    )
    print(
        f"Documentos exactitud {d['exactitud']}  reales {d['exactitud_reales']}"
        f"  ({d['documentos_prueba']} de prueba, {d['documentos_prueba_reales']} reales)"
    )
    print(f"Rareza     {metricas['rareza']}")
    for e in metricas["expedientes_de_prueba"]:
        print(f"  {e['archivo']}: {e['tipo']} ({e['confianza']}) → {', '.join(e['partes'][:8])}")
    print(f"Artefacto {destino} ({tamano / 1e6:.1f} MB) en {metricas['segundos_entrenamiento']} s")


if __name__ == "__main__":
    main()
