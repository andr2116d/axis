import type { NivelSenal, SenalSeleccion } from '@/dominio/tipos';

// Antecedentes de un proveedor con datos oficiales: sanciones del Tribunal y penalidades
// (OECE), e historial de obras en La Libertad (OCDS). Informa hechos registrados, con su
// resolución y fecha; no acusa. Portado de la verificación del ganador de la versión anterior.

export interface Inhabilitacion { resolucion: string; tipo?: string; periodo?: string | null; desde: string | null; hasta: string | null; motivo: string; fuente: string }
export interface Multa { resolucion: string; desde: string | null; hasta: string | null; motivo: string; monto: number | null; fuente: string }
export interface Penalidad { contrato: string; tipo: string; objeto: string; entidad: string; fecha: string | null; motivo: string; monto: number | null; fuente: string }
export interface Antecedentes { nombre: string | null; inhabilitaciones: Inhabilitacion[]; multas: Multa[]; penalidades: Penalidad[] }
export interface IndiceProveedores { fuentes: string[]; porRuc: Record<string, Antecedentes> }

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
  miembros?: Record<string, { ruc: string; nombre: string | null; participacion?: number | null }[]>;
}

/** Un RUC válido tiene 11 dígitos y empieza en 10, 15, 17 o 20. */
export const esRuc = (s: string) => /^(10|15|17|20)\d{9}$/.test(s);

const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (x: number) => `${(x * 100).toFixed(1)} %`;
const haceAnios = (fecha: string, anios: number) => `${Number(fecha.slice(0, 4)) - anios}${fecha.slice(4)}`;

function vigenteEn(i: { desde: string | null; hasta: string | null }, fecha: string): boolean {
  if (!i.desde || i.desde > fecha) return false;
  return !i.hasta || i.hasta >= fecha;
}

type Base = Omit<SenalSeleccion, 'id' | 'postor'>;

/** ¿El RUC tiene una inhabilitación vigente a la fecha? (impedido de ser postor). */
export function inhabilitado(ruc: string, fecha: string, idx: IndiceProveedores): boolean {
  return !!idx.porRuc[ruc]?.inhabilitaciones.some((i) => vigenteEn(i, fecha));
}

/** Sanciones y penalidades de un RUC a la fecha de la buena pro. */
export function antecedentesDe(ruc: string, nombre: string, fecha: string, idx: IndiceProveedores): Base[] {
  const a = idx.porRuc[ruc];
  if (!esRuc(ruc)) return [{ nivel: 'media', titulo: `El RUC de ${nombre} no es válido`, detalle: `«${ruc}» no tiene 11 dígitos ni empieza en 10, 15, 17 o 20. Sin RUC no se pueden verificar sanciones.`, accion: 'Pedir el RUC correcto y verificarlo en la Ficha Única del Proveedor.', base: 'Reglamento, art. 36 (FUP)', fuente: 'Formato del RUC (SUNAT)' }];
  if (!a) return [];
  const quien = `${a.nombre ?? nombre} (RUC ${ruc})`;
  const out: Base[] = [];
  const vigentes = a.inhabilitaciones.filter((i) => vigenteEn(i, fecha));
  const recientes = a.inhabilitaciones.filter((i) => !vigenteEn(i, fecha) && i.desde && i.desde >= haceAnios(fecha, 5));
  const listar = (xs: Inhabilitacion[]) => xs.slice(0, 3).map((i) => `Resolución ${i.resolucion} (${i.desde ?? '¿?'} a ${i.hasta ?? 'definitiva'}): ${i.motivo}`).join(' · ') + (xs.length > 3 ? ` · y ${xs.length - 3} más` : '');
  if (vigentes.length) out.push({
    nivel: 'alta',
    titulo: `${nombre}: ${vigentes.length > 1 ? `${vigentes.length} inhabilitaciones vigentes` : 'inhabilitación vigente'} del Tribunal`,
    detalle: `${quien}. ${listar(vigentes)}`,
    accion: 'Un proveedor inhabilitado está impedido de ser postor: la oferta no puede admitirse. Confirmar en la FUP y dejar constancia en el acta.',
    base: 'Ley 32069, art. 30 (impedimentos)',
    fuente: vigentes[0].fuente,
  });
  if (recientes.length) out.push({
    nivel: 'media',
    titulo: `${nombre}: inhabilitado ${recientes.length > 1 ? `${recientes.length} veces ` : ''}en los últimos 5 años`,
    detalle: `${quien}. ${listar(recientes)}`,
    accion: 'Revisar en la FUP que la sanción terminó y considerar el motivo al verificar la oferta.',
    base: 'Reglamento, art. 36 (FUP: desempeño del proveedor)',
    fuente: recientes[0].fuente,
  });
  for (const m of a.multas) {
    if (!m.desde || m.desde < haceAnios(fecha, 5)) continue;
    out.push({ nivel: 'media', titulo: `${nombre}: multado por el Tribunal`, detalle: `${quien}: Resolución ${m.resolucion} (${m.desde})${m.monto ? `, multa de ${soles(m.monto)}` : ''}. ${m.motivo}`, accion: 'Considerarlo en la verificación posterior de la oferta.', base: 'Reglamento, art. 83', fuente: m.fuente });
  }
  const pen = a.penalidades.filter((p) => !p.fecha || p.fecha <= fecha);
  if (pen.length) {
    const total = pen.reduce((s, p) => s + (p.monto ?? 0), 0);
    const obras = pen.filter((p) => /obra/i.test(p.objeto)).length;
    out.push({
      nivel: pen.length >= 3 || obras >= 2 ? 'media' : 'info',
      titulo: `${nombre}: ${pen.length} penalidad${pen.length > 1 ? 'es' : ''} en contratos anteriores`,
      detalle: `${quien}: ${pen.length} penalidad(es) por ${soles(total)}${obras ? `, ${obras} en obras` : ''}. Entidades: ${[...new Set(pen.map((p) => p.entidad))].slice(0, 3).join('; ')}.`,
      accion: 'Tenerlo presente para el control de la ejecución (plazos y penalidades).',
      base: 'Reglamento, art. 36 (desempeño del proveedor)',
      fuente: pen[0].fuente,
    });
  }
  return out;
}

/** Obras previas en La Libertad del RUC (o de consorcios en que participó) con problemas de ejecución. */
export function historialDe(ruc: string, nombre: string, fecha: string, d: DatosCompetencia): Base[] {
  const rucs = new Set([ruc]);
  for (const [cons, ms] of Object.entries(d.miembros ?? {})) if (ms.some((m) => m.ruc === ruc)) rucs.add(cons);
  const previos = d.procesos.filter((p) => p.fecha < fecha && p.ganadores.some((g) => rucs.has(g)) && p.contrato);
  if (!previos.length) return [];
  const R = d.referencia;
  const malos = previos.filter((p) => (p.variacion != null && p.variacion > R.variacion.p90) || p.nulidad || p.resolucion || (p.ampliacionDias != null && p.plazo && p.ampliacionDias / p.plazo > R.ampliacionRel.p90));
  if (!malos.length) return [{ nivel: 'info', titulo: `${nombre}: ${previos.length} obra(s) previa(s) en La Libertad sin señales de ejecución`, detalle: `Contratos 2025-2026, incluidos consorcios en que participó: ${previos.slice(0, 4).map((p) => p.nomenclatura).join('; ')}.`, accion: 'Ninguna.', base: '—', fuente: 'OECE – Contrataciones Abiertas (OCDS)' }];
  const nivel: NivelSenal = malos.length >= 2 ? 'alta' : 'media';
  return [{
    nivel,
    titulo: `${nombre}: problemas de ejecución en ${malos.length} de ${previos.length} obra(s) previa(s)`,
    detalle: malos.slice(0, 4).map((p) => `${p.nomenclatura} (${p.entidad}): ${[p.variacion != null && p.variacion > R.variacion.p90 ? `costo +${pc(p.variacion)}` : '', p.ampliacionDias && p.plazo && p.ampliacionDias / p.plazo > R.ampliacionRel.p90 ? `+${p.ampliacionDias} días de plazo` : '', p.nulidad ? 'nulidad' : '', p.resolucion ? 'resolución del contrato' : ''].filter(Boolean).join(', ')}`).join('; ') + '.',
    accion: 'No cambia el resultado. Considerarlo al planificar la supervisión de la obra.',
    base: 'Reglamento, art. 36 (desempeño del proveedor)',
    fuente: 'OECE – Contrataciones Abiertas (OCDS), La Libertad 2025-2026',
  }];
}
