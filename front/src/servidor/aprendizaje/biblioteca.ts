import type { PruebaAprendida } from '@/dominio/tipos';
import { VERIFICADORES } from '@/datos/verificadores';

// Todas las pruebas que conoce Axis en una sola lista: las que el modelo aprendió en
// el entrenamiento inicial con datos reales y las que aprende de cada obra registrada.

export interface PruebaConocida {
  id: string;
  nombre: string;
  queRevisa: string;
  /** De dónde la aprendió el modelo. */
  aprendidaDe: string;
  origen: 'entrenamiento' | 'obra';
  estado: 'activa' | 'propuesta' | 'rechazada';
  /** Documentos que necesita para correr. */
  documentos: string[];
}

const FUENTE: Record<string, string> = {
  consistencia: 'observaciones de postores en pliegos del SEACE',
  presencia: 'observaciones de postores en pliegos del SEACE',
  plausibilidad: 'presupuestos publicados en el SEACE',
  contexto: 'informes de la Contraloría y datos abiertos del territorio',
};

export function pruebasConocidas(aprendidas: PruebaAprendida[]): PruebaConocida[] {
  const iniciales: PruebaConocida[] = VERIFICADORES.filter((v) => v.tipo !== 'proveedor').map((v) => ({
    id: v.id, nombre: v.nombre, queRevisa: v.queRevisa, origen: 'entrenamiento', estado: 'activa', documentos: v.documentos,
    aprendidaDe: `${FUENTE[v.tipo] ?? 'datos reales'}: ${v.origen[0]?.obra ?? ''}${v.origen[0]?.hallazgo ? ` — ${v.origen[0].hallazgo}` : ''}`,
  }));
  const deObras: PruebaConocida[] = aprendidas.map((p) => ({
    id: p.id, nombre: p.nombre, queRevisa: p.recomendacion, origen: 'obra',
    estado: p.estado === 'aceptada' ? 'activa' : p.estado,
    documentos: ['Presupuesto', 'Memoria'],
    aprendidaDe: `obra ${p.origen.situacion} ${p.origen.obraClave}: «${p.origen.fuente.extracto.slice(0, 160)}…»`,
  }));
  return [...iniciales, ...deObras];
}

const REQUISITO: Record<string, (c: { partes: Set<string>; ubicacion: boolean; cotizaciones: boolean }) => boolean> = {
  'Análisis de precios unitarios': (c) => c.partes.has('Precios unitarios'),
  'Cronograma de ejecución': (c) => c.partes.has('Cronograma'),
  'Desagregado de gastos generales': (c) => c.partes.has('Presupuesto'),
  'Fórmula polinómica': (c) => c.partes.has('Fórmula polinómica'),
  'Memoria descriptiva': (c) => c.partes.has('Memoria'),
  Presupuesto: (c) => c.partes.has('Presupuesto'),
  Cotizaciones: (c) => c.cotizaciones,
  'Especificaciones técnicas': (c) => c.partes.has('Especificaciones'),
  'Planilla de metrados': (c) => c.partes.has('Metrados'),
  'Estudio de mecánica de suelos': (c) => c.partes.has('Estudio de suelos'),
  'Índice de planos': (c) => c.partes.has('Planos'),
  Ubicación: (c) => c.ubicacion,
  Todos: () => true,
};

/** Documentos que le faltan a una prueba inicial para correr (vacío si puede correr). */
export function faltantes(documentos: string[], c: { partes: Set<string>; ubicacion: boolean; cotizaciones: boolean }): string[] {
  return documentos.filter((d) => !(REQUISITO[d] ?? (() => false))(c));
}

/** Cuántas pruebas iniciales tienen con qué correr según las partes presentes del expediente. */
export function aplicablesIniciales(c: { partes: Set<string>; ubicacion: boolean; cotizaciones: boolean }): number {
  return VERIFICADORES.filter((v) => v.tipo !== 'proveedor' && v.documentos.every((d) => (REQUISITO[d] ?? (() => false))(c))).length;
}
