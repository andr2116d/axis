import { NextResponse } from 'next/server';
import { analizarExpediente } from '@/servidor/expedientes';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const cuerpo = (await request.json().catch(() => null)) as { tipos?: Record<string, string> } | null;
  if (!cuerpo?.tipos || typeof cuerpo.tipos !== 'object') return error('Faltan los tipos de documento confirmados.');
  try {
    return NextResponse.json(await analizarExpediente((await params).id, cuerpo.tipos));
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
