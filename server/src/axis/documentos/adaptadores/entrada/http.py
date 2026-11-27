from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from pydantic import BaseModel, Field

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.casos_de_uso.consultar_documento import (
    ObtenerDocumento,
    ObtenerPagina,
)
from axis.documentos.aplicacion.casos_de_uso.corregir_clasificacion import (
    CorregirClasificacion,
    ListarCorrecciones,
    ObtenerEtiquetas,
)
from axis.documentos.aplicacion.dto import (
    OrdenAnalizarDocumento,
    OrdenCorregir,
    OrdenObtenerPagina,
)
from axis.documentos.dominio.entidades import Correccion, Documento, Pagina
from axis.documentos.dominio.errores import (
    ArchivoDemasiadoGrande,
    ArchivoIlegible,
    ArchivoNoSoportado,
    ArchivoVacio,
    DocumentoNoEncontrado,
    EtiquetaInvalida,
    ModelosNoDisponibles,
    PaginaNoEncontrada,
)
from axis.documentos.dominio.valores import FuenteClasificacion, IdDocumento

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    ArchivoVacio: status.HTTP_400_BAD_REQUEST,
    ArchivoIlegible: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ArchivoNoSoportado: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    ArchivoDemasiadoGrande: status.HTTP_413_CONTENT_TOO_LARGE,
    DocumentoNoEncontrado: status.HTTP_404_NOT_FOUND,
    PaginaNoEncontrada: status.HTTP_404_NOT_FOUND,
    EtiquetaInvalida: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ModelosNoDisponibles: status.HTTP_503_SERVICE_UNAVAILABLE,
}

_NOMBRES_FASE = {
    Fase.EXPEDIENTE: "Expediente",
    Fase.SELECCION: "Selección",
    Fase.EJECUCION: "Ejecución",
}


class Clasificado(BaseModel):
    etiqueta: str
    confianza: float
    fuente: FuenteClasificacion = FuenteClasificacion.MODELO


class TipoDocumentoSalida(Clasificado):
    fase: Fase | None
    es_confiable: bool


class ParteSalida(Clasificado):
    desde: int
    hasta: int
    total_paginas: int


class PaginaResumen(BaseModel):
    numero: int
    origen: str
    caracteres: int
    tipo: Clasificado | None
    confianza_ocr: float | None


class SenalSalida(BaseModel):
    codigo: str
    descripcion: str
    paginas: list[int]


class EdicionSalida(BaseModel):
    hay_indicios: bool
    rareza: float | None
    senales: list[SenalSalida]


class HuellaSalida(BaseModel):
    tipo_archivo: str
    tamano_bytes: int
    programa_creador: str | None
    programa_productor: str | None
    creado_en: datetime | None
    modificado_en: datetime | None
    revisiones: int
    firmas: int


class FaseSalida(BaseModel):
    subida_en: Fase | None
    corresponde: bool | None
    aviso: str | None


class ResumenPartidas(BaseModel):
    total: int
    titulos: int
    verificables: int = Field(description="Filas con cantidad, precio y parcial")
    cuadran: int = Field(description="Filas donde cantidad × precio ≈ parcial")
    paginas_dudosas: list[int] = Field(
        description="Páginas con filas verificables donde menos de la mitad cuadra"
    )


class PartidaSalida(BaseModel):
    pagina: int
    tipo_pagina: str | None
    item: str
    descripcion: str
    unidad: str | None
    cantidad: Decimal | None
    precio_unitario: Decimal | None
    parcial: Decimal | None
    cuadra: bool | None
    numeros: list[Decimal]


class DocumentoSalida(BaseModel):
    id: UUID
    nombre: str
    hash: str
    tipo: TipoDocumentoSalida
    fase: FaseSalida
    partes: list[ParteSalida]
    edicion: EdicionSalida
    huella: HuellaSalida
    paginas_por_origen: dict[str, int]
    partidas: ResumenPartidas
    paginas: list[PaginaResumen]
    version_modelos: str
    subido_en: datetime


class AnalisisSalida(DocumentoSalida):
    desde_cache: bool
    duracion_ms: int


class PaginaSalida(PaginaResumen):
    texto: str


class CorreccionEntrada(BaseModel):
    pagina: int | None = Field(None, description="Página a corregir; vacío = el documento completo")
    etiqueta: str = Field(description="Qué es en realidad: metrados, cotizacion, valorizacion…")
    fase: Fase | None = Field(None, description="Solo si el tipo es nuevo y se sabe su fase")


class CorreccionSalida(BaseModel):
    id: UUID
    pagina: int | None
    etiqueta_anterior: str | None
    etiqueta: str
    fase: Fase | None
    version_modelos: str
    corregido_en: datetime


class ResultadoCorreccionSalida(BaseModel):
    correccion: CorreccionSalida
    es_etiqueta_nueva: bool
    documento: DocumentoSalida


class EtiquetaDocumento(BaseModel):
    etiqueta: str
    fase: Fase | None


class EtiquetasSalida(BaseModel):
    version_modelos: str
    paginas: list[str]
    documentos: list[EtiquetaDocumento]


@dataclass(frozen=True)
class CasosDocumentos:
    """Cómo obtener cada caso de uso por petición; lo arma `arranque`."""

    analizar: Callable[[], AnalizarDocumento]
    obtener: Callable[[], ObtenerDocumento]
    obtener_pagina: Callable[[], ObtenerPagina]
    corregir: Callable[[], CorregirClasificacion]
    listar_correcciones: Callable[[], ListarCorrecciones]
    etiquetas: Callable[[], ObtenerEtiquetas]


def crear_router(casos: CasosDocumentos, limite_bytes: int) -> APIRouter:
    router = APIRouter(prefix="/documentos", tags=["documentos"])
    analizar, obtener, obtener_pagina = casos.analizar, casos.obtener, casos.obtener_pagina

    # Va antes de /{id_documento} para que "etiquetas" no se lea como un id.
    @router.get("/etiquetas")
    async def etiquetas(
        caso: Annotated[ObtenerEtiquetas, Depends(casos.etiquetas)],
    ) -> EtiquetasSalida:
        conocidas = await caso.ejecutar()
        return EtiquetasSalida(
            version_modelos=conocidas.version,
            paginas=list(conocidas.paginas),
            documentos=[EtiquetaDocumento(etiqueta=e, fase=f) for e, f in conocidas.documentos],
        )

    @router.post("", status_code=status.HTTP_201_CREATED)
    async def subir(
        archivo: Annotated[UploadFile, File(description="PDF, Excel (.xlsx) o imagen")],
        respuesta: Response,
        caso: Annotated[AnalizarDocumento, Depends(analizar)],
        fase: Annotated[Fase | None, Form(description="Fase en la que se sube")] = None,
    ) -> AnalisisSalida:
        if archivo.size is not None and archivo.size > limite_bytes:
            raise ArchivoDemasiadoGrande(f"el límite es {limite_bytes // 1_000_000} MB")
        contenido = await archivo.read()
        resultado = await caso.ejecutar(
            OrdenAnalizarDocumento(archivo.filename or "sin_nombre", contenido, fase)
        )
        if resultado.desde_cache:
            respuesta.status_code = status.HTTP_200_OK
        return AnalisisSalida(
            **_documento(resultado.documento, fase).model_dump(),
            desde_cache=resultado.desde_cache,
            duracion_ms=resultado.duracion_ms,
        )

    @router.get("/{id_documento}")
    async def consultar(
        id_documento: UUID,
        caso: Annotated[ObtenerDocumento, Depends(obtener)],
        fase: Fase | None = None,
    ) -> DocumentoSalida:
        documento = await caso.ejecutar(IdDocumento(id_documento))
        return _documento(documento, fase or documento.fase_subida)

    @router.get("/{id_documento}/paginas/{numero}")
    async def pagina(
        id_documento: UUID, numero: int, caso: Annotated[ObtenerPagina, Depends(obtener_pagina)]
    ) -> PaginaSalida:
        encontrada = await caso.ejecutar(OrdenObtenerPagina(IdDocumento(id_documento), numero))
        return PaginaSalida(**_pagina(encontrada).model_dump(), texto=encontrada.texto)

    @router.get("/{id_documento}/partidas")
    async def partidas(
        id_documento: UUID,
        caso: Annotated[ObtenerDocumento, Depends(obtener)],
        pagina: int | None = None,
        solo_partidas: bool = False,
    ) -> list[PartidaSalida]:
        documento = await caso.ejecutar(IdDocumento(id_documento))
        tipos = {
            p.numero: p.clasificacion.etiqueta if p.clasificacion else None
            for p in documento.paginas
        }
        return [
            PartidaSalida(
                pagina=x.pagina,
                tipo_pagina=tipos.get(x.pagina),
                item=x.item,
                descripcion=x.descripcion,
                unidad=x.unidad,
                cantidad=x.cantidad,
                precio_unitario=x.precio_unitario,
                parcial=x.parcial,
                cuadra=x.cuadra,
                numeros=list(x.numeros),
            )
            for x in documento.partidas
            if (pagina is None or x.pagina == pagina) and not (solo_partidas and x.es_titulo)
        ]

    @router.post("/{id_documento}/correcciones", status_code=status.HTTP_201_CREATED)
    async def corregir(
        id_documento: UUID,
        cuerpo: CorreccionEntrada,
        caso: Annotated[CorregirClasificacion, Depends(casos.corregir)],
    ) -> ResultadoCorreccionSalida:
        resultado = await caso.ejecutar(
            OrdenCorregir(IdDocumento(id_documento), cuerpo.pagina, cuerpo.etiqueta, cuerpo.fase)
        )
        documento = resultado.documento
        return ResultadoCorreccionSalida(
            correccion=_correccion(resultado.correccion),
            es_etiqueta_nueva=resultado.es_etiqueta_nueva,
            documento=_documento(documento, documento.fase_subida),
        )

    @router.get("/{id_documento}/correcciones")
    async def correcciones(
        id_documento: UUID,
        caso: Annotated[ListarCorrecciones, Depends(casos.listar_correcciones)],
    ) -> list[CorreccionSalida]:
        return [_correccion(c) for c in await caso.ejecutar(IdDocumento(id_documento))]

    return router


def _correccion(correccion: Correccion) -> CorreccionSalida:
    return CorreccionSalida(
        id=correccion.id,
        pagina=correccion.pagina,
        etiqueta_anterior=correccion.etiqueta_anterior,
        etiqueta=correccion.etiqueta,
        fase=correccion.fase,
        version_modelos=correccion.version_modelos,
        corregido_en=correccion.corregido_en,
    )


def _documento(documento: Documento, fase: Fase | None) -> DocumentoSalida:
    tipo = documento.tipo
    return DocumentoSalida(
        id=documento.id,
        nombre=documento.nombre_original,
        hash=documento.hash_contenido,
        tipo=TipoDocumentoSalida(
            etiqueta=tipo.etiqueta,
            confianza=tipo.confianza,
            fase=tipo.fase,
            es_confiable=tipo.es_confiable,
            fuente=tipo.fuente,
        ),
        fase=FaseSalida(
            subida_en=fase,
            corresponde=documento.corresponde_a(fase),
            aviso=_aviso(documento, fase),
        ),
        partes=[
            ParteSalida(
                etiqueta=p.etiqueta,
                confianza=round(p.confianza, 3),
                desde=p.desde,
                hasta=p.hasta,
                total_paginas=p.total_paginas,
            )
            for p in documento.partes
        ],
        edicion=EdicionSalida(
            hay_indicios=documento.edicion.hay_indicios,
            rareza=documento.edicion.rareza,
            senales=[
                SenalSalida(codigo=s.codigo, descripcion=s.descripcion, paginas=list(s.paginas))
                for s in documento.edicion.senales
            ],
        ),
        huella=HuellaSalida(
            tipo_archivo=documento.huella.tipo_archivo,
            tamano_bytes=documento.huella.tamano_bytes,
            programa_creador=documento.huella.programa_creador,
            programa_productor=documento.huella.programa_productor,
            creado_en=documento.huella.creado_en,
            modificado_en=documento.huella.modificado_en,
            revisiones=documento.huella.revisiones,
            firmas=documento.huella.firmas,
        ),
        paginas_por_origen={o.value: n for o, n in documento.contar_por_origen().items() if n},
        partidas=_resumen_partidas(documento),
        paginas=[_pagina(p) for p in documento.paginas],
        version_modelos=documento.version_modelos,
        subido_en=documento.subido_en,
    )


def _resumen_partidas(documento: Documento) -> ResumenPartidas:
    verificables = [p for p in documento.partidas if p.cuadra is not None]
    por_pagina: dict[int, list[bool]] = {}
    for p in verificables:
        por_pagina.setdefault(p.pagina, []).append(bool(p.cuadra))
    return ResumenPartidas(
        total=len(documento.partidas),
        titulos=sum(1 for p in documento.partidas if p.es_titulo),
        verificables=len(verificables),
        cuadran=sum(1 for p in verificables if p.cuadra),
        # Candidatas a una segunda lectura con el LLM: hoy solo se cuentan.
        paginas_dudosas=sorted(n for n, v in por_pagina.items() if sum(v) < len(v) / 2),
    )


def _pagina(pagina: Pagina) -> PaginaResumen:
    c = pagina.clasificacion
    return PaginaResumen(
        numero=pagina.numero,
        origen=pagina.origen,
        caracteres=len(pagina.texto),
        tipo=Clasificado(etiqueta=c.etiqueta, confianza=round(c.confianza, 3), fuente=c.fuente)
        if c
        else None,
        confianza_ocr=pagina.confianza_ocr,
    )


def _aviso(documento: Documento, fase: Fase | None) -> str | None:
    if documento.corresponde_a(fase) is not False or fase is None or documento.tipo.fase is None:
        return None
    tipo = documento.tipo.etiqueta.replace("_", " ")
    return (
        f"Parece {tipo}, que corresponde a {_NOMBRES_FASE[documento.tipo.fase]}, "
        f"no a {_NOMBRES_FASE[fase]}. ¿Lo subes en {_NOMBRES_FASE[documento.tipo.fase]}?"
    )
