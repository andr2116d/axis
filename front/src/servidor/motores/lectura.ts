import 'server-only';
import type { EstadoLectura, UnidadPagina } from '@/dominio/tipos';

// Motor «Lectura y OCR». Extrae el texto de PDF (por página), Word .docx (por bloques)
// y Excel .xls/.xlsx (por hoja). Distingue los PDF escaneados (sin capa de texto).
// El OCR de escaneos y el Word antiguo (.doc) están pendientes: esos archivos quedan
// marcados y nunca se dan por leídos.

/** Una página con menos caracteres útiles que esto se considera sin texto. */
const MINIMO_CARACTERES = 40;
/** Tamaño de los bloques en que se parte un Word (no tiene páginas). */
const CARACTERES_POR_BLOQUE = 3500;

export interface Lectura {
  estado: EstadoLectura;
  paginas: string[];
  paginasConTexto: number;
  unidad: UnidadPagina;
}

const vacia = (estado: EstadoLectura, unidad: UnidadPagina = 'pág.'): Lectura => ({ estado, paginas: [], paginasConTexto: 0, unidad });

function firma(datos: Uint8Array, ...bytes: number[]) {
  return bytes.every((b, i) => datos[i] === b);
}

function resultado(paginas: string[], unidad: UnidadPagina): Lectura {
  const paginasConTexto = paginas.filter((t) => t.replace(/\s+/g, '').length >= MINIMO_CARACTERES).length;
  const estado: EstadoLectura =
    paginas.length === 0 ? 'no-legible'
      : paginasConTexto === 0 ? (unidad === 'pág.' ? 'escaneado' : 'no-legible')
        : paginasConTexto / paginas.length < 0.8 && unidad === 'pág.' ? 'parcial'
          : 'leido';
  return { estado, paginas, paginasConTexto, unidad };
}

async function leerPDF(datos: Uint8Array) {
  const { getDocumentProxy, extractText } = await import('unpdf');
  // pdf.js transfiere el búfer: se le pasa una copia.
  const pdf = await getDocumentProxy(new Uint8Array(datos));
  const { text } = await extractText(pdf, { mergePages: false });
  return resultado(text.map((t) => t ?? ''), 'pág.');
}

async function leerWord(datos: Uint8Array) {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(datos) });
  const bloques: string[] = [];
  let actual = '';
  for (const parrafo of value.split(/\n+/)) {
    if (actual.length + parrafo.length > CARACTERES_POR_BLOQUE && actual) {
      bloques.push(actual);
      actual = '';
    }
    actual += `${parrafo}\n`;
  }
  if (actual.trim()) bloques.push(actual);
  return resultado(bloques, 'bloque');
}

async function leerExcel(datos: Uint8Array) {
  const XLSX = await import('xlsx');
  const libro = XLSX.read(datos, { type: 'array', cellFormula: false, cellHTML: false });
  const hojas = libro.SheetNames.map((nombre) => {
    const csv = XLSX.utils.sheet_to_csv(libro.Sheets[nombre], { FS: '\t', blankrows: false, strip: true });
    return `${nombre}\n${csv.replace(/\t+\n/g, '\n').replace(/\t{2,}/g, '\t')}`;
  });
  return resultado(hojas, 'hoja');
}

export async function leerDocumento(nombre: string, datos: Uint8Array): Promise<Lectura> {
  const extension = nombre.toLowerCase().split('.').pop() ?? '';
  try {
    if (firma(datos, 0x25, 0x50, 0x44, 0x46)) return await leerPDF(datos); // %PDF
    if (extension === 'docx' && firma(datos, 0x50, 0x4b)) return await leerWord(datos); // ZIP
    if (extension === 'xlsx' || extension === 'xls') return await leerExcel(datos);
    if (extension === 'doc') return vacia('formato-pendiente', 'bloque');
    return vacia('no-legible');
  } catch {
    return vacia('no-legible');
  }
}
