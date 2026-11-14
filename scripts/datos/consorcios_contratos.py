"""Integrantes de consorcios ganadores de obras de La Libertad, leídos de los contratos firmados publicados en SEACE
(OCDS contracts.documents 'Archivos del contrato'). El enlace oficial CONOSCE de consorcios devuelve 404 (nov. 2026).

Lee solo las 4 primeras páginas (la parte que identifica a las partes); OCR local si están escaneadas.
Guarda texto en <salida>/<proceso>_<contrato>.txt (fuera del repo). Uso:
  python3 -I consorcios_contratos.py <contratos_la_libertad.json> <obras_la_libertad.json> <salida> <binario_ocr>
"""
import json, os, re, subprocess, sys, time

contratos, obras, salida, ocr = sys.argv[1:5]
os.makedirs(salida, exist_ok=True)
ganador = {}
for o in json.load(open(obras)):
    for p in o['postores']:
        if 'supplier' in (p.get('roles') or []): ganador.setdefault(o['proceso'], []).append(p['ruc'])
es_ruc = lambda s: re.fullmatch(r'(10|15|17|20)\d{9}', s or '') is not None
pend = []
for c in json.load(open(contratos)):
    sup = ganador.get(c['proceso'], [])
    if not sup or all(es_ruc(s) for s in sup): continue  # solo consorcios
    doc = next((d for d in c['documentos'] if (d['titulo'] or '').lower().startswith('archivos del contrato')), None)
    if doc: pend.append((c, doc))
print('contratos de consorcios', len(pend), flush=True)
SH, NSH = int(os.environ.get('PARTE', '0')), int(os.environ.get('PARTES', '1'))
for i, (c, d) in enumerate(pend):
    if i % NSH != SH: continue
    base = os.path.join(salida, f"{c['proceso']}_{c['contrato']}")
    if os.path.exists(base + '.txt'): continue
    tmp = base + '.bin'
    if os.path.exists(tmp): os.remove(tmp)
    subprocess.run(['curl', '-sL', '-m', '240', '--max-filesize', '150000000', '-o', tmp, d['url']])
    texto = ''
    if os.path.exists(tmp) and open(tmp, 'rb').read(4) == b'%PDF':
        texto = subprocess.run(['pdftotext', '-layout', '-l', '4', tmp, '-'], capture_output=True).stdout.decode('utf8', 'ignore')
        if len(re.findall(r'\w', texto)) < 400:
            texto = subprocess.run([ocr, tmp, '4'], capture_output=True, timeout=600).stdout.decode('utf8', 'ignore')
    if os.path.exists(tmp): os.remove(tmp)
    open(base + '.txt', 'w').write(texto)
    print(i, c['proceso'], len(texto), flush=True)
    time.sleep(0.5)
