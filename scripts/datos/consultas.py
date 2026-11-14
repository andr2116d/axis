"""Extrae cada consulta/observación de los pliegos de absolución (texto de pdftotext) y les pone una etiqueta
"de plata" (automática, por reglas) para entrenar el clasificador. El conjunto de referencia hecho a mano
(etiquetas-oro.json) se excluye del entrenamiento y sirve solo para medir.

Uso: python3 -I scripts/datos/consultas.py <crudos> <salida.json>
"""
import glob, json, os, re, sys, unicodedata

CRUDOS, SALIDA = sys.argv[1], sys.argv[2]

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', (s or '').lower()) if unicodedata.category(c) != 'Mn')

TAX = {
    'Metrados': r'metrado|planilla de metrados',
    'Presupuesto y precios': r'precio unitario|analisis de (costos|precios)|\bapu\b|insumo|gastos generales|formula polinomica|presupuesto|flete|cotizaci|\bigv\b|utilidad',
    'Planos': r'\bplano|lamina|detalle constructivo',
    'Especificaciones técnicas': r'especificaci|norma tecnica|ensayo|diseno de mezcla',
    'Estudios básicos': r'estudio de (mecanica de )?suelos|\bems\b|capacidad portante|\bnapa\b|freatic|topografi|hidrolog|licuef|calicata|memoria de calculo',
    'Interferencias': r'interferencia|\bposte|buzon(es)? existente|redes existentes|tuberia existente|instalaciones existentes|demolicion',
    'Cronograma': r'cronograma|ruta critica|calendario|programacion de obra|gantt|lluvia',
    'Factibilidades y terreno': r'libre disponibilidad|disponibilidad (fisica )?del terreno|saneamiento fisico|factibilidad|cantera|botadero|\bdme\b|acceso',
    'Normativa': r'instrumento de gestion ambiental|herramienta ambiental|certificado ambiental|\bcira\b|arqueolog|\brne\b|norma e\.0|accesibilidad',
}
BASES = r'personal clave|experiencia del postor|factor(es)? de evaluacion|subespecialidad|anexo n|puntaje|garantia|consorci|requisito(s)? de calificacion|perfeccionamiento|adelanto|mype|capacitacion|formacion academica|equipamiento estrategico|sostenibilidad (social|ambiental)|\biso\b|penalidad|nombre del proceso|editable|excel|cuantia|oferta economica|plazo de ejecucion'
ACEPTA = r'se acoge|acoger|se corrige|se corregira|se modifica|se precisa|error material|se reemplaza|se actualiza|se incorpora|se adjunta|se integra'
NIEGA = r'no se acoge|no acoger|no corresponde|se ratifica'

def limpia(t):
    t = re.sub(r'^\s*Consulta/Observaci[oó]n:\s*', '', t)
    t = re.split(r'Ac[aá]pite de las bases', t)[0]
    return re.sub(r'\s+', ' ', t).strip()

def plata(texto):
    n = norm(texto)
    causas = [c for c, rx in TAX.items() if re.search(rx, n)]
    bases = bool(re.search(BASES, n))
    if bases and not causas:
        return 'Bases y procedimiento'
    if len(causas) == 1 and not bases:
        return causas[0]
    return None  # ambiguo: no se usa para entrenar

obras = {o['ocid'].split('seacev3-', 1)[-1]: o for o in json.load(open(os.path.join(CRUDOS, 'obras_la_libertad.json')))}
items = []
for txt in sorted(glob.glob(os.path.join(CRUDOS, 'pliegos', '*.txt'))):
    pid = os.path.basename(txt).split('_')[0]
    o = obras.get(pid, {})
    t = open(txt, encoding='utf-8', errors='ignore').read()
    for b in re.split(r'\n\s*(?:Observaci[oó]n|Consulta):\s*Nro\.\s*\d+', t)[1:]:
        partes = re.split(r'An[aá]lisis respecto de la consulta u observaci[oó]n:', b, maxsplit=1)
        pregunta = limpia(partes[0])
        if len(pregunta) < 30:
            continue
        respuesta = re.sub(r'\s+', ' ', partes[1]).strip()[:1200] if len(partes) > 1 else ''
        respuesta = re.split(r'Precisi[oó]n de aquello que se incorporar[aá]', respuesta)[0]
        nr = norm(respuesta)
        items.append({
            'proceso': pid, 'mes': o.get('mes'), 'tipoObra': o.get('tipo'), 'entidad': o.get('entidad'), 'cui': o.get('cui'),
            'texto': pregunta[:1500], 'respuesta': respuesta[:900],
            'aceptada': bool(re.search(ACEPTA, nr)) and not re.search(NIEGA, nr),
            'plata': plata(pregunta),
        })

# Quitar duplicados exactos (un mismo pliego a veces se publica dos veces)
vistos, unicos = set(), []
for i in items:
    k = (i['proceso'], i['texto'][:200])
    if k not in vistos:
        vistos.add(k); unicos.append(i)
json.dump(unicos, open(SALIDA, 'w'), ensure_ascii=False)
import collections
print('consultas', len(unicos), '| procesos', len({i['proceso'] for i in unicos}),
      '| con etiqueta de plata', sum(1 for i in unicos if i['plata']))
print(collections.Counter(i['plata'] for i in unicos if i['plata']).most_common())
