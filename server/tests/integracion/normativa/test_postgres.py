import os

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from axis.normativa.adaptadores.salida.postgres import (
    CacheRespuestasPostgres,
    RepositorioNormativaPostgres,
    normas,
)
from axis.normativa.dominio.servicios import partir_en_fragmentos
from axis.normativa.dominio.valores import (
    Cita,
    Norma,
    OrigenCita,
    Pertinencia,
    RespuestaNormativa,
    TipoNorma,
)

pytestmark = pytest.mark.integracion
URL = os.environ.get("AXIS_BASE_DATOS_URL", "postgresql+asyncpg://axis:axis@localhost:5433/axis")
LEY = Norma("prueba_ley", "Ley de prueba", TipoNorma.LEY, "2026-07-19")
REGLAMENTO = Norma("prueba_reg", "Reglamento de prueba", TipoNorma.REGLAMENTO, "2026-01-09")
TEXTO_LEY = """TÍTULO I
GENERAL

Artículo 1. Objeto
La ley regula la contratación pública de obras.
"""
TEXTO_REGLAMENTO = """TÍTULO I
OBRAS

Artículo 10. Mayores metrados en obras
Cuando se requieran MAYORES METRADOS, el contratista lo anota en el cuaderno de obra.

Artículo 11. Ampliación de plazo
La ampliación de plazo procede por atrasos no imputables al contratista.
"""


@pytest.fixture
async def motor():
    motor = create_async_engine(URL)
    try:
        async with motor.connect():
            pass
    except OSError:
        pytest.skip("Postgres de docker compose no está levantado")
    repositorio = RepositorioNormativaPostgres(motor)
    await repositorio.reemplazar(LEY, partir_en_fragmentos(LEY, TEXTO_LEY))
    await repositorio.reemplazar(REGLAMENTO, partir_en_fragmentos(REGLAMENTO, TEXTO_REGLAMENTO))
    yield motor
    async with motor.begin() as conexion:
        await conexion.execute(normas.delete().where(normas.c.id.like("prueba_%")))
    await motor.dispose()


async def test_busca_sin_tildes_ni_mayusculas_y_excluye_por_tipo(motor):
    repositorio = RepositorioNormativaPostgres(motor)

    encontrados = await repositorio.buscar(
        "¿qué hago con los mayores metrados de la obra?",
        excluir=frozenset({TipoNorma.LEY}),
        limite=5,
    )

    ids = [f.id for f in encontrados]
    assert "prueba_reg:art-10" in ids
    assert "prueba_reg:art-11" not in ids  # no comparte palabras con la consulta
    assert "prueba_ley:art-1" not in ids


async def test_la_ley_se_lee_entera_y_en_orden(motor):
    repositorio = RepositorioNormativaPostgres(motor)

    leyes = await repositorio.fragmentos_de_tipo(TipoNorma.LEY)

    assert [f.id for f in leyes if f.id_norma == "prueba_ley"] == ["prueba_ley:art-1"]


async def test_la_respuesta_guardada_vuelve_con_sus_fragmentos(motor):
    repositorio = RepositorioNormativaPostgres(motor)
    cache = CacheRespuestasPostgres(motor, repositorio)
    fragmento = await repositorio.obtener("prueba_reg:art-10")
    respuesta = RespuestaNormativa(
        citas=(
            Cita(
                fragmento,
                "Reglamento de prueba",
                "el contratista lo anota",
                "Aplica.",
                Pertinencia.ALTA,
                OrigenCita.LECTOR,
            ),
        ),
        origen=OrigenCita.LECTOR,
        lector="modelo",
        descartadas=1,
        duracion_ms=900,
    )

    await cache.guardar("clave-prueba", respuesta)

    assert await cache.obtener("clave-prueba") == respuesta
    assert await cache.obtener("otra-clave") is None


async def test_reindexar_cambia_la_version(motor):
    repositorio = RepositorioNormativaPostgres(motor)
    antes = await repositorio.version()

    await repositorio.reemplazar(
        LEY, partir_en_fragmentos(LEY, TEXTO_LEY.replace("obras", "obras y servicios"))
    )

    assert await repositorio.version() != antes
