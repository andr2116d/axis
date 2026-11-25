import type { TipoDocumento, TipoDocumentoObra } from '@/dominio/tipos';
import { plano } from '../texto';

// Motor «Clasificación documental». Puntúa cada tipo con señales del nombre del
// archivo y del texto de sus primeras páginas. Con poca evidencia no adivina:
// devuelve «Por identificar» y la persona confirma.

interface Senal<T> {
  tipo: T;
  nombre: RegExp;
  contenido: RegExp[];
}

/** El nombre del archivo pesa más que una señal suelta del texto: lo puso quien armó el expediente. */
const PESO_NOMBRE = 5;
const PAGINAS_LEIDAS = 3;

const SENALES_EXPEDIENTE: Senal<TipoDocumento>[] = [
  { tipo: 'Presupuesto', nombre: /PRESUP|\bPPTO\b/, contenido: [/\bPRESUPUESTO\b/, /COSTO DIRECTO/, /GASTOS GENERALES/, /\bUTILIDAD\b/, /\bI\.?G\.?V\.?\b/, /\bPARCIAL\b/] },
  { tipo: 'Metrados', nombre: /METRAD/, contenido: [/METRADOS?\b/, /PLANILLA DE METRADOS/, /N[°º]?\s*(DE\s*)?VECES/, /\bLARGO\b.*\bANCHO\b/, /\bSUB\s?TOTAL\b/] },
  { tipo: 'Precios unitarios', nombre: /PRECIOS?\s*UNIT|\bA\.?P\.?U\.?\b|\bA\.?C\.?U\.?\b/, contenido: [/ANALISIS DE (LOS )?(PRECIOS|COSTOS) UNITARIOS/, /RENDIMIENTO/, /CUADRILLA/, /MANO DE OBRA/, /HERRAMIENTAS MANUALES/] },
  { tipo: 'Memoria', nombre: /MEMORIA/, contenido: [/MEMORIA DESCRIPTIVA/, /ANTECEDENTES/, /OBJETIVOS? DEL PROYECTO/, /DESCRIPCION DEL PROYECTO/, /METAS?\s/] },
  { tipo: 'Especificaciones', nombre: /ESPECIF|\bEE\.?\s?TT\b|\bE\.?T\.?\b/, contenido: [/ESPECIFICACIONES TECNICAS/, /METODO DE MEDICION/, /(BASES?|FORMA|CONDICIONES?) DE PAGO/, /UNIDAD DE MEDIDA/, /DESCRIPCION DE LOS TRABAJOS/] },
  { tipo: 'Fórmula polinómica', nombre: /POLINOM/, contenido: [/FORMULA POLINOMICA/, /MONOMIO/, /INDICE UNIFICADO/, /COEFICIENTE DE INCIDENCIA/] },
  { tipo: 'Cronograma', nombre: /CRONOG|GANTT|CALENDARIO/, contenido: [/CRONOGRAMA/, /CALENDARIO DE AVANCE/, /DIAS CALENDARIO/, /RUTA CRITICA/, /\bDURACION\b/, /AVANCE (FISICO|VALORIZADO)/, /\bMES\s*0?\d\b/, /\bSEMANA\s*\d/] },
  { tipo: 'Planos', nombre: /PLANO|LAMINA|\bPL[-_ ]?\d/, contenido: [/ESCALA\s*:?\s*1\s*[:/]\s*\d/, /\bLAMINA\b/, /CUADRO DE COORDENADAS/, /\bPLANO\b/] },
  { tipo: 'Estudio de suelos', nombre: /SUELO|GEOTEC|\bEMS\b|MECANICA/, contenido: [/MECANICA DE SUELOS/, /CALICATA/, /\bS\.?U\.?C\.?S\.?\b/, /NIVEL FREATICO/, /PROCTOR/, /CAPACIDAD (PORTANTE|ADMISIBLE)/] },
];

const SENALES_OBRA: Senal<TipoDocumentoObra>[] = [
  { tipo: 'Informe de paralización', nombre: /PARALIZ/, contenido: [/PARALIZACION/, /OBRA PARALIZADA/, /ESTADO SITUACIONAL/] },
  { tipo: 'Liquidación', nombre: /LIQUIDAC/, contenido: [/LIQUIDACION (DEL CONTRATO|DE OBRA)/, /SALDO A FAVOR/, /COSTO FINAL DE (LA )?OBRA/] },
  { tipo: 'Acta de recepción', nombre: /RECEPCION/, contenido: [/ACTA DE RECEPCION/, /COMITE DE RECEPCION/, /OBSERVACIONES? (A|DE) LA OBRA/] },
  { tipo: 'Resolución de adicional', nombre: /ADICIONAL|DEDUCTIVO/, contenido: [/PRESTACION(ES)? ADICIONAL(ES)?/, /ADICIONAL DE OBRA/, /DEDUCTIVO VINCULANTE/] },
  { tipo: 'Ampliación de plazo', nombre: /AMPLIAC/, contenido: [/AMPLIACION DE PLAZO/, /CAUSAL/, /RUTA CRITICA/] },
  { tipo: 'Cuaderno de obra', nombre: /CUADERNO|ASIENTO/, contenido: [/CUADERNO DE OBRA/, /ASIENTO N/] },
  { tipo: 'Informe de control', nombre: /CONTRALORIA|\bOCI\b|CONTROL/, contenido: [/CONTRALORIA GENERAL/, /SITUACION(ES)? ADVERSA/, /SERVICIO DE CONTROL/] },
];

export interface Clasificacion<T> {
  tipo: T;
  confianza: number;
  razon: string;
}

function clasificar<T extends string>(senales: Senal<T>[], nombreArchivo: string, paginas: string[], desconocido: T): Clasificacion<T> {
  const nombre = plano(nombreArchivo.replace(/[_\-.]+/g, ' '));
  const texto = plano(paginas.slice(0, PAGINAS_LEIDAS).join('\n'));
  const puntajes = senales.map((s) => {
    const porNombre = s.nombre.test(nombre);
    const enTexto = s.contenido.filter((r) => r.test(texto)).length;
    return { tipo: s.tipo, puntaje: (porNombre ? PESO_NOMBRE : 0) + enTexto, porNombre, enTexto };
  }).sort((a, b) => b.puntaje - a.puntaje);

  const [mejor, segundo] = puntajes;
  if (!mejor || mejor.puntaje < 2) {
    return { tipo: desconocido, confianza: 0, razon: 'Sin señales suficientes en el nombre ni en el texto.' };
  }
  const total = puntajes.reduce((s, p) => s + p.puntaje, 0);
  const margen = segundo ? mejor.puntaje - segundo.puntaje : mejor.puntaje;
  const confianza = Math.min(0.99, (mejor.puntaje / total) * Math.min(1, 0.5 + margen / 4));
  const razones = [mejor.porNombre ? 'el nombre del archivo' : '', mejor.enTexto ? `${mejor.enTexto} señal${mejor.enTexto === 1 ? '' : 'es'} en el texto` : '']
    .filter(Boolean).join(' y ');
  return { tipo: mejor.tipo, confianza: Math.round(confianza * 100) / 100, razon: `Por ${razones}.` };
}

export function clasificarDocumentoExpediente(nombre: string, paginas: string[]) {
  return clasificar(SENALES_EXPEDIENTE, nombre, paginas, 'Por identificar' as TipoDocumento);
}

export function clasificarDocumentoObra(nombre: string, paginas: string[]) {
  return clasificar(SENALES_OBRA, nombre, paginas, 'Otro' as TipoDocumentoObra);
}
