import type { PruebaAprendida } from '@/dominio/tipos';
import datos from '@/datos/escenarios-demo.json';
import { distancia } from '../analisis/geo';

// Escenarios de la demo cargados en el servidor. Un escenario queda «hecho» cuando el
// modelo ya aprendió su prueba; la portada ofrece el siguiente, así cada persona que
// prueba Axis ve nacer una prueba nueva y el modelo sigue siendo uno solo.

export interface Escenario {
  id: string;
  zona: string;
  condicion: string;
  situacion: 'terminada' | 'paralizada';
  titulo: string;
  original: { archivo: string; via: string; coord: number[] };
  obra: { archivo: string; tipo: string };
  cercano: { archivo: string; via: string; distancia: number };
}

export const ESCENARIOS = datos as unknown as Escenario[];

export function escenarioAprendido(e: Escenario, pruebas: PruebaAprendida[]): boolean {
  const centro = { lat: e.original.coord[0], lng: e.original.coord[1] };
  return pruebas.some((p) => p.condicion === e.condicion && p.estado !== 'rechazada' && p.alcance.centro && distancia(p.alcance.centro, centro) < 400);
}

export function estadoEscenarios(pruebas: PruebaAprendida[]) {
  const lista = ESCENARIOS.map((e) => ({ ...e, aprendido: escenarioAprendido(e, pruebas) }));
  const actual = lista.find((e) => !e.aprendido) ?? null;
  return { lista, actual };
}

export function escenarioPorId(id: string | undefined) {
  return ESCENARIOS.find((e) => e.id === id);
}
