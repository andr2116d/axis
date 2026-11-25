import datos from '@/datos/territorio.json';

// Recortes de terreno locales: red vial de OpenStreetMap y malla de elevación
// Copernicus GLO-30, en metros desde el centro de cada recorte.

export type Punto = [number, number];

export interface MapaTramo {
  center: [number, number];
  name: string;
  width: number;
  height: number;
  /** [nombre, tipo OSM, polilínea] */
  roads: [string, string, Punto[]][];
  waterways: Punto[][];
  /** [distancia acumulada, x, y, cota] */
  route: [number, number, number, number][];
  length: number;
  grade: number;
  half: number;
  divisions: number;
  mesh: number[][];
  min: number;
  max: number;
}

export interface Territorio {
  roadDate: string;
  waterDate: string;
  demCredit: string;
  maps: Record<string, MapaTramo>;
}

export const territorio = datos as unknown as Territorio;
