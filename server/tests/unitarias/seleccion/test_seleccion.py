from datetime import date
from decimal import Decimal

import pytest

from axis.compartido.dominio.motores import Severidad
from axis.documentos.adaptadores.salida.falsos import RelojFijo
from axis.seleccion.adaptadores.salida.falsos import AntecedentesFijos, ProcesosFijos
from axis.seleccion.aplicacion.casos_de_uso.buscar_procesos import BuscarProcesos
from axis.seleccion.aplicacion.casos_de_uso.revisar_proceso import RevisarProceso
from axis.seleccion.aplicacion.dto import OrdenRevisarProceso
from axis.seleccion.dominio.errores import ProcesoNoEncontrado
from axis.seleccion.dominio.valores import (
    Antecedente,
    FuenteAntecedentes,
    Postor,
    Proceso,
    TipoAntecedente,
)

CONVOCATORIA = date(2026, 10, 6)
FUENTE = FuenteAntecedentes("Registro del OECE", date(2025, 3, 8))
INHABILITADO = "20477530665"
CON_ANTECEDENTE = "20542169550"
PENALIZADO = "20100000001"
LIMPIO = "20600000002"


def proceso(*postores):
    return Proceso(
        "1255290",
        "LP-1-2026",
        "MUNICIPALIDAD",
        "OBRA",
        Decimal("1000000"),
        "2718025",
        CONVOCATORIA,
        postores,
    )


def inhabilitacion(ruc, motivo, inicio, fin):
    return Antecedente(ruc, TipoAntecedente.INHABILITACION, motivo, inicio, fin, "123-2024-TCE-S1")


ANTECEDENTES = [
    inhabilitacion(
        INHABILITADO,
        "i) Presentar información inexacta a las Entidades",
        date(2023, 11, 15),
        date(2027, 3, 15),
    ),
    inhabilitacion(
        CON_ANTECEDENTE,
        "Presentar documentos falsos o adulterados",
        date(2021, 1, 1),
        date(2022, 1, 1),
    ),
    Antecedente(
        PENALIZADO,
        TipoAntecedente.PENALIDAD,
        "Retraso injustificado",
        date(2024, 5, 1),
        date(2024, 5, 1),
        monto=Decimal("12000"),
        entidad="MUNICIPALIDAD DE TRUJILLO",
        objeto="Obra",
    ),
    # Una sanción posterior a la convocatoria no cuenta para ese proceso.
    inhabilitacion(
        LIMPIO, "Ocasionar que la Entidad resuelva el contrato", date(2026, 12, 1), date(2027, 6, 1)
    ),
]


def caso(*postores, antecedentes=ANTECEDENTES):
    reloj = RelojFijo()
    return RevisarProceso(
        procesos=ProcesosFijos(proceso(*postores)),
        antecedentes=AntecedentesFijos(antecedentes, FUENTE),
        reloj=reloj,
    )


def reglas(revision, ruc):
    postor = next(p for p in revision.postores if p.postor.identificador == ruc)
    return {h.metadatos["regla"]: h for h in postor.hallazgos}


async def test_un_postor_inhabilitado_a_la_fecha_de_convocatoria_es_rojo_y_cita_la_resolucion():
    revision = await caso(Postor(INHABILITADO, "CONSTRUCTORA X SAC")).ejecutar(
        OrdenRevisarProceso("1255290")
    )

    hallazgo = reglas(revision, INHABILITADO)["inhabilitacion_vigente"]
    assert hallazgo.severidad is Severidad.ROJO
    assert any("123-2024-TCE-S1" in f.nombre for f in hallazgo.factores)
    assert any("corte 08/03/2025" in f.valor for f in hallazgo.factores)


async def test_una_sancion_cumplida_por_documentos_falsos_es_ambar_y_pide_revisar_al_personal():
    revision = await caso(Postor(CON_ANTECEDENTE, "CONTRATISTA Y")).ejecutar(
        OrdenRevisarProceso("1255290")
    )

    hallazgo = reglas(revision, CON_ANTECEDENTE)["antecedente_informacion_inexacta"]
    assert hallazgo.severidad is Severidad.AMBAR
    assert "personal clave" in hallazgo.explicacion


async def test_las_penalidades_se_suman_y_dicen_quien_las_aplico():
    revision = await caso(Postor(PENALIZADO, "EMPRESA Z")).ejecutar(OrdenRevisarProceso("1255290"))

    factores = {
        f.nombre: f.valor for f in reglas(revision, PENALIZADO)["penalidades_previas"].factores
    }
    assert factores["Monto total"] == "S/ 12,000.00"
    assert factores["Aplicada por"] == "MUNICIPALIDAD DE TRUJILLO"


async def test_lo_posterior_a_la_convocatoria_no_cuenta_y_sin_antecedentes_no_hay_hallazgos():
    revision = await caso(Postor(LIMPIO, "LIMPIA SAC")).ejecutar(OrdenRevisarProceso("1255290"))

    assert revision.postores[0].hallazgos == ()
    assert revision.postores[0].revisado


async def test_un_consorcio_sin_ruc_se_dice_no_revisado():
    revision = await caso(Postor("1642741", "CONSORCIO SAN FERNANDO")).ejecutar(
        OrdenRevisarProceso("1255290")
    )

    postor = revision.postores[0]
    assert (postor.revisado, postor.postor.es_consorcio, postor.hallazgos) == (False, True, ())


async def test_el_ganador_y_los_rojos_van_primero():
    revision = await caso(
        Postor(PENALIZADO, "EMPRESA Z"),
        Postor(INHABILITADO, "CONSTRUCTORA X SAC"),
        Postor(LIMPIO, "LIMPIA SAC", ganador=True),
    ).ejecutar(OrdenRevisarProceso("1255290"))

    assert [p.postor.identificador for p in revision.postores] == [LIMPIO, INHABILITADO, PENALIZADO]


async def test_se_puede_revisar_a_otra_fecha():
    revision = await caso(Postor(INHABILITADO, "CONSTRUCTORA X SAC")).ejecutar(
        OrdenRevisarProceso("1255290", al_dia=date(2027, 4, 1))
    )

    assert "inhabilitacion_vigente" not in reglas(revision, INHABILITADO)
    assert "antecedente_informacion_inexacta" in reglas(revision, INHABILITADO)


async def test_cada_hallazgo_tiene_su_propia_clave():
    revision = await caso(Postor(INHABILITADO, "X"), Postor(PENALIZADO, "Z")).ejecutar(
        OrdenRevisarProceso("1255290")
    )

    claves = [h.clave for h in revision.hallazgos]
    assert len(claves) == len(set(claves))


async def test_un_proceso_que_no_existe():
    with pytest.raises(ProcesoNoEncontrado):
        await caso().ejecutar(OrdenRevisarProceso("no-existe"))


async def test_se_busca_por_nomenclatura_y_con_menos_de_3_letras_no_busca():
    caso = BuscarProcesos(procesos=ProcesosFijos(proceso()))

    assert [p.id for p in await caso.ejecutar("lp-1")] == ["1255290"]
    assert await caso.ejecutar("lp") == ()
