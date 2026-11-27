import { fechasEnTexto } from '@/dominio/fechas';
import { conVias } from '../motores/identidad';
import { frase } from '../texto';

// Los datos del procedimiento de selección están en las bases (y en parte en cada oferta):
// entidad, nomenclatura, objeto, valor referencial y fecha de la buena pro.

export interface DatosProcedimiento {
  nomenclatura?: string; objeto?: string; entidad?: string; valorReferencial?: number;
  fechaBuenaPro?: string; procedimiento?: 'abreviada' | 'licitacion';
}

const limpio = (s?: string) => s?.replace(/\s+/g, ' ').replace(/^[«"“\s]+|[»"”.\s]+$/g, '').trim() || undefined;
const valor = (t: string, re: RegExp) => limpio(t.match(re)?.[1]);

function monto(s?: string): number | undefined {
  if (!s) return undefined;
  const d = s.replace(/[^\d.,]/g, '');
  const n = Number(/,\d{2}$/.test(d) ? d.replace(/\./g, '').replace(',', '.') : d.replace(/,/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/** Las bases traen el valor referencial; una oferta, su Anexo 6. */
export function esDocumentoDeBases(texto: string): boolean {
  return /VALOR\s+REFERENCIAL/i.test(texto) && /(BASES|DATOS\s+DEL\s+PROCEDIMIENTO|CONVOCATORIA)/i.test(texto) && !/ANEXO\s+N[º°o]?\s*6/i.test(texto);
}

export function datosDelProcedimiento(texto: string): DatosProcedimiento {
  const t = texto.replace(/\r/g, '');
  const larga = t.match(/LICITACI[OÓ]N\s+P[UÚ]BLICA(\s+ABREVIADA)?\s+N[º°o]?\s*([\w-]+-\d{4}-[\w/-]+)/i);
  const nomenclatura = valor(t, /NOMENCLATURA\s*[:：]\s*([^\n]{5,60})/i) ?? (larga ? `LP-${larga[1] ? 'ABR-' : ''}${larga[2]}` : undefined);
  // El nombre de la obra suele ocupar más de una línea: se lee hasta la siguiente etiqueta.
  const objeto = valor(t, /OBJETO(?:\s+DE\s+LA\s+CONVOCATORIA)?\s*[:：]\s*([\s\S]{10,300}?)(?=\n\s*[A-ZÁÉÍÓÚÑ ]{4,}\s*[:：]|\n\s*\n|$)/i) ?? valor(t, /ejecuci[oó]n\s+de\s+la\s+obra\s+[«"“]([^»"”]{10,250})[»"”]/i);
  const entidad = valor(t, /ENTIDAD(?:\s+CONVOCANTE)?\s*[:：]\s*([^\n]{5,120})/i);
  const valorReferencial = monto(valor(t, /VALOR\s+REFERENCIAL\s*[:：]?\s*(?:S\/\.?)?\s*([\d.,]{4,})/i));
  const textoBuenaPro = valor(t, /(?:OTORGAMIENTO\s+DE\s+LA\s+BUENA\s+PRO|BUENA\s+PRO)\s*[:：]?\s*([^\n]{6,40})/i);
  const fechaBuenaPro = textoBuenaPro ? fechasEnTexto(textoBuenaPro).find((f) => !f.fecha.startsWith('????'))?.fecha : undefined;
  const procedimiento = /ABREVIADA/i.test(nomenclatura ?? '') || /PROCEDIMIENTO\s*[:：][^\n]*ABREVIADA/i.test(t) ? 'abreviada' : /LICITACI[OÓ]N\s+P[UÚ]BLICA/i.test(t) ? 'licitacion' : undefined;
  return { nomenclatura, objeto: objeto && objeto === objeto.toUpperCase() ? conVias(frase(objeto)) : objeto, entidad, valorReferencial, fechaBuenaPro, procedimiento };
}

/** Combina lo que trae cada documento: gana el primero que trae el dato (las bases van primero). */
export function combinar(datos: DatosProcedimiento[]): DatosProcedimiento {
  const salida: DatosProcedimiento = {};
  for (const d of datos) for (const [k, v] of Object.entries(d)) if (v !== undefined && salida[k as keyof DatosProcedimiento] === undefined) (salida as Record<string, unknown>)[k] = v;
  return salida;
}
