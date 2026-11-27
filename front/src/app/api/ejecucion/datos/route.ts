import { NextResponse } from 'next/server';
import { error, leerPeticion } from '@/servidor/http';
import { leerDocumento } from '@/servidor/motores/lectura';
import { datosDeContrato } from '@/servidor/ejecucion/contrato-obra';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Lee el contrato o el acta de inicio y devuelve los datos para registrar la obra. */
export async function POST(request: Request) {
  const entrada = await leerPeticion(request).catch((e: Error) => e.message);
  if (typeof entrada === 'string') return error(entrada);
  const textos: string[] = [];
  for (const archivo of entrada.archivos) {
    const lectura = await leerDocumento(archivo.nombre, archivo.datos);
    textos.push(lectura.paginas.join('\n'));
  }
  const datos = datosDeContrato(textos.join('\n'));
  if (!Object.values(datos).some((v) => v !== undefined)) return error('No se encontraron los datos del contrato en el documento. Complétalos a mano.');
  return NextResponse.json(datos);
}
