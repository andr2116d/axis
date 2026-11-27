import { NextResponse } from 'next/server';
import { guardarExpediente, leerExpediente } from '@/servidor/almacen';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const expediente = await leerExpediente((await params).id).catch(() => null);
  return expediente ? NextResponse.json(expediente) : error('Expediente no encontrado', 404);
}

/** Vincula el expediente con su par en el servidor de modelos entrenados. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const expediente = await leerExpediente((await params).id).catch(() => null);
  if (!expediente) return error('Expediente no encontrado', 404);
  const cuerpo = (await request.json().catch(() => null)) as { motorId?: unknown } | null;
  const motorId = cuerpo?.motorId;
  if (typeof motorId !== 'string' || !/^[0-9a-f-]{36}$/i.test(motorId)) return error('Identificador no válido.');
  await guardarExpediente({ ...expediente, motorId });
  return NextResponse.json({ ok: true });
}
