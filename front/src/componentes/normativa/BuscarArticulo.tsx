'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NOMBRE_NORMA, hrefArticulo, type Norma } from '@/dominio/normativa';

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Búsqueda por número o por palabras del título del artículo. */
export function BuscarArticulo({ articulos }: { articulos: { norma: Norma; n: number; titulo: string }[] }) {
  const [q, setQ] = useState('');
  const resultados = useMemo(() => {
    const t = normalizar(q.trim());
    if (!t) return [];
    const num = t.match(/^(?:art\.?\s*)?(\d+)/)?.[1];
    return articulos.filter((a) => (num ? String(a.n) === num : normalizar(a.titulo).includes(t))).slice(0, 12);
  }, [q, articulos]);
  return (
    <div className="buscar-articulo">
      <label className="campo campo-ancho"><span>Buscar un artículo</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Por número (200) o tema (ampliación de plazo, adicionales…)" /></label>
      {q.trim() && (
        resultados.length
          ? <ul>{resultados.map((a) => <li key={a.norma + a.n}><Link href={hrefArticulo(a.norma, a.n)}><span className="mono">{NOMBRE_NORMA[a.norma]} · art. {a.n}</span>{a.titulo}</Link></li>)}</ul>
          : <p className="inline-note">Ningún título coincide. Prueba con otra palabra.</p>
      )}
    </div>
  );
}
