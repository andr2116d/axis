import 'server-only';
import type { DatosCarta, Documento, EjecucionMotor, Expediente, Hallazgo, Justificacion, Prioridad, ResultadoPrueba, Semaforo, TipoDocumento } from '@/dominio/tipos';
import { CAMPOS_CARTA, TIPOS_DOCUMENTO } from '@/dominio/tipos';
import * as almacen from './almacen';
import type { ArchivoEntrante } from './http';
import { leerDocumento } from './motores/lectura';
import { clasificarDocumentoExpediente } from './motores/clasificacion';
import { identidadDeDocumento, motorIdentidad, nombreDeObra } from './motores/identidad';
import { motorUbicacion } from './motores/ubicacion';
import { motorCobertura } from './motores/cobertura';
import type { ContextoExpediente, HallazgoNuevo } from './motores/tipos';
import { correrVerificadores, partesConPaginas, partesDeArchivo, type AnalisisVerificadores } from './analisis/adaptador';
import { evaluarPrueba, hallazgoDePrueba, type ObraEvaluada } from './aprendizaje/pruebas';
import { frase, nombrePropio } from './texto';
import { VERIFICADORES } from '@/datos/verificadores';
import { faltantes } from './aprendizaje/biblioteca';
import { seleccionarPruebas } from './aprendizaje/seleccion';
import { claveHallazgo } from '@/dominio/semaforo';

// Servicio del evaluador: recibe un expediente, lo lee y clasifica (paso 1), y
// después de que la persona confirma los tipos, corre los motores (paso 2).

const SIN_NOMBRE = 'Expediente sin nombre de obra';

const ORDEN_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, confirmar: 2 };

async function medir<T>(motor: string, ejecucion: EjecucionMotor[], fn: () => Promise<T>): Promise<T> {
  const inicio = performance.now();
  try {
    const r = await fn();
    ejecucion.push({ motor, estado: 'ok', ms: Math.round(performance.now() - inicio) });
    return r;
  } catch (error) {
    ejecucion.push({ motor, estado: 'error', ms: Math.round(performance.now() - inicio), nota: (error as Error).message });
    throw error;
  }
}

export async function recibirExpediente(archivos: ArchivoEntrante[], opciones: { versionDe?: string } = {}): Promise<Expediente> {
  const anterior = opciones.versionDe ? await almacen.leerExpediente(opciones.versionDe) : null;
  if (opciones.versionDe && !anterior) throw new Error('No se encontró la versión anterior del expediente.');
  const id = almacen.nuevoId();
  const clave = await almacen.siguienteClave('expedientes', 'EXP');
  const ejecucion: EjecucionMotor[] = [];
  const documentos: Documento[] = [];
  const identidades = [];

  for (const archivo of archivos) {
    const docId = almacen.nuevoId();
    const { datos } = archivo;
    await almacen.guardarArchivo('expedientes', id, docId, datos);
    const lectura = await medir('lectura', ejecucion, () => leerDocumento(archivo.nombre, datos));
    await almacen.guardarTexto('expedientes', id, docId, lectura.paginas);
    const sugerencia = await medir('clasificacion-documental', ejecucion, async () => {
      // Un PDF que trae varias partes (memoria, presupuesto, metrados…) es el expediente completo.
      const partes = partesDeArchivo(lectura.paginas);
      if (partes.length >= 3) return { tipo: 'Expediente completo' as TipoDocumento, confianza: 0.95, razon: `Contiene ${partes.length} partes: ${partes.join(', ').toLowerCase()}.` };
      return clasificarDocumentoExpediente(archivo.nombre, lectura.paginas);
    });
    identidades.push(identidadDeDocumento(lectura.paginas));
    documentos.push({
      id: docId, nombre: archivo.nombre, bytes: datos.byteLength,
      tipo: sugerencia.tipo, sugerencia,
      lectura: lectura.estado, paginas: lectura.paginas.length, paginasConTexto: lectura.paginasConTexto, unidad: lectura.unidad,
      partes: partesConPaginas(lectura.paginas),
    });
  }

  const expediente: Expediente = {
    id,
    clave,
    nombre: nombreDeObra(identidades) ?? SIN_NOMBRE,
    lugar: null,
    territorio: null,
    ubicacion: null,
    semaforo: 'gris',
    cobertura: [],
    creado: new Date().toISOString(),
    estado: 'por-confirmar',
    documentos,
    hallazgos: [],
    ejecucion: resumir(ejecucion),
    carta: anterior ? { ...anterior.carta, incluidos: [] } : { incluidos: [], destinatario: '' },
    ...(anterior ? { versionDe: anterior.id, version: (anterior.version ?? 1) + 1, elaboradoPor: anterior.elaboradoPor } : {}),
  };
  // La versión corregida conserva el nombre de la obra si la lectura no lo encontró.
  if (anterior && expediente.nombre === SIN_NOMBRE) expediente.nombre = anterior.nombre;
  await almacen.guardarExpediente(expediente);
  return expediente;
}

export async function analizarExpediente(id: string, tipos: Record<string, string>): Promise<Expediente> {
  const expediente = await almacen.leerExpediente(id);
  if (!expediente) throw new Error('Expediente no encontrado');

  for (const d of expediente.documentos) {
    const tipo = tipos[d.id];
    if (tipo && (TIPOS_DOCUMENTO as readonly string[]).includes(tipo)) d.tipo = tipo as TipoDocumento;
  }

  const textos = await Promise.all(expediente.documentos.map((d) => almacen.leerTexto('expedientes', id, d.id)));
  const porDoc = new Map(expediente.documentos.map((d, i) => [d.id, textos[i]]));
  const nuevos: HallazgoNuevo[] = [];
  const ejecucion = expediente.ejecucion.filter((e) => e.motor === 'lectura' || e.motor === 'clasificacion-documental');
  const ctx: ContextoExpediente = {
    expediente,
    texto: async (docId) => porDoc.get(docId) ?? [],
    reportar: (h) => nuevos.push(h),
    reportados: () => nuevos,
    fijar: (datos) => Object.assign(expediente, datos),
  };
  const correr = async (motor: string, fn: () => Promise<{ estado: 'ok' | 'sin-datos'; nota?: string }>) => {
    const inicio = performance.now();
    try {
      const r = await fn();
      ejecucion.push({ motor, estado: r.estado, ms: Math.round(performance.now() - inicio), nota: r.nota });
    } catch (error) {
      // Un motor que falla no detiene a los demás; queda registrado.
      ejecucion.push({ motor, estado: 'error', ms: Math.round(performance.now() - inicio), nota: (error as Error).message });
    }
  };

  // 1. Identidad y ubicación declarada (distrito, departamento).
  await correr('identidad', () => motorIdentidad.ejecutar(ctx));
  await correr('ubicacion', () => motorUbicacion.ejecutar(ctx));

  // 2. Verificadores: presupuesto, metrados, APU, especificaciones, cronograma, planos y territorio.
  let analisis: AnalisisVerificadores | null = null;
  await correr('verificadores', async () => {
    analisis = correrVerificadores(expediente.documentos, textos);
    const g = analisis.resultado.generales;
    nuevos.push(...analisis.hallazgos);
    ctx.partes = analisis.partes;
    if (g.ubicacion) expediente.ubicacion = { punto: g.ubicacion, distrito: g.distrito ? nombrePropio(g.distrito) : null, estimada: !!g.ubicacionEstimada };
    else if (expediente.lugar) expediente.ubicacion = null;
    if (expediente.nombre === SIN_NOMBRE && g.nombre) expediente.nombre = frase(g.nombre);
    expediente.cobertura = analisis.resultado.cobertura;
    const c = analisis.resultado.conteos;
    return { estado: 'ok', nota: `${c.partidas} partidas, ${c.metrados} metrados, ${c.apus} APU, ${c.especificaciones} especificaciones, ${c.actividades} actividades de cronograma leídas; ${analisis.hallazgos.length} observación(es).` };
  });

  // 3. Contenido mínimo y lectura incompleta.
  await correr('cobertura', () => motorCobertura.ejecutar(ctx));

  // 4. Pruebas aprendidas de obras terminadas y paralizadas.
  let totalAprendidas = 0;
  let aplicadasAprendidas = 0;
  const resultadosAprendidas: ResultadoPrueba[] = [];
  await correr('antecedentes', async () => {
    const pruebas = (await almacen.listarPruebas()).filter((p) => p.estado === 'aceptada');
    if (!pruebas.length) return { estado: 'sin-datos', nota: 'Todavía no hay pruebas aprendidas aceptadas.' };
    const obra = obraEvaluada(expediente, analisis);
    let aplican = 0;
    let alertan = 0;
    totalAprendidas = pruebas.length;
    for (const p of pruebas) {
      const v = evaluarPrueba(p, obra);
      resultadosAprendidas.push({ id: p.id, nombre: p.nombre, origen: 'obra', estado: !v.aplica ? 'no-aplica' : v.dispara ? 'observa' : 'pasa', motivo: !v.aplica ? v.motivo : !v.dispara ? `el expediente tiene ${v.evidencia}` : undefined });
      if (!v.aplica) continue;
      aplican += 1;
      if (v.dispara) { alertan += 1; nuevos.push(hallazgoDePrueba(p, v)); }
    }
    aplicadasAprendidas = aplican;
    return { estado: 'ok', nota: `${pruebas.length} prueba(s) aprendida(s): ${aplican} aplican a esta obra, ${alertan} alertan.` };
  });

  // Resultado de cada prueba: observa, pasa o no aplica (y por qué).
  const av = analisis as AnalisisVerificadores | null;
  const condiciones = {
    partes: new Set<string>([...(av?.partes ?? []), ...expediente.documentos.map((d) => d.tipo)]),
    ubicacion: !!expediente.ubicacion,
    cotizaciones: (av?.resultado.conteos.cotizaciones ?? 0) > 0,
  };
  const iniciales: ResultadoPrueba[] = VERIFICADORES.filter((v) => v.tipo !== 'proveedor').map((v) => {
    const suyos = nuevos.filter((h) => h.prueba === v.id);
    const falta = faltantes(v.documentos, condiciones);
    const estado: ResultadoPrueba['estado'] = suyos.some((h) => h.prioridad !== 'confirmar') ? 'observa'
      : suyos.length ? 'confirmar'
        : av?.ejecutadas.has(v.id) || !falta.length ? 'pasa' : 'no-aplica';
    return { id: v.id, nombre: v.nombre, origen: 'entrenamiento', estado, motivo: estado === 'no-aplica' ? `falta: ${falta.join(', ').toLowerCase()}` : undefined };
  });
  // El modelo decide qué pruebas valen la pena para esta obra (simulado, ver seleccion.ts).
  const inicioSeleccion = performance.now();
  expediente.resultadoPruebas = seleccionarPruebas(expediente, [...resultadosAprendidas, ...iniciales]);
  const descartadas = expediente.resultadoPruebas.filter((r) => r.estado === 'descartada').length;
  ejecucion.push({ motor: 'seleccion-pruebas', estado: 'ok', ms: Math.round(performance.now() - inicioSeleccion), nota: descartadas ? `${descartadas} prueba(s) no pertinentes para esta obra.` : 'El expediente pide todas las pruebas.' });
  const aplicadas = expediente.resultadoPruebas.filter((r) => r.estado !== 'no-aplica' && r.estado !== 'descartada').length;
  expediente.pruebas = { aplicadas, total: iniciales.length + totalAprendidas };

  const inicio = performance.now();
  expediente.hallazgos = consolidar(nuevos);
  expediente.semaforo = semaforo(expediente);
  ejecucion.push({ motor: 'consolidacion', estado: 'ok', ms: Math.round(performance.now() - inicio), nota: `${expediente.hallazgos.length} hallazgo(s).` });

  expediente.ejecucion = ejecucion;
  expediente.estado = 'analizado';
  expediente.carta = { ...expediente.carta, incluidos: expediente.hallazgos.map((h) => h.id) };
  await heredarJustificaciones(expediente);
  await almacen.guardarExpediente(expediente);
  return expediente;
}

/**
 * En una versión corregida, las alertas que siguen y que el evaluador ya había justificado
 * (y Axis aceptado) conservan esa justificación: no se pide dos veces lo mismo.
 */
async function heredarJustificaciones(e: Expediente) {
  if (!e.versionDe) return;
  const anterior = await almacen.leerExpediente(e.versionDe);
  if (!anterior?.justificaciones?.length) return;
  const porClave = new Map(anterior.hallazgos.map((h) => [claveHallazgo(h), h.id]));
  const heredadas: Justificacion[] = [];
  for (const h of e.hallazgos) {
    const previo = porClave.get(claveHallazgo(h));
    const j = previo ? anterior.justificaciones.find((x) => x.hallazgo === previo && x.evaluacion.veredicto === 'aceptada') : undefined;
    if (!j) continue;
    heredadas.push({ ...j, hallazgo: h.id, documento: undefined, evaluacion: { ...j.evaluacion, razones: [...j.evaluacion.razones, `Aceptada en la versión ${anterior.version ?? 1} (${anterior.clave}).`] } });
  }
  e.justificaciones = heredadas;
  e.carta.incluidos = e.carta.incluidos.filter((id) => !heredadas.some((j) => j.hallazgo === id));
}

/** Datos de un expediente que necesitan las pruebas aprendidas. */
export function obraEvaluada(e: Expediente, analisis: AnalisisVerificadores | null, textos?: string[][]): ObraEvaluada {
  const texto = (...tipos: TipoDocumento[]) => analisis
    ? analisis.textoDe(...tipos)
    : e.documentos.map((d, i) => (tipos.includes(d.tipo) || d.tipo === 'Expediente completo' ? (textos?.[i] ?? []).join('\n') : '')).join('\n');
  return {
    id: e.id,
    ubicacion: e.ubicacion?.punto ?? null,
    distrito: e.ubicacion?.distrito ?? e.lugar?.split(',')[0] ?? null,
    textoPartidas: texto('Presupuesto', 'Metrados', 'Precios unitarios'),
    textoEstudios: texto('Memoria', 'Estudio de suelos', 'Especificaciones', 'Planos'),
  };
}

/** Rojo: algo grave. Amarillo: observaciones o puntos por confirmar. Verde: nada que observar en lo que se pudo revisar. Gris: no se pudo revisar. */
function semaforo(e: Expediente): Semaforo {
  if (e.hallazgos.some((h) => h.prueba === 'D-PERTINENCIA') || (e.hallazgos.some((h) => h.titulo.startsWith('Los archivos no parecen')))) return 'gris';
  if (e.hallazgos.some((h) => h.prioridad === 'alta')) return 'rojo';
  if (e.hallazgos.length || !e.cobertura.length) return 'amarillo';
  return 'verde';
}

export async function actualizarCarta(id: string, cambios: Partial<DatosCarta> & { elaboradoPor?: string }) {
  const expediente = await almacen.leerExpediente(id);
  if (!expediente) throw new Error('Expediente no encontrado');
  if (cambios.elaboradoPor === 'entidad' || cambios.elaboradoPor === 'consultor') expediente.elaboradoPor = cambios.elaboradoPor;
  const validos = new Set(expediente.hallazgos.map((h) => h.id));
  if (cambios.incluidos) expediente.carta.incluidos = cambios.incluidos.filter((h) => validos.has(h));
  for (const campo of CAMPOS_CARTA) {
    const v = cambios[campo];
    if (typeof v === 'string') expediente.carta[campo] = v.slice(0, 200);
  }
  if (typeof cambios.plazo === 'number' && cambios.plazo >= 1 && cambios.plazo <= 60) expediente.carta.plazo = Math.round(cambios.plazo);
  if (typeof cambios.plazoEntregable === 'number' && cambios.plazoEntregable >= 1 && cambios.plazoEntregable <= 720) expediente.carta.plazoEntregable = Math.round(cambios.plazoEntregable);
  await almacen.guardarExpediente(expediente);
  return expediente;
}

/** Motor «Consolidación y prioridad»: ordena por prioridad y numera. */
function consolidar(nuevos: HallazgoNuevo[]): Hallazgo[] {
  return nuevos
    .map((h, i) => ({ h, i }))
    .sort((a, b) => ORDEN_PRIORIDAD[a.h.prioridad] - ORDEN_PRIORIDAD[b.h.prioridad] || a.i - b.i)
    .map(({ h }, n) => ({ id: `AX-${String(n + 1).padStart(2, '0')}`, ...h }));
}

/** Una fila por motor con el tiempo total (lectura y clasificación corren por archivo). */
function resumir(ejecucion: EjecucionMotor[]): EjecucionMotor[] {
  const porMotor = new Map<string, EjecucionMotor>();
  for (const e of ejecucion) {
    const previo = porMotor.get(e.motor);
    if (!previo) porMotor.set(e.motor, { ...e });
    else {
      previo.ms += e.ms;
      if (e.estado === 'error') previo.estado = 'error';
    }
  }
  return [...porMotor.values()];
}
