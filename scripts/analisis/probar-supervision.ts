// Plan de verificación en obra generado de un expediente. Uso: npx tsx scripts/analisis/probar-supervision.ts [pdf]
import fs from 'node:fs';
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import { paginasDePdf } from './util';
(async () => {
  const f = process.argv[2] ?? 'public/expedientes/LL-02_pistas-calle-santa-clara_limpio.pdf';
  const r = analizarExpediente(await paginasDePdf(f), { antecedentes: JSON.parse(fs.readFileSync('src/data/real/antecedentes_contraloria.json', 'utf8')) });
  for (const p of r.planObra ?? []) {
    console.log(`[${p.prioridad}] ${p.elemento.toUpperCase()} — ${p.partidas.map((x) => x.codigo).join(', ')} — ${p.porque}`);
    for (const v of p.verificar) console.log(`     • ${v.que}: ${v.valor} (${v.momento})`);
    if (p.antecedentes[0]) console.log(`     ↳ Inf. ${p.antecedentes[0].informe}, ${p.antecedentes[0].lugar}: ${p.antecedentes[0].texto.slice(0, 160)}…`);
  }
})();
