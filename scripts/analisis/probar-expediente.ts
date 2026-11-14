// Prueba de punta a punta del análisis real: PDF → pdf.js → líneas → privacidad → analizarExpediente (con territorio real).
// Uso: npx tsx scripts/analisis/probar-expediente.ts [archivo.pdf ...]   (por defecto, los LL-*.pdf de public/expedientes)
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { fragmentosALineas } from '../../src/lib/texto-pdf';
import { ocultarDatosPersonales } from '../../src/lib/privacidad';
import { utmALatLng } from '../../src/lib/geo';
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import type { DatosTerritorio } from '../../src/lib/analisis/contexto';
import { territorioReal } from './util';

const territorio: DatosTerritorio = territorioReal();

async function paginas(ruta: string) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(ruta)), useSystemFonts: true }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    const frag = (tc.items as { str: string; transform: number[]; width: number }[]).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], ancho: it.width }));
    out.push({ numero: i, lineas: ocultarDatosPersonales(fragmentosALineas(frag)).lineas });
  }
  return out;
}

async function main() {
  const archivos = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync('public/expedientes').filter((f) => f.startsWith('LL-')).sort().map((f) => 'public/expedientes/' + f);
  for (const a of archivos) {
    const r = analizarExpediente(await paginas(a), { territorio, utmALatLng: (e, n) => utmALatLng(e, n) });
    const fallas = r.detecciones.filter((d) => d.resultado === 'falla');
    console.log(`\n══ ${a.split('/').pop()}`);
    console.log(`   ${r.generales.nombre} | CUI ${r.generales.cui} | plazo ${r.generales.plazoDias} d | ubicación ${r.generales.ubicacion ? r.generales.ubicacion.lat + ', ' + r.generales.ubicacion.lng : '—'}`);
    console.log(`   documentos: ${[...new Set(r.documentos.map((d) => d.documento))].join(', ')} | faltan: ${r.faltantes.join(', ') || '—'}`);
    console.log(`   leído: ${JSON.stringify(r.conteos)}`);
    console.log(`   ${fallas.length} fallas, ${r.detecciones.filter((d) => d.resultado === 'no_verificable').length} no verificables, ${r.detecciones.filter((d) => d.resultado === 'pasa').length} pasan`);
    for (const d of r.detecciones) console.log(`   ${d.resultado === 'falla' ? '✘' : d.resultado === 'pasa' ? '✔' : '?'} [${d.verificador}] (${d.severidad}) ${d.titulo}`);
  }
}
main();
