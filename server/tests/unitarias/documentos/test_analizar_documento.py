import pytest

from axis.compartido.dominio.valores import Fase
from axis.documentos.adaptadores.salida.falsos import (
    AlmacenEnMemoria,
    ClasificadorDocumentosFijo,
    ModelosFalsos,
    OcrFalso,
    ProveedorModelosFijo,
    RelojFijo,
    RepositorioDocumentosEnMemoria,
)
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.dto import LecturaArchivo, OrdenAnalizarDocumento, PaginaLeida
from axis.documentos.dominio.entidades import Huella
from axis.documentos.dominio.errores import (
    ArchivoNoSoportado,
    ArchivoVacio,
    ModelosNoDisponibles,
)
from axis.documentos.dominio.valores import OrigenPagina, TipoArchivo


class LectorDePrueba:
    """Devuelve las páginas que se le indiquen; texto vacío + imagen = página escaneada."""

    def __init__(self, paginas, tipo=TipoArchivo.PDF):
        self._paginas = paginas
        self._tipo = tipo
        self.lecturas = 0

    def detectar_tipo(self, _contenido):
        return self._tipo

    async def leer(self, contenido, tipo_archivo):
        self.lecturas += 1
        huella = Huella(tipo_archivo, len(contenido), None, None, None, None, 1, 0, 0)
        return LecturaArchivo(
            huella,
            tuple(
                PaginaLeida(i + 1, texto, 0.0 if texto else 1.0, 595.0, 842.0)
                for i, texto in enumerate(self._paginas)
            ),
        )


def armar(paginas, modelos=None, tipo=TipoArchivo.PDF):
    lector = LectorDePrueba(paginas, tipo)
    ocr = OcrFalso(texto="metrados reconocidos")
    almacen = AlmacenEnMemoria()
    caso = AnalizarDocumento(
        repositorio=RepositorioDocumentosEnMemoria(),
        almacen=almacen,
        lector=lector,
        ocr=ocr,
        modelos=ProveedorModelosFijo(modelos if modelos is not None else ModelosFalsos()),
        reloj=RelojFijo(),
    )
    return caso, lector, ocr, almacen


def orden(contenido=b"%PDF-1.7 ...", fase=Fase.EXPEDIENTE):
    return OrdenAnalizarDocumento("expediente.pdf", contenido, fase)


async def test_solo_las_paginas_escaneadas_pasan_por_ocr():
    caso, _, ocr, _ = armar(["memoria descriptiva", "", "metrados del puente", ""])

    resultado = await caso.ejecutar(orden())

    assert ocr.paginas_pedidas == [2, 4]
    origenes = [p.origen for p in resultado.documento.paginas]
    assert origenes == [
        OrigenPagina.DIGITAL,
        OrigenPagina.ESCANEADA,
        OrigenPagina.DIGITAL,
        OrigenPagina.ESCANEADA,
    ]
    assert resultado.documento.paginas[1].confianza_ocr == 0.9


async def test_arma_las_partes_con_el_texto_leido_y_el_reconocido():
    caso, *_ = armar(["memoria a", "memoria b", "", ""])

    resultado = await caso.ejecutar(orden())

    partes = [(p.etiqueta, p.desde, p.hasta) for p in resultado.documento.partes]
    assert partes == [("memoria", 1, 2), ("metrados", 3, 4)]


async def test_el_mismo_archivo_no_se_vuelve_a_procesar():
    caso, lector, _, almacen = armar(["memoria"])
    await caso.ejecutar(orden())

    resultado = await caso.ejecutar(orden())

    assert resultado.desde_cache
    assert lector.lecturas == 1
    assert len(almacen.archivos) == 1


async def test_con_modelos_nuevos_se_reanaliza_el_mismo_archivo():
    caso, lector, *_ = armar(["memoria"])
    await caso.ejecutar(orden())
    caso._modelos = ProveedorModelosFijo(ModelosFalsos(version="prueba-2"))

    resultado = await caso.ejecutar(orden())

    assert not resultado.desde_cache
    assert lector.lecturas == 2


async def test_avisa_cuando_el_documento_es_de_otra_fase():
    valorizacion = ModelosFalsos(
        documentos=ClasificadorDocumentosFijo("valorizacion", Fase.EJECUCION)
    )
    caso, *_ = armar(["valorizacion n 3"], modelos=valorizacion)

    resultado = await caso.ejecutar(orden(fase=Fase.EXPEDIENTE))

    assert resultado.documento.corresponde_a(Fase.EXPEDIENTE) is False
    assert resultado.documento.corresponde_a(Fase.EJECUCION) is True


async def test_archivo_vacio_se_rechaza():
    caso, *_ = armar(["x"])

    with pytest.raises(ArchivoVacio):
        await caso.ejecutar(orden(contenido=b""))


async def test_tipo_desconocido_se_rechaza():
    caso, *_ = armar(["x"], tipo=TipoArchivo.DESCONOCIDO)

    with pytest.raises(ArchivoNoSoportado):
        await caso.ejecutar(orden(contenido=b"hola"))


async def test_sin_modelos_entrenados_no_se_analiza():
    caso, lector, *_ = armar(["x"])
    caso._modelos = ProveedorModelosFijo(None)

    with pytest.raises(ModelosNoDisponibles):
        await caso.ejecutar(orden())
    assert lector.lecturas == 0


async def test_si_el_modelo_duda_no_avisa_de_fase():
    dudoso = ModelosFalsos(documentos=ClasificadorDocumentosFijo("valorizacion", Fase.EJECUCION))
    dudoso.documentos.confianza = 0.4
    caso, *_ = armar(["valorizacion n 3"], modelos=dudoso)

    resultado = await caso.ejecutar(orden(fase=Fase.EXPEDIENTE))

    assert not resultado.documento.tipo.es_confiable
    assert resultado.documento.corresponde_a(Fase.EXPEDIENTE) is None
