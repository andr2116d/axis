"""Rutas que juntan dos contextos en un solo paso. Viven aquí porque solo arranque los conoce."""

import asyncio
import contextlib
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

from axis.arranque.puentes import consulta_de_hallazgo
from axis.compartido.dominio.avance import Avance, Avisador
from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.dto import OrdenAnalizarDocumento
from axis.documentos.dominio.errores import ArchivoDemasiadoGrande
from axis.expediente.adaptadores.entrada.http import ExpedienteSalida, salida_expediente
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import AdjuntarDocumento, ObtenerExpediente
from axis.expediente.dominio.entidades import IdExpediente
from axis.expediente.dominio.errores import HallazgoNoEncontrado
from axis.normativa.adaptadores.entrada.http import RespuestaSalida, salida_respuesta
from axis.normativa.aplicacion.casos_de_uso.citar import CitarNormativa


def crear_router(
    analizar: Callable[[], AnalizarDocumento],
    adjuntar: Callable[[], AdjuntarDocumento],
    evaluar: Callable[[], EvaluarExpediente],
    limite_bytes: int,
    codigo_de: Callable[[ErrorAxis], int],
) -> APIRouter:
    router = APIRouter(tags=["expediente"])

    async def procesar(
        id_expediente: IdExpediente,
        nombre: str,
        contenido: bytes,
        casos: tuple[AnalizarDocumento, AdjuntarDocumento, EvaluarExpediente],
        avisar: Avisador,
    ) -> ExpedienteSalida:
        analizar_caso, adjuntar_caso, evaluar_caso = casos
        if len(contenido) > limite_bytes:
            raise ArchivoDemasiadoGrande(f"el límite es {limite_bytes // 1_000_000} MB")
        orden = OrdenAnalizarDocumento(nombre, contenido, Fase.EXPEDIENTE)
        analisis = await analizar_caso.ejecutar(orden, avisar)
        await adjuntar_caso.ejecutar(id_expediente, str(analisis.documento.id))
        return salida_expediente(await evaluar_caso.ejecutar(id_expediente, avisar))

    @router.post("/expedientes/{id_expediente}/archivos")
    async def subir_al_expediente(
        id_expediente: UUID,
        archivo: Annotated[UploadFile, File(description="PDF, Excel (.xlsx) o imagen")],
        analizar_caso: Annotated[AnalizarDocumento, Depends(analizar)],
        adjuntar_caso: Annotated[AdjuntarDocumento, Depends(adjuntar)],
        evaluar_caso: Annotated[EvaluarExpediente, Depends(evaluar)],
    ) -> ExpedienteSalida:
        """Analiza el archivo, lo suma al expediente y lo evalúa: lo que no cambió no se repite."""
        if archivo.size is not None and archivo.size > limite_bytes:
            raise ArchivoDemasiadoGrande(f"el límite es {limite_bytes // 1_000_000} MB")
        casos = (analizar_caso, adjuntar_caso, evaluar_caso)
        nombre = archivo.filename or "sin_nombre"
        return await procesar(
            IdExpediente(id_expediente), nombre, await archivo.read(), casos, _callar
        )

    @router.post(
        "/expedientes/{id_expediente}/archivos/en-vivo", response_class=EventSourceResponse
    )
    async def subir_en_vivo(
        id_expediente: UUID,
        archivo: Annotated[UploadFile, File(description="PDF, Excel (.xlsx) o imagen")],
        analizar_caso: Annotated[AnalizarDocumento, Depends(analizar)],
        adjuntar_caso: Annotated[AdjuntarDocumento, Depends(adjuntar)],
        evaluar_caso: Annotated[EvaluarExpediente, Depends(evaluar)],
    ) -> AsyncIterator[ServerSentEvent]:
        """Lo mismo que /archivos, pero avisa cada etapa por SSE apenas ocurre.

        Eventos: `recibido`, `ya_analizado`, `lectura`, `ocr` (uno por página), `documento`,
        `plan`, `motor`, `hallazgo` y, al final, `listo` con el expediente o `error`.
        """
        nombre = archivo.filename or "sin_nombre"
        contenido = await archivo.read()
        casos = (analizar_caso, adjuntar_caso, evaluar_caso)
        yield _evento(Avance("recibido", f"Recibido {nombre}.", {"bytes": len(contenido)}))
        async for evento in transmitir(
            lambda avisar: procesar(IdExpediente(id_expediente), nombre, contenido, casos, avisar),
            codigo_de,
        ):
            yield evento

    return router


async def transmitir(
    trabajo: Callable[[Avisador], Awaitable[BaseModel]],
    codigo_de: Callable[[ErrorAxis], int],
) -> AsyncIterator[ServerSentEvent]:
    """Corre un trabajo largo y envía cada aviso apenas llega; al final, `listo` o `error`."""
    cola: asyncio.Queue[Avance | None] = asyncio.Queue()

    async def avisar(avance: Avance) -> None:
        await cola.put(avance)

    async def trabajar() -> BaseModel:
        try:
            return await trabajo(avisar)
        finally:
            await cola.put(None)

    tarea = asyncio.create_task(trabajar())
    try:
        while (avance := await cola.get()) is not None:
            yield _evento(avance)
        salida = await tarea
    except ErrorAxis as error:
        datos = {"error": type(error).__name__, "detalle": str(error), "codigo": codigo_de(error)}
        yield ServerSentEvent(event="error", data=datos)
        return
    finally:
        # Si el cliente se va, el trabajo a medias se cancela: no queda nada colgado.
        if not tarea.done():
            tarea.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await tarea
    yield ServerSentEvent(event="listo", data=salida)


async def _callar(avance: Avance) -> None:
    """Para la ruta que responde de una vez: nadie escucha el avance."""


def _evento(avance: Avance) -> ServerSentEvent:
    return ServerSentEvent(event=avance.etapa, data={"mensaje": avance.mensaje, **avance.datos})


def crear_router_normativa(
    obtener: Callable[[], ObtenerExpediente], citar: Callable[[], CitarNormativa]
) -> APIRouter:
    router = APIRouter(tags=["normativa"])

    @router.get("/expedientes/{id_expediente}/hallazgos/{clave}/normativa")
    async def normativa_del_hallazgo(
        id_expediente: UUID,
        clave: str,
        obtener_caso: Annotated[ObtenerExpediente, Depends(obtener)],
        citar_caso: Annotated[CitarNormativa, Depends(citar)],
    ) -> RespuestaSalida:
        """Los artículos en los que el evaluador apoya la observación de este hallazgo."""
        vista = await obtener_caso.ejecutar(IdExpediente(id_expediente))
        evaluacion = vista.ultima_evaluacion
        hallazgo = next(
            (h for h in (evaluacion.hallazgos if evaluacion else ()) if h.clave == clave), None
        )
        if hallazgo is None:
            raise HallazgoNoEncontrado(f"el hallazgo {clave} no está en la última evaluación")
        orden = consulta_de_hallazgo(vista.expediente, hallazgo)
        return salida_respuesta(await citar_caso.ejecutar(orden))

    return router
