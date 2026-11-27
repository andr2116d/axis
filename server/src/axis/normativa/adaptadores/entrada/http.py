from collections.abc import Callable
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from axis.compartido.dominio.errores import ErrorAxis
from axis.normativa.aplicacion.casos_de_uso.citar import CitarNormativa
from axis.normativa.aplicacion.casos_de_uso.consultar import ConsultarNormas
from axis.normativa.aplicacion.dto import OrdenCitar
from axis.normativa.dominio.errores import (
    ConsultaVacia,
    FragmentoNoEncontrado,
    NormaSinFragmentos,
)
from axis.normativa.dominio.valores import (
    Fragmento,
    OrigenCita,
    Pertinencia,
    RespuestaNormativa,
    TipoNorma,
)

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    FragmentoNoEncontrado: status.HTTP_404_NOT_FOUND,
    ConsultaVacia: status.HTTP_422_UNPROCESSABLE_CONTENT,
    NormaSinFragmentos: status.HTTP_422_UNPROCESSABLE_CONTENT,
}


class ConsultaEntrada(BaseModel):
    pregunta: str = Field(min_length=3, max_length=2000)
    contexto: str | None = Field(default=None, max_length=8000)
    maximo_citas: int = Field(default=5, ge=1, le=10)


class NormaSalida(BaseModel):
    id: str
    nombre: str
    tipo: TipoNorma
    vigente_al: str
    fragmentos: int


class FragmentoSalida(BaseModel):
    id: str
    norma: str
    etiqueta: str
    titulo: str
    ubicacion: list[str]
    texto: str


class CitaSalida(BaseModel):
    norma: str
    fragmento: FragmentoSalida
    extracto: str
    razon: str
    pertinencia: Pertinencia
    origen: OrigenCita


class RespuestaSalida(BaseModel):
    origen: OrigenCita
    lector: str | None
    leida_por_modelo: bool
    citas: list[CitaSalida]
    descartadas: int
    desde_cache: bool
    duracion_ms: int


def crear_router(
    citar: Callable[[], CitarNormativa], consultar: Callable[[], ConsultarNormas]
) -> APIRouter:
    router = APIRouter(prefix="/normativa", tags=["normativa"])

    @router.get("/normas")
    async def listar(caso: Annotated[ConsultarNormas, Depends(consultar)]) -> list[NormaSalida]:
        return [
            NormaSalida(
                id=r.norma.id,
                nombre=r.norma.nombre,
                tipo=r.norma.tipo,
                vigente_al=r.norma.vigente_al,
                fragmentos=r.fragmentos,
            )
            for r in await caso.normas()
        ]

    @router.get("/fragmentos/{id_fragmento}")
    async def fragmento(
        id_fragmento: str, caso: Annotated[ConsultarNormas, Depends(consultar)]
    ) -> FragmentoSalida:
        return salida_fragmento(await caso.fragmento(id_fragmento))

    @router.post("/consultas")
    async def consultar_normativa(
        cuerpo: ConsultaEntrada, caso: Annotated[CitarNormativa, Depends(citar)]
    ) -> RespuestaSalida:
        """Qué artículos aplican a un caso, con extracto literal y por qué aplican."""
        orden = OrdenCitar(cuerpo.pregunta, cuerpo.contexto, cuerpo.maximo_citas)
        return salida_respuesta(await caso.ejecutar(orden))

    return router


def salida_fragmento(f: Fragmento) -> FragmentoSalida:
    return FragmentoSalida(
        id=f.id,
        norma=f.id_norma,
        etiqueta=f.etiqueta,
        titulo=f.titulo,
        ubicacion=list(f.ubicacion),
        texto=f.texto,
    )


def salida_respuesta(r: RespuestaNormativa) -> RespuestaSalida:
    return RespuestaSalida(
        origen=r.origen,
        lector=r.lector,
        leida_por_modelo=r.origen is OrigenCita.LECTOR,
        citas=[
            CitaSalida(
                norma=c.nombre_norma,
                fragmento=salida_fragmento(c.fragmento),
                extracto=c.extracto,
                razon=c.razon,
                pertinencia=c.pertinencia,
                origen=c.origen,
            )
            for c in r.citas
        ],
        descartadas=r.descartadas,
        desde_cache=r.desde_cache,
        duracion_ms=r.duracion_ms,
    )
