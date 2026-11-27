import os

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
    segundos_entre_recargas_de_modelos: int = 60
    log_json: bool = True

    @property
    def limite_subida_bytes(self) -> int:
        return self.limite_subida_mb * 1_000_000
