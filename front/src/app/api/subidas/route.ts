import { NextResponse } from 'next/server';
import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned, type HandleUploadPresignedBody } from '@vercel/blob/client';
import { PREFIJO_SUBIDAS } from '@/servidor/almacen';
import { EXTENSIONES, MAXIMO_ARCHIVO, error } from '@/servidor/http';

// Autoriza que el navegador suba un archivo directo al store privado de Blob,
// solo bajo subidas/ y solo PDF, Excel o Word de hasta 60 MB. El store usa
// credenciales OIDC, así que se firma con un token delegado de corta duración.

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const respuesta = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (ruta) => {
        if (!ruta.startsWith(PREFIJO_SUBIDAS) || ruta.includes('..') || !EXTENSIONES.test(ruta)) throw new Error('Archivo no permitido.');
        const token = await issueSignedToken({
          pathname: ruta,
          operations: ['put'],
          maximumSizeInBytes: MAXIMO_ARCHIVO,
          validUntil: Date.now() + 15 * 60 * 1000,
        });
        return { token, urlOptions: { addRandomSuffix: false, maximumSizeInBytes: MAXIMO_ARCHIVO } };
      },
    });
    return NextResponse.json(respuesta);
  } catch (e) {
    return error((e as Error).message);
  }
}
