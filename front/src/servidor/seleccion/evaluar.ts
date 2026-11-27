import type { EjecucionMotor, Postor, ProcesoSeleccion, ResultadoSeleccion, SenalSeleccion } from '@/dominio/tipos';
import { diasEntre } from '@/dominio/fechas';
import { antecedentesDe, historialDe, inhabilitado, type DatosCompetencia, type IndiceProveedores } from './antecedentes';

// Motor de la fase de selección. Primero aplica la ley tal cual: admite las ofertas
// dentro del rango, ordena por puntaje y resuelve empates (art. 81). Ese ganador no lo
// cambia Axis: los evaluadores deciden con autonomía (art. 56.6). Después corre las
// señales sobre cada postor y sobre el proceso, cada una con su base legal y con quién
// debe actuar: la DEC en la verificación posterior (art. 83), el área usuaria en las
// próximas bases (art. 72.3 d) o la entidad ante Indecopi (Ley 32069, DCF 24.ª).

const RANGO = { min: 0.95, max: 1.10 };
const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (s: string) => s.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim();

export interface Datos { idx: IndiceProveedores; comp: DatosCompetencia }

export function evaluarProceso(p: Omit<ProcesoSeleccion, 'resultado' | 'id' | 'clave' | 'creado'>, datos: Datos): ResultadoSeleccion {
  const ejecucion: EjecucionMotor[] = [];
  const medir = <T,>(motor: string, nota: (r: T) => string, f: () => T): T => {
    const t = performance.now();
    const r = f();
    ejecucion.push({ motor, estado: 'ok', ms: Math.round(performance.now() - t), nota: nota(r) });
    return r;
  };
  const senales: SenalSeleccion[] = [];
  const agregar = (s: Omit<SenalSeleccion, 'id'>) => senales.push({ ...s, id: `S-${String(senales.length + 1).padStart(2, '0')}` });

  // 1. Admisión y orden según la ley.
  const { orden, ganador, desempate } = medir('orden-legal', (r) => `${r.orden.filter((o) => o.admitida).length} de ${p.postores.length} ofertas admitidas.${r.desempate ? ' Hubo empate.' : ''}`, () => ordenLegal(p, (x) => x.integrantes.find((m) => inhabilitado(m.ruc, p.fechaBuenaPro, datos.idx))?.nombre));

  // 2. Antecedentes de cada integrante (datos OECE reales).
  medir('antecedentes-oece', () => `${p.postores.reduce((s, x) => s + x.integrantes.length, 0)} RUC consultados en ${Object.keys(datos.idx.porRuc).length.toLocaleString('es-PE')} proveedores con antecedentes.`, () => {
    for (const x of p.postores) for (const m of x.integrantes) for (const s of antecedentesDe(m.ruc, m.nombre, p.fechaBuenaPro, datos.idx)) agregar({ ...s, postor: x.id });
  });
  medir('historial-obras', () => `${datos.comp.procesos.length.toLocaleString('es-PE')} obras de La Libertad (OCDS) revisadas.`, () => {
    for (const x of p.postores) for (const m of x.integrantes) for (const s of historialDe(m.ruc, m.nombre, p.fechaBuenaPro, datos.comp)) agregar({ ...s, postor: x.id });
  });

  // 3. Consorcios: quién aporta la experiencia y quién tiene la participación.
  medir('consorcios', () => 'Participación frente a experiencia aportada.', () => {
    for (const x of p.postores) for (const s of senalesConsorcio(x, p)) agregar({ ...s, postor: x.id });
  });

  // 4. Vínculos entre postores que compiten (posible concertación).
  medir('vinculos', (n: number) => n ? `${n} vínculo(s) entre postores.` : 'Sin vínculos entre postores.', () => {
    const antes = senales.length;
    for (const s of vinculos(p.postores)) agregar(s);
    return senales.length - antes;
  });

  // 5. Señales del proceso: competencia y ofertas.
  medir('senales-proceso', () => 'Competencia, dispersión de ofertas y concentración.', () => {
    for (const s of senalesProceso(p, orden, ganador, datos.comp)) agregar(s);
  });

  const recomendaciones = medir('recomendaciones', (r: ResultadoSeleccion['recomendaciones']) => `${r.length} recomendación(es).`, () => recomendar(p, ganador, senales));
  return { orden, ganador, desempate, senales, recomendaciones, ejecucion };
}

function ordenLegal(p: Pick<ProcesoSeleccion, 'postores' | 'valorReferencial' | 'procedimiento'>, impedido: (x: Postor) => string | undefined): Pick<ResultadoSeleccion, 'orden' | 'ganador' | 'desempate'> {
  const vr = p.valorReferencial;
  const admitidas: Postor[] = [];
  const orden: ResultadoSeleccion['orden'] = [];
  for (const x of p.postores) {
    const r = x.oferta / vr;
    const ok = r >= RANGO.min && r <= RANGO.max;
    const sancionado = impedido(x);
    if (sancionado) orden.push({ postor: x.id, puesto: null, admitida: false, motivo: `${sancionado} tiene una inhabilitación vigente del Tribunal: está impedido de ser postor (Ley 32069, art. 30).` });
    else if (ok) admitidas.push(x);
    else orden.push({ postor: x.id, puesto: null, admitida: false, motivo: `Oferta de ${soles(x.oferta)} (${(r * 100).toFixed(1)} % del valor referencial): fuera del rango de 95 % a 110 % que fijan las bases estándar de obras.` });
  }
  let desempate: string | undefined;
  const ordenadas = [...admitidas].sort((a, b) => b.puntajeTotal - a.puntajeTotal);
  const empatados = ordenadas.filter((x) => ordenadas[0] && x.puntajeTotal === ordenadas[0].puntajeTotal);
  if (empatados.length > 1) {
    const nombres = empatados.map((x) => x.nombre).join(' y ');
    if (p.procedimiento === 'licitacion') {
      desempate = `${nombres} empatan con ${empatados[0].puntajeTotal} puntos. En una licitación pública sin modalidad el empate se resuelve por sorteo en el SEACE (bases estándar): Axis no elige.`;
    } else {
      const criterios: [string, (x: Postor) => number][] = [
        ['mejor puntaje técnico', (x) => x.puntajeTecnico ?? 0],
        ['micro o pequeña empresa integrada por personas con discapacidad', (x) => Number(!!x.mypeDiscapacidad)],
        ['micro o pequeña empresa', (x) => Number(!!x.mype)],
      ];
      let grupo = empatados;
      for (const [nombre, valor] of criterios) {
        const mejor = Math.max(...grupo.map(valor));
        const quedan = grupo.filter((x) => valor(x) === mejor);
        if (quedan.length < grupo.length) {
          grupo = quedan;
          if (grupo.length === 1) { desempate = `${nombres} empatan con ${empatados[0].puntajeTotal} puntos. Gana ${grupo[0].nombre} por ${nombre} (Reglamento, art. 81).`; break; }
        }
      }
      if (grupo.length > 1) desempate = `${nombres} siguen empatados después de los criterios del art. 81 (puntaje técnico y condición MYPE): corresponde sorteo en el SEACE.`;
      else if (!desempate) desempate = `${nombres} empatan con ${empatados[0].puntajeTotal} puntos.`;
      // Reordena para que el ganador del desempate vaya primero.
      if (grupo.length === 1) ordenadas.splice(ordenadas.indexOf(grupo[0]), 1), ordenadas.unshift(grupo[0]);
    }
  }
  const sorteo = empatados.length > 1 && (p.procedimiento === 'licitacion' || !!desempate?.includes('sorteo'));
  ordenadas.forEach((x, i) => orden.push({ postor: x.id, puesto: sorteo && empatados.includes(x) ? 1 : i + 1, admitida: true }));
  orden.sort((a, b) => (a.puesto ?? 99) - (b.puesto ?? 99));
  return { orden, ganador: ordenadas.length && !sorteo ? ordenadas[0].id : null, desempate };
}

type SinId = Omit<SenalSeleccion, 'id' | 'postor'>;

function senalesConsorcio(x: Postor, p: Pick<ProcesoSeleccion, 'minimoParticipacion' | 'fechaBuenaPro'>): SinId[] {
  const out: SinId[] = [];
  const total = x.integrantes.reduce((s, m) => s + (m.experiencia || 0), 0);
  const suma = x.integrantes.reduce((s, m) => s + m.participacion, 0);
  if (x.integrantes.length > 1 && Math.abs(suma - 100) > 0.5) {
    out.push({ nivel: 'media', titulo: `${x.nombre}: las participaciones suman ${suma} %`, detalle: 'Las obligaciones de la promesa de consorcio deben sumar 100 %.', accion: 'Revisar la promesa de consorcio en la admisión.', base: 'Reglamento, art. 89.1', fuente: 'Promesa de consorcio' });
  }
  if (x.integrantes.length > 1 && total > 0) {
    const experto = [...x.integrantes].sort((a, b) => b.experiencia - a.experiencia)[0];
    const parte = experto.experiencia / total;
    if (p.minimoParticipacion && experto.participacion < p.minimoParticipacion) {
      out.push({ nivel: 'alta', titulo: `${x.nombre}: quien aporta la experiencia no llega al mínimo de las bases`, detalle: `${experto.nombre} aporta el ${Math.round(parte * 100)} % de la experiencia con ${experto.participacion} % de participación; las bases exigen ${p.minimoParticipacion} %.`, accion: 'No cumple un requisito de calificación: el evaluador debe descalificar la oferta.', base: 'Reglamento, art. 72.3 d', fuente: 'Bases y promesa de consorcio' });
    } else if (parte >= 0.7 && experto.participacion <= 20) {
      out.push({ nivel: 'media', titulo: `${x.nombre}: la experiencia la pone un socio con ${experto.participacion} % de participación`, detalle: `${experto.nombre} aporta el ${Math.round(parte * 100)} % de la experiencia acreditada (${soles(experto.experiencia)}) pero solo tiene el ${experto.participacion} % de las obligaciones. Es legal si las bases no fijan un mínimo, pero quien ejecutará la mayor parte de la obra no es quien tiene la experiencia.`, accion: 'Verificar que la experiencia es de obras ejecutadas por ese integrante (solo cuenta la de quien ejecuta conjuntamente) y que sus constancias son auténticas.', base: 'Reglamento, art. 72.3 c y art. 83', fuente: 'Promesa de consorcio y anexos de experiencia' });
    }
  }
  for (const m of x.integrantes) {
    if (!m.inicio || m.participacion < 50) continue;
    const meses = diasEntre(m.inicio, p.fechaBuenaPro, false) / 30.4;
    if (meses < 24) {
      out.push({ nivel: m.experiencia > 0 ? 'media' : 'alta', titulo: `${x.nombre}: ${m.nombre} tiene ${Math.max(0, Math.round(meses))} meses de actividad y ${m.participacion} % de la obra`, detalle: `Inició actividades el ${m.inicio}${m.experiencia ? ` y declara ${soles(m.experiencia)} de experiencia` : ' y no declara experiencia propia'}. Llevará la mayor parte de las obligaciones del contrato.`, accion: 'Verificar en SUNAT y SUNARP la fecha de constitución, el domicilio y los socios; confirmar la capacidad libre de contratación en el RNP.', base: 'Reglamento, art. 83 (verificación posterior) y art. 29 (capacidad libre de contratación)', fuente: 'Datos declarados del integrante' });
    }
  }
  return out;
}

function vinculos(postores: Postor[]): Omit<SenalSeleccion, 'id'>[] {
  const out: Omit<SenalSeleccion, 'id'>[] = [];
  for (let i = 0; i < postores.length; i += 1) {
    for (let j = i + 1; j < postores.length; j += 1) {
      const a = postores[i];
      const b = postores[j];
      const lazos: string[] = [];
      if (a.domicilio && b.domicilio && norm(a.domicilio) === norm(b.domicilio)) lazos.push(`el mismo domicilio (${a.domicilio})`);
      if (a.representante && b.representante && norm(a.representante) === norm(b.representante)) lazos.push(`el mismo representante (${a.representante})`);
      const apoderados = (a.apoderados ?? []).filter((x) => (b.apoderados ?? []).some((y) => norm(x) === norm(y)) && !(a.representante && norm(a.representante) === norm(x)));
      if (apoderados.length) lazos.push(`el mismo apoderado (${apoderados.join(', ')})`);
      if (a.telefono && b.telefono && a.telefono.replace(/\D/g, '') === b.telefono.replace(/\D/g, '') && a.telefono.replace(/\D/g, '').length >= 6) lazos.push(`el mismo teléfono (${a.telefono})`);
      const rucs = a.integrantes.filter((m) => b.integrantes.some((n) => n.ruc === m.ruc)).map((m) => m.nombre);
      if (rucs.length) lazos.push(`integrantes en común (${rucs.join(', ')})`);
      const personal = a.personal.filter((n) => b.personal.some((m) => norm(m) === norm(n)));
      if (personal.length) lazos.push(`el mismo personal clave (${personal.join(', ')})`);
      if (!lazos.length) continue;
      const fuerte = lazos.length > 1 || rucs.length > 0 || lazos.some((l) => l.includes('representante') || l.includes('apoderado'));
      out.push({
        postor: a.id,
        nivel: fuerte || personal.length ? 'alta' : 'media',
        titulo: `${a.nombre} y ${b.nombre} compiten pero comparten ${lazos.length > 1 ? 'varios datos' : lazos[0].split(' (')[0]}`,
        detalle: `Comparten ${lazos.join('; ')}. Dos postores que compiten no deberían tener esos lazos.${rucs.length ? ' Además, un integrante no puede estar en dos ofertas del mismo procedimiento.' : ''}`,
        accion: rucs.length
          ? 'Un integrante no puede presentar más de una oferta en el mismo procedimiento: el evaluador no debe admitir esas ofertas. Además, remitir la información a Indecopi.'
          : 'No cambia el resultado por sí solo. La entidad debe remitir la información a la Secretaría Técnica de Libre Competencia de Indecopi, en reserva, para que evalúe una posible concertación.',
        base: rucs.length ? 'Reglamento, art. 69 (contenido de las ofertas) y Ley 32069, DCF 24.ª' : 'Ley 32069, disposición complementaria final 24.ª',
        fuente: [a.archivo, b.archivo].every(Boolean) ? `Anexo 1 y vigencia de poder de ${a.archivo} y ${b.archivo}` : 'Datos declarados en las ofertas',
      });
    }
  }
  return out;
}

function senalesProceso(p: Pick<ProcesoSeleccion, 'postores' | 'valorReferencial' | 'entidad'>, orden: ResultadoSeleccion['orden'], ganador: string | null, comp: DatosCompetencia): Omit<SenalSeleccion, 'id'>[] {
  const out: Omit<SenalSeleccion, 'id'>[] = [];
  const admitidas = p.postores.filter((x) => orden.find((o) => o.postor === x.id)?.admitida);
  const R = comp.referencia;
  if (admitidas.length === 1) {
    out.push({ nivel: 'media', titulo: 'Una sola oferta válida', detalle: `Sin competencia, el precio no se contrasta. En La Libertad la mediana es de ${R.participantes.mediana} participantes por obra y solo el ${(R.participantes.unico * 100).toFixed(1)} % tuvo uno (OCP, bandera «un solo postor»).`, accion: 'Si se repite en la entidad, revisar si los requisitos de las bases limitaron la competencia antes de la próxima convocatoria.', base: 'Ley 32069, art. 5 j) (principio de competencia)', fuente: 'OECE – Contrataciones Abiertas (OCDS)' });
  }
  if (admitidas.length >= 3) {
    const montos = admitidas.map((x) => x.oferta);
    const dispersion = (Math.max(...montos) - Math.min(...montos)) / p.valorReferencial;
    if (dispersion < 0.01) out.push({ nivel: 'media', titulo: `Las ${admitidas.length} ofertas están a menos de 1 % entre sí`, detalle: `La diferencia entre la oferta más alta y la más baja es ${(dispersion * 100).toFixed(2)} % del valor referencial. Ofertas casi idénticas son una señal de ofertas de cobertura.`, accion: 'Revisar junto con los vínculos entre postores; si hay indicios, remitir a Indecopi.', base: 'Ley 32069, DCF 24.ª', fuente: 'Ofertas económicas' });
    const enTope = admitidas.filter((x) => x.id !== ganador && x.oferta / p.valorReferencial >= 1.095);
    if (enTope.length >= 2) out.push({ nivel: 'media', titulo: `${enTope.length} postores ofertaron en el tope de 110 %`, detalle: `${enTope.map((x) => x.nombre).join(', ')} ofertaron casi en el máximo permitido sin opción real de ganar. Puede indicar ofertas presentadas solo para aparentar competencia.`, accion: 'Revisar junto con los vínculos entre postores.', base: 'Ley 32069, DCF 24.ª', fuente: 'Ofertas económicas' });
  }
  const ganadorPostor = p.postores.find((x) => x.id === ganador);
  const c = p.entidad ? comp.concentracion[p.entidad.toUpperCase()] : undefined;
  if (c && ganadorPostor && ganadorPostor.integrantes.some((m) => m.ruc === c.mayor) && c.parteMayor >= 0.5) {
    out.push({ postor: ganadorPostor.id, nivel: 'media', titulo: `El ganador ya concentra el ${Math.round(c.parteMayor * 100)} % de lo adjudicado por la entidad`, detalle: `De ${c.obras} obras adjudicadas por ${p.entidad} (2025-2026), ${c.obrasMayor} fueron para el mismo proveedor.`, accion: 'No prueba irregularidad; es un patrón que el OCI revisa. Dejar constancia.', base: 'Ley 32069, art. 5 j) (competencia)', fuente: 'OECE – Contrataciones Abiertas (OCDS)' });
  }
  return out;
}

function recomendar(p: Pick<ProcesoSeleccion, 'postores' | 'minimoParticipacion'>, ganador: string | null, senales: SenalSeleccion[]): ResultadoSeleccion['recomendaciones'] {
  const out: ResultadoSeleccion['recomendaciones'] = [];
  const g = p.postores.find((x) => x.id === ganador);
  const delGanador = senales.filter((s) => s.postor === ganador && s.nivel !== 'info');
  if (g) {
    out.push({
      para: 'Evaluadores (comité u oficial de compra)',
      texto: `Por ley la buena pro corresponde a ${g.nombre}. Axis no cambia ese resultado: las señales de abajo sirven para revisar la oferta a fondo, no para elegir a otro postor.`,
      base: 'Reglamento, art. 56.6',
    });
    if (delGanador.length) {
      out.push({
        para: 'DEC (dependencia encargada de las contrataciones)',
        texto: `Dentro de los 10 días hábiles siguientes al consentimiento de la buena pro, iniciar la verificación posterior de la oferta de ${g.nombre}, con prioridad en: ${delGanador.map((s) => s.titulo.replace(`${g.nombre}: `, '').toLowerCase()).join('; ')}. Si se comprueba información inexacta o falsa, se puede declarar la nulidad de la buena pro o del contrato y se comunica al Tribunal.`,
        base: 'Reglamento, art. 83',
      });
    }
  }
  if (senales.some((s) => /concertaci|Indecopi/.test(s.accion))) {
    out.push({ para: 'Entidad', texto: 'Remitir la información de los vínculos entre postores a la Secretaría Técnica de la Comisión de Defensa de la Libre Competencia de Indecopi. La remisión es reservada y no se notifica a los postores.', base: 'Ley 32069, DCF 24.ª' });
  }
  if (!p.minimoParticipacion && senales.some((s) => s.titulo.includes('socio con'))) {
    out.push({ para: 'Área usuaria (próximas bases)', texto: 'Fijar en las bases un porcentaje mínimo de participación para el integrante que acredita la experiencia (por ejemplo 30 % a 40 %). Así la experiencia la aporta quien realmente ejecuta.', base: 'Reglamento, art. 72.3 d' });
  }
  if (senales.some((s) => s.nivel === 'alta' && /corrupci/i.test(s.accion))) {
    out.push({ para: 'Evaluadores', texto: 'Comunicar a la autoridad competente cualquier acto de corrupción del que se tome conocimiento.', base: 'Reglamento, art. 56.8' });
  }
  return out;
}
