"""Corre contra el Postgres de docker compose: `docker compose up -d postgres preparar`."""

import os
from dataclasses import replace
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import create_async_engine

from axis.compartido.dominio.valores import Fase
from axis.documentos.adaptadores.salida.postgres import (
    RepositorioCorreccionesPostgres,
    RepositorioDocumentosPostgres,
)
from axis.documentos.dominio.entidades import (
    Correccion,
    Documento,
    EvaluacionEdicion,
    Huella,
    Pagina,
    Parte,
    SenalEdicion,
)
from axis.documentos.dominio.partidas import Partida
from axis.documentos.dominio.valores import (
    Clasificacion,
    CodigoSenal,
    Etiqueta,
    IdCorreccion,
    IdDocumento,
    OrigenPagina,
    TipoArchivo,
    TipoDocumento,
)

pytestmark = pytest.mark.integracion

URL = os.environ.get("AXIS_BASE_DATOS_URL", "postgresql+asyncpg://axis:axis@localhost:5433/axis")


def documento(hash_contenido: str, version: str = "v1") -> Documento:
    momento = datetime(2026, 11, 27, 12, tzinfo=UTC)
    return Documento(
        id=IdDocumento(uuid4()),
        hash_contenido=hash_contenido,
        nombre_original="metrados.pdf",
        huella=Huella(
            TipoArchivo.PDF, 2048, "Microsoft Word", "iLovePDF", momento, momento, 2, 1, 1
        ),
        paginas=(
            Pagina(
                1,
                OrigenPagina.DIGITAL,
                "memoria\x00",
                595.0,
                842.0,
                Clasificacion(Etiqueta("memoria_descriptiva"), 0.91),
            ),
            Pagina(
                2,
                OrigenPagina.ESCANEADA,
                "metrados",
                595.0,
                842.0,
                Clasificacion(Etiqueta("metrados"), 0.8),
                confianza_ocr=0.77,
            ),
            Pagina(3, OrigenPagina.VACIA, "", 595.0, 842.0),
        ),
        partes=(
            Parte(Etiqueta("memoria_descriptiva"), 1, 1, 0.91),
            Parte(Etiqueta("metrados"), 2, 3, 0.8),
        ),
        tipo=TipoDocumento(Etiqueta("expediente_tecnico"), 0.88, Fase.EXPEDIENTE),
        edicion=EvaluacionEdicion(
            (SenalEdicion(CodigoSenal.ORIGEN_MEZCLADO, "páginas escaneadas", (2,)),), 0.97
        ),
        fase_subida=Fase.EXPEDIENTE,
        version_modelos=version,
        subido_en=momento,
        partidas=(
            Partida(
                1,
                "01",
                "OBRAS PROVISIONALES",
                None,
                (Decimal("3083.63"),),
                None,
                None,
                Decimal("3083.63"),
                None,
            ),
            Partida(
                2,
                "01.01",
                "CARTEL",
                "und",
                (Decimal("1.00"), Decimal("1883.63"), Decimal("1883.63")),
                Decimal("1.00"),
                Decimal("1883.63"),
                Decimal("1883.63"),
                True,
            ),
        ),
    )


@pytest.fixture
async def repositorio():
    motor = create_async_engine(URL)
    try:
        async with motor.connect():
            pass
    except OSError:
        pytest.skip("Postgres de docker compose no está levantado")
    yield RepositorioDocumentosPostgres(motor)
    await motor.dispose()


async def test_guarda_y_recupera_el_documento_completo(repositorio):
    original = documento(uuid4().hex)

    await repositorio.guardar(original)
    recuperado = await repositorio.obtener(original.id)

    # El carácter nulo no entra en Postgres: es lo único que cambia al guardar.
    esperado_paginas = (replace(original.paginas[0], texto="memoria"), *original.paginas[1:])
    assert recuperado is not None
    assert recuperado.paginas == esperado_paginas
    assert recuperado.partes == original.partes
    assert recuperado.huella == original.huella
    assert recuperado.edicion == original.edicion
    assert recuperado.tipo == original.tipo
    assert recuperado.partidas == original.partidas
    assert await repositorio.buscar_por_hash(original.hash_contenido) == recuperado


async def test_reanalizar_el_mismo_archivo_reemplaza_el_anterior(repositorio):
    hash_contenido = uuid4().hex
    primero = documento(hash_contenido, "v1")
    await repositorio.guardar(primero)

    await repositorio.guardar(documento(hash_contenido, "v2"))

    assert await repositorio.obtener(primero.id) is None
    actual = await repositorio.buscar_por_hash(hash_contenido)
    assert actual is not None
    assert actual.version_modelos == "v2"


@pytest.fixture
async def correcciones():
    motor = create_async_engine(URL)
    try:
        async with motor.connect():
            pass
    except OSError:
        pytest.skip("Postgres de docker compose no está levantado")
    yield RepositorioCorreccionesPostgres(motor)
    await motor.dispose()


async def test_las_correcciones_se_listan_por_archivo_en_orden(correcciones):
    hash_contenido = uuid4().hex
    base = datetime(2026, 11, 27, 12, tzinfo=UTC)
    segunda = Correccion(
        IdCorreccion(uuid4()),
        hash_contenido,
        None,
        Etiqueta("bases"),
        Etiqueta("tdr"),
        Fase.SELECCION,
        "v1",
        base.replace(minute=5),
    )
    primera = Correccion(
        IdCorreccion(uuid4()),
        hash_contenido,
        3,
        Etiqueta("bases"),
        Etiqueta("cotizacion"),
        None,
        "v1",
        base,
    )
    await correcciones.guardar(segunda)
    await correcciones.guardar(primera)

    assert await correcciones.listar(hash_contenido) == [primera, segunda]
    assert await correcciones.listar(uuid4().hex) == []
