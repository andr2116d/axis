// Traducción de los resultados a lenguaje del evaluador: a qué parte del expediente pertenece cada prueba y por qué importa.
import type { Deteccion } from './analisis/tipos-analisis';
import type { Documento } from './analisis/nombres';

export type Pieza = Documento | 'calle' | 'aprendidas';

export const NOMBRE_PIEZA: Record<Pieza, string> = {
  presupuesto: 'Presupuesto', metrados: 'Metrados', apu: 'Análisis de precios', gastos: 'Gastos generales', especificaciones: 'Especificaciones',
  cronograma: 'Cronograma', formula: 'Fórmula polinómica', cotizaciones: 'Cotizaciones', suelos: 'Estudio de suelos', planos: 'Planos', memoria: 'Memoria descriptiva',
  caratula: 'Carátula', otro: 'Otros', calle: 'La calle y su entorno', aprendidas: 'Lo aprendido en obras cercanas',
};

/** Orden del mosaico: como se lee un expediente. */
export const ORDEN_PIEZAS: Pieza[] = ['memoria', 'presupuesto', 'metrados', 'apu', 'gastos', 'especificaciones', 'cronograma', 'formula', 'cotizaciones', 'suelos', 'planos', 'calle', 'aprendidas'];

const POR_ID: Record<string, Pieza> = {
  'V-LETRAS': 'presupuesto', 'V-RESUMEN': 'presupuesto', 'V-ARIT-TITULO': 'presupuesto', 'V-ARIT-PARTIDA': 'presupuesto', 'V-GEOMETRIA': 'presupuesto',
  'V-IMPOSIBLE': 'presupuesto', 'V-GLOBAL': 'presupuesto', 'V-LEGIBLE': 'presupuesto', 'X-SECCION': 'metrados',
  'X-MET-PRES': 'metrados', 'X-ET-PRES': 'especificaciones', 'X-ET-COBERTURA': 'especificaciones',
  'X-APU-PRES': 'apu', 'V-APU-SUMA': 'apu', 'V-APU-CUADRILLA': 'apu', 'V-APU-COEF': 'apu', 'X-GG': 'gastos',
  'X-CRONOGRAMA': 'cronograma', 'X-RENDIMIENTO': 'cronograma', 'X-FORMULA': 'formula', 'X-FECHAS': 'cotizaciones', 'D-PLANOS': 'planos',
  'X-LONGITUD': 'calle', 'D-ALCANCE': 'calle',
};
const DOC_POR_NOMBRE: [RegExp, Documento][] = [[/metrado/i, 'metrados'], [/suelo/i, 'suelos'], [/plano/i, 'planos'], [/cronograma/i, 'cronograma'], [/f[óo]rmula/i, 'formula'],
  [/especificaci/i, 'especificaciones'], [/an[áa]lisis de precios/i, 'apu'], [/gastos/i, 'gastos'], [/memoria/i, 'memoria'], [/presupuesto/i, 'presupuesto'], [/cotizaci/i, 'cotizaciones']];

export function piezaDe(d: Deteccion): Pieza {
  if (d.verificador.startsWith('A-')) return 'aprendidas';
  if (d.verificador.startsWith('C-')) return 'calle';
  if (POR_ID[d.verificador]) return POR_ID[d.verificador];
  const texto = d.verificador === 'X-IDENTIDAD' || d.verificador === 'D-CONTENIDO' ? d.titulo + ' ' + d.detalle : d.evidencias[0]?.documento ?? '';
  for (const [re, doc] of DOC_POR_NOMBRE) if (re.test(texto)) return doc;
  return 'presupuesto';
}

/** Qué pasa si no se corrige, en una frase. */
const IMPORTA: Record<string, string> = {
  'V-LETRAS': 'El monto que se licita debe ser uno solo; una diferencia abre la puerta a reclamos y nulidades.',
  'V-RESUMEN': 'Si el resumen no cuadra, el valor referencial está mal y el proceso puede observarse.',
  'V-ARIT-TITULO': 'Si los subtotales no suman, el valor referencial de la obra está mal calculado.',
  'V-ARIT-PARTIDA': 'Metrado por precio debe dar el parcial; si no, se paga de más o de menos.',
  'V-GEOMETRIA': 'Las cantidades de partidas relacionadas no son coherentes entre sí.',
  'V-IMPOSIBLE': 'Una medida imposible suele ser un error de unidad que cambia el precio.',
  'V-GLOBAL': 'Una partida global no se mide por cantidades: con más de 1 se paga de más o se confunde la valorización.',
  'V-LEGIBLE': 'Sin un presupuesto legible no se puede revisar la parte más costosa del expediente.',
  'X-MET-PRES': 'Una diferencia en las cantidades puede afectar el presupuesto y la ejecución de la obra.',
  'X-ET-PRES': 'Si dos documentos dicen distinto, en obra se discute cuál vale y la calidad queda en duda.',
  'X-ET-COBERTURA': 'Sin especificación no hay cómo exigir calidad ni recibir el trabajo.',
  'X-APU-PRES': 'El precio que se paga no es el que sustenta su análisis.',
  'V-APU-SUMA': 'El análisis de precios no suma: el precio unitario no está sustentado.',
  'V-APU-CUADRILLA': 'La mano de obra del análisis no corresponde a la cuadrilla y el rendimiento: el precio está mal.',
  'V-APU-COEF': 'Con menos materiales de los necesarios, o el precio está mal o la obra saldrá de menor calidad.',
  'X-GG': 'Se pagarían gastos generales por más tiempo del que dura la obra.',
  'X-CRONOGRAMA': 'Las actividades y sus plazos necesitan ser compatibles para sustentar la programación de la obra.',
  'X-RENDIMIENTO': 'El plazo no parece compatible con el rendimiento y los equipos previstos; conviene revisar la programación.',
  'X-FORMULA': 'La fórmula de reajuste debe cumplir el D.S. 011-79-VC; si no, los reajustes se pagan mal.',
  'X-FECHAS': 'Los precios deben ser de la fecha del presupuesto; si no, el presupuesto no es verificable.',
  'X-IDENTIDAD': 'Un estudio de otra obra no sustenta esta obra: la base técnica del diseño falla.',
  'D-PLANOS': 'Sin el plano, esa partida no se puede ejecutar ni supervisar.',
  'D-CONTENIDO': 'El expediente no cumple el contenido mínimo para aprobarse.',
  'X-SECCION': 'El corte y las capas de pavimento no son compatibles; hay que revisar la excavación o el relleno previsto.',
  'X-LONGITUD': 'Las metas podrían no corresponder a la calle real.',
  'C-DRENAJE': 'Sin drenaje, la lluvia corre por la calle y erosiona la base: la pista dura menos.',
  'C-COORDINACION': 'Si las redes de agua se hacen después, romperán la pista nueva.',
  'C-PELIGRO': 'El diseño debe considerar el peligro de la zona o la obra puede dañarse.',
  'C-AGUA': 'Cerca hay puntos críticos de ríos o quebradas: el diseño debe considerarlo.',
  'C-DUPLICIDAD': 'Podría haber otra inversión en el mismo lugar: riesgo de pagar dos veces.',
};
export const porQueImporta = (d: Deteccion) => (d.verificador.startsWith('A-') ? 'Esta condición se encontró en una obra cercana. Conviene comprobar si también afecta a este expediente.' : IMPORTA[d.verificador] ?? '');

export type Veredicto = { tono: 'devolver' | 'corregir' | 'conforme' | 'parcial'; titulo: string; texto: string };
export function veredicto(fallas: Deteccion[], parcial: boolean, rol: string, pendientes = 0, cobertura?: string[]): Veredicto {
  const altas = fallas.filter((d) => d.severidad === 'alta').length;
  const quien = rol === 'proyectista' ? 'antes de entregarlo' : 'antes de aprobarlo';
  // "Sin observaciones" solo vale si las pruebas tuvieron con qué trabajar
  if (!fallas.length && cobertura && cobertura.length === 0)
    return { tono: 'parcial', titulo: 'No pudimos revisar nada', texto: 'Ninguna prueba encontró con qué trabajar: no hay presupuesto legible, metrados, precios ni ubicación. Sube las partes del expediente (al menos el presupuesto) para revisarlo.' };
  if (!fallas.length && cobertura && cobertura.length <= 2)
    return { tono: 'parcial', titulo: 'Revisamos muy poco', texto: `Solo se pudo revisar: ${cobertura.join(' y ').toLowerCase()}. Que no haya observaciones ahí no dice nada del resto: sube más partes del expediente.` };
  if (parcial && !fallas.length) return { tono: 'parcial', titulo: 'No encontramos problemas en lo que subiste', texto: 'Pero faltan partes del expediente, así que no se pudo revisar todo. Sube el expediente completo para una revisión completa.' };
  if (altas > 0 || fallas.length >= 6)
    return { tono: 'devolver', titulo: rol === 'proyectista' ? 'Todavía no está listo para entregar' : 'Este expediente no está listo para aprobarse',
      texto: `La revisión encontró ${fallas.length} ${fallas.length === 1 ? 'observación' : 'observaciones'}${altas ? `, ${altas} de prioridad alta` : ''}. ${rol === 'proyectista' ? 'Comprueba la evidencia y corrige las inconsistencias' : 'Comprueba la evidencia y solicita las correcciones que correspondan'} ${quien}.` };
  if (fallas.length > 0) return { tono: 'corregir', titulo: 'Casi listo: faltan correcciones menores', texto: `Tiene ${fallas.length} observación${fallas.length > 1 ? 'es' : ''} sin gravedad alta. Pide corregirlas ${quien}.` };
  return { tono: 'conforme', titulo: 'No encontramos problemas', texto: pendientes ? `Ninguna de las pruebas encontró errores. Revisa igual los ${pendientes} puntos que Axis no pudo comprobar ${quien}.` : `Ninguna de las pruebas encontró errores en los documentos ni en el entorno de la calle. Puedes continuar con tu revisión técnica ${quien}.` };
}
