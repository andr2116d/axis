"""Etiqueta (con reglas transparentes) las situaciones adversas de la Contraloría por etapa y marca las atribuibles
al expediente técnico, que son las que Axis puede prevenir antes de convocar.
Uso: python3 -I taxonomia_situaciones.py <situaciones.json> <salida.json>
"""
import json, re, sys, unicodedata, collections

def n(s): return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn').upper()
ETAPAS = [
  ('Expediente técnico', r'EXPEDIENTE TECNICO (?:\w+ ){0,6}(?:DEFICIEN|INCOMPATIB|ERROR|OMISI|NO CONSIDER|NO CONTEMPL|NO INCLU|INCONSISTEN|DESACTUALIZ|CARECE|SIN |NO CUENTA)|(?:DEFICIEN|INCOMPATIB|ERROR|OMISI|INCONSISTEN|DESACTUALIZ)\w* (?:\w+ ){0,6}EXPEDIENTE|NO (?:SE )?(?:HA )?CONSIDER\w+ (?:\w+ ){0,8}(?:EN EL|EN LOS|DEL) (?:EXPEDIENTE|PRESUPUESTO|PLANOS)|ESTUDIO DE (?:MECANICA DE )?SUELOS|ESTUDIOS BASICOS|PLANOS? (?:\w+ ){0,4}(?:NO|INCOMPATIB|DEFICIEN)|MEMORIA DE CALCULO|FORMULACION|ELABORACION DEL EXPEDIENTE|PERFIL|FICHA TECNICA'),
  ('Terreno e interferencias', r'LIBRE DISPONIBILIDAD|INTERFERENCI|POSTES?|REDES? (?:DE )?(?:AGUA|DESAGUE|ALCANTARILLADO|ELECTRIC)|SANEAMIENTO FISICO|REUBICACION|PROPIETARIOS'),
  ('Drenaje', r'DRENAJE|PLUVIAL|CUNETA|SUMIDERO|ALCANTARILLA'),
  ('Calidad de lo ejecutado', r'NO CUMPLE\w* (?:CON )?(?:LAS |LO )?(?:ESPECIFICACIONES|ESTABLECIDO|DISPUESTO)|ESPECIFICACIONES TECNICAS|FISURA|GRIETA|DETERIORO|ESPESOR|COMPACTACION|RESISTENCIA|CALIDAD|PRUEBAS? DE|ENSAYO|DEFECTO|DESPRENDIMIENTO|HUNDIMIENTO|DIFERENTE A LO ESTABLECIDO|NO CONFORME'),
  ('Valorizaciones y pagos', r'VALORIZ|METRADOS? (?:\w+ ){0,4}(?:MAYOR|SUPERIOR|NO EJECUTAD)|PAGO|PAGAD|PENALIDAD|MORA|ADELANTO'),
  ('Adicionales y modificaciones', r'ADICIONAL|DEDUCTIVO|MODIFICACI\w+ (?:\w+ ){0,3}(?:EXPEDIENTE|PROYECTO|CONTRATO)|VARIACI'),
  ('Plazo y paralización', r'PARALIZ|RETRASO|ATRASO|DEMORA|AMPLIACION DE PLAZO|CRONOGRAMA|AVANCE'),
  ('Supervisión y control', r'SUPERVIS|INSPECTOR|CUADERNO DE OBRA|RESIDENTE|PERSONAL CLAVE|PERMANENCIA'),
  ('Seguridad y señalización', r'SEGURIDAD|SEÑALIZ|SENALIZ|EPP|PROTECCION PERSONAL|ACCIDENTE|SST'),
  ('Contratación', r'BASES|PROCEDIMIENTO DE SELECCION|GARANTIA|POSTOR|BUENA PRO|CONVOCATORIA|PERFECCIONAMIENTO'),
  ('Liquidación y cierre', r'LIQUIDACION|RECEPCION|INFOBRAS|TRANSFERENCIA|CIERRE|OPERACION Y MANTENIMIENTO'),
  ('Ambiental y residuos', r'AMBIENTAL|MATERIAL EXCEDENTE|RESIDUOS|DESMONTE|BOTADERO|POLVO'),
]
L = json.load(open(sys.argv[1]))
for x in L:
    t = n(x['texto'])
    x['etapas'] = [e for e, r in ETAPAS if re.search(r, t)]
    x['expediente'] = 'Expediente técnico' in x['etapas'] or ('Drenaje' in x['etapas'] and re.search(r'NO (?:SE )?(?:HA )?CONSIDER|NO CONTEMPL|NO INCLU|SIN ', t) is not None)
json.dump(L, open(sys.argv[2], 'w'), ensure_ascii=False, indent=0)
def resumen(sub, nombre):
    c = collections.Counter(e for x in sub for e in (x['etapas'] or ['Otra']))
    print(f'\n{nombre}: {len(sub)} situaciones de {len({x["informe"] for x in sub})} informes; atribuibles al expediente: {sum(x["expediente"] for x in sub)} ({sum(x["expediente"] for x in sub)/len(sub):.0%})')
    for e, k in c.most_common(): print(f'  {e:28s} {k:4d}  {k/len(sub):.0%}')
resumen(L, 'Perú'); resumen([x for x in L if x['departamento'] == 'LA LIBERTAD'], 'La Libertad')
