import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { leerExpediente } from '@/servidor/almacen';
import { ConfirmarDocumentos } from '@/componentes/revision/ConfirmarDocumentos';
import { Revision } from '@/componentes/revision/Revision';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

async function cargar(id: string) {
  return leerExpediente(id).catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await cargar((await params).id);
  return { title: e ? e.clave : 'Revisión' };
}

export default async function PaginaRevision({ params }: Props) {
  const expediente = await cargar((await params).id);
  if (!expediente) notFound();
  return expediente.estado === 'por-confirmar'
    ? <ConfirmarDocumentos expediente={expediente} />
    : <Revision key={expediente.ejecucion.length + expediente.hallazgos.length} expediente={expediente} />;
}
