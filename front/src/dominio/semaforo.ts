import type { Expediente, Hallazgo, Justificacion, Semaforo } from './tipos';

// Semáforo vigente: el que dio Axis, recalculado con las alertas que el evaluador
// justificó y Axis aceptó. Una alerta justificada no desaparece: queda como
// «verde justificado» en la revisión y en el informe.

export function justificacionDe(e: Expediente, hallazgo: string): Justificacion | undefined {
  return e.justificaciones?.find((j) => j.hallazgo === hallazgo);
}

export function justificada(e: Expediente, h: Hallazgo): boolean {
  return justificacionDe(e, h.id)?.evaluacion.veredicto === 'aceptada';
}

export function semaforoVigente(e: Expediente): { estado: Semaforo; justificadas: number } {
  if (e.semaforo === 'gris') return { estado: 'gris', justificadas: 0 };
  const abiertos = e.hallazgos.filter((h) => !justificada(e, h));
  const justificadas = e.hallazgos.length - abiertos.length;
  if (!justificadas) return { estado: e.semaforo, justificadas };
  const estado: Semaforo = abiertos.some((h) => h.prioridad === 'alta') ? 'rojo'
    : abiertos.length || !e.cobertura.length ? 'amarillo' : 'verde';
  return { estado, justificadas };
}

/** Clave para reconocer la misma observación entre dos versiones del expediente. */
export function claveHallazgo(h: Hallazgo): string {
  const titulo = h.titulo.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\d.,]+/g, '#').replace(/\s+/g, ' ').trim();
  return `${h.prueba ?? h.categoria}|${titulo}`;
}

export interface ComparacionVersiones {
  levantadas: Hallazgo[];
  persisten: Hallazgo[];
  nuevas: Hallazgo[];
}

export function compararVersiones(anterior: Expediente, actual: Expediente): ComparacionVersiones {
  const antes = new Map(anterior.hallazgos.map((h) => [claveHallazgo(h), h]));
  const ahora = new Map(actual.hallazgos.map((h) => [claveHallazgo(h), h]));
  // Si la clave exacta no coincide, la misma prueba sobre el mismo documento cuenta como la misma observación.
  const porPrueba = (h: Hallazgo, otros: Hallazgo[]) => h.prueba ? otros.find((o) => o.prueba === h.prueba && o.fuentes[0]?.pagina === h.fuentes[0]?.pagina) : undefined;
  const persisten = actual.hallazgos.filter((h) => antes.has(claveHallazgo(h)) || porPrueba(h, anterior.hallazgos));
  const nuevas = actual.hallazgos.filter((h) => !persisten.includes(h));
  const levantadas = anterior.hallazgos.filter((h) => !ahora.has(claveHallazgo(h)) && !porPrueba(h, actual.hallazgos));
  return { levantadas, persisten, nuevas };
}
