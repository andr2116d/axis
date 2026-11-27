from typing import Protocol


class CuerpoS3(Protocol):
    async def read(self) -> bytes: ...


class ClienteS3(Protocol):
    """Lo que Axis usa del cliente de S3 (aioboto3). Sirve igual para MinIO en local y S3 en AWS."""

    async def put_object(
        self, *, Bucket: str, Key: str, Body: bytes, ContentType: str
    ) -> object: ...
    async def get_object(self, *, Bucket: str, Key: str) -> dict[str, CuerpoS3]: ...
