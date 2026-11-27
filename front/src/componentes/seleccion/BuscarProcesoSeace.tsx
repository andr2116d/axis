'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icono } from '../Icono';

// Busca un procedimiento de obra publicado (SEACE / OCDS del OECE) para revisar a sus postores
// contra el registro de sanciones, multas y penalidades.

interface ProcesoResumen { id: string; nomenclatura: string; entidad: string; descripcion: string; monto_referencial: string | null; convocatoria: string | null; postores: number }

const soles = (n: string | null) => (n ? 'S/ ' + Number(n).toLocaleString('es-PE', { maximumFractionDigits: 0 }) : 'sin valor referencial');

export function BuscarProcesoSeace() {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ProcesoResumen[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (texto.trim().length < 3) { setResultados(null); return; }
    const control = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/motor/seleccion/procesos?buscar=${encodeURIComponent(texto.trim())}`, { signal: control.signal });
        if (!r.ok) throw new Error('No se pudo buscar en este momento.');
        setResultados(await r.json());
        setError('');
      } catch (x) {
        if ((x as Error).name !== 'AbortError') setError('No hay conexión con el servidor de Axis.');
      }
    }, 300);
    return () => { clearTimeout(espera); control.abort(); };
  }, [texto]);

  return (
    <section className="content-panel buscar-seace" aria-labelledby="titulo-seace">
      <div className="section-heading">
        <h2 id="titulo-seace">Revisar los postores de un proceso publicado</h2>
        <p>Busca el procedimiento por su número, nomenclatura, entidad, obra o CUI. Axis cruza a cada postor con el registro del OECE a la fecha de la convocatoria.</p>
      </div>
      <label className="campo campo-ancho">
        <span className="sr-only">Buscar proceso</span>
        <input type="search" value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="LP-ABR-7-2026-MPCH, Chepén, movilidad urbana…" />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {resultados && (resultados.length ? (
        <ul className="lista-procesos resultados-seace">
          {resultados.map((p) => (
            <li key={p.id}>
              <Link href={`/seleccion/seace/${p.id}`}><span className="mono">{p.nomenclatura}</span> {p.descripcion.slice(0, 110)}{p.descripcion.length > 110 ? '…' : ''}</Link>
              <small>{p.entidad} · {soles(p.monto_referencial)} · {p.postores} postores{p.convocatoria ? ` · convocado el ${new Date(p.convocatoria + 'T12:00:00').toLocaleDateString('es-PE')}` : ''}</small>
            </li>
          ))}
        </ul>
      ) : <p className="empty-line">No hay procesos que coincidan.</p>)}
      <p className="inline-note"><Icono nombre="lock" tamano={15} /> Datos abiertos: procesos de obra de La Libertad (OCDS) y registro de sanciones del OECE.</p>
    </section>
  );
}
