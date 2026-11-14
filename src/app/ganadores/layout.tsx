import { metadataAxis } from '@/lib/metadata';

export const metadata = metadataAxis('/ganadores', 'Ganadores y proveedores', 'Explora las adjudicaciones de obras de La Libertad y los antecedentes documentados de sus proveedores.');

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
