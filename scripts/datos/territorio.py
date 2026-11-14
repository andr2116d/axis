"""Capas territoriales reales de La Libertad desde servicios ArcGIS REST públicos (INGEMMET, ANA).

Descarga por páginas (resultOffset) en GeoJSON, recorta al departamento y guarda una versión compacta
(coordenadas a 5 decimales, solo los atributos útiles) para el gemelo territorial de Axis.

Uso: python3 -I scripts/datos/territorio.py <crudos> <salida_dir>
"""
import json, os, sys, time, urllib.parse, urllib.request

CRUDOS, SALIDA = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(CRUDOS, 'territorio'), exist_ok=True)
os.makedirs(SALIDA, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 (Axis hackathon UNT; investigacion academica)'}
BBOX = {'xmin': -79.7, 'ymin': -9.0, 'xmax': -76.9, 'ymax': -6.9, 'spatialReference': {'wkid': 4326}}
HOY = time.strftime('%Y-%m-%d')

CAPAS = [
    # id, url de la capa, filtro where, campos a conservar, fuente, maxOffset
    ('distritos', 'https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_CARTOGRAFIA_DEMARCACION_WGS84/MapServer/2',
     "1=1", None, 'INGEMMET GEOCATMIN – Cartografía de demarcación (INEI)'),
    ('peligros_geologicos', 'https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_PELIGROS_GEOLOGICOS/MapServer/0',
     "NM_DPTO='La Libertad'", ['NM_PROV', 'NM_DIST', 'NM_SECTOR', 'TIP_PELIGRO', 'NOM_PELIGRO', 'RE_ME_E_NE', 'OTRA_EVISUAL', 'AUTOR', 'TIESTU_ANO', 'FECHA'],
     'INGEMMET – Inventario de peligros geológicos'),
    ('zonas_criticas', 'https://geocatmin.ingemmet.gob.pe/arcgis/rest/services/SERV_PELIGROS_GEOLOGICOS/MapServer/2',
     "1=1", None, 'INGEMMET – Zonas críticas por peligros geológicos'),
    ('ana_puntos_criticos', 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/PuntosCriticos/MapServer/125',
     "1=1", None, 'ANA – Puntos críticos con riesgo de inundación'),
    ('ana_emergencias_hidricas', 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/EventosEmergenciasHidricas/MapServer/107',
     "1=1", None, 'ANA – Eventos de emergencias hídricas'),
    ('ana_rios', 'https://geosnirh.ana.gob.pe/server/rest/services/P%C3%BAblico/Rios/MapServer/37',
     "1=1", None, 'ANA – Ríos y quebradas'),
]


def consulta(url, params):
    q = urllib.parse.urlencode(params)
    try:
        req = urllib.request.Request(url + '/query?' + q, headers=UA)
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.URLError as e:
        # Algunos servidores del Estado no envían la cadena de certificados completa; curl usa el
        # almacén del sistema y sí la valida. No se desactiva la verificación TLS.
        if 'CERTIFICATE_VERIFY_FAILED' not in str(e):
            raise
        import subprocess
        out = subprocess.run(['curl', '-s', '-m', '180', '-A', UA['User-Agent'], url + '/query?' + q], capture_output=True, check=True)
        return json.loads(out.stdout)


def descargar(capa_id, url, where):
    crudo = os.path.join(CRUDOS, 'territorio', capa_id + '.geojson')
    if os.path.exists(crudo):
        return json.load(open(crudo))
    feats, offset = [], 0
    base = {'where': where, 'geometry': json.dumps(BBOX), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326, 'spatialRel': 'esriSpatialRelIntersects'}
    ids = consulta(url, {**base, 'returnIdsOnly': 'true', 'f': 'json'})
    if ids.get('objectIds') is not None:
        # Servidores sin paginación: se piden los elementos por lotes de identificadores
        oids = sorted(ids['objectIds'])
        for i in range(0, len(oids), 300):
            d = consulta(url, {'objectIds': ','.join(map(str, oids[i:i + 300])), 'outFields': '*', 'outSR': 4326, 'f': 'geojson'})
            if 'error' in d:
                raise RuntimeError(d['error'])
            feats += d.get('features', [])
            print(f'  {capa_id}: {len(feats)}/{len(oids)}', flush=True)
            time.sleep(0.3)
        gj = {'type': 'FeatureCollection', 'features': feats}
        json.dump(gj, open(crudo, 'w'))
        return gj
    while True:
        d = consulta(url, {'where': where, 'geometry': json.dumps(BBOX), 'geometryType': 'esriGeometryEnvelope', 'inSR': 4326,
                           'spatialRel': 'esriSpatialRelIntersects', 'outFields': '*', 'outSR': 4326, 'f': 'geojson',
                           'resultOffset': offset, 'resultRecordCount': 1000})
        if 'error' in d:
            raise RuntimeError(d['error'])
        lote = d.get('features', [])
        feats += lote
        print(f'  {capa_id}: {len(feats)}', flush=True)
        if len(lote) < 1000 and not d.get('exceededTransferLimit'):
            break
        offset += len(lote)
        time.sleep(0.5)
    gj = {'type': 'FeatureCollection', 'features': feats}
    json.dump(gj, open(crudo, 'w'))
    return gj


def redondear(c):
    if isinstance(c, (int, float)):
        return round(c, 5)
    return [redondear(x) for x in c]


def compactar(gj, campos, filtro_dep=None):
    out = []
    for f in gj['features']:
        p = f.get('properties') or {}
        if filtro_dep and not filtro_dep(p):
            continue
        if not f.get('geometry'):
            continue
        props = {k: p.get(k) for k in campos} if campos else {k: v for k, v in p.items() if v not in (None, '', ' ') and not k.upper().startswith(('OBJECTID', 'SHAPE', 'GLOBALID', 'CREATOR', 'CREATIONDATE', 'EDITOR', 'EDITDATE', 'USU_'))}
        out.append({'type': 'Feature', 'geometry': {'type': f['geometry']['type'], 'coordinates': redondear(f['geometry']['coordinates'])}, 'properties': props})
    return out


def es_la_libertad(p):
    txt = ' '.join(str(v) for v in p.values() if isinstance(v, str)).upper()
    return 'LIBERTAD' in txt


resumen = {}
for capa_id, url, where, campos, fuente in CAPAS:
    print('==', capa_id, flush=True)
    try:
        gj = descargar(capa_id, url, where)
    except Exception as e:
        print('  ERROR', e, flush=True)
        continue
    filtro = es_la_libertad if capa_id in ('distritos', 'zonas_criticas', 'ana_puntos_criticos', 'ana_emergencias_hidricas') else None
    feats = compactar(gj, campos, filtro)
    json.dump({'fuente': fuente, 'descargado': HOY, 'servicio': url, 'licencia': 'Información pública del Estado peruano (Ley 27806)', 'type': 'FeatureCollection', 'features': feats},
              open(os.path.join(SALIDA, capa_id + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    resumen[capa_id] = len(feats)
    print(f'  -> {len(feats)} elementos en La Libertad', flush=True)
print(resumen)
