// Análisis real: antecedentes de los ganadores de obras de La Libertad (OECE OCDS) a la fecha de la buena pro.
import { readFileSync } from 'node:fs';
import { esRuc, verificarProveedor } from '../../src/lib/analisis/proveedor';
const obras = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const idx = JSON.parse(readFileSync('src/data/real/proveedores.json', 'utf8')).porRuc;
let conGanador = 0, consorcios = 0, vigente = 0, inh5 = 0, multa = 0, pen = 0;
const ejemplos: string[] = [];
for (const o of obras) {
  for (const g of o.ganadores ?? []) {
    conGanador++;
    if (!esRuc(g.ruc)) { consorcios++; continue; }
    const fecha = (g.fecha ?? o.fecha_convocatoria ?? '').slice(0, 10);
    const det = verificarProveedor(g.ruc, fecha, idx[g.ruc]);
    if (det.some((d) => d.resultado === 'falla' && /vigente/.test(d.titulo))) { vigente++; ejemplos.push(`VIGENTE ${o.mes} ${o.entidad} | ${det[0].detalle.slice(0, 160)}`); }
    const f = det.filter((d) => d.resultado === 'falla');
    if (f.some((d) => /últimos 5 años/.test(d.titulo))) inh5++;
    if (f.some((d) => /multado/.test(d.titulo))) multa++;
    if (f.some((d) => /penalidad/.test(d.titulo))) { pen++; if (ejemplos.length < 6) ejemplos.push(`PENALIDAD ${o.mes} ${o.descripcion.slice(0, 60)} | ${f.find((d) => /penalidad/.test(d.titulo))!.detalle.slice(0, 200)}`); }
  }
}
console.log({ obras: obras.length, adjudicaciones: conGanador, consorcios, empresasVerificadas: conGanador - consorcios, inhabilitacionVigente: vigente, inhabilitadoUltimos5: inh5, multados: multa, conPenalidades: pen });
ejemplos.slice(0, 5).forEach((e) => console.log(e));
