// Utilidades compartidas por los scripts de análisis: leer un PDF como lo hace el navegador y cargar datos reales.
import fs from 'node:fs';
import { crearDem } from '../../src/lib/analisis/terreno';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { fragmentosALineas } from '../../src/lib/texto-pdf';
import { ocultarDatosPersonales } from '../../src/lib/privacidad';
import type { DatosTerritorio } from '../../src/lib/analisis/contexto';

export type Pag = { numero: number; lineas: string[] };

/** PDF → páginas de líneas, con el mismo armado de líneas y ocultamiento de datos personales que el navegador. */
export async function paginasDePdf(ruta: string): Promise<Pag[]> {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(ruta)), useSystemFonts: true, verbosity: 0 }).promise;
  const out: Pag[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const frag = (tc.items as { str: string; transform: number[]; width: number }[]).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], ancho: it.width }));
    out.push({ numero: i, lineas: ocultarDatosPersonales(fragmentosALineas(frag)).lineas });
  }
  return out;
}

/** Texto de pdftotext (páginas separadas por \f) → páginas de líneas. */
export const paginasDeTexto = (txt: string): Pag[] => txt.split('\f').map((t, i) => ({ numero: i + 1, lineas: t.split('\n') }));

export function territorioReal(): DatosTerritorio {
  const j = (f: string) => JSON.parse(fs.readFileSync('src/data/real/' + f, 'utf8'));
  return {
    inversiones: j('inversiones_la_libertad.json').inversiones,
    peligros: j('territorio/peligros_geologicos.json'), zonasCriticas: j('territorio/zonas_criticas.json'),
    puntosCriticosAna: j('territorio/ana_puntos_criticos.json'), rios: j('territorio/ana_rios.json'),
    dem: crearDem(j('territorio/dem_trujillo.json'), fs.readFileSync('src/data/real/territorio/dem_trujillo.bin')), red: j('territorio/vias_trujillo.json'), distritos: j('territorio/distritos.json'),
  };
}
