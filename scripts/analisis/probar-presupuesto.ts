// Corre el lector y los verificadores sobre un presupuesto real (texto de pdftotext -layout).
// Uso: npx tsx scripts/analisis/probar-presupuesto.ts <archivo.txt>
import { readFileSync } from 'node:fs';
import { leerPresupuesto, partidas } from '../../src/lib/analisis/presupuesto';
import { verificarPresupuesto } from '../../src/lib/analisis/verificar-presupuesto';

const txt = readFileSync(process.argv[2], 'utf8');
const paginas = txt.split('\f').map((t, i) => ({ numero: i + 1, lineas: t.split('\n') }));
const p = leerPresupuesto(paginas);
console.log('Obra:', p.nombreObra?.slice(0, 90), '| CUI', p.cui, '| costo al', p.fechaCosto);
console.log('Ítems', p.items.length, '| partidas', partidas(p).length, '| títulos', p.items.filter((i) => i.esTitulo).length);
console.log('Resumen:', Object.fromEntries(Object.entries(p.resumen).filter(([k]) => k !== 'otros').map(([k, v]) => [k, (v as any)?.monto])), '| letras', p.enLetras?.valor);
const sinUnidad = partidas(p).filter((i) => i.unidad === '?');
if (sinUnidad.length) console.log('Partidas sin unidad reconocida:', sinUnidad.map((i) => i.codigo + ' ' + i.descripcion.slice(0, 40)));
for (const d of verificarPresupuesto(p)) console.log(`\n[${d.verificador}] ${d.resultado.toUpperCase()} (${d.severidad}) ${d.titulo}\n  ${d.detalle}\n  p.${d.evidencias[0]?.pagina}: ${d.evidencias[0]?.extracto.slice(0, 120)}`);
