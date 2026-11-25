import { normalizar } from '../analisis/numeros';

// Condiciones de obra que Axis sabe convertir en pruebas. Los patrones vienen del
// análisis de 377 resoluciones reales de adicionales y ampliaciones de La Libertad
// (OCDS, texto OCR; trabajos más frecuentes: subrasante 29 %, drenaje 28 %, redes 17 %)
// y de las reglas de campo del clasificador de hallazgos.

export interface Condicion {
  id: string;
  nombre: string;
  /** Señal en el documento de obra (texto normalizado: mayúsculas sin tildes). */
  enObra: RegExp;
  /** Palabras que, en el presupuesto o metrados, muestran que el expediente lo previó. */
  partidas: string[];
  /** Palabras que, en memoria, estudios o especificaciones, muestran que lo previó. */
  estudios: string[];
  /** Radio de aplicación alrededor de la obra de origen (m). */
  radio: number;
  recomendacion: string;
  /** Pruebas de la biblioteca que revisan algo parecido, y en qué se diferencian. */
  relacionadas?: { id: string; diferencia: string }[];
}

export const CONDICIONES: Condicion[] = [
  {
    id: 'redes', nombre: 'Redes o instalaciones existentes no previstas',
    enObra: /INTERFERENCIA|TUBERIA (DE (AGUA|DESAGUE)|EXISTENTE)|RED(ES)? (EXISTENTES? )?DE (AGUA|DESAGUE|ALCANTARILLADO)|BUZON(ES)? EXISTENTE|CONEXION(ES)? DOMICILIARIA|REUBICACION DE (POSTES?|REDES|BUZON)|SEDALIB|HIDRANDINA/,
    partidas: ['reubicacion', 'proteccion de red', 'proteccion de tuberia', 'interferencia', 'empalme', 'conexion domiciliaria', 'buzon', 'desvio de red'],
    estudios: ['catastro de redes', 'catastro de interferencias', 'interferencias', 'factibilidad de servicios', 'proteccion de redes'],
    // La red de la prestadora (SEDALIB, Hidrandina) y su falta de catastro son comunes a todo el sector.
    radio: 1000,
    recomendacion: 'Solicitar el catastro de redes de la empresa prestadora (SEDALIB, Hidrandina) y las partidas de protección o reubicación de las redes existentes.',
    relacionadas: [{ id: 'C-COORDINACION', diferencia: 'revisa inversiones de agua o desagüe pendientes en el MEF, no redes existentes que interfieren con la obra' }],
  },
  {
    id: 'napa', nombre: 'Agua en el subsuelo (napa freática) no prevista',
    enObra: /NAPA FREATICA|NIVEL FREATICO|AGUA SUBTERRANEA|FILTRACION(ES)? DE AGUA|AFLORAMIENTO DE AGUA|SUELO SATURADO/,
    partidas: ['bombeo', 'abatimiento', 'achique', 'subdren', 'drenaje subterraneo'],
    estudios: ['nivel freatico', 'napa freatica', 'napa'],
    radio: 400,
    recomendacion: 'Solicitar que el estudio de suelos sustente el nivel freático con exploración a la profundidad de excavación e incorporar bombeo o subdrenaje.',
  },
  {
    id: 'subrasante', nombre: 'Suelo inadecuado: mejoramiento de subrasante no previsto',
    enObra: /MEJORAMIENTO DE (LA )?SUBRASANTE|MEJORAMIENTO DE(L)? SUELO|SUELO INADECUADO|MATERIAL INADECUADO|SUBRASANTE INESTABLE|CAPACIDAD PORTANTE (BAJA|INSUFICIENTE)/,
    // Todo expediente vial menciona la subrasante y un CBR: solo cuenta si prevé tratarla.
    partidas: ['mejoramiento de subrasante', 'mejoramiento de suelo', 'material de prestamo', 'reemplazo de material', 'estabilizacion de suelo'],
    estudios: ['mejoramiento de subrasante', 'subrasante inadecuada', 'suelo inadecuado', 'reemplazo de material'],
    radio: 500,
    recomendacion: 'Solicitar ensayos de CBR por tramo y, si la subrasante es pobre, la partida de mejoramiento o reemplazo de material.',
    relacionadas: [{ id: 'X-SECCION', diferencia: 'revisa que el corte aloje las capas, no la calidad del suelo' }],
  },
  {
    id: 'drenaje', nombre: 'Drenaje pluvial no previsto',
    enObra: /CUNETA|DRENAJE PLUVIAL|ALCANTARILLA|BADEN|SUMIDERO|EVACUACION DE AGUAS PLUVIALES/,
    partidas: ['cuneta', 'drenaje', 'alcantarilla', 'baden', 'sumidero', 'rejilla'],
    estudios: ['drenaje pluvial', 'estudio hidrologico', 'evacuacion de aguas pluviales', 'drenaje'],
    radio: 1000,
    recomendacion: 'Solicitar el diseño del drenaje pluvial (captación y descarga) y sus partidas, con sustento en la pendiente del tramo.',
    relacionadas: [{ id: 'C-DRENAJE', diferencia: 'usa la pendiente y la cuenca del terreno; esta usa lo que pasó en una obra cercana' }],
  },
  {
    id: 'relleno', nombre: 'Relleno no controlado o material orgánico',
    enObra: /RELLENO NO CONTROLADO|DESMONTE|BASURA (ENTERRADA)?|MATERIAL ORGANICO|SOBREEXCAVACION/,
    partidas: ['eliminacion de relleno', 'sobreexcavacion', 'reemplazo de material', 'mejoramiento de suelo'],
    estudios: ['relleno', 'material organico'],
    radio: 200,
    recomendacion: 'Solicitar exploración adicional para descartar rellenos no controlados y, de confirmarse, la partida de eliminación y reemplazo de material (Norma E.050).',
  },
  {
    id: 'roca', nombre: 'Terreno rocoso no previsto',
    enObra: /EXCAVACION EN ROCA|ROCA (SUELTA|FIJA)|TERRENO ROCOSO|BOLONERIA/,
    partidas: ['roca', 'excavacion en terreno rocoso', 'voladura'],
    estudios: ['roca', 'clasificacion del terreno'],
    radio: 300,
    recomendacion: 'Solicitar la clasificación del terreno por tramos y las partidas de excavación en roca.',
  },
  {
    id: 'muros', nombre: 'Muro de contención no previsto',
    enObra: /MURO(S)? DE CONTENCION/,
    partidas: ['muro de contencion', 'muro'],
    estudios: ['muro de contencion', 'estabilidad de taludes'],
    radio: 300,
    recomendacion: 'Solicitar la evaluación de estabilidad de taludes y, si corresponde, el diseño y partidas del muro de contención.',
  },
];

// Texto legal que las resoluciones copian (definición de adicional, causales): no describe ESTA obra.
const PLANTILLA = /(?:INDISPENSABLE DEBIDO A|DEBIDO A:? ?I\)|INCISO I\)|SUPUESTOS? PREVISTOS?|SE ORIGINAN POR|ES POSIBLE QUE|SE ENCUENTRA PROHIBIDA|ENTENDIDA ESTA|SIEMPRE QUE RESULTE INDISPENSABLE|RESULTE INDISPENSABLE DEBIDO A|SOLO PROCEDE|PROCEDE LA AMPLIACION DE PLAZO|CAUSALES? DE AMPLIACION DE PLAZO|SIN PERJUICIO DE)[^.]{0,450}/g;

export interface Senal {
  condicion: Condicion;
  pagina: number;
  /** Frase del documento que la describe. */
  frase: string;
}

/** Condiciones descritas en las páginas de un documento de obra (la primera aparición de cada una). */
export function senalesEnObra(paginas: string[]): Senal[] {
  const out: Senal[] = [];
  paginas.forEach((original, i) => {
    // Texto compacto con la misma longitud que su versión normalizada: los índices sirven para ambos.
    const compacto = original.normalize('NFC').replace(/ \| /g, ' ').replace(/\s+/g, ' ').trim();
    const plano = normalizar(compacto);
    const limpio = plano.replace(PLANTILLA, (m) => ' '.repeat(m.length));
    for (const c of CONDICIONES) {
      if (out.some((s) => s.condicion.id === c.id)) continue;
      const m = c.enObra.exec(limpio);
      if (!m) continue;
      // La frase: desde el separador de cláusula anterior (. ; :) hasta el siguiente, con un tope.
      const antes = Math.max(...['. ', '; ', ': '].map((x) => limpio.lastIndexOf(x, m.index)));
      const inicio = Math.max(antes + 1, m.index - 260);
      const despues = ['. ', '; '].map((x) => limpio.indexOf(x, m.index + m[0].length)).filter((x) => x !== -1);
      const fin = Math.min(despues.length ? Math.min(...despues) + 1 : limpio.length, m.index + m[0].length + 260);
      const texto = (plano.length === compacto.length ? compacto : plano).slice(inicio, fin).trim();
      out.push({ condicion: c, pagina: i + 1, frase: texto.charAt(0).toUpperCase() + texto.slice(1) });
    }
  });
  return out;
}

/** Frases que niegan lo que sigue: «no se encontró nivel freático» no es haberlo previsto. */
const NEGACION = /(NO SE (ENCONTRO|DETECTO|OBSERVO|REGISTRO|EVIDENCIO|IDENTIFICO)|NO PRESENTA|NO EXISTE|SIN PRESENCIA DE|AUSENCIA DE|NO SE INTERVIENE|NO INTERVIENE)[^.;]{0,40}$/;

/** Primera palabra clave presente en el texto (normalizado) sin estar negada, o null. */
export function presente(texto: string, palabras: string[]): string | null {
  const t = normalizar(texto);
  for (const p of palabras) {
    const re = new RegExp(`\\b${normalizar(p)}`, 'g');
    for (const m of t.matchAll(re)) {
      if (!NEGACION.test(t.slice(Math.max(0, m.index! - 60), m.index))) return p;
    }
  }
  return null;
}
