"""Corpus real de obras de La Libertad desde OECE (Contrataciones Abiertas, OCDS, licencia CC BY 4.0).

Descarga los archivos mensuales, filtra las obras cuya entidad está en La Libertad y baja:
  - todos los pliegos de absolución de consultas y observaciones (texto con errores reales del expediente),
  - las bases integradas (o administrativas) de las obras de pistas y veredas, que traen presupuesto y metrados.

Uso:  python3 -I scripts/datos/oece_corpus.py <carpeta_crudos> 2025-01 2026-10
Es reanudable: no vuelve a bajar lo que ya existe. Espera 1 s entre descargas por cortesía con el servidor público.
"""
import json, os, re, subprocess, sys, time, unicodedata, urllib.request, zipfile

UA = {'User-Agent': 'Mozilla/5.0 (Axis hackathon UNT; investigacion academica)'}
OUT = sys.argv[1]
DESDE, HASTA = sys.argv[2], sys.argv[3]


def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', (s or '').lower()) if unicodedata.category(c) != 'Mn')


def tipo_obra(desc):
    d = norm(desc)
    if re.search(r'calzada|pista|vereda|movilidad urbana|transitabilidad vehicular|transitabilidad peatonal|pavimen', d): return 'pistas_veredas'
    if re.search(r'educa|\bi\.?e\.?\b|aula|colegio', d): return 'educacion'
    if re.search(r'agua|saneamiento|alcantarill|desague', d): return 'agua_saneamiento'
    if re.search(r'puente', d): return 'puentes'
    if re.search(r'deport|recreativ|losa', d): return 'deporte'
    if re.search(r'vial|trocha|carretera|camino', d): return 'vias_rurales'
    return 'otros'


def bajar(url, path, reintentos=3):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return path
    for k in range(reintentos):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=240) as r:
                data = r.read()
            with open(path + '.part', 'wb') as f:
                f.write(data)
            os.replace(path + '.part', path)
            time.sleep(1.0)
            return path
        except Exception as e:
            print(f'  reintento {k + 1} {url[:80]}: {e}', flush=True)
            time.sleep(5)
    raise RuntimeError('no se pudo descargar ' + url)


def meses(desde, hasta):
    y, m = map(int, desde.split('-'))
    y2, m2 = map(int, hasta.split('-'))
    while (y, m) <= (y2, m2):
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


for d in ['oece', 'pliegos', 'bases']:
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

obras = {}
for y, m in meses(DESDE, HASTA):
    z = os.path.join(OUT, 'oece', f'{y}-{m:02d}.zip')
    try:
        bajar(f'https://contratacionesabiertas.oece.gob.pe/api/v1/file/seace_v3/json/{y}/{m:02d}/', z)
        with zipfile.ZipFile(z) as zf:
            nombre = [n for n in zf.namelist() if n.endswith('.json')][0]
            datos = json.loads(zf.read(nombre))
    except Exception as e:
        print('mes omitido', y, m, e, flush=True)
        continue
    n = 0
    for r in datos.get('records', []):
        x = r.get('compiledRelease', r)
        t = x.get('tender') or {}
        if t.get('mainProcurementCategory') != 'works':
            continue
        b = x['buyer']['id']
        p = [p for p in x.get('parties', []) if p.get('id') == b]
        if not p or (p[0].get('address', {}).get('department') or '').upper() != 'LA LIBERTAD':
            continue
        docs = [{'tipo': d.get('documentType'), 'titulo': d.get('title'), 'url': d.get('url'), 'formato': d.get('format'), 'fecha': d.get('datePublished')}
                for d in (t.get('documents') or [])]
        postores = [{'ruc': (pp.get('identifier') or {}).get('id'), 'nombre': pp.get('name'), 'roles': pp.get('roles')}
                    for pp in x.get('parties', []) if set(pp.get('roles', [])) & {'tenderer', 'supplier'}]
        ganadores = [{'ruc': s.get('id', '').replace('PE-RUC-', ''), 'nombre': s.get('name'), 'monto': (a.get('value') or {}).get('amount'), 'fecha': a.get('date')}
                     for a in x.get('awards', []) for s in a.get('suppliers', [])]
        obras[x['ocid']] = {
            'ocid': x['ocid'], 'proceso': t.get('id'), 'nomenclatura': t.get('title'), 'mes': f'{y}-{m:02d}',
            'entidad': x['buyer']['name'], 'provincia_entidad': p[0]['address'].get('region'), 'localidad_entidad': p[0]['address'].get('locality'),
            'descripcion': t.get('description'), 'tipo': tipo_obra(t.get('description')),
            'monto_referencial': (t.get('value') or {}).get('amount'), 'cui': (x.get('planning', {}).get('budget') or {}).get('projectID'),
            'metodo': t.get('procurementMethodDetails'), 'fecha_convocatoria': t.get('datePublished'),
            'documentos': docs, 'postores': postores, 'ganadores': ganadores,
        }
        n += 1
    print(f'{y}-{m:02d}: {n} obras La Libertad', flush=True)

lista = sorted(obras.values(), key=lambda o: o['mes'])
with open(os.path.join(OUT, 'obras_la_libertad.json'), 'w') as f:
    json.dump(lista, f, ensure_ascii=False)
print('TOTAL obras', len(lista), flush=True)

n_pl = n_ba = 0
for o in lista:
    pid = o['ocid'].split('seacev3-', 1)[-1]
    for i, d in enumerate(o['documentos']):
        titulo = norm(d['titulo'])
        try:
            if d['tipo'] == 'clarifications' and titulo.startswith('pliego'):
                pdf = os.path.join(OUT, 'pliegos', f'{pid}_{i}.pdf')
                bajar(d['url'], pdf)
                txt = pdf[:-4] + '.txt'
                if not os.path.exists(txt):
                    subprocess.run(['pdftotext', '-layout', pdf, txt], timeout=180)
                n_pl += 1
        except Exception as e:
            print('ERR pliego', pid, e, flush=True)
    if o['tipo'] == 'pistas_veredas':
        bases = [d for d in o['documentos'] if d['tipo'] == 'biddingDocuments' and 'integradas' in norm(d['titulo'])] or \
                [d for d in o['documentos'] if d['tipo'] == 'biddingDocuments' and 'administrativas' in norm(d['titulo'])]
        if bases:
            try:
                bajar(bases[-1]['url'], os.path.join(OUT, 'bases', f'{pid}.zip'))
                n_ba += 1
            except Exception as e:
                print('ERR bases', pid, e, flush=True)
print(f'LISTO pliegos={n_pl} bases_pistas={n_ba}', flush=True)
