"""Base de precios reales: partidas de todos los presupuestos de `datos-crudos`.

    docker compose --profile entrenamiento run --rm entrenar python -m herramientas.base_precios

Usa el mismo lector, OCR y extractor que la API. Solo entran a la base las filas que cuadran
(cantidad × precio ≈ parcial): son las únicas en las que el precio leído es confiable.
"""

import asyncio
import hashlib
import json
import os
import time
from collections import Counter
from pathlib import Path

from axis.arranque.config import Config
from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.adaptadores.salida.ocr_tesseract import OcrTesseract
from axis.documentos.dominio.errores import ArchivoIlegible
from axis.documentos.dominio.partidas import Partida, extraer_partidas
from axis.documentos.dominio.servicios import clasificar_origen
from axis.documentos.dominio.valores import OrigenPagina, TipoArchivo

SALIDA = Path(".cache/precios_reales.jsonl")


async def leer(
    ruta: Path, lector: LectorArchivosLocal, ocr: OcrTesseract
) -> tuple[list[Partida], str]:
    contenido = ruta.read_bytes()
    lectura = await lector.leer(contenido, TipoArchivo.PDF)
    origenes = {
        p.numero: clasificar_origen(len(p.texto.strip()), p.cobertura_imagen)
        for p in lectura.paginas
    }
    escaneadas = [n for n, o in origenes.items() if o is OrigenPagina.ESCANEADA]
    reconocidas = await ocr.reconocer(contenido, TipoArchivo.PDF, escaneadas) if escaneadas else {}
    partidas = [
        partida
        for p in lectura.paginas
        for partida in extraer_partidas(
            p.numero, reconocidas[p.numero].palabras if p.numero in reconocidas else p.palabras
        )
    ]
    origen = (
        "escaneado"
        if escaneadas and len(escaneadas) == len(lectura.paginas)
        else ("mixto" if escaneadas else "digital")
    )
    return partidas, origen


async def principal() -> None:
    datos = Path(os.environ.get("AXIS_DATOS_CRUDOS", "../../datos-crudos"))
    config = Config()
    lector = LectorArchivosLocal()
    ocr = OcrTesseract(config.ocr_idioma, config.ocr_dpi, config.ocr_concurrencia)
    rutas = sorted(
        p
        for p in (datos / "bases_extraidas").rglob("*")
        if p.suffix.lower() == ".pdf" and "presupuesto" in p.name.lower()
    )
    vistos: set[str] = set()
    resumen: Counter[str] = Counter()
    inicio = time.perf_counter()
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    with SALIDA.open("w") as salida:
        for ruta in rutas:
            huella = hashlib.sha256(ruta.read_bytes()).hexdigest()
            if huella in vistos:  # el mismo archivo publicado en varios procesos
                resumen["duplicados"] += 1
                continue
            vistos.add(huella)
            try:
                partidas, origen = await leer(ruta, lector, ocr)
            except ArchivoIlegible:
                resumen["ilegibles"] += 1
                continue
            verificables = [p for p in partidas if p.cuadra is not None]
            buenas = [p for p in verificables if p.cuadra]
            resumen[f"archivos_{origen}"] += 1
            resumen[f"verificables_{origen}"] += len(verificables)
            resumen[f"cuadran_{origen}"] += len(buenas)
            print(
                f"  {origen:9} {len(buenas):4}/{len(verificables):4} cuadran  {ruta.parent.name}/{ruta.name[:50]}"
            )
            for p in buenas:
                salida.write(
                    json.dumps(
                        {
                            "archivo": huella,
                            "proceso": ruta.parent.name,
                            "origen": origen,
                            "pagina": p.pagina,
                            "item": p.item,
                            "descripcion": p.descripcion,
                            "unidad": p.unidad,
                            "cantidad": str(p.cantidad),
                            "precio_unitario": str(p.precio_unitario),
                            "parcial": str(p.parcial),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
    print(f"\n{dict(resumen)}  en {time.perf_counter() - inicio:.0f} s → {SALIDA}")


if __name__ == "__main__":
    asyncio.run(principal())
