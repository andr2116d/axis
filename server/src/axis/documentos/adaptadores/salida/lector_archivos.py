"""Lee PDF, Excel (.xlsx) e imágenes sin OCR: tipo real, huella y el texto que ya traen."""

import asyncio
import io
import re
import zipfile
from datetime import UTC, datetime, timedelta, timezone

import openpyxl
import pypdfium2 as pdfium
import pypdfium2.raw as pdfium_c
from PIL import Image

from axis.compartido.infraestructura.pdfium import CANDADO_PDFIUM
from axis.documentos.aplicacion.dto import LecturaArchivo, PaginaLeida
from axis.documentos.dominio.entidades import Huella
from axis.documentos.dominio.errores import ArchivoIlegible
from axis.documentos.dominio.valores import TipoArchivo

_FIRMA_PDF = b"%PDF"
_FIRMA_ZIP = b"PK\x03\x04"
_FIRMAS_IMAGEN = (b"\x89PNG", b"\xff\xd8\xff", b"II*\x00", b"MM\x00*")
_RANGO_FIRMA = re.compile(rb"/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]")
_FECHA_PDF = re.compile(
    r"D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+\-])?(\d{2})?'?(\d{2})?"
)
# Bytes que puede haber tras el fin de la firma (salto de línea final) sin que cuente como añadido.
_HOLGURA_FIN_FIRMA = 2
# Cuánto texto se guarda por hoja de cálculo: basta para clasificarla.
_MAX_CARACTERES_HOJA = 20_000
_PUNTOS_POR_PULGADA = 72.0
_EXIF_SOFTWARE = 305
_EXIF_FECHA = 306


class LectorArchivosLocal:
    def detectar_tipo(self, contenido: bytes) -> TipoArchivo:
        # Se mira el contenido, no la extensión: un ".pdf" renombrado no engaña.
        if contenido.startswith(_FIRMA_PDF) or _FIRMA_PDF in contenido[:1024]:
            return TipoArchivo.PDF
        if contenido.startswith(_FIRMAS_IMAGEN):
            return TipoArchivo.IMAGEN
        if contenido.startswith(_FIRMA_ZIP) and _es_libro_excel(contenido):
            return TipoArchivo.HOJA_CALCULO
        return TipoArchivo.DESCONOCIDO

    async def leer(self, contenido: bytes, tipo_archivo: TipoArchivo) -> LecturaArchivo:
        lectores = {
            TipoArchivo.PDF: _leer_pdf,
            TipoArchivo.HOJA_CALCULO: _leer_hoja,
            TipoArchivo.IMAGEN: _leer_imagen,
        }
        lector = lectores.get(tipo_archivo)
        if lector is None:
            raise ArchivoIlegible(f"no hay lector para {tipo_archivo}")
        return await asyncio.to_thread(lector, contenido)


def _es_libro_excel(contenido: bytes) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as archivo:
            return "xl/workbook.xml" in archivo.namelist()
    except zipfile.BadZipFile:
        return False


# ---------- PDF ----------


def _leer_pdf(contenido: bytes) -> LecturaArchivo:
    with CANDADO_PDFIUM:
        try:
            pdf = pdfium.PdfDocument(contenido)
        except pdfium.PdfiumError as error:
            raise ArchivoIlegible("el PDF está dañado o protegido con contraseña") from error
        try:
            metadatos = pdf.get_metadata_dict(skip_empty=True)
            paginas = tuple(_leer_pagina_pdf(pdf, i) for i in range(len(pdf)))
        finally:
            pdf.close()
    firmas = [tuple(int(x) for x in m.groups()) for m in _RANGO_FIRMA.finditer(contenido)]
    huella = Huella(
        tipo_archivo=TipoArchivo.PDF,
        tamano_bytes=len(contenido),
        programa_creador=_texto(metadatos.get("Creator")),
        programa_productor=_texto(metadatos.get("Producer")),
        creado_en=_fecha_pdf(metadatos.get("CreationDate")),
        modificado_en=_fecha_pdf(metadatos.get("ModDate")),
        revisiones=_contar_revisiones(contenido),
        firmas=len(firmas),
        firmas_que_no_cubren_todo=sum(
            1 for r in firmas if len(contenido) - (r[2] + r[3]) > _HOLGURA_FIN_FIRMA
        ),
    )
    return LecturaArchivo(huella, paginas)


def _leer_pagina_pdf(pdf: pdfium.PdfDocument, indice: int) -> PaginaLeida:
    pagina = pdf[indice]
    try:
        ancho, alto = pagina.get_size()
        pagina_texto = pagina.get_textpage()
        texto = str(pagina_texto.get_text_bounded())
        pagina_texto.close()
        area_imagenes = 0.0
        for objeto in pagina.get_objects(filter=[pdfium_c.FPDF_PAGEOBJ_IMAGE], max_depth=3):
            izquierda, abajo, derecha, arriba = objeto.get_bounds()
            area_imagenes += max(0.0, derecha - izquierda) * max(0.0, arriba - abajo)
    finally:
        pagina.close()
    area = max(1.0, float(ancho) * float(alto))
    return PaginaLeida(
        numero=indice + 1,
        texto=texto,
        cobertura_imagen=min(1.0, area_imagenes / area),
        ancho_pt=float(ancho),
        alto_pt=float(alto),
    )


def _contar_revisiones(contenido: bytes) -> int:
    finales = contenido.count(b"%%EOF")
    # Un PDF "optimizado para web" trae dos finales desde que nace: no es una edición.
    if b"/Linearized" in contenido[:2048]:
        finales -= 1
    return max(1, finales)


def _fecha_pdf(valor: object) -> datetime | None:
    if not isinstance(valor, str):
        return None
    m = _FECHA_PDF.match(valor.strip())
    if m is None:
        return None
    anio, mes, dia, hora, minuto, segundo, signo, tz_h, tz_m = m.groups()
    zona = UTC
    if signo in {"+", "-"} and tz_h:
        desfase = timedelta(hours=int(tz_h), minutes=int(tz_m or 0))
        zona = timezone(desfase if signo == "+" else -desfase)
    try:
        return datetime(
            int(anio),
            int(mes or 1),
            int(dia or 1),
            int(hora or 0),
            int(minuto or 0),
            int(segundo or 0),
            tzinfo=zona,
        )
    except ValueError:
        return None


def _texto(valor: object) -> str | None:
    if not isinstance(valor, str):
        return None
    limpio = valor.strip().strip("\x00")
    return limpio or None


# ---------- Hoja de cálculo ----------


def _leer_hoja(contenido: bytes) -> LecturaArchivo:
    try:
        libro = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except (zipfile.BadZipFile, KeyError, ValueError) as error:
        raise ArchivoIlegible("el Excel está dañado") from error
    try:
        # Cada hoja cuenta como una página: un Excel de metrados suele traer una hoja por partida.
        paginas = tuple(
            PaginaLeida(
                numero=i + 1,
                texto=_texto_hoja(hoja),
                cobertura_imagen=0.0,
                ancho_pt=0.0,
                alto_pt=0.0,
            )
            for i, hoja in enumerate(libro.worksheets)
        )
        propiedades = libro.properties
        huella = Huella(
            tipo_archivo=TipoArchivo.HOJA_CALCULO,
            tamano_bytes=len(contenido),
            # Solo el programa: creator y lastModifiedBy son nombres de personas y no se guardan.
            programa_creador=_aplicacion_office(contenido),
            programa_productor=None,
            creado_en=_con_zona(propiedades.created),
            modificado_en=_con_zona(propiedades.modified),
            revisiones=1,
            firmas=0,
            firmas_que_no_cubren_todo=0,
        )
    finally:
        libro.close()
    return LecturaArchivo(huella, paginas)


def _texto_hoja(hoja: object) -> str:
    lineas: list[str] = []
    total = 0
    for fila in hoja.iter_rows(values_only=True):  # type: ignore[attr-defined]  # openpyxl sin tipos
        celdas = [str(c) for c in fila if c is not None and str(c).strip()]
        if not celdas:
            continue
        linea = "\t".join(celdas)
        lineas.append(linea)
        total += len(linea)
        if total > _MAX_CARACTERES_HOJA:
            break
    return "\n".join(lineas)


def _aplicacion_office(contenido: bytes) -> str | None:
    try:
        with zipfile.ZipFile(io.BytesIO(contenido)) as archivo:
            xml = archivo.read("docProps/app.xml").decode("utf-8", "ignore")
    except (KeyError, zipfile.BadZipFile):
        return None
    m = re.search(r"<Application>([^<]+)</Application>", xml)
    return m.group(1).strip() if m else None


def _con_zona(fecha: object) -> datetime | None:
    if not isinstance(fecha, datetime):
        return None
    # Office guarda las fechas en UTC sin indicarlo.
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=UTC)


# ---------- Imagen ----------


def _leer_imagen(contenido: bytes) -> LecturaArchivo:
    try:
        with Image.open(io.BytesIO(contenido)) as imagen:
            ancho, alto = imagen.size
            dpi = imagen.info.get("dpi", (_PUNTOS_POR_PULGADA * 2, _PUNTOS_POR_PULGADA * 2))
            exif = imagen.getexif()
    except OSError as error:
        raise ArchivoIlegible("la imagen está dañada") from error
    escala = _PUNTOS_POR_PULGADA / float(dpi[0] or _PUNTOS_POR_PULGADA)
    pagina = PaginaLeida(
        numero=1,
        texto="",
        cobertura_imagen=1.0,
        ancho_pt=ancho * escala,
        alto_pt=alto * escala,
    )
    huella = Huella(
        tipo_archivo=TipoArchivo.IMAGEN,
        tamano_bytes=len(contenido),
        programa_creador=_texto(exif.get(_EXIF_SOFTWARE)),
        programa_productor=None,
        creado_en=_fecha_exif(exif.get(_EXIF_FECHA)),
        modificado_en=None,
        revisiones=1,
        firmas=0,
        firmas_que_no_cubren_todo=0,
    )
    return LecturaArchivo(huella, (pagina,))


def _fecha_exif(valor: object) -> datetime | None:
    if not isinstance(valor, str):
        return None
    try:
        return datetime.strptime(valor, "%Y:%m:%d %H:%M:%S").replace(tzinfo=UTC)
    except ValueError:
        return None
