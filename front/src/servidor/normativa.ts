import 'server-only';
import textos from '@/datos/normativa/textos.json';
import type { Norma } from '@/dominio/normativa';

// Texto oficial de la Ley 32069 y su Reglamento (compendios del OECE, fuente SPIJ),
// generado con scripts/normativa/generar.ts.

export interface Parrafo { t: string; k?: 'anterior' | 'nota' }
export interface Articulo { n: number; titulo: string; parrafos: Parrafo[]; modificado: boolean }
export interface TextoNorma { nombre: string; version: string; articulos: Articulo[] }

const NORMAS = textos as Record<Norma, TextoNorma>;

export function norma(id: string): TextoNorma | null {
  return id === 'ley' || id === 'reglamento' ? NORMAS[id] : null;
}

export function articulo(id: string, n: number): Articulo | null {
  return norma(id)?.articulos.find((a) => a.n === n) ?? null;
}
