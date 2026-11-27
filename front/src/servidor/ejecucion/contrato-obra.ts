import { fechasEnTexto } from '@/dominio/fechas';

// Los datos con que arranca el control de una obra salen del contrato y del acta de inicio:
// quién ejecuta, quién supervisa, desde cuándo corre el plazo, cuántos días y por cuánto.

export interface DatosObra { contratista?: string; supervisor?: string; inicio?: string; plazoDias?: number; monto?: number }

const valor = (texto: string, patron: RegExp) => texto.match(patron)?.[1]?.replace(/\s+/g, ' ').trim();

function numero(texto?: string): number | undefined {
  if (!texto) return undefined;
  const limpio = texto.replace(/[^\d.,]/g, '');
  // 357,465.81 · 357.465,81 · 357465.81
  const decimal = /,\d{2}$/.test(limpio) ? ',' : '.';
  const n = Number(decimal === ',' ? limpio.replace(/\./g, '').replace(',', '.') : limpio.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function datosDeContrato(texto: string): DatosObra {
  const t = texto.replace(/\r/g, '');
  const contratista = valor(t, /\bCONTRATISTA\s*[:：]\s*([^\n,;]{3,120})/i);
  const supervisor = valor(t, /\b(?:SUPERVISOR|INSPECTOR)(?:\s+DE\s+(?:LA\s+)?OBRA)?\s*[:：]\s*([^\n;]{3,140})/i);
  const textoInicio = valor(t, /(?:INICIO\s+DEL\s+PLAZO(?:\s+DE\s+EJECUCI[OÓ]N)?|FECHA\s+DE\s+INICIO(?:\s+DE\s+(?:LA\s+)?OBRA)?)\s*[:：]?\s*([^\n]{6,60})/i);
  const inicio = textoInicio ? fechasEnTexto(textoInicio).find((f) => !f.fecha.startsWith('????'))?.fecha : undefined;
  const plazo = valor(t, /PLAZO(?:\s+DE\s+EJECUCI[OÓ]N)?(?:\s+DE\s+(?:LA\s+)?OBRA)?\s*[:：]?\s*(\d{1,4})\s*\(?[^\n)]{0,30}\)?\s*D[IÍ]AS/i);
  const monto = numero(valor(t, /MONTO\s+(?:TOTAL\s+)?(?:DEL\s+CONTRATO|CONTRACTUAL|CONTRATADO)\s*[:：]?\s*S\/\.?\s*([\d.,]+)/i));
  return { contratista, supervisor, inicio, plazoDias: plazo ? Number(plazo) : undefined, monto };
}

/** La fecha de un documento: la primera fecha completa que trae (encabezado, asiento o firma). */
export function fechaDelDocumento(paginas: string[]): string | undefined {
  return fechasEnTexto(paginas.slice(0, 2).join('\n')).find((f) => !f.fecha.startsWith('????'))?.fecha;
}
