"""Registro de versiones de un modelo en S3: un puntero `actual.json` y un artefacto por versión.

Lo usan los motores. Una versión se promueve solo si no empeora la métrica que el motor declara.
"""

import hashlib
import json

from botocore.exceptions import ClientError

from axis.compartido.infraestructura.s3 import ClienteS3


class RegistroArtefactos:
    def __init__(self, cliente: ClienteS3, bucket: str, prefijo: str) -> None:
        self._cliente = cliente
        self._bucket = bucket
        self._prefijo = prefijo

    @property
    def clave_puntero(self) -> str:
        return f"{self._prefijo}/actual.json"

    def clave_artefacto(self, version: str) -> str:
        return f"{self._prefijo}/{version}/artefacto.joblib"

    async def puntero(self) -> dict[str, str] | None:
        datos = await self._leer(self.clave_puntero)
        return {str(k): str(v) for k, v in json.loads(datos).items()} if datos else None

    async def cargar(self, puntero: dict[str, str]) -> bytes:
        contenido = await self._leer(puntero["clave"])
        # El artefacto se deserializa con pickle: solo se acepta si el hash es el esperado.
        if contenido is None or hashlib.sha256(contenido).hexdigest() != puntero["sha256"]:
            raise ValueError(f"el artefacto {puntero['clave']} no coincide con su puntero")
        return contenido

    async def publicar(
        self, version: str, contenido: bytes, metricas: dict[str, object], *, promover: bool
    ) -> None:
        clave = self.clave_artefacto(version)
        await self._cliente.put_object(
            Bucket=self._bucket, Key=clave, Body=contenido, ContentType="application/octet-stream"
        )
        await self._cliente.put_object(
            Bucket=self._bucket,
            Key=f"{self._prefijo}/{version}/metricas.json",
            Body=json.dumps(metricas, ensure_ascii=False).encode(),
            ContentType="application/json",
        )
        if promover:
            puntero = {
                "version": version,
                "clave": clave,
                "sha256": hashlib.sha256(contenido).hexdigest(),
            }
            await self._cliente.put_object(
                Bucket=self._bucket,
                Key=self.clave_puntero,
                Body=json.dumps(puntero).encode(),
                ContentType="application/json",
            )

    async def metricas(self, version: str) -> dict[str, object] | None:
        datos = await self._leer(f"{self._prefijo}/{version}/metricas.json")
        return json.loads(datos) if datos else None

    async def _leer(self, clave: str) -> bytes | None:
        try:
            respuesta = await self._cliente.get_object(Bucket=self._bucket, Key=clave)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in {"NoSuchKey", "NoSuchBucket"}:
                return None
            raise
        return await respuesta["Body"].read()
