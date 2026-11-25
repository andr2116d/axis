import { NextResponse } from 'next/server';
import { leerExpediente } from '@/servidor/almacen';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const expediente = await leerExpediente((await params).id).catch(() => null);
  return expediente ? NextResponse.json(expediente) : error('Expediente no encontrado', 404);
}
