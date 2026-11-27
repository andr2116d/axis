from collections.abc import Callable
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from pydantic import BaseModel

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.casos_de_uso.consultar_documento import (
    ObtenerDocumento,
    ObtenerPagina,
)
from axis.documentos.aplicacion.dto import OrdenAnalizarDocumento, OrdenObtenerPagina
from axis.documentos.dominio.entidades import Documento, Pagina
from axis.documentos.dominio.errores import (
    ArchivoDemasiadoGrande,
    ArchivoIlegible,
    ArchivoNoSoportado,
    ArchivoVacio,
    DocumentoNoEncontrado,
    ModelosNoDisponibles,
    PaginaNoEncontrada,
)
from axis.documentos.dominio.valores import IdDocumento

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    ArchivoVacio: status.HTTP_400_BAD_REQUEST,
    ArchivoIlegible: status.HTTP_422_UNPROCESSABLE_CONTENT,
    ArchivoNoSoportado: status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
    ArchivoDemasiadoGrande: status.HTTP_413_CONTENT_TOO_LARGE,
    DocumentoNoEncontrado: status.HTTP_404_NOT_FOUND,
    PaginaNoEncontrada: status.HTTP_404_NOT_FOUND,
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
    paginas: list[PaginaResumen]
    version_modelos: str
    subido_en: datetime


class AnalisisSalida(DocumentoSalida):
    desde_cache: bool
    duracion_ms: int


class PaginaSalida(PaginaResumen):
    texto: str


def crear_router(
    analizar: Callable[[], AnalizarDocumento],
    obtener: Callable[[], ObtenerDocumento],
    obtener_pagina: Callable[[], ObtenerPagina],
    limite_bytes: int,
) -> APIRouter:
    router = APIRouter(prefix="/documentos", tags=["documentos"])

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

    return router


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
        paginas=[_pagina(p) for p in documento.paginas],
        version_modelos=documento.version_modelos,
        subido_en=documento.subido_en,
    )


def _pagina(pagina: Pagina) -> PaginaResumen:
    c = pagina.clasificacion
    return PaginaResumen(
        numero=pagina.numero,
        origen=pagina.origen,
        caracteres=len(pagina.texto),
        tipo=Clasificado(etiqueta=c.etiqueta, confianza=round(c.confianza, 3)) if c else None,
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
