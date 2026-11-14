"""¿Las causas reales de los adicionales ya estaban en el pliego de esa misma obra? (prueba fijada de antemano)
Para cada contrato con documentos de adicional/ampliación leídos (OCR) y con pliego, y para cada tema:
  - redes/terreno:   adicional por redes, buzones, conexiones, interferencias o falta de terreno ↔ pliego con
                     observaciones clasificadas como "Interferencias" o "Factibilidades y terreno"
  - suelo:           adicional por subrasante, suelo o relleno ↔ pliego con "Estudios básicos"
  - metrados:        adicional por mayores metrados ↔ pliego con "Metrados"
Estadístico: coincidencias observadas frente a la distribución por permutación (se baraja qué pliego corresponde a
qué contrato, dentro del mismo tipo de obra, 5000 veces).
Uso: python3 -I precursores.py <causas_adicionales.json> <exposicion_pliegos.json> <obras_la_libertad.json> <salida.json>
"""
import json, random, sys, collections
causas, expo, obras = (json.load(open(f)) for f in sys.argv[1:4])
tipo = {o['proceso']: o['tipo'] for o in obras}
TEMAS = {
  'redes/terreno': (lambda c: bool({'falta de terreno o interferencias'} & set(c['causas']) or {'redes, buzones y conexiones'} & set(c['trabajos'])), ['Interferencias', 'Factibilidades y terreno']),
  'suelo': (lambda c: bool({'mejoramiento de subrasante / suelo', 'relleno'} & set(c['trabajos'])), ['Estudios básicos']),
  'metrados': (lambda c: 'mayores metrados' in c['causas'], ['Metrados']),
}
procs = [p for p in causas['porProceso'] if p in expo and p in tipo]
print('contratos con causas leídas y pliego:', len(procs))
res = {}
random.seed(3)
for tema, (enAdicional, clases) in TEMAS.items():
    tiene = {p: enAdicional(causas['porProceso'][p]) for p in procs}
    pliego = {p: any(expo[p]['causasTodas'].get(c, 0) > 0 for c in clases) for p in procs}
    obs = sum(tiene[p] and pliego[p] for p in procs); conTema = sum(tiene.values())
    estr = collections.defaultdict(list)
    for p in procs: estr[tipo[p]].append(p)
    dist = []
    for _ in range(5000):
        perm = {}
        for ps in estr.values():
            v = [pliego[p] for p in ps]; random.shuffle(v); perm.update(zip(ps, v))
        dist.append(sum(tiene[p] and perm[p] for p in procs))
    esperado = sum(dist) / len(dist); pval = (sum(d >= obs for d in dist) + 1) / (len(dist) + 1)
    res[tema] = {'contratosConEseAdicional': conTema, 'yaEstabaEnElPliego': obs, 'esperadoAlAzar': round(esperado, 2), 'p': round(pval, 4),
                 'tasaPliegoBase': round(sum(pliego.values()) / len(procs), 3)}
    print(f'  {tema:14s} adicionales con el tema: {conTema:3d} | ya en el pliego: {obs:3d} | esperado al azar: {esperado:5.2f} | p = {pval:.3f}')
json.dump(res, open(sys.argv[4], 'w'), ensure_ascii=False, indent=1)
