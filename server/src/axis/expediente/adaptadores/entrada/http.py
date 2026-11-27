from collections.abc import Callable
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.valores import Semaforo
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import (
    AdjuntarDocumento,
    CrearExpediente,
    ObtenerExpediente,
)
from axis.expediente.aplicacion.casos_de_uso.revisar_hallazgo import RevisarHallazgo
from axis.expediente.aplicacion.dto import (
    OrdenCrearExpediente,
    OrdenRevisarHallazgo,
    VistaExpediente,
)
from axis.expediente.dominio.entidades import EstadoSeccion, IdExpediente
from axis.expediente.dominio.errores import (
    DocumentoNoEncontrado,
    DocumentoYaAdjunto,
    ExpedienteNoEncontrado,
    ExpedienteSinDocumentos,
    HallazgoNoEncontrado,
    RevisionInvalida,
)
from axis.expediente.dominio.revisiones import (
    LARGO_MAXIMO_MOTIVO,
    DecisionHallazgo,
    RevisionHallazgo,
)

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    ExpedienteNoEncontrado: status.HTTP_404_NOT_FOUND,
    DocumentoNoEncontrado: status.HTTP_404_NOT_FOUND,
    DocumentoYaAdjunto: status.HTTP_409_CONFLICT,
    ExpedienteSinDocumentos: status.HTTP_409_CONFLICT,
    HallazgoNoEncontrado: status.HTTP_404_NOT_FOUND,
    RevisionInvalida: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


class CrearEntrada(BaseModel):
    nombre_obra: str
    cui: str | None = None
    entidad: str | None = None
    tipologia: str | None = None


class AdjuntarEntrada(BaseModel):
    id_documento: str


class RevisionEntrada(BaseModel):
    decision: DecisionHallazgo
    motivo: str | None = Field(default=None, max_length=LARGO_MAXIMO_MOTIVO)


class SeccionSalida(BaseModel):
    etiqueta: str
    id_documento: str
    nombre_documento: str
    version: int
    estado: EstadoSeccion
    hallazgos: int
    abiertos: int  # los que el evaluador no descartó ni justificó


class DocumentoSalida(BaseModel):
    id_documento: str
    nombre: str
    tipo: str
    partes: list[str]
    adjuntado_en: datetime


class FactorSalida(BaseModel):
    nombre: str
    valor: str


class RevisionSalida(BaseModel):
    decision: DecisionHallazgo
    motivo: str | None
    revisado_en: datetime


class HallazgoSalida(BaseModel):
    clave: str
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
    revision: RevisionSalida | None


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
    sin_revisar: int  # hallazgos que el evaluador todavía no miró


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
    revisar: Callable[[], RevisarHallazgo],
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

    @router.post("/{id_expediente}/hallazgos/{clave}/revision")
    async def revisar_hallazgo(
        id_expediente: UUID,
        clave: str,
        cuerpo: RevisionEntrada,
        caso: Annotated[RevisarHallazgo, Depends(revisar)],
    ) -> ExpedienteSalida:
        """Confirma, descarta o justifica un hallazgo. Descartar o justificar pide el motivo."""
        orden = OrdenRevisarHallazgo(
            IdExpediente(id_expediente), clave, cuerpo.decision, cuerpo.motivo
        )
        return salida_expediente(await caso.ejecutar(orden))

    return router


def salida_expediente(vista: VistaExpediente) -> ExpedienteSalida:
    expediente, evaluacion, cerrados = vista.expediente, vista.ultima_evaluacion, vista.cerrados
    secciones = expediente.secciones_vigentes()
    return ExpedienteSalida(
        id=expediente.id,
        nombre_obra=expediente.nombre_obra,
        cui=expediente.cui,
        entidad=expediente.entidad,
        tipologia=expediente.tipologia,
        semaforo=evaluacion.semaforo(cerrados) if evaluacion else None,
        secciones=[
            SeccionSalida(
                etiqueta=s.etiqueta,
                id_documento=s.id_documento,
                nombre_documento=s.nombre_documento,
                version=s.version,
                estado=(
                    evaluacion.estado_de(s, cerrados) if evaluacion else EstadoSeccion.SIN_REVISAR
                ),
                hallazgos=len(evaluacion.de_seccion(s)) if evaluacion else 0,
                abiertos=(
                    sum(h.clave not in cerrados for h in evaluacion.de_seccion(s))
                    if evaluacion
                    else 0
                ),
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
        sin_revisar=sum(h.clave not in vista.revisiones for h in e.hallazgos),
        hallazgos=[
            HallazgoSalida(
                clave=h.clave,
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
                revision=_revision(vista.revisiones.get(h.clave)),
            )
            for h in orden
        ],
    )


def _revision(revision: RevisionHallazgo | None) -> RevisionSalida | None:
    if revision is None:
        return None
    return RevisionSalida(
        decision=revision.decision, motivo=revision.motivo, revisado_en=revision.revisado_en
    )
