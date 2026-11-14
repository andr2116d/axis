'use client';
import { useEffect, useState } from 'react';

const clave = 'axis:tema';

export function CambiarTema() {
  const [oscuro, setOscuro] = useState(false);

  useEffect(() => {
    const sistema = window.matchMedia('(prefers-color-scheme: dark)');
    function sincronizar() {
      const tema = document.documentElement.dataset.tema;
      const activo = tema ? tema === 'oscuro' : sistema.matches;
      setOscuro(activo);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    }
    function leerOtraPestana(e: StorageEvent) {
      if (e.key !== clave && e.key !== null) return;
      if (e.newValue === 'claro' || e.newValue === 'oscuro') document.documentElement.dataset.tema = e.newValue;
      else delete document.documentElement.dataset.tema;
      sincronizar();
    }
    sincronizar();
    sistema.addEventListener('change', sincronizar);
    window.addEventListener('storage', leerOtraPestana);
    return () => {
      sistema.removeEventListener('change', sincronizar);
      window.removeEventListener('storage', leerOtraPestana);
    };
  }, []);

  function cambiar() {
    const tema = oscuro ? 'claro' : 'oscuro';
    document.documentElement.dataset.tema = tema;
    setOscuro(!oscuro);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    try { window.localStorage.setItem(clave, tema); } catch { /* La selección sigue activa en esta página. */ }
  }

  return (
    <button type="button" className="theme-toggle" onClick={cambiar} aria-label="Modo oscuro" aria-pressed={oscuro} title={oscuro ? 'Usar modo claro' : 'Usar modo oscuro'}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {oscuro ? <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
        </> : <path d="M20.5 14A8.7 8.7 0 0 1 10 3.5 8.8 8.8 0 1 0 20.5 14Z" />}
      </svg>
    </button>
  );
}
