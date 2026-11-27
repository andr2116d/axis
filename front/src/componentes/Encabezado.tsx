'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icono, type NombreIcono } from './Icono';

// Las tres fases del proceso de obra en que actúa la entidad, más el aprendizaje que las une.
const SECCIONES: { href: string; texto: string; fase?: string; icono: NombreIcono; activa: (ruta: string) => boolean }[] = [
  { href: '/', texto: 'Expediente', fase: '1', icono: 'files', activa: (r) => r === '/' || r.startsWith('/revision') },
  { href: '/seleccion', texto: 'Selección', fase: '2', icono: 'user', activa: (r) => r.startsWith('/seleccion') },
  { href: '/ejecucion', texto: 'Ejecución', fase: '3', icono: 'building', activa: (r) => r.startsWith('/ejecucion') },
  { href: '/obras', texto: 'Aprendizaje', icono: 'layers', activa: (r) => r.startsWith('/obras') || r.startsWith('/pruebas') },
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
              {s.fase ? <span className="nav-fase">{s.fase}</span> : <Icono nombre={s.icono} tamano={17} />}{s.texto}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
