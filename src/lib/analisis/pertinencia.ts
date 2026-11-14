// ¿Lo que se subió es un expediente técnico de obra (o una parte)? Antes de revisar hay que saber si tiene sentido revisar.
// Sin este filtro, un CV o una receta pasaban todas las pruebas "sin problemas", porque ninguna prueba tenía de qué quejarse.
// Señales: partes reconocidas por su encabezado, partidas de presupuesto, líneas con unidades de obra y vocabulario de construcción.
// Si además el documento se presenta como otra cosa (bases, pliego, contrato, informe de control, norma, valorización…), se dice qué parece.

import { normalizar } from './numeros';
import { detectarPagina, pareceBases, type Documento } from './nombres';

type Pag = { numero: number; lineas: string[] };

export type Parecido = 'bases' | 'pliego' | 'contrato' | 'informe_control' | 'norma' | 'ejecucion' | 'tdr' | 'comprobante' | 'academico' | 'tramite' | 'informe';
export const NOMBRE_PARECIDO: Record<Parecido, string> = {
  bases: 'las bases del procedimiento de selección',
  pliego: 'un pliego de absolución de consultas',
  contrato: 'un contrato',
  informe_control: 'un informe de control',
  norma: 'una norma técnica o legal',
  ejecucion: 'un documento de la ejecución de la obra (valorización, adicional, liquidación o informe de supervisión)',
  tdr: 'unos términos de referencia',
  comprobante: 'un comprobante de pago',
  academico: 'un documento académico o personal (tesis, sílabo o currículum)',
  tramite: 'un documento administrativo (acta, oficio, solicitud o carta)',
  informe: 'un informe',
};

export interface Pertinencia {
  /** expediente: hay partes reconocibles · dudoso: habla de obras pero no se reconoce ninguna parte · ajeno: no es de una obra. */
  nivel: 'expediente' | 'dudoso' | 'ajeno';
  /** Qué parece ser, si se presenta como otro tipo de documento. */
  parece?: Parecido;
  partes: Documento[];
  partidas: number;
  lineasConUnidad: number;
  terminos: number;
  /** Una frase para la persona. */
  motivo: string;
}

const PARTES_EXPEDIENTE: Documento[] = ['memoria', 'presupuesto', 'metrados', 'apu', 'gastos', 'especificaciones', 'cronograma', 'formula', 'suelos', 'planos', 'cotizaciones'];

// Vocabulario de obra: cada término cuenta una vez por documento.
const TERMINOS = [
  'CONCRETO', 'ENCOFRADO', 'DESENCOFRADO', 'ACERO CORRUGADO', 'CEMENTO', 'AGREGADO GRUESO', 'AGREGADO FINO', 'ARENA GRUESA', 'PIEDRA CHANCADA', 'HORMIGON', 'EXCAVACION', 'RELLENO',
  'COMPACTACION', 'COMPACTADO', 'SUBRASANTE', 'SUB BASE', 'SUB-BASE', 'BASE GRANULAR', 'ASFALT\\w*', 'PAVIMENT\\w*', 'VEREDA', 'SARDINEL', 'CUNETA', 'BERMA', 'CALZADA',
  'TRAZO', 'NIVELACION', 'REPLANTEO', 'MOVIMIENTO DE TIERRAS', 'OBRAS PROVISIONALES', 'ELIMINACION DE MATERIAL EXCEDENTE', 'CARTEL DE OBRA', 'SEÑALIZACION', 'SENALIZACION',
  'CURADO', 'MEZCLADORA', 'VIBRADOR', 'RODILLO', 'MOTONIVELADORA', 'RETROEXCAVADORA', 'VOLQUETE', 'CARGADOR FRONTAL', 'CUADRILLA', 'RENDIMIENTO',
  'METRADOS?', 'PARTIDAS?', 'COSTO DIRECTO', 'GASTOS GENERALES', 'VALOR REFERENCIAL', 'PRECIO UNITARIO', 'EXPEDIENTE TECNICO', 'MEMORIA DESCRIPTIVA',
  'ESPECIFICACIONES TECNICAS', 'TARRAJEO', 'LADRILLO', 'ZAPATAS?', 'COLUMNAS?', 'VIGAS?', 'LOSAS?', 'TUBERIAS?', 'BUZON(ES)?', 'ALCANTARILLADO', 'MAMPOSTERIA', "F'C", 'KG/CM2',
  'OPERARIO', 'PEON', 'MANO DE OBRA', 'HERRAMIENTAS MANUALES', 'PLAZO DE EJECUCION', 'RESIDENTE DE OBRA', 'SUPERVISOR DE OBRA',
];
// Cada término es una expresión regular que debe ser palabra completa ("LOSA" no cuenta dentro de "GLOSARIO").
const RE_TERMINOS = TERMINOS.map((t) => new RegExp(`(?<![A-Z])${t}(?![A-Z])`));
// Unidad de obra al lado de números: "M2 1,250.00", "120.50 M3", "GLB 1.00"
const RE_UNIDAD = /(?:^|\s)(M2|M3|ML|M|KG|GLB|GLOBAL|UND|UNID|U|PZA|KM|HA|P2|PTO|EST|MES|DIA|HH|HM|BLS|BOL|GAL|M3K|KG\/M|M3\/KM)\.?\s+[\d,]+\.\d{1,4}\b|\b[\d,]+\.\d{2}\s+(M2|M3|ML|KG|GLB|UND|M3K)\b/;
const RE_PARTIDA = /^\s*\d{2}(?:\.\d{2}){1,4}\.?\s+\S.*\d[\d,]*\.\d{2}\s*$/;

/** Cómo se presenta el documento (título de sus primeras páginas), solo si se presenta como otra cosa. */
function parecido(paginas: Pag[]): Parecido | undefined {
  if (pareceBases(paginas)) return 'bases';
  // Encabezados de las 2 primeras páginas: el título dice qué es; el cuerpo de una memoria puede citar normas o contratos
  const cabeza = normalizar(paginas.slice(0, 2).map((p) => p.lineas.filter((l) => l.trim()).slice(0, 15).join(' ')).join(' '));
  if (/PLIEGO DE ABSOLUCION|ABSOLUCION DE (LAS )?CONSULTAS|CONSULTAS Y (LAS )?OBSERVACIONES/.test(cabeza)) return 'pliego';
  if (/INFORME DE (CONTROL|AUDITORIA|HITO DE CONTROL|VISITA DE CONTROL|ORIENTACION DE OFICIO|SERVICIO)|CONTRALORIA GENERAL|ORGANO DE CONTROL INSTITUCIONAL|SERVICIO DE CONTROL/.test(cabeza)) return 'informe_control';
  if (/\bCONTRATO (N|DE (EJECUCION|OBRA|CONSORCIO|LOCACION|SERVICIO))|CLAUSULA (PRIMERA|SEGUNDA)/.test(cabeza)) return 'contrato';
  if (/VALORIZACION N|VALORIZACION (DE OBRA|MENSUAL)|CUADERNO DE OBRA|LIQUIDACION (DE|DEL) (CONTRATO|OBRA)|INFORME MENSUAL|ADICIONAL DE OBRA|DEDUCTIVO VINCULANTE|AMPLIACION DE PLAZO|ACTA DE ENTREGA DE TERRENO|ACTA DE RECEPCION/.test(cabeza)) return 'ejecucion';
  if (/NORMA (TECNICA|[A-Z]{1,3}\.? ?\d{3})|REGLAMENTO NACIONAL|DECRETO (SUPREMO|LEGISLATIVO|DE URGENCIA)|RESOLUCION (MINISTERIAL|DIRECTORAL|JEFATURAL)|^LEY N|\bLEY N[°º]?\s*\d/.test(cabeza)) return 'norma';
  if (/TERMINOS DE REFERENCIA/.test(cabeza)) return 'tdr';
  if (/FACTURA( ELECTRONICA)?|BOLETA DE VENTA|RECIBO POR HONORARIOS|NOTA DE CREDITO/.test(cabeza)) return 'comprobante';
  if (/\bTESIS\b|SILABO|CURRICULUM|HOJA DE VIDA|UNIVERSIDAD .{0,60}FACULTAD/.test(cabeza)) return 'academico';
  if (/\bACTA\b|\bOFICIO\b|SOLICITUD|CARTA (N|NOTARIAL)|MEMORANDUM|INFORME LEGAL/.test(cabeza)) return 'tramite';
  if (/\bINFORME\b/.test(cabeza)) return 'informe';
  return undefined;
}

// Nombre de una inversión pública (nomenclatura de Invierte.pe) o su CUI en las primeras líneas.
const RE_PROYECTO = /\b(MEJORAMIENTO|CREACION|CONSTRUCCION|AMPLIACION|REHABILITACION|REPARACION|INSTALACION|RECUPERACION|RENOVACION|REMODELACION)\b.{10,250}\b(DISTRITO|PROVINCIA|CALLE|AV|AVENIDA|JR|JIRON|PASAJE|PSJE|SECTOR|CASERIO|LOCALIDAD|CENTRO POBLADO)\b|\bCUI\s*(N[°ºO]\.?)?\s*:?\s*\d{7}\b/;

const sinBarras = (l: string) => normalizar(l.replace(/\s*\|\s*/g, ' '));

/**
 * @param pista documento que sugiere el nombre del archivo ("PRESUPUESTO.pdf"), si lo hay: cuenta como señal, no como prueba.
 */
export function evaluarPertinencia(paginas: Pag[], pista?: Documento | null): Pertinencia {
  const partes = [...new Set(paginas.map((p) => detectarPagina(p)).filter((d): d is Documento => !!d && PARTES_EXPEDIENTE.includes(d)))];
  let partidas = 0, lineasConUnidad = 0;
  for (const p of paginas) for (const l of p.lineas) {
    const n = sinBarras(l);
    if (RE_PARTIDA.test(n)) partidas++;
    if (RE_UNIDAD.test(n)) lineasConUnidad++;
  }
  const todo = sinBarras(paginas.map((p) => p.lineas.join(' ')).join(' '));
  const terminos = RE_TERMINOS.filter((re) => re.test(todo)).length;
  const cabeza = sinBarras(paginas.slice(0, 2).map((p) => p.lineas.filter((l) => l.trim()).slice(0, 15).join(' ')).join(' '));
  const proyecto = RE_PROYECTO.test(cabeza);
  const parece = parecido(paginas);
  const base = { partes, partidas, lineasConUnidad, terminos, parece };
  const ok = (motivo: string): Pertinencia => ({ ...base, nivel: 'expediente', motivo });
  const ajeno = (motivo: string): Pertinencia => ({ ...base, nivel: 'ajeno', motivo });
  // Montos en columna ("COSTO DIRECTO | 266,521.91"): hojas de resumen y desagregados
  const lineasConMonto = paginas.reduce((s, p) => s + p.lineas.filter((l) => /\d{1,3}(,\d{3})*\.\d{2}\s*$/.test(sinBarras(l))).length, 0);
  const tablas = lineasConUnidad >= 2 || lineasConMonto >= 3;

  // 1. Tablas de obra de verdad (presupuesto con partidas, metrados): es un expediente aunque venga dentro de otro documento
  if ((partidas >= 5 && !parece) || (partidas >= 10 && lineasConUnidad >= 5))
    return ok(parece ? `Trae partes del expediente técnico dentro de ${NOMBRE_PARECIDO[parece]}.` : 'Se reconocieron partidas del presupuesto del expediente técnico.');
  // 2. Se presenta como otro documento: que mencione «presupuesto» o «especificaciones» no lo vuelve expediente
  if (parece && parece !== 'bases') return ajeno(`Parece ${NOMBRE_PARECIDO[parece]}, no el expediente técnico de la obra.`);
  // 3. Partes reconocidas con contenido propio
  if ((partes.length >= 2 && (tablas || terminos >= 8)) || (partes.length === 1 && (lineasConUnidad >= 5 || partidas >= 3 || (terminos >= 8 && pista === partes[0]))))
    return ok(`Se reconocieron ${partes.length} ${partes.length === 1 ? 'parte' : 'partes'} del expediente técnico.`);
  // 4. Hojas sueltas del expediente (resumen del presupuesto, datos generales, desagregados): tablas + nombre del proyecto o del archivo
  if (tablas && (proyecto || pista || partes.length === 1) && terminos >= 2) return ok('Parece una hoja suelta del expediente de una obra.');
  // 5. Habla de obras, pero no se reconoce nada revisable
  if (partes.length >= 1 || terminos >= 6 || lineasConUnidad >= 5)
    return { ...base, nivel: 'dudoso', motivo: parece === 'bases' ? 'Parecen las bases del procedimiento sin el expediente técnico: no hay partes que revisar.' : 'Habla de una obra, pero no tiene tablas ni partes reconocibles del expediente (presupuesto, metrados, especificaciones…).' };
  return ajeno(parece ? `Parece ${NOMBRE_PARECIDO[parece]}, no el expediente técnico de la obra.` : 'No tiene presupuesto, metrados, especificaciones ni vocabulario de obra: no parece parte de un expediente técnico.');
}
