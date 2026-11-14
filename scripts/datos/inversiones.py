"""Inversiones públicas de La Libertad (MEF, Detalle de inversiones, Invierte.pe) en formato compacto.

Marca como "ubicación genérica" las coordenadas (0,0) o las que comparten 3 o más inversiones (centroides por defecto),
para que el gemelo no use puntos falsos al medir distancias.
Uso: python3 -I scripts/datos/inversiones.py <DETALLE_INVERSIONES.csv> <salida.json>
"""
import csv, json, sys, collections, time

ENT, SAL = sys.argv[1], sys.argv[2]
fl = lambda v: float(v) if v not in ('', None) else None
rows = [r for r in csv.DictReader(open(ENT, encoding='utf-8-sig', newline='')) if r['DEPARTAMENTO'] == 'LA LIBERTAD']
cuenta = collections.Counter((round(fl(r['LATITUD']) or 0, 5), round(fl(r['LONGITUD']) or 0, 5)) for r in rows)
import math
def dist(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    return 2 * 6371000 * math.asin(math.sqrt(math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b[1] - a[1]) / 2) ** 2))

# Agrupamiento: muchas entidades registran la ubicación de su local (plaza, palacio municipal) para obras en otros lugares.
# Si la misma entidad tiene 3 o más inversiones a menos de 60 m, esa ubicación se considera aproximada.
celdas = collections.defaultdict(list)
for r in rows:
    lat, lng = fl(r['LATITUD']), fl(r['LONGITUD'])
    if lat and lng:
        celdas[(round(lat / 0.001), round(lng / 0.001))].append(r)
def agrupada(r):
    lat, lng = fl(r['LATITUD']), fl(r['LONGITUD'])
    ci, cj = round(lat / 0.001), round(lng / 0.001)
    n = 0
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for o in celdas[(ci + di, cj + dj)]:
                if o is not r and o['ENTIDAD'] == r['ENTIDAD'] and dist((lat, lng), (fl(o['LATITUD']), fl(o['LONGITUD']))) < 60:
                    n += 1
    return n >= 3

out = []
for r in rows:
    lat, lng = fl(r['LATITUD']), fl(r['LONGITUD'])
    k = (round(lat or 0, 5), round(lng or 0, 5))
    generica = not lat or not lng or k == (0, 0) or cuenta[k] >= 3 or agrupada(r)
    dev = (fl(r['DEVEN_ACUMUL_ANIO_ANT']) or 0) + (fl(r['DEV_ANIO_ACTUAL']) or 0)
    out.append({
        'cui': r['CODIGO_UNICO'], 'nombre': r['NOMBRE_INVERSION'].strip(), 'entidad': r['ENTIDAD'], 'nivel': r['NIVEL'],
        'funcion': r['FUNCION'], 'tipo': r['TIPO_INVERSION'], 'tipologia': r['DES_TIPOLOGIA'],
        'provincia': r['PROVINCIA'], 'distrito': r['DISTRITO'], 'ubigeo': r['UBIGEO'],
        'lat': None if generica else round(lat, 6), 'lng': None if generica else round(lng, 6), 'ubicacionGenerica': generica,
        'situacion': r['SITUACION'], 'fechaViabilidad': (r['FECHA_VIABILIDAD'] or '')[:10] or None,
        'montoViable': fl(r['MONTO_VIABLE']), 'costoActualizado': fl(r['COSTO_ACTUALIZADO']),
        'montoLaudo': fl(r['MONTO_LAUDO']) or 0, 'controlConcurrente': fl(r['CTRL_CONCURR']) or 0,
        'tieneExpediente': r['EXPEDIENTE_TECNICO'] == 'SI', 'montoExpediente': fl(r['MONTO_ET_F8']),
        'avanceFisico': fl(r['AVANCE_FISICO']), 'devengado': round(dev, 2),
        'inicioEjecucion': (r['FEC_INI_EJECUCION'] or '')[:10] or None, 'finEjecucion': (r['FEC_FIN_EJECUCION'] or '')[:10] or None,
        'ultimoDevengado': r['ULTIMO_DEVENGADO'] or None, 'beneficiarios': fl(r['NUM_HABITANTES_BENEF']),
    })
json.dump({'fuente': 'MEF – Datos abiertos, Detalle de inversiones (Invierte.pe)', 'url': 'https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv',
           'descargado': time.strftime('%Y-%m-%d'), 'inversiones': out}, open(SAL, 'w'), ensure_ascii=False, separators=(',', ':'))
print('inversiones', len(out), '| con ubicación propia', sum(not x['ubicacionGenerica'] for x in out))
