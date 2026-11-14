// Señales de competencia y de ejecución con datos OCDS de La Libertad (no supervisado: percentiles de la región
// e indicadores de la Guía de banderas rojas de Open Contracting Partnership, 2024). Informa hechos; no acusa.

import type { Deteccion } from './tipos-analisis';

export interface ProcesoOcds {
  proceso: string; nomenclatura: string; cui: string | null; entidad: string; provincia: string; tipo: string; metodo: string; fecha: string;
  vr: number; participantes: number; ganadores: string[]; adjudicado: number | null; pctVr: number | null;
  contrato?: number; plazo?: number | null; final?: number | null; variacion?: number | null; ampliacionDias?: number | null;
  docsAdicional?: number; docsAmpliacion?: number; nulidad?: boolean; resolucion?: boolean;
}
export interface DatosCompetencia {
  fuente: string; generado: string;
  referencia: { obras: number; conValorFinal: number; variacion: { mediana: number; p75: number; p90: number }; participantes: { mediana: number; unico: number }; ampliacionRel: { mediana: number; p90: number }; pctVr: { sobre99: number } };
  concentracion: Record<string, { obras: number; ganadores: number; mayor: string; parteMayor: number; obrasMayor: number }>;
  procesos: ProcesoOcds[];
  /** Integrantes de consorcios (leídos de los contratos de consorcio publicados en SEACE). */
  miembros?: Record<string, { ruc: string; nombre: string | null; participacion?: number | null }[]>;
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
const soles = (n: number) => 'S/ ' + Math.round(n).toLocaleString('es-PE');

/** Señales del procedimiento de selección y de la ejecución de un proceso. */
export function senalesProceso(p: ProcesoOcds, d: DatosCompetencia): Deteccion[] {
  const out: Deteccion[] = [];
  const R = d.referencia;
  const ev = [{ documento: 'SEACE (OCDS)', extracto: `${p.nomenclatura} – ${p.entidad}` }];
  // Solo métodos competitivos (OCP R018): la contratación directa tiene un único proveedor por definición.
  if (p.participantes <= 1 && p.ganadores.length && !/DIRECTA/i.test(p.metodo))
    out.push({ verificador: 'R-COMPETENCIA', resultado: 'falla', severidad: 'media', titulo: 'Un solo participante registrado',
      detalle: `El proceso tuvo ${p.participantes} participante registrado; en La Libertad la mediana es ${R.participantes.mediana} y solo el ${pc(R.participantes.unico)} de las obras tuvo uno. Sin competencia, el precio y la calidad no se contrastan (OCP, bandera "un solo postor").`, evidencias: ev });
  const c = d.concentracion[p.entidad];
  if (c && c.parteMayor >= 0.5 && p.ganadores.includes(c.mayor))
    out.push({ verificador: 'R-CONCENTRACION', resultado: 'falla', severidad: 'media', titulo: `El ganador concentra el ${Math.round(c.parteMayor * 100)}% de lo adjudicado por la entidad`,
      detalle: `De ${c.obras} obras adjudicadas por ${p.entidad} (2025-2026), ${c.obrasMayor} fueron para el mismo proveedor, que suma el ${pc(c.parteMayor)} del monto. No prueba irregularidad, pero es un patrón que el OCI suele revisar.`, evidencias: ev });
  if (p.variacion != null && p.variacion > R.variacion.p90)
    out.push({ verificador: 'E-VARIACION', resultado: 'falla', severidad: p.variacion > 0.3 ? 'alta' : 'media', titulo: `El costo final subió ${pc(p.variacion)} respecto al contrato`,
      detalle: `Contrato ${soles(p.contrato!)} → valor final ${soles(p.final!)}. Es más que el 90% de las obras de La Libertad con valor final publicado (p90 = ${pc(R.variacion.p90)}; mediana ${pc(R.variacion.mediana)}). ${p.docsAdicional ? `Hay ${p.docsAdicional} documento(s) de adicionales publicados.` : ''}`, evidencias: ev, montoInvolucrado: p.final! - p.contrato! });
  if (p.ampliacionDias != null && p.plazo && p.ampliacionDias / p.plazo > R.ampliacionRel.p90)
    out.push({ verificador: 'E-AMPLIACION', resultado: 'falla', severidad: 'media', titulo: `El plazo se amplió ${p.ampliacionDias} días (${pc(p.ampliacionDias / p.plazo)} del plazo)`,
      detalle: `Plazo contractual ${p.plazo} días. La ampliación supera a la del 90% de las obras de La Libertad (p90 = ${pc(R.ampliacionRel.p90)} del plazo).`, evidencias: ev });
  if (p.nulidad || p.resolucion)
    out.push({ verificador: 'E-CONTRATO', resultado: 'falla', severidad: 'alta', titulo: p.nulidad ? 'Se publicó la nulidad del contrato' : 'Se publicó la resolución del contrato',
      detalle: 'La entidad publicó en el SEACE documentos de ' + (p.nulidad ? 'nulidad' : 'resolución') + ' del contrato. La obra no se terminó con el contratista original.', evidencias: ev });
  return out;
}

/** Historial de ejecución en La Libertad de un proveedor (o de los integrantes de un consorcio) antes de una fecha. */
export function historialEjecucion(ruc: string, d: DatosCompetencia, antesDe: string, rol = 'El ganador'): Deteccion[] {
  const rucs = new Set([ruc]);
  // un consorcio "hereda" el historial de sus integrantes; un integrante, el de los consorcios en que participó
  for (const m of d.miembros?.[ruc] ?? []) rucs.add(m.ruc);
  for (const [cons, ms] of Object.entries(d.miembros ?? {})) if (ms.some((m) => rucs.has(m.ruc))) rucs.add(cons);
  const previos = d.procesos.filter((p) => p.fecha < antesDe && p.ganadores.some((g) => rucs.has(g)) && p.contrato);
  if (!previos.length) return [];
  const R = d.referencia;
  const malos = previos.filter((p) => (p.variacion != null && p.variacion > R.variacion.p90) || p.nulidad || p.resolucion || (p.ampliacionDias != null && p.plazo && p.ampliacionDias / p.plazo > R.ampliacionRel.p90));
  if (!malos.length) return [{ verificador: 'P-HISTORIAL', resultado: 'pasa', severidad: 'baja', titulo: `${rol} tiene ${previos.length} obra(s) previa(s) en La Libertad sin señales de ejecución`,
    detalle: `Contratos previos (2025-2026, incluidos consorcios con los mismos integrantes): ${previos.slice(0, 4).map((p) => p.nomenclatura).join('; ')}.`, evidencias: [] }];
  return [{ verificador: 'P-HISTORIAL', resultado: 'falla', severidad: malos.length >= 2 ? 'alta' : 'media',
    titulo: `${rol} tuvo problemas de ejecución en ${malos.length} de ${previos.length} obra(s) previa(s) en La Libertad`,
    detalle: malos.slice(0, 4).map((p) => `${p.nomenclatura} (${p.entidad}): ${[p.variacion != null && p.variacion > R.variacion.p90 ? `costo +${pc(p.variacion)}` : '', p.ampliacionDias && p.plazo && p.ampliacionDias / p.plazo > R.ampliacionRel.p90 ? `+${p.ampliacionDias} días` : '', p.nulidad ? 'nulidad' : '', p.resolucion ? 'resolución' : ''].filter(Boolean).join(', ')}`).join('; ') + '. Incluye consorcios con los mismos integrantes.',
    evidencias: malos.slice(0, 3).map((p) => ({ documento: 'SEACE (OCDS)', extracto: `${p.nomenclatura} – ${p.entidad}` })) }];
}
