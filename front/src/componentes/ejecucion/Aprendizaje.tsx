'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PruebaAprendida, Solicitud } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { PropuestaPrueba } from '../obras/PropuestaPrueba';

// Aprendizaje desde cada entregable de la obra: cuando una solicitud trae algo que el
// expediente no previó, Axis lo avisa en ese momento y ofrece convertirlo en prueba,
// sin esperar al informe final.

type Existentes = { id: string; nombre: string }[];

const noPrevistas = (s: Solicitud) => s.analisis.condiciones.filter((c) => !c.previsto);
const nombreCorto = (n: string) => n.split(' (')[0].split(':')[0];

function useAprender(obraId: string, s: Solicitud) {
  const router = useRouter();
  const avisar = useAviso();
  const [enviando, setEnviando] = useState(false);
  const url = `/api/ejecucion/${obraId}/solicitudes/${s.id}/aprender`;
  const aprender = async () => {
    setEnviando(true);
    const r = await fetch(url, { method: 'POST' });
    setEnviando(false);
    if (!r.ok) { avisar('Axis no pudo generar la prueba.'); return false; }
    const a = (await r.json()) as Solicitud['aprendizaje'];
    avisar(a?.pruebas.length ? `Axis propone ${a.pruebas.length === 1 ? 'una prueba' : `${a.pruebas.length} pruebas`}: revísala y decide.` : 'No había nada nuevo que aprender.');
    router.refresh();
    return true;
  };
  const posponer = async () => {
    await fetch(url, { method: 'DELETE' }).catch(() => null);
    router.refresh();
  };
  return { aprender, posponer, enviando };
}

function Hallado({ s }: { s: Solicitud }) {
  return (
    <ul className="hallado">
      {noPrevistas(s).map((c) => (
        <li key={c.id}>
          <b>{nombreCorto(c.nombre)}</b>
          <blockquote>{c.frase}<cite>{s.documento?.nombre ?? 'Cuaderno de incidencias'} · solicitud N.° {s.numero}</cite></blockquote>
        </li>
      ))}
    </ul>
  );
}

function Propuestas({ s, pruebas, existentes }: { s: Solicitud; pruebas: PruebaAprendida[]; existentes: Existentes }) {
  const a = s.aprendizaje;
  if (a?.estado === 'sin-prueba') return <p className="inline-note"><Icono nombre="check" tamano={15} />{a.motivo}</p>;
  const lista = (a?.pruebas ?? []).flatMap((id) => pruebas.filter((p) => p.id === id));
  return <>{lista.map((p) => <PropuestaPrueba key={p.id} prueba={p} existentes={existentes} />)}</>;
}

/** Ventana que se abre sola cuando un entregable recién analizado trae algo que el expediente no previó. */
export function AvisoAprendizaje({ obraId, solicitudes, pruebas, existentes, expediente }: { obraId: string; solicitudes: Solicitud[]; pruebas: PruebaAprendida[]; existentes: Existentes; expediente: string }) {
  // Las que ya se mostraron en esta visita no vuelven a abrirse mientras el servidor guarda la decisión.
  const vistas = useRef(new Set<string>());
  const nueva = solicitudes.find((s) => s.aprendizaje?.estado === 'pendiente' && !vistas.current.has(s.id));
  const [sid, setSid] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (nueva && !sid) setSid(nueva.id); }, [nueva, sid]);
  const s = solicitudes.find((x) => x.id === sid);
  useEffect(() => { if (s && !ref.current?.open) ref.current?.showModal(); }, [s]);
  if (!s) return null;
  const cerrar = () => { vistas.current.add(s.id); ref.current?.close(); setSid(null); };
  return <Ventana key={s.id} refDialogo={ref} obraId={obraId} s={s} pruebas={pruebas} existentes={existentes} expediente={expediente} cerrar={cerrar} />;
}

function Ventana({ refDialogo, obraId, s, pruebas, existentes, expediente, cerrar }: { refDialogo: React.RefObject<HTMLDialogElement | null>; obraId: string; s: Solicitud; pruebas: PruebaAprendida[]; existentes: Existentes; expediente: string; cerrar: () => void }) {
  const { aprender, posponer, enviando } = useAprender(obraId, s);
  const decidido = s.aprendizaje?.estado === 'propuesto' || s.aprendizaje?.estado === 'sin-prueba';
  const masTarde = async () => { cerrar(); if (!decidido) await posponer(); };
  return (
    <dialog ref={refDialogo} className="aviso-aprendizaje" aria-labelledby="titulo-aprendizaje" onCancel={(e) => { e.preventDefault(); masTarde(); }}>
      <span className="fase-etiqueta"><Icono nombre="layers" tamano={14} />Aprendizaje</span>
      <h2 id="titulo-aprendizaje">Axis encontró algo que el expediente no previó</h2>
      <p>En la solicitud N.° {s.numero} el contratista describe {noPrevistas(s).length === 1 ? 'una condición' : 'condiciones'} de obra para {noPrevistas(s).length === 1 ? 'la que' : 'las que'} el expediente {expediente} no tiene partidas ni estudios.</p>
      <Hallado s={s} />
      {decidido
        ? <Propuestas s={s} pruebas={pruebas} existentes={existentes} />
        : <p className="inline-note"><Icono nombre="target" tamano={15} />Si lo conviertes en prueba, Axis lo revisará en los próximos expedientes de la zona. No tienes que esperar al informe final de la obra.</p>}
      <div className="intake-actions">
        {decidido
          ? <button type="button" className="btn secondary" onClick={cerrar}>Cerrar</button>
          : <>
            <button type="button" className="btn primary" disabled={enviando} aria-busy={enviando} onClick={aprender}><Icono nombre={enviando ? 'clock' : 'layers'} tamano={17} />{enviando ? 'Comparando con el expediente…' : 'Convertir en prueba'}</button>
            <button type="button" className="btn secondary" disabled={enviando} onClick={masTarde}>Más tarde</button>
          </>}
      </div>
    </dialog>
  );
}

/** Lo mismo dentro de la tarjeta de la solicitud: queda a mano si se eligió «más tarde». */
export function AprendizajeEnSolicitud({ obraId, s, pruebas, existentes }: { obraId: string; s: Solicitud; pruebas: PruebaAprendida[]; existentes: Existentes }) {
  const { aprender, enviando } = useAprender(obraId, s);
  const a = s.aprendizaje;
  if (!a) return null;
  if (a.estado === 'propuesto' || a.estado === 'sin-prueba') {
    return <div className="aprende-solicitud"><Propuestas s={s} pruebas={pruebas} existentes={existentes} /></div>;
  }
  return (
    <div className="aprende-solicitud por-aprender">
      <Icono nombre="layers" tamano={18} />
      <p><b>Para aprender:</b> el expediente no previó {noPrevistas(s).map((c) => nombreCorto(c.nombre).toLowerCase()).join(', ')}.</p>
      <button type="button" className="btn secondary" disabled={enviando} onClick={aprender}>{enviando ? 'Comparando…' : 'Convertir en prueba'}</button>
    </div>
  );
}
