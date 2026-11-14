"""Señales de competencia y de ejecución de las obras de La Libertad (OECE OCDS, CC BY 4.0), por proceso.

No es un modelo supervisado: compara cada obra con la distribución real de las demás obras de La Libertad
(percentiles) y aplica indicadores de la Guía de banderas rojas de Open Contracting Partnership (2024) que se
pueden calcular con OCDS:
  - participantes registrados (tender.numberOfTenderers; en SEACE son los registrados, no las ofertas)
  - monto adjudicado / valor referencial (en obras la oferta válida va de 90% a 110% del VR)
  - ejecución: valor final / monto del contrato (adicionales menos deductivos) y días de ampliación
  - documentos de adicionales, ampliaciones, nulidad y resolución publicados en el contrato
Uso: python3 -I competencia.py <obras_la_libertad.json> <contratos_la_libertad.json> <salida.json>
"""
import json, sys, statistics, time
from datetime import date

obras = json.load(open(sys.argv[1]))
contratos = {}
for c in json.load(open(sys.argv[2])): contratos.setdefault(c['proceso'], []).append(c)

def d(s): return date.fromisoformat(s[:10]) if s else None
def pct(xs, p):
    xs = sorted(xs); k = (len(xs) - 1) * p; f = int(k)
    return xs[f] + (xs[min(f + 1, len(xs) - 1)] - xs[f]) * (k - f) if xs else None

procs = []
for o in obras:
    vr = o.get('monto_referencial') or 0
    adj = sum(g['monto'] or 0 for g in o['ganadores'])
    reg = {'proceso': o['proceso'], 'nomenclatura': o['nomenclatura'], 'cui': o['cui'], 'entidad': o['entidad'], 'provincia': o['provincia_entidad'],
           'tipo': o['tipo'], 'metodo': o['metodo'], 'fecha': (o['fecha_convocatoria'] or '')[:10], 'vr': vr,
           'participantes': len([p for p in o['postores'] if 'tenderer' in (p.get('roles') or [])]),
           'ganadores': [g['ruc'] for g in o['ganadores']], 'adjudicado': round(adj, 2) or None,
           'pctVr': round(adj / vr, 4) if vr and adj else None}
    cs = contratos.get(o['proceso'], [])
    if cs:
        monto = sum(c['monto_contrato'] or 0 for c in cs)
        final = sum((c['final'] or 0) for c in cs) if all(c['final'] for c in cs) else None
        amp = [(d(c['fin_real']) - d(c['fin'])).days for c in cs if c['fin_real'] and c['fin']]
        titulos = [(x['titulo'] or '').lower() for c in cs for x in c['documentos']]
        reg.update({'contrato': round(monto, 2), 'plazo': max((c['dias'] or 0) for c in cs) or None,
                    'final': round(final, 2) if final else None, 'variacion': round(final / monto - 1, 4) if final and monto else None,
                    'ampliacionDias': max(amp) if amp else None,
                    'docsAdicional': sum('adicional' in t for t in titulos), 'docsAmpliacion': sum('ampliaci' in t for t in titulos),
                    'nulidad': any('nulidad' in t for t in titulos), 'resolucion': any('resoluci' in t and 'contrato' in t for t in titulos)})
    procs.append(reg)

# Distribución de referencia (La Libertad, obras con dato)
var = [p['variacion'] for p in procs if p.get('variacion') is not None]
pvr = [p['pctVr'] for p in procs if p.get('pctVr') and 0.5 < p['pctVr'] < 1.5]
part = [p['participantes'] for p in procs]
amp = [p['ampliacionDias'] / p['plazo'] for p in procs if p.get('ampliacionDias') is not None and p.get('plazo')]
ref = {
    'obras': len(procs), 'conContrato': sum(1 for p in procs if 'contrato' in p), 'conValorFinal': len(var),
    'variacion': {'mediana': pct(var, .5), 'p75': pct(var, .75), 'p90': pct(var, .9)},
    'pctVr': {'p10': pct(pvr, .1), 'mediana': pct(pvr, .5), 'p90': pct(pvr, .9), 'en90': sum(1 for x in pvr if x < 0.905) / len(pvr), 'sobre99': sum(1 for x in pvr if x >= 0.99) / len(pvr)},
    'participantes': {'mediana': pct(part, .5), 'p10': pct(part, .1), 'unico': sum(1 for x in part if x == 1) / len(part)},
    'ampliacionRel': {'mediana': pct(amp, .5), 'p90': pct(amp, .9)},
}
# Concentración por entidad: proporción del monto adjudicado que se lleva un mismo ganador (entidades con ≥ 4 obras adjudicadas)
ent = {}
for p in procs:
    if p['adjudicado'] and len(p['ganadores']) == 1: ent.setdefault(p['entidad'], []).append(p)
concentracion = {}
for e, ps in ent.items():
    if len(ps) < 4: continue
    tot = sum(p['adjudicado'] for p in ps); por = {}
    for p in ps: por[p['ganadores'][0]] = por.get(p['ganadores'][0], 0) + p['adjudicado']
    ruc, m = max(por.items(), key=lambda x: x[1])
    concentracion[e] = {'obras': len(ps), 'ganadores': len(por), 'mayor': ruc, 'parteMayor': round(m / tot, 3), 'obrasMayor': sum(1 for p in ps if p['ganadores'][0] == ruc)}
json.dump({'fuente': 'OECE – Portal de Contrataciones Abiertas (OCDS), CC BY 4.0; metodología: Open Contracting Partnership, Red flags guide (2024)',
           'generado': time.strftime('%Y-%m-%d'), 'referencia': ref, 'concentracion': concentracion, 'procesos': procs},
          open(sys.argv[3], 'w'), ensure_ascii=False, separators=(',', ':'))
print(json.dumps(ref, indent=1))
print('entidades con ≥4 obras', len(concentracion), '| con un ganador ≥50% del monto', sum(1 for c in concentracion.values() if c['parteMayor'] >= .5))
