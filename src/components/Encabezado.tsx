'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { actualizar, ROLES, useSesion, type Rol } from '@/lib/sesion';
import { Logo } from './ui';
import { CambiarTema } from './CambiarTema';
import { IconoCerrar, IconoChevron, IconoMenu } from './iconos';

const NAV = [
  { href: '/', texto: 'Revisar', activo: (r: string) => r === '/' || r.startsWith('/revisar') || r.startsWith('/informe') },
  { href: '/pruebas', texto: 'Biblioteca', activo: (r: string) => r.startsWith('/pruebas') },
  { href: '/ganadores', texto: 'Proveedores', activo: (r: string) => r.startsWith('/ganadores') },
  { href: '/obra', texto: 'Hallazgos', activo: (r: string) => r.startsWith('/obra') },
  { href: '/como-funciona', texto: 'Cómo funciona', activo: (r: string) => r.startsWith('/como-funciona') },
];

export function Encabezado() {
  const ruta = usePathname();
  const { rol } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const perfil = useRef<HTMLDetailsElement>(null);
  const cerrar = () => { setAbierto(false); if (perfil.current) perfil.current.open = false; };
  useEffect(cerrar, [ruta]);
  return <>
    <a href="#contenido" className="skip-link">Saltar al contenido</a>
    <header className="site-header no-imprimir" onKeyDown={(e) => {
      if (e.key !== 'Escape') return;
      if (perfil.current?.open) { perfil.current.open = false; perfil.current.querySelector('summary')?.focus(); }
      else if (abierto) { setAbierto(false); boton.current?.focus(); }
    }}>
      <div className="header-inner">
        <a href="/" onClick={cerrar} className="brand" aria-label="Axis, volver al inicio"><Logo /></a>
        <div className="header-controls">
          <CambiarTema />
          <button ref={boton} className="navigation-toggle" onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-controls="navegacion"><span>{abierto ? 'Cerrar' : 'Menú'}</span>{abierto ? <IconoCerrar /> : <IconoMenu />}</button>
        </div>
        <div id="navegacion" className="header-navigation" data-open={abierto}>
          <nav aria-label="Principal">{NAV.map((n) => <Link key={n.href} href={n.href} onClick={cerrar} aria-current={n.activo(ruta) ? 'page' : undefined}>{n.texto}</Link>)}</nav>
          <details ref={perfil} className="profile-options">
            <summary><span>Perfil: {ROLES.find((r) => r.id === rol)?.nombre}</span><IconoChevron className="h-3.5 w-3.5" /></summary>
            <div className="profile-popover"><label htmlFor="perfil-demo" className="rotulo">Perfil de demostración</label><select id="perfil-demo" className="campo mt-2" value={rol} onChange={(e) => actualizar((s) => ({ ...s, rol: e.target.value as Rol }))}>{ROLES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select><p>Cambia el punto de vista de la revisión. No requiere una cuenta.</p></div>
          </details>
        </div>
      </div>
    </header>
  </>;
}
