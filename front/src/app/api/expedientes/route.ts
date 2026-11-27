import { NextResponse } from 'next/server';
import { recibirExpediente } from '@/servidor/expedientes';
import { listarExpedientes } from '@/servidor/almacen';
import { error, leerPeticion } from '@/servidor/http';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET() {
  const expedientes = await listarExpedientes();
  return NextResponse.json(expedientes.map(({ id, clave, nombre, lugar, estado, creado }) => ({ id, clave, nombre, lugar, estado, creado })));
}

export async function POST(request: Request) {
  const entrada = await leerPeticion(request).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  try {
    const expediente = await recibirExpediente(entrada.archivos, { versionDe: entrada.campos.versionDe || undefined });
    return NextResponse.json({ id: expediente.id }, { status: 201 });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
