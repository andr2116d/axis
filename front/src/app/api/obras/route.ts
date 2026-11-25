import { NextResponse } from 'next/server';
import { registrarObra } from '@/servidor/obras';
import { error, leerPeticion } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const entrada = await leerPeticion(request).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  const { expedienteId, situacion } = entrada.campos;
  if (!expedienteId) return error('Elige el expediente original de la obra.');
  if (situacion !== 'terminada' && situacion !== 'paralizada') return error('Indica si la obra está terminada o paralizada.');
  try {
    const registro = await registrarObra({ expedienteId, situacion, archivos: entrada.archivos });
    return NextResponse.json({ id: registro.id }, { status: 201 });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
