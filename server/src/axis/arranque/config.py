import os
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    """Todo sale del entorno (AXIS_*): en local lo pone docker compose; en AWS, la tarea ECS."""

    model_config = SettingsConfigDict(env_prefix="AXIS_", extra="ignore")

    entorno: str = "local"
    base_datos_url: str = "postgresql+asyncpg://axis:axis@localhost:5433/axis"
    base_datos_pool: int = 10

    # Vacío en AWS: aioboto3 usa S3 de la región. En local apunta a MinIO.
    s3_endpoint: str | None = None
    s3_region: str = "us-east-1"
    s3_bucket_documentos: str = "axis-documentos"
    s3_bucket_modelos: str = "axis-modelos"

    ocr_idioma: str = "spa"
    ocr_dpi: int = 200
    ocr_concurrencia: int = Field(default_factory=lambda: os.cpu_count() or 2)

    limite_subida_mb: int = 200
    # Un motor que tarda más que esto se informa como falla y no frena a los demás.
    segundos_por_motor: float = 10.0
    segundos_entre_recargas_de_modelos: int = 60
    log_json: bool = True

    # El LLM de Bedrock lee la normativa. "ninguno": solo búsqueda por palabras.
    lector_normativa: Literal["bedrock", "ninguno"] = "bedrock"
    bedrock_region: str = "us-east-1"
    # En local, el perfil de ~/.aws; en AWS se deja vacío y se usa el rol de la tarea ECS.
    aws_perfil: str | None = None
    modelo_llm: str = "anthropic.claude-opus-5-5"
    # Si el LLM declina una consulta, la reintenta este modelo (Bedrock no lo hace solo).
    modelo_llm_respaldo: str = "anthropic.claude-opus-4-8"
    esfuerzo_normativa: Literal["low", "medium", "high", "xhigh", "max"] = "medium"
    segundos_lector_normativa: float = 90.0

    @property
    def limite_subida_bytes(self) -> int:
        return self.limite_subida_mb * 1_000_000
