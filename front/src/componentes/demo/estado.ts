'use client';

// Progreso de la demo guiada, guardado en el navegador de quien la recorre.

export interface EstadoDemo {
  escenario: string;
  /** Último paso alcanzado: 0 elegido, 1 revisar, 2 carta, 3 selección, 4 ejecución, 5 obra y prueba aceptada, 6 expediente cercano. */
  paso: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Revisión del expediente original y del cercano. */
  a?: string;
  b?: string;
  /** Proceso de selección y obra en ejecución de la demo. */
  proceso?: string;
  obra?: string;
}

const CLAVE = 'axis-demo';
export const EVENTO_DEMO = 'axis:demo';

export function leerDemo(): EstadoDemo | null {
  try {
    const v = localStorage.getItem(CLAVE);
    return v ? (JSON.parse(v) as EstadoDemo) : null;
  } catch {
    return null;
  }
}

export function guardarDemo(estado: EstadoDemo | null) {
  try {
    if (estado) localStorage.setItem(CLAVE, JSON.stringify(estado));
    else localStorage.removeItem(CLAVE);
  } catch { /* sin almacenamiento: la guía no persiste */ }
  window.dispatchEvent(new Event(EVENTO_DEMO));
}

/** Avanza el paso sin retroceder. */
export function avanzarDemo(cambios: Partial<EstadoDemo> & { paso: EstadoDemo['paso'] }) {
  const actual = leerDemo();
  if (!actual) return;
  guardarDemo({ ...actual, ...cambios, paso: Math.max(actual.paso, cambios.paso) as EstadoDemo['paso'] });
}
