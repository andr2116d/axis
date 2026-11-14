"""Informes de servicios de control de la Contraloría General de la República (buscador público
appbp.contraloria.gob.pe/BuscadorCGR) sobre obras viales urbanas (pistas, veredas, movilidad urbana).

Paso 1 (metadatos): guarda solo datos del informe — código, entidad, ubicación, título, modalidad, fechas y enlaces.
  NO guarda nombres, DNI ni tipos de responsabilidad de funcionarios (campos Text, Funcionarios, Responsabilidad).
Paso 2 (pdf): descarga la ficha resumen (RE: texto con las situaciones adversas) de los informes viales desde 2022,
  primero La Libertad, uno por segundo, reanudable; guarda solo el texto.
Uso: python3 -I contraloria.py <dir_salida> metadatos|pdf
"""
import json, os, subprocess, sys, time, unicodedata

URL = 'https://appbp.contraloria.gob.pe/BuscadorCGR/Informes/BusquedaInformesCGR.ashx'
CONSULTAS = ['pistas veredas', 'movilidad urbana', 'pavimentacion', 'pavimento', 'transitabilidad vehicular peatonal']
CAMPOS = ['CodigoInforme', 'Departamento', 'Provincia', 'Distrito', 'Descripcion', 'Entidad', 'FechaEmision', 'FechaPublicacion',
          'ModalidadServicio', 'ServicioControl', 'NumeroInforme', 'Sector', 'Periodo', 'NivelGobierno', 'RutaCloudInforme', 'RutaCloudResumen',
          'TieneApendice', 'TieneAnexos']

def norm(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').upper()

def post(datos):
    args = ['curl', '-s', '-m', '120', '-X', 'POST', URL, '-H', 'X-Requested-With: XMLHttpRequest']
    for k, v in datos.items(): args += ['--data-urlencode', f'{k}={v}']
    return json.loads(subprocess.run(args, capture_output=True, check=True).stdout or b'[]')

def metadatos(salida):
    informes = {}
    for q in CONSULTAS:
        pagina, paginas = 1, 1
        while pagina <= paginas:
            r = post({'ActionPage': 'TransportType', 'Action': 'loadInformesElastic', 'PageSize': 100, 'PageNumber': pagina, 'pGeneral': q})
            if not r: break
            paginas = int(r[0].get('TotalPages') or 1)
            for x in r:
                informes.setdefault(x['CodigoInforme'], {k: x.get(k) for k in CAMPOS})
            print(q, pagina, '/', paginas, len(informes), flush=True)
            pagina += 1; time.sleep(1)
    lst = sorted(informes.values(), key=lambda x: x['FechaEmision'] or '', reverse=True)
    json.dump(lst, open(os.path.join(salida, 'informes.json'), 'w'), ensure_ascii=False, indent=0)
    print('informes', len(lst))

def relevante(x):
    d = norm(x['Descripcion'])
    vial = any(k in d for k in ['PISTA', 'VEREDA', 'PAVIMENT', 'MOVILIDAD URBANA', 'TRANSITABILIDAD'])
    return vial and (x['Periodo'] or '0') >= '2022'

def pdf(salida):
    lst = [x for x in json.load(open(os.path.join(salida, 'informes.json'))) if relevante(x)]
    # Primero La Libertad, luego el resto del Perú
    lst.sort(key=lambda x: (x['Departamento'] != 'LA LIBERTAD', -(int(x['Periodo'] or 0))))
    carpeta = os.path.join(salida, 'pdf'); os.makedirs(carpeta, exist_ok=True)
    tope = int(os.environ.get('TOPE', '100000'))
    for i, x in enumerate(lst[:tope]):
        destino = os.path.join(carpeta, os.path.basename(x['CodigoInforme']) + '.pdf')
        texto = destino[:-4] + '.txt'
        if os.path.exists(texto): continue
        url = (x['RutaCloudResumen'] or x['RutaCloudInforme'] or '').replace('http://', 'https://')
        if not url: continue
        r = subprocess.run(['curl', '-sL', '-m', '180', '--max-filesize', '20000000', '-o', destino, url])
        ok = os.path.exists(destino) and open(destino, 'rb').read(4) == b'%PDF'
        if ok:  # solo se conserva el texto (los PDF traen fotos y pesan decenas de MB)
            subprocess.run(['pdftotext', '-layout', destino, texto])
        if os.path.exists(destino): os.remove(destino)
        print(i, x['Departamento'], x['CodigoInforme'], 'ok' if ok else 'falla', flush=True)
        time.sleep(1)

if __name__ == '__main__':
    salida, paso = sys.argv[1], sys.argv[2]
    os.makedirs(salida, exist_ok=True)
    metadatos(salida) if paso == 'metadatos' else pdf(salida)
