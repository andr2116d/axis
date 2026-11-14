// Clasifica TODAS las consultas reales de los pliegos con el modelo entrenado y resume por proceso:
// consultas, observaciones al expediente (no "Bases y procedimiento") y cuántas acogió la entidad.
// Uso: npx tsx scripts/analisis/exposicion-pliegos.ts <consultas.json> <salida.json>
import fs from 'node:fs';
import { clasificar, type ModeloClasificador } from '../../src/lib/analisis/clasificador';
const m: ModeloClasificador = JSON.parse(fs.readFileSync('src/data/aprendido/clasificador.json', 'utf8'));
const q: { proceso: string; texto: string; aceptada: boolean }[] = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const por: Record<string, { consultas: number; expediente: number; expAcogidas: number; causas: Record<string, number>; causasTodas: Record<string, number> }> = {};
for (const x of q) {
  const p = (por[x.proceso] ??= { consultas: 0, expediente: 0, expAcogidas: 0, causas: {}, causasTodas: {} });
  p.consultas++;
  const c = clasificar(m, x.texto);
  if (c.causa !== 'Bases y procedimiento') {
    p.expediente++;
    p.causasTodas[c.causa] = (p.causasTodas[c.causa] ?? 0) + 1;
    if (x.aceptada) { p.expAcogidas++; p.causas[c.causa] = (p.causas[c.causa] ?? 0) + 1; }
  }
}
fs.writeFileSync(process.argv[3], JSON.stringify(por));
const v = Object.values(por);
console.log(`procesos ${v.length}; consultas ${q.length}; observaciones al expediente ${v.reduce((s, x) => s + x.expediente, 0)}; acogidas ${v.reduce((s, x) => s + x.expAcogidas, 0)}`);
