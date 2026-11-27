'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PruebaAprendida } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { avanzarDemo } from '../demo/estado';

/** Prueba que el modelo propone a partir de una obra: el evaluador la compara con las existentes y la acepta o rechaza. */
export function PropuestaPrueba({ prueba, existentes }: { prueba: PruebaAprendida; existentes: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const avisar = useAviso();
  const [enviando, setEnviando] = useState(false);
  const p = prueba;

  const decidir = async (decision: 'aceptar' | 'rechazar') => {
    setEnviando(true);
    const r = await fetch(`/api/pruebas/${p.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ decision }) });
    setEnviando(false);
    if (!r.ok) { avisar('No se pudo guardar la decisión.'); return; }
    avisar(decision === 'aceptar' ? `Prueba ${p.id} aceptada: ya corre en las revisiones.` : `Prueba ${p.id} rechazada.`);
    if (decision === 'aceptar') avanzarDemo({ paso: 5 });
    router.refresh();
  };

  return (
    <div className={`prueba-nueva ${p.estado}`}>
      <span className={`pill ${p.estado === 'aceptada' ? 'confirmed' : p.estado === 'rechazada' ? 'alta' : 'media'}`}>
        <Icono nombre={p.estado === 'aceptada' ? 'check' : p.estado === 'rechazada' ? 'close' : 'clock'} tamano={13} />
        {p.estado === 'propuesta' ? `Prueba propuesta ${p.id}` : `Prueba ${p.id} ${p.estado}`}
      </span>
      <h4>{p.nombre}</h4>
      <p>{p.recomendacion}</p>
      <p className="inline-note">{p.validacion.motivo} Aplica a obras a menos de {p.alcance.radio.toLocaleString('es-PE')} m.{p.validacion.expedientesQueDispara.length ? ` Ya alertaría en: ${p.validacion.expedientesQueDispara.join(', ')}.` : ''}</p>
      {p.estado === 'propuesta' && (
        <>
          <details className="comparar" open>
            <summary>¿Es nueva? Compárala con las {existentes.length} pruebas que Axis ya aprendió</summary>
            {p.relacionadas.length
              ? <ul>{p.relacionadas.map((r) => <li key={r.id}><b>{r.id} · {r.nombre}</b> — parecida, pero {r.diferencia}.</li>)}</ul>
              : <p>Ninguna prueba existente revisa esta condición.</p>}
            <details>
              <summary>Ver la lista completa</summary>
              <ul className="lista-compacta">{existentes.map((x) => <li key={x.id}><span className="mono">{x.id}</span> {x.nombre}</li>)}</ul>
            </details>
          </details>
          <div className="intake-actions">
            <button type="button" className="btn primary" disabled={enviando} onClick={() => decidir('aceptar')}><Icono nombre="check" tamano={17} />Aceptar prueba</button>
            <button type="button" className="btn secondary" disabled={enviando} onClick={() => decidir('rechazar')}><Icono nombre="close" tamano={17} />Rechazar</button>
          </div>
        </>
      )}
    </div>
  );
}
