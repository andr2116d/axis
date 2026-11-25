import { NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { PREFIJO_SUBIDAS } from '@/servidor/almacen';
import { EXTENSIONES, MAXIMO_ARCHIVO, error } from '@/servidor/http';

// Autoriza que el navegador suba un archivo directo al store privado de Blob,
// solo bajo subidas/ y solo PDF, Excel o Word de hasta 60 MB.

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const respuesta = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (ruta) => {
        if (!ruta.startsWith(PREFIJO_SUBIDAS) || ruta.includes('..') || !EXTENSIONES.test(ruta)) throw new Error('Archivo no permitido.');
        return { addRandomSuffix: true, maximumSizeInBytes: MAXIMO_ARCHIVO };
      },
    });
    return NextResponse.json(respuesta);
  } catch (e) {
    return error((e as Error).message);
  }
}
