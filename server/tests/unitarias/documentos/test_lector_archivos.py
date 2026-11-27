import io

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.dominio.servicios import clasificar_origen
from axis.documentos.dominio.valores import OrigenPagina, TipoArchivo


def pdf_con_pagina_escaneada():
    bufer = io.BytesIO()
    lienzo = canvas.Canvas(bufer, pagesize=A4)
    lienzo.setCreator("Microsoft Word")
    lienzo.drawString(72, 800, "MEMORIA DESCRIPTIVA " * 5)
    lienzo.showPage()
    imagen = Image.new("L", (600, 850), 255)
    lienzo.drawInlineImage(imagen, 0, 0, width=A4[0], height=A4[1])
    lienzo.showPage()
    lienzo.save()
    return bufer.getvalue()


def test_detecta_el_tipo_por_el_contenido_y_no_por_el_nombre():
    lector = LectorArchivosLocal()

    assert lector.detectar_tipo(pdf_con_pagina_escaneada()) is TipoArchivo.PDF
    assert lector.detectar_tipo(b"\x89PNG\r\n\x1a\n...") is TipoArchivo.IMAGEN
    assert lector.detectar_tipo(b"texto plano") is TipoArchivo.DESCONOCIDO


async def test_distingue_pagina_digital_de_escaneada():
    lectura = await LectorArchivosLocal().leer(pdf_con_pagina_escaneada(), TipoArchivo.PDF)

    origenes = [
        clasificar_origen(len(p.texto.strip()), p.cobertura_imagen) for p in lectura.paginas
    ]
    assert origenes == [OrigenPagina.DIGITAL, OrigenPagina.ESCANEADA]
    assert lectura.huella.programa_creador == "Microsoft Word"
    assert lectura.huella.revisiones == 1


async def test_cuenta_revisiones_guardadas_encima():
    original = pdf_con_pagina_escaneada()
    # Un guardado incremental agrega otra sección y otro %%EOF al final del archivo.
    editado = original + b"\n1 0 obj\n<<>>\nendobj\nstartxref\n0\n%%EOF\n"

    lectura = await LectorArchivosLocal().leer(editado, TipoArchivo.PDF)

    assert lectura.huella.revisiones == 2
