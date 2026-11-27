from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel

from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.motores import Hallazgo, Severidad, semaforo_de
from axis.compartido.dominio.valores import Semaforo
from axis.seleccion.aplicacion.casos_de_uso.buscar_procesos import BuscarProcesos
from axis.seleccion.aplicacion.casos_de_uso.revisar_proceso import RevisarProceso
from axis.seleccion.aplicacion.dto import OrdenRevisarProceso, RevisionProceso
from axis.seleccion.dominio.errores import ProcesoNoEncontrado

ERRORES_HTTP: dict[type[ErrorAxis], int] = {ProcesoNoEncontrado: status.HTTP_404_NOT_FOUND}


class FactorSalida(BaseModel):
    nombre: str
    valor: str


class HallazgoSalida(BaseModel):
    clave: str
    severidad: Severidad
    titulo: str
    explicacion: str
    confianza: float
    factores: list[FactorSalida]


class PostorSalida(BaseModel):
    identificador: str
    nombre: str
    ganador: bool
    es_consorcio: bool
    revisado: bool  # False: sin RUC propio, no se pudo consultar
    hallazgos: list[HallazgoSalida]


class ProcesoSalida(BaseModel):
    id: str
    nomenclatura: str
    entidad: str
    descripcion: str
    monto_referencial: Decimal | None
    cui: str | None
    convocatoria: date | None


class ProcesoResumen(ProcesoSalida):
    postores: int


class FuenteSalida(BaseModel):
    nombre: str
    corte: date | None


class RevisionSalida(BaseModel):
    proceso: ProcesoSalida
    al_dia: date
    fuente: FuenteSalida
    semaforo: Semaforo | None  # None: no se pudo revisar a ningún postor
    postores_revisados: int
    postores_sin_ruc: int
    postores: list[PostorSalida]
    duracion_ms: int


def crear_router(
    revisar: Callable[[], RevisarProceso], buscar: Callable[[], BuscarProcesos]
) -> APIRouter:
    router = APIRouter(prefix="/seleccion", tags=["seleccion"])

    @router.get("/procesos")
    async def buscar_procesos(
        caso: Annotated[BuscarProcesos, Depends(buscar)],
        buscar: Annotated[str, Query(min_length=3, max_length=200)],
    ) -> list[ProcesoResumen]:
        """Procesos por número, nomenclatura, entidad, obra o CUI."""
        return [
            ProcesoResumen(
                id=p.id,
                nomenclatura=p.nomenclatura,
                entidad=p.entidad,
                descripcion=p.descripcion,
                monto_referencial=p.monto_referencial,
                cui=p.cui,
                convocatoria=p.convocatoria,
                postores=len(p.postores),
            )
            for p in await caso.ejecutar(buscar)
        ]

    @router.get("/procesos/{id_proceso}/revision")
    async def revisar_proceso(
        id_proceso: str,
        caso: Annotated[RevisarProceso, Depends(revisar)],
        al_dia: Annotated[
            date | None, Query(description="Por defecto, la fecha de convocatoria")
        ] = None,
    ) -> RevisionSalida:
        """El historial público de cada postor, con lo que el comité debería mirar primero."""
        return salida_revision(await caso.ejecutar(OrdenRevisarProceso(id_proceso, al_dia)))

    return router


def salida_revision(r: RevisionProceso) -> RevisionSalida:
    revisados = [p for p in r.postores if p.revisado]
    p = r.proceso
    return RevisionSalida(
        proceso=ProcesoSalida(
            id=p.id,
            nomenclatura=p.nomenclatura,
            entidad=p.entidad,
            descripcion=p.descripcion,
            monto_referencial=p.monto_referencial,
            cui=p.cui,
            convocatoria=p.convocatoria,
        ),
        al_dia=r.al_dia,
        fuente=FuenteSalida(nombre=r.fuente.nombre, corte=r.fuente.corte),
        semaforo=semaforo_de(r.hallazgos) if revisados else None,
        postores_revisados=len(revisados),
        postores_sin_ruc=len(r.postores) - len(revisados),
        postores=[
            PostorSalida(
                identificador=x.postor.identificador,
                nombre=x.postor.nombre,
                ganador=x.postor.ganador,
                es_consorcio=x.postor.es_consorcio,
                revisado=x.revisado,
                hallazgos=[_hallazgo(h) for h in x.hallazgos],
            )
            for x in r.postores
        ],
        duracion_ms=r.duracion_ms,
    )


def _hallazgo(h: Hallazgo) -> HallazgoSalida:
    return HallazgoSalida(
        clave=h.clave,
        severidad=h.severidad,
        titulo=h.titulo,
        explicacion=h.explicacion,
        confianza=h.confianza,
        factores=[FactorSalida(nombre=f.nombre, valor=f.valor) for f in h.factores],
    )
