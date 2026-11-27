from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.valores import Fase, Semaforo
from axis.orquestador.aplicacion.casos_de_uso.evaluar import EvaluarDocumento, OrdenEvaluar
from axis.orquestador.dominio.errores import FuenteNoEncontrada
from axis.orquestador.dominio.evaluacion import Evaluacion

ERRORES_HTTP: dict[type[ErrorAxis], int] = {FuenteNoEncontrada: status.HTTP_404_NOT_FOUND}


class EvaluarEntrada(BaseModel):
    id_documento: str
    fase: Fase | None = Field(None, description="Si se omite, la fase en que se subió")
    tipologia: str | None = Field(None, description="pistas_veredas, agua_saneamiento…")


class ActivadoSalida(BaseModel):
    motor: str
    origen: str
    razon: str


class OmitidoSalida(BaseModel):
    motor: str
    nombre: str
    razon: str
    faltan: list[str]


class FactorSalida(BaseModel):
    nombre: str
    valor: str


class HallazgoSalida(BaseModel):
    motor: str
    version_motor: str
    severidad: str
    titulo: str
    explicacion: str
    confianza: float
    pagina: int | None
    item: str | None
    factores: list[FactorSalida]


class FallaSalida(BaseModel):
    motor: str
    razon: str


class EvaluacionSalida(BaseModel):
    semaforo: Semaforo
    activados: list[ActivadoSalida]
    omitidos: list[OmitidoSalida]
    hallazgos: list[HallazgoSalida]
    fallas: list[FallaSalida]
    duracion_ms: int


def crear_router(evaluar: Callable[[], EvaluarDocumento]) -> APIRouter:
    router = APIRouter(prefix="/evaluaciones", tags=["orquestador"])

    @router.post("")
    async def crear(
        cuerpo: EvaluarEntrada, caso: Annotated[EvaluarDocumento, Depends(evaluar)]
    ) -> EvaluacionSalida:
        evaluacion = await caso.ejecutar(
            OrdenEvaluar(cuerpo.id_documento, cuerpo.fase, cuerpo.tipologia)
        )
        return _salida(evaluacion)

    return router


def _salida(evaluacion: Evaluacion) -> EvaluacionSalida:
    # Lo más grave primero: rojo antes que ámbar, y dentro de cada uno, lo más seguro.
    orden = sorted(evaluacion.hallazgos, key=lambda h: (h.severidad.value != "rojo", -h.confianza))
    return EvaluacionSalida(
        semaforo=evaluacion.semaforo,
        activados=[
            ActivadoSalida(motor=a.id_motor, origen=a.origen, razon=a.razon)
            for a in evaluacion.plan.activaciones
        ],
        omitidos=[
            OmitidoSalida(motor=o.id_motor, nombre=o.nombre, razon=o.razon, faltan=list(o.faltan))
            for o in evaluacion.plan.omisiones
        ],
        hallazgos=[
            HallazgoSalida(
                motor=h.id_motor,
                version_motor=h.version_motor,
                severidad=h.severidad,
                titulo=h.titulo,
                explicacion=h.explicacion,
                confianza=h.confianza,
                pagina=h.pagina,
                item=h.item,
                factores=[FactorSalida(nombre=f.nombre, valor=f.valor) for f in h.factores],
            )
            for h in orden
        ],
        fallas=[FallaSalida(motor=f.id_motor, razon=f.razon) for f in evaluacion.fallas],
        duracion_ms=evaluacion.duracion_ms,
    )
