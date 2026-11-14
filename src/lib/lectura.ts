'use client';
// Lectura de uno o varios PDF en el navegador, con privacidad y una clasificación inicial de páginas que la persona confirma.
import { extraerPaginas } from './leer-pdf-navegador';
import { clasificarPaginas, documentoPorArchivo, type Documento } from './analisis/nombres';
import { evaluarPertinencia, type Pertinencia } from './analisis/pertinencia';
import type { Pagina } from './tipos';

export interface PaginaLeida extends Pagina { archivo: number; paginaArchivo: number }
export interface ArchivoLeido { nombre: string; paginas: number; sinTexto: boolean; pista: Documento | null; paginasOcr: number;
  /** ¿Este archivo es parte de un expediente de obra? */
  pertinencia: Pertinencia;
  /** Índice del archivo del que es copia (mismo texto), si se subió dos veces. */
  repetidoDe?: number }
export interface Bloque { id: string; archivo: number; desde: number; hasta: number; documento: Documento; auto: boolean; nota?: string }
export interface Lectura { archivos: ArchivoLeido[]; paginas: PaginaLeida[]; ocultos: Record<string, number>; bloques: Bloque[];
  /** Pertinencia del conjunto, sin los archivos que no son del expediente ni los repetidos. */
  pertinencia: Pertinencia }

export async function leerArchivos(archivos: { nombre: string; datos: ArrayBuffer }[], alAvanzar: (archivo: number, actual: number, total: number, ocultos: number, ocr?: boolean) => void): Promise<Lectura> {
  const paginas: PaginaLeida[] = [];
  const leidos: ArchivoLeido[] = [];
  const firmas: string[] = [];
  const ocultos: Record<string, number> = {};
  for (let a = 0; a < archivos.length; a++) {
    let acumulado = Object.values(ocultos).reduce((s, n) => s + n, 0);
    const l = await extraerPaginas(archivos[a].datos, (actual, total, modo) => alAvanzar(a, actual, total, acumulado, modo === 'ocr'));
    for (const [k, v] of Object.entries(l.ocultos)) ocultos[k] = (ocultos[k] ?? 0) + v;
    acumulado = Object.values(ocultos).reduce((s, n) => s + n, 0);
    alAvanzar(a, l.paginas.length, l.paginas.length, acumulado);
    const pista = documentoPorArchivo(archivos[a].nombre);
    const firma = l.paginas.map((p) => p.lineas.join('\n')).join('\f');
    const repetidoDe = firmas.indexOf(firma);
    firmas.push(firma);
    leidos.push({ nombre: archivos[a].nombre, paginas: l.paginas.length, sinTexto: l.sinTexto, pista, paginasOcr: l.paginasOcr,
      pertinencia: evaluarPertinencia(l.paginas, pista), repetidoDe: repetidoDe >= 0 && firma.length > 40 ? repetidoDe : undefined });
    l.paginas.forEach((p) => paginas.push({ numero: paginas.length + 1, lineas: p.lineas, archivo: a, paginaArchivo: p.numero }));
  }
  const bloques = bloquesIniciales(leidos, paginas);
  const usados = new Set(leidos.map((_, i) => i).filter((i) => !fuera(leidos, i)));
  const pertinencia = evaluarPertinencia(paginas.filter((p) => usados.has(p.archivo)));
  return { archivos: leidos, paginas, ocultos, bloques, pertinencia };
}

/** Se deja fuera un archivo repetido, o uno que no es de una obra cuando hay otros que sí lo son. */
export function fuera(archivos: ArchivoLeido[], i: number): 'repetido' | 'ajeno' | null {
  if (archivos[i].repetidoDe !== undefined) return 'repetido';
  const otrosSirven = archivos.some((a, j) => j !== i && a.pertinencia.nivel !== 'ajeno' && a.repetidoDe === undefined);
  return archivos[i].pertinencia.nivel === 'ajeno' && otrosSirven ? 'ajeno' : null;
}

const RE_PARTIDA = /^\s*\d{2}(?:\.\d{2}){1,4}\s+\S.*\d[\d,]*\.\d{2}\s*$/;
const partidasEn = (ps: PaginaLeida[]) => ps.reduce((s, p) => s + p.lineas.filter((l) => RE_PARTIDA.test(l)).length, 0);

/** Clasificación por archivo: encabezados y contenido; si el archivo no tiene encabezados reconocibles, manda su nombre. */
function bloquesIniciales(archivos: ArchivoLeido[], paginas: PaginaLeida[]): Bloque[] {
  const bloques = clasificarPorArchivo(archivos, paginas);
  for (const b of bloques) {
    const motivo = fuera(archivos, b.archivo);
    if (motivo) { b.documento = 'otro'; b.nota = motivo === 'repetido' ? `repetido: es el mismo archivo que «${archivos[archivos[b.archivo].repetidoDe!].nombre}»` : 'no parece parte del expediente: no se usa'; }
  }
  // Si varios archivos parecen "presupuesto" (desagregado, resumen para el cliente, datos generales), el presupuesto es el que
  // tiene más partidas; los demás se dejan como "otro" para no mezclar dos presupuestos en una sola lectura.
  const conPres = [...new Set(bloques.filter((b) => b.documento === 'presupuesto').map((b) => b.archivo))];
  if (conPres.length > 1) {
    const mejor = conPres.reduce((m, a) => (partidasEn(paginas.filter((p) => p.archivo === a)) > partidasEn(paginas.filter((p) => p.archivo === m)) ? a : m));
    for (const b of bloques) if (b.documento === 'presupuesto' && b.archivo !== mejor) { b.documento = 'caratula'; b.nota = 'otro presupuesto o resumen: no se usa para no mezclar'; }
  }
  return bloques;
}

function clasificarPorArchivo(archivos: ArchivoLeido[], paginas: PaginaLeida[]): Bloque[] {
  const bloques: Bloque[] = [];
  archivos.forEach((ar, a) => {
    const ps = paginas.filter((p) => p.archivo === a);
    if (!ps.length) return;
    const auto = clasificarPaginas(ps.map((p) => ({ numero: p.numero, lineas: p.lineas })));
    const reconocidas = auto.filter((x) => x.documento !== 'caratula').length;
    const docs = auto.map((x) => (ar.pista && (reconocidas === 0 || (x.documento === 'caratula' && archivos.length > 1)) ? ar.pista : x.documento));
    docs.forEach((d, i) => {
      const ultimo = bloques[bloques.length - 1];
      if (ultimo && ultimo.archivo === a && ultimo.documento === d) ultimo.hasta = ps[i].numero;
      else bloques.push({ id: `${a}-${ps[i].numero}`, archivo: a, desde: ps[i].numero, hasta: ps[i].numero, documento: d, auto: true });
    });
  });
  return bloques;
}

export const clasificacionDe = (bloques: Bloque[]) =>
  bloques.flatMap((b) => Array.from({ length: b.hasta - b.desde + 1 }, (_, k) => ({ pagina: b.desde + k, documento: b.documento })));

/** CUI que declara cada archivo en sus primeras páginas: si los archivos usados declaran CUI distintos, quizá son de obras distintas. */
export function obrasDistintas(l: Lectura): { nombre: string; cui: string }[] {
  const out: { nombre: string; cui: string }[] = [];
  l.archivos.forEach((a, i) => {
    if (fuera(l.archivos, i)) return;
    const texto = l.paginas.filter((p) => p.archivo === i).slice(0, 3).map((p) => p.lineas.join(' ')).join(' ').toUpperCase();
    const cui = texto.match(/\b(?:CUI|C[OÓ]DIGO [UÚ]NICO(?: DE INVERSI[OÓ]N(?:ES)?)?)\s*(?:N[°ºO]\.?)?\s*:?\s*(\d{7})\b/)?.[1];
    if (cui) out.push({ nombre: a.nombre, cui });
  });
  return new Set(out.map((x) => x.cui)).size > 1 ? out : [];
}
