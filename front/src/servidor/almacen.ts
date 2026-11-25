import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Expediente, RegistroObra } from '@/dominio/tipos';
import { respaldo } from './respaldo';

// Almacén de Axis: expedientes, registros de obra, archivos y texto leído.
// Todo acceso pasa por aquí; el soporte físico (Blob o disco) está en respaldo.ts.

type Coleccion = 'expedientes' | 'obras';

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

export function leerExpediente(id: string) {
  return leerJSON<Expediente>(`${base('expedientes', id)}/expediente.json`);
}

export async function listarExpedientes() {
  const todos = await listar<Expediente>('expedientes', 'expediente.json');
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
