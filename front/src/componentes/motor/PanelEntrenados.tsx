'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Semaforo as EstadoSemaforo } from '@/dominio/tipos';
import { Icono } from '../Icono';
import { Semaforo } from '../Semaforo';
import { useAviso } from '../Aviso';
import { Citas } from './Citas';
import {
  ErrorMotor, motor, subirEnVivo,
  type Avance, type Decision, type ExpedienteMotor, type HallazgoMotor, type RespuestaNormativa,
} from './cliente';

// Segunda revisión del mismo expediente, con los modelos entrenados con datos reales (API de
// Axis). La primera vez envía los archivos que ya se subieron; después solo consulta.

interface DocumentoFront { id: string; nombre: string }
interface Props { expedienteId: string; nombre: string; documentos: DocumentoFront[]; motorId?: string; versionDe?: string }

const SEMAFORO_FRONT: Record<'rojo' | 'ambar' | 'verde', EstadoSemaforo> = { rojo: 'rojo', ambar: 'amarillo', verde: 'verde' };
const ESTADO_SECCION = {
  rojo: { texto: 'Observar', clase: 'alta' },
  ambar: { texto: 'Revisar', clase: 'media' },
  verde: { texto: 'Conforme', clase: 'confirmed' },
  sin_revisar: { texto: 'Sin modelo aún', clase: 'neutral' },
} as const;
const DECISION = {
  confirmado: { texto: 'Confirmado: se observa', clase: 'alta' },
  descartado: { texto: 'Descartado: falsa alarma', clase: 'neutral' },
  justificado: { texto: 'Justificado', clase: 'confirmed' },
} as const;

const NOMBRES: Record<string, string> = {
  analisis_costos_unitarios: 'Análisis de costos unitarios', caratula: 'Carátula', cotizacion: 'Cotización',
  especificaciones_tecnicas: 'Especificaciones técnicas', estudio_suelos: 'Estudio de suelos', formula_polinomica: 'Fórmula polinómica',
  indice: 'Índice', memoria_descriptiva: 'Memoria descriptiva', gastos_generales: 'Gastos generales', precio_atipico: 'Precio atípico',
  metrados: 'Metrados', planos: 'Planos', cronograma: 'Cronograma', presupuesto: 'Presupuesto',
};
const legible = (etiqueta: string) => NOMBRES[etiqueta.toLowerCase()] ?? etiqueta.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase());

async function vincular(expedienteId: string, motorId: string) {
  await fetch(`/api/expedientes/${expedienteId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motorId }) });
}

/** El expediente del servidor de modelos: el de la versión anterior si existe (así lo que no cambió no se repite). */
async function expedienteDestino(nombre: string, versionDe?: string): Promise<string> {
  if (versionDe) {
    const anterior = await fetch(`/api/expedientes/${versionDe}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (anterior?.motorId) return anterior.motorId as string;
  }
  return (await motor.crearExpediente({ nombre_obra: nombre })).id;
}

export function PanelEntrenados({ expedienteId, nombre, documentos, motorId: inicial, versionDe }: Props) {
  const avisar = useAviso();
  const [motorId, setMotorId] = useState(inicial ?? '');
  const [datos, setDatos] = useState<ExpedienteMotor | null>(null);
  const [avances, setAvances] = useState<{ archivo: string; avance: Avance }[]>([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const iniciado = useRef(false);

  const enviar = useCallback(async () => {
    setEnviando(true);
    setError('');
    try {
      const id = await expedienteDestino(nombre, versionDe);
      let ultimo: ExpedienteMotor | null = null;
      for (const d of documentos) {
        const r = await fetch(`/api/expedientes/${expedienteId}/archivos/${d.id}`);
        if (!r.ok) continue;
        const archivo = new File([await r.blob()], d.nombre, { type: r.headers.get('content-type') ?? '' });
        try {
          ultimo = await subirEnVivo(id, archivo, (avance) => setAvances((xs) => [...xs, { archivo: d.nombre, avance }]));
        } catch (x) {
          const e = x as ErrorMotor;
          const mensaje = e.tipo === 'DocumentoYaAdjunto' ? 'ya estaba en el expediente.' : e.tipo === 'ArchivoNoSoportado' ? 'este formato todavía no lo leen los modelos (solo PDF, Excel e imágenes).' : e.message;
          setAvances((xs) => [...xs, { archivo: d.nombre, avance: { etapa: 'error', mensaje, datos: {} } }]);
          if (e.codigo === 0) throw e;
        }
      }
      await vincular(expedienteId, id);
      setMotorId(id);
      setDatos(ultimo ?? (await motor.expediente(id)));
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setEnviando(false);
    }
  }, [documentos, expedienteId, nombre, versionDe]);

  useEffect(() => {
    if (iniciado.current) return;
    iniciado.current = true;
    if (inicial) motor.expediente(inicial).then(setDatos).catch((x: Error) => setError(x.message));
    else void enviar();
  }, [inicial, enviar]);

  const reevaluar = async () => {
    try {
      setDatos(await motor.evaluar(motorId));
      avisar('Evaluación actualizada: lo que no cambió no se volvió a correr.');
    } catch (x) {
      setError((x as Error).message);
    }
  };

  if (error && !datos) {
    return (
      <section className="content-panel panel-entrenados">
        <h2>Modelos entrenados con datos reales</h2>
        <p className="form-error" role="alert">{error}</p>
        <p className="empty-line">El servidor de modelos de Axis corre aparte (API en el puerto 8000). Cuando esté disponible, vuelve a intentarlo.</p>
        <button type="button" className="btn secondary" onClick={() => { setError(''); iniciado.current = false; if (motorId) motor.expediente(motorId).then(setDatos).catch((x: Error) => setError(x.message)); else void enviar(); }}><Icono nombre="arrow" tamano={17} />Reintentar</button>
      </section>
    );
  }

  if (!datos) {
    return (
      <section className="content-panel panel-entrenados">
        <h2>Modelos entrenados con datos reales</h2>
        <p>{enviando ? 'Enviando los archivos de esta revisión a los modelos. Cada etapa aparece apenas ocurre.' : 'Cargando…'}</p>
        <ol className="avance-vivo" aria-live="polite">
          {avances.map((a, i) => (
            <li key={i} className={a.avance.etapa === 'error' ? 'avance-error' : ''}><span className="mono">{a.archivo}</span>{a.avance.mensaje}</li>
          ))}
        </ol>
      </section>
    );
  }

  const ev = datos.evaluacion;
  const hallazgos = [...(ev?.hallazgos ?? [])].sort((a, b) => Number(!!a.revision) - Number(!!b.revision) || Number(a.severidad !== 'rojo') - Number(b.severidad !== 'rojo') || b.confianza - a.confianza);
  return (
    <section className="content-panel panel-entrenados">
      <div className="entrenados-cabecera">
        <div>
          <h2>Modelos entrenados con datos reales</h2>
          <p>Una segunda revisión, independiente de las pruebas: modelos entrenados con presupuestos reales del SEACE y verificaciones de coherencia entre las partes. Cada decisión tuya (confirmar, descartar o justificar) queda como dato para reentrenarlos.</p>
        </div>
        {ev && <button type="button" className="btn secondary" onClick={reevaluar}><Icono nombre="arrow" tamano={17} />Volver a evaluar</button>}
      </div>

      <div className={`summary-strip resultado-${datos.semaforo ? SEMAFORO_FRONT[datos.semaforo] : 'gris'}`}>
        <div className="summary-main">
          <Semaforo estado={datos.semaforo ? SEMAFORO_FRONT[datos.semaforo] : 'gris'} />
          <div>
            <strong>{datos.semaforo === 'rojo' ? 'Hay observaciones que revisar' : datos.semaforo === 'ambar' ? 'Hay puntos que mirar' : datos.semaforo === 'verde' ? 'Conforme en lo que revisaron los modelos' : 'Ningún modelo pudo revisar estas partes todavía'}</strong>
            <small>{ev ? `Evaluación ${ev.numero}, en ${ev.duracion_ms} ms. ${ev.sin_revisar ? `${ev.sin_revisar === 1 ? '1 hallazgo espera' : `${ev.sin_revisar} hallazgos esperan`} tu decisión.` : 'Revisaste todos los hallazgos.'}` : 'Sube las partes que leen los modelos (presupuesto, metrados).'}</small>
          </div>
        </div>
        <dl>
          <div><dt>Hallazgos</dt><dd>{ev?.hallazgos.length ?? 0}</dd></div>
          <div><dt>Sin decidir</dt><dd>{ev?.sin_revisar ?? 0}</dd></div>
          <div><dt>Secciones</dt><dd>{datos.secciones.length}</dd></div>
        </dl>
      </div>

      <h3 className="form-subtitulo">Secciones del expediente</h3>
      <ul className="secciones-motor">
        {datos.secciones.map((s) => (
          <li key={s.etiqueta}>
            <span className={`pill ${ESTADO_SECCION[s.estado].clase}`}>{ESTADO_SECCION[s.estado].texto}</span>
            <strong>{legible(s.etiqueta)}</strong>
            <small>{s.nombre_documento}{s.version > 1 ? ` · versión ${s.version}` : ''}{s.hallazgos ? ` · ${s.abiertos} de ${s.hallazgos} abierto(s)` : ''}</small>
          </li>
        ))}
      </ul>

      {ev && (
        <details className="engine-details">
          <summary>Qué modelos corrieron y cuáles faltan</summary>
          <ul className="docs-table">
            {ev.motores.map((m) => (
              <li key={m.motor}><Icono nombre="check" tamano={20} /><span><strong>{legible(m.motor)}</strong><small>versión {m.version}{m.reutilizado ? ' · sus partes no cambiaron: se reutilizó' : ''}</small></span><span>{m.hallazgos} hallazgo(s)</span><span className="doc-status">Corrió</span></li>
            ))}
            {ev.omitidos.map((o) => (
              <li key={o.motor}><Icono nombre="clock" tamano={20} /><span><strong>{o.nombre}</strong><small>{o.razon}</small></span><span /><span className="doc-status">No aplicó</span></li>
            ))}
            {ev.fallas.map((f) => (
              <li key={f.motor}><Icono nombre="alert" tamano={20} /><span><strong>{legible(f.motor)}</strong><small>{f.razon}</small></span><span /><span className="doc-status">Falló</span></li>
            ))}
          </ul>
        </details>
      )}

      <h3 className="form-subtitulo">Hallazgos <span>{hallazgos.length}</span></h3>
      {hallazgos.length ? (
        <ul className="hallazgos-motor">
          {hallazgos.map((h) => <TarjetaHallazgo key={h.clave} motorId={motorId} h={h} alCambiar={setDatos} />)}
        </ul>
      ) : <p className="empty-line">Los modelos que corrieron no encontraron nada que observar.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  );
}

function TarjetaHallazgo({ motorId, h, alCambiar }: { motorId: string; h: HallazgoMotor; alCambiar: (d: ExpedienteMotor) => void }) {
  const avisar = useAviso();
  const [pidiendo, setPidiendo] = useState<Decision | null>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ley, setLey] = useState<RespuestaNormativa | null>(null);
  const [buscandoLey, setBuscandoLey] = useState(false);
  const [error, setError] = useState('');

  const decidir = async (decision: Decision) => {
    if (decision !== 'confirmado' && !motivo.trim()) { setPidiendo(decision); return; }
    setEnviando(true);
    setError('');
    try {
      alCambiar(await motor.revisar(motorId, h.clave, decision, motivo));
      avisar(decision === 'confirmado' ? 'Hallazgo confirmado: queda como observación.' : decision === 'descartado' ? 'Hallazgo descartado: ya no pinta la sección.' : 'Hallazgo justificado: ya no pinta la sección.');
      setPidiendo(null);
      setMotivo('');
    } catch (x) {
      setError((x as Error).message);
    } finally {
      setEnviando(false);
    }
  };
  const verLey = async () => {
    if (ley) { setLey(null); return; }
    setBuscandoLey(true);
    setError('');
    try { setLey(await motor.normativaDe(motorId, h.clave)); } catch (x) { setError((x as Error).message); } finally { setBuscandoLey(false); }
  };

  return (
    <li className={`hallazgo-motor${h.revision ? ' revisado' : ''}`}>
      <div className="hallazgo-motor-meta">
        <span className={`pill ${h.severidad === 'rojo' ? 'alta' : 'media'}`}><Icono nombre={h.severidad === 'rojo' ? 'alert' : 'list'} tamano={13} />{h.severidad === 'rojo' ? 'Prioridad alta' : 'Revisar'}</span>
        {h.revision && <span className={`pill ${DECISION[h.revision.decision].clase}`}>{DECISION[h.revision.decision].texto}</span>}
        <span>{legible(h.motor)}{h.seccion ? ` · ${legible(h.seccion)}` : ''}{h.pagina ? ` · pág. ${h.pagina}` : ''}{h.item ? ` · ítem ${h.item}` : ''}</span>
        <span className="mono">confianza {Math.round(h.confianza * 100)} %</span>
      </div>
      <strong>{h.titulo}</strong>
      <p>{h.explicacion}</p>
      <dl className="factores-motor">
        {h.factores.map((f) => <div key={f.nombre}><dt>{f.nombre}</dt><dd>{f.valor}</dd></div>)}
      </dl>
      {h.revision?.motivo && <p className="motivo-revision"><b>Motivo:</b> {h.revision.motivo}</p>}
      {pidiendo && (
        <label className="campo campo-ancho">
          <span>{pidiendo === 'descartado' ? '¿Por qué es una falsa alarma?' : '¿Qué lo justifica?'}</span>
          <textarea rows={3} value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder={pidiendo === 'descartado' ? 'La partida comparada no es la misma: …' : 'La cantera está a 45 km: el flete está incluido en el precio.'} />
        </label>
      )}
      <div className="acciones-hallazgo">
        <button type="button" className="btn secondary" disabled={enviando} onClick={() => decidir('confirmado')}><Icono nombre="alert" tamano={16} />Confirmar</button>
        <button type="button" className="btn secondary" disabled={enviando} onClick={() => decidir('descartado')}><Icono nombre="close" tamano={16} />{pidiendo === 'descartado' ? 'Guardar descarte' : 'Descartar'}</button>
        <button type="button" className="btn secondary" disabled={enviando} onClick={() => decidir('justificado')}><Icono nombre="check" tamano={16} />{pidiendo === 'justificado' ? 'Guardar justificación' : 'Justificar'}</button>
        <button type="button" className="text-link" disabled={buscandoLey} onClick={verLey}><Icono nombre="file" tamano={15} />{buscandoLey ? 'Buscando en la ley…' : ley ? 'Ocultar la normativa' : '¿Qué dice la ley?'}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {ley && <Citas respuesta={ley} />}
    </li>
  );
}
