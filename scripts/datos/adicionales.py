"""Documentos de ejecución contractual de obras de La Libertad publicados en SEACE (OCDS contracts.documents):
adicionales de obra, ampliaciones de plazo, resoluciones y nulidades. Son el resultado real de la obra: lo que
el expediente técnico no previó.

Descarga cada documento, lo pasa por OCR local (Apple Vision, scripts/ocr/ocr.swift) si no tiene texto, guarda
solo el texto y borra el PDF. Los textos quedan en datos-crudos (fuera del repo): traen firmas con nombres.
Uso: python3 -I adicionales.py <contratos_la_libertad.json> <dir_salida> <binario_ocr>
"""
import json, os, subprocess, sys, time

TITULOS = ('adicional', 'ampliaci', 'resoluci', 'nulidad')
contratos, salida, ocr = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(salida, exist_ok=True)
docs = [(c, d) for c in json.load(open(contratos)) for d in c['documentos'] if any(t in (d['titulo'] or '').lower() for t in TITULOS)]
print('documentos', len(docs), flush=True)
for i, (c, d) in enumerate(docs):
    base = os.path.join(salida, f"{c['proceso']}_{c['contrato']}_{d['id']}")
    if os.path.exists(base + '.txt'): continue
    tmp = base + '.bin'
    subprocess.run(['curl', '-sL', '-m', '240', '--max-filesize', '120000000', '-o', tmp, d['url']])
    cab = open(tmp, 'rb').read(4) if os.path.exists(tmp) else b''
    texto = ''
    if cab == b'%PDF':
        texto = subprocess.run(['pdftotext', '-layout', '-l', '25', tmp, '-'], capture_output=True).stdout.decode('utf8', 'ignore')
        if len(texto.strip()) < 200 * max(1, texto.count('\f')):  # escaneado
            texto = subprocess.run([ocr, tmp, '25'], capture_output=True, timeout=900).stdout.decode('utf8', 'ignore')
    elif cab[:2] == b'PK':
        texto = '[ZIP no procesado]'
    if os.path.exists(tmp): os.remove(tmp)
    open(base + '.txt', 'w').write(texto)
    print(i, c['proceso'], d['titulo'], len(texto), flush=True)
    time.sleep(0.5)
