import os
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from axis.compartido.dominio.motores import Factor, Hallazgo, ResultadoMotor, Severidad
from axis.expediente.adaptadores.salida.postgres import RepositorioExpedientesPostgres
from axis.expediente.dominio.entidades import (
    DocumentoAdjunto,
    EvaluacionExpediente,
    Expediente,
    IdEvaluacion,
    IdExpediente,
    OmisionMotor,
)

pytestmark = pytest.mark.integracion
URL = os.environ.get("AXIS_BASE_DATOS_URL", "postgresql+asyncpg://axis:axis@localhost:5433/axis")
AHORA = datetime(2026, 11, 27, 12, tzinfo=UTC)


@pytest.fixture
async def repositorio():
    motor = create_async_engine(URL)
    try:
        async with motor.connect():
            pass
    except OSError:
        pytest.skip("Postgres de docker compose no está levantado")
    yield RepositorioExpedientesPostgres(motor)
    await motor.dispose()


def evaluacion(expediente, numero):
    hallazgo = Hallazgo(
        "precio_atipico",
        "v1",
        Severidad.AMBAR,
        "Precio alto",
        "explicación",
        0.8,
        (Factor("Precio", "S/ 7.02"),),
        pagina=3,
        item="02.04",
        id_documento="doc-1",
        seccion="presupuesto",
        metadatos={"veces": "4.5"},
    )
    return EvaluacionExpediente(
        IdEvaluacion(uuid4()),
        expediente.id,
        numero,
        AHORA + timedelta(minutes=numero),
        (ResultadoMotor("precio_atipico", "v1", "firma-1", (hallazgo,)),),
        (OmisionMotor("planos", "Planos", "Falta subir: planos.", ("planos",)),),
        (("lento", "tardó más de 10 s"),),
        frozenset({"presupuesto"}),
        42,
    )


async def test_guarda_el_expediente_con_sus_documentos_y_sus_evaluaciones(repositorio):
    expediente = Expediente(
        IdExpediente(uuid4()),
        "Pistas Los Incas",
        "2580486",
        "MD La Esperanza",
        "pistas_veredas",
        (),
        AHORA,
    )
    expediente = expediente.adjuntar(
        DocumentoAdjunto(
            "doc-1", "exp.pdf", "expediente_tecnico", ("metrados", "presupuesto"), AHORA
        )
    )
    await repositorio.guardar(expediente)
    expediente = expediente.adjuntar(
        DocumentoAdjunto(
            "doc-2", "metrados.pdf", "metrados", ("metrados",), AHORA + timedelta(hours=1)
        )
    )
    await repositorio.guardar(expediente)
    await repositorio.guardar_evaluacion(evaluacion(expediente, 1))
    segunda = evaluacion(expediente, 2)
    await repositorio.guardar_evaluacion(segunda)

    assert await repositorio.obtener(expediente.id) == expediente
    assert await repositorio.ultima_evaluacion(expediente.id) == segunda
    assert await repositorio.obtener(IdExpediente(uuid4())) is None
