"""Rutas que juntan dos contextos en un solo paso. Viven aquí porque solo arranque los conoce."""

from collections.abc import Callable
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, UploadFile

from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.casos_de_uso.analizar_documento import AnalizarDocumento
from axis.documentos.aplicacion.dto import OrdenAnalizarDocumento
from axis.documentos.dominio.errores import ArchivoDemasiadoGrande
from axis.expediente.adaptadores.entrada.http import ExpedienteSalida, salida_expediente
from axis.expediente.aplicacion.casos_de_uso.evaluar_expediente import EvaluarExpediente
from axis.expediente.aplicacion.casos_de_uso.gestionar import AdjuntarDocumento
from axis.expediente.dominio.entidades import IdExpediente


def crear_router(
    analizar: Callable[[], AnalizarDocumento],
    adjuntar: Callable[[], AdjuntarDocumento],
    evaluar: Callable[[], EvaluarExpediente],
    limite_bytes: int,
) -> APIRouter:
    router = APIRouter(tags=["expediente"])

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
        analisis = await analizar_caso.ejecutar(
            OrdenAnalizarDocumento(
                archivo.filename or "sin_nombre", await archivo.read(), Fase.EXPEDIENTE
            )
        )
        await adjuntar_caso.ejecutar(IdExpediente(id_expediente), str(analisis.documento.id))
        return salida_expediente(await evaluar_caso.ejecutar(IdExpediente(id_expediente)))

    return router
