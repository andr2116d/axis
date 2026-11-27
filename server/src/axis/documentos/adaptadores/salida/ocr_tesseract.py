"""OCR local con Tesseract. En AWS se reemplaza por Textract con el mismo puerto."""

import asyncio
import io
from collections.abc import Mapping, Sequence

import pypdfium2 as pdfium
import pytesseract
from PIL import Image, ImageOps

from axis.compartido.infraestructura.pdfium import CANDADO_PDFIUM
from axis.documentos.aplicacion.dto import TextoReconocido
from axis.documentos.dominio.errores import ArchivoIlegible
from axis.documentos.dominio.partidas import Palabra
from axis.documentos.dominio.valores import TipoArchivo

_PUNTOS_POR_PULGADA = 72


class OcrTesseract:
    def __init__(self, idioma: str, dpi: int, concurrencia: int) -> None:
        self._idioma = idioma
        self._dpi = dpi
        self._concurrencia = concurrencia

    async def reconocer(
        self, contenido: bytes, tipo_archivo: TipoArchivo, paginas: Sequence[int]
    ) -> Mapping[int, TextoReconocido]:
        resultado: dict[int, TextoReconocido] = {}
        # Se renderiza por tandas para no tener cien imágenes de 4 MB en memoria a la vez.
        tanda = max(1, self._concurrencia * 2)
        for inicio in range(0, len(paginas), tanda):
            numeros = list(paginas[inicio : inicio + tanda])
            imagenes = await asyncio.to_thread(self._imagenes, contenido, tipo_archivo, numeros)
            textos = await asyncio.gather(*(asyncio.to_thread(self._leer, i) for i in imagenes))
            resultado.update(zip(numeros, textos, strict=True))
        return resultado

    def _imagenes(
        self, contenido: bytes, tipo_archivo: TipoArchivo, numeros: list[int]
    ) -> list[Image.Image]:
        if tipo_archivo is TipoArchivo.IMAGEN:
            with Image.open(io.BytesIO(contenido)) as imagen:
                return [ImageOps.exif_transpose(imagen).convert("L")]
        if tipo_archivo is not TipoArchivo.PDF:
            raise ArchivoIlegible(f"no se hace OCR de {tipo_archivo}")
        escala = self._dpi / _PUNTOS_POR_PULGADA
        with CANDADO_PDFIUM:
            pdf = pdfium.PdfDocument(contenido)
            try:
                return [pdf[n - 1].render(scale=escala, grayscale=True).to_pil() for n in numeros]
            finally:
                pdf.close()

    def _leer(self, imagen: Image.Image) -> TextoReconocido:
        datos = pytesseract.image_to_data(
            imagen, lang=self._idioma, config="--psm 3", output_type=pytesseract.Output.DICT
        )
        return _armar_texto(datos, _PUNTOS_POR_PULGADA / self._dpi)


def _armar_texto(datos: Mapping[str, list[object]], escala: float) -> TextoReconocido:
    """Texto por líneas para clasificar, y cada palabra con su caja (en puntos) para las tablas."""
    lineas: dict[tuple[int, int, int], list[str]] = {}
    confianzas: list[float] = []
    palabras: list[Palabra] = []
    for i, palabra in enumerate(datos["text"]):
        texto = str(palabra).strip()
        confianza = float(str(datos["conf"][i]))
        if not texto or confianza < 0:
            continue
        clave = (
            int(str(datos["block_num"][i])),
            int(str(datos["par_num"][i])),
            int(str(datos["line_num"][i])),
        )
        lineas.setdefault(clave, []).append(texto)
        confianzas.append(confianza)
        x, y = float(str(datos["left"][i])), float(str(datos["top"][i]))
        ancho, alto = float(str(datos["width"][i])), float(str(datos["height"][i]))
        linea = clave[0] * 1_000_000 + clave[1] * 1_000 + clave[2]
        palabras.append(
            Palabra(texto, x * escala, y * escala, (x + ancho) * escala, (y + alto) * escala, linea)
        )
    texto = "\n".join(" ".join(palabras) for _, palabras in sorted(lineas.items()))
    promedio = sum(confianzas) / len(confianzas) / 100 if confianzas else 0.0
    return TextoReconocido(
        texto=texto, confianza=round(min(1.0, promedio), 3), palabras=tuple(palabras)
    )
