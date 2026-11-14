// Ciclo de aprendizaje de punta a punta: hallazgo en obra → clasificador → borrador → validación → alerta nueva en otro expediente.
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { fragmentosALineas } from '../../src/lib/texto-pdf';
import { ocultarDatosPersonales } from '../../src/lib/privacidad';
import { analizarExpediente } from '../../src/lib/analisis/expediente';
import { borradorDesdeHallazgo, sugerirCausaHallazgo, type HallazgoObra } from '../../src/lib/analisis/aprendizaje';

async function paginas(ruta: string) {
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(ruta)), useSystemFonts: true }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const tc = await (await pdf.getPage(i)).getTextContent();
    out.push({ numero: i, lineas: ocultarDatosPersonales(fragmentosALineas((tc.items as any[]).map((it) => ({ str: it.str, x: it.transform[4], y: it.transform[5], ancho: it.width })))).lineas });
  }
  return out;
}
async function main() {
  const modelo = JSON.parse(fs.readFileSync('src/data/aprendido/clasificador.json', 'utf8'));
  const h: HallazgoObra = { id: 'H-0001', obra: 'Reparación de calzada Av. Jaime Blanco (en ejecución)', descripcion: 'Al excavar la zanja para el sardinel se encontró una tubería de desagüe existente que no figuraba en los planos', ubicacion: { lat: -8.077054, lng: -78.996063 }, profundidad: 0.8, fecha: '2026-12-03', fuente: 'Asiento N° 14 del cuaderno de obra' };
  const c = sugerirCausaHallazgo(modelo, h.descripcion);
  console.log(`1) Supervisor registra el hallazgo. Axis sugiere: ${c.causa} (${c.fuente}: ${c.motivo}); alternativas ${c.alternativas.map((a) => a.causa).join(', ')}`);
  const borrador = borradorDesdeHallazgo(h, c.causa, 1);
  console.log(`2) Borrador: ${borrador.id} "${borrador.nombre}" | radio ${borrador.radio} m | partidas esperadas: ${borrador.palabrasPartida.join(', ')}`);
  const validada = { ...borrador, estado: 'validada' as const, curador: 'Curador (demo)', fechaValidacion: '2026-12-04' };
  console.log('3) El curador la valida.');
  for (const a of ['public/expedientes/LL-02_pistas-calle-santa-clara_limpio.pdf', 'public/expedientes/LL-01_pistas-calle-los-incas_con-errores.pdf']) {
    const pags = await paginas(a);
    const antes = analizarExpediente(pags).detecciones.filter((d) => d.verificador.startsWith('A-'));
    const despues = analizarExpediente(pags, { aprendidas: [validada] }).detecciones.filter((d) => d.verificador.startsWith('A-'));
    console.log(`4) ${a.split('/').pop()}: antes ${antes.length} alertas aprendidas, después: ${despues.map((d) => `${d.resultado.toUpperCase()} – ${d.titulo}`).join(' | ') || 'ninguna (está lejos del hallazgo)'}`);
    if (despues[0]) console.log('   ' + despues[0].detalle.slice(0, 300));
  }
}
main();
