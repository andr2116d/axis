// Prueba el gemelo de terreno en vías reales de Trujillo. Uso: npx tsx scripts/analisis/probar-terreno.ts
import fs from 'node:fs';
import { crearDem, cuencaAportante, perfil, trazoDeVia, type RedVial } from '../../src/lib/analisis/terreno';

const meta = JSON.parse(fs.readFileSync('src/data/real/territorio/dem_trujillo.json', 'utf8'));
const dem = crearDem(meta, fs.readFileSync('src/data/real/territorio/dem_trujillo.bin'));
const red: RedVial = JSON.parse(fs.readFileSync('src/data/real/territorio/vias_trujillo.json', 'utf8'));
const casos: [string, number, number, string, number?][] = process.argv.length > 2 ? [[process.argv[2], +process.argv[3], +process.argv[4], process.argv[2]]] : [
  ['Calle Los Incas (El Porvenir)', -8.086, -78.9948, 'Calle Los Incas', 288],
  ['Calle Santa Clara (El Porvenir)', -8.07839, -78.9951, 'Calle Santa Clara', 300],
  ['Av. Jaime Blanco (El Porvenir)', -8.0771, -78.9961, 'Av. Jaime Blanco'],
  ['Jr. Pizarro (Centro de Trujillo)', -8.1115, -79.0285, 'Jirón Pizarro', 400],
  ['Av. España (Trujillo)', -8.1105, -79.0225, 'Avenida España', 400],
];
for (const [n, lat, lng, via, L] of casos) {
  const t0 = Date.now();
  const tr = trazoDeVia(red, { lat, lng }, [via], L);
  if (!tr) { console.log(n, '→ vía no encontrada'); continue; }
  const pf = perfil(dem, tr.trazo);
  const cu = cuencaAportante(dem, tr.trazo);
  console.log(`${n}: OSM "${tr.nombreOsm}" ${tr.porNombre ? 'por nombre' : 'por cercanía'} a ${tr.distancia.toFixed(0)} m, vía ${tr.longitudVia.toFixed(0)} m, tramo ${pf?.longitud.toFixed(0)} m`);
  if (pf) console.log(`   cota ${pf.zMin.toFixed(1)}–${pf.zMax.toFixed(1)} m, desnivel ${pf.desnivel.toFixed(1)} m, pendiente media ${(pf.pendienteMedia * 100).toFixed(1)}%, máx 50 m ${(pf.pendienteMax * 100).toFixed(1)}%`);
  if (cu) console.log(`   área que drena a la vía ${cu.areaHa.toFixed(1)} ha${cu.tocaBorde ? ' (mínimo: toca el borde)' : ''}, desnivel aguas arriba ${cu.desnivelAguasArriba.toFixed(0)} m  [${Date.now() - t0} ms]`);
}
