// Cuántas obras adjudicadas de La Libertad activan cada señal de competencia/ejecución (debe discriminar, no marcar a todas).
import fs from 'node:fs';
import { senalesProceso, historialEjecucion, type DatosCompetencia } from '../../src/lib/analisis/competencia';
const d: DatosCompetencia = JSON.parse(fs.readFileSync('src/data/real/competencia_la_libertad.json', 'utf8'));
const adj = d.procesos.filter((p) => p.ganadores.length);
const cuenta: Record<string, number> = {};
let conAlguna = 0;
for (const p of adj) {
  const s = [...senalesProceso(p, d), ...p.ganadores.flatMap((g) => historialEjecucion(g, d, p.fecha))].filter((x) => x.resultado === 'falla');
  if (s.length) conAlguna++;
  for (const x of new Set(s.map((x) => x.verificador))) cuenta[x] = (cuenta[x] ?? 0) + 1;
}
console.log(`obras adjudicadas: ${adj.length}; con al menos una señal: ${conAlguna} (${(conAlguna / adj.length * 100).toFixed(0)}%)`);
console.table(cuenta);
const ej = adj.map((p) => ({ p, s: senalesProceso(p, d).filter((x) => x.resultado === 'falla') })).filter((x) => x.s.length >= 2).slice(0, 5);
for (const { p, s } of ej) console.log('-', p.nomenclatura, p.entidad, '→', s.map((x) => x.titulo).join(' | '));
