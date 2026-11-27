import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from axis.arranque.config import Config
from axis.arranque.puentes import EntradasDesdeDocumentos
from axis.arranque.recursos import Recursos
from axis.compartido.dominio.errores import ErrorAxis
from axis.compartido.infraestructura.logs import configurar_logs
from axis.compartido.infraestructura.reloj import RelojSistema
from axis.documentos.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_DOCUMENTOS
from axis.documentos.adaptadores.entrada.http import CasosDocumentos
from axis.documentos.adaptadores.entrada.http import crear_router as router_documentos
from axis.documentos.adaptadores.salida.almacen_s3 import AlmacenS3
from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.adaptadores.salida.ocr_tesseract import OcrTesseract
from axis.documentos.adaptadores.salida.postgres import (
    RepositorioCorreccionesPostgres,
    RepositorioDocumentosPostgres,
)
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
from axis.orquestador.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_ORQUESTADOR
from axis.orquestador.adaptadores.entrada.http import crear_router as router_orquestador
from axis.orquestador.aplicacion.casos_de_uso.evaluar import EvaluarDocumento

log = structlog.get_logger()

ERRORES_HTTP: dict[type[ErrorAxis], int] = {**ERRORES_DOCUMENTOS, **ERRORES_ORQUESTADOR}


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

    def documentos() -> RepositorioDocumentosPostgres:
        return RepositorioDocumentosPostgres(recursos().motor_bd)

    def correcciones() -> RepositorioCorreccionesPostgres:
        return RepositorioCorreccionesPostgres(recursos().motor_bd)

    def analizar_documento() -> AnalizarDocumento:
        r = recursos()
        return AnalizarDocumento(
            repositorio=documentos(),
            correcciones=correcciones(),
            almacen=AlmacenS3(r.s3, config.s3_bucket_documentos),
            lector=lector,
            ocr=ocr,
            modelos=r.modelos_documentos,
            reloj=reloj,
        )

    casos = CasosDocumentos(
        analizar=analizar_documento,
        obtener=lambda: ObtenerDocumento(documentos()),
        obtener_pagina=lambda: ObtenerPagina(documentos()),
        corregir=lambda: CorregirClasificacion(
            documentos=documentos(),
            correcciones=correcciones(),
            modelos=recursos().modelos_documentos,
            reloj=reloj,
        ),
        listar_correcciones=lambda: ListarCorrecciones(
            documentos=documentos(), correcciones=correcciones()
        ),
        etiquetas=lambda: ObtenerEtiquetas(recursos().modelos_documentos),
    )
    app.include_router(router_documentos(casos, config.limite_subida_bytes))

    def evaluar_documento() -> EvaluarDocumento:
        return EvaluarDocumento(
            catalogo=recursos().motores,
            fuente=EntradasDesdeDocumentos(documentos()),
            limite_segundos=config.segundos_por_motor,
        )

    app.include_router(router_orquestador(evaluar_documento))
    _registrar_errores(app)
    _registrar_medicion(app)

    @app.get("/salud", tags=["sistema"])
    async def salud() -> dict[str, str | None]:
        r = recursos()
        modelos = r.modelos_documentos.actual()
        return {
            "estado": "ok",
            "modelos_documentos": modelos.version if modelos else None,
            "motores": ", ".join(f"{m.ficha.id}@{m.ficha.version}" for m in r.motores.motores())
            or None,
        }

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
