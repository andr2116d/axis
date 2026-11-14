// Corre los verificadores de contexto sobre obras reales (por CUI) usando los datos reales descargados.
import { readFileSync } from 'node:fs';
import { tipoDesdeNombre, verificarContexto, type DatosTerritorio } from '../../src/lib/analisis/contexto';
const R = 'src/data/real/';
const j = (f: string) => JSON.parse(readFileSync(R + f, 'utf8'));
const inv = j('inversiones_la_libertad.json').inversiones;
const t: DatosTerritorio = { inversiones: inv, peligros: j('territorio/peligros_geologicos.json'), zonasCriticas: j('territorio/zonas_criticas.json'), puntosCriticosAna: j('territorio/ana_puntos_criticos.json'), rios: j('territorio/ana_rios.json') };
for (const cui of process.argv.slice(2)) {
  const x = inv.find((i: any) => i.cui === cui);
  if (!x || x.lat == null) { console.log(cui, 'sin ubicación propia'); continue; }
  console.log(`\n### ${cui} ${x.nombre.slice(0, 90)} (${x.distrito})`);
  for (const d of verificarContexto({ cui, nombre: x.nombre, tipo: tipoDesdeNombre(x.nombre), ubicacion: { lat: x.lat, lng: x.lng } }, t))
    console.log(`[${d.verificador}] ${d.resultado} (${d.severidad}) ${d.titulo}\n   ${d.detalle.slice(0, 330)}`);
}
