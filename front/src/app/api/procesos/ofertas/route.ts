import { NextResponse } from 'next/server';
import { leerOfertas } from '@/servidor/seleccion/servicio';
import { error, leerPeticion } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Lee las ofertas (un PDF por postor) y devuelve los datos para que el evaluador los confirme. */
export async function POST(request: Request) {
  const entrada = await leerPeticion(request).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  const vr = Number((entrada.campos.valorReferencial ?? '').replace(/[^\d.]/g, ''));
  return NextResponse.json({ ofertas: await leerOfertas(entrada.archivos, vr) });
}
