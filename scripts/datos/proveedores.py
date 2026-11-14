"""Índice de antecedentes de proveedores por RUC, desde fuentes oficiales del OECE.

Fuentes (carpeta <crudos>/sanciones):
  - vigentes_2025.csv: Relación de proveedores sancionados por el Tribunal con sanción vigente (datosabiertos.gob.pe, dic. 2025), separador ';'
  - CONOSCESANCIONINHABILITANEW.csv: inhabilitaciones (CONOSCE), separador '|'
  - CONOSCESANCIONMULTANEW.csv: multas (CONOSCE)
  - CONOSCEPENALIDADNEW.csv: penalidades aplicadas en contratos (CONOSCE)

Privacidad: para RUC de persona natural (empieza en 10) no se guarda el nombre; solo los hechos y la resolución.
Uso: python3 -I scripts/datos/proveedores.py <crudos> <salida.json>
"""
import csv, io, json, re, sys
from collections import defaultdict

CRUDOS, SALIDA = sys.argv[1], sys.argv[2]

def leer(path, sep):
    raw = open(path, 'rb').read()
    try:
        txt = raw.decode('utf-8')
    except UnicodeDecodeError:
        txt = raw.decode('latin-1')
    return list(csv.DictReader(io.StringIO(txt), delimiter=sep))

def f8(s):
    s = (s or '').strip()
    if len(s) == 8 and s.isdigit():
        return f'{s[:4]}-{s[4:6]}-{s[6:]}'
    if len(s) == 8 and s[2] == '/':  # dd/mm/yy
        d, m, y = s.split('/')
        return f'20{y}-{m}-{d}'
    return None

def limpio(s):
    return ' '.join((s or '').replace('�', '').split())

idx = defaultdict(lambda: {'nombre': None, 'inhabilitaciones': [], 'multas': [], 'penalidades': []})
# Datos personales en textos libres (motivos de penalidad): DNI, nombres tras un tratamiento ("Ing. Nombre Apellido", "Sr. APELLIDO APELLIDO").
# Los cargos ("Ing. Residente") se conservan: no identifican a nadie.
CARGOS = {'RESIDENTE', 'SUPERVISOR', 'INSPECTOR', 'JEFE', 'ESPECIALISTA', 'GERENTE', 'TECNICO', 'TÉCNICO', 'ASISTENTE', 'CONTRATISTA', 'RESPONSABLE', 'ENCARGADO', 'ENCARGADA', 'DE', 'DEL', 'LA', 'EL', 'Y'}
_PAL = r"[A-ZÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ'-]+"
_TRAT = re.compile(r"\b(Ing|Arq|Abog|Lic|Bach|Dr|Dra|Sr|Sra|Srta)\.\s+(?:(?:Civil|Ambiental|Sanitario|Agr[oó]nomo|Ge[oó]logo|Mec[aá]nico|El[eé]ctrico|Industrial)\s+)?((?:" + _PAL + r"\.?\s*){1,5})")
def anonimizar(t):
    if not t: return t
    t = re.sub(r"\bD\.?N\.?I\.?\s*(?:N[°ºo.]*\s*)?:?\s*\d{8}\b", 'DNI [oculto]', t, flags=re.I)
    t = re.sub(r"\b(?:identificad[oa] con )?DNI \[oculto\]", 'DNI [oculto]', t)
    t = re.sub(r"\bC\.?I\.?P\.?\s*(?:N[°ºo.]*\s*)?:?\s*\d{4,7}\b", 'CIP [oculto]', t)
    def nombre(m):
        palabras = m.group(2).split()
        if palabras and palabras[0].strip('.').upper() in CARGOS: return m.group(0)
        return m.group(1) + '. [nombre oculto] '
    t = _TRAT.sub(nombre, t)
    t = re.sub(r"\b(señor|señora)\s+(" + _PAL + r"(?:\s+" + _PAL + r"){1,4})", lambda m: m.group(1) + ' [nombre oculto]', t, flags=re.I)
    return re.sub(r'\s{2,}', ' ', t).strip()

def registro(ruc, nombre):
    r = idx[ruc]
    if not r['nombre'] and nombre and not ruc.startswith('10'):
        r['nombre'] = limpio(nombre)
    return r

vistos = set()
for row in leer(f'{CRUDOS}/sanciones/vigentes_2025.csv', ';'):
    ruc = (row.get('RUC') or '').strip()
    if not ruc: continue
    k = (ruc, row.get('RESOLUCION'))
    vistos.add(k)
    registro(ruc, row.get('RAZON_SOCIAL'))['inhabilitaciones'].append({
        'resolucion': limpio(row.get('RESOLUCION')), 'tipo': limpio(row.get('INH')), 'periodo': limpio(row.get('PERIODO_INH')),
        'desde': f8(row.get('DESDE')), 'hasta': f8(row.get('HASTA')), 'motivo': anonimizar(limpio(row.get('INFRACCION'))).lstrip('- ')[:300],
        'fuente': 'OECE – Proveedores sancionados con sanción vigente (datosabiertos.gob.pe, dic. 2025)'})

for row in leer(f'{CRUDOS}/sanciones/CONOSCESANCIONINHABILITANEW.csv', '|'):
    ruc = (row.get('RUC') or '').strip()
    if not ruc or (ruc, row.get('NUMERO_RESOLUCION')) in vistos: continue
    registro(ruc, row.get('NOMBRE_RAZONODENOMINACIONSOCIAL'))['inhabilitaciones'].append({
        'resolucion': limpio(row.get('NUMERO_RESOLUCION')), 'tipo': 'Inhabilitación', 'periodo': None,
        'desde': f8(row.get('FECHA_INICIO')), 'hasta': f8(row.get('FECHA_FIN')), 'motivo': anonimizar(limpio(row.get('DE_MOTIVO_INFRACCION')))[:300],
        'fuente': 'OECE CONOSCE – sancionados.csv (corte ' + (row.get('FECHA_CORTE') or '') + ')'})

for row in leer(f'{CRUDOS}/sanciones/CONOSCESANCIONMULTANEW.csv', '|'):
    ruc = (row.get('RUC') or '').strip()
    if not ruc: continue
    try: monto = float(row.get('MONTO') or 0)
    except ValueError: monto = None
    registro(ruc, row.get('NOMBRE_RAZONODENOMINACIONSOCIAL'))['multas'].append({
        'resolucion': limpio(row.get('NUMERO_RESOLUCION')), 'desde': f8(row.get('FECHA_INICIO')), 'hasta': f8(row.get('FECHA_FIN')),
        'motivo': anonimizar(limpio(row.get('DE_MOTIVO_INFRACCION')))[:300], 'monto': monto, 'fuente': 'OECE CONOSCE – sancionados_multa.csv'})

for row in leer(f'{CRUDOS}/sanciones/CONOSCEPENALIDADNEW.csv', '|'):
    ruc = (row.get('RUC CONTRATISTA') or '').strip()
    if not ruc: continue
    try: monto = float(row.get('MONTO') or 0)
    except ValueError: monto = None
    registro(ruc, None)['penalidades'].append({
        'contrato': limpio(row.get('ID CONTRATO')), 'tipo': limpio(row.get('TIPO PENALIDAD')), 'objeto': limpio(row.get('OBJETO CONTRATO')),
        'entidad': limpio(row.get('ENTIDAD CONTRATANTE')), 'fecha': f8(row.get('FECHA PENALIDAD')), 'motivo': anonimizar(limpio(row.get('DESCRIPCION/MOTIVO')))[:200],
        'monto': monto, 'fuente': 'OECE CONOSCE – penalidades.csv'})

salida = {
    'fuentes': [
        'OECE – Relación de proveedores sancionados por el Tribunal con sanción vigente (datosabiertos.gob.pe, diciembre 2025)',
        'OECE CONOSCE – Datos abiertos de inhabilitaciones, multas y penalidades (corte marzo 2025)',
    ],
    'porRuc': idx,
}
json.dump(salida, open(SALIDA, 'w'), ensure_ascii=False, separators=(',', ':'))
print('RUC con antecedentes:', len(idx),
      '| inhabilitaciones', sum(len(v['inhabilitaciones']) for v in idx.values()),
      '| multas', sum(len(v['multas']) for v in idx.values()),
      '| penalidades', sum(len(v['penalidades']) for v in idx.values()))
