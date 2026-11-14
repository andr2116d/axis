// Verificación de antecedentes de un proveedor (postor o ganador) con fuentes oficiales del OECE.
// No acusa: informa hechos registrados (resolución, fechas, motivo) para que el evaluador decida.

import type { Deteccion } from './tipos-analisis';

export interface Inhabilitacion { resolucion: string; tipo?: string; periodo?: string | null; desde: string | null; hasta: string | null; motivo: string; fuente: string }
export interface Multa { resolucion: string; desde: string | null; hasta: string | null; motivo: string; monto: number | null; fuente: string }
export interface Penalidad { contrato: string; tipo: string; objeto: string; entidad: string; fecha: string | null; motivo: string; monto: number | null; fuente: string }
export interface Antecedentes { nombre: string | null; inhabilitaciones: Inhabilitacion[]; multas: Multa[]; penalidades: Penalidad[] }

/** Un RUC válido tiene 11 dígitos y empieza en 10, 15, 17 o 20. Los consorcios en el SEACE usan otro código. */
export const esRuc = (s: string) => /^(10|15|17|20)\d{9}$/.test(s);

/** ¿La inhabilitación estaba vigente en la fecha dada? (hasta = null o '-' significa definitiva) */
export function vigenteEn(i: { desde: string | null; hasta: string | null; tipo?: string }, fecha: string): boolean {
  if (!i.desde || i.desde > fecha) return false;
  if (!i.hasta) return /DEFINITIV/i.test(i.tipo ?? '') || true;
  return i.hasta >= fecha;
}

const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Revisa un proveedor a una fecha (la de la buena pro o la de hoy).
 * `antecedentes` es el registro del índice para ese RUC, o undefined si no tiene ninguno.
 */
export function verificarProveedor(ruc: string, fecha: string, antecedentes: Antecedentes | undefined, rol = 'El ganador'): Deteccion[] {
  if (!esRuc(ruc)) {
    return [{
      verificador: 'P-PROVEEDOR', resultado: 'no_verificable', severidad: 'media',
      titulo: `${rol} es un consorcio: hay que revisar a cada integrante`,
      detalle: `El código ${ruc} no es un RUC sino el identificador del consorcio en el SEACE. Las sanciones se registran por RUC de cada integrante: revise la promesa de consorcio y verifique a cada uno.`,
      evidencias: [],
    }];
  }
  if (!antecedentes) {
    return [{ verificador: 'P-PROVEEDOR', resultado: 'pasa', severidad: 'baja', titulo: `${rol} no registra sanciones ni penalidades`, detalle: `El RUC ${ruc} no figura en los registros de inhabilitaciones, multas ni penalidades del OECE consultados.`, evidencias: [] }];
  }
  const out: Deteccion[] = [];
  const quien = antecedentes.nombre ? `${antecedentes.nombre} (RUC ${ruc})` : `RUC ${ruc}`;
  for (const i of antecedentes.inhabilitaciones) {
    const vig = vigenteEn(i, fecha);
    const cinco = i.desde && i.desde >= String(Number(fecha.slice(0, 4)) - 5) + fecha.slice(4);
    if (!vig && !cinco) continue;
    out.push({
      verificador: 'P-PROVEEDOR', resultado: 'falla', severidad: vig ? 'alta' : 'media',
      titulo: vig ? `${rol} tenía una inhabilitación vigente a la fecha` : `${rol} fue inhabilitado en los últimos 5 años`,
      detalle: `${quien}: Resolución ${i.resolucion}, desde ${i.desde ?? '¿?'} hasta ${i.hasta ?? 'definitiva'}. Motivo: ${i.motivo}`,
      evidencias: [{ documento: i.fuente, extracto: `Resolución ${i.resolucion}` }],
    });
  }
  for (const m of antecedentes.multas) {
    if (m.desde && m.desde >= String(Number(fecha.slice(0, 4)) - 5) + fecha.slice(4)) {
      out.push({
        verificador: 'P-PROVEEDOR', resultado: 'falla', severidad: 'media', titulo: `${rol} fue multado por el Tribunal`,
        detalle: `${quien}: Resolución ${m.resolucion} (${m.desde})${m.monto ? `, multa de ${soles(m.monto)}` : ''}. ${m.motivo}`,
        evidencias: [{ documento: m.fuente, extracto: `Resolución ${m.resolucion}` }],
      });
    }
  }
  const pen = antecedentes.penalidades.filter((p) => !p.fecha || p.fecha <= fecha);
  if (pen.length) {
    const total = pen.reduce((s, p) => s + (p.monto ?? 0), 0);
    const obras = pen.filter((p) => /obra/i.test(p.objeto)).length;
    out.push({
      verificador: 'P-PROVEEDOR', resultado: 'falla', severidad: pen.length >= 3 || obras >= 2 ? 'media' : 'baja',
      titulo: `${rol} recibió ${pen.length} penalidad${pen.length > 1 ? 'es' : ''} en contratos anteriores`,
      detalle: `${quien}: ${pen.length} penalidad(es) por ${soles(total)}${obras ? `, ${obras} en obras o consultorías de obra` : ''}. Entidades: ${[...new Set(pen.map((p) => p.entidad))].slice(0, 3).join('; ')}. Tipos: ${[...new Set(pen.map((p) => p.tipo))].join(', ')}.`,
      evidencias: pen.slice(0, 3).map((p) => ({ documento: p.fuente, extracto: `Contrato ${p.contrato} – ${p.fecha ?? ''} – ${p.motivo}` })),
      montoInvolucrado: total,
    });
  }
  if (!out.length) out.push({ verificador: 'P-PROVEEDOR', resultado: 'pasa', severidad: 'baja', titulo: `${rol} no registra antecedentes recientes`, detalle: `${quien} solo tiene registros anteriores a 5 años.`, evidencias: [] });
  return out;
}
