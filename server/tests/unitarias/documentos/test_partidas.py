from decimal import Decimal

import pytest

from axis.compartido.dominio.partidas import Palabra, extraer_partidas, numero


def fila(y, *celdas):
    """celdas: (x, texto). Cada palabra mide 6 pt de alto, como una fuente de 8."""
    return [Palabra(t, x, y, x + 6 * len(t), y + 6) for x, t in celdas]


def palabras(*filas):
    return [p for f in filas for p in f]


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("1,883.63", "1883.63"),
        ("1.883,63", "1883.63"),
        ("2921.93", "2921.93"),
        ("1,00", "1.00"),
        ("1,500", "1500"),
        ("(1,200.00)", "-1200.00"),
        ("18%", "18"),
        ("S/", None),
        ("und", None),
        ("3.60X4.80M", None),
    ],
)
def test_lee_numeros_en_los_formatos_de_los_presupuestos(texto, esperado):
    assert numero(texto) == (Decimal(esperado) if esperado else None)


def test_lee_una_partida_s10_y_verifica_que_cuadra():
    resultado = extraer_partidas(
        1,
        fila(
            100,
            (52, "01.02.03"),
            (104, "DEMOLICION"),
            (150, "DE"),
            (165, "SARDINELES"),
            (246, "m"),
            (289, "73.50"),
            (329, "14.76"),
            (527, "1,084.86"),
        ),
    )

    (partida,) = resultado
    assert (partida.item, partida.descripcion, partida.unidad) == (
        "01.02.03",
        "DEMOLICION DE SARDINELES",
        "m",
    )
    assert (partida.cantidad, partida.precio_unitario, partida.parcial) == (
        Decimal("73.50"),
        Decimal("14.76"),
        Decimal("1084.86"),
    )
    assert partida.cuadra is True


def test_en_el_desagregado_toma_cantidad_precio_y_el_parcial_del_final():
    # Entre el precio y el parcial vienen mano de obra, material y equipo.
    (partida,) = extraer_partidas(
        1,
        fila(
            100,
            (52, "01.02.04"),
            (104, "TRAZO"),
            (246, "m2"),
            (284, "2,409.81"),
            (331, "1.41"),
            (357, "1,403.48"),
            (389, "1,564.92"),
            (428, "427.50"),
            (527, "3,397.83"),
        ),
    )

    assert partida.parcial == Decimal("3397.83")
    assert partida.cuadra


def test_un_parcial_que_no_es_cantidad_por_precio_no_cuadra():
    (partida,) = extraer_partidas(
        1,
        fila(
            100,
            (52, "01.01"),
            (104, "TRAZO"),
            (246, "m2"),
            (284, "100.00"),
            (331, "2.00"),
            (527, "250.00"),
        ),
    )

    assert partida.cuadra is False


def test_un_titulo_sin_unidad_queda_como_titulo_con_su_subtotal():
    (titulo,) = extraer_partidas(
        1, fila(100, (52, "01.02"), (101, "TRABAJOS"), (140, "PRELIMINARES"), (525, "10,858.51"))
    )

    assert titulo.es_titulo
    assert titulo.parcial == Decimal("10858.51")
    assert titulo.cuadra is None


def test_la_descripcion_que_sigue_en_la_linea_de_abajo_se_une():
    resultado = extraer_partidas(
        1,
        palabras(
            fila(
                100,
                (52, "01.02.01"),
                (104, "MOVILIZACION"),
                (180, "A"),
                (190, "LA"),
                (246, "glb"),
                (291, "1.00"),
                (324, "4,200.00"),
                (527, "4,200.00"),
            ),
            fila(108, (98, "OBRA")),
        ),
    )

    assert resultado[0].descripcion == "MOVILIZACION A LA OBRA"


def test_unidades_con_superindice_y_moneda_suelta():
    (partida,) = extraer_partidas(
        1,
        fila(
            100,
            (67, "01.02"),
            (90, "ALMACEN"),
            (350, "m²"),
            (370, "75.00"),
            (400, "100.93"),
            (430, "S/"),
            (445, "7,569.75"),
        ),
    )

    assert (partida.unidad, partida.parcial, partida.cuadra) == ("m2", Decimal("7569.75"), True)


def test_las_filas_se_arman_por_altura_aunque_las_palabras_vengan_desordenadas():
    desordenadas = list(
        reversed(
            fila(
                100,
                (52, "02.01"),
                (104, "CORTE"),
                (246, "m"),
                (288, "308.65"),
                (331, "6.60"),
                (527, "2,037.09"),
            )
        )
    )

    (partida,) = extraer_partidas(1, desordenadas)

    assert partida.cuadra


def test_un_texto_comun_o_un_numero_de_pagina_no_son_partidas():
    resultado = extraer_partidas(
        1,
        palabras(
            fila(100, (52, "10"), (90, "de"), (110, "45")),
            fila(120, (52, "La"), (70, "obra"), (100, "comprende"), (160, "120"), (190, "días")),
        ),
    )

    assert resultado == ()


def test_en_un_escaneo_torcido_manda_la_linea_del_ocr():
    # La fila baja 8 pt de izquierda a derecha: por altura, el parcial caería en otra fila.
    torcida = [
        Palabra("01.01.01", 26, 100, 60, 106, linea=7),
        Palabra("FLETE", 84, 101, 110, 107, linea=7),
        Palabra("GL8", 236, 104, 250, 110, linea=7),
        Palabra("1.00", 285, 105, 300, 111, linea=7),
        Palabra("33,898.31", 317, 106, 350, 112, linea=7),
        Palabra("33,898.31", 357, 108, 390, 114, linea=7),
        Palabra("01,01.02", 26, 110, 60, 116, linea=8),
        Palabra("ALQUILER", 84, 111, 120, 117, linea=8),
        Palabra("mes", 235, 114, 250, 120, linea=8),
        Palabra("3.00", 285, 115, 300, 121, linea=8),
        Palabra("762.71", 317, 116, 345, 122, linea=8),
        Palabra("2,288.13", 357, 118, 390, 124, linea=8),
    ]

    primera, segunda = extraer_partidas(1, torcida)

    assert (primera.item, primera.unidad, primera.cuadra) == ("01.01.01", "glb", True)
    assert (segunda.item, segunda.unidad, segunda.cuadra) == ("01.01.02", "mes", True)
