import { NextResponse } from 'next/server';
import { crearObra } from '@/servidor/ejecucion/servicio';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return error('Cuerpo no válido.');
  const o = await crearObra(cuerpo);
  if (typeof o === 'string') return error(o);
  return NextResponse.json({ id: o.id }, { status: 201 });
}
