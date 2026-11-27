import { NextResponse } from 'next/server';
import { justificar, retirarJustificacion } from '@/servidor/justificaciones';
import { error } from '@/servidor/http';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const cuerpo = (await request.json().catch(() => null)) as { hallazgo?: unknown; texto?: unknown; documento?: unknown } | null;
  if (!cuerpo || typeof cuerpo.hallazgo !== 'string' || typeof cuerpo.texto !== 'string') return error('Falta la alerta o el texto de la justificación.');
  try {
    const e = await justificar((await params).id, { hallazgo: cuerpo.hallazgo, texto: cuerpo.texto, documento: typeof cuerpo.documento === 'string' && cuerpo.documento ? cuerpo.documento : undefined });
    return NextResponse.json({ justificacion: e.justificaciones?.find((j) => j.hallazgo === cuerpo.hallazgo), incluidos: e.carta.incluidos });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}

export async function DELETE(request: Request, { params }: Ctx) {
  const hallazgo = new URL(request.url).searchParams.get('hallazgo');
  if (!hallazgo) return error('Falta la alerta.');
  try {
    const e = await retirarJustificacion((await params).id, hallazgo);
    return NextResponse.json({ incluidos: e.carta.incluidos });
  } catch (e) {
    return error((e as Error).message, 404);
  }
}
