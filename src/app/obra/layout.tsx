import { metadataAxis } from '@/lib/metadata';

export const metadata = metadataAxis('/obra', 'Hallazgos de obra', 'Registra hallazgos de obra en Axis y consulta las pruebas que se pueden aplicar a expedientes posteriores.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
