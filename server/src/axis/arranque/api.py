import time
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from axis.arranque.config import Config
from axis.arranque.puentes import (
    EntradasDesdeDocumentos,
    EvaluadorDesdeOrquestador,
    ResumenesDesdeDocumentos,
)
from axis.arranque.recursos import Recursos
from axis.arranque.rutas_compuestas import crear_router as router_compuesto
from axis.arranque.rutas_compuestas import crear_router_normativa
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
from axis.expediente.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_EXPEDIENTE
from axis.expediente.adaptadores.entrada.http import crear_router as router_expediente
from axis.expediente.adaptadores.salida.postgres import RepositorioExpedientesPostgres
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import (
    AdjuntarDocumento,
    CrearExpediente,
    ObtenerExpediente,
)
from axis.expediente.aplicacion.casos_de_uso.revisar_hallazgo import RevisarHallazgo
from axis.normativa.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_NORMATIVA
from axis.normativa.adaptadores.entrada.http import crear_router as router_normativa
from axis.normativa.adaptadores.salida.bedrock import LectorNormativaBedrock
from axis.normativa.adaptadores.salida.postgres import (
    CacheRespuestasPostgres,
    RepositorioNormativaPostgres,
)
from axis.normativa.aplicacion.casos_de_uso.citar import CitarNormativa
from axis.normativa.aplicacion.casos_de_uso.consultar import ConsultarNormas
from axis.orquestador.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_ORQUESTADOR
from axis.orquestador.adaptadores.entrada.http import crear_router as router_orquestador
from axis.orquestador.aplicacion.casos_de_uso.evaluar import EvaluarDocumento, EvaluarEntrada
from axis.seleccion.adaptadores.entrada.http import ERRORES_HTTP as ERRORES_SELECCION
from axis.seleccion.adaptadores.entrada.http import crear_router as router_seleccion
from axis.seleccion.adaptadores.salida.postgres import (
    RegistroAntecedentesPostgres,
    RepositorioProcesosPostgres,
)
from axis.seleccion.aplicacion.casos_de_uso.buscar_procesos import BuscarProcesos
from axis.seleccion.aplicacion.casos_de_uso.revisar_proceso import RevisarProceso

log = structlog.get_logger()

ERRORES_HTTP: dict[type[ErrorAxis], int] = {
    **ERRORES_DOCUMENTOS,
    **ERRORES_ORQUESTADOR,
    **ERRORES_EXPEDIENTE,
    **ERRORES_NORMATIVA,
    **ERRORES_SELECCION,
}


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

    def expedientes() -> RepositorioExpedientesPostgres:
        return RepositorioExpedientesPostgres(recursos().motor_bd)

    def evaluar_expediente() -> EvaluarExpediente:
        r = recursos()
        evaluador = EvaluadorDesdeOrquestador(
            documentos(),
            EvaluarEntrada(catalogo=r.motores, limite_segundos=config.segundos_por_motor),
            r.motores,
        )
        return EvaluarExpediente(repositorio=expedientes(), evaluador=evaluador, reloj=reloj)

    def adjuntar_documento() -> AdjuntarDocumento:
        return AdjuntarDocumento(
            repositorio=expedientes(),
            documentos=ResumenesDesdeDocumentos(documentos()),
            reloj=reloj,
        )

    app.include_router(
        router_expediente(
            lambda: CrearExpediente(repositorio=expedientes(), reloj=reloj),
            adjuntar_documento,
            lambda: ObtenerExpediente(repositorio=expedientes()),
            evaluar_expediente,
            lambda: RevisarHallazgo(repositorio=expedientes(), reloj=reloj),
        )
    )
    app.include_router(
        router_compuesto(
            analizar_documento,
            adjuntar_documento,
            evaluar_expediente,
            config.limite_subida_bytes,
            codigo_http,
        )
    )

    def normas() -> RepositorioNormativaPostgres:
        return RepositorioNormativaPostgres(recursos().motor_bd)

    def citar_normativa() -> CitarNormativa:
        r = recursos()
        lector = (
            LectorNormativaBedrock(
                r.llm, modelo=config.modelo_llm, esfuerzo=config.esfuerzo_normativa
            )
            if r.llm is not None
            else None
        )
        repositorio = normas()
        return CitarNormativa(
            repositorio=repositorio,
            lector=lector,
            cache=CacheRespuestasPostgres(r.motor_bd, repositorio),
        )

    app.include_router(
        router_normativa(citar_normativa, lambda: ConsultarNormas(repositorio=normas()))
    )
    app.include_router(
        crear_router_normativa(
            lambda: ObtenerExpediente(repositorio=expedientes()), citar_normativa
        )
    )
    app.include_router(
        router_seleccion(
            lambda: RevisarProceso(
                procesos=RepositorioProcesosPostgres(recursos().motor_bd),
                antecedentes=RegistroAntecedentesPostgres(recursos().motor_bd),
                reloj=reloj,
            ),
            lambda: BuscarProcesos(procesos=RepositorioProcesosPostgres(recursos().motor_bd)),
        )
    )
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
            "lector_normativa": config.modelo_llm if r.llm is not None else None,
        }

    return app


def codigo_http(error: ErrorAxis) -> int:
    return next((c for tipo, c in ERRORES_HTTP.items() if isinstance(error, tipo)), 400)


def _registrar_errores(app: FastAPI) -> None:
    async def manejar(_peticion: Request, error: Exception) -> Response:
        codigo = codigo_http(error) if isinstance(error, ErrorAxis) else 500
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
