import math
import random
from decimal import Decimal

from axis.compartido.dominio.motores import EntradaMotor, PartidaUbicada, Severidad
from axis.compartido.dominio.partidas import Partida
from axis.compartido.dominio.valores import Fase
from axis.motores.precio_atipico.inferencia import MotorPrecioAtipico, severidad_de
from axis.motores.precio_atipico.modelo import (
    Comparacion,
    Grupo,
    PrecioObservado,
    Umbrales,
    actividad,
    alcance,
    entrenar,
    medida,
    objeto,
)


def base(r=None):
    """Precios reales simulados: 12 obras, tres partidas con su precio típico y algo de ruido."""
    r = r or random.Random(1)
    tipicos = [
        ("ELIMINACION DE MATERIAL EXCEDENTE CON EQUIPO", "m3", 14.5),
        ("TRAZO Y REPLANTEO PRELIMINAR", "m2", 1.6),
        ("ACERO CORRUGADO FY=4200 KG/CM2 GRADO 60", "kg", 6.5),
    ]
    return [
        PrecioObservado(
            f"{d} {r.choice(['', 'EN PISTAS', 'DE OBRA'])}".strip(),
            u,
            p * r.uniform(0.9, 1.1),
            f"obra-{i}",
        )
        for i in range(12)
        for d, u, p in tipicos
    ]


def motor():
    modelo = entrenar(
        base(),
        distancia_maxima=0.6,
        minimo_precios=5,
        minimo_obras=3,
        similitud_minima=0.5,
        dispersion_minima=0.1,
        umbrales=Umbrales(veces_minimas=1.5, desvios_ambar=3.5, desvios_rojo=6.0),
    )
    return MotorPrecioAtipico(modelo, "prueba")


def partida(descripcion, unidad, precio, cantidad="10", cuadra=True):
    precio_d, cantidad_d = Decimal(str(precio)), Decimal(cantidad)
    return Partida(
        3, "02.01", descripcion, unidad, (), cantidad_d, precio_d, cantidad_d * precio_d, cuadra
    )


async def evaluar(*partidas):
    entrada = EntradaMotor(
        "doc",
        Fase.EXPEDIENTE,
        None,
        frozenset({"presupuesto"}),
        tuple(PartidaUbicada(p, "presupuesto") for p in partidas),
    )
    return await motor().evaluar(entrada)


async def test_un_precio_tres_veces_mayor_que_lo_usual_es_rojo_y_se_explica():
    (hallazgo,) = await evaluar(partida("ELIMINACION DE MATERIAL EXCEDENTE", "m3", 45.0))

    assert hallazgo.severidad is Severidad.ROJO
    assert "más caro" in hallazgo.titulo
    assert "12 obras" in hallazgo.explicacion
    assert hallazgo.item == "02.01"
    assert hallazgo.pagina == 3


async def test_un_precio_normal_no_genera_hallazgo():
    assert await evaluar(partida("ELIMINACION DE MATERIAL EXCEDENTE", "m3", 14.9)) == []


async def test_tambien_avisa_si_es_demasiado_barato():
    (hallazgo,) = await evaluar(partida("TRAZO Y REPLANTEO", "m2", 0.3))

    assert "más barato" in hallazgo.titulo


async def test_sin_partidas_parecidas_no_opina():
    assert await evaluar(partida("SUMINISTRO DE BOMBA SUMERGIBLE", "und", 99999)) == []


async def test_con_otra_unidad_no_compara():
    # El mismo trabajo en otra unidad no es comparable (m3 contra m2).
    assert await evaluar(partida("ELIMINACION DE MATERIAL EXCEDENTE", "m2", 45.0)) == []


async def test_una_fila_que_no_cuadra_no_se_acusa():
    # Si cantidad × precio no da el parcial, el precio leído puede ser un error de lectura.
    assert (
        await evaluar(partida("ELIMINACION DE MATERIAL EXCEDENTE", "m3", 45.0, cuadra=False)) == []
    )


async def test_las_partidas_globales_no_se_comparan():
    assert await evaluar(partida("MOVILIZACION Y DESMOVILIZACION DE EQUIPOS", "glb", 99000)) == []


def test_la_actividad_es_la_primera_palabra_con_contenido():
    assert actividad("REMOCIÓN DE CARPETA ASFÁLTICA") == "remocion"
    assert actividad("Nes 04 ELIMINACIÓN DE MATERIAL") == "eliminacion"
    assert actividad("CARPETA ASFALTICA EN CALIENTE") == "carpeta"


def test_el_alcance_distingue_material_de_mano_de_obra():
    assert alcance("SUMINISTRO E INSTALACION DE TUBERIA PVC") == "suministro_instalacion"
    assert alcance("INSTALACION TUBO PVC UF") == "instalacion"
    assert alcance("SEMBRADO DE GRASS INC. SUMINISTRO") == "suministro"
    assert alcance("EXCAVACION MASIVA A MAQUINA") == ""


def test_la_medida_es_la_que_define_el_precio():
    assert medida("TUBERIA PVC UF DN 160MM") == "dn160"
    assert medida("CONCRETO F'C=210 KG/CM2") == "fc210"
    assert medida('CARPETA ASFALTICA EN CALIENTE E=2"') == 'e2"'
    assert medida('TUBERIA PVC 1/2" INC. ACCESORIOS') == "pulg1/2"
    assert medida("TRAZO Y REPLANTEO") == ""


def test_una_tuberia_delgada_no_se_compara_con_una_gruesa():
    r = random.Random(3)
    gruesas = [
        PrecioObservado(
            "SUMINISTRO E INSTALACION DE TUBERIA PVC UF DN 200",
            "m",
            80 * r.uniform(0.9, 1.1),
            f"obra-{i}",
        )
        for i in range(8)
    ]
    modelo = entrenar(
        gruesas,
        distancia_maxima=0.6,
        minimo_precios=5,
        minimo_obras=3,
        similitud_minima=0.5,
        dispersion_minima=0.1,
        umbrales=Umbrales(veces_minimas=1.5, desvios_ambar=3.5, desvios_rojo=6.0),
    )

    assert modelo.comparar("SUMINISTRO E INSTALACION DE TUBERIA PVC UF DN 20", "m", 12.0) is None
    assert (
        modelo.comparar("SUMINISTRO E INSTALACION DE TUBERIA PVC UF DN 200", "m", 80.0) is not None
    )


def test_un_modelo_guardado_con_el_esquema_anterior_sigue_encontrando_sus_grupos():
    viejo = entrenar(
        base(),
        distancia_maxima=0.6,
        minimo_precios=5,
        minimo_obras=3,
        similitud_minima=0.5,
        dispersion_minima=0.1,
        umbrales=Umbrales(veces_minimas=1.5, desvios_ambar=3.5, desvios_rojo=6.0),
        esquema_clave=1,
    )
    # Así queda un modelo guardado antes de que existiera el campo: sin él en la instancia.
    del viejo.__dict__["esquema_clave"]

    assert viejo.comparar("TRAZO Y REPLANTEO PRELIMINAR", "m2", 1.6) is not None


def test_el_objeto_salta_los_verbos_de_alcance():
    assert objeto("SUMINISTRO E INSTALACION DE SEÑAL VERTICAL") == "senal"
    assert objeto("SUMINISTRO Y COLOCACIÓN DE TUBERIA PVC") == "tuberia"
    assert objeto("CURADO DE CONCRETO") == "curado"


def test_con_un_parecido_debil_un_precio_muy_distinto_es_ambar_no_rojo():
    grupo = Grupo("und", "SEÑAL DE SALIDA", 61, 7, math.log(9.56), 0.2, 8.6, 25.9)
    umbrales = Umbrales(veces_minimas=2.5, desvios_ambar=3.0, desvios_rojo=5.0)
    lejano = Comparacion(grupo, similitud=0.47, desvios=17.4, veces=32.2)
    cercano = Comparacion(grupo, similitud=0.9, desvios=17.4, veces=32.2)

    assert severidad_de(lejano, umbrales) is Severidad.AMBAR
    assert severidad_de(cercano, umbrales) is Severidad.ROJO
