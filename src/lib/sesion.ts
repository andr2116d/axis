'use client';
// Estado de cada persona que prueba Axis, guardado solo en su navegador (cada jurado tiene su propio espacio).
import { useSyncExternalStore } from 'react';
import type { HallazgoObra, PruebaAprendida } from './analisis/aprendizaje';

export type Rol = 'evaluador' | 'proyectista' | 'supervisor' | 'curador' | 'control';
export const ROLES: { id: Rol; nombre: string; tarea: string }[] = [
  { id: 'evaluador', nombre: 'Evaluador', tarea: 'Revisa el expediente antes de aprobarlo' },
  { id: 'proyectista', nombre: 'Proyectista', tarea: 'Pre-revisa su expediente antes de entregarlo' },
  { id: 'supervisor', nombre: 'Supervisor de obra', tarea: 'Controla la obra y registra lo que encuentra' },
  { id: 'curador', nombre: 'Curador de pruebas', tarea: 'Valida los hallazgos que se vuelven pruebas' },
  { id: 'control', nombre: 'Control (OCI)', tarea: 'Consulta revisiones y ganadores; no modifica nada' },
];

export interface HallazgoRegistrado extends HallazgoObra { causa?: string; fuenteCausa?: string; prueba?: PruebaAprendida }
export interface Sesion { rol: Rol; hallazgos: HallazgoRegistrado[]; pruebas: PruebaAprendida[] }

const CLAVE = 'axis:v2';
const INICIAL: Sesion = { rol: 'evaluador', hallazgos: [], pruebas: [] };
let estado: Sesion = INICIAL;
let cargado = false;
const oyentes = new Set<() => void>();

function cargar() {
  if (cargado || typeof window === 'undefined') return;
  cargado = true;
  try { const raw = window.localStorage.getItem(CLAVE); if (raw) estado = { ...INICIAL, ...JSON.parse(raw) }; } catch { /* sin almacenamiento: en memoria */ }
}
export function obtener(): Sesion { cargar(); return estado; }
export function actualizar(f: (s: Sesion) => Sesion) {
  estado = f(obtener());
  try { window.localStorage.setItem(CLAVE, JSON.stringify(estado)); } catch (e) { console.error('No se pudo guardar la sesión en el navegador:', e); }
  oyentes.forEach((o) => o());
}
export function useSesion(): Sesion {
  return useSyncExternalStore((o) => { oyentes.add(o); return () => oyentes.delete(o); }, obtener, () => INICIAL);
}

// Último análisis (para el informe): solo en esta pestaña
export function guardarAnalisis(x: unknown) { try { sessionStorage.setItem('axis:analisis', JSON.stringify(x)); } catch { /* ignorar */ } }
export function leerAnalisis<T>(): T | null { try { const r = sessionStorage.getItem('axis:analisis'); return r ? (JSON.parse(r) as T) : null; } catch { return null; } }
