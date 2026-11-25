import 'server-only';
import type { Documento, EjecucionMotor, Expediente, Hallazgo, Prioridad, TipoDocumento } from '@/dominio/tipos';
import { TIPOS_DOCUMENTO } from '@/dominio/tipos';
import * as almacen from './almacen';
import type { ArchivoEntrante } from './http';
import { leerDocumento } from './motores/lectura';
import { clasificarDocumentoExpediente } from './motores/clasificacion';
import { identidadDeDocumento, motorIdentidad, nombreDeObra } from './motores/identidad';
import { motorUbicacion } from './motores/ubicacion';
import { motorCobertura } from './motores/cobertura';
import type { ContextoExpediente, HallazgoNuevo, MotorExpediente } from './motores/tipos';

// Servicio del evaluador: recibe un expediente, lo lee y clasifica (paso 1), y
// después de que la persona confirma los tipos, corre los motores (paso 2).

/** Motores del análisis, en orden: los primeros resuelven datos que usan los siguientes. */
const MOTORES_ANALISIS: MotorExpediente[] = [motorIdentidad, motorUbicacion, motorCobertura];

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

export async function recibirExpediente(archivos: ArchivoEntrante[]): Promise<Expediente> {
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
    const sugerencia = await medir('clasificacion-documental', ejecucion, async () => clasificarDocumentoExpediente(archivo.nombre, lectura.paginas));
    identidades.push(identidadDeDocumento(lectura.paginas));
    documentos.push({
      id: docId, nombre: archivo.nombre, bytes: datos.byteLength,
      tipo: sugerencia.tipo, sugerencia,
      lectura: lectura.estado, paginas: lectura.paginas.length, paginasConTexto: lectura.paginasConTexto, unidad: lectura.unidad,
    });
  }

  const expediente: Expediente = {
    id,
    clave,
    nombre: nombreDeObra(identidades) ?? 'Expediente sin nombre de obra',
    lugar: null,
    territorio: null,
    creado: new Date().toISOString(),
    estado: 'por-confirmar',
    documentos,
    hallazgos: [],
    ejecucion: resumir(ejecucion),
    carta: { incluidos: [], destinatario: '' },
  };
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

  const nuevos: HallazgoNuevo[] = [];
  const ejecucion = expediente.ejecucion.filter((e) => e.motor === 'lectura' || e.motor === 'clasificacion-documental');
  const ctx: ContextoExpediente = {
    expediente,
    texto: (docId) => almacen.leerTexto('expedientes', id, docId),
    reportar: (h) => nuevos.push(h),
    fijar: (datos) => Object.assign(expediente, datos),
  };

  for (const motor of MOTORES_ANALISIS) {
    const inicio = performance.now();
    try {
      const r = await motor.ejecutar(ctx);
      ejecucion.push({ motor: motor.id, estado: r.estado, ms: Math.round(performance.now() - inicio), nota: r.nota });
    } catch (error) {
      // Un motor que falla no detiene a los demás; queda registrado.
      ejecucion.push({ motor: motor.id, estado: 'error', ms: Math.round(performance.now() - inicio), nota: (error as Error).message });
    }
  }

  const inicio = performance.now();
  expediente.hallazgos = consolidar(nuevos);
  ejecucion.push({ motor: 'consolidacion', estado: 'ok', ms: Math.round(performance.now() - inicio), nota: `${expediente.hallazgos.length} hallazgo(s).` });

  expediente.ejecucion = ejecucion;
  expediente.estado = 'analizado';
  expediente.carta = { incluidos: expediente.hallazgos.map((h) => h.id), destinatario: expediente.carta.destinatario };
  await almacen.guardarExpediente(expediente);
  return expediente;
}

export async function actualizarCarta(id: string, carta: { incluidos?: string[]; destinatario?: string }) {
  const expediente = await almacen.leerExpediente(id);
  if (!expediente) throw new Error('Expediente no encontrado');
  const validos = new Set(expediente.hallazgos.map((h) => h.id));
  if (carta.incluidos) expediente.carta.incluidos = carta.incluidos.filter((h) => validos.has(h));
  if (typeof carta.destinatario === 'string') expediente.carta.destinatario = carta.destinatario.slice(0, 200);
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
