// ¿Axis distingue un expediente de algo que no tiene nada que ver? Corre el filtro de pertinencia sobre:
//  - documentos ajenos (CV, receta, factura, tesis, norma, bases del hackathon…) → deben salir "ajeno" o "dudoso", nunca "expediente";
//  - partes reales de expedientes del SEACE y los ejemplos → deben salir "expediente".
// Uso: npx tsx scripts/analisis/probar-pertinencia.ts <carpeta-ajenos> [carpeta-reales] [max]
import fs from 'node:fs';
import path from 'node:path';
import { documentoPorArchivo } from "../../src/lib/analisis/nombres";
import { evaluarPertinencia } from '../../src/lib/analisis/pertinencia';
import { paginasDePdf, paginasDeTexto } from './util';

const [ajenos, reales = '../datos-crudos/bases_extraidas', max = '400'] = process.argv.slice(2);
const listar = (d: string): string[] => fs.readdirSync(d).flatMap((f) => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? listar(p) : /\.(pdf|txt)$/i.test(f) ? [p] : []; });
const leer = async (f: string) => (f.endsWith('.txt') ? paginasDeTexto(fs.readFileSync(f, 'utf8')) : paginasDePdf(f));
const vacio = (ps: { lineas: string[] }[]) => ps.reduce((s, p) => s + p.lineas.join('').length, 0) < 40 * ps.length;

(async () => {
  const fila = (f: string, r: ReturnType<typeof evaluarPertinencia>) => `${r.nivel.padEnd(10)} ${(r.parece ?? '').padEnd(15)} partes=${r.partes.join(',') || '-'} partidas=${r.partidas} unid=${r.lineasConUnidad} term=${r.terminos}  ${path.basename(f).slice(0, 60)}`;
  console.log('== Ajenos (no deben salir "expediente")');
  let malos = 0;
  for (const f of listar(ajenos)) { const r = evaluarPertinencia(await leer(f), documentoPorArchivo(path.basename(f))); if (r.nivel === "expediente") malos++; console.log((r.nivel === 'expediente' ? '✗ ' : '  ') + fila(f, r)); }
  console.log('\n== Ejemplos y casos reales en texto (deben salir "expediente")');
  let perdidos = 0;
  for (const f of [...listar('public/expedientes'), ...listar('scripts/analisis/casos')]) { const r = evaluarPertinencia(await leer(f)); if (r.nivel !== 'expediente') perdidos++; console.log((r.nivel !== 'expediente' ? '✗ ' : '  ') + fila(f, r)); }
  console.log('\n== PDF reales del SEACE (bases integradas y anexos del expediente)');
  const cuenta: Record<string, number> = {}; const raros: string[] = [];
  for (const f of listar(reales).filter((f) => f.endsWith('.pdf')).slice(0, Number(max))) {
    let ps; try { ps = await leer(f); } catch { continue; }
    if (vacio(ps)) { cuenta.escaneo = (cuenta.escaneo ?? 0) + 1; continue; }
    const r = evaluarPertinencia(ps, documentoPorArchivo(path.basename(f))); const k = r.nivel + (r.parece ? '/' + r.parece : ''); cuenta[k] = (cuenta[k] ?? 0) + 1;
    if (r.nivel !== 'expediente') raros.push(fila(path.relative(reales, f), r));
  }
  console.log(cuenta); console.log(raros.join('\n'));
  console.log(`\nAjenos tomados por expediente: ${malos} · ejemplos/casos perdidos: ${perdidos}`);
})();
