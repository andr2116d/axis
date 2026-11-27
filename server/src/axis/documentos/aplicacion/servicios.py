from collections.abc import Sequence
from dataclasses import replace

from axis.documentos.aplicacion.puertos import ModelosDocumentos
from axis.documentos.dominio.entidades import Correccion, Documento
from axis.documentos.dominio.servicios import (
    correccion_del_documento,
    corregir_paginas,
    segmentar,
)
from axis.documentos.dominio.valores import FuenteClasificacion, TipoDocumento


async def aplicar_correcciones(
    documento: Documento, correcciones: Sequence[Correccion], modelos: ModelosDocumentos
) -> Documento:
    """Rehace partes y tipo con lo que dijo el evaluador.

    Si corrigió el tipo del documento, ese manda. Si solo corrigió páginas, el tipo se vuelve a
    calcular: cambiar tres páginas de "bases" a "cotizacion" puede cambiar qué es el archivo.
    """
    if not correcciones:
        return documento
    paginas = corregir_paginas(documento.paginas, correcciones)
    del_documento = correccion_del_documento(correcciones)
    if del_documento is not None:
        tipo = TipoDocumento(
            etiqueta=del_documento.etiqueta,
            confianza=1.0,
            fase=del_documento.fase or modelos.documentos.fase_de(del_documento.etiqueta),
            fuente=FuenteClasificacion.EVALUADOR,
        )
    else:
        tipo = await modelos.documentos.clasificar(paginas)
    return replace(documento, paginas=paginas, partes=segmentar(paginas), tipo=tipo)
