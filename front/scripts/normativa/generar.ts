// Convierte el texto oficial de la Ley 32069 y su Reglamento en artículos para Axis.
//
// Fuente: compendios del OECE en gob.pe (texto del SPIJ con modificaciones), pasados a
// texto con `pdftotext -layout`:
//   https://www.gob.pe/institucion/oece/colecciones/45029-ley-n-32069-ley-general-de-contrataciones-publicas-y-su-reglamento
//
// Uso: npx tsx scripts/normativa/generar.ts ../../datos-crudos/normas/ley32069

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** texto: vigente; anterior: reemplazado por una modificación; nota: nota del SPIJ sobre la modificación. */
interface Parrafo { t: string; k?: 'anterior' | 'nota' }
interface Articulo { n: number; titulo: string; parrafos: Parrafo[]; modificado: boolean }
interface Bruto { n: number; titulo: string; parrafos: string[]; modificado: boolean }

const ruido = [
  /^\s*Reglamento de la Ley N[º°] 32069, Ley General de Contrataciones Públicas\s*$/,
  /^\s*Página \d+ de \d+\s*$/,
  /^\s*\d+\s*$/,
  /^\f/,
];

function brutos(texto: string, desde: RegExp, hasta: RegExp): Bruto[] {
  const resto = texto.slice(texto.search(desde));
  const fin = resto.search(hasta);
  const lineas = (fin > 0 ? resto.slice(0, fin) : resto).replace(/\f/g, '\n').split('\n')
    .filter((l) => !ruido.some((r) => r.test(l))).map((l) => l.trim());
  const out: Bruto[] = [];
  let parrafo: string[] = [];
  let enTitulo = false;
  const cerrar = () => {
    const a = out.at(-1);
    const b = parrafo.join(' ').replace(/\s+/g, ' ').trim();
    parrafo = [];
    if (!a || !b) return;
    // Un salto de página parte una oración: se une al párrafo anterior.
    const previo = a.parrafos.at(-1);
    if (previo && /^[a-záéíóúñ]/.test(b) && !/[.:;”"]$/.test(previo)) { a.parrafos[a.parrafos.length - 1] = `${previo} ${b}`; return; }
    // Encabezados de título y capítulo que quedan entre artículos.
    if (/^(TÍTULO|CAPÍTULO|SUBCAPÍTULO|SECCIÓN)\b/.test(b) || (/^[A-ZÁÉÍÓÚÑ ,]+$/.test(b) && b.length < 140)) return;
    a.parrafos.push(b);
    if (b.startsWith('(*)')) a.modificado = true;
  };
  for (const l of lineas) {
    const m = l.match(/^Artículo (\d+)\s*[.\-]+\s*(.*)$/);
    if (m && Number(m[1]) === (out.at(-1)?.n ?? 0) + 1) {
      cerrar();
      out.push({ n: Number(m[1]), titulo: m[2].trim(), parrafos: [], modificado: false });
      enTitulo = true;
      continue;
    }
    const a = out.at(-1);
    // Un título largo continúa en la línea siguiente si esta empieza en minúscula.
    if (a && enTitulo && /^[a-záéíóúñ]/.test(l)) { a.titulo += ` ${l}`; continue; }
    enTitulo = false;
    if (!l) { cerrar(); continue; }
    parrafo.push(l);
  }
  cerrar();
  for (const a of out) a.titulo = a.titulo.replace(/\s*\(\*\)\s*$/, '').replace(/\.$/, '');
  return out;
}

// El SPIJ deja el texto original, una nota «(*) Numeral modificado por… cuyo texto es el siguiente:»
// y el texto nuevo entre comillas. Se separan: el original queda como «anterior» y el nuevo como vigente.
const prefijo = (s: string) => s.match(/^(\d+\.\d+(?:\.\d+)?\.?|[a-z]\)|[ivx]+\))\s/)?.[1]?.replace(/\.$/, '') ?? null;

function articulos(texto: string, desde: RegExp, hasta: RegExp): Articulo[] {
  return brutos(texto, desde, hasta).map((b) => {
    const parrafos: Parrafo[] = [];
    for (const p of b.parrafos) {
      const m = p.match(/^(\(\*\)[\s\S]*?cuyo texto es el siguiente:)\s*["“]([\s\S]*?)["”]\s*([\s\S]*)$/);
      if (!m) { parrafos.push(p.startsWith('(*)') ? { t: p, k: 'nota' } : { t: p }); continue; }
      const [, nota, nuevo, resto] = m;
      const clave = prefijo(nuevo);
      if (/modificad/i.test(nota) && clave) {
        for (let i = parrafos.length - 1; i >= 0; i -= 1) {
          if (!parrafos[i].k && prefijo(parrafos[i].t) === clave) { parrafos[i].k = 'anterior'; break; }
        }
      }
      parrafos.push({ t: nota, k: 'nota' }, { t: nuevo.trim() });
      if (resto.trim()) parrafos.push({ t: resto.trim() });
    }
    return { ...b, parrafos };
  });
}

const dir = process.argv[2];
if (!dir) throw new Error('Indica la carpeta con los .txt de la norma.');
const ley = articulos(readFileSync(join(dir, 'ley_32069_hasta_2026-07-19.txt'), 'utf8'), /\n\s*Artículo 1\.\s+Objeto/, /\n\s*DISPOSICIONES COMPLEMENTARIAS FINALES/);
const reglamento = articulos(readFileSync(join(dir, 'reglamento_ds009-2025-ef_hasta_2026-01-09.txt'), 'utf8'), /\n\s*Artículo 1\.\s+Objeto/, /\n\s*DISPOSICIONES COMPLEMENTARIAS FINALES/);

const salida = join(process.cwd(), 'src/datos/normativa');
mkdirSync(salida, { recursive: true });
const normas = {
  ley: { nombre: 'Ley N.° 32069, Ley General de Contrataciones Públicas', version: 'Texto con modificaciones hasta el 19-07-2026 (OECE, fuente SPIJ)', articulos: ley },
  reglamento: { nombre: 'Reglamento de la Ley N.° 32069 (D.S. N.° 009-2025-EF)', version: 'Texto con modificaciones hasta el 09-01-2026, incluye el D.S. N.° 001-2026-EF (OECE, fuente SPIJ)', articulos: reglamento },
};
writeFileSync(join(salida, 'textos.json'), JSON.stringify(normas));
// Índice liviano (número y título) para enlazar citas desde el navegador.
writeFileSync(join(salida, 'indice.json'), JSON.stringify(Object.fromEntries(Object.entries(normas).map(([k, v]) => [k, Object.fromEntries(v.articulos.map((a) => [a.n, a.titulo]))]))));
console.log(`Ley: ${ley.length} artículos (último ${ley.at(-1)?.n}) · Reglamento: ${reglamento.length} artículos (último ${reglamento.at(-1)?.n})`);
