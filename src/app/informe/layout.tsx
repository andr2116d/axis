import { metadataAxis } from '@/lib/metadata';

export const metadata = metadataAxis('/informe', 'Informe de revisión', 'Consulta e imprime el informe del expediente revisado en esta pestaña con Axis.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
