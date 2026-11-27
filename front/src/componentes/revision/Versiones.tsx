'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComparacionVersiones } from '@/dominio/semaforo';
import { Icono } from '../Icono';
import { SelectorArchivos, enviar } from '../SelectorArchivos';

// Ciclo de corrección: el evaluador (o el consultor) sube la versión corregida, Axis la
// revisa con las mismas pruebas y la compara con la anterior: qué se levantó, qué sigue
// y qué apareció. Se repite hasta que el semáforo quede en verde.

export function VersionCorregida({ expedienteId, version, subidaDirecta }: { expedienteId: string; version: number; subidaDirecta: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');

  const subir = async () => {
    setError('');
    try {
      setProgreso('Subiendo la versión corregida…');
      const { id } = await enviar<{ id: string }>('/api/expedientes', archivos, { versionDe: expedienteId }, subidaDirecta, setProgreso);
      setProgreso('Corriendo las pruebas…');
      const e = (await (await fetch(`/api/expedientes/${id}`)).json()) as { documentos: { id: string; tipo: string }[] };
      const r = await fetch(`/api/expedientes/${id}/analisis`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipos: Object.fromEntries(e.documentos.map((d) => [d.id, d.tipo])) }),
      });
      if (!r.ok) throw new Error('No se pudo revisar la versión corregida.');
      router.push(`/revision/${id}`);
    } catch (x) {
      setError((x as Error).message);
      setProgreso('');
    }
  };

  if (!abierto) return <button type="button" className="btn secondary" onClick={() => setAbierto(true)}><Icono nombre="upload" tamano={18} />Subir versión {version + 1}</button>;
  return (
    <div className="version-panel" role="dialog" aria-label="Subir versión corregida">
      <div className="version-panel-head">
        <strong>Versión {version + 1} corregida</strong>
        <button type="button" className="icon-btn" aria-label="Cerrar" onClick={() => setAbierto(false)}><Icono nombre="close" tamano={16} /></button>
      </div>
      <p>Axis la revisa con las mismas pruebas y te muestra qué observaciones se levantaron. Las justificaciones aceptadas se conservan.</p>
      <SelectorArchivos archivos={archivos} alCambiar={setArchivos} titulo="Arrastra el expediente corregido" ayuda="PDF, Excel o Word" />
      {error && <p className="form-error" role="alert">{error}</p>}
      {archivos.length > 0 && <button type="button" className="btn primary" disabled={!!progreso} onClick={subir}><Icono nombre={progreso ? 'clock' : 'arrow'} tamano={18} />{progreso || 'Revisar la versión corregida'}</button>}
    </div>
  );
}

export function BannerVersion({ comparacion: c, anterior, version }: { comparacion: ComparacionVersiones; anterior: { id: string; clave: string; version: number }; version: number }) {
  return (
    <section className="banner-version" aria-label="Comparación con la versión anterior">
      <div>
        <strong>Versión {version} · comparada con la versión {anterior.version} (<Link href={`/revision/${anterior.id}`}>{anterior.clave}</Link>)</strong>
        <ul className="chips">
          <li className="chip-confirmed">Levantadas: {c.levantadas.length}</li>
          <li className="chip-alta">Siguen: {c.persisten.length}</li>
          <li className="chip-confirmar">Nuevas: {c.nuevas.length}</li>
        </ul>
      </div>
      {c.levantadas.length > 0 && (
        <details>
          <summary>Ver las observaciones levantadas</summary>
          <ul className="lista-compacta">{c.levantadas.map((h) => <li key={h.id}><Icono nombre="check" tamano={14} /> {h.titulo}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
