"""Entrena el motor de precio atípico con la base de precios reales y lo publica.

    uv run python -m herramientas.base_precios        # (en Docker, por el OCR) arma la base
    uv run python -m herramientas.entrenar_precios --subir

Todo se mide con obras que el modelo no vio (validación cruzada por obra):
  - falsas alarmas: precios reales que marca (lo ideal es casi ninguno);
  - detección: precios reales a los que se les mete un error (×3, ÷3, ×10) y se ve si los marca;
  - cobertura: en cuántas partidas tiene con qué comparar.
Con eso se eligen la agrupación y los umbrales, en vez de fijarlos a ojo.
"""

import argparse
import asyncio
import json
from concurrent.futures import ProcessPoolExecutor
from datetime import UTC, datetime
from functools import partial
from pathlib import Path
from typing import Any

import aioboto3
import numpy as np
from sklearn.model_selection import GroupKFold

from axis.arranque.config import Config
from axis.compartido.infraestructura.registro_artefactos import RegistroArtefactos
from axis.motores.precio_atipico.artefacto import PREFIJO, ArtefactoPrecios, serializar
from axis.motores.precio_atipico.inferencia import severidad_de
from axis.motores.precio_atipico.modelo import (
    ModeloPrecios,
    PrecioObservado,
    Umbrales,
    entrenar,
)

BASE = Path(".cache/precios_reales.jsonl")
# Errores que se le meten a un precio real para ver si el motor los encuentra.
ERRORES = {"x3": 3.0, "dividido_3": 1 / 3, "x10_coma_corrida": 10.0}
# Una configuración se descarta si marca más que esto de los precios reales de obras no vistas.
FALSAS_ALARMAS_MAXIMAS = 0.05
MINIMO_PRECIOS = 5
MINIMO_OBRAS = 3
DESVIOS_AMBAR = 3.0
DESVIOS_ROJO = 5.0
CANDIDATOS = [
    {"distancia_maxima": d, "similitud_minima": s, "dispersion_minima": disp, "veces_minimas": v}
    for d in (0.5, 0.65)
    for s in (0.45, 0.6)
    for disp in (0.12, 0.2)
    for v in (1.5, 2.0, 2.5)
]
TOLERANCIA_PROMOCION = 0.02
# Agrupa por objeto, alcance (suministro, instalación) y medida (DN, f'c, espesor).
ESQUEMA_CLAVE = 3

type Metricas = dict[str, Any]


def cargar() -> list[PrecioObservado]:
    filas = [json.loads(linea) for linea in BASE.read_text().splitlines()]
    return [
        PrecioObservado(f["descripcion"], f["unidad"], float(f["precio_unitario"]), f["proceso"])
        for f in filas
        if f.get("unidad") and float(f["precio_unitario"]) > 0
    ]


def _entrenar(observados: list[PrecioObservado], parametros: dict[str, float]) -> ModeloPrecios:
    return entrenar(
        observados,
        distancia_maxima=parametros["distancia_maxima"],
        minimo_precios=MINIMO_PRECIOS,
        minimo_obras=MINIMO_OBRAS,
        similitud_minima=parametros["similitud_minima"],
        dispersion_minima=parametros["dispersion_minima"],
        umbrales=Umbrales(parametros["veces_minimas"], DESVIOS_AMBAR, DESVIOS_ROJO),
        esquema_clave=ESQUEMA_CLAVE,
    )


def evaluar(observados: list[PrecioObservado], parametros: dict[str, float]) -> Metricas:
    obras = np.array([o.obra for o in observados])
    marcados = cubiertos = 0
    detectados = dict.fromkeys(ERRORES, 0)
    for entrenamiento, prueba in GroupKFold(n_splits=5).split(observados, groups=obras):
        modelo = _entrenar([observados[i] for i in entrenamiento], parametros)
        for i in prueba:
            o = observados[i]
            comparacion = modelo.comparar(o.descripcion, o.unidad, o.precio)
            if comparacion is None:
                continue
            cubiertos += 1
            marcados += severidad_de(comparacion, modelo.umbrales) is not None
            for nombre, factor in ERRORES.items():
                alterado = modelo.comparar(o.descripcion, o.unidad, o.precio * factor)
                detectados[nombre] += (
                    alterado is not None and severidad_de(alterado, modelo.umbrales) is not None
                )
    return {
        "parametros": parametros,
        "cobertura": round(cubiertos / len(observados), 4),
        "falsas_alarmas": round(marcados / max(1, cubiertos), 4),
        "deteccion": {k: round(v / max(1, cubiertos), 4) for k, v in detectados.items()},
        "precios": len(observados),
        "obras": len(set(obras.tolist())),
    }


def puntaje(m: Metricas) -> float:
    # Detectar errores donde hay con qué comparar, sin inventar alarmas sobre precios sanos.
    if m["falsas_alarmas"] > FALSAS_ALARMAS_MAXIMAS:
        return -1.0
    return float(m["cobertura"]) * float(np.mean(list(m["deteccion"].values())))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--subir", action="store_true")
    argumentos = parser.parse_args()
    observados = cargar()
    print(f"Base: {len(observados)} precios de {len({o.obra for o in observados})} obras")
    # Cada configuración se evalúa en su propio proceso: son independientes y usan CPU.
    with ProcessPoolExecutor() as procesos:
        resultados = list(procesos.map(partial(evaluar, observados), CANDIDATOS))
    for m in sorted(resultados, key=puntaje, reverse=True)[:6]:
        p = m["parametros"]
        print(
            f"  dist {p['distancia_maxima']:.2f} sim {p['similitud_minima']:.2f} "
            f"disp {p['dispersion_minima']:.2f} veces {p['veces_minimas']:.1f}"
            f" → cobertura {m['cobertura']:.0%}  falsas alarmas {m['falsas_alarmas']:.1%}  "
            f"detección {m['deteccion']}"
        )
    mejor = max(resultados, key=puntaje)
    if puntaje(mejor) < 0:
        print("Ninguna configuración cumple el máximo de falsas alarmas: no se publica.")
        return
    modelo = _entrenar(observados, mejor["parametros"])
    grupos = sum(len(g) for g in modelo.grupos.values())
    version = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    metricas = {**mejor, "grupos": grupos, "version": version, "candidatos": resultados}
    print(f"\nElegida: {mejor['parametros']} → {grupos} grupos de partidas comparables")
    for ejemplo in _ejemplos(modelo):
        print(f"  {ejemplo}")
    contenido = serializar(ArtefactoPrecios(version, modelo, metricas))
    destino = Path(".cache/modelos") / PREFIJO / version
    destino.mkdir(parents=True, exist_ok=True)
    (destino / "artefacto.joblib").write_bytes(contenido)
    (destino / "metricas.json").write_text(json.dumps(metricas, indent=2, ensure_ascii=False))
    if argumentos.subir:
        asyncio.run(_publicar(version, contenido, metricas))


def _ejemplos(modelo: ModeloPrecios) -> list[str]:
    grupos = sorted((g for gs in modelo.grupos.values() for g in gs), key=lambda g: -g.obras)
    return [
        f"{g.ejemplo[:45]} ({g.unidad}): mediana S/ {g.mediana:.2f}, {g.obras} obras"
        for g in grupos[:5]
    ]


async def _publicar(version: str, contenido: bytes, metricas: Metricas) -> None:
    config = Config()
    async with aioboto3.Session().client(
        "s3", endpoint_url=config.s3_endpoint, region_name=config.s3_region
    ) as s3:
        registro = RegistroArtefactos(s3, config.s3_bucket_modelos, PREFIJO)
        anterior = await registro.puntero()
        promover = True
        if anterior is not None:
            previas = await registro.metricas(anterior["version"]) or {}
            previo = puntaje(previas) if "deteccion" in previas else -1.0
            promover = puntaje(metricas) >= previo - TOLERANCIA_PROMOCION
        await registro.publicar(version, contenido, metricas, promover=promover)
        estado = " y promovida" if promover else " (no se promueve: empeora)"
        print(f"Publicada {version}{estado}")


if __name__ == "__main__":
    main()
