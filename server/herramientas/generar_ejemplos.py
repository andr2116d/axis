"""Genera PDFs sintéticos para probar la subida de punta a punta (fuera del repo).

    uv run python -m herramientas.generar_ejemplos ../../expedientes-de-prueba/ocr

- metrados_escaneado.pdf      páginas como imagen torcida y con ruido: obliga a pasar por OCR
- valorizacion_de_obra.pdf    un entregable de ejecución: subido en Expediente debe avisar
- expediente_editado.pdf      digital, con una página escaneada intercalada y guardado encima
"""

import io
import random
import sys
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image, ImageFilter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from herramientas import sintetico

_MARGEN = 50
_INTERLINEA = 13
_AVISO = "DOCUMENTO SINTÉTICO DE PRUEBA - AXIS"


def _pdf_digital(paginas: list[str], creador: str) -> bytes:
    bufer = io.BytesIO()
    lienzo = canvas.Canvas(bufer, pagesize=A4)
    lienzo.setCreator(creador)
    lienzo.setProducer(creador)
    for texto in paginas:
        _escribir(lienzo, texto)
        lienzo.showPage()
    lienzo.save()
    return bufer.getvalue()


def _escribir(lienzo: canvas.Canvas, texto: str) -> None:
    lienzo.setFont("Helvetica", 7)
    lienzo.drawString(_MARGEN, 20, _AVISO)
    lienzo.setFont("Helvetica", 9)
    y = A4[1] - _MARGEN
    for linea in texto.splitlines():
        for trozo in [linea[i : i + 110] for i in range(0, max(1, len(linea)), 110)]:
            if y < _MARGEN:
                return
            lienzo.drawString(_MARGEN, y, trozo)
            y -= _INTERLINEA


def _escanear(pdf: bytes, r: random.Random) -> list[Image.Image]:
    """Rasteriza cada página como lo haría un escáner barato: gris, torcida y con ruido."""
    documento = pdfium.PdfDocument(pdf)
    imagenes = []
    for pagina in documento:
        imagen = pagina.render(scale=150 / 72, grayscale=True).to_pil().convert("L")
        imagen = imagen.rotate(r.uniform(-1.5, 1.5), expand=False, fillcolor=255)
        imagen = imagen.filter(ImageFilter.GaussianBlur(r.uniform(0.3, 0.8)))
        pixeles = imagen.load()
        ancho, alto = imagen.size
        for _ in range(ancho * alto // 400):
            pixeles[r.randrange(ancho), r.randrange(alto)] = r.choice((0, 90, 200))
        imagenes.append(imagen)
    documento.close()
    return imagenes


def _pdf_de_imagenes(imagenes: list[Image.Image], productor: str) -> bytes:
    bufer = io.BytesIO()
    lienzo = canvas.Canvas(bufer, pagesize=A4)
    lienzo.setCreator(productor)
    lienzo.setProducer(productor)
    for imagen in imagenes:
        lienzo.drawInlineImage(imagen, 0, 0, width=A4[0], height=A4[1])
        lienzo.showPage()
    lienzo.save()
    return bufer.getvalue()


def _textos(tipo: str, r: random.Random, v: sintetico.Vocabulario, maximo: int) -> list[str]:
    paginas = [t for _, t in sintetico.documento(tipo, r, v)][:maximo]
    return [f"{_AVISO}\n{t}" for t in paginas]


def generar(destino: Path) -> None:
    r = random.Random(2026)
    v = sintetico.Vocabulario.desde(Path("../../datos-crudos"))
    destino.mkdir(parents=True, exist_ok=True)

    metrados = _pdf_digital(_textos("metrados", r, v, 6), "Microsoft Excel")
    (destino / "metrados_escaneado.pdf").write_bytes(
        _pdf_de_imagenes(_escanear(metrados, r), "RICOH IM 550")
    )

    valorizacion = _pdf_digital(_textos("valorizacion", r, v, 8), "Microsoft Word")
    (destino / "valorizacion_de_obra.pdf").write_bytes(valorizacion)

    expediente = _textos("expediente_tecnico", r, v, 30)
    digital = pdfium.PdfDocument(_pdf_digital(expediente, "Microsoft Word"))
    escaneada = pdfium.PdfDocument(
        _pdf_de_imagenes(_escanear(_pdf_digital([expediente[12]], "Word"), r), "iLovePDF")
    )
    # La página 13 se reemplaza por una versión escaneada, como quien cambia una hoja.
    digital.del_page(12)
    digital.import_pages(escaneada, [0], index=12)
    bufer = io.BytesIO()
    digital.save(bufer)
    # Un guardado incremental deja una revisión nueva al final del archivo.
    editado = bufer.getvalue() + b"\n% revision\nstartxref\n0\n%%EOF\n"
    (destino / "expediente_editado.pdf").write_bytes(editado)
    print(f"Ejemplos en {destino.resolve()}")


if __name__ == "__main__":
    generar(Path(sys.argv[1] if len(sys.argv) > 1 else "../../expedientes-de-prueba/ocr"))
