# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "tifffile", "imagecodecs"]
# ///
"""Genera el recorte de terreno de una vía para src/datos/territorio.json.

Red vial y cauces: OpenStreetMap (Overpass). Relieve: Copernicus DEM GLO-30 (AWS Open Data).

    uv run scripts/territorio/recorte.py <clave> "<nombre OSM de la vía>" <lat> <lon> <largo_m>

<lat> <lon> es el punto medio del tramo que declara el expediente; el tramo se toma sobre
la vía, centrado en el punto más cercano a ese punto.
"""

import json
import math
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import tifffile

DATOS = Path(__file__).resolve().parents[2] / "src/datos/territorio.json"
CACHE = Path.home() / ".cache/axis-dem"
ANCHO, ALTO = 1760, 1460  # metros del recorte (como los demás)
MITAD, DIVISIONES = 530, 34  # malla de relieve
TIPOS = {"primary": "primary", "trunk": "primary", "secondary": "secondary", "tertiary": "tertiary"}
AGENTE = "axis-prototipo/1.0"


SERVIDORES = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]


def overpass(consulta: str) -> list[dict]:
    datos = urllib.parse.urlencode({"data": consulta}).encode()
    ultimo: Exception | None = None
    for intento in range(6):
        url = SERVIDORES[intento % len(SERVIDORES)]
        try:
            req = urllib.request.Request(url, data=datos, headers={"User-Agent": AGENTE})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.load(r)["elements"]
        except (urllib.error.URLError, TimeoutError) as error:  # servidores públicos: a veces saturados
            ultimo = error
            time.sleep(3 * (intento + 1))
    raise RuntimeError(f"Overpass no respondió: {ultimo}")


def proyector(lat0: float, lon0: float):
    kx, ky = 111_320 * math.cos(math.radians(lat0)), 110_574
    return lambda lat, lon: (round((lon - lon0) * kx, 1), round((lat - lat0) * ky, 1))


def tesela_dem(lat: float, lon: float) -> tuple[np.ndarray, float, float]:
    """Tesela de 1° que contiene el punto: (alturas, lat del borde norte, lon del borde oeste)."""
    la, lo = math.floor(lat), math.floor(lon)
    ns, ew = ("N" if la >= 0 else "S"), ("E" if lo >= 0 else "W")
    nombre = f"Copernicus_DSM_COG_10_{ns}{abs(la):02d}_00_{ew}{abs(lo):03d}_00_DEM"
    archivo = CACHE / f"{nombre}.tif"
    if not archivo.exists():
        CACHE.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(f"https://copernicus-dem-30m.s3.amazonaws.com/{nombre}/{nombre}.tif", archivo)
    return tifffile.imread(archivo), la + 1, lo


def main() -> None:
    clave, via, lat0, lon0, largo = sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
    xy = proyector(lat0, lon0)
    dlat, dlon = (ALTO / 2 + 50) / 110_574, (ANCHO / 2 + 50) / (111_320 * math.cos(math.radians(lat0)))
    caja = f"({lat0 - dlat},{lon0 - dlon},{lat0 + dlat},{lon0 + dlon})"
    vias = overpass(f'[out:json][timeout:90];way["highway"]{caja};out tags geom;')
    agua = overpass(f'[out:json][timeout:90];way["waterway"]{caja};out geom;')

    calles = []
    for w in vias:
        tipo = TIPOS.get(w["tags"]["highway"], "residential")
        if w["tags"]["highway"] in {"footway", "path", "steps", "cycleway", "track", "construction", "proposed"}:
            continue
        calles.append([w["tags"].get("name", ""), tipo, [list(xy(p["lat"], p["lon"])) for p in w["geometry"]]])

    # Tramo: la vía unida en una sola polilínea, recortada a <largo> centrado en el punto del expediente.
    trozos = [c[2] for c in calles if c[0] == via]
    if not trozos:
        sys.exit(f"No hay una vía llamada «{via}» en el recorte.")
    linea = max(trozos, key=len)
    for t in sorted((t for t in trozos if t is not linea), key=lambda t: -len(t)):
        if t[0] == linea[-1]:
            linea += t[1:]
        elif t[-1] == linea[0]:
            linea = t[:-1] + linea
    acumulado = [0.0]
    for a, b in zip(linea, linea[1:]):
        acumulado.append(acumulado[-1] + math.dist(a, b))
    centro = min(range(len(linea)), key=lambda i: math.hypot(*linea[i]))
    inicio = max(0.0, acumulado[centro] - largo / 2)
    inicio = min(inicio, max(0.0, acumulado[-1] - largo))

    def punto_en(d: float) -> tuple[float, float]:
        for i in range(1, len(linea)):
            if acumulado[i] >= d:
                f = (d - acumulado[i - 1]) / max(1e-9, acumulado[i] - acumulado[i - 1])
                return (linea[i - 1][0] + f * (linea[i][0] - linea[i - 1][0]), linea[i - 1][1] + f * (linea[i][1] - linea[i - 1][1]))
        return tuple(linea[-1])

    alturas, norte, oeste = tesela_dem(lat0, lon0)
    filas, cols = alturas.shape
    kx, ky = 111_320 * math.cos(math.radians(lat0)), 110_574

    def cota(x: float, y: float) -> float:
        lat, lon = lat0 + y / ky, lon0 + x / kx
        f, c = (norte - lat) * filas, (lon - oeste) * cols
        f0, c0 = int(f), int(c)
        df, dc = f - f0, c - c0
        z = alturas[f0:f0 + 2, c0:c0 + 2].astype(float)
        return round(float(z[0, 0] * (1 - df) * (1 - dc) + z[0, 1] * (1 - df) * dc + z[1, 0] * df * (1 - dc) + z[1, 1] * df * dc), 1)

    pasos = int(largo // 10)
    ruta = []
    for k in range(pasos + 1):
        d = min(largo, k * 10)
        x, y = punto_en(inicio + d)
        ruta.append([d, round(x, 1), round(y, 1), cota(x, y)])
    paso = 2 * MITAD / DIVISIONES
    malla = [[cota(-MITAD + c * paso, -MITAD + f * paso) for c in range(DIVISIONES + 1)] for f in range(DIVISIONES + 1)]
    planos = [v for fila in malla for v in fila]

    recorte = {
        "center": [lat0, lon0], "name": via, "width": ANCHO, "height": ALTO,
        "roads": calles,
        "waterways": [[list(xy(p["lat"], p["lon"])) for p in w["geometry"]] for w in agua],
        "route": ruta, "length": int(largo),
        "grade": round(abs(ruta[-1][3] - ruta[0][3]) / largo * 100, 1),
        "half": MITAD, "divisions": DIVISIONES, "mesh": malla, "min": min(planos), "max": max(planos),
    }
    datos = json.loads(DATOS.read_text())
    datos["maps"][clave] = recorte
    datos["roadDate"] = datos["waterDate"] = date.today().isoformat()
    DATOS.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")))
    print(f"{clave}: {len(calles)} vías, {len(recorte['waterways'])} cauces, tramo {largo:.0f} m, cotas {ruta[0][3]}–{ruta[-1][3]} m, pendiente {recorte['grade']} %")


if __name__ == "__main__":
    main()
