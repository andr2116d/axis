import { NextResponse } from 'next/server';
import { agregarSolicitud } from '@/servidor/ejecucion/servicio';
import { error, leerPeticion } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const entrada = await leerPeticion(request, { archivosOpcionales: true }).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  try {
    const s = await agregarSolicitud((await params).id, entrada);
    return NextResponse.json({ id: s.id }, { status: 201 });
  } catch (e) {
    return error((e as Error).message, 400);
  }
}
