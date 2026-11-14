// Clasificador de texto que ubica una observación o hallazgo en la taxonomía de causas de Axis.
// Entrenado con consultas reales de postores (pliegos de absolución, SEACE, La Libertad).
// Dos variantes con la misma forma lineal (puntaje = sesgo + Σ x_token · peso_token), así la predicción y la
// explicación ("qué palabras pesaron") son iguales para ambas:
//   - 'nb': Naive Bayes multinomial (x = conteo; pesos = log P(token|clase))
//   - 'lr': regresión logística multinomial (x = TF-IDF normalizado; pesos aprendidos con descenso de gradiente)
// Es pequeño y corre igual en el navegador y en el servidor.

export interface ModeloClasificador {
  version: string;
  tipo: 'nb' | 'lr';
  clases: string[];
  sesgo: number[];
  pesos: Record<string, number[]>;
  /** Solo 'lr': IDF de cada token. */
  idf?: Record<string, number>;
  /** Temperatura de calibración de las probabilidades. */
  temperatura?: number;
  entrenamiento: { ejemplos: number; fuente: string; fecha: string };
  evaluacion?: Record<string, unknown>;
}
export type ModeloEntrenado = Omit<ModeloClasificador, 'version' | 'entrenamiento' | 'evaluacion'>;

const VACIAS = new Set(('de la el los las del en con por para que se un una al lo su sus es son como mas pero sin sobre este esta estos estas dicho dicha dichos dichas ' +
  'ser sera han ha hay no si ya o y a e u le les nos ese esa eso entre segun cual cuales donde cuando tambien asi mismo misma ' +
  'solicita solicitamos solicito consulta consultamos observa observamos observacion advierte advierta comite seleccion entidad sirvase favor confirmar precisar indicar ' +
  'respecto revision presente procedimiento numeral literal pagina item').split(' '));

const raiz = (w: string) => (w.length > 5 ? w.replace(/(ciones|cion|mente|idades|idad|ados|adas|ado|ada|es|s)$/, '') : w);

/** Tokens: palabras normalizadas (sin tildes, raíz simple) y pares de palabras consecutivas. */
export function tokens(texto: string): string[] {
  const t = texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/f'?\s*c/g, 'fc').replace(/[^a-z0-9 ]/g, ' ');
  const ws = t.split(/\s+/).filter((w) => w.length > 2 && !VACIAS.has(w) && !/^\d+$/.test(w)).map(raiz);
  const out = [...ws];
  for (let i = 0; i + 1 < ws.length; i++) out.push(ws[i] + '_' + ws[i + 1]);
  return out;
}

type Ejemplo = { texto: string; clase: string; peso?: number };

/** Vector disperso del texto según el tipo de modelo. */
function vector(m: Pick<ModeloClasificador, 'tipo' | 'pesos' | 'idf'>, texto: string): Map<string, number> {
  const c = new Map<string, number>();
  for (const t of tokens(texto)) if (t in m.pesos) c.set(t, (c.get(t) ?? 0) + 1);
  if (m.tipo === 'nb') return c;
  let norma = 0;
  for (const [t, n] of c) { const v = (1 + Math.log(n)) * (m.idf?.[t] ?? 1); c.set(t, v); norma += v * v; }
  norma = Math.sqrt(norma) || 1;
  for (const [t, v] of c) c.set(t, v / norma);
  return c;
}

function vocabulario(ejemplos: Ejemplo[], minimo: number) {
  const df = new Map<string, number>();
  for (const e of ejemplos) for (const t of new Set(tokens(e.texto))) df.set(t, (df.get(t) ?? 0) + 1);
  return { df, vocab: [...df.keys()].filter((t) => df.get(t)! >= minimo) };
}

export function entrenarNB(ejemplos: Ejemplo[], clases: string[], alfa = 0.5, minimo = 4): ModeloEntrenado {
  const { vocab } = vocabulario(ejemplos, minimo);
  const enV = new Set(vocab);
  const conteo = new Map<string, number[]>(vocab.map((t) => [t, clases.map(() => 0)]));
  const total = clases.map(() => 0), docs = clases.map(() => 0);
  for (const e of ejemplos) {
    const k = clases.indexOf(e.clase); if (k < 0) continue;
    const w = e.peso ?? 1; docs[k] += w;
    for (const t of tokens(e.texto)) if (enV.has(t)) { conteo.get(t)![k] += w; total[k] += w; }
  }
  const V = vocab.length, totDocs = docs.reduce((a, b) => a + b, 0);
  const pesos: Record<string, number[]> = {};
  for (const t of vocab) pesos[t] = conteo.get(t)!.map((c, k) => Math.log((c + alfa) / (total[k] + alfa * V)));
  return { tipo: 'nb', clases, sesgo: docs.map((d) => Math.log((d + 1) / (totDocs + clases.length))), pesos };
}

/** Regresión logística multinomial con TF-IDF, pesos por clase (raíz de la frecuencia inversa) y regularización L2. */
export function entrenarLR(ejemplos: Ejemplo[], clases: string[], opciones: { minimo?: number; epocas?: number; tasa?: number; l2?: number; semilla?: number } = {}): ModeloEntrenado {
  const { minimo = 3, epocas = 30, tasa = 0.8, l2 = 2e-5, semilla = 7 } = opciones;
  const { df, vocab } = vocabulario(ejemplos, minimo);
  const N = ejemplos.length;
  const idf: Record<string, number> = {};
  for (const t of vocab) idf[t] = Math.log((1 + N) / (1 + df.get(t)!)) + 1;
  const pesos: Record<string, number[]> = {};
  for (const t of vocab) pesos[t] = clases.map(() => 0);
  const m: ModeloEntrenado = { tipo: 'lr', clases, sesgo: clases.map(() => 0), pesos, idf };
  const K = clases.length;
  const nK = clases.map((c) => ejemplos.filter((e) => e.clase === c).reduce((s, e) => s + (e.peso ?? 1), 0));
  const totP = nK.reduce((a, b) => a + b, 0);
  const pesoClase = nK.map((n) => (n ? Math.sqrt(totP / (K * n)) : 0));
  const datos = ejemplos.map((e) => ({ x: [...vector(m, e.texto)], y: clases.indexOf(e.clase), w: (e.peso ?? 1) })).filter((d) => d.y >= 0 && d.x.length);
  let r = semilla;
  const azar = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let ep = 0; ep < epocas; ep++) {
    for (let i = datos.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [datos[i], datos[j]] = [datos[j], datos[i]]; }
    const eta = tasa / (1 + ep * 0.2);
    for (const d of datos) {
      const s = m.sesgo.slice();
      for (const [t, v] of d.x) { const p = pesos[t]; for (let k = 0; k < K; k++) s[k] += v * p[k]; }
      const mx = Math.max(...s); const ex = s.map((z) => Math.exp(z - mx)); const Z = ex.reduce((a, b) => a + b, 0);
      const g = ex.map((e, k) => (e / Z - (k === d.y ? 1 : 0)) * d.w * pesoClase[d.y]);
      for (let k = 0; k < K; k++) m.sesgo[k] -= eta * g[k] * 0.1;
      for (const [t, v] of d.x) { const p = pesos[t]; for (let k = 0; k < K; k++) p[k] -= eta * (g[k] * v + l2 * p[k]); }
    }
  }
  return m;
}

export interface Prediccion { causa: string; probabilidad: number; alternativas: { causa: string; probabilidad: number }[]; porque: string[] }
type Modelo = Pick<ModeloClasificador, 'tipo' | 'clases' | 'sesgo' | 'pesos' | 'idf' | 'temperatura'>;

/** Puntaje sin normalizar de cada clase. */
export function puntajesCrudos(m: Modelo, texto: string): number[] {
  const s = m.sesgo.slice();
  for (const [t, v] of vector(m, texto)) m.pesos[t].forEach((p, k) => (s[k] += v * p));
  return s;
}

export function clasificar(m: Modelo, texto: string): Prediccion {
  const x = vector(m, texto);
  const s = puntajesCrudos(m, texto);
  const T = m.temperatura ?? 1;
  const max = Math.max(...s);
  const ex = s.map((v) => Math.exp((v - max) / T));
  const z = ex.reduce((a, b) => a + b, 0);
  const orden = ex.map((v, k) => ({ causa: m.clases[k], probabilidad: v / z })).sort((a, b) => b.probabilidad - a.probabilidad);
  const k = m.clases.indexOf(orden[0].causa);
  // Palabras que más empujan hacia la clase ganadora frente al promedio de las demás
  const porque = [...x].map(([t, v]) => {
    const p = m.pesos[t];
    const otras = p.filter((_, j) => j !== k);
    return { t, d: v * (p[k] - otras.reduce((a, b) => a + b, 0) / otras.length) };
  }).sort((a, b) => b.d - a.d).filter((y) => y.d > 0).slice(0, 5).map((y) => y.t.replace('_', ' '));
  return { causa: orden[0].causa, probabilidad: orden[0].probabilidad, alternativas: orden.slice(1, 3), porque };
}
