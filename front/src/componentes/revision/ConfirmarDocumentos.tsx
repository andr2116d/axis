'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TIPOS_DOCUMENTO, type Expediente, type TipoDocumento } from '@/dominio/tipos';
import { nombreMotor } from '@/dominio/motores';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { LECTURA, tamano } from '../ui';

/** Motores que corren al confirmar, en el orden del servidor. */
const MOTORES = ['identidad', 'ubicacion', 'verificadores', 'cobertura', 'antecedentes', 'consolidacion'];

export function ConfirmarDocumentos({ expediente }: { expediente: Expediente }) {
  const router = useRouter();
  const avisar = useAviso();
  const [tipos, setTipos] = useState<Record<string, TipoDocumento>>(() => Object.fromEntries(expediente.documentos.map((d) => [d.id, d.tipo])));
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState('');

  const confirmar = async () => {
    setAnalizando(true);
    setError('');
    const r = await fetch(`/api/expedientes/${expediente.id}/analisis`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipos }),
    });
    if (!r.ok) {
      setError(((await r.json().catch(() => ({}))) as { error?: string }).error ?? 'No se pudo revisar el expediente.');
      setAnalizando(false);
      return;
    }
    avisar('Revisión terminada.');
    router.refresh();
  };

  if (analizando) {
    return (
      <section className="loading-review">
        <div className="spinner" aria-hidden="true" />
        <h1>Revisando el expediente</h1>
        <p>{expediente.nombre}</p>
        <ol className="loading-list" aria-live="polite">
          {MOTORES.map((m) => <li key={m}><Icono nombre="clock" tamano={18} /><span>{nombreMotor(m)}</span><small>En cola</small></li>)}
        </ol>
      </section>
    );
  }

  return (
    <section className="content-panel documents-panel">
      <h2>Confirma los documentos</h2>
      <p>Axis leyó cada archivo y sugiere qué parte del expediente es. Corrige lo que no corresponda; las pruebas se eligen según estos tipos.</p>
      <ul className="intake-files">
        {expediente.documentos.map((d) => (
          <li key={d.id}>
            <span className="summary-icon"><Icono nombre="file" tamano={19} /></span>
            <div className="intake-file-name">
              <strong>{d.nombre}</strong>
              <span>{tamano(d.bytes)} · {d.paginas} pág. · {LECTURA[d.lectura]} · {d.sugerencia.tipo === 'Por identificar' ? 'sin sugerencia' : `sugerido ${Math.round(d.sugerencia.confianza * 100)} % (${d.sugerencia.razon.replace(/\.$/, '').toLowerCase()})`}</span>
            </div>
            <label>
              <span className="sr-only">Tipo de {d.nombre}</span>
              <select value={tipos[d.id]} onChange={(e) => setTipos({ ...tipos, [d.id]: e.target.value as TipoDocumento })}>
                {TIPOS_DOCUMENTO.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          </li>
        ))}
      </ul>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="intake-actions">
        <a className="back" href="/"><Icono nombre="back" tamano={17} /> Volver a la carga</a>
        <button type="button" className="btn primary" onClick={confirmar}><Icono nombre="check" tamano={18} />Confirmar y revisar</button>
      </div>
    </section>
  );
}
