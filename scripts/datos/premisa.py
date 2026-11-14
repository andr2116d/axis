"""Prueba de la premisa de Axis con datos reales de La Libertad (2025-2026):
  ¿las obras cuyo expediente recibió observaciones que la entidad ACOGIÓ en el pliego (errores reconocidos antes de
  contratar) terminan con más adicionales o ampliaciones de plazo?

Diseño:
  - Exposición: observaciones al expediente acogidas (clasificador entrenado, exposicion-pliegos.ts).
  - Resultado (metadatos OCDS, completos): documentos de adicional o ampliación publicados en el contrato,
    valor final mayor al contratado, fecha final real posterior a la pactada, nulidad o resolución.
  - Solo contratos con plazo ya vencido a la fecha de corte (si no, el resultado aún no se puede observar).
  - Confusores: tamaño (log VR), tipo de obra, plazo y número total de consultas (obras grandes reciben más
    consultas Y tienen más adicionales).
  - Regresión logística (IRLS, sin dependencias), razón de verosimilitud y prueba de permutación estratificada por tipo.
Uso: python3 -I premisa.py <obras_la_libertad.json> <contratos_la_libertad.json> <exposicion_pliegos.json> <salida.json> [corte=2026-10-15]
"""
import json, math, random, sys, collections

obras_f, contratos_f, expo_f, salida = sys.argv[1:5]
CORTE = sys.argv[5] if len(sys.argv) > 5 else '2026-10-15'
obras = {o['proceso']: o for o in json.load(open(obras_f))}
expo = json.load(open(expo_f))
porProc = collections.defaultdict(list)
for c in json.load(open(contratos_f)): porProc[c['proceso']].append(c)

filas = []
for pid, cs in porProc.items():
    if pid not in expo or pid not in obras: continue
    fin = max((c['fin'] or '')[:10] for c in cs)
    if not fin or fin > CORTE: continue  # resultado no observable todavía
    tit = [(d['titulo'] or '').lower() for c in cs for d in c['documentos']]
    adicional = any('adicional' in t for t in tit) or any(c['final'] and c['monto_contrato'] and c['final'] > c['monto_contrato'] * 1.001 for c in cs)
    ampliacion = any('ampliaci' in t for t in tit) or any(c['fin_real'] and c['fin'] and c['fin_real'][:10] > c['fin'][:10] for c in cs)
    corte_ant = any('nulidad' in t or ('resoluci' in t and 'contrato' in t) for t in tit)
    e, o = expo[pid], obras[pid]
    filas.append({'proceso': pid, 'tipo': o['tipo'], 'vr': o['monto_referencial'] or 1, 'plazo': max((c['dias'] or 0) for c in cs) or 90,
                  'consultas': e['consultas'], 'expediente': e['expediente'], 'acogidas': e['expAcogidas'], 'rechazadas': e['expediente'] - e['expAcogidas'],
                  'adicional': adicional, 'ampliacion': ampliacion, 'problema': adicional or ampliacion or corte_ant})
N = len(filas)
print(f'Contratos con pliego y plazo vencido al {CORTE}: {N}')

def wilson(k, n, z=1.96):
    if not n: return (None, None)
    p = k / n; d = 1 + z * z / n; c = (p + z * z / (2 * n)) / d; h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (c - h, c + h)
def tabla(res):
    print(f'\n  Resultado: {res}')
    grupos = [('0 acogidas', lambda f: f['acogidas'] == 0), ('1-2', lambda f: 1 <= f['acogidas'] <= 2), ('3 o más', lambda f: f['acogidas'] >= 3)]
    out = {}
    for g, cond in grupos:
        sel = [f for f in filas if cond(f)]; k = sum(f[res] for f in sel); lo, hi = wilson(k, len(sel))
        out[g] = {'n': len(sel), 'tasa': k / len(sel) if sel else None, 'ic95': [lo, hi]}
        print(f'    {g:11s} n={len(sel):4d}  {100 * k / max(1, len(sel)):5.1f}%  IC95 [{100 * (lo or 0):.1f}, {100 * (hi or 0):.1f}]')
    return out

# ----- regresión logística por IRLS -----
def resolver(A, b):
    n = len(A); M = [row[:] + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(M[r][c])); M[c], M[p] = M[p], M[c]
        if abs(M[c][c]) < 1e-12: M[c][c] = 1e-12
        for r in range(n):
            if r != c:
                f = M[r][c] / M[c][c]
                for k in range(c, n + 1): M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]
def inversa(A):
    n = len(A); return [list(x) for x in zip(*[resolver(A, [1.0 if i == j else 0.0 for i in range(n)]) for j in range(n)])]
def logit(X, y, iters=25, l2=1e-6):
    p = len(X[0]); b = [0.0] * p
    for _ in range(iters):
        H = [[l2 if i == j else 0.0 for j in range(p)] for i in range(p)]; g = [-l2 * b[i] for i in range(p)]
        for xi, yi in zip(X, y):
            eta = sum(a * c for a, c in zip(xi, b)); mu = 1 / (1 + math.exp(-max(-30, min(30, eta)))); w = mu * (1 - mu)
            for i in range(p):
                g[i] += (yi - mu) * xi[i]
                for j in range(i, p): H[i][j] += w * xi[i] * xi[j]
        for i in range(p):
            for j in range(i): H[i][j] = H[j][i]
        paso = resolver(H, g); b = [a + c for a, c in zip(b, paso)]
        if max(abs(x) for x in paso) < 1e-8: break
    ll = sum(yi * math.log(max(1e-12, 1 / (1 + math.exp(-sum(a * c for a, c in zip(xi, b)))))) + (1 - yi) * math.log(max(1e-12, 1 - 1 / (1 + math.exp(-sum(a * c for a, c in zip(xi, b)))))) for xi, yi in zip(X, y))
    return b, ll, inversa(H)
tipos = sorted({f['tipo'] for f in filas}); ref = 'pistas_veredas' if 'pistas_veredas' in tipos else tipos[0]
def mu_sd(v): m = sum(v) / len(v); return m, math.sqrt(sum((x - m) ** 2 for x in v) / len(v)) or 1
def matriz(expo_col, con_expo=True):
    cols = {'log VR': [math.log(f['vr']) for f in filas], 'plazo': [f['plazo'] for f in filas], 'log consultas': [math.log1p(f['consultas']) for f in filas]}
    if con_expo: cols['EXPOSICION'] = [math.log1p(f[expo_col]) for f in filas]
    est = {k: mu_sd(v) for k, v in cols.items()}
    X = [[1.0] + [(cols[k][i] - est[k][0]) / est[k][1] for k in cols] + [1.0 if filas[i]['tipo'] == t else 0.0 for t in tipos if t != ref] for i in range(N)]
    return X, list(cols) + [f'tipo={t}' for t in tipos if t != ref], est
def modelo(res, expo_col='acogidas', perms=300):
    y = [1 if f[res] else 0 for f in filas]
    X, nombres, est = matriz(expo_col); X0, _, _ = matriz(expo_col, False)
    b, ll, cov = logit(X, y); _, ll0, _ = logit(X0, y)
    k = nombres.index('EXPOSICION') + 1
    se = math.sqrt(max(1e-12, cov[k][k])); sd = est['EXPOSICION'][1]
    # OR por cada duplicación de (1 + acogidas): coeficiente estandarizado → por unidad de log1p → por log(2)
    orx = math.exp(b[k] / sd * math.log(2)); lo = math.exp((b[k] - 1.96 * se) / sd * math.log(2)); hi = math.exp((b[k] + 1.96 * se) / sd * math.log(2))
    lr = 2 * (ll - ll0); p_lr = math.erfc(math.sqrt(max(0, lr) / 2))  # chi2 con 1 gl
    # permutación de la exposición dentro de cada tipo de obra
    random.seed(11); mayor = 0; colk = [x[k] for x in X]
    estratos = collections.defaultdict(list)
    for i, f in enumerate(filas): estratos[f['tipo']].append(i)
    for _ in range(perms):
        nueva = colk[:]
        for idx in estratos.values():
            v = [colk[i] for i in idx]; random.shuffle(v)
            for i, x in zip(idx, v): nueva[i] = x
        Xp = [x[:k] + [nueva[i]] + x[k + 1:] for i, x in enumerate(X)]
        bp, _, _ = logit(Xp, y, iters=12)
        if abs(bp[k]) >= abs(b[k]): mayor += 1
    p_perm = (mayor + 1) / (perms + 1)
    print(f'    Logística ajustada ({expo_col}): OR por duplicar (1+{expo_col}) = {orx:.2f} IC95 [{lo:.2f}, {hi:.2f}]; razón de verosimilitud p = {p_lr:.3f}; permutación p = {p_perm:.3f}')
    otros = {nombres[i - 1]: round(b[i], 3) for i in range(1, len(b))}
    print(f'      coeficientes estandarizados: {otros}')
    return {'or_duplicar': orx, 'ic95': [lo, hi], 'p_lr': p_lr, 'p_perm': p_perm, 'coef': otros, 'eventos': sum(y), 'n': N}

res = {'corte': CORTE, 'n': N, 'resultados': {}}
pruebas = []
for r in ['problema', 'adicional', 'ampliacion']:
    t = tabla(r)
    res['resultados'][r] = {'tabla': t}
    for ex in ['acogidas', 'rechazadas', 'expediente']:
        m = modelo(r, ex, perms=200); res['resultados'][r][ex] = m; pruebas.append((r, ex, m['p_perm']))
# Corrección de Holm por las 9 pruebas (no buscar el resultado que convenga)
orden = sorted(pruebas, key=lambda x: x[2]); ajust = {}; prev = 0
for i, (r, ex, p) in enumerate(orden):
    prev = max(prev, min(1, (len(orden) - i) * p)); ajust[(r, ex)] = prev
print('\n  p de permutación ajustados por Holm (9 pruebas):')
for (r, ex), p in sorted(ajust.items()): print(f'    {r:11s} {ex:11s} {p:.3f}')
res['holm'] = {f'{r}|{ex}': p for (r, ex), p in ajust.items()}
json.dump(res, open(salida, 'w'), ensure_ascii=False, indent=1)
