"""Indexa los textos oficiales de la normativa, artículo por artículo.

    docker compose --profile entrenamiento run --rm entrenar python -m herramientas.indexar_normas
    uv run python -m herramientas.indexar_normas          # contra el Postgres local (5433)

Solo se indexan los textos consolidados vigentes. Al reindexar cambia la huella de la norma y
las respuestas guardadas del lector dejan de usarse.
"""

import asyncio
import os
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine

from axis.arranque.config import Config
from axis.normativa.adaptadores.salida.postgres import RepositorioNormativaPostgres
from axis.normativa.aplicacion.casos_de_uso.indexar_norma import IndexarNorma
from axis.normativa.aplicacion.dto import OrdenIndexarNorma
from axis.normativa.dominio.valores import Norma, TipoNorma

FUENTES = (
    (
        "ley32069/ley_32069_hasta_2026-07-19.txt",
        Norma(
            "ley_32069",
            "Ley N.° 32069, Ley General de Contrataciones Públicas",
            TipoNorma.LEY,
            "2026-07-19",
        ),
    ),
    (
        "ley32069/reglamento_ds009-2025-ef_hasta_2026-01-09.txt",
        Norma(
            "reglamento_32069",
            "Reglamento de la Ley N.° 32069, aprobado por D.S. N.° 009-2025-EF",
            TipoNorma.REGLAMENTO,
            "2026-01-09",
        ),
    ),
)


async def principal() -> None:
    datos = Path(os.environ.get("AXIS_DATOS_CRUDOS", "../../datos-crudos")).resolve() / "normas"
    motor = create_async_engine(Config().base_datos_url)
    caso = IndexarNorma(repositorio=RepositorioNormativaPostgres(motor))
    try:
        for archivo, norma in FUENTES:
            cantidad = await caso.ejecutar(OrdenIndexarNorma(norma, (datos / archivo).read_text()))
            print(f"{norma.id}: {cantidad} fragmentos")
    finally:
        await motor.dispose()


if __name__ == "__main__":
    asyncio.run(principal())
