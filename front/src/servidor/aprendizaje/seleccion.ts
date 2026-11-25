import type { Expediente, ResultadoPrueba } from '@/dominio/tipos';

// Selección de pruebas: antes de correr, el modelo lee el expediente y decide cuáles
// pruebas valen la pena para esta obra. SIMULADO por ahora: el descarte es determinista
// (mismo expediente, misma selección) y solo toca pruebas que no encontraron nada, para
// no esconder una observación real. El modelo que lo reemplace debe devolver lo mismo:
// qué pruebas no corre y por qué.

/** Pruebas que el modelo puede decidir no correr, con la razón que da. Ninguna de agua
 *  ni drenaje: varios escenarios de la demo tratan justo de eso. */
const DESCARTABLES: { id: string; motivo: string }[] = [
  { id: 'C-PELIGRO', motivo: 'No hay peligros geológicos cartografiados a menos de 500 m del tramo.' },
  { id: 'C-DUPLICIDAD', motivo: 'Ninguna otra inversión registrada en el MEF toca esta vía.' },
  { id: 'C-COORDINACION', motivo: 'La empresa de agua no tiene proyectos pendientes en esta calle.' },
  { id: 'C-HISTORIAL', motivo: 'Hay menos de tres obras parecidas en el distrito: no alcanza para comparar costos.' },
  { id: 'V-GLOBAL', motivo: 'Ninguna partida del presupuesto está expresada como global.' },
  { id: 'X-RENDIMIENTO', motivo: 'El cronograma es de barras por frente, sin duración por partida: no hay rendimientos que contrastar.' },
];

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i += 1) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Cuántas pruebas descarta el modelo en este expediente. */
function cuantas(e: Expediente, semilla: number): number {
  const nombres = e.documentos.map((d) => d.nombre).join('|');
  // Escenario 1 de la demo (LL-01 / LL-02): el expediente pide todas las pruebas.
  if (/(^|\|)LL-0[12]_/.test(nombres)) return 0;
  // Resto de escenarios de la demo: siempre descarta algunas.
  if (/(^|\|)E\d{2}-/.test(nombres)) return 3 + (semilla % 3);
  return [0, 2, 3, 4][semilla % 4];
}

/** Marca como «descartada» las pruebas que el modelo decidió no correr en este expediente. */
export function seleccionarPruebas(e: Expediente, resultados: ResultadoPrueba[]): ResultadoPrueba[] {
  const semilla = hash(`${e.documentos.map((d) => d.nombre).join('|')}#${e.nombre}`);
  const k = cuantas(e, semilla);
  if (!k) return resultados;
  const porId = new Map(resultados.map((r) => [r.id, r]));
  const candidatas = DESCARTABLES
    .filter((d) => porId.get(d.id)?.estado === 'pasa')
    .map((d, i) => ({ ...d, orden: hash(`${semilla}:${d.id}:${i}`) }))
    .sort((a, b) => a.orden - b.orden)
    .slice(0, k);
  const descartes = new Map(candidatas.map((d) => [d.id, d.motivo]));
  return resultados.map((r) => descartes.has(r.id) ? { ...r, estado: 'descartada', motivo: descartes.get(r.id) } : r);
}
