import { NextResponse } from 'next/server';
import { crearProceso, validarProceso } from '@/servidor/seleccion/servicio';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!cuerpo) return error('Cuerpo no válido.');
  const datos = validarProceso(cuerpo);
  if (typeof datos === 'string') return error(datos);
  const p = await crearProceso(datos);
  return NextResponse.json({ id: p.id }, { status: 201 });
}
