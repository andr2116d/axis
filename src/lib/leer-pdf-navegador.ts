'use client';
// Lee el PDF en el navegador con pdf.js, arma las líneas y oculta los datos personales
// ANTES de enviar el texto al servidor (Ley N° 29733: datos mínimos).
// Las páginas escaneadas (sin texto) se leen con OCR en el mismo navegador (Tesseract, español): la imagen no sale del equipo.

import { ocultarDatosPersonales } from './privacidad';
import { fragmentosALineas } from './texto-pdf';
import type { Pagina } from './tipos';

export interface LecturaPdf {
  paginas: Pagina[];
  ocultos: Record<string, number>;
  sinTexto: boolean;
  /** Páginas que se leyeron con OCR porque eran escaneos. */
  paginasOcr: number;
}

const MAX_OCR = 30; // tope por archivo: un escaneo grande tomaría varios minutos

type Trabajador = { recognize: (img: HTMLCanvasElement) => Promise<{ data: { lines: { text: string }[] } }> };
let trabajador: Promise<Trabajador> | null = null;
async function ocr(): Promise<Trabajador> {
  trabajador ??= import('tesseract.js').then((t) => t.createWorker('spa') as unknown as Promise<Trabajador>);
  return trabajador;
}

export async function extraerPaginas(datos: ArrayBuffer, alAvanzar?: (actual: number, total: number, modo?: 'texto' | 'ocr') => void): Promise<LecturaPdf> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(datos.slice(0)) }).promise;
  const paginas: Pagina[] = [];
  const ocultos: Record<string, number> = {};
  let caracteres = 0, paginasOcr = 0;
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const frag = (tc.items as { str?: string; transform?: number[]; width?: number }[])
      .filter((it) => typeof it.str === 'string' && it.transform)
      .map((it) => ({ str: it.str as string, x: it.transform![4], y: it.transform![5], ancho: it.width ?? 0 }));
    let lineas = fragmentosALineas(frag);
    // Página escaneada: OCR local
    if (lineas.join('').replace(/\s/g, '').length < 40 && paginasOcr < MAX_OCR) {
      try {
        alAvanzar?.(i, pdf.numPages, 'ocr');
        const vista = page.getViewport({ scale: 2.2 });
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.floor(vista.width); lienzo.height = Math.floor(vista.height);
        await page.render({ canvasContext: lienzo.getContext('2d')!, viewport: vista }).promise;
        const r = await (await ocr()).recognize(lienzo);
        const leidas = r.data.lines.map((l) => l.text.replace(/\n$/, '')).filter((l) => l.trim());
        if (leidas.join('').length > 40) { lineas = leidas; paginasOcr++; }
      } catch (e) {
        console.error('OCR no disponible para la página', i, e);
      }
    }
    const r = ocultarDatosPersonales(lineas);
    for (const [k, v] of Object.entries(r.ocultos)) ocultos[k] = (ocultos[k] || 0) + v;
    caracteres += r.lineas.join('').length;
    paginas.push({ numero: i, lineas: r.lineas });
    alAvanzar?.(i, pdf.numPages, 'texto');
  }
  return { paginas, ocultos, sinTexto: caracteres < 40 * pdf.numPages, paginasOcr };
}
