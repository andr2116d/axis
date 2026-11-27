from datetime import UTC, datetime, timedelta

from axis.documentos.dominio.entidades import Huella, Pagina
from axis.documentos.dominio.servicios import clasificar_origen, detectar_senales, segmentar
from axis.documentos.dominio.valores import (
    Clasificacion,
    CodigoSenal,
    Etiqueta,
    FuenteClasificacion,
    OrigenPagina,
    TipoArchivo,
)

A4 = (595.0, 842.0)


def pagina(numero, etiqueta=None, confianza=0.9, origen=OrigenPagina.DIGITAL, tamano=A4):
    clasificacion = Clasificacion(Etiqueta(etiqueta), confianza) if etiqueta else None
    return Pagina(numero, origen, "texto", tamano[0], tamano[1], clasificacion)


def huella(**cambios):
    base = {
        "tipo_archivo": TipoArchivo.PDF,
        "tamano_bytes": 1000,
        "programa_creador": "Microsoft® Word 2019",
        "programa_productor": "Microsoft® Word 2019",
        "creado_en": datetime(2026, 1, 1, tzinfo=UTC),
        "modificado_en": datetime(2026, 1, 1, tzinfo=UTC),
        "revisiones": 1,
        "firmas": 0,
        "firmas_que_no_cubren_todo": 0,
    }
    return Huella(**(base | cambios))


def test_pagina_con_imagen_y_sin_texto_es_escaneada():
    assert clasificar_origen(caracteres=3, cobertura_imagen=0.95) is OrigenPagina.ESCANEADA


def test_escaneo_con_capa_de_texto_es_mixta():
    assert clasificar_origen(caracteres=900, cobertura_imagen=0.95) is OrigenPagina.MIXTA


def test_pagina_con_texto_y_sin_imagen_grande_es_digital():
    assert clasificar_origen(caracteres=40, cobertura_imagen=0.1) is OrigenPagina.DIGITAL


def test_segmenta_paginas_seguidas_del_mismo_tipo():
    paginas = [
        pagina(1, "memoria"),
        pagina(2, "memoria"),
        pagina(3, "metrados"),
        pagina(4, "metrados"),
        pagina(5, "metrados"),
    ]

    partes = segmentar(paginas)

    assert [(p.etiqueta, p.desde, p.hasta) for p in partes] == [
        ("memoria", 1, 2),
        ("metrados", 3, 5),
    ]


def test_pagina_suelta_y_dudosa_entre_dos_iguales_no_abre_parte_nueva():
    paginas = [pagina(1, "metrados"), pagina(2, "presupuesto", 0.4), pagina(3, "metrados")]

    partes = segmentar(paginas)

    assert [(p.etiqueta, p.desde, p.hasta) for p in partes] == [("metrados", 1, 3)]


def test_pagina_vacia_continua_la_parte_anterior():
    paginas = [pagina(1, "planos"), pagina(2, origen=OrigenPagina.VACIA), pagina(3, "planos")]

    assert [(p.desde, p.hasta) for p in segmentar(paginas)] == [(1, 3)]


def test_archivo_recien_exportado_no_tiene_senales():
    assert detectar_senales(huella(), [pagina(i) for i in range(1, 5)]) == ()


def test_modificado_dias_despues_de_crearse_es_senal():
    modificado = huella(modificado_en=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=3))

    senales = detectar_senales(modificado, [pagina(1)])

    assert [s.codigo for s in senales] == [CodigoSenal.MODIFICADO_TRAS_CREACION]
    assert "3 días" in senales[0].descripcion


def test_paginas_escaneadas_dentro_de_un_digital_se_senalan_con_su_numero():
    paginas = [pagina(1), pagina(2), pagina(3, origen=OrigenPagina.ESCANEADA), pagina(4), pagina(5)]

    senales = detectar_senales(huella(), paginas)

    assert senales[0].codigo is CodigoSenal.ORIGEN_MEZCLADO
    assert senales[0].paginas == (3,)


def test_mismo_programa_con_otra_version_no_es_programa_distinto():
    h = huella(programa_creador="Microsoft® Word 2016", programa_productor="Microsoft Word")

    assert detectar_senales(h, [pagina(1)]) == ()


def test_programa_distinto_y_firma_parcial_se_reportan():
    h = huella(programa_productor="iLovePDF", firmas=1, firmas_que_no_cubren_todo=1)

    codigos = {s.codigo for s in detectar_senales(h, [pagina(1)])}

    assert codigos == {CodigoSenal.PROGRAMA_DISTINTO, CodigoSenal.FIRMA_NO_CUBRE_TODO}


def test_hoja_apaisada_es_el_mismo_papel():
    paginas = [pagina(1), pagina(2, tamano=(842.0, 595.0)), pagina(3)]

    assert detectar_senales(huella(), paginas) == ()


def test_el_suavizado_no_deshace_una_correccion():
    corregida = Pagina(
        2,
        OrigenPagina.DIGITAL,
        "t",
        595.0,
        842.0,
        Clasificacion(Etiqueta("cotizacion"), 0.3, FuenteClasificacion.EVALUADOR),
    )
    paginas = [pagina(1, "presupuesto"), corregida, pagina(3, "presupuesto")]

    assert [p.etiqueta for p in segmentar(paginas)] == ["presupuesto", "cotizacion", "presupuesto"]
