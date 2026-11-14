// Entrena, compara y evalúa los clasificadores de causas.
//  - Entrenamiento: consultas reales con etiqueta automática ("plata"), etiquetas dirigidas a causas raras y el
//    conjunto de referencia hecho a mano ("oro").
//  - Evaluación honesta: validación cruzada de 5 particiones agrupadas por proceso sobre el oro (muestra aleatoria);
//    el modelo nunca ve la partición que se mide. Las dirigidas solo entrenan.
//  - Se comparan Naive Bayes y regresión logística; se guarda el mejor (por F1 de causas del expediente), calibrado.
// Uso: npx tsx scripts/analisis/entrenar-clasificador.ts <consultas.json>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { clasificar, entrenarLR, entrenarNB, puntajesCrudos, type ModeloClasificador, type ModeloEntrenado } from '../../src/lib/analisis/clasificador';

const CLASES = ['Bases y procedimiento', 'Presupuesto y precios', 'Metrados', 'Especificaciones técnicas', 'Planos', 'Estudios básicos', 'Interferencias', 'Cronograma', 'Factibilidades y terreno', 'Normativa'];
const consultas: { texto: string; plata: string | null; proceso: string }[] = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const oro: { texto: string; causa: string; proceso: string }[] = JSON.parse(readFileSync('scripts/datos/etiquetas-oro.json', 'utf8')).etiquetas;
const dirigidas: { texto: string; causa: string }[] = JSON.parse(readFileSync('scripts/datos/etiquetas-dirigidas.json', 'utf8')).etiquetas;

const clave = (t: string) => t.slice(0, 160);
const excluir = new Set([...oro, ...dirigidas].map((o) => clave(o.texto)));
const plata = consultas.filter((c) => c.plata && !excluir.has(clave(c.texto))).map((c) => ({ texto: c.texto, clase: c.plata! }));
const extra = dirigidas.map((d) => ({ texto: d.texto, clase: d.causa, peso: 3 }));

function f1(clases: string[], r: string[], p: string[]) {
  const v = clases.map((c) => {
    const tp = r.filter((x, i) => x === c && p[i] === c).length, fp = r.filter((x, i) => x !== c && p[i] === c).length, fn = r.filter((x, i) => x === c && p[i] !== c).length;
    if (tp + fn === 0) return null;
    const pr = tp + fp ? tp / (tp + fp) : 0, rc = tp / (tp + fn);
    return pr + rc ? (2 * pr * rc) / (pr + rc) : 0;
  }).filter((x): x is number => x !== null);
  return v.reduce((a, b) => a + b, 0) / v.length;
}
function metricas(real: string[], pred: string[]) {
  const bin = (x: string) => (x === 'Bases y procedimiento' ? 'B' : 'E');
  const iExp = real.map((_, i) => i).filter((i) => real[i] !== 'Bases y procedimiento');
  return {
    exactitud: +(real.filter((r, i) => r === pred[i]).length / real.length).toFixed(3),
    f1Macro: +f1(CLASES, real, pred).toFixed(3),
    expedienteVsBases: +(real.filter((r, i) => bin(r) === bin(pred[i])).length / real.length).toFixed(3),
    causaEnObservacionesDeExpediente: +(iExp.filter((i) => real[i] === pred[i]).length / iExp.length).toFixed(3),
    f1CausasExpediente: +f1(CLASES.slice(1), iExp.map((i) => real[i]), iExp.map((i) => pred[i])).toFixed(3),
  };
}

// Línea base: reglas por palabras clave (las mismas que generan la plata)
const reglaPorTexto = new Map(consultas.map((r) => [clave(r.texto), r.plata]));
const base = metricas(oro.map((o) => o.causa), oro.map((o) => reglaPorTexto.get(clave(o.texto)) ?? 'Bases y procedimiento'));

const procesos = [...new Set(oro.map((o) => o.proceso))].sort();
const particion = (p: string) => procesos.indexOf(p) % 5;
type Entrenador = (ej: { texto: string; clase: string; peso?: number }[]) => ModeloEntrenado;
function validar(entrenar: Entrenador) {
  const real: string[] = [], pred: string[] = [], puntajes: { real: number; s: number[] }[] = [];
  for (let f = 0; f < 5; f++) {
    const train = oro.filter((o) => particion(o.proceso) !== f).map((o) => ({ texto: o.texto, clase: o.causa, peso: 3 }));
    const m = entrenar([...plata, ...extra, ...train]);
    for (const o of oro.filter((o) => particion(o.proceso) === f)) {
      real.push(o.causa); pred.push(clasificar(m, o.texto).causa);
      puntajes.push({ real: CLASES.indexOf(o.causa), s: puntajesCrudos(m, o.texto) });
    }
  }
  const perdida = (T: number) => puntajes.reduce((acc, { real, s }) => {
    const mx = Math.max(...s); const ex = s.map((x) => Math.exp((x - mx) / T)); const z = ex.reduce((a, b) => a + b, 0);
    return acc - Math.log(Math.max(1e-12, ex[real] / z));
  }, 0) / puntajes.length;
  const temperatura = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16].reduce((mejor, T) => (perdida(T) < perdida(mejor) ? T : mejor), 1);
  return { metricas: metricas(real, pred), temperatura, perdida: +perdida(temperatura).toFixed(3), real, pred };
}

const candidatos: Record<string, Entrenador> = {
  'Naive Bayes': (ej) => entrenarNB(ej, CLASES),
  'Regresión logística': (ej) => entrenarLR(ej, CLASES),
};
const resultados = Object.fromEntries(Object.entries(candidatos).map(([n, e]) => [n, validar(e)]));
console.log(`plata ${plata.length} | dirigidas ${extra.length} | oro ${oro.length} (${procesos.length} procesos)`);
console.table({ 'Reglas (línea base)': base, ...Object.fromEntries(Object.entries(resultados).map(([n, r]) => [n + ' (CV 5)', r.metricas])) });
const [ganador, r] = Object.entries(resultados).sort((a, b) => b[1].metricas.f1CausasExpediente - a[1].metricas.f1CausasExpediente || b[1].metricas.exactitud - a[1].metricas.exactitud)[0];
console.log(`Ganador: ${ganador} | temperatura ${r.temperatura} | pérdida log calibrada ${r.perdida}`);
const conf: Record<string, Record<string, number>> = {};
r.real.forEach((x, i) => { conf[x] ??= {}; conf[x][r.pred[i]] = (conf[x][r.pred[i]] ?? 0) + 1; });
for (const [x, fila] of Object.entries(conf)) console.log('  ' + x.padEnd(26), JSON.stringify(fila));

// Modelo final con todos los datos, recortado para el navegador
const final = candidatos[ganador]([...plata, ...extra, ...oro.map((o) => ({ texto: o.texto, clase: o.causa, peso: 3 }))]);
const red = (x: number) => Math.round(x * 1000) / 1000;
const pesos: Record<string, number[]> = {};
for (const [t, v] of Object.entries(final.pesos)) if (Math.max(...v.map(Math.abs)) > 0.02) pesos[t] = v.map(red);
const idf = final.idf ? Object.fromEntries(Object.keys(pesos).map((t) => [t, red(final.idf![t])])) : undefined;
const modelo: ModeloClasificador = {
  version: '2.0', ...final, pesos, idf, sesgo: final.sesgo.map(red), temperatura: r.temperatura,
  entrenamiento: { ejemplos: plata.length + extra.length + oro.length, fuente: 'Consultas y observaciones de postores en pliegos de absolución de obras de La Libertad (OECE/SEACE, 2025-2026)', fecha: new Date().toISOString().slice(0, 10) },
  evaluacion: { metodo: 'Validación cruzada de 5 particiones agrupadas por proceso sobre 240 consultas etiquetadas a mano (muestra aleatoria)', modelo: ganador, lineaBaseReglas: base,
    comparacion: Object.fromEntries(Object.entries(resultados).map(([n, x]) => [n, x.metricas])), temperatura: r.temperatura, perdidaLogCalibrada: r.perdida },
};
mkdirSync('src/data/aprendido', { recursive: true });
writeFileSync('src/data/aprendido/clasificador.json', JSON.stringify(modelo));
console.log(`Guardado: ${Object.keys(pesos).length} términos, ${(JSON.stringify(modelo).length / 1024).toFixed(0)} KB`);
