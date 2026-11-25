'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Mensaje breve (toast) anunciado a lectores de pantalla.

const ContextoAviso = createContext<(mensaje: string) => void>(() => {});

export function ProveedorAviso({ children }: { children: ReactNode }) {
  const [mensaje, setMensaje] = useState('');
  const [visible, setVisible] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const avisar = useCallback((texto: string) => {
    setMensaje(texto);
    setVisible(true);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setVisible(false), 2800);
  }, []);

  return (
    <ContextoAviso.Provider value={avisar}>
      {children}
      <div className={`toast${visible ? ' is-visible' : ''}`} role="status" aria-live="polite">{mensaje}</div>
    </ContextoAviso.Provider>
  );
}

export function useAviso() {
  return useContext(ContextoAviso);
}
