import { notFound, redirect } from 'next/navigation';
import { leerExpediente } from '@/servidor/almacen';
import { Carta } from '@/componentes/revision/Carta';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Carta de observaciones' };

export default async function PaginaCarta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const expediente = await leerExpediente(id).catch(() => null);
  if (!expediente) notFound();
  if (expediente.estado !== 'analizado') redirect(`/revision/${id}`);
  return <Carta expediente={expediente} />;
}
