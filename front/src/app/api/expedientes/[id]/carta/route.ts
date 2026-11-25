import { NextResponse } from 'next/server';
import { actualizarCarta } from '@/servidor/expedientes';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cuerpo = (await request.json().catch(() => null)) as { incluidos?: unknown; destinatario?: unknown } | null;
  if (!cuerpo) return error('Cuerpo no válido.');
  const incluidos = Array.isArray(cuerpo.incluidos) ? cuerpo.incluidos.filter((x): x is string => typeof x === 'string') : undefined;
  const destinatario = typeof cuerpo.destinatario === 'string' ? cuerpo.destinatario : undefined;
  try {
    const e = await actualizarCarta((await params).id, { incluidos, destinatario });
    return NextResponse.json(e.carta);
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
