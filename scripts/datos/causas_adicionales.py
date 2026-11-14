"""Causas reales de adicionales y ampliaciones de obras de La Libertad (texto OCR de los documentos publicados en
SEACE) y prueba de la premisa de Axis: ¿las obras cuyo expediente recibió más observaciones acogidas en el
pliego terminan con más adicionales o ampliaciones?
Uso: python3 -I causas_adicionales.py <dir_adicionales> <contratos_la_libertad.json> <consultas.json> <salida.json>
"""
import glob, json, os, re, sys, unicodedata, collections, math

dtxt, contratos_f, consultas_f, salida = sys.argv[1:5]
def n(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').upper()
CAUSAS = {
  # Solo afirmaciones causales sobre ESTA obra (no la lista de causales de la ley ni definiciones)
  'deficiencias del expediente': r'(?:PRODUCTO|CONSECUENCIA|ORIGINAD\w+|GENERAD\w+|DEBIDO|MOTIVAD\w+|CAUSAD\w+|PARA CORREGIR|PARA SUBSANAR|SE (?:HAN? )?(?:ENCONTRADO|DETERMINADO|ADVERTIDO|EVIDENCIADO|IDENTIFICADO|VERIFICADO)|EXISTE\w*|PRESENTA\w*)\s+(?:\w+\s+){0,5}(?:DEFICIENCIA|ERROR|OMISION|INCOMPATIBILIDAD)\w*\s+(?:\w+\s+){0,3}(?:DEL|EN EL|DE) EXPEDIENTE|EXPEDIENTE TECNICO (?:\w+ ){0,3}NO (?:CONSIDER|CONTEMPL|INCLU|PREV)\w+',
  'situación imprevisible': r'(?:PRODUCTO|CONSECUENCIA|ORIGINAD\w+|GENERAD\w+|DEBIDO|MOTIVAD\w+|CAUSAD\w+|CONSTITUYE\w*)\s+(?:\w+\s+){0,4}(?:SITUACI\w+ IMPREVISIBLE|HECHOS? IMPREVISIBLE|CASO FORTUITO|FUERZA MAYOR)',
  'mayores metrados': r'MAYORES? METRADOS?',
  'partidas nuevas': r'PARTIDAS? NUEVAS?|NUEVAS PARTIDAS',
  'lluvias / clima': r'PRECIPITACION|LLUVIA|FENOMENO DEL NINO|EMERGENCIA CLIMATIC|CLIMATOLOG',
  'falta de terreno o interferencias': r'LIBRE DISPONIBILIDAD|INTERFERENCIA|POSTES?\b|REUBICACION|REDES EXISTENTES|SEDALIB|HIDRANDINA',
  'demora de la entidad': r'DEMORA (?:\w+ ){0,3}ENTIDAD|ABSOLUCION DE CONSULTA|FALTA DE PRONUNCIAMIENTO|ATRASO EN EL CUMPLIMIENTO DE (?:SUS|LAS) PRESTACIONES',
}
TRABAJOS = {
  'mejoramiento de subrasante / suelo': r'MEJORAMIENTO DE (?:LA )?SUBRASANTE|MEJORAMIENTO DE SUELO|OVER|SUELO INADECUADO|MATERIAL INADECUADO',
  'eliminación / demolición': r'ELIMINACION DE MATERIAL|DEMOLICION',
  'redes, buzones y conexiones': r'BUZON|CONEXIONES? DOMICILIARI|TUBERIA|RED(?:ES)? DE (?:AGUA|DESAGUE|ALCANTARILLADO)',
  'muros y contención': r'MURO',
  'drenaje': r'CUNETA|DRENAJE|ALCANTARILLA|BADEN|PLUVIAL',
  'relleno': r'RELLENO',
  'acero / concreto estructural': r'ACERO|ZAPATA|COLUMNA|VIGA',
}
# Texto legal citado en las resoluciones (definición de adicional, requisitos): no es la causa de ESTA obra.
PLANTILLA = re.compile(r'(?:INDISPENSABLE DEBIDO A|DEBIDO A:? ?I\)|INCISO I\)|SUPUESTOS? PREVISTOS?|SE ORIGINAN POR|ES POSIBLE QUE|SE ENCUENTRA PROHIBIDA|ENTENDIDA ESTA|SIEMPRE QUE RESULTE INDISPENSABLE|EN EL SUPUESTO QUE RESULTE INDISPENSABLE|RESULTE INDISPENSABLE DEBIDO A|SE REQUIERE EL DETALLE O SUSTENTO|SUSTENTE SU POSICION RESPECTO|PUEDE DISPONER LA EJECUCION DE PRESTACIONES|SOLO PROCEDE|PROCEDE LA AMPLIACION DE PLAZO|CAUSALES? DE AMPLIACION DE PLAZO|SIN PERJUICIO DE)[^.]{0,450}')
docs = []
for f in sorted(glob.glob(os.path.join(dtxt, '*.txt'))):
    proceso, contrato, _ = os.path.basename(f)[:-4].rsplit('_', 2)
    t = PLANTILLA.sub(' ', ' '.join(n(open(f, errors='ignore').read()).split()))
    if len(t) < 300: continue
    tipo = 'ampliación' if re.search(r'AMPLIACION DE PLAZO', t[:4000]) and not re.search(r'ADICIONAL DE OBRA', t[:2500]) else 'adicional' if 'ADICIONAL' in t else 'otro'
    pct = [float(x.replace(',', '.')) for x in re.findall(r'INCIDENCIA[^%]{0,80}?(\d{1,2}[.,]\d{1,4})\s*%', t)]
    docs.append({'proceso': proceso, 'contrato': contrato, 'tipo': tipo,
                 'causas': [k for k, r in CAUSAS.items() if re.search(r, t)], 'trabajos': [k for k, r in TRABAJOS.items() if re.search(r, t)],
                 'incidencia': max(pct) if pct else None})
porProc = collections.defaultdict(lambda: {'causas': set(), 'trabajos': set(), 'tipos': set(), 'incidencia': None})
for d in docs:
    p = porProc[d['proceso']]; p['causas'] |= set(d['causas']); p['trabajos'] |= set(d['trabajos']); p['tipos'].add(d['tipo'])
    if d['incidencia'] is not None: p['incidencia'] = max(p['incidencia'] or 0, d['incidencia'])
N = len(porProc)
print(f'documentos legibles {len(docs)} | contratos con documentos {N}')
for nombre, campo in [('Causas citadas', 'causas'), ('Trabajos involucrados', 'trabajos')]:
    c = collections.Counter(x for p in porProc.values() for x in p[campo]); print(nombre)
    for k, v in c.most_common(): print(f'  {k:38s} {v:3d}  {v/N:.0%}')

# Premisa: observaciones acogidas sobre el expediente en el pliego → adicionales/ampliaciones en la ejecución
consultas = json.load(open(consultas_f))
obs = collections.Counter(); acogidas = collections.Counter()
for q in consultas:
    if q.get('plata') and q['plata'] != 'Bases y procedimiento':
        obs[q['proceso']] += 1
        if q.get('aceptada'): acogidas[q['proceso']] += 1
contratos = json.load(open(contratos_f))
filas = []
for c in contratos:
    pid = c['proceso']
    if pid not in obs and not any(q['proceso'] == pid for q in consultas[:0]): pass
    problema = pid in porProc or (c['final'] and c['monto_contrato'] and c['final'] / c['monto_contrato'] - 1 > 0.05)
    filas.append((pid, acogidas[pid], obs[pid], bool(problema)))
conPliego = {q['proceso'] for q in consultas}
filas = [f for f in filas if f[0] in conPliego]
def tasa(sel): return (sum(f[3] for f in sel) / len(sel), len(sel)) if sel else (None, 0)
alto = [f for f in filas if f[1] >= 3]; bajo = [f for f in filas if f[1] == 0]; medio = [f for f in filas if 1 <= f[1] <= 2]
res = {'0 acogidas': tasa(bajo), '1-2 acogidas': tasa(medio), '3+ acogidas': tasa(alto)}
print('\nPremisa (contratos con pliego): proporción con adicional/ampliación publicado o variación >5%')
for k, (t, m) in res.items(): print(f'  {k:14s} n={m:4d}  {t if t is None else round(t*100,1)}%')
# prueba exacta de Fisher (alto vs bajo) sin dependencias
def fisher(a, b, c, d):
    from math import comb
    n1, n2, k = a + b, c + d, a + c; tot = comb(n1 + n2, k)
    p0 = comb(n1, a) * comb(n2, c) / tot
    return sum(comb(n1, x) * comb(n2, k - x) / tot for x in range(max(0, k - n2), min(k, n1) + 1) if comb(n1, x) * comb(n2, k - x) / tot <= p0 + 1e-12)
a = sum(f[3] for f in alto); b = len(alto) - a; c = sum(f[3] for f in bajo); d = len(bajo) - c
p = fisher(a, b, c, d) if alto and bajo else None
print(f'  Fisher (3+ vs 0): p = {p:.4f}' if p is not None else '')
# Auditoría: muestra de frases que se contaron como "deficiencias del expediente"
import random; random.seed(7)
muestra = []
for f in sorted(glob.glob(os.path.join(dtxt, '*.txt'))):
    t = PLANTILLA.sub(' ', ' '.join(n(open(f, errors='ignore').read()).split()))
    for m in re.finditer(CAUSAS['deficiencias del expediente'], t): muestra.append(t[max(0, m.start() - 100):m.end() + 120])
print('\nAuditoría (deficiencias del expediente):', len(muestra), 'frases')
for x in random.sample(muestra, min(6, len(muestra))): print('  ·', x)
json.dump({'documentos': len(docs), 'contratos': N,
           'causas': collections.Counter(x for p in porProc.values() for x in p['causas']),
           'trabajos': collections.Counter(x for p in porProc.values() for x in p['trabajos']),
           'premisa': {k: {'tasa': t, 'n': m} for k, (t, m) in res.items()}, 'fisherP': p,
           'porProceso': {k: {'causas': sorted(v['causas']), 'trabajos': sorted(v['trabajos']), 'incidencia': v['incidencia']} for k, v in porProc.items()}},
          open(salida, 'w'), ensure_ascii=False, indent=0)
