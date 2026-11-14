// Pasa PDFs reales (bases y expedientes del SEACE) por el mismo camino que una subida en la app y reporta fallas.
// Uso: npx tsx scripts/analisis/probar-pdfs-reales.ts <carpeta> [max]
import fs from 'node:fs';
import path from 'node:path';
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import { utmALatLng } from '../../src/lib/geo';
import { paginasDePdf, territorioReal } from './util';

const carpeta = process.argv[2], max = Number(process.argv[3] ?? 60);
const pdfs: string[] = [];
(function rec(d: string) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) rec(p); else if (/\.pdf$/i.test(f)) pdfs.push(p); } })(carpeta);
const t = territorioReal();
(async () => {
  const filas: string[] = []; let errores = 0, escaneados = 0, conPres = 0, maxF = 0;
  for (const f of pdfs.slice(0, max)) {
    const t0 = Date.now();
    try {
      const pags = await paginasDePdf(f);
      const chars = pags.reduce((s, p) => s + p.lineas.join('').length, 0);
      if (chars < 40 * pags.length) { escaneados++; filas.push(`ESCANEO ${pags.length}p ${path.basename(f)}`); continue; }
      const r = analizarExpediente(pags, { territorio: t, utmALatLng: (e, n) => utmALatLng(e, n), parcial: true });
      const docs = [...new Set(r.documentos.map((d) => d.documento))].join(',');
      const fallas = r.detecciones.filter((d) => d.resultado === 'falla');
      if (fallas.length > maxF) maxF = fallas.length;
      if (r.conteos.partidas) conPres++;
      filas.push(`${r.pareceBases ? 'BASES' : 'ok'} ${pags.length}p ${Date.now() - t0}ms partidas=${r.conteos.partidas} fallas=${fallas.length} [${fallas.map((d) => d.verificador).join(' ')}] docs=${docs} ${path.basename(f).slice(0, 50)}`);
    } catch (e) { errores++; filas.push(`ERROR ${path.basename(f)}: ${(e as Error).message.slice(0, 160)}`); }
  }
  console.log(filas.join('\n'));
  console.log(`\nPDF: ${Math.min(max, pdfs.length)} | errores: ${errores} | escaneados: ${escaneados} | con presupuesto leído: ${conPres} | máximo de observaciones en un PDF: ${maxF} | marcados como bases: ${filas.filter((f) => f.startsWith('BASES')).length}`);
})();
