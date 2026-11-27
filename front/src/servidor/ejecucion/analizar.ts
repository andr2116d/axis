import type { AnalisisSolicitud, CondicionSolicitud, EjecucionMotor, Expediente, Fuente, NivelSenal, ObraEjecucion, Plazo, TipoSolicitud } from '@/dominio/tipos';
import { diasEntre, fechaCorta, fechaLarga, fechasEnTexto, sumarDias } from '@/dominio/fechas';
import { senalesEnObra } from '../aprendizaje/condiciones';
import { normalizar } from '../analisis/numeros';
import { leerPresupuesto, partidas, type ItemPresupuesto } from '../analisis/presupuesto';
import type { ModeloClasificador } from '../analisis/clasificador';
import { sugerirCausaHallazgo } from '../analisis/aprendizaje';
import { citar, compactar, plano } from '../texto';
import type { Condicion } from '../aprendizaje/condiciones';

// Motor de control de la obra. Lee lo que manda el contratista (una anotación del
// cuaderno, una solicitud, una valorización), lo clasifica, calcula los plazos que
// corren para la entidad —con lo que pasa si no responde— y lo coteja con el
// expediente técnico aprobado: si lo que alega ya estaba previsto, si la consulta ya
// tiene respuesta en el expediente, si lo valorizado coincide con lo contratado.

export interface EntradaAnalisis {
  obra: ObraEjecucion;
  expediente: Expediente;
  /** Texto por página de cada documento del expediente (mismo orden). */
  textosExpediente: string[][];
  /** Texto por página de la solicitud. */
  paginas: string[];
  nombreDocumento: string;
  unidad: string;
  fecha: string;
  tipo?: TipoSolicitud;
  modelo: ModeloClasificador;
  evidencia: (c: Condicion) => Fuente | null;
}

const PATRONES: [TipoSolicitud, RegExp][] = [
  ['ampliacion', /AMPLIACION (DE(L)? )?PLAZO/],
  ['adicional', /PRESTACION(ES)? ADICIONAL|ADICIONAL DE OBRA|DEDUCTIVO VINCULANTE|EXPEDIENTE TECNICO DEL ADICIONAL/],
  ['valorizacion', /VALORIZACION (N|NRO|NUMERO|MENSUAL|DE OBRA|\d)|METRADOS? EJECUTADOS?/],
  ['consulta', /CONSULTA|SE CONSULTA|SE SOLICITA (ACLARAR|ABSOLVER|PRECISAR)|ABSOLUCION/],
];

export function detectarTipo(texto: string): TipoSolicitud {
  const t = normalizar(texto);
  for (const [tipo, re] of PATRONES) if (re.test(t)) return tipo;
  return 'otro';
}

export const NOMBRE_TIPO: Record<TipoSolicitud, string> = {
  ampliacion: 'Solicitud de ampliación de plazo',
  consulta: 'Consulta sobre incidencias de obra',
  adicional: 'Prestación adicional de obra',
  valorizacion: 'Valorización mensual',
  otro: 'Anotación del cuaderno de incidencias',
};

const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function analizarSolicitud(e: EntradaAnalisis): AnalisisSolicitud {
  const ejecucion: EjecucionMotor[] = [];
  const medir = <T,>(motor: string, nota: (r: T) => string, f: () => T): T => {
    const t = performance.now();
    const r = f();
    ejecucion.push({ motor, estado: 'ok', ms: Math.round(performance.now() - t), nota: nota(r) });
    return r;
  };
  const texto = e.paginas.join('\n');
  const t = normalizar(texto);
  const tipo = medir('tipo-solicitud', (x) => NOMBRE_TIPO[x], () => e.tipo ?? detectarTipo(texto));
  const razones: AnalisisSolicitud['razones'] = [];
  const deficiencias: string[] = [];
  const razon = (nivel: NivelSenal, txt: string, base?: string, fuente?: Fuente) => razones.push({ nivel, texto: txt, base, fuente });

  const finContractual = sumarDias(e.obra.inicio, e.obra.plazoDias, false);

  // Condiciones de obra alegadas (napa, redes, suelo, drenaje…) y si el expediente las previó.
  const condiciones: CondicionSolicitud[] = medir('cotejo-expediente', (r) => r.length ? r.map((c) => `${c.nombre.split(' (')[0].split(':')[0]}: ${c.previsto ? 'prevista' : 'no prevista'}`).join('; ') : 'Sin condiciones de obra alegadas.', () =>
    senalesEnObra(e.paginas).map((s) => {
      const ev = e.evidencia(s.condicion);
      return { id: s.condicion.id, nombre: s.condicion.nombre, frase: s.frase, previsto: !!ev, evidencia: ev ?? undefined };
    }));

  for (const c of condiciones) {
    if (c.previsto) {
      razon(tipo === 'adicional' ? 'media' : 'alta', tipo === 'adicional'
        ? `El expediente ya tenía partidas o estudios para «${c.nombre.toLowerCase()}». Lo que pide podría ser un mayor metrado de una partida existente, no una prestación adicional.`
        : `La condición que alega («${c.nombre.toLowerCase()}») estaba prevista en el expediente técnico. Si estaba prevista, el atraso no sería una causa ajena al contratista: debe sustentar por qué, pese a eso, afecta la ruta crítica.`,
      tipo === 'adicional' ? 'Reglamento, art. 194.1 y 210.1' : 'Reglamento, art. 198.1 a', c.evidencia);
    } else {
      razon('info', `«${c.nombre}»: el expediente no tiene partidas ni estudios para esta condición. Si se confirma en campo, la causa es ajena al contratista y es una deficiencia del expediente.`, tipo === 'adicional' ? 'Reglamento, art. 194.1 i)' : 'Reglamento, art. 198.1 a');
      deficiencias.push(c.nombre);
    }
  }

  const plazos: Plazo[] = [];
  let diasSolicitados: number | undefined;
  let causal: AnalisisSolicitud['causal'];
  let respuesta: Fuente | undefined;

  if (tipo === 'ampliacion') {
    const m = /(\d{1,3})\s*(?:\([A-Z ]+\)\s*)?DIAS(?: CALENDARIO| NATURALES)?/.exec(t.slice(Math.max(0, t.search(/AMPLIACION|SOLICIT/))));
    diasSolicitados = m ? Number(m[1]) : undefined;
    causal = causalEn(texto);
    medir('requisitos-ampliacion', () => 'Contenido mínimo del art. 200.1 a.', () => {
      const faltan: string[] = [];
      if (!diasSolicitados) faltan.push('la cuantificación de los días');
      if (!causal?.inicio) faltan.push('la fecha de inicio de la causal');
      if (!causal?.fin && !/CONTINUA|NO CONCLUYE|PARCIAL/.test(t)) faltan.push('la fecha de fin de la causal (o pedir una ampliación parcial)');
      if (!/RUTA CRITICA/.test(t)) faltan.push('la afectación de la ruta crítica');
      if (!/PROGRAMA DE EJECUCION|CRONOGRAMA (ACTUALIZADO|VALORIZADO|DE OBRA)|CALENDARIO DE AVANCE|DIAGRAMA (GANTT|PERT)/.test(t)) faltan.push('el programa de ejecución actualizado');
      if (!/RIESGO/.test(t)) faltan.push('los riesgos asociados');
      if (faltan.length) razon(faltan.length >= 3 ? 'alta' : 'media', `La solicitud no incluye ${faltan.join(', ')}. El reglamento exige ese contenido; sin él la supervisión no puede verificar la ampliación.`, 'Reglamento, art. 200.1 a y 198.1');
      return faltan;
    });
    if (causal?.fin) {
      const dias = diasEntre(causal.fin, e.fecha, true);
      if (dias > 10) razon('alta', `La causal terminó el ${fechaCorta(causal.fin)} y la solicitud es del ${fechaCorta(e.fecha)}: ${dias} días hábiles después. El plazo para solicitarla es de 10 días hábiles (prorrogables 10 más si se pidió prórroga).`, 'Reglamento, art. 200.1 a');
      else razon('info', `Presentada ${dias} día(s) hábil(es) después del fin de la causal: dentro del plazo de 10 días hábiles.`, 'Reglamento, art. 200.1 a');
      if (causal.inicio && diasSolicitados) {
        const duracion = diasEntre(causal.inicio, causal.fin, false) + 1;
        if (diasSolicitados > duracion * 1.2 + 2) razon('media', `Pide ${diasSolicitados} días, pero la causal duró ${duracion} días (del ${fechaCorta(causal.inicio)} al ${fechaCorta(causal.fin)}). La ampliación se limita a lo que afecta la ruta crítica.`, 'Reglamento, art. 198.1 y 200.1 b');
      }
    }
    if (e.fecha > finContractual) razon('media', `La solicitud llega después del fin del plazo contractual (${fechaCorta(finContractual)}). Revisar si hay ampliaciones previas aprobadas.`, 'Reglamento, art. 198');
    const supervisor = sumarDias(e.fecha, 5, true);
    plazos.push({ actor: 'Supervisor', accion: 'Notificar su opinión técnica a la entidad', vence: supervisor, habiles: true, base: 'Art. 200.1 b', silencio: 'La entidad responde sin su opinión y se le aplican penalidades.' });
    plazos.push({ actor: 'Entidad', accion: 'Resolver la ampliación y notificarla por la Pladicop', vence: sumarDias(supervisor, 10, true), habiles: true, base: 'Art. 200.1 d', silencio: 'Si la entidad no se pronuncia, queda aprobado lo que informó el supervisor; si él tampoco opinó, lo que pidió el contratista.' });
  }

  if (tipo === 'consulta') {
    respuesta = medir('respuesta-en-expediente', (r) => r ? `El expediente responde la consulta (${r.documento}, ${r.pagina}).` : 'El expediente no responde la consulta de forma directa.', () => buscarRespuesta(texto, e.expediente, e.textosExpediente));
    if (respuesta) razon('media', `El expediente técnico ya responde lo que se consulta: ${respuesta.documento}, ${respuesta.pagina}. Si no implica modificar el expediente, el supervisor puede absolverla directamente.`, 'Reglamento, art. 190.1', respuesta);
    if (/MODIFICA|CAMBIO DE|CAMBIAR|REEMPLAZ|SUSTITU|VARIACION|NO COINCIDE|DISCREPAN|INCOMPATIB|ERROR EN (EL|LOS) PLANO/.test(t) && !/INFORME TECNICO/.test(t)) {
      razon('media', 'La consulta implica modificar el expediente técnico pero no adjunta informe técnico. Sin él, la consulta no se atiende.', 'Reglamento, art. 190.2');
    }
    const supervisor = sumarDias(e.fecha, 5, false);
    const proyectista = sumarDias(sumarDias(supervisor, 1, false), 10, false);
    plazos.push({ actor: 'Supervisor', accion: 'Remitir la consulta y su opinión técnica a la entidad', vence: supervisor, habiles: false, base: 'Art. 190.3 a' });
    plazos.push({ actor: 'Proyectista', accion: 'Opinar (si no pasó más de un año desde la conformidad del expediente)', vence: proyectista, habiles: false, base: 'Art. 190.3 a' });
    plazos.push({ actor: 'Entidad', accion: 'Absolver la consulta', vence: sumarDias(proyectista, 5, false), habiles: false, base: 'Art. 190.3 a', silencio: 'Si no se absuelve, el contratista puede pedir ampliación de plazo por la demora, desde que afecte la ruta crítica.' });
  }

  if (tipo === 'adicional') {
    const causa = medir('causa-adicional', (r: ReturnType<typeof sugerirCausaHallazgo>) => `Causa sugerida: ${r.causa} (${r.fuente}).`, () => sugerirCausaHallazgo(e.modelo, texto));
    razon('info', `Origen sugerido: «${causa.causa}» (${causa.fuente === 'modelo' ? `clasificador entrenado con 11,408 consultas reales${causa.probabilidad ? `, ${Math.round(causa.probabilidad * 100)} %` : ''}` : causa.motivo}).`);
    if (/YA (SE )?(HA )?EJECUT|FUERON EJECUTAD|EJECUTAD[OA]S? (PREVIAMENTE|CON ANTERIORIDAD)|REGULARIZ/.test(t)) {
      razon('alta', 'El texto indica que los trabajos ya se ejecutaron. Un adicional se aprueba con resolución previa: no puede aprobarse en vía de regularización (salvo emergencia, art. 194.4).', 'Reglamento, art. 194.1 y 194.3 (texto del DS 001-2026-EF)');
    }
    const monto = montoEn(texto);
    if (monto && e.obra.montoContrato) {
      const pct = monto / e.obra.montoContrato;
      const quien = pct <= 0.15 ? 'la autoridad de la gestión administrativa' : pct <= 0.30 ? 'el titular de la entidad' : pct <= 0.5 ? 'el titular, con autorización previa de la Contraloría' : null;
      razon(pct > 0.3 ? 'alta' : pct > 0.15 ? 'media' : 'info', quien
        ? `El adicional (${soles(monto)}) es el ${(pct * 100).toFixed(1)} % del contrato original: lo aprueba ${quien} (sumando adicionales previos y restando deductivos).`
        : `El adicional (${soles(monto)}) es el ${(pct * 100).toFixed(1)} % del contrato original: supera el máximo legal de 50 %.`, 'Ley 32069, art. 64.2 y 64.3');
    }
    if (deficiencias.length) razon('info', 'Si se aprueba por deficiencias del expediente técnico, la entidad debe informarlo al Tribunal de Contrataciones Públicas y a la Contraloría.', 'Ley 32069, art. 64.5');
    const supervisor = sumarDias(e.fecha, 5, false);
    plazos.push({ actor: 'Supervisor', accion: 'Informe técnico sobre la necesidad del adicional', vence: supervisor, habiles: false, base: 'Art. 194.2 b' });
    const exp = sumarDias(e.fecha, 15, false);
    plazos.push({ actor: 'Quien elabora el expediente del adicional', accion: 'Presentar el expediente técnico del adicional', vence: exp, habiles: false, base: 'Art. 194.2 d' });
    plazos.push({ actor: 'Entidad', accion: 'Notificar la resolución sobre el adicional', vence: sumarDias(sumarDias(exp, 10, false), 12, true), habiles: true, base: 'Art. 194.2 e y f' });
  }

  if (tipo === 'valorizacion') {
    medir('cotejo-valorizacion', (n: number) => `${n} partida(s) cotejadas con el presupuesto contractual.`, () => cotejarValorizacion(e, razon));
    const presentada = e.fecha;
    plazos.push({ actor: 'Supervisor', accion: 'Presentar su informe sobre la valorización', vence: sumarDias(presentada, 5, false), habiles: false, base: 'Art. 210.2' });
    const fin = new Date(`${presentada.slice(0, 7)}-01T12:00:00Z`);
    fin.setUTCMonth(fin.getUTCMonth() + 1);
    fin.setUTCDate(0);
    plazos.push({ actor: 'Entidad', accion: 'Evaluar y pagar la valorización', vence: fin.toISOString().slice(0, 10), habiles: false, base: 'Art. 210.3', silencio: 'El pago tardío genera intereses legales a favor del contratista y es falta grave del responsable (Ley 32069, art. 67).' });
    if (Number(presentada.slice(8, 10)) > 3) razon('info', `Presentada el ${fechaCorta(presentada)}: las valorizaciones se presentan dentro de los primeros 3 días del mes siguiente al valorizado.`, 'Reglamento, art. 210.2');
  }

  // En una consulta, que el expediente ya tenga la respuesta no es una observación: se absuelve con él.
  const graves = razones.filter((r) => (r.nivel === 'alta' || r.nivel === 'media') && !(tipo === 'consulta' && r.fuente === respuesta && respuesta)).length;
  const dictamen: AnalisisSolicitud['dictamen'] = tipo === 'otro' ? 'informar' : graves ? 'observar' : 'evaluar';
  const resumen = dictamen === 'observar'
    ? `Hay ${graves} punto(s) que observar antes de aceptarla.`
    : tipo === 'consulta' && respuesta ? `El expediente ya responde la consulta (${respuesta.documento}, ${respuesta.pagina}): puede absolverse con él.`
      : tipo === 'consulta' ? 'El expediente no la responde de forma directa: la supervisión la remite con su opinión y, si corresponde, al proyectista (art. 190.3).'
      : dictamen === 'evaluar' ? 'No se encontraron razones para observarla: puede evaluarse en el fondo.' : 'Anotación sin trámite con plazo para la entidad.';

  const analisis: AnalisisSolicitud = { tipo, resumen, dictamen, razones, condiciones, plazos, respuesta, diasSolicitados, causal, deficiencias, carta: '', ejecucion };
  analisis.carta = redactarCarta(e, analisis);
  return analisis;
}

/** Inicio y fin de la causal: «desde el 4 de mayo hasta el 18 de mayo», «inicio de la causal: …». */
function causalEn(texto: string): AnalisisSolicitud['causal'] {
  const fechas = fechasEnTexto(texto);
  const t = normalizar(texto);
  const cerca = (re: RegExp) => {
    const m = re.exec(t);
    if (!m) return undefined;
    return fechas.find((f) => f.indice >= m.index && f.indice - m.index < 80)?.fecha;
  };
  const inicio = cerca(/INICIO DE (LA )?CAUSAL|DESDE (EL )?(DIA )?|A PARTIR DEL?/);
  const fin = cerca(/FIN(AL)? DE (LA )?CAUSAL|HASTA (EL )?(DIA )?|CONCLUY[OE]|CULMIN[OA]/);
  return inicio || fin ? { inicio, fin } : undefined;
}

function montoEn(texto: string): number | null {
  const m = /S\/\.?\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{4,}(?:\.\d{1,2})?)/.exec(texto);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

const VACIAS = new Set(['DE', 'LA', 'EL', 'LOS', 'LAS', 'DEL', 'EN', 'Y', 'A', 'AL', 'CON', 'POR', 'PARA', 'QUE', 'SE', 'SU', 'ES', 'UN', 'UNA', 'O', 'LO', 'COMO', 'SEGUN', 'CUAL', 'SOLICITA', 'CONSULTA', 'CONSULTAMOS', 'OBRA', 'SUPERVISOR', 'SUPERVISION', 'CONTRATISTA', 'RESIDENTE', 'ASIENTO', 'CUADERNO', 'SENOR', 'FAVOR', 'INDICAR', 'ACLARAR', 'PRECISAR', 'DEBE', 'SI', 'NO']);
const tokens = (s: string) => plano(s).split(/[^A-Z0-9Ñ]+/).filter((p) => p.length > 2 && !VACIAS.has(p)).map((p) => p.slice(0, 6));

/**
 * ¿Dónde responde el expediente la consulta? Busca la línea que reúne más términos de la
 * consulta (pesados por rareza, como BM25) y exige que cubra buena parte de la pregunta.
 */
function buscarRespuesta(consulta: string, exp: Expediente, textos: string[][]): Fuente | undefined {
  const q = [...new Set(tokens(consulta))];
  if (q.length < 2) return undefined;
  const lineas: { doc: number; pag: number; l: string; t: Set<string> }[] = [];
  textos.forEach((doc, i) => doc.forEach((p, j) => p.split('\n').forEach((l) => { if (l.trim()) lineas.push({ doc: i, pag: j, l, t: new Set(tokens(l)) }); })));
  if (!lineas.length) return undefined;
  const df = new Map<string, number>();
  for (const x of lineas) for (const w of x.t) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + (lineas.length - (df.get(w) ?? 0) + 0.5) / ((df.get(w) ?? 0) + 0.5));
  // Las respuestas suelen estar en estudios y especificaciones más que en el presupuesto.
  const peso = (tipo: string) => (['Estudio de suelos', 'Especificaciones', 'Memoria', 'Planos'].includes(tipo) ? 1.15 : 1);
  // Solo cuentan los términos que existen en el expediente; se pesan por rareza.
  const utiles = q.filter((w) => df.has(w));
  const total = utiles.reduce((a, w) => a + idf(w), 0) || 1;
  let mejor: { x: (typeof lineas)[number]; n: number; s: number } | null = null;
  for (const x of lineas) {
    const comunes = utiles.filter((w) => x.t.has(w));
    if (comunes.length < 2) continue;
    const s = comunes.reduce((a, w) => a + idf(w), 0) * peso(exp.documentos[x.doc]?.tipo ?? '');
    if (!mejor || s > mejor.s) mejor = { x, n: comunes.length, s };
  }
  if (!mejor || mejor.n < 3 || mejor.s / total < 0.3) return undefined;
  const d = exp.documentos[mejor.x.doc];
  return { documento: d.nombre, pagina: citar(d.unidad, mejor.x.pag + 1), extracto: compactar(mejor.x.l.replace(/ \| /g, ' · ')).slice(0, 220) };
}

/** Coteja partida por partida la valorización con el presupuesto contractual (el del expediente). */
function cotejarValorizacion(e: EntradaAnalisis, razon: (n: NivelSenal, t: string, b?: string, f?: Fuente) => void): number {
  const contractual = leerPresupuesto(e.expediente.documentos.flatMap((d, i) => ['Presupuesto', 'Expediente completo'].includes(d.tipo) ? e.textosExpediente[i].map((p, j) => ({ numero: j + 1, lineas: p.split('\n') })) : []));
  const val = leerPresupuesto(e.paginas.map((p, j) => ({ numero: j + 1, lineas: p.split('\n') })));
  const base = new Map(partidas(contractual).map((i) => [i.codigo, i]));
  const items = partidas(val).filter((i) => i.metrado !== undefined);
  if (!items.length) {
    razon('media', 'Axis no pudo leer las partidas de la valorización (código, unidad, metrado, precio). Súbela exportada del software de costos o en Excel.');
    return 0;
  }
  if (!base.size) {
    razon('media', 'No se pudo leer el presupuesto contractual del expediente para cotejar la valorización.');
    return 0;
  }
  const fuente = (i: ItemPresupuesto): Fuente => ({ documento: e.nombreDocumento, pagina: citar(e.unidad, i.pagina), extracto: i.extracto.slice(0, 200) });
  const nuevas = items.filter((i) => !base.has(i.codigo));
  for (const i of nuevas.slice(0, 5)) razon('alta', `La partida ${i.codigo} «${compactar(i.descripcion)}» no está en el presupuesto contractual. Solo puede valorizarse si hay una prestación adicional aprobada.`, 'Reglamento, art. 210.1 y 194.1', fuente(i));
  for (const i of items) {
    const c = base.get(i.codigo);
    if (!c) continue;
    if (c.precio && i.precio && Math.abs(i.precio - c.precio) / c.precio > 0.005) {
      razon('alta', `${i.codigo} «${compactar(c.descripcion)}»: valoriza a ${soles(i.precio)} por ${c.unidad ?? 'unidad'}, pero el precio contractual es ${soles(c.precio)}. Se valoriza con los precios del presupuesto contractual.`, 'Reglamento, art. 210.6 y 210.7', fuente(i));
    }
    if (c.metrado && i.metrado && i.metrado > c.metrado * 1.001) {
      razon('media', `${i.codigo} «${compactar(c.descripcion)}»: valoriza ${i.metrado} ${c.unidad ?? ''} y el expediente tiene ${c.metrado}. En suma alzada no se valoriza más del metrado contractual; en precios unitarios es un mayor metrado que el supervisor debe verificar en campo.`, 'Reglamento, art. 210.6 y 210.7', fuente(i));
    }
  }
  return items.length;
}

function redactarCarta(e: EntradaAnalisis, a: AnalisisSolicitud): string {
  const o = e.obra;
  const lineas: string[] = [];
  const asunto = NOMBRE_TIPO[a.tipo].toLowerCase();
  lineas.push(`Asunto: Pronunciamiento sobre la ${asunto} presentada el ${fechaLarga(e.fecha)}.`);
  lineas.push(`Obra: «${o.nombre}». Contratista: ${o.contratista}.`);
  lineas.push('');
  lineas.push(`De la revisión de la ${asunto}, cotejada con el expediente técnico aprobado (${e.expediente.clave}), se observa lo siguiente:`);
  const puntos = a.razones.filter((r) => r.nivel !== 'info');
  if (puntos.length) {
    puntos.forEach((r, i) => lineas.push(`${i + 1}. ${r.texto}${r.fuente ? ` (${r.fuente.documento}, ${r.fuente.pagina}: «${r.fuente.extracto.slice(0, 140)}»)` : ''}${r.base ? ` [${r.base}]` : ''}`));
  } else {
    lineas.push('1. No se encontraron observaciones de forma ni de fondo en lo revisado.');
  }
  lineas.push('');
  if (a.tipo === 'ampliacion') lineas.push(a.dictamen === 'observar' ? 'Por lo expuesto, se solicita a la supervisión pronunciarse sobre los puntos señalados antes de que la entidad resuelva la solicitud.' : 'Se solicita a la supervisión emitir su opinión técnica sobre la afectación de la ruta crítica para que la entidad resuelva dentro del plazo.');
  if (a.tipo === 'consulta') lineas.push(a.respuesta ? `Se recomienda absolver la consulta conforme a lo establecido en ${a.respuesta.documento}, ${a.respuesta.pagina}.` : 'Se remite la consulta al proyectista para su opinión, conforme al art. 190.3 del Reglamento.');
  if (a.tipo === 'adicional') lineas.push('La entidad se pronunciará mediante resolución previa a la ejecución de los trabajos, una vez recibido el informe de la supervisión y el expediente técnico del adicional.');
  if (a.tipo === 'valorizacion') lineas.push('Se solicita subsanar las observaciones; la entidad pagará el monto no cuestionado dentro del plazo (art. 210.4 del Reglamento).');
  const limite = a.plazos.find((p) => p.actor === 'Entidad');
  if (limite) lineas.push(`Plazo de la entidad para pronunciarse: ${fechaLarga(limite.vence)} (${limite.base}).`);
  return lineas.join('\n');
}
