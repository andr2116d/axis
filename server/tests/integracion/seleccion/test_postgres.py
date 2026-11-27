import os
from datetime import date

import pytest
import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from axis.seleccion.adaptadores.salida.postgres import (
    RegistroAntecedentesPostgres,
    RepositorioProcesosPostgres,
    antecedentes,
    procesos,
)
from axis.seleccion.dominio.valores import TipoAntecedente

pytestmark = pytest.mark.integracion
URL = os.environ.get("AXIS_BASE_DATOS_URL", "postgresql+asyncpg://axis:axis@localhost:5433/axis")
RUC = "20999999901"


@pytest.fixture
async def motor():
    motor = create_async_engine(URL)
    try:
        async with motor.begin() as conexion:
            await conexion.execute(
                sa.insert(procesos).values(
                    id="prueba-1",
                    nomenclatura="LP-PRUEBA",
                    entidad="ENTIDAD",
                    descripcion="OBRA",
                    monto_referencial=1000,
                    cui=None,
                    convocatoria=date(2026, 1, 1),
                    postores=[{"identificador": RUC, "nombre": "PRUEBA SAC", "ganador": True}],
                )
            )
            await conexion.execute(
                sa.insert(antecedentes).values(
                    ruc=RUC,
                    tipo="inhabilitacion",
                    motivo="Información inexacta",
                    inicio=date(2025, 1, 1),
                    fin=date(2027, 1, 1),
                    resolucion="1-2025-TCE",
                )
            )
    except OSError:
        pytest.skip("Postgres de docker compose no está levantado")
    yield motor
    async with motor.begin() as conexion:
        await conexion.execute(sa.delete(procesos).where(procesos.c.id == "prueba-1"))
        await conexion.execute(sa.delete(antecedentes).where(antecedentes.c.ruc == RUC))
    await motor.dispose()


async def test_lee_el_proceso_con_sus_postores(motor):
    proceso = await RepositorioProcesosPostgres(motor).obtener("prueba-1")

    assert proceso.convocatoria == date(2026, 1, 1)
    assert [(p.identificador, p.ganador) for p in proceso.postores] == [(RUC, True)]
    assert await RepositorioProcesosPostgres(motor).obtener("no-existe") is None


async def test_trae_los_antecedentes_de_varios_ruc_en_una_consulta(motor):
    registro = await RegistroAntecedentesPostgres(motor).de([RUC, "20000000000"])

    (antecedente,) = registro[RUC]
    assert (antecedente.tipo, antecedente.fin) == (TipoAntecedente.INHABILITACION, date(2027, 1, 1))
    assert "20000000000" not in registro
