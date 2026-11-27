import pytest

from axis.normativa.adaptadores.salida.falsos import (
    CacheEnMemoria,
    LectorCaido,
    LectorPorFuncion,
    RepositorioNormativaEnMemoria,
)
from axis.normativa.aplicacion.casos_de_uso.citar import CitarNormativa
from axis.normativa.aplicacion.casos_de_uso.indexar_norma import IndexarNorma
from axis.normativa.aplicacion.dto import CitaPropuesta, OrdenCitar, OrdenIndexarNorma
from axis.normativa.dominio.errores import ConsultaVacia, NormaSinFragmentos
from axis.normativa.dominio.servicios import es_extracto_literal, partir_en_fragmentos
from axis.normativa.dominio.valores import Norma, OrigenCita, Pertinencia, TipoNorma

LEY = Norma("ley_x", "Ley de prueba", TipoNorma.LEY, "2026-07-19")
REGLAMENTO = Norma("reg_x", "Reglamento de prueba", TipoNorma.REGLAMENTO, "2026-01-09")

TEXTO_LEY = """\
DECRETO QUE APRUEBA
Artículo 1.- Aprobación
Apruébase el reglamento.

                TÍTULO I
          DISPOSICIONES GENERALES

Artículo 1. Objeto de la Ley
La presente ley regula la contratación de obras públicas.

Artículo 2. Expediente técnico de obra y
su aprobación

2.1. La entidad aprueba el expediente técnico antes de convocar.
Esta línea sigue
en el mismo párrafo.

2.2. El metrado y el presupuesto deben ser coherentes entre sí.

                CAPÍTULO I
             PLAZOS DE OBRA

Artículo 3. Ampliación de plazo
Procede la ampliación de plazo por atrasos no imputables al contratista.

(*) Artículo modificado por el Decreto Supremo N° 001-2026-EF, cuyo texto es el siguiente:
Artículo 3. Ampliación de plazo
Procede la ampliación de plazo por paralización o atrasos no imputables al contratista.

              DISPOSICIONES COMPLEMENTARIAS FINALES

PRIMERA. Vigencia
La presente ley entra en vigencia a los noventa días.

DÉCIMA PRIMERA. Implementación
Se implementa de forma progresiva.

FE DE ERRATAS
“Artículo 2. Expediente técnico de obra
Texto citado entre comillas que no es un artículo nuevo.
"""

TEXTO_REGLAMENTO = """\
TÍTULO I
DISPOSICIONES

Artículo 197. Mayores metrados en obras
197.1. Cuando se requiera ejecutar mayores metrados, el contratista solicita su ejecución
mediante anotación en el cuaderno de obra.
"""


def fragmentos():
    return {f.clave: f for f in partir_en_fragmentos(LEY, TEXTO_LEY)}


def test_parte_la_ley_en_articulos_y_disposiciones_desde_el_titulo_i():
    claves = list(fragmentos())

    assert claves == ["art-1", "art-2", "art-3", "art-3~2", "dcf-primera", "dcf-decima-primera"]


def test_el_titulo_largo_sigue_en_minuscula_y_el_cuerpo_queda_en_parrafos():
    articulo = fragmentos()["art-2"]

    assert articulo.titulo == "Expediente técnico de obra y su aprobación"
    assert articulo.texto.split("\n\n") == [
        "2.1. La entidad aprueba el expediente técnico antes de convocar. Esta línea sigue "
        "en el mismo párrafo.",
        "2.2. El metrado y el presupuesto deben ser coherentes entre sí.",
    ]


def test_el_cuerpo_empieza_en_la_linea_siguiente_aunque_no_haya_linea_en_blanco():
    articulo = fragmentos()["art-1"]

    assert (articulo.titulo, articulo.texto) == (
        "Objeto de la Ley",
        "La presente ley regula la contratación de obras públicas.",
    )


def test_cada_articulo_sabe_en_que_titulo_y_capitulo_esta():
    assert fragmentos()["art-3"].ubicacion == (
        "TÍTULO I — DISPOSICIONES GENERALES",
        "CAPÍTULO I — PLAZOS DE OBRA",
    )


def test_el_texto_modificado_se_guarda_aparte_y_se_dice():
    modificado = fragmentos()["art-3~2"]

    assert modificado.etiqueta == "Artículo 3 (texto modificado)"
    assert "paralización" in modificado.texto


def test_las_disposiciones_llevan_su_nombre_completo():
    assert fragmentos()["dcf-decima-primera"].etiqueta == (
        "Décima primera Disposición Complementaria Final"
    )


def test_un_texto_sin_articulos_no_se_indexa():
    with pytest.raises(NormaSinFragmentos):
        partir_en_fragmentos(LEY, "TÍTULO I\nSolo prosa sin artículos.")


@pytest.mark.parametrize(
    ("extracto", "esperado"),
    [
        ("El metrado y el presupuesto deben ser coherentes entre sí.", True),
        ("EL METRADO   y el presupuesto deben ser coherentes", True),
        ("La entidad aprueba el expediente técnico (...) El metrado y el presupuesto", True),
        ("El metrado y el presupuesto deben coincidir siempre.", False),
        ("El metrado (...) La entidad aprueba", False),  # el orden importa
        ("presupuesto", False),  # muy corto para ser una cita
    ],
)
def test_solo_es_cita_lo_que_esta_literal_en_el_texto(extracto, esperado):
    texto = fragmentos()["art-2"].texto

    assert es_extracto_literal(extracto, texto) is esperado


@pytest.fixture
async def repositorio():
    repositorio = RepositorioNormativaEnMemoria()
    indexar = IndexarNorma(repositorio=repositorio)
    await indexar.ejecutar(OrdenIndexarNorma(LEY, TEXTO_LEY))
    await indexar.ejecutar(OrdenIndexarNorma(REGLAMENTO, TEXTO_REGLAMENTO))
    return repositorio


def propuestas(*citas):
    return lambda _consulta: [CitaPropuesta(*c) for c in citas]


ORDEN = OrdenCitar("¿Qué pasa si hay mayores metrados?", "La obra necesita mayores metrados.")


async def test_el_lector_lee_la_ley_entera_y_solo_candidatos_del_reglamento(repositorio):
    lector = LectorPorFuncion(propuestas())
    caso = CitarNormativa(repositorio=repositorio, lector=lector, cache=CacheEnMemoria())

    await caso.ejecutar(ORDEN)

    consulta = lector.consultas[0]
    assert {f.id_norma for f in consulta.leyes} == {"ley_x"}
    assert [f.id for f in consulta.candidatos] == ["reg_x:art-197"]
    assert consulta.nombres["reg_x"] == "Reglamento de prueba"


async def test_se_descartan_citas_inventadas_o_parafraseadas(repositorio):
    lector = LectorPorFuncion(
        propuestas(
            (
                "reg_x:art-197",
                "el contratista solicita su ejecución mediante anotación",
                "Regula el caso.",
                Pertinencia.ALTA,
            ),
            (
                "reg_x:art-999",
                "un artículo que no existe en lo que se le dio",
                "Inventado.",
                Pertinencia.ALTA,
            ),
            (
                "ley_x:art-2",
                "el metrado debe coincidir con el presupuesto siempre",
                "Parafraseado.",
                Pertinencia.MEDIA,
            ),
        )
    )
    caso = CitarNormativa(repositorio=repositorio, lector=lector, cache=CacheEnMemoria())

    respuesta = await caso.ejecutar(ORDEN)

    assert [c.fragmento.id for c in respuesta.citas] == ["reg_x:art-197"]
    assert respuesta.descartadas == 2
    assert respuesta.citas[0].nombre_norma == "Reglamento de prueba"
    assert respuesta.origen is OrigenCita.LECTOR


async def test_las_citas_de_pertinencia_alta_van_primero(repositorio):
    lector = LectorPorFuncion(
        propuestas(
            (
                "ley_x:art-2",
                "El metrado y el presupuesto deben ser coherentes entre sí.",
                "Enmarca.",
                Pertinencia.MEDIA,
            ),
            (
                "reg_x:art-197",
                "el contratista solicita su ejecución mediante anotación",
                "Regula.",
                Pertinencia.ALTA,
            ),
        )
    )
    caso = CitarNormativa(repositorio=repositorio, lector=lector, cache=CacheEnMemoria())

    respuesta = await caso.ejecutar(ORDEN)

    assert [c.pertinencia for c in respuesta.citas] == [Pertinencia.ALTA, Pertinencia.MEDIA]


async def test_si_el_lector_no_responde_se_dan_coincidencias_marcadas_como_tales(repositorio):
    caso = CitarNormativa(repositorio=repositorio, lector=LectorCaido(), cache=CacheEnMemoria())

    respuesta = await caso.ejecutar(ORDEN)

    assert respuesta.origen is OrigenCita.BUSQUEDA
    assert respuesta.citas[0].fragmento.id == "reg_x:art-197"
    assert "Ningún modelo lo leyó" in respuesta.citas[0].razon
    assert es_extracto_literal(respuesta.citas[0].extracto, respuesta.citas[0].fragmento.texto)


async def test_la_misma_consulta_no_se_vuelve_a_leer(repositorio):
    lector = LectorPorFuncion(propuestas())
    caso = CitarNormativa(repositorio=repositorio, lector=lector, cache=CacheEnMemoria())

    await caso.ejecutar(ORDEN)
    segunda = await caso.ejecutar(ORDEN)

    assert len(lector.consultas) == 1
    assert segunda.desde_cache


async def test_reindexar_invalida_las_respuestas_guardadas(repositorio):
    lector = LectorPorFuncion(propuestas())
    caso = CitarNormativa(repositorio=repositorio, lector=lector, cache=CacheEnMemoria())
    await caso.ejecutar(ORDEN)

    await IndexarNorma(repositorio=repositorio).ejecutar(OrdenIndexarNorma(LEY, TEXTO_LEY))
    await caso.ejecutar(ORDEN)

    assert len(lector.consultas) == 2


async def test_las_respuestas_por_busqueda_no_se_guardan(repositorio):
    cache = CacheEnMemoria()
    caso = CitarNormativa(repositorio=repositorio, lector=LectorCaido(), cache=cache)

    await caso.ejecutar(ORDEN)
    segunda = await caso.ejecutar(ORDEN)

    assert not segunda.desde_cache


async def test_una_consulta_vacia_no_se_acepta(repositorio):
    caso = CitarNormativa(repositorio=repositorio, lector=None, cache=CacheEnMemoria())

    with pytest.raises(ConsultaVacia):
        await caso.ejecutar(OrdenCitar("   "))
