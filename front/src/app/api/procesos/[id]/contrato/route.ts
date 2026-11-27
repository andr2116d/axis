import { NextResponse } from 'next/server';
import { verificarContrato } from '@/servidor/seleccion/servicio';
import { error, leerPeticion } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const entrada = await leerPeticion(request).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  try {
    const p = await verificarContrato((await params).id, entrada.archivos);
    return NextResponse.json({ senales: p.verificacion?.senales.length ?? 0 });
  } catch (e) {
    return error((e as Error).message, 400);
  }
}
