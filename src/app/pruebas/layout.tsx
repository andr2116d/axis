import { metadataAxis } from '@/lib/metadata';

export const metadata = metadataAxis('/pruebas', 'Biblioteca de pruebas', 'Consulta las verificaciones de Axis, su origen en obras anteriores y la evidencia que sustenta cada observación.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
