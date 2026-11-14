"""Extrae el texto de los presupuestos de obra contenidos en las bases descargadas del SEACE.

Seguridad: los zip son archivos de terceros. Cada uno se descomprime en su propia carpeta, solo se usan
los nombres de archivo (nunca rutas, para evitar "zip slip"), se limitan tamaño y número de archivos,
y solo se procesan PDF con pdftotext. No se ejecuta ningún contenido.

Uso: python3 -I scripts/datos/extraer-presupuestos.py <crudos>
Salida: <crudos>/presupuestos_txt/<proceso>__<archivo>.txt (solo los PDF que contienen un presupuesto con texto)
"""
import io, os, re, subprocess, sys, zipfile

CRUDOS = sys.argv[1]
BASES = os.path.join(CRUDOS, 'bases')
TMP = os.path.join(CRUDOS, 'bases_extraidas')
OUT = os.path.join(CRUDOS, 'presupuestos_txt')
os.makedirs(TMP, exist_ok=True); os.makedirs(OUT, exist_ok=True)
MAX_ARCHIVO = 80 * 1024 * 1024

def seguro(nombre):
    base = os.path.basename(nombre.replace('\\', '/'))
    return re.sub(r'[^A-Za-z0-9._ -]', '_', base)[:120] or 'archivo'

def pdfs_de_zip(data, destino, nivel=0):
    out = []
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        for info in z.infolist()[:200]:
            if info.is_dir() or info.file_size > MAX_ARCHIVO:
                continue
            nombre = seguro(info.filename)
            contenido = z.read(info)
            if nombre.lower().endswith('.zip') and nivel == 0:
                out += pdfs_de_zip(contenido, destino, 1)
            elif nombre.lower().endswith('.pdf'):
                ruta = os.path.join(destino, nombre)
                with open(ruta, 'wb') as f:
                    f.write(contenido)
                out.append(ruta)
    return out

def es_presupuesto(txt):
    # Encabezado de presupuesto y al menos 5 líneas con código de ítem, unidad y 3 números
    if not re.search(r'(?im)^\s*presupuesto\b', txt):
        return False
    filas = re.findall(r'(?m)^\s*\d{2}(?:\.\d{2})+\s+.+?\s(?:m|ml|m2|m3|und|glb|kg|est|pto|mes|hh)\.?\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s+[\d,]+\.\d{2}\s*$', txt)
    return len(filas) >= 5

n_zip = n_pdf = n_pres = 0
for z in sorted(os.listdir(BASES)):
    if not z.endswith('.zip'):
        continue
    pid = z[:-4]
    destino = os.path.join(TMP, pid)
    os.makedirs(destino, exist_ok=True)
    ruta = os.path.join(BASES, z)
    cabeza = open(ruta, 'rb').read(8)
    try:
        if cabeza.startswith(b'%PDF'):
            pdfs = [ruta]  # el SEACE a veces publica las bases como un solo PDF
        elif cabeza.startswith(b'Rar!'):
            # bsdtar (incluido en macOS) rechaza rutas absolutas y con '..' por defecto
            subprocess.run(['bsdtar', '-xf', ruta, '-C', destino, '--no-same-owner', '--no-same-permissions'], capture_output=True, timeout=300)
            pdfs = [os.path.join(r, f) for r, _, fs in os.walk(destino) for f in fs if f.lower().endswith('.pdf') and os.path.realpath(os.path.join(r, f)).startswith(os.path.realpath(destino))]
        else:
            pdfs = pdfs_de_zip(open(ruta, 'rb').read(), destino)
    except Exception as e:
        print('archivo no legible', z, e); continue
    n_zip += 1
    for pdf in pdfs:
        n_pdf += 1
        salida = os.path.join(OUT, f'{pid}__{seguro(os.path.basename(pdf))[:-4]}.txt')
        if os.path.exists(salida):
            n_pres += 1; continue
        try:
            txt = subprocess.run(['pdftotext', '-layout', pdf, '-'], capture_output=True, timeout=120).stdout.decode('utf-8', 'ignore')
        except Exception:
            continue
        if es_presupuesto(txt):
            # Solo las páginas que parecen de presupuesto (el resto de las bases no se necesita)
            paginas = txt.split('\f')
            utiles = [p for p in paginas if re.search(r'(?im)^\s*presupuesto\b|^\s*\d{2}(?:\.\d{2})+\s.+\d\.\d{2}\s*$|COSTO DIRECTO|SON\s*:', p)]
            open(salida, 'w').write('\f'.join(utiles))
            n_pres += 1
print(f'zips {n_zip} | pdfs {n_pdf} | presupuestos con texto {n_pres}')
