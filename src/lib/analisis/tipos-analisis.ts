// Tipos del análisis real de documentos (independientes de la interfaz).

export type ResultadoVerificacion = 'pasa' | 'falla' | 'no_verificable';
export type SeveridadVerificacion = 'alta' | 'media' | 'baja';

export interface Evidencia {
  documento: string; // 'Presupuesto', 'Planilla de metrados', 'Especificaciones técnicas', ...
  pagina?: number;
  extracto: string;
}

/** Resultado de un verificador. Un verificador puede producir varias detecciones (una por partida afectada). */
export interface Deteccion {
  verificador: string; // id estable, p. ej. 'V-ARIT-PARTIDA'
  resultado: ResultadoVerificacion;
  severidad: SeveridadVerificacion;
  titulo: string;
  detalle: string;
  evidencias: Evidencia[];
  /** Diferencia monetaria involucrada (S/), si aplica: sirve para priorizar. */
  montoInvolucrado?: number;
}

export interface FichaVerificador {
  id: string;
  nombre: string;
  causa: string; // de la taxonomía fija de Axis
  queRevisa: string;
  /** Casos reales de La Libertad que originaron la regla (proceso SEACE y obra). */
  origen: { proceso: string; obra: string; hallazgo: string; documento: string }[];
}
