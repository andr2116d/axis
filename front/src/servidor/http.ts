import 'server-only';
import { NextResponse } from 'next/server';
import { tomarSubida } from './almacen';

// Entrada de archivos a la API. En local llegan en un formulario multipart; en
// Vercel el navegador los sube directo a Blob (el límite de una petición es 4.5 MB)
// y aquí llega solo la lista de rutas.

export const EXTENSIONES = /\.(pdf|xlsx?|docx?)$/i;
export const MAXIMO_ARCHIVO = 60 * 1024 * 1024;
const MAXIMO_ARCHIVOS = 40;

export interface ArchivoEntrante {
  nombre: string;
  datos: Uint8Array;
}

export function error(mensaje: string, estado = 400) {
  return NextResponse.json({ error: mensaje }, { status: estado });
}

function validar(lista: { nombre: string; bytes: number }[]): string | null {
  if (!lista.length) return 'No llegó ningún archivo.';
  if (lista.length > MAXIMO_ARCHIVOS) return `Se aceptan hasta ${MAXIMO_ARCHIVOS} archivos por carga.`;
  const malo = lista.find((a) => !EXTENSIONES.test(a.nombre) || a.bytes === 0 || a.bytes > MAXIMO_ARCHIVO);
  return malo ? `«${malo.nombre}» no es un PDF, Excel o Word con contenido de hasta 60 MB.` : null;
}

/** Campos de texto y archivos de la petición, o un mensaje que explica por qué no. */
export async function leerPeticion(request: Request): Promise<{ campos: Record<string, string>; archivos: ArchivoEntrante[] } | string> {
  if (request.headers.get('content-type')?.includes('application/json')) {
    const cuerpo = (await request.json().catch(() => null)) as { campos?: Record<string, unknown>; subidas?: { ruta?: unknown; nombre?: unknown }[] } | null;
    const subidas = (cuerpo?.subidas ?? []).filter((s): s is { ruta: string; nombre: string } => typeof s.ruta === 'string' && typeof s.nombre === 'string');
    const archivos: ArchivoEntrante[] = [];
    for (const s of subidas) archivos.push({ nombre: s.nombre, datos: await tomarSubida(s.ruta) });
    const fallo = validar(archivos.map((a) => ({ nombre: a.nombre, bytes: a.datos.byteLength })));
    if (fallo) return fallo;
    const campos = Object.fromEntries(Object.entries(cuerpo?.campos ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
    return { campos, archivos };
  }
  const form = await request.formData();
  const lista = form.getAll('archivos').filter((a): a is File => a instanceof File);
  const fallo = validar(lista.map((a) => ({ nombre: a.name, bytes: a.size })));
  if (fallo) return fallo;
  const campos: Record<string, string> = {};
  form.forEach((v, k) => { if (typeof v === 'string') campos[k] = v; });
  return { campos, archivos: await Promise.all(lista.map(async (a) => ({ nombre: a.name, datos: new Uint8Array(await a.arrayBuffer()) }))) };
}
