"""Integrantes de consorcios ganadores (La Libertad) a partir del texto de sus contratos (consorcios_contratos.py).
Toma los RUC (11 dígitos, 10/15/17/20) del encabezado del contrato y descarta: el RUC de la entidad (OCDS) y el
RUC tributario del propio consorcio. El nombre de la empresa es el texto anterior a "con RUC". Para personas
naturales (RUC 10) no se guarda el nombre. Agrega el resultado como "miembros" en competencia_la_libertad.json.
Uso: python3 -I miembros_consorcios.py <dir_oece_zips> <dir_contratos_txt> <obras_la_libertad.json> <competencia.json>
"""
import glob, json, os, re, sys, zipfile, collections

oece, dtxt, obras_f, comp_f = sys.argv[1:5]
entidades = set()  # RUC de entidades compradoras (para no confundirlas con integrantes)
nombres = {}       # nombre oficial por RUC según las partes OCDS (postores de todo el Perú)
for f in glob.glob(os.path.join(oece, '*.zip')):
    z = zipfile.ZipFile(f); d = json.load(z.open(z.namelist()[0]))
    for r in d['records']:
        for p in r.get('compiledRelease', r).get('parties', []):
            if 'buyer' in p.get('roles', []):
                for a in p.get('additionalIdentifiers', []): entidades.add(a.get('id'))
            elif p.get('identifier', {}).get('scheme') == 'PE-RUC':
                nombres.setdefault(p['identifier'].get('id'), p.get('name'))
ganador = {}
for o in json.load(open(obras_f)):
    for p in o['postores']:
        if 'supplier' in (p.get('roles') or []): ganador.setdefault(o['proceso'], []).append((p['ruc'], p['nombre']))
RUC = re.compile(r'R\.?\s?U\.?\s?C\.?\s*(?:N[°º.o]*\s*)?:?\s*((?:10|15|17|20)\d{9})\b', re.I)
SOC = re.compile(r'([A-ZÁÉÍÓÚÑ0-9&\.\-\' ]{3,90}?(?:S\.?\s?A\.?\s?C\.?|E\.?\s?I\.?\s?R\.?\s?L\.?|S\.?\s?R\.?\s?L(?:TDA)?\.?|S\.?\s?A\.?|S\.?\s?C\.?\s?R\.?\s?L\.?))\s*[,.]?\s*(?:\([^)]*\)\s*)?(?:con|CON|identificad[ao] con)?\s*(?:el\s+)?(?:Registro Único de Contribuyentes\s*)?$')
miembros, stats = {}, collections.Counter()
for f in sorted(glob.glob(os.path.join(dtxt, '*.txt'))):
    proceso = os.path.basename(f).rsplit('_', 1)[0]
    cons = [g for g in ganador.get(proceso, []) if not re.fullmatch(r'(10|15|17|20)\d{9}', g[0])]
    if not cons: continue
    t = open(f, errors='ignore').read()[:20000]
    plano = ' '.join(t.split())
    encontrados = {}
    for m in RUC.finditer(plano):
        ruc = m.group(1)
        if ruc in entidades: continue
        antes = plano[max(0, m.start() - 160):m.start()]
        if re.search(r'ENTIDAD|MUNICIPALIDAD|GOBIERNO|SEDALIB|UNIVERSIDAD|MINISTERIO|PROGRAMA', antes[-80:], re.I): continue
        if re.search(r'CONSORCIO\s+[A-ZÁÉÍÓÚÑ0-9&\'\- ]{2,40},?\s*(?:con|CON)?\s*$', antes) and not re.search(r'S\.?A\.?C|E\.?I\.?R\.?L|S\.?R\.?L', antes[-60:], re.I):
            continue  # RUC tributario del consorcio
        nom = SOC.search(antes)
        nombre = ' '.join(nom.group(1).split()).strip(' -.,:') if nom else None
        if nombre: nombre = re.sub(r'^.*?\b(?:EMPRESAS?|POR|Y|:|-)\s+', '', nombre) if len(nombre) > 70 else nombre
        part = re.search(r'participaci[oó]n\s+(?:del?\s+)?(\d{1,3})\s*%', plano[m.end():m.end() + 80], re.I)
        if nombre and re.search(r'SEDE|NOMBRE DEL|OFICINA|REGISTRAL|DOMICILIO', nombre, re.I): nombre = None
        if ruc in nombres: nombre = nombres[ruc]  # nombre oficial (OCDS) si existe
        e = encontrados.setdefault(ruc, {'ruc': ruc, 'nombre': None if ruc.startswith('10') else nombre, 'participacion': int(part.group(1)) if part else None, 'nombreOficial': ruc in nombres})
        if not e['nombre'] and nombre and not ruc.startswith('10'): e['nombre'] = nombre
    if 2 <= len(encontrados) <= 6:
        for c in cons: miembros[c[0]] = list(encontrados.values())
        stats['ok'] += 1
    else: stats[f'descartado ({len(encontrados)} RUC)'] += 1
comp = json.load(open(comp_f)); comp['miembros'] = miembros
json.dump(comp, open(comp_f, 'w'), ensure_ascii=False, separators=(',', ':'))
print(dict(stats), '| consorcios con integrantes:', len(miembros))
for k, v in list(miembros.items())[:6]: print(' ', k, [(x['ruc'], (x['nombre'] or '')[:40], x['participacion']) for x in v])
