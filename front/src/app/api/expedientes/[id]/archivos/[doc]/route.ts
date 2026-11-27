import { leerArchivo, leerExpediente } from '@/servidor/almacen';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

const TIPOS: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};

/** El archivo original tal como se subió: lo usa la revisión con los modelos entrenados. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string; doc: string }> }) {
  const { id, doc } = await params;
  const expediente = await leerExpediente(id).catch(() => null);
  const documento = expediente?.documentos.find((d) => d.id === doc);
  if (!expediente || !documento) return error('Archivo no encontrado', 404);
  const datos = await leerArchivo('expedientes', id, doc).catch(() => null);
  if (!datos) return error('Archivo no encontrado', 404);
  const extension = documento.nombre.split('.').pop()?.toLowerCase() ?? '';
  return new Response(Buffer.from(datos), {
    headers: { 'content-type': TIPOS[extension] ?? 'application/octet-stream', 'cache-control': 'private, no-store' },
  });
}
