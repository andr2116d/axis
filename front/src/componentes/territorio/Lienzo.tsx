'use client';

import { useEffect, useRef, type CanvasHTMLAttributes } from 'react';

// Canvas que se vuelve a dibujar al cambiar de tamaño o cuando cambia `dibujar`.

export function Lienzo({ dibujar, ...props }: { dibujar: (canvas: HTMLCanvasElement) => void } & CanvasHTMLAttributes<HTMLCanvasElement>) {
  const ref = useRef<HTMLCanvasElement>(null);
  const actual = useRef(dibujar);
  actual.current = dibujar;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const observador = new ResizeObserver(() => actual.current(canvas));
    observador.observe(canvas);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (ref.current) dibujar(ref.current);
  }, [dibujar]);

  return <canvas ref={ref} aria-hidden="true" {...props} />;
}
