import asyncio
import contextlib
from contextlib import AsyncExitStack
from dataclasses import dataclass

import aioboto3
import structlog
from anthropic import AsyncAnthropicBedrockMantle, BetaRefusalFallbackMiddleware
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from axis.arranque.catalogo import CatalogoRecargable
from axis.arranque.config import Config
from axis.compartido.infraestructura.s3 import ClienteS3
from axis.documentos.adaptadores.salida.modelos.registro import (
    ProveedorModelosRecargable,
    RegistroModelosS3,
)

log = structlog.get_logger()


@dataclass
class Recursos:
    """Lo caro de crear se crea una vez por proceso: pool de BD, cliente S3 y modelos en memoria."""

    config: Config
    motor_bd: AsyncEngine
    s3: ClienteS3
    modelos_documentos: ProveedorModelosRecargable
    motores: CatalogoRecargable
    llm: AsyncAnthropicBedrockMantle | None
    _pila: AsyncExitStack
    _recarga: asyncio.Task[None] | None = None

    @classmethod
    async def abrir(cls, config: Config) -> "Recursos":
        pila = AsyncExitStack()
        motor_bd = create_async_engine(
            config.base_datos_url, pool_size=config.base_datos_pool, pool_pre_ping=True
        )
        pila.push_async_callback(motor_bd.dispose)
        sesion = aioboto3.Session()
        s3: ClienteS3 = await pila.enter_async_context(
            sesion.client("s3", endpoint_url=config.s3_endpoint, region_name=config.s3_region)
        )
        modelos = ProveedorModelosRecargable(RegistroModelosS3(s3, config.s3_bucket_modelos))
        await modelos.refrescar()
        if modelos.actual() is None:
            log.warning(
                "sin_modelos_documentos", detalle="entrena con `docker compose run entrenar`"
            )
        motores = CatalogoRecargable(s3, config.s3_bucket_modelos)
        await motores.refrescar()
        llm = _cliente_llm(config)
        if llm is not None:
            pila.push_async_callback(llm.close)
        recursos = cls(config, motor_bd, s3, modelos, motores, llm, pila)
        recursos._recarga = asyncio.create_task(recursos._recargar_periodicamente())
        return recursos

    async def _recargar_periodicamente(self) -> None:
        # Cuando el entrenamiento promueve una versión nueva, la API la toma sin reiniciarse.
        while True:
            await asyncio.sleep(self.config.segundos_entre_recargas_de_modelos)
            try:
                await self.modelos_documentos.refrescar()
                await self.motores.refrescar()
            except Exception:  # una recarga fallida no debe tumbar la API
                log.exception("recarga_modelos_fallida")

    async def cerrar(self) -> None:
        if self._recarga is not None:
            self._recarga.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._recarga
        await self._pila.aclose()


def _cliente_llm(config: Config) -> AsyncAnthropicBedrockMantle | None:
    if config.lector_normativa == "ninguno":
        return None
    return AsyncAnthropicBedrockMantle(
        aws_region=config.bedrock_region,
        aws_profile=config.aws_perfil or None,
        timeout=config.segundos_lector_normativa,
        max_retries=2,
        middleware=[BetaRefusalFallbackMiddleware([{"model": config.modelo_llm_respaldo}])],
    )
