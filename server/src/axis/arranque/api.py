import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from axis.arranque.config import Config
from axis.arranque.recursos import Recursos
from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.infraestructura.logs import configurar_logs
from axis.compartido.infraestructura.reloj import RelojSistema
from axis.documentos.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_DOCUMENTOS
from axis.documentos.adaptadores.entrada.http import crear_router as router_documentos
from axis.documentos.adaptadores.salida.almacen_s3 import AlmacenS3
from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.adaptadores.salida.ocr_tesseract import OcrTesseract
from axis.documentos.adaptadores.salida.postgres import RepositorioDocumentosPostgres
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.casos_de_uso.consultar_documento import (
    ObtenerDocumento,
    ObtenerPagina,
)

log = structlog.get_logger()

ERRORES_HTTP: dict[type[ErrorAxis], int] = {**ERRORES_DOCUMENTOS}


def create_app(config: Config | None = None) -> FastAPI:
    config = config or Config()
    configurar_logs(json=config.log_json)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.recursos = await Recursos.abrir(config)
        yield
        await app.state.recursos.cerrar()

    app = FastAPI(title="Axis", lifespan=lifespan)

    def recursos() -> Recursos:
        return app.state.recursos  # type: ignore[no-any-return]  # app.state no tiene tipos

    # Los adaptadores sin estado se crean una vez; los casos de uso se arman por petición.
    lector = LectorArchivosLocal()
    ocr = OcrTesseract(config.ocr_idioma, config.ocr_dpi, config.ocr_concurrencia)
    reloj = RelojSistema()

    def analizar_documento() -> AnalizarDocumento:
        r = recursos()
        return AnalizarDocumento(
            repositorio=RepositorioDocumentosPostgres(r.motor_bd),
            almacen=AlmacenS3(r.s3, config.s3_bucket_documentos),
            lector=lector,
            ocr=ocr,
            modelos=r.modelos_documentos,
            reloj=reloj,
        )

    def obtener_documento() -> ObtenerDocumento:
        return ObtenerDocumento(RepositorioDocumentosPostgres(recursos().motor_bd))

    def obtener_pagina() -> ObtenerPagina:
        return ObtenerPagina(RepositorioDocumentosPostgres(recursos().motor_bd))

    app.include_router(
        router_documentos(
            analizar_documento, obtener_documento, obtener_pagina, config.limite_subida_bytes
        )
    )
    _registrar_errores(app)
    _registrar_medicion(app)

    @app.get("/salud", tags=["sistema"])
    async def salud() -> dict[str, str | None]:
        modelos = recursos().modelos_documentos.actual()
        return {"estado": "ok", "modelos_documentos": modelos.version if modelos else None}

    return app


def _registrar_errores(app: FastAPI) -> None:
    async def manejar(_peticion: Request, error: Exception) -> Response:
        codigo = next((c for tipo, c in ERRORES_HTTP.items() if isinstance(error, tipo)), 400)
        return JSONResponse({"error": type(error).__name__, "detalle": str(error)}, codigo)

    app.add_exception_handler(ErrorAxis, manejar)


def _registrar_medicion(app: FastAPI) -> None:
    @app.middleware("http")
    async def medir(
        request: Request, siguiente: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        id_peticion = request.headers.get("x-id-peticion") or uuid.uuid4().hex
        structlog.contextvars.bind_contextvars(id_peticion=id_peticion)
        inicio = time.perf_counter()
        try:
            respuesta = await siguiente(request)
        finally:
            ms = round((time.perf_counter() - inicio) * 1000)
            log.info("peticion", metodo=request.method, ruta=request.url.path, ms=ms)
            structlog.contextvars.clear_contextvars()
        respuesta.headers["x-id-peticion"] = id_peticion
        respuesta.headers["server-timing"] = f"total;dur={ms}"
        return respuesta
