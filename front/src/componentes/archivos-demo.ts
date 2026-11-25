'use client';

import { useEffect } from 'react';

// Los botones del kit de demo cargan un archivo en el formulario de la página
// (expediente u obra) mediante un evento del navegador.

const EVENTO = 'axis:archivo-demo';

export function cargarDemo(destino: 'expediente' | 'obra', url: string) {
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: { destino, url } }));
}

export function useArchivosDemo(destino: 'expediente' | 'obra', alCargar: (archivo: File) => void) {
  useEffect(() => {
    const escuchar = async (e: Event) => {
      const { destino: d, url } = (e as CustomEvent<{ destino: string; url: string }>).detail;
      if (d !== destino) return;
      const r = await fetch(url);
      const nombre = decodeURIComponent(url.split('/').pop() ?? 'documento.pdf');
      alCargar(new File([await r.blob()], nombre, { type: 'application/pdf' }));
    };
    window.addEventListener(EVENTO, escuchar);
    return () => window.removeEventListener(EVENTO, escuchar);
  }, [destino, alCargar]);
}
