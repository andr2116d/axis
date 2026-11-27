"""Baja de SEACE las bases de los procesos de obra que faltan y guarda solo lo que trae precios.

    uv run python -m herramientas.descargar_bases --limite 30     # piloto
    uv run python -m herramientas.descargar_bases                  # el resto (retoma donde quedó)

Se guarda un archivo si su nombre es de precios (presupuesto, ACU, metrados…) o si su contenido
trae partidas que cuadran: así no se pierde un "ANEXO 03.pdf" con el presupuesto. Lo demás se
descarta. Es descarga de datos públicos: de a pocas a la vez, con pausas y con un nombre de
cliente genérico.
"""

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import time
import zipfile
from pathlib import Path

import httpx

from axis.compartido.dominio.partidas import extraer_partidas
from axis.documentos.adaptadores.salida.lector_archivos import LectorArchivosLocal
from axis.documentos.dominio.errores import ArchivoIlegible
from axis.documentos.dominio.valores import TipoArchivo
from herramientas.nombres import ES_DE_PRECIOS, normalizar_nombre

CLIENTE = "axis-investigacion/0.1"
CONCURRENCIA = 3
PAUSA_SEGUNDOS = 0.5
TAMANO_MAXIMO = 300 * 1024 * 1024
# Un PDF que no se llama "presupuesto" se guarda igual si trae al menos estas partidas que cuadran.
MINIMO_PARTIDAS_QUE_CUADRAN = 5
_EXTENSIONES = {".pdf", ".xlsx", ".xls"}
_COMPRIMIDOS = {".zip", ".rar", ".7z"}
_PREFERENCIA = ("bases integradas", "bases administrativas")
# Solo bases comprimidas: en 30 bases en PDF no hubo ningún presupuesto (traen solo el valor
# referencial); en las comprimidas, 6 de cada 15 traían el presupuesto como anexo.
_FORMATOS = ("zip", "rar", "7z")


def elegir_documento(obra: dict[str, object]) -> dict[str, str] | None:
    """Un archivo por proceso: las bases, integradas antes que administrativas.

    Las comprimidas traen los anexos sueltos, entre ellos el presupuesto.
    """
    listados = obra.get("documentos")
    documentos = [d for d in listados if isinstance(d, dict)] if isinstance(listados, list) else []
    candidatos = [
        d
        for d in documentos
        if d.get("tipo") == "biddingDocuments"
        and d.get("formato") in _FORMATOS
        and "bases" in str(d.get("titulo") or "").lower()
    ]
    for preferido in _PREFERENCIA:
        for formato in _FORMATOS:
            for d in candidatos:
                titulo = str(d.get("titulo") or "").lower()
                if preferido in titulo and d.get("formato") == formato:
                    return {k: str(v) for k, v in d.items()}
    return None


def tiene_precios(ruta: Path) -> bool:
    """Mira el contenido de las páginas digitales: cuenta partidas que cuadran."""
    try:
        lectura = asyncio.run(LectorArchivosLocal().leer(ruta.read_bytes(), TipoArchivo.PDF))
    except ArchivoIlegible:
        return False
    cuadran = sum(
        1 for p in lectura.paginas for x in extraer_partidas(p.numero, p.palabras) if x.cuadra
    )
    return cuadran >= MINIMO_PARTIDAS_QUE_CUADRAN


def _abrir(archivo: Path, carpeta: Path) -> None:
    if archivo.suffix.lower() == ".pdf":
        shutil.copy2(archivo, carpeta / archivo.name)
    elif archivo.suffix.lower() == ".zip" and zipfile.is_zipfile(archivo):
        with zipfile.ZipFile(archivo) as comprimido:
            comprimido.extractall(carpeta)
    else:
        # bsdtar (libarchive) abre rar y 7z sin instalar nada más.
        subprocess.run(  # noqa: S603 - el archivo es nuestro, en una carpeta temporal
            ["bsdtar", "-xf", str(archivo), "-C", str(carpeta)],  # noqa: S607
            check=False,
            capture_output=True,
            timeout=600,
        )


def extraer_de_precios(archivo: Path, destino: Path, profundidad: int = 0) -> list[str]:
    """Guarda lo que trae precios. Abre un nivel de comprimidos anidados."""
    with tempfile.TemporaryDirectory() as temporal:
        carpeta = Path(temporal)
        _abrir(archivo, carpeta)
        guardados: list[str] = []
        for ruta in sorted(p for p in carpeta.rglob("*") if p.is_file()):
            sufijo = ruta.suffix.lower()
            if sufijo in _COMPRIMIDOS and profundidad == 0:
                guardados += extraer_de_precios(ruta, destino, profundidad + 1)
                continue
            por_nombre = bool(ES_DE_PRECIOS.search(normalizar_nombre(ruta.name)))
            por_contenido = not por_nombre and sufijo == ".pdf" and tiene_precios(ruta)
            if sufijo in _EXTENSIONES and (por_nombre or por_contenido):
                destino.mkdir(parents=True, exist_ok=True)
                shutil.copy2(ruta, destino / ruta.name)
                guardados.append(ruta.name)
        return guardados


async def bajar(cliente: httpx.AsyncClient, url: str, destino: Path) -> int:
    total = 0
    async with cliente.stream("GET", url) as respuesta:
        respuesta.raise_for_status()
        with destino.open("wb") as salida:
            async for bloque in respuesta.aiter_bytes(1 << 20):
                total += len(bloque)
                if total > TAMANO_MAXIMO:
                    raise ValueError("archivo demasiado grande")
                salida.write(bloque)
    return total


async def procesar(
    obra: dict[str, object],
    documento: dict[str, str],
    datos: Path,
    cliente: httpx.AsyncClient,
    semaforo: asyncio.Semaphore,
) -> dict[str, object]:
    proceso = str(obra["proceso"])
    registro: dict[str, object] = {
        "proceso": proceso,
        "titulo": documento.get("titulo"),
        "formato": documento.get("formato"),
        "url": documento["url"],
    }
    async with semaforo:
        await asyncio.sleep(PAUSA_SEGUNDOS)
        with tempfile.TemporaryDirectory() as temporal:
            archivo = Path(temporal) / f"bases.{documento.get('formato', 'zip')}"
            inicio = time.perf_counter()
            try:
                registro["bytes"] = await bajar(cliente, documento["url"], archivo)
                destino = datos / "bases_extraidas" / proceso
                registro["archivos"] = await asyncio.to_thread(extraer_de_precios, archivo, destino)
                registro["estado"] = "ok"
            except (httpx.HTTPError, ValueError, OSError, subprocess.SubprocessError) as error:
                registro["estado"] = "error"
                registro["error"] = f"{type(error).__name__}: {error}"[:200]
            registro["segundos"] = round(time.perf_counter() - inicio, 1)
    return registro


def _estado_inicial(
    datos: Path, manifiesto: Path
) -> tuple[set[str], set[str], list[dict[str, object]]]:
    hechos: set[str] = set()
    if manifiesto.exists():
        hechos = {json.loads(linea)["proceso"] for linea in manifiesto.read_text().splitlines()}
    ya_bajados = {p.name for p in (datos / "bases_extraidas").iterdir()} - hechos
    obras = json.loads((datos / "obras_la_libertad.json").read_text())
    return hechos, ya_bajados, obras


async def principal(limite: int | None) -> None:
    datos = Path(os.environ.get("AXIS_DATOS_CRUDOS", "../../datos-crudos")).resolve()
    manifiesto = datos / "descargas_bases.jsonl"
    hechos, ya_bajados, obras = await asyncio.to_thread(_estado_inicial, datos, manifiesto)
    pendientes = [
        (o, d)
        for o in obras
        if str(o["proceso"]) not in hechos | ya_bajados and (d := elegir_documento(o)) is not None
    ]
    print(f"Pendientes con bases publicadas: {len(pendientes)}")
    pendientes = pendientes[:limite] if limite else pendientes
    semaforo = asyncio.Semaphore(CONCURRENCIA)
    inicio = time.perf_counter()
    con_precios = archivos = 0
    megas = 0.0
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(120, connect=20),
        follow_redirects=True,
        headers={"User-Agent": CLIENTE},
    ) as cliente:
        tareas = [procesar(o, d, datos, cliente, semaforo) for o, d in pendientes]
        with manifiesto.open("a") as salida:
            for i, tarea in enumerate(asyncio.as_completed(tareas), 1):
                registro = await tarea
                salida.write(json.dumps(registro, ensure_ascii=False) + "\n")
                salida.flush()
                encontrados = len(registro.get("archivos") or [])  # type: ignore[arg-type]
                con_precios += bool(encontrados)
                archivos += encontrados
                megas += float(str(registro.get("bytes", 0))) / 1e6
                print(
                    f"  [{i}/{len(pendientes)}] {registro['proceso']:>12} {registro['estado']:5} "
                    f"{registro.get('formato')} {encontrados} de precios "
                    f"{registro.get('segundos')} s"
                )
    minutos = (time.perf_counter() - inicio) / 60
    print(
        f"\n{len(pendientes)} procesos en {minutos:.1f} min, {megas:.0f} MB bajados; "
        f"{con_precios} con documentos de precios, {archivos} archivos guardados"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limite", type=int, default=None)
    asyncio.run(principal(parser.parse_args().limite))
