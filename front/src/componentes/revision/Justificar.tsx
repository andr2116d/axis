'use client';

import { useState } from 'react';
import type { Documento, Hallazgo, Justificacion } from '@/dominio/tipos';
import { Icono } from '../Icono';

// Juicio de experto: el evaluador justifica una alerta y Axis revisa la justificación.
// Si la acepta, la alerta queda como «verde justificado»; si no, dice qué falta.

const VEREDICTO = {
  aceptada: { texto: 'Justificación aceptada', clase: 'confirmed', icono: 'check' as const },
  insuficiente: { texto: 'Justificación insuficiente', clase: 'media', icono: 'alert' as const },
  'no-justificable': { texto: 'No se puede justificar', clase: 'alta', icono: 'close' as const },
};

export function Justificar({ expedienteId, h, documentos, actual, alCambiar }: {
  expedienteId: string;
  h: Hallazgo;
  documentos: Documento[];
  actual?: Justificacion;
  alCambiar: (j: Justificacion | null, incluidos: string[]) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(actual?.texto ?? '');
  const [documento, setDocumento] = useState(actual?.documento ?? '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await fetch(`/api/expedientes/${expedienteId}/justificaciones`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hallazgo: h.id, texto, documento }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? 'No se pudo revisar la justificación.');
      alCambiar(datos.justificacion, datos.incluidos);
      if (datos.justificacion?.evaluacion.veredicto === 'aceptada') setAbierto(false);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const retirar = async () => {
    const r = await fetch(`/api/expedientes/${expedienteId}/justificaciones?hallazgo=${h.id}`, { method: 'DELETE' });
    if (r.ok) { alCambiar(null, (await r.json()).incluidos); setTexto(''); setDocumento(''); }
  };

  const v = actual ? VEREDICTO[actual.evaluacion.veredicto] : null;
  return (
    <div className="justificar">
      <h4><Icono nombre="user" tamano={16} /> Juicio de experto</h4>
      {actual && v && (
        <div className={`justificacion-resultado j-${actual.evaluacion.veredicto}`}>
          <span className={`pill ${v.clase}`}><Icono nombre={v.icono} tamano={13} />{v.texto}</span>
          <blockquote>{actual.texto}</blockquote>
          <ul>
            {actual.evaluacion.razones.map((r) => <li key={r} className="j-ok"><Icono nombre="check" tamano={14} />{r}</li>)}
            {actual.evaluacion.faltan.map((r) => <li key={r} className="j-falta"><Icono nombre="alert" tamano={14} />{r}</li>)}
          </ul>
          {actual.evaluacion.respaldo && <p className="j-respaldo"><b>Respaldo:</b> {actual.evaluacion.respaldo.documento}, {actual.evaluacion.respaldo.pagina}: «{actual.evaluacion.respaldo.extracto}»</p>}
          <div className="j-acciones">
            {actual.evaluacion.veredicto !== 'no-justificable' && <button type="button" className="text-link" onClick={() => setAbierto(true)}>Mejorar la justificación</button>}
            <button type="button" className="text-link" onClick={retirar}>Retirar</button>
          </div>
        </div>
      )}
      {!actual && !abierto && (
        <p className="j-intro">
          ¿La alerta no aplica a esta obra por una razón técnica? Justifícala. Axis revisa que el sustento sea pertinente, cuantificado y esté respaldado por un documento antes de aceptarla.
          {' '}<button type="button" className="text-link" onClick={() => setAbierto(true)}>Justificar esta alerta</button>
        </p>
      )}
      {abierto && (
        <div className="j-form">
          <label>
            <span>Justificación técnica</span>
            <textarea rows={4} value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="Ejemplo: la obra está a 6 h de la capital del distrito por trocha; el agregado se lleva en acémila a S/ 85 por viaje, lo que explica el mayor costo (cotización en la memoria, pág. 4)." />
          </label>
          <label>
            <span>Documento del expediente que lo respalda</span>
            <select value={documento} onChange={(x) => setDocumento(x.target.value)}>
              <option value="">Ninguno</option>
              {documentos.map((d) => <option key={d.id} value={d.id}>{d.nombre} ({d.tipo})</option>)}
            </select>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="j-acciones">
            <button type="button" className="btn primary" disabled={enviando || !texto.trim()} onClick={enviar}><Icono nombre={enviando ? 'clock' : 'check'} tamano={17} />{enviando ? 'Revisando…' : 'Revisar justificación'}</button>
            <button type="button" className="btn secondary" onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
