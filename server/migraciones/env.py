"""Migraciones con la misma URL que usa la API (AXIS_BASE_DATOS_URL)."""

import asyncio

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from axis.arranque.config import Config


def _migrar(conexion: object) -> None:
    context.configure(connection=conexion, target_metadata=None)
    with context.begin_transaction():
        context.run_migrations()


async def _en_linea() -> None:
    motor = create_async_engine(Config().base_datos_url)
    async with motor.connect() as conexion:
        await conexion.run_sync(_migrar)
    await motor.dispose()


asyncio.run(_en_linea())
