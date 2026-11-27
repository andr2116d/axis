// Cliente de la API de Axis (servidor de modelos entrenados), servida en /motor por el proxy.

export type Severidad = 'rojo' | 'ambar';
export type Decision = 'confirmado' | 'descartado' | 'justificado';

export interface Factor { nombre: string; valor: string }
export interface RevisionHallazgo { decision: Decision; motivo: string | null; revisado_en: string }
export interface HallazgoMotor {
  clave: string; motor: string; severidad: Severidad; titulo: string; explicacion: string; confianza: number;
  seccion: string | null; id_documento: string | null; pagina: number | null; item: string | null;
  factores: Factor[]; revision: RevisionHallazgo | null;
}
export interface SeccionMotor { etiqueta: string; id_documento: string; nombre_documento: string; version: number; estado: 'sin_revisar' | 'verde' | 'ambar' | 'rojo'; hallazgos: number; abiertos: number }
export interface ExpedienteMotor {
  id: string; nombre_obra: string; semaforo: 'verde' | 'ambar' | 'rojo' | null;
  secciones: SeccionMotor[];
  documentos: { id_documento: string; nombre: string; tipo: string; partes: string[]; adjuntado_en: string }[];
  evaluacion: null | {
    numero: number; creada_en: string; duracion_ms: number; sin_revisar: number;
    motores: { motor: string; version: string; reutilizado: boolean; hallazgos: number }[];
    omitidos: { motor: string; nombre: string; razon: string; faltan: string[] }[];
    fallas: { motor: string; razon: string }[];
    hallazgos: HallazgoMotor[];
  };
}
export interface CitaMotor {
  norma: string; extracto: string; razon: string; pertinencia: 'alta' | 'media'; origen: 'lector' | 'busqueda';
  fragmento: { id: string; etiqueta: string; titulo: string; ubicacion: string[]; texto: string };
}
export interface RespuestaNormativa { origen: 'lector' | 'busqueda'; lector: string | null; leida_por_modelo: boolean; citas: CitaMotor[]; descartadas: number; desde_cache: boolean; duracion_ms: number }
export interface Avance { etapa: string; mensaje: string; datos: Record<string, unknown> }

export class ErrorMotor extends Error {
  constructor(mensaje: string, readonly codigo: number, readonly tipo = '') { super(mensaje); }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let r: Response;
  try {
    r = await fetch(`/motor${ruta}`, { ...opciones, headers: { 'content-type': 'application/json', ...(opciones.headers ?? {}) } });
  } catch {
    throw new ErrorMotor('No hay conexión con el servidor de modelos de Axis.', 0);
  }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new ErrorMotor(datos.detalle ?? datos.detail ?? `El servidor respondió ${r.status}.`, r.status, datos.error ?? '');
  return datos as T;
}

export const motor = {
  crearExpediente: (cuerpo: { nombre_obra: string; cui?: string | null; entidad?: string | null; tipologia?: string | null }) =>
    pedir<ExpedienteMotor>('/expedientes', { method: 'POST', body: JSON.stringify(cuerpo) }),
  expediente: (id: string) => pedir<ExpedienteMotor>(`/expedientes/${id}`),
  evaluar: (id: string) => pedir<ExpedienteMotor>(`/expedientes/${id}/evaluar`, { method: 'POST' }),
  revisar: (id: string, clave: string, decision: Decision, motivo?: string) =>
    pedir<ExpedienteMotor>(`/expedientes/${id}/hallazgos/${clave}/revision`, { method: 'POST', body: JSON.stringify({ decision, motivo: motivo || null }) }),
  normativaDe: (id: string, clave: string) => pedir<RespuestaNormativa>(`/expedientes/${id}/hallazgos/${clave}/normativa`),
  consultar: (pregunta: string, contexto?: string) =>
    pedir<RespuestaNormativa>('/normativa/consultas', { method: 'POST', body: JSON.stringify({ pregunta, contexto: contexto || null }) }),
};

/** Sube un archivo al expediente y avisa cada etapa (SSE) hasta que el servidor termina. */
export async function subirEnVivo(id: string, archivo: File, alAvanzar: (a: Avance) => void): Promise<ExpedienteMotor> {
  const cuerpo = new FormData();
  cuerpo.append('archivo', archivo, archivo.name);
  let r: Response;
  try {
    r = await fetch(`/motor/expedientes/${id}/archivos/en-vivo`, { method: 'POST', body: cuerpo });
  } catch {
    throw new ErrorMotor('No hay conexión con el servidor de modelos de Axis.', 0);
  }
  if (!r.ok || !r.body) {
    const datos = await r.json().catch(() => ({}));
    throw new ErrorMotor(datos.detalle ?? `El servidor respondió ${r.status}.`, r.status, datos.error ?? '');
  }
  const lector = r.body.getReader();
  const decodificador = new TextDecoder();
  let pendiente = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    pendiente += decodificador.decode(value, { stream: true });
    let corte: number;
    while ((corte = pendiente.indexOf('\n\n')) >= 0) {
      const bloque = pendiente.slice(0, corte);
      pendiente = pendiente.slice(corte + 2);
      const evento = bloque.match(/^event: ?(.*)$/m)?.[1] ?? 'message';
      const linea = bloque.match(/^data: ?(.*)$/m)?.[1];
      if (!linea) continue;
      const datos = JSON.parse(linea);
      if (evento === 'listo') return datos as ExpedienteMotor;
      if (evento === 'error') throw new ErrorMotor(datos.detalle, datos.codigo, datos.error);
      const { mensaje, ...resto } = datos;
      alAvanzar({ etapa: evento, mensaje, datos: resto });
    }
  }
  throw new ErrorMotor('La conexión se cortó antes de terminar.', 0);
}
