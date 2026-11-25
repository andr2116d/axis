import type { DatosCarta } from '@/dominio/tipos';

/** Guarda las decisiones del evaluador sobre la carta. */
export async function guardarCarta(id: string, cambios: Partial<DatosCarta>) {
  const r = await fetch(`/api/expedientes/${id}/carta`, {
    method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cambios),
  });
  if (!r.ok) throw new Error('No se pudo guardar la carta.');
  return (await r.json()) as DatosCarta;
}
