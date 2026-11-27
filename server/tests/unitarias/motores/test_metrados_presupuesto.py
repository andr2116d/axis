from decimal import Decimal

from axis.compartido.dominio.motores import EntradaMotor, PartidaUbicada, Severidad
from axis.compartido.dominio.partidas import Partida
from axis.compartido.dominio.valores import Fase
from axis.motores.metrados_presupuesto.inferencia import MotorMetradosPresupuesto, clave_item


def presupuesto(item, descripcion, unidad, cantidad, precio="10.00"):
    c, p = Decimal(cantidad), Decimal(precio)
    partida = Partida(4, item, descripcion, unidad, (c, p, c * p), c, p, c * p, True)
    return PartidaUbicada(partida, "presupuesto", "doc-exp")


def metrado(item, descripcion, unidad, *numeros):
    valores = tuple(Decimal(n) for n in numeros)
    partida = Partida(9, item, descripcion, unidad, valores, valores[0], None, None, None)
    return PartidaUbicada(partida, "metrados", "doc-exp")


async def evaluar(*partidas):
    entrada = EntradaMotor(
        "exp", Fase.EXPEDIENTE, None, frozenset({"metrados", "presupuesto"}), tuple(partidas)
    )
    return await MotorMetradosPresupuesto().evaluar(entrada)


def test_el_item_se_compara_sin_importar_ceros_ni_comas():
    assert clave_item("01.01.01") == clave_item("1.1.1") == clave_item("01,01,01") == "1.1.1"


async def test_si_coinciden_no_hay_hallazgo():
    assert (
        await evaluar(
            presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50"),
            metrado("02.01", "EXCAVACION DE ZANJAS PARA CIMIENTOS", "m3", "2", "60.25", "120.50"),
        )
        == []
    )


async def test_una_diferencia_grande_es_roja_y_dice_las_dos_paginas():
    (hallazgo,) = await evaluar(
        presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "180.00"),
        metrado("2.1", "EXCAVACION DE ZANJAS", "m3", "120.50", "120.50"),
    )

    assert hallazgo.severidad is Severidad.ROJO
    assert "180.00" in hallazgo.explicacion and "120.50" in hallazgo.explicacion
    assert "página 4" in hallazgo.explicacion and "página 9" in hallazgo.explicacion
    assert hallazgo.seccion == "presupuesto"


async def test_una_diferencia_de_redondeo_no_es_hallazgo():
    assert (
        await evaluar(
            presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50"),
            metrado("02.01", "EXCAVACION DE ZANJAS", "m3", "120.52"),
        )
        == []
    )


async def test_si_la_descripcion_no_se_parece_no_se_acusa():
    # Mismo ítem pero otra partida: probablemente el OCR leyó mal el código.
    hallazgos = await evaluar(
        presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "180.00"),
        metrado("02.01", "CONCRETO PARA LOSAS", "m3", "120.50"),
    )

    assert all(h.titulo.startswith("Partida sin metrado") for h in hallazgos)


async def test_partida_sin_metrado_solo_si_la_planilla_se_leyo_bien():
    planilla_completa = [
        metrado(f"01.0{i}", f"PARTIDA NUMERO {i} DE OBRA", "m2", "10") for i in range(1, 9)
    ]
    pres = [
        presupuesto(f"01.0{i}", f"PARTIDA NUMERO {i} DE OBRA", "m2", "10") for i in range(1, 10)
    ]

    hallazgos = await evaluar(*pres, *planilla_completa)

    assert [h.item for h in hallazgos] == ["01.09"]
    assert "sin metrado" in hallazgos[0].titulo
    # Si casi nada de la planilla se pudo leer, no se acusa a nadie de no sustentar.
    assert await evaluar(*pres, planilla_completa[0]) == []


async def test_una_diferencia_de_potencia_de_10_es_posible_coma_y_no_roja():
    (hallazgo,) = await evaluar(
        presupuesto("01.05.04", "TUBO RECTANGULAR DE ACERO", "m", "13632.00", "1.00"),
        metrado("01.05.04", "TUBO RECTANGULAR DE ACERO", "m", "136.32", "136.32"),
    )

    assert hallazgo.severidad is Severidad.AMBAR
    assert "coma corrida" in hallazgo.titulo
    assert hallazgo.confianza < 0.5


async def test_roja_solo_si_el_metrado_se_leyo_dos_veces_igual():
    confirmado = await evaluar(
        presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "180.00"),
        metrado("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50", "120.50"),
    )
    sin_confirmar = await evaluar(
        presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "180.00"),
        metrado("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50"),
    )

    assert confirmado[0].severidad is Severidad.ROJO
    assert sin_confirmar[0].severidad is Severidad.AMBAR


async def test_una_fila_del_presupuesto_que_no_cuadra_no_se_compara():
    fila = presupuesto("02.01", "EXCAVACION DE ZANJAS", "m3", "180.00")
    no_cuadra = PartidaUbicada(
        Partida(
            4,
            "02.01",
            "EXCAVACION DE ZANJAS",
            "m3",
            (),
            Decimal(180),
            Decimal(10),
            Decimal(99),
            False,
        ),
        "presupuesto",
        "doc-exp",
    )

    assert len(await evaluar(fila, metrado("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50"))) == 1
    assert await evaluar(no_cuadra, metrado("02.01", "EXCAVACION DE ZANJAS", "m3", "120.50")) == []
