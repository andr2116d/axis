"""Versión compacta de las obras de La Libertad convocadas en el SEACE (OECE OCDS, CC BY 4.0) para la app.
Uso: python3 -I scripts/datos/obras-seace.py <crudos>/obras_la_libertad.json <salida.json>
"""
import json, sys, time
ENT, SAL = sys.argv[1], sys.argv[2]
obras = json.load(open(ENT))
out = []
for o in obras:
    docs = o.get('documentos') or []
    out.append({
        'ocid': o['ocid'], 'proceso': o['proceso'], 'nomenclatura': o['nomenclatura'], 'mes': o['mes'],
        'entidad': o['entidad'], 'descripcion': ' '.join((o['descripcion'] or '').split())[:400], 'tipo': o['tipo'],
        'montoReferencial': o['monto_referencial'], 'cui': o['cui'], 'metodo': o['metodo'], 'fechaConvocatoria': (o.get('fecha_convocatoria') or '')[:10],
        'postores': len([p for p in o['postores'] if 'tenderer' in (p.get('roles') or [])]),
        'ganadores': [{'ruc': g['ruc'], 'nombre': g['nombre'] if not str(g['ruc']).startswith('10') else None, 'monto': g['monto'], 'fecha': (g.get('fecha') or '')[:10]} for g in o['ganadores']],
        'pliego': next((d['url'] for d in docs if d['tipo'] == 'clarifications' and (d['titulo'] or '').lower().startswith('pliego')), None),
        'bases': next((d['url'] for d in reversed(docs) if d['tipo'] == 'biddingDocuments'), None),
    })
json.dump({'fuente': 'OECE – Portal de Contrataciones Abiertas (OCDS), licencia CC BY 4.0', 'descargado': time.strftime('%Y-%m-%d'), 'obras': out},
          open(SAL, 'w'), ensure_ascii=False, separators=(',', ':'))
print('obras', len(out), '| con ganador', sum(1 for x in out if x['ganadores']))
