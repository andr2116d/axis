'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SituacionObra } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { SelectorArchivos, enviar } from '../SelectorArchivos';

export interface OpcionExpediente { id: string; clave: string; nombre: string }

export function RegistroObra({ expedientes, subidaDirecta, preseleccion }: { expedientes: OpcionExpediente[]; subidaDirecta: boolean; preseleccion?: string }) {
  const router = useRouter();
  const avisar = useAviso();
  const [expedienteId, setExpedienteId] = useState(expedientes.find((e) => e.id === preseleccion)?.id ?? expedientes[0]?.id ?? '');
  const [situacion, setSituacion] = useState<SituacionObra>('paralizada');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');

  if (!expedientes.length) {
    return (
      <section className="content-panel learn-input">
        <h2>Primero, el expediente original</h2>
        <p>Para aprender de una obra, Axis la compara con el expediente que se aprobó. Sube y revisa ese expediente antes de registrar la obra.</p>
        <div className="intake-actions"><a className="btn primary" href="/#cargar"><Icono nombre="upload" tamano={18} />Subir el expediente</a></div>
      </section>
    );
  }

  const registrar = async () => {
    setEnviando(true);
    setError('');
    try {
      await enviar<{ id: string }>('/api/obras', archivos, { expedienteId, situacion }, subidaDirecta, setProgreso);
      setArchivos([]);
      avisar('Obra registrada.');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section className="content-panel learn-input">
      <h2>Registrar una obra</h2>
      <p>Elige el expediente con el que se ejecutó la obra y adjunta lo que pasó en ella: informe de paralización, liquidación, actas, adicionales, ampliaciones o informes de control.</p>
      <div className="form-grid">
        <label htmlFor="expediente">Expediente original</label>
        <select id="expediente" value={expedienteId} onChange={(e) => setExpedienteId(e.target.value)}>
          {expedientes.map((e) => <option key={e.id} value={e.id}>{e.clave} · {e.nombre}</option>)}
        </select>
        <fieldset className="choice-row">
          <legend>Situación de la obra</legend>
          {(['paralizada', 'terminada'] as const).map((s) => (
            <label key={s} className="choice"><input type="radio" name="situacion" value={s} checked={situacion === s} onChange={() => setSituacion(s)} />{s === 'paralizada' ? 'Paralizada' : 'Terminada'}</label>
          ))}
        </fieldset>
      </div>
      <SelectorArchivos archivos={archivos} alCambiar={setArchivos} titulo="Documentos de la obra" ayuda="PDF, Excel o Word" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="intake-actions">
        <button type="button" className="btn primary" disabled={!archivos.length || enviando} aria-busy={enviando} onClick={registrar}>
          <Icono nombre={enviando ? 'clock' : 'check'} tamano={18} />{enviando ? progreso || 'Leyendo documentos…' : 'Registrar obra'}
        </button>
      </div>
    </section>
  );
}
