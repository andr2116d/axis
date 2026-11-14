"""Red vial de Trujillo metropolitano desde OpenStreetMap (Overpass API, ODbL) → src/data/real/territorio/vias_trujillo.json
Consulta usada (con User-Agent identificado; Overpass rechaza solicitudes sin él):
  way["highway"]["highway"!~"footway|path|steps|cycleway|service|track|pedestrian|construction|proposed"](-8.20,-79.12,-7.98,-78.92); out tags geom;
Uso: python3 -I vias.py <vias_trujillo_overpass.json> <salida.json>
"""
import json, sys
d = json.load(open(sys.argv[1]))
vias = []
for e in d['elements']:
    if e.get('type') != 'way' or 'geometry' not in e: continue
    t = e.get('tags', {})
    vias.append({'id': e['id'], 'n': t.get('name'), 'h': t.get('highway'), 's': t.get('surface'), 'a': t.get('width'),
                 'g': [[round(p['lon'], 5), round(p['lat'], 5)] for p in e['geometry']]})
vias = [{k: v for k, v in x.items() if v is not None} for x in vias]
json.dump({'fuente': 'OpenStreetMap (Overpass API)', 'licencia': 'ODbL — © colaboradores de OpenStreetMap', 'fecha': d['osm3s']['timestamp_osm_base'][:10],
           'caja': [-8.20, -79.12, -7.98, -78.92], 'vias': vias}, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
import collections
print(len(vias), 'con nombre', sum(1 for v in vias if 'n' in v), collections.Counter(v.get('s') for v in vias).most_common(6))
