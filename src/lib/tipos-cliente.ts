// Forma de la respuesta de /api/analizar tal como llega al navegador.
import type { ResultadoAnalisis } from './analisis/expediente';
import type { Cuenca, ResultadoTerreno } from './analisis/terreno';

export type CuencaCliente = Omit<Cuenca, 'celdasCuenca'> & { celdas: [number, number][]; paso: number };
export type AnalisisCliente = Omit<ResultadoAnalisis, 'presupuesto' | 'terreno'> & {
  total: number | null; nombreObra: string | null;
  terreno?: Omit<ResultadoTerreno, 'cuenca'> & { cuenca: CuencaCliente | null };
};
