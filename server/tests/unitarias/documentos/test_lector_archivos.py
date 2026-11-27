import io

from PIL import Image
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from axis.compartido.dominio.partidas import extraer_partidas
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


def pdf_presupuesto():
    bufer = io.BytesIO()
    lienzo = canvas.Canvas(bufer, pagesize=A4)
    lienzo.setFont("Helvetica", 8)
    filas = [
        ("01.01", "OBRAS PROVISIONALES", "", "", "", "3,083.63"),
        ("01.01.01", "CARTEL DE IDENTIFICACION DE OBRA", "und", "1.00", "1,883.63", "1,883.63"),
        ("01.01.02", "OFICINA, ALMACEN Y GUARDIANIA", "mes", "1.00", "1,200.00", "1,200.00"),
        ("01.02.04", "TRAZO Y REPLANTEO", "m2", "2,409.81", "1.41", "3,397.83"),
    ]
    y = 700
    for item, descripcion, unidad, cantidad, precio, parcial in filas:
        lienzo.drawString(52, y, item)
        lienzo.drawString(104, y, descripcion)
        lienzo.drawString(300, y, unidad)
        lienzo.drawRightString(380, y, cantidad)
        lienzo.drawRightString(440, y, precio)
        lienzo.drawRightString(540, y, parcial)
        y -= 10
    lienzo.showPage()
    lienzo.save()
    return bufer.getvalue()


async def test_las_palabras_del_pdf_permiten_rearmar_las_partidas():
    lectura = await LectorArchivosLocal().leer(pdf_presupuesto(), TipoArchivo.PDF)
    pagina = lectura.paginas[0]

    partidas = extraer_partidas(1, pagina.palabras)

    assert [p.item for p in partidas] == ["01.01", "01.01.01", "01.01.02", "01.02.04"]
    assert partidas[0].es_titulo
    assert [p.cuadra for p in partidas[1:]] == [True, True, True]
    assert partidas[1].descripcion == "CARTEL DE IDENTIFICACION DE OBRA"
