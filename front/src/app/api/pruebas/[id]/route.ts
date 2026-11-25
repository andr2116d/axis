import { NextResponse } from 'next/server';
import { guardarPrueba, leerPrueba } from '@/servidor/almacen';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

/** El evaluador acepta o rechaza una prueba propuesta. Solo las aceptadas corren en las revisiones. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { decision } = ((await request.json().catch(() => ({}))) ?? {}) as { decision?: string };
  if (decision !== 'aceptar' && decision !== 'rechazar') return error('Indica si aceptas o rechazas la prueba.');
  const prueba = await leerPrueba((await params).id).catch(() => null);
  if (!prueba) return error('Prueba no encontrada', 404);
  prueba.estado = decision === 'aceptar' ? 'aceptada' : 'rechazada';
  prueba.decision = { fecha: new Date().toISOString() };
  await guardarPrueba(prueba);
  return NextResponse.json({ id: prueba.id, estado: prueba.estado });
}
