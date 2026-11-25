import { normalizar } from './numeros';
// Nombres de los documentos del expediente (compartido por el motor y la interfaz).
export type Documento = 'caratula' | 'memoria' | 'presupuesto' | 'metrados' | 'apu' | 'gastos' | 'especificaciones' | 'cronograma' | 'formula' | 'cotizaciones' | 'suelos' | 'planos' | 'otro';
export const NOMBRE_DOCUMENTO: Record<Documento, string> = {
  caratula: 'Carátula', memoria: 'Memoria descriptiva', presupuesto: 'Presupuesto', metrados: 'Planilla de metrados', apu: 'Análisis de precios unitarios', gastos: 'Desagregado de gastos generales', especificaciones: 'Especificaciones técnicas',
  cronograma: 'Cronograma de ejecución', formula: 'Fórmula polinómica', cotizaciones: 'Cotizaciones', suelos: 'Estudio de mecánica de suelos', planos: 'Índice de planos', otro: 'Otros',
};

type Pag = { numero: number; lineas: string[] };

const ENCABEZADOS: [Documento, RegExp][] = [
  ['formula', /FORMULAS? POLINOMICAS?/],
  ['apu', /ANALISIS DE (LOS )?(PRECIOS|COSTOS) UNITARIOS/],
  ['gastos', /DESAGREGADO DE (LOS )?GASTOS GENERALES|GASTOS GENERALES (DESAGREGADOS|DETALLADOS)|DETALLE DE GASTOS GENERALES/],
  ['metrados', /PLANILLA DE METRADOS|RESUMEN DE METRADOS|SUSTENTO DE METRADOS|HOJA DE METRADOS|^METRADOS\b/],
  ['especificaciones', /ESPECIFICACIONES TECNICAS/],
  ['cronograma', /CRONOGRAMA (?:DE EJECUCION|DE OBRA|VALORIZADO|DE AVANCE|GANTT|PERT)|^CRONOGRAMA$|PROGRAMACION DE OBRA|PROGRAMA DE EJECUCION|DIAGRAMA DE GANTT/],
  ['cotizaciones', /^COTIZACION|^PROFORMA/],
  ['suelos', /MECANICA DE SUELOS|ESTUDIO DE SUELOS|ESTUDIO GEOTECNICO/],
  ['planos', /INDICE DE PLANOS|RELACION DE PLANOS|LISTA DE PLANOS/],
  ['presupuesto', /^PRESUPUESTO\b|PRESUPUESTO (DE OBRA|GENERAL|BASE|ANALITICO)|^HOJA DE PRESUPUESTO/],
  ['memoria', /MEMORIA DESCRIPTIVA/],
];

/** Firmas de contenido cuando la página no tiene encabezado reconocible. */
function porContenido(lineas: string[]): Documento | null {
  const t = lineas.map((l) => normalizar(l));
  const todo = t.join('\n');
  if (/RENDIMIENTO\b[^\n]{0,40}(DIA|\/DIA)/.test(todo) && /COSTO UNITARIO DIRECTO POR/.test(todo)) return 'apu';
  if (/^SON\s*:/m.test(todo) || /COSTO DIRECTO|GASTOS GENERALES\s*\(?\d|SUB ?TOTAL|I\.?G\.?V/.test(todo) && /\d{1,3}(,\d{3})*\.\d{2}/.test(todo)) {
    const partidas = t.filter((l) => /^\d{2}(\.\d{2}){1,4}\s+\S/.test(l.trim()) && /\d\.\d{2}\s*$/.test(l)).length;
    if (partidas >= 3) return 'presupuesto';
  }
  if (/\bK\s*=\s*0[.,]\d{3}/.test(todo)) return 'formula';
  return null;
}

/** Reconoce qué documento es cada página: encabezado en sus 12 primeras líneas, luego firmas de contenido; si nada, hereda la anterior. */
/** Documento reconocido en la página por su encabezado o su contenido; null si no tiene nada propio de un expediente. */
export function detectarPagina(p: Pag): Documento | null {
  const primeras = p.lineas.filter((l) => l.trim()).slice(0, 12).map((l) => normalizar(l.replace(/\s*\|\s*/g, ' ')).trim());
  for (const l of primeras) for (const [d, re] of ENCABEZADOS) if (re.test(l)) return d;
  return porContenido(p.lineas);
}

export function clasificarPaginas(paginas: Pag[]): { pagina: number; documento: Documento }[] {
  let anterior: Documento = 'caratula';
  return paginas.map((p, i) => {
    let doc = detectarPagina(p);
    if (!doc) doc = i === 0 ? 'caratula' : anterior;
    anterior = doc;
    return { pagina: p.numero, documento: doc };
  });
}

/** ¿Las páginas parecen las bases del procedimiento de selección y no el expediente técnico? */
export function pareceBases(paginas: Pag[]): boolean {
  const t = normalizar(paginas.slice(0, 6).map((p) => p.lineas.slice(0, 40).join(' ')).join(' '));
  return /BASES (INTEGRADAS|ADMINISTRATIVAS|ESTANDAR)|PROCEDIMIENTO DE SELECCION|LICITACION PUBLICA|ADJUDICACION SIMPLIFICADA|SECCION GENERAL/.test(t)
    && /CAPITULO|SECCION ESPECIFICA|TERMINOS DE REFERENCIA|REQUERIMIENTO/.test(t);
}

/** Pista por el nombre del archivo (los expedientes del SEACE suelen publicarse en partes: "PRESUPUESTO DESAGREGADO.pdf"). */
export function documentoPorArchivo(nombre: string): Documento | null {
  const n = normalizar(nombre.replace(/[_.+-]+/g, ' '));
  const reglas: [Documento, RegExp][] = [
    ['formula', /FORMULA|POLINOMIC/], ['apu', /ANALISIS DE (COSTOS|PRECIOS)|\bAPU\b|\bACU\b|COSTOS UNITARIOS|PRECIOS UNITARIOS/],
    ['gastos', /GASTOS GENERALES|\bG ?G\b/], ['metrados', /METRADO/], ['especificaciones', /ESPECIFICACION/],
    ['cronograma', /CRONOGRAMA|GANTT|PERT|PROGRAMACION/], ['cotizaciones', /COTIZACION|PROFORMA/], ['suelos', /SUELOS|GEOTECNI|EMS\b/],
    ['planos', /PLANO/], ['memoria', /MEMORIA/], ['presupuesto', /PRESUPUESTO/],
  ];
  for (const [d, r] of reglas) if (r.test(n)) return d;
  return null;
}
