'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PruebaAprendida, Solicitud } from '@/dominio/tipos';
import { diasEntre, fechaCorta, hoyIso } from '@/dominio/fechas';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { SelectorArchivos, enviar } from '../SelectorArchivos';
import type { EjemploSolicitud } from './ejemplos';
import { AprendizajeEnSolicitud } from './Aprendizaje';
import { Cita } from '../Cita';

const TIPOS: [string, string][] = [
  ['', 'Que Axis lo identifique'], ['ampliacion', 'Ampliación de plazo'], ['consulta', 'Consulta'],
  ['adicional', 'Prestación adicional'], ['valorizacion', 'Valorización'], ['otro', 'Otra anotación'],
];

export function NuevaSolicitud({ obraId, subidaDirecta, ejemplos }: { obraId: string; subidaDirecta: boolean; ejemplos: EjemploSolicitud[] }) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [tipo, setTipo] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');

  const usar = (x: EjemploSolicitud) => { setTexto(x.texto); setFecha(x.fecha); setTipo(x.tipo); };
  const analizar = async () => {
    setError('');
    setProgreso('Leyendo la solicitud…');
    try {
      await enviar<{ id: string }>(`/api/ejecucion/${obraId}/solicitudes`, archivos, { texto, fecha, tipo }, subidaDirecta, setProgreso);
      setTexto(''); setArchivos([]); setTipo('');
      router.refresh();
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setProgreso('');
    }
  };

  return (
    <section className="content-panel nueva-solicitud" aria-labelledby="titulo-nueva">
      <h2 id="titulo-nueva">Llegó una solicitud del contratista</h2>
      <p>Pega el asiento del cuaderno de incidencias o sube el documento. Axis la clasifica, calcula tus plazos y la coteja con el expediente.</p>
      {ejemplos.length > 0 && (
        <div className="ejemplos"><span>Probar con un ejemplo:</span>{ejemplos.map((x) => <button key={x.etiqueta} type="button" className="chip-boton" onClick={() => usar(x)}>{x.etiqueta}</button>)}</div>
      )}
      <label className="campo campo-ancho"><span>Texto de la anotación</span><textarea rows={6} value={texto} onChange={(x) => setTexto(x.target.value)} placeholder="ASIENTO N.° … DEL RESIDENTE: se solicita…" /></label>
      <div className="campos">
        <label className="campo"><span>Fecha de la anotación o presentación</span><input type="date" value={fecha} onChange={(x) => setFecha(x.target.value)} /></label>
        <label className="campo"><span>Tipo</span><select value={tipo} onChange={(x) => setTipo(x.target.value)}>{TIPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
      </div>
      <SelectorArchivos archivos={archivos} alCambiar={setArchivos} titulo="O sube el documento (opcional)" ayuda="Solicitud, valorización o informe en PDF, Word o Excel" />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="upload-actions">
        <button type="button" className="btn primary" disabled={!!progreso || (!texto.trim() && !archivos.length)} onClick={analizar}><Icono nombre={progreso ? 'clock' : 'arrow'} tamano={18} />{progreso || 'Analizar solicitud'}</button>
      </div>
    </section>
  );
}

const DICTAMEN = {
  observar: { texto: 'Observar', clase: 'alta' },
  evaluar: { texto: 'Puede proceder', clase: 'confirmed' },
  informar: { texto: 'Solo registro', clase: 'confirmar' },
} as const;
const NIVEL = { alta: 'alta', media: 'media', info: 'confirmar' } as const;

export function TarjetaSolicitud({ obraId, s, pruebas = [], existentes = [] }: { obraId: string; s: Solicitud; pruebas?: PruebaAprendida[]; existentes?: { id: string; nombre: string }[] }) {
  const avisar = useAviso();
  const [carta, setCarta] = useState(s.analisis.carta);
  const [estado, setEstado] = useState(s.estado);
  const [verCarta, setVerCarta] = useState(false);
  const a = s.analisis;
  const guardar = async (cambios: Record<string, unknown>, mensaje: string) => {
    const r = await fetch(`/api/ejecucion/${obraId}/solicitudes/${s.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cambios) });
    avisar(r.ok ? mensaje : 'No se pudo guardar.');
  };
  const imprimir = () => {
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) return;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Pronunciamiento</title><style>body{font:15px/1.6 system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 24px;white-space:pre-wrap}</style><body>${carta.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)}</body>`);
    w.document.close();
    w.print();
  };
  const hoy = hoyIso();
  return (
    <article className={`solicitud ${estado === 'respondida' ? 'respondida' : ''}`} id={`sol-${s.id}`}>
      <header>
        <div>
          <span className="mono">N.° {s.numero} · {fechaCorta(s.fecha)}</span>
          <h3>{s.titulo}{a.diasSolicitados ? ` · ${a.diasSolicitados} días` : ''}</h3>
        </div>
        <span className={`pill ${estado === 'respondida' ? 'confirmed' : DICTAMEN[a.dictamen].clase}`}>{estado === 'respondida' ? 'Respondida' : DICTAMEN[a.dictamen].texto}</span>
      </header>
      <p className="solicitud-resumen">{a.resumen}</p>
      <details className="solicitud-texto"><summary>Ver la anotación{s.documento ? ` (${s.documento.nombre})` : ''}</summary><blockquote>{s.texto}</blockquote></details>

      {a.plazos.length > 0 && (
        <ol className="plazos">
          {a.plazos.map((p) => {
            const quedan = diasEntre(hoy, p.vence, p.habiles);
            return (
              <li key={p.actor + p.accion} className={estado !== 'respondida' && p.actor === 'Entidad' ? (quedan < 0 ? 'vencido' : quedan <= 3 ? 'urgente' : '') : ''}>
                <span className="plazo-fecha">{fechaCorta(p.vence)}</span>
                <span><b>{p.actor}:</b> {p.accion} <small>({p.habiles ? 'días hábiles' : 'días calendario'}, <Cita texto={p.base} />)</small>{p.silencio && <em>{p.silencio}</em>}</span>
              </li>
            );
          })}
        </ol>
      )}

      {a.razones.length > 0 && (
        <ul className="razones">
          {a.razones.map((r, i) => (
            <li key={i} className={`razon-${r.nivel}`}>
              <span className={`pill ${NIVEL[r.nivel]}`}>{r.nivel === 'alta' ? 'Observar' : r.nivel === 'media' ? 'Revisar' : 'Dato'}</span>
              <div>
                <p>{r.texto}</p>
                {r.fuente && <blockquote>{r.fuente.extracto}<cite>{r.fuente.documento} · {r.fuente.pagina}</cite></blockquote>}
                {r.base && <small><Cita texto={r.base} /></small>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {s.aprendizaje
        ? <AprendizajeEnSolicitud obraId={obraId} s={s} pruebas={pruebas} existentes={existentes} />
        : a.deficiencias.length > 0 && <p className="inline-note aprende"><Icono nombre="layers" tamano={15} /> No previsto en el expediente: {a.deficiencias.join(', ').toLowerCase()}.</p>}

      <div className="solicitud-acciones">
        <button type="button" className="btn secondary" onClick={() => setVerCarta((x) => !x)}><Icono nombre="file" tamano={17} />{verCarta ? 'Ocultar el pronunciamiento' : 'Redactar pronunciamiento'}</button>
        <button type="button" className="btn secondary" onClick={() => { const n = estado === 'respondida' ? 'pendiente' : 'respondida'; setEstado(n); guardar({ estado: n }, n === 'respondida' ? 'Marcada como respondida.' : 'Marcada como pendiente.'); }}>
          <Icono nombre={estado === 'respondida' ? 'rotate' : 'check'} tamano={17} />{estado === 'respondida' ? 'Reabrir' : 'Marcar respondida'}
        </button>
      </div>
      {verCarta && (
        <div className="pronunciamiento">
          <textarea rows={14} value={carta} onChange={(x) => setCarta(x.target.value)} onBlur={() => guardar({ carta }, 'Pronunciamiento guardado.')} aria-label="Texto del pronunciamiento" />
          <div className="j-acciones">
            <button type="button" className="btn primary" onClick={imprimir}><Icono nombre="print" tamano={17} />Imprimir o guardar PDF</button>
            <small>Borrador de Axis: lo revisa y firma el funcionario responsable. Se notifica por el cuaderno de incidencias o la Pladicop.</small>
          </div>
        </div>
      )}
    </article>
  );
}
