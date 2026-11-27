"""Corpus real de `datos-crudos`: documentos de SEACE leídos con el mismo lector que usa la API.

El nombre del archivo da una etiqueta débil, solo para entrenar. Lo que se lee del archivo
(huella, páginas, origen) sale del adaptador real, así el modelo aprende de lo mismo que verá.
"""

import asyncio
import hashlib
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import joblib

from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.dominio.entidades import Huella, Pagina
from axis.documentos.dominio.errores import ArchivoIlegible
from axis.documentos.dominio.servicios import clasificar_origen
from axis.documentos.dominio.valores import OrigenPagina, TipoArchivo
from herramientas.taxonomia import NOMBRE_A_TIPO

# Una página con menos texto que esto no enseña nada sobre su tipo.
CARACTERES_MINIMOS = 120
# Un TXT plano (contratos, pliegos) se parte en "páginas" de este tamaño si no trae saltos.
CARACTERES_POR_PAGINA = 2500


@dataclass(frozen=True)
class DocumentoReal:
    ruta: str
    tipo: str | None  # etiqueta débil por nombre; None si el nombre no dice nada
    huella: Huella | None  # None para TXT, que no tienen huella de archivo
    paginas: tuple[Pagina, ...]


def etiqueta_por_nombre(nombre: str) -> str | None:
    normal = "".join(
        c for c in unicodedata.normalize("NFKD", nombre.upper()) if not unicodedata.combining(c)
    ).replace("_", " ")
    for clave, tipo in NOMBRE_A_TIPO:
        if clave in normal:
            return tipo
    return None


def cargar(datos_crudos: Path, cache: Path) -> list[DocumentoReal]:
    # Los PDF de pliegos no tienen nombre útil: no dan etiqueta, pero sí enseñan cómo es la
    # huella de un archivo normal de SEACE (para el medidor de rareza).
    pdfs = sorted(
        p
        for carpeta in ("bases_extraidas", "pliegos")
        for p in (datos_crudos / carpeta).rglob("*")
        if p.suffix.lower() == ".pdf"
    )
    firma = hashlib.sha256("|".join(f"{p}:{p.stat().st_size}" for p in pdfs).encode()).hexdigest()[
        :16
    ]
    archivo_cache = cache / f"corpus_real_{firma}.joblib"
    if archivo_cache.exists():
        return list(joblib.load(archivo_cache))
    documentos = _leer_pdfs(pdfs) + _leer_txt(datos_crudos)
    cache.mkdir(parents=True, exist_ok=True)
    joblib.dump(documentos, archivo_cache, compress=3)
    return documentos


def _leer_pdfs(pdfs: list[Path]) -> list[DocumentoReal]:
    lector = LectorArchivosLocal()

    async def leer_todos() -> list[DocumentoReal]:
        salida = []
        for i, ruta in enumerate(pdfs, 1):
            if i % 100 == 0:
                print(f"  leídos {i}/{len(pdfs)} PDF reales")
            try:
                lectura = await lector.leer(ruta.read_bytes(), TipoArchivo.PDF)
            except ArchivoIlegible:
                continue
            paginas = tuple(
                Pagina(
                    p.numero,
                    clasificar_origen(len(p.texto.strip()), p.cobertura_imagen),
                    p.texto,
                    p.ancho_pt,
                    p.alto_pt,
                )
                for p in lectura.paginas
            )
            salida.append(
                DocumentoReal(str(ruta), etiqueta_por_nombre(ruta.name), lectura.huella, paginas)
            )
        return salida

    return asyncio.run(leer_todos())


def _leer_txt(datos_crudos: Path) -> list[DocumentoReal]:
    # Contratos y bases ya pasados por OCR: enseñan cómo se ve el texto de un escaneo real.
    fuentes = (("contratos_txt", "contrato"), ("pliegos", "bases"))
    documentos = []
    for carpeta, tipo in fuentes:
        for ruta in sorted((datos_crudos / carpeta).glob("*.txt")):
            texto = ruta.read_text(errors="ignore")
            trozos = (
                [t for t in texto.split("\f") if t.strip()]
                if "\f" in texto
                else [
                    texto[i : i + CARACTERES_POR_PAGINA]
                    for i in range(0, len(texto), CARACTERES_POR_PAGINA)
                ]
            )
            paginas = tuple(
                Pagina(n, OrigenPagina.ESCANEADA, t, 595.0, 842.0) for n, t in enumerate(trozos, 1)
            )
            documentos.append(DocumentoReal(str(ruta), tipo, None, paginas))
    return documentos


def paginas_etiquetadas(documento: DocumentoReal) -> list[str]:
    """Textos útiles del documento; todos llevan la etiqueta débil del documento."""
    return [
        p.texto
        for p in documento.paginas
        if p.origen is not OrigenPagina.VACIA and len(p.texto.strip()) >= CARACTERES_MINIMOS
    ]
