import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Encabezado } from '@/componentes/Encabezado';
import { ProveedorAviso } from '@/componentes/Aviso';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'AXIS · Revisión de expedientes', template: '%s · AXIS' },
  description: 'Revisión de expedientes técnicos de obra que aprende de las obras terminadas y paralizadas.',
  icons: { icon: '/icono.svg' },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE">
      <head>
        <link rel="preload" href="/fonts/public-sans.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>
        <a className="skip" href="#contenido">Saltar al contenido</a>
        <ProveedorAviso>
          <Encabezado />
          <main id="contenido" className="wrap main" tabIndex={-1}>{children}</main>
          <footer className="site-footer">
            <div className="wrap footer-inner">
              <span><b>AXIS</b> <span className="footer-rule" /> El eje que mantiene todo en su lugar</span>
              <span>Revisión de expedientes técnicos de obra</span>
            </div>
          </footer>
        </ProveedorAviso>
      </body>
    </html>
  );
}
