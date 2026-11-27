from axis.compartido.infraestructura.s3 import ClienteS3
from axis.documentos.dominio.valores import TipoArchivo

_TIPOS_MIME = {
    TipoArchivo.PDF: "application/pdf",
    TipoArchivo.HOJA_CALCULO: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    TipoArchivo.IMAGEN: "application/octet-stream",
    TipoArchivo.DESCONOCIDO: "application/octet-stream",
}


class AlmacenS3:
    def __init__(self, cliente: ClienteS3, bucket: str) -> None:
        self._cliente = cliente
        self._bucket = bucket

    async def guardar(self, clave: str, contenido: bytes, tipo_archivo: TipoArchivo) -> None:
        await self._cliente.put_object(
            Bucket=self._bucket, Key=clave, Body=contenido, ContentType=_TIPOS_MIME[tipo_archivo]
        )
