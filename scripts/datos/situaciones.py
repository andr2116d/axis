"""Extrae las situaciones adversas (y hechos con indicio de irregularidad / observaciones) de las fichas resumen de
informes de control de la Contraloría sobre obras viales urbanas. Quita nombres de personas y DNI.
Uso: python3 -I situaciones.py <dir_contraloria> <salida.json>
"""
import json, os, re, sys

base, salida = sys.argv[1], sys.argv[2]
meta = {x['CodigoInforme']: x for x in json.load(open(os.path.join(base, 'informes.json')))}
INICIO = re.compile(r'(Aspectos relevantes\s*/\s*Situaciones adversas|Hecho\(s\) con indicio de irregularidad|^\s*\d?\s*Observaciones\s*:)', re.I | re.M)
FIN = re.compile(r'^\s*\d\s{2,}(Conclusiones|Recomendaci)|^\s*(IV|V)\.\s|Conclusiones y/o Recomendaciones|^\s*Recomendaciones\s*:', re.I | re.M)
ITEM = re.compile(r'^\s{0,12}(?:\d{1,2}\s*[.\-)]|\d{1,2}\s+-|[-•])\s+(?=\S)', re.M)
PERSONA = re.compile(r'\b(?:Ing\.|Ingenier[oa]|Sr\.|Sra\.|Arq\.|Abog\.|Lic\.|CPC\.?)\s+(?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s*){1,4}')
DNI = re.compile(r'\bDNI\s*(?:N[°º.]*)?\s*:?\s*\d{8}\b', re.I)

out = []
for f in sorted(os.listdir(os.path.join(base, 'pdf'))):
    if not f.endswith('.txt'): continue
    cod = f[:-4]; t = open(os.path.join(base, 'pdf', f), errors='ignore').read()
    m = INICIO.search(t)
    if not m: continue
    resto = t[m.end():]
    fin = FIN.search(resto)
    bloque = resto[:fin.start()] if fin else resto[:6000]
    partes = [p for p in ITEM.split(bloque)]
    items = [' '.join(p.split()) for p in partes if len(' '.join(p.split())) > 60]
    x = meta.get(cod, {})
    for i, s in enumerate(items[:15]):
        s = DNI.sub('DNI [oculto]', PERSONA.sub('[persona]', s))
        out.append({'informe': cod, 'numero': x.get('NumeroInforme'), 'departamento': x.get('Departamento'), 'provincia': x.get('Provincia'),
                    'distrito': x.get('Distrito'), 'modalidad': x.get('ModalidadServicio'), 'fecha': x.get('FechaEmision'),
                    'obra': ' '.join((x.get('Descripcion') or '').split())[:300], 'n': i + 1, 'texto': s[:1500]})
json.dump(out, open(salida, 'w'), ensure_ascii=False, indent=0)
import collections
print('situaciones', len(out), 'informes', len({o['informe'] for o in out}), collections.Counter(o['departamento'] for o in out).most_common(5))
