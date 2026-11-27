import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Expediente, ObraEjecucion, ProcesoSeleccion, PruebaAprendida, RegistroObra } from '@/dominio/tipos';
import { respaldo } from './respaldo';

// Almacén de Axis: expedientes, registros de obra, archivos y texto leído.
// Todo acceso pasa por aquí; el soporte físico (Blob o disco) está en respaldo.ts.

type Coleccion = 'expedientes' | 'obras' | 'pruebas' | 'procesos' | 'ejecucion';

function base(coleccion: Coleccion, id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) throw new Error('Identificador no válido');
  return `${coleccion}/${id}`;
}

async function escribirJSON(ruta: string, dato: unknown) {
  await respaldo.escribir(ruta, JSON.stringify(dato), 'application/json');
}

async function leerJSON<T>(ruta: string): Promise<T | null> {
  const datos = await respaldo.leer(ruta);
  return datos ? (JSON.parse(new TextDecoder().decode(datos)) as T) : null;
}

async function listar<T>(coleccion: Coleccion, ficha: string): Promise<T[]> {
  const ids = await respaldo.carpetas(coleccion);
  const fichas: (T | null)[] = await Promise.all(ids.map((id) => leerJSON<T>(`${coleccion}/${id}/${ficha}`).catch(() => null)));
  return fichas.filter((f): f is T => f !== null);
}

export function nuevoId() {
  return randomUUID();
}

export async function siguienteClave(coleccion: Coleccion, prefijo: string) {
  const n = (await respaldo.carpetas(coleccion)).length + 1;
  return `${prefijo}-${String(n).padStart(4, '0')}`;
}

// ── Expedientes ──────────────────────────────────────────────

export async function guardarExpediente(e: Expediente) {
  await escribirJSON(`${base('expedientes', e.id)}/expediente.json`, e);
}

/** Completa los campos que no tenían los expedientes guardados por versiones anteriores. */
function completar(e: Expediente | null): Expediente | null {
  if (!e) return null;
  const analizadoAntes = e.estado === 'analizado' && !e.semaforo;
  return {
    ...e,
    ubicacion: e.ubicacion ?? null,
    cobertura: e.cobertura ?? [],
    semaforo: e.semaforo ?? (analizadoAntes ? (e.hallazgos.some((h) => h.prioridad === 'alta') ? 'rojo' : e.hallazgos.length ? 'amarillo' : 'verde') : 'gris'),
  };
}

export async function leerExpediente(id: string) {
  return completar(await leerJSON<Expediente>(`${base('expedientes', id)}/expediente.json`));
}

export async function listarExpedientes() {
  const todos = (await listar<Expediente>('expedientes', 'expediente.json')).map((e) => completar(e)!);
  return todos.sort((a, b) => b.creado.localeCompare(a.creado));
}

// ── Registros de obra terminada o paralizada ─────────────────

export async function guardarObra(o: RegistroObra) {
  await escribirJSON(`${base('obras', o.id)}/obra.json`, o);
}

export function leerObra(id: string) {
  return leerJSON<RegistroObra>(`${base('obras', id)}/obra.json`);
}

export async function listarObras() {
  const todos = await listar<RegistroObra>('obras', 'obra.json');
  return todos.sort((a, b) => b.creado.localeCompare(a.creado));
}

// ── Procesos de selección ────────────────────────────────────

export async function guardarProceso(p: ProcesoSeleccion) {
  await escribirJSON(`${base('procesos', p.id)}/proceso.json`, p);
}

export function leerProceso(id: string) {
  return leerJSON<ProcesoSeleccion>(`${base('procesos', id)}/proceso.json`);
}

export async function listarProcesos() {
  return (await listar<ProcesoSeleccion>('procesos', 'proceso.json')).sort((a, b) => b.creado.localeCompare(a.creado));
}

// ── Obras en ejecución ───────────────────────────────────────

export async function guardarEjecucion(o: ObraEjecucion) {
  await escribirJSON(`${base('ejecucion', o.id)}/obra.json`, o);
}

export function leerEjecucion(id: string) {
  return leerJSON<ObraEjecucion>(`${base('ejecucion', id)}/obra.json`);
}

export async function listarEjecucion() {
  return (await listar<ObraEjecucion>('ejecucion', 'obra.json')).sort((a, b) => b.creado.localeCompare(a.creado));
}

// ── Archivos y texto leído ───────────────────────────────────

export async function guardarArchivo(coleccion: Coleccion, id: string, docId: string, datos: Uint8Array) {
  await respaldo.escribir(`${base(coleccion, id)}/archivos/${docId}`, datos);
}

/** Texto por página de un documento (índice 0 = página 1). */
export async function guardarTexto(coleccion: Coleccion, id: string, docId: string, paginas: string[]) {
  await escribirJSON(`${base(coleccion, id)}/texto/${docId}.json`, paginas);
}

export async function leerTexto(coleccion: Coleccion, id: string, docId: string) {
  return (await leerJSON<string[]>(`${base(coleccion, id)}/texto/${docId}.json`)) ?? [];
}

// ── Subidas directas del navegador (solo con Blob) ───────────

export const PREFIJO_SUBIDAS = 'subidas/';

/** Lee y borra un archivo que el navegador subió directo a Blob. */
export async function tomarSubida(ruta: string): Promise<Uint8Array> {
  if (!ruta.startsWith(PREFIJO_SUBIDAS) || ruta.includes('..')) throw new Error('Archivo no válido');
  const datos = await respaldo.leer(ruta);
  if (!datos) throw new Error('No se encontró un archivo subido; vuelve a intentarlo.');
  await respaldo.borrar(ruta).catch(() => {});
  return datos;
}

// ── Pruebas aprendidas ───────────────────────────────────────

export async function guardarPrueba(p: PruebaAprendida) {
  await escribirJSON(`pruebas/${p.id}/prueba.json`, p);
}

export async function listarPruebas() {
  const todas = await listar<PruebaAprendida>('pruebas', 'prueba.json');
  return todas.map((p) => ({ ...p, estado: p.estado ?? 'propuesta', relacionadas: p.relacionadas ?? [] })).sort((a, b) => a.id.localeCompare(b.id));
}

export function leerPrueba(id: string) {
  if (!/^PA-\d{3,}$/.test(id)) throw new Error('Identificador no válido');
  return leerJSON<PruebaAprendida>(`pruebas/${id}/prueba.json`);
}
