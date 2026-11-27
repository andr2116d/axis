"""Crea los buckets en el almacén local. En AWS los crea Terraform."""

import asyncio

import aioboto3
from botocore.exceptions import ClientError

from axis.arranque.config import Config


async def crear() -> None:
    config = Config()
    sesion = aioboto3.Session()
    async with sesion.client(
        "s3", endpoint_url=config.s3_endpoint, region_name=config.s3_region
    ) as s3:
        for bucket in (config.s3_bucket_documentos, config.s3_bucket_modelos):
            try:
                await s3.create_bucket(Bucket=bucket)
            except ClientError as error:
                codigo = error.response.get("Error", {}).get("Code")
                if codigo not in {"BucketAlreadyOwnedByYou", "BucketAlreadyExists"}:
                    raise


if __name__ == "__main__":
    asyncio.run(crear())
