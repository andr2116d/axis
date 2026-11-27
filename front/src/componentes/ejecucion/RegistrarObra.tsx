'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icono } from '../Icono';
import { hoyIso, iso, fechaDe } from '@/dominio/fechas';
import { SelectorArchivos, enviar as enviarArchivos } from '../SelectorArchivos';

/** Por defecto, una obra que empezó hace un mes: así los plazos de los ejemplos corren hoy. */
const haceUnMes = () => { const d = fechaDe(hoyIso()); d.setUTCDate(d.getUTCDate() - 30); return iso(d); };

// Alta de una obra en ejecución: se enlaza al expediente aprobado (con el que se
// cotejará todo lo que pida el contratista) y, si existe, al proceso de selección.

export function RegistrarObra({ expedientes, inicial, subidaDirecta = false }: {
  expedientes: { id: string; clave: string; nombre: string }[];
  inicial?: { expedienteId?: string; procesoId?: string; contratista?: string; monto?: number };
  subidaDirecta?: boolean;
}) {
  const router = useRouter();
  const [expedienteId, setExpedienteId] = useState(inicial?.expedienteId ?? expedientes[0]?.id ?? '');
  const [contratista, setContratista] = useState(inicial?.contratista ?? '');
  const [supervisor, setSupervisor] = useState('');
  const [inicio, setInicio] = useState(haceUnMes);
  const [plazoDias, setPlazoDias] = useState('90');
  const [monto, setMonto] = useState(inicial?.monto ? inicial.monto.toFixed(2) : '');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [documentos, setDocumentos] = useState<File[]>([]);
  const [leyendo, setLeyendo] = useState('');
  const [leido, setLeido] = useState('');

  // El contrato y el acta de inicio traen los datos: Axis los lee y la persona solo confirma.
  const leerDocumentos = async () => {
    setError('');
    try {
      const d = await enviarArchivos<{ contratista?: string; supervisor?: string; inicio?: string; plazoDias?: number; monto?: number }>('/api/ejecucion/datos', documentos, {}, subidaDirecta, setLeyendo);
      if (d.contratista) setContratista(d.contratista);
      if (d.supervisor) setSupervisor(d.supervisor);
      if (d.inicio) setInicio(d.inicio);
      if (d.plazoDias) setPlazoDias(String(d.plazoDias));
      if (d.monto) setMonto(d.monto.toFixed(2));
      const faltan = [!d.contratista && 'contratista', !d.supervisor && 'supervisor', !d.inicio && 'fecha de inicio', !d.plazoDias && 'plazo', !d.monto && 'monto'].filter(Boolean);
      setLeido(faltan.length ? `Leído de ${documentos.length > 1 ? 'los documentos' : documentos[0].name}. Completa: ${faltan.join(', ')}.` : `Todo leído de ${documentos.length > 1 ? 'los documentos' : documentos[0].name}. Revisa y registra.`);
      setDocumentos([]);
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setLeyendo('');
    }
  };

  if (!expedientes.length) {
    return (
      <section className="content-panel">
        <h2>Primero, el expediente aprobado</h2>
        <p>El control de obra coteja cada solicitud con el expediente técnico. Revisa el expediente en la fase 1 antes de registrar la obra.</p>
      </section>
    );
  }

  const enviar = async () => {
    setEnviando(true);
    setError('');
    try {
      const r = await fetch('/api/ejecucion', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expedienteId, contratista, supervisor, inicio, plazoDias: Number(plazoDias), montoContrato: monto, procesoId: inicial?.procesoId }),
      });
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error ?? 'No se pudo registrar la obra.');
      router.push(`/ejecucion/${datos.id}`);
    } catch (x) {
      setError((x as Error).message);
      setEnviando(false);
    }
  };

  return (
    <section className="content-panel form-proceso" aria-labelledby="titulo-registro">
      <h2 id="titulo-registro">Registrar la obra en ejecución</h2>
      <p>Sube el contrato y el acta de entrega de terreno o de inicio de obra: Axis lee los datos y tú solo los confirmas.</p>
      <SelectorArchivos archivos={documentos} alCambiar={setDocumentos} titulo="Arrastra el contrato o el acta de inicio" ayuda="PDF, Word o Excel" />
      {documentos.length > 0 && (
        <div className="upload-actions">
          <button type="button" className="btn primary" disabled={!!leyendo} onClick={leerDocumentos}><Icono nombre={leyendo ? 'clock' : 'files'} tamano={18} />{leyendo || 'Leer los datos de la obra'}</button>
        </div>
      )}
      {leido && <p className="inline-note"><Icono nombre="check" tamano={15} /> {leido}</p>}
      <div className="campos">
        <label className="campo campo-ancho"><span>Expediente técnico aprobado</span>
          <select value={expedienteId} onChange={(x) => setExpedienteId(x.target.value)}>
            {expedientes.map((e) => <option key={e.id} value={e.id}>{e.clave} · {e.nombre}</option>)}
          </select>
        </label>
        <label className="campo"><span>Contratista</span><input value={contratista} onChange={(x) => setContratista(x.target.value)} /></label>
        <label className="campo"><span>Supervisor o inspector</span><input value={supervisor} onChange={(x) => setSupervisor(x.target.value)} /></label>
        <label className="campo"><span>Inicio del plazo de ejecución</span><input type="date" value={inicio} onChange={(x) => setInicio(x.target.value)} /></label>
        <label className="campo"><span>Plazo (días calendario)</span><input type="number" value={plazoDias} onChange={(x) => setPlazoDias(x.target.value)} /></label>
        <label className="campo"><span>Monto del contrato (S/)</span><input type="number" value={monto} onChange={(x) => setMonto(x.target.value)} /><small>Para medir los adicionales frente a los topes de la Ley (art. 64).</small></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions">
        <button type="button" className="btn primary" disabled={enviando || !expedienteId} onClick={enviar}><Icono nombre={enviando ? 'clock' : 'arrow'} tamano={18} />{enviando ? 'Registrando…' : 'Registrar obra'}</button>
      </div>
    </section>
  );
}
