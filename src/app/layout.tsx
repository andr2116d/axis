import type { Metadata, Viewport } from 'next';
import { metadataAxis } from '@/lib/metadata';
import Link from 'next/link';
import { Public_Sans, IBM_Plex_Mono } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';
import { Encabezado } from '@/components/Encabezado';

const fuente = Public_Sans({ subsets: ['latin'], variable: '--font-principal', weight: ['400', '500', '600', '700', '800'] });
const mono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-mono', weight: ['400', '500'] });

export const metadata: Metadata = {
  ...metadataAxis('/', 'Axis', 'Axis revisa expedientes técnicos de pistas y veredas en La Libertad. Encuentra observaciones, consulta la evidencia y prepara el informe de revisión.'),
  icons: { icon: { url: '/icono.svg?v=naranja', type: 'image/svg+xml' }, apple: '/axis-touch.png' },
};

export const viewport: Viewport = { themeColor: '#FCFAF7' };

// Aplica la elección guardada antes de pintar la página.
const restaurarTema = `try {
  const tema = localStorage.getItem('axis:tema');
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.tema = tema;
} catch {}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="es" suppressHydrationWarning className={`${fuente.variable} ${mono.variable}`}>
    <head><script dangerouslySetInnerHTML={{ __html: restaurarTema }} /></head>
    <body className="min-h-screen font-sans">
    <Encabezado />
    <div className="app-body">
      <main id="contenido" tabIndex={-1} className="app-main">{children}</main>
      <footer className="app-footer no-imprimir"><p><b>Axis</b> · Prototipo para Innova Norte 3G</p><Link href="/como-funciona#fuentes" className="enlace">Fuentes y alcance</Link></footer>
    </div>
  </body></html>;
}
