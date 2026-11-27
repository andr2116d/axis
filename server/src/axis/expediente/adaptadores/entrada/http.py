from collections.abc import Callable
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.motores import semaforo_de
from axis.compartido.dominio.valores import Semaforo
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import (
    AdjuntarDocumento,
    CrearExpediente,
    ObtenerExpediente,
)
from axis.expediente.aplicacion.dto import OrdenCrearExpediente, VistaExpediente
from axis.expediente.dominio.entidades import EstadoSeccion, IdExpediente
from axis.expediente.dominio.errores import (
    DocumentoNoEncontrado,
    DocumentoYaAdjunto,
    ExpedienteNoEncontrado,
    ExpedienteSinDocumentos,
)

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    ExpedienteNoEncontrado: status.HTTP_404_NOT_FOUND,
    DocumentoNoEncontrado: status.HTTP_404_NOT_FOUND,
    DocumentoYaAdjunto: status.HTTP_409_CONFLICT,
    ExpedienteSinDocumentos: status.HTTP_409_CONFLICT,
}


class CrearEntrada(BaseModel):
    nombre_obra: str
    cui: str | None = None
    entidad: str | None = None
    tipologia: str | None = None


class AdjuntarEntrada(BaseModel):
    id_documento: str


class SeccionSalida(BaseModel):
    etiqueta: str
    id_documento: str
    nombre_documento: str
    version: int
    estado: EstadoSeccion
    hallazgos: int


class DocumentoSalida(BaseModel):
    id_documento: str
    nombre: str
    tipo: str
    partes: list[str]
    adjuntado_en: datetime


class FactorSalida(BaseModel):
    nombre: str
    valor: str


class HallazgoSalida(BaseModel):
    motor: str
    severidad: str
    titulo: str
    explicacion: str
    confianza: float
    seccion: str | None
    id_documento: str | None
    pagina: int | None
    item: str | None
    factores: list[FactorSalida]


class MotorSalida(BaseModel):
    motor: str
    version: str
    reutilizado: bool
    hallazgos: int


class OmitidoSalida(BaseModel):
    motor: str
    nombre: str
    razon: str
    faltan: list[str]


class EvaluacionSalida(BaseModel):
    numero: int
    creada_en: datetime
    duracion_ms: int
    motores: list[MotorSalida]
    omitidos: list[OmitidoSalida]
    fallas: list[dict[str, str]]
    hallazgos: list[HallazgoSalida]


class ExpedienteSalida(BaseModel):
    id: UUID
    nombre_obra: str
    cui: str | None
    entidad: str | None
    tipologia: str | None
    semaforo: Semaforo | None
    secciones: list[SeccionSalida]
    documentos: list[DocumentoSalida]
    evaluacion: EvaluacionSalida | None


def crear_router(
    crear: Callable[[], CrearExpediente],
    adjuntar: Callable[[], AdjuntarDocumento],
    obtener: Callable[[], ObtenerExpediente],
    evaluar: Callable[[], EvaluarExpediente],
) -> APIRouter:
    router = APIRouter(prefix="/expedientes", tags=["expediente"])

    @router.post("", status_code=status.HTTP_201_CREATED)
    async def nuevo(
        cuerpo: CrearEntrada, caso: Annotated[CrearExpediente, Depends(crear)]
    ) -> ExpedienteSalida:
        expediente = await caso.ejecutar(
            OrdenCrearExpediente(cuerpo.nombre_obra, cuerpo.cui, cuerpo.entidad, cuerpo.tipologia)
        )
        return salida_expediente(VistaExpediente(expediente, None))

    @router.post("/{id_expediente}/documentos")
    async def adjuntar_documento(
        id_expediente: UUID,
        cuerpo: AdjuntarEntrada,
        caso: Annotated[AdjuntarDocumento, Depends(adjuntar)],
        vista: Annotated[ObtenerExpediente, Depends(obtener)],
    ) -> ExpedienteSalida:
        await caso.ejecutar(IdExpediente(id_expediente), cuerpo.id_documento)
        return salida_expediente(await vista.ejecutar(IdExpediente(id_expediente)))

    @router.get("/{id_expediente}")
    async def consultar(
        id_expediente: UUID, caso: Annotated[ObtenerExpediente, Depends(obtener)]
    ) -> ExpedienteSalida:
        return salida_expediente(await caso.ejecutar(IdExpediente(id_expediente)))

    @router.post("/{id_expediente}/evaluar")
    async def evaluar_expediente(
        id_expediente: UUID, caso: Annotated[EvaluarExpediente, Depends(evaluar)]
    ) -> ExpedienteSalida:
        return salida_expediente(await caso.ejecutar(IdExpediente(id_expediente)))

    return router


def salida_expediente(vista: VistaExpediente) -> ExpedienteSalida:
    expediente, evaluacion = vista.expediente, vista.ultima_evaluacion
    secciones = expediente.secciones_vigentes()
    return ExpedienteSalida(
        id=expediente.id,
        nombre_obra=expediente.nombre_obra,
        cui=expediente.cui,
        entidad=expediente.entidad,
        tipologia=expediente.tipologia,
        semaforo=semaforo_de(evaluacion.hallazgos, bool(evaluacion.fallas)) if evaluacion else None,
        secciones=[
            SeccionSalida(
                etiqueta=s.etiqueta,
                id_documento=s.id_documento,
                nombre_documento=s.nombre_documento,
                version=s.version,
                estado=evaluacion.estado_de(s) if evaluacion else EstadoSeccion.SIN_REVISAR,
                hallazgos=sum(
                    1
                    for h in evaluacion.hallazgos
                    if h.seccion == s.etiqueta and h.id_documento == s.id_documento
                )
                if evaluacion
                else 0,
            )
            for s in secciones
        ],
        documentos=[
            DocumentoSalida(
                id_documento=d.id_documento,
                nombre=d.nombre,
                tipo=d.tipo,
                partes=list(d.partes),
                adjuntado_en=d.adjuntado_en,
            )
            for d in expediente.documentos
        ],
        evaluacion=_evaluacion(vista) if evaluacion else None,
    )


def _evaluacion(vista: VistaExpediente) -> EvaluacionSalida:
    e = vista.ultima_evaluacion
    assert e is not None  # noqa: S101 - _salida solo llama con evaluación
    orden = sorted(e.hallazgos, key=lambda h: (h.severidad.value != "rojo", -h.confianza))
    return EvaluacionSalida(
        numero=e.numero,
        creada_en=e.creada_en,
        duracion_ms=e.duracion_ms,
        motores=[
            MotorSalida(
                motor=r.id_motor,
                version=r.version_motor,
                reutilizado=r.reutilizado,
                hallazgos=len(r.hallazgos),
            )
            for r in e.resultados
        ],
        omitidos=[
            OmitidoSalida(motor=o.id_motor, nombre=o.nombre, razon=o.razon, faltan=list(o.faltan))
            for o in e.omitidos
        ],
        fallas=[{"motor": m, "razon": r} for m, r in e.fallas],
        hallazgos=[
            HallazgoSalida(
                motor=h.id_motor,
                severidad=h.severidad,
                titulo=h.titulo,
                explicacion=h.explicacion,
                confianza=h.confianza,
                seccion=h.seccion,
                id_documento=h.id_documento,
                pagina=h.pagina,
                item=h.item,
                factores=[FactorSalida(nombre=f.nombre, valor=f.valor) for f in h.factores],
            )
            for h in orden
        ],
    )
