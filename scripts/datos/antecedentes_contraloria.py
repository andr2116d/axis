"""Resumen compacto de situaciones adversas de la Contraloría en obras viales urbanas (2022-2026) para la app:
conteos por etapa y por elemento de obra (Perú y La Libertad) y ejemplos citables (número de informe + texto sin nombres).
Uso: python3 -I antecedentes_contraloria.py <situaciones_etiquetadas.json> <salida.json>
"""
import json, re, sys, time, unicodedata, collections
def n(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').upper()
ELEMENTOS = {
  'vereda': r'VEREDA', 'sardinel': r'SARDINEL', 'carpeta asfáltica': r'CARPETA|ASFALT', 'losa de concreto': r'LOSA|PAVIMENTO RIGIDO|CONCRETO HIDRAULICO',
  'base y sub base': r'\bBASE\b|SUB ?BASE|AFIRMADO', 'subrasante y relleno': r'SUBRASANTE|RELLENO|MEJORAMIENTO DE SUELO|OVER',
  'juntas': r'JUNTA', 'rampas y accesibilidad': r'RAMPA|ACCESIBILIDAD|DISCAPACI', 'redes y buzones': r'BUZON|REDES|TUBERIA|CONEXIONES',
  'señalización': r'SENALIZ|PINTURA DE TRAFICO|DEMARCACION', 'cunetas y drenaje': r'CUNETA|DRENAJE|PLUVIAL|SUMIDERO', 'muros': r'MURO',
}
ENSAYOS = {'resistencia del concreto': r'RESISTENCIA|PROBETA|ROTURA|DIAMANTINA|NUCLEO', 'compactación': r'DENSIDAD|COMPACTACION|PROCTOR', 'espesor': r'ESPESOR'}
L = json.load(open(sys.argv[1]))
for x in L:
    t = n(x['texto']); x['_el'] = [k for k, r in ELEMENTOS.items() if re.search(r, t)]; x['_en'] = [k for k, r in ENSAYOS.items() if re.search(r, t)]
ll = lambda x: x['departamento'] == 'LA LIBERTAD'
def ejemplos(sub, k=3):
    sub = sorted(sub, key=lambda x: (not ll(x), -(int((x['fecha'] or '0')[:4]))))
    return [{'informe': x['numero'], 'lugar': f"{(x['distrito'] or '').title()}, {(x['departamento'] or '').title()}", 'fecha': x['fecha'], 'texto': x['texto'][:320]} for x in sub[:k]]
calidad = [x for x in L if 'Calidad de lo ejecutado' in x['etapas']]
out = {
  'fuente': 'Contraloría General de la República – fichas resumen de informes de control (buscador público), obras viales urbanas 2022-2026',
  'generado': time.strftime('%Y-%m-%d'), 'situaciones': len(L), 'informes': len({x['informe'] for x in L}),
  'laLibertad': {'situaciones': sum(map(ll, L)), 'informes': len({x['informe'] for x in L if ll(x)})},
  'etapas': {e: {'peru': sum(e in x['etapas'] for x in L), 'laLibertad': sum(e in x['etapas'] and ll(x) for x in L)} for e in sorted({e for x in L for e in x['etapas']})},
  'atribuiblesExpediente': {'peru': sum(x['expediente'] for x in L), 'laLibertad': sum(x['expediente'] and ll(x) for x in L)},
  'elementos': {k: {'peru': sum(k in x['_el'] for x in calidad), 'laLibertad': sum(k in x['_el'] and ll(x) for x in calidad), 'ejemplos': ejemplos([x for x in calidad if k in x['_el']])} for k in ELEMENTOS},
  'ensayos': {k: {'peru': sum(k in x['_en'] for x in calidad), 'ejemplos': ejemplos([x for x in calidad if k in x['_en']], 2)} for k in ENSAYOS},
  'calidad': len(calidad),
}
json.dump(out, open(sys.argv[2], 'w'), ensure_ascii=False, separators=(',', ':'))
print({k: v['peru'] for k, v in out['elementos'].items()}, out['calidad'])
