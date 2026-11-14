"""Validación retrospectiva sobre bases reales de obras de pistas y veredas de La Libertad (SEACE 2025-2026).

Busca en cada documento con texto el resumen de la cuantía (costo directo, gastos generales, utilidad, subtotal,
IGV y total) y verifica:
  1) subtotal = costo directo + gastos generales + utilidad
  2) IGV = 18% del subtotal
  3) total = subtotal + IGV
  4) total = valor referencial publicado en los datos abiertos del OECE (OCDS) para ese proceso
Uso: python3 -I scripts/analisis/retrospectiva_cuantia.py <crudos> <salida.json>
"""
import json, os, re, subprocess, sys

CRUDOS, SAL = sys.argv[1], sys.argv[2]
obras = {o['ocid'].split('seacev3-', 1)[-1]: o for o in json.load(open(os.path.join(CRUDOS, 'obras_la_libertad.json')))}

def num(s):
    s = s.replace('´', '').replace('’', '').replace("'", '').replace(' ', '')
    if re.fullmatch(r'\d{1,3}(\.\d{3})+,\d{2}', s): s = s.replace('.', '').replace(',', '.')
    elif re.fullmatch(r'\d{1,3}(\.\d{3})+\.\d{2}', s): s = s.replace('.', '', s.count('.') - 1)
    else: s = s.replace(',', '')
    try: return float(s)
    except ValueError: return None

NUM = r'(\d{1,3}(?:[´’\',.\s]?\d{3})*[.,]\d{2})'
def bloque(txt):
    """Primer resumen de cuantía con números (no la plantilla del Anexo 6 con [CONSIGNAR])."""
    for m in re.finditer(r'(?is)costo\s+directo[^\n\d\[]*' + NUM + r'(.{0,900})', txt):
        cd = num(m.group(1)); resto = m.group(2)
        g = re.search(r'(?i)gastos\s+generales[^\n\d]*(?:\(([\d.,…]*)\s*%\))?[^\n\d]*' + NUM, resto)
        u = re.search(r'(?i)utilidad(?:es)?[^\n\d]*(?:\(([\d.,…]*)\s*%\))?[^\n\d]*' + NUM, resto)
        st = re.search(r'(?i)sub\s*-?\s*total[^\n\d]*' + NUM, resto)
        igv = re.search(r'(?i)i\.?\s*g\.?\s*v\.?[^\n]*?\(18\s*%\)[^\n\d]*' + NUM + r'|i\.?g\.?v\.?[^\n\d]*' + NUM, resto)
        tot = None
        for patron in (r'cuant[ií]a[^\n\d]*', r'valor\s+referencial[^\n\d]*', r'presupuesto\s+(?:de\s+obra|total|base)[^\n\d]*', r'monto\s+total[^\n\d]*', r'(?<!sub)(?<!sub )(?<!sub-)\btotal\b[^\n\d]*'):
            tot = re.search(r'(?i)' + patron + NUM, resto)
            if tot: break
        if cd and g and u and st:
            v = lambda x, i=1: num(x.group(i)) if x and x.group(i) else None
            return {'cd': cd, 'gg': v(g, 2), 'ut': v(u, 2), 'st': v(st), 'igv': (v(igv) or v(igv, 2)) if igv else None, 'total': v(tot) if tot else None, 'extracto': ' '.join(m.group(0)[:400].split())}
    return None

def textos(pid):
    """Texto de cada PDF de un proceso (bases sueltas o extraídas de zip/rar)."""
    rutas = []
    b = os.path.join(CRUDOS, 'bases', pid + '.zip')
    if os.path.exists(b) and open(b, 'rb').read(4) == b'%PDF': rutas.append(b)
    d = os.path.join(CRUDOS, 'bases_extraidas', pid)
    if os.path.isdir(d): rutas += [os.path.join(r, f) for r, _, fs in os.walk(d) for f in fs if f.lower().endswith('.pdf')]
    for r in rutas:
        try: yield r, subprocess.run(['pdftotext', '-layout', r, '-'], capture_output=True, timeout=120).stdout.decode('utf-8', 'ignore')
        except Exception: pass

res = []
for f in sorted(os.listdir(os.path.join(CRUDOS, 'bases'))):
    pid = f[:-4]
    o = obras.get(pid, {})
    hallado = None
    for ruta, t in textos(pid):
        if len(t.strip()) < 500: continue
        b = bloque(t)
        if b: hallado = (ruta, b); break
    if not hallado:
        res.append({'proceso': pid, 'estado': 'sin resumen legible'}); continue
    ruta, b = hallado
    obs = []
    # Lectura dudosa: porcentajes imposibles indican que el texto se leyó mal (no se acusa)
    if b['gg'] and b['ut'] and not (0.03 <= b['gg'] / b['cd'] <= 0.30 and 0.02 <= b['ut'] / b['cd'] <= 0.15):
        res.append({'proceso': pid, 'nomenclatura': o.get('nomenclatura'), 'estado': 'lectura dudosa', 'resumen': b}); continue
    if b['gg'] is not None and b['ut'] is not None and b['st'] is not None and abs(b['cd'] + b['gg'] + b['ut'] - b['st']) > 1:
        obs.append(f"subtotal {b['st']:,.2f} ≠ CD+GG+U {b['cd'] + b['gg'] + b['ut']:,.2f}")
    if b['igv'] is not None and b['st'] is not None and abs(b['st'] * 0.18 - b['igv']) > 1:
        obs.append(f"IGV {b['igv']:,.2f} ≠ 18% del subtotal {b['st'] * 0.18:,.2f}")
    if b['total'] is not None and b['st'] is not None and b['igv'] is not None and abs(b['st'] + b['igv'] - b['total']) > 1:
        obs.append(f"total {b['total']:,.2f} ≠ subtotal+IGV {b['st'] + b['igv']:,.2f}")
    vr = o.get('monto_referencial')
    paquete = 'PAQUETE' in (o.get('descripcion') or '').upper() or ',' in (o.get('cui') or '')
    if b['total'] and vr and vr > 0 and abs(b['total'] - vr) > 1 and not paquete:
        obs.append(f"total de las bases {b['total']:,.2f} ≠ valor referencial en el SEACE {vr:,.2f}")
    pct_gg = round(100 * b['gg'] / b['cd'], 2) if b['gg'] else None
    res.append({'proceso': pid, 'nomenclatura': o.get('nomenclatura'), 'entidad': o.get('entidad'), 'obra': (o.get('descripcion') or '')[:140], 'cui': o.get('cui'),
                'estado': 'con observaciones' if obs else 'cuadra', 'observaciones': obs, 'resumen': b, 'gastosGeneralesPct': pct_gg, 'documento': os.path.basename(ruta)})

json.dump(res, open(SAL, 'w'), ensure_ascii=False, indent=1)
from collections import Counter
print(Counter(r['estado'] for r in res))
for r in res:
    if r['estado'] == 'con observaciones':
        print('-', r['proceso'], r['nomenclatura'], '|', r['entidad'][:35], '|', '; '.join(r['observaciones']))
