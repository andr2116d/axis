import { NextResponse } from 'next/server';
import { actualizarSolicitud } from '@/servidor/ejecucion/servicio';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return error('Cuerpo no válido.');
  const { id, sid } = await params;
  try {
    const s = await actualizarSolicitud(id, sid, cuerpo);
    return NextResponse.json({ estado: s.estado });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
