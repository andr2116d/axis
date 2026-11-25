'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import type { Expediente, Prioridad } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { PRIORIDADES } from '../ui';
import { guardarCarta } from './guardar-carta';

const SECCIONES: [Prioridad, string][] = [['alta', 'Prioridad alta'], ['media', 'Prioridad media'], ['confirmar', 'Solicitudes de confirmación']];

export function Carta({ expediente }: { expediente: Expediente }) {
  const e = expediente;
  const avisar = useAviso();
  const [incluidos, setIncluidos] = useState(() => new Set(e.carta.incluidos));
  const [destinatario, setDestinatario] = useState(e.carta.destinatario);
  const pausa = useRef<ReturnType<typeof setTimeout>>(undefined);

  const elegidos = e.hallazgos.filter((h) => incluidos.has(h.id));
  const excluidos = e.hallazgos.filter((h) => !incluidos.has(h.id));
  const secciones = SECCIONES.map(([p, t]) => [p, t, elegidos.filter((h) => h.prioridad === p)] as const).filter(([, , items]) => items.length);

  const cambiar = (siguiente: Set<string>, mensaje: string) => {
    setIncluidos(siguiente);
    avisar(mensaje);
    guardarCarta(e.id, { incluidos: [...siguiente] }).catch(() => avisar('No se pudo guardar el cambio.'));
  };
  const escribirDestinatario = (valor: string) => {
    setDestinatario(valor);
    clearTimeout(pausa.current);
    pausa.current = setTimeout(() => guardarCarta(e.id, { destinatario: valor }).catch(() => avisar('No se pudo guardar el destinatario.')), 500);
  };

  return (
    <>
      <div className="report-actions"><Link href={`/revision/${e.id}`} className="back"><Icono nombre="back" tamano={17} /> Volver a la revisión</Link></div>
      <section className="page-lead report-lead">
        <div><h1>Carta de observaciones</h1><p>{e.nombre}</p></div>
        {elegidos.length > 0 && <button type="button" className="btn primary" onClick={() => window.print()}><Icono nombre="print" tamano={18} />Imprimir o guardar PDF</button>}
      </section>
      <div className="report-layout">
        <article className="report-sheet">
          <header className="letter-header">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/axis-logo.svg" alt="AXIS" width={118} height={36} />
            <span className="mono">{e.clave}</span>
          </header>
          <h2>Revisión del expediente técnico</h2>
          <p className="letter-project">{e.nombre}</p>
          {destinatario.trim() && <p className="letter-recipient"><b>Destinatario:</b> {destinatario}</p>}
          {secciones.length ? secciones.map(([p, titulo, items]) => (
            <section key={p} className={`letter-section letter-${p}`} id={`carta-${p}`} tabIndex={-1}>
              <h3><Icono nombre={PRIORIDADES[p].icono} tamano={22} /> {titulo}<span>{items.length}</span></h3>
              <ol>
                {items.map((h) => (
                  <li key={h.id}>
                    <div className="letter-row-heading">
                      <div><span className="letter-id">{h.id}</span><h4>{h.titulo}</h4></div>
                      <button type="button" className="btn letter-remove" aria-label={`Quitar de la carta: ${h.titulo}`}
                        onClick={() => { const s = new Set(incluidos); s.delete(h.id); cambiar(s, 'Observación retirada de la carta.'); }}>
                        <Icono nombre="close" tamano={15} /> Quitar
                      </button>
                    </div>
                    <div className="letter-request"><strong>Se solicita</strong><p>{h.solicitud ?? h.accion}</p></div>
                    <p className="letter-detail">{h.detalle}</p>
                    <div className="letter-sources"><b>Evidencia</b>
                      <ul>{h.fuentes.map((f, i) => <li key={i}><Icono nombre="file" tamano={15} /> <span>{f.documento}</span> <span>· {f.pagina}</span></li>)}</ul>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )) : (
            <div className="letter-empty">
              <h3>{e.hallazgos.length ? 'La carta quedó sin puntos' : 'Esta revisión no generó observaciones'}</h3>
              <p>{e.hallazgos.length ? 'Reincorpora los que quieras incluir desde el panel de edición.' : 'Los motores que corrieron no encontraron observaciones para la carta.'}</p>
            </div>
          )}
        </article>
        <aside className="report-sidebar">
          <section className="content-panel report-controls">
            <h2>Contenido de la carta</h2>
            <p><b>{elegidos.length}</b> de {e.hallazgos.length} puntos incluidos.</p>
            {secciones.length > 0 && (
              <div className="letter-index" role="group" aria-label="Ir a una sección de la carta">
                {secciones.map(([p, titulo, items]) => (
                  <button key={p} type="button" className={`letter-jump ${p}`} onClick={() => document.getElementById(`carta-${p}`)?.scrollIntoView({ block: 'start' })}>
                    <Icono nombre={PRIORIDADES[p].icono} tamano={17} /><span>{titulo}</span><b>{items.length}</b><Icono nombre="chevron" tamano={15} />
                  </button>
                ))}
              </div>
            )}
            <label htmlFor="destinatario">Destinatario</label>
            <input id="destinatario" value={destinatario} placeholder="p. ej. Proyectista o consultor" onChange={(x) => escribirDestinatario(x.target.value)} />
            {excluidos.length > 0 && (
              <details className="removed-findings" open={!elegidos.length}>
                <summary>Excluidas ({excluidos.length})</summary>
                <ul>
                  {excluidos.map((h) => (
                    <li key={h.id}><span>{h.titulo}</span>
                      <button type="button" className="text-link" aria-label={`Reincorporar: ${h.titulo}`} onClick={() => cambiar(new Set(incluidos).add(h.id), 'Observación reincorporada.')}>Reincorporar</button>
                    </li>
                  ))}
                </ul>
                {excluidos.length > 1 && <button type="button" className="btn secondary" onClick={() => cambiar(new Set(e.hallazgos.map((h) => h.id)), 'Todos los puntos están en la carta.')}><Icono nombre="check" tamano={18} />Reincorporar todas</button>}
              </details>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
