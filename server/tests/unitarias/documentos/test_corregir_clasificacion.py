from datetime import timedelta

import pytest

from axis.compartido.dominio.valores import Fase
from axis.documentos.adaptadores.salida.falsos import (
    AlmacenEnMemoria,
    ModelosFalsos,
    OcrFalso,
    ProveedorModelosFijo,
    RelojFijo,
    RepositorioCorreccionesEnMemoria,
    RepositorioDocumentosEnMemoria,
)
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.casos_de_uso.corregir_clasificacion import (
    CorregirClasificacion,
    ListarCorrecciones,
)
from axis.documentos.aplicacion.dto import (
    LecturaArchivo,
    OrdenAnalizarDocumento,
    OrdenCorregir,
    PaginaLeida,
)
from axis.documentos.dominio.entidades import Huella
from axis.documentos.dominio.errores import EtiquetaInvalida, PaginaNoEncontrada
from axis.documentos.dominio.valores import FuenteClasificacion, TipoArchivo


class Lector:
    def detectar_tipo(self, _contenido):
        return TipoArchivo.PDF

    async def leer(self, contenido, tipo_archivo):
        textos = ["memoria a", "memoria b", "bases cotizacion", "metrados x"]
        huella = Huella(tipo_archivo, len(contenido), None, None, None, None, 1, 0, 0)
        return LecturaArchivo(
            huella, tuple(PaginaLeida(i + 1, t, 0.0, 595.0, 842.0) for i, t in enumerate(textos))
        )


class Reloj(RelojFijo):
    """Avanza un minuto cada vez: así el orden de las correcciones es claro."""

    def ahora(self):
        self.momento += timedelta(minutes=1)
        return self.momento


@pytest.fixture
def sistema():
    documentos = RepositorioDocumentosEnMemoria()
    correcciones = RepositorioCorreccionesEnMemoria()
    modelos = ProveedorModelosFijo(ModelosFalsos())
    reloj = Reloj()
    analizar = AnalizarDocumento(
        repositorio=documentos,
        correcciones=correcciones,
        almacen=AlmacenEnMemoria(),
        lector=Lector(),
        ocr=OcrFalso(),
        modelos=modelos,
        reloj=reloj,
    )
    corregir = CorregirClasificacion(
        documentos=documentos, correcciones=correcciones, modelos=modelos, reloj=reloj
    )
    return analizar, corregir, documentos, correcciones


async def subir(analizar, version_contenido=b"%PDF expediente"):
    resultado = await analizar.ejecutar(OrdenAnalizarDocumento("e.pdf", version_contenido, None))
    return resultado.documento


async def test_corregir_una_pagina_rehace_las_partes(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)
    assert [p.etiqueta for p in documento.partes] == ["memoria", "bases", "metrados"]

    resultado = await corregir.ejecutar(OrdenCorregir(documento.id, 3, "cotizacion"))

    pagina = resultado.documento.paginas[2]
    assert pagina.clasificacion.etiqueta == "cotizacion"
    assert pagina.clasificacion.fuente is FuenteClasificacion.EVALUADOR
    assert [p.etiqueta for p in resultado.documento.partes] == ["memoria", "cotizacion", "metrados"]
    assert resultado.correccion.etiqueta_anterior == "bases"
    assert resultado.es_etiqueta_nueva


async def test_corregir_el_documento_manda_sobre_el_modelo(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)

    resultado = await corregir.ejecutar(OrdenCorregir(documento.id, None, "valorizacion"))

    tipo = resultado.documento.tipo
    assert (tipo.etiqueta, tipo.fase, tipo.fuente) == (
        "valorizacion",
        Fase.EJECUCION,
        FuenteClasificacion.EVALUADOR,
    )
    assert tipo.es_confiable
    assert not resultado.es_etiqueta_nueva


async def test_la_ultima_correccion_de_una_pagina_es_la_que_vale(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)
    await corregir.ejecutar(OrdenCorregir(documento.id, 3, "cotizacion"))

    resultado = await corregir.ejecutar(OrdenCorregir(documento.id, 3, "relacion_insumos"))

    assert resultado.documento.paginas[2].clasificacion.etiqueta == "relacion_insumos"
    assert resultado.correccion.etiqueta_anterior == "cotizacion"


async def test_las_correcciones_sobreviven_a_un_reanalisis_con_modelos_nuevos(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)
    await corregir.ejecutar(OrdenCorregir(documento.id, 3, "cotizacion"))
    analizar._modelos = ProveedorModelosFijo(ModelosFalsos(version="prueba-2"))

    reanalizado = await subir(analizar)

    assert reanalizado.version_modelos.startswith("prueba-2+")
    assert reanalizado.paginas[2].clasificacion.etiqueta == "cotizacion"


async def test_etiqueta_con_espacios_y_mayusculas_se_normaliza(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)

    resultado = await corregir.ejecutar(OrdenCorregir(documento.id, 1, " Memoria Descriptiva "))

    assert resultado.correccion.etiqueta == "memoria_descriptiva"


async def test_etiqueta_invalida_y_pagina_inexistente_se_rechazan(sistema):
    analizar, corregir, *_ = sistema
    documento = await subir(analizar)

    with pytest.raises(EtiquetaInvalida):
        await corregir.ejecutar(OrdenCorregir(documento.id, 1, "¿¿??"))
    with pytest.raises(PaginaNoEncontrada):
        await corregir.ejecutar(OrdenCorregir(documento.id, 99, "metrados"))


async def test_lista_las_correcciones_en_orden(sistema):
    analizar, corregir, documentos, correcciones = sistema
    documento = await subir(analizar)
    await corregir.ejecutar(OrdenCorregir(documento.id, 3, "cotizacion"))
    await corregir.ejecutar(OrdenCorregir(documento.id, None, "expediente_tecnico"))

    lista = await ListarCorrecciones(documentos=documentos, correcciones=correcciones).ejecutar(
        documento.id
    )

    assert [(c.pagina, c.etiqueta) for c in lista] == [
        (3, "cotizacion"),
        (None, "expediente_tecnico"),
    ]
