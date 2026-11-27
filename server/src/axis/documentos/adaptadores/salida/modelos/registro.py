"""Registro de versiones en S3: un puntero `actual.json` y un artefacto por versión."""

import asyncio
import hashlib
import io
import json

import joblib
import structlog
from botocore.exceptions import ClientError

from axis.compartido.infraestructura.s3 import ClienteS3
from axis.documentos.adaptadores.salida.modelos.sklearn import ArtefactoDocumentos, ModelosSklearn

log = structlog.get_logger()

PREFIJO = "documentos"
CLAVE_PUNTERO = f"{PREFIJO}/actual.json"


def serializar(artefacto: ArtefactoDocumentos) -> bytes:
    bufer = io.BytesIO()
    joblib.dump(artefacto, bufer, compress=3)
    return bufer.getvalue()


def puntero(version: str, contenido: bytes) -> bytes:
    datos = {
        "version": version,
        "clave": clave_artefacto(version),
        "sha256": hashlib.sha256(contenido).hexdigest(),
    }
    return json.dumps(datos).encode()


def clave_artefacto(version: str) -> str:
    return f"{PREFIJO}/{version}/artefacto.joblib"


class RegistroModelosS3:
    def __init__(self, cliente: ClienteS3, bucket: str) -> None:
        self._cliente = cliente
        self._bucket = bucket

    async def version_actual(self) -> dict[str, str] | None:
        try:
            respuesta = await self._cliente.get_object(Bucket=self._bucket, Key=CLAVE_PUNTERO)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"NoSuchKey", "NoSuchBucket"}:
                return None
            raise
        datos = json.loads(await respuesta["Body"].read())
        return {str(k): str(v) for k, v in datos.items()}

    async def cargar(self, puntero_actual: dict[str, str]) -> ModelosSklearn:
        respuesta = await self._cliente.get_object(Bucket=self._bucket, Key=puntero_actual["clave"])
        contenido = await respuesta["Body"].read()
        # joblib ejecuta pickle: solo se cargan artefactos de nuestro bucket y con el hash esperado.
        if hashlib.sha256(contenido).hexdigest() != puntero_actual["sha256"]:
            raise ValueError("el artefacto no coincide con el hash del puntero")
        artefacto = await asyncio.to_thread(joblib.load, io.BytesIO(contenido))
        if not isinstance(artefacto, ArtefactoDocumentos):
            raise TypeError("el artefacto no es de documentos")
        return ModelosSklearn(artefacto)


class ProveedorModelosRecargable:
    """Tiene la versión cargada y la cambia cuando el puntero apunta a otra, sin reiniciar."""

    def __init__(self, registro: RegistroModelosS3) -> None:
        self._registro = registro
        self._actual: ModelosSklearn | None = None

    def actual(self) -> ModelosSklearn | None:
        return self._actual

    async def refrescar(self) -> None:
        puntero_actual = await self._registro.version_actual()
        if puntero_actual is None:
            return
        if self._actual is not None and self._actual.version == puntero_actual["version"]:
            return
        self._actual = await self._registro.cargar(puntero_actual)
        log.info("modelos_documentos_cargados", version=self._actual.version)
