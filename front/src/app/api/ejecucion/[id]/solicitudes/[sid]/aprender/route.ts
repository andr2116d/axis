import { NextResponse } from 'next/server';
import { aprenderDeSolicitud, posponerAprendizaje } from '@/servidor/ejecucion/servicio';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Convierte lo que el expediente no previó en esta solicitud en pruebas propuestas. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  try {
    const s = await aprenderDeSolicitud(id, sid);
    return NextResponse.json(s.aprendizaje);
  } catch (e) {
    return error((e as Error).message, 400);
  }
}

/** «Más tarde»: el aviso no vuelve a abrirse solo; queda marcado en la solicitud. */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  try {
    const s = await posponerAprendizaje(id, sid);
    return NextResponse.json(s.aprendizaje ?? null);
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
