'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icono, type NombreIcono } from './Icono';

const SECCIONES: { href: string; texto: string; icono: NombreIcono; activa: (ruta: string) => boolean }[] = [
  { href: '/', texto: 'Revisar expedientes', icono: 'files', activa: (r) => r === '/' || r.startsWith('/revision') },
  { href: '/obras', texto: 'Obras terminadas y paralizadas', icono: 'layers', activa: (r) => r.startsWith('/obras') },
  { href: '/como-funciona', texto: 'Cómo funciona', icono: 'list', activa: (r) => r.startsWith('/como-funciona') },
];

export function Encabezado() {
  const ruta = usePathname();
  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link className="brand" href="/" aria-label="AXIS, inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/axis-logo.svg" alt="AXIS" width={118} height={36} />
        </Link>
        <nav className="main-nav" aria-label="Navegación principal">
          {SECCIONES.map((s) => (
            <Link key={s.href} href={s.href} aria-current={s.activa(ruta) ? 'page' : undefined}>
              <Icono nombre={s.icono} tamano={17} />{s.texto}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
