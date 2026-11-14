// Verificación completa del ganador de una obra: antecedentes OECE (también de cada integrante del consorcio),
// historial de ejecución en La Libertad y señales del propio proceso. Solo hechos registrados en fuentes oficiales.

import { historialEjecucion, senalesProceso, type DatosCompetencia } from './competencia';
import { esRuc, verificarProveedor, type Antecedentes } from './proveedor';
import type { Deteccion } from './tipos-analisis';

export function verificarGanador(ruc: string, fecha: string, idx: Record<string, Antecedentes>, comp?: DatosCompetencia, proceso?: string): Deteccion[] {
  const out: Deteccion[] = [];
  const miembros = comp?.miembros?.[ruc];
  if (!esRuc(ruc) && miembros?.length) {
    out.push({ verificador: 'P-PROVEEDOR', resultado: 'pasa', severidad: 'baja', titulo: `Consorcio de ${miembros.length} integrantes identificados en su contrato de consorcio`,
      detalle: `Integrantes leídos del contrato publicado en el SEACE: ${miembros.map((m) => `${m.nombre ?? 'persona natural'} (RUC ${m.ruc}${m.participacion ? `, ${m.participacion}%` : ''})`).join('; ')}. Cada uno se verifica por separado.`, evidencias: [] });
    for (const m of miembros) {
      const det = verificarProveedor(m.ruc, fecha, idx[m.ruc], `El integrante ${m.nombre ?? 'RUC ' + m.ruc}`);
      out.push(...det.filter((d) => d.resultado !== 'pasa'));
    }
  } else out.push(...verificarProveedor(ruc, fecha, idx[ruc]));
  if (comp) {
    out.push(...historialEjecucion(ruc, comp, fecha));
    const p = proceso ? comp.procesos.find((x) => x.proceso === proceso) : undefined;
    if (p) out.push(...senalesProceso(p, comp));
  }
  return out;
}
