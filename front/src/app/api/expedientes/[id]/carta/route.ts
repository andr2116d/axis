import { NextResponse } from 'next/server';
import { actualizarCarta } from '@/servidor/expedientes';
import { error } from '@/servidor/http';
import { CAMPOS_CARTA, type DatosCarta } from '@/dominio/tipos';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return error('Cuerpo no válido.');
  const cambios: Partial<DatosCarta> & { elaboradoPor?: string } = {};
  if (typeof cuerpo.elaboradoPor === 'string') cambios.elaboradoPor = cuerpo.elaboradoPor;
  if (typeof cuerpo.plazoEntregable === 'number') cambios.plazoEntregable = cuerpo.plazoEntregable;
  if (Array.isArray(cuerpo.incluidos)) cambios.incluidos = cuerpo.incluidos.filter((x): x is string => typeof x === 'string');
  for (const campo of CAMPOS_CARTA) if (typeof cuerpo[campo] === 'string') cambios[campo] = cuerpo[campo] as string;
  if (typeof cuerpo.plazo === 'number') cambios.plazo = cuerpo.plazo;
  try {
    const e = await actualizarCarta((await params).id, cambios);
    return NextResponse.json({ ...e.carta, elaboradoPor: e.elaboradoPor });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
