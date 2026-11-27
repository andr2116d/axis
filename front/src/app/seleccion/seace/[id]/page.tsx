import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icono } from '@/componentes/Icono';
import { Semaforo } from '@/componentes/Semaforo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Postores del proceso' };

interface Factor { nombre: string; valor: string }
interface Hallazgo { clave: string; severidad: 'rojo' | 'ambar'; titulo: string; explicacion: string; confianza: number; factores: Factor[] }
interface Postor { identificador: string; nombre: string; ganador: boolean; es_consorcio: boolean; revisado: boolean; hallazgos: Hallazgo[] }
interface Revision {
  proceso: { id: string; nomenclatura: string; entidad: string; descripcion: string; monto_referencial: string | null; cui: string | null; convocatoria: string | null };
  al_dia: string; fuente: { nombre: string; corte: string | null }; semaforo: 'rojo' | 'ambar' | 'verde' | null;
  postores_revisados: number; postores_sin_ruc: number; postores: Postor[]; duracion_ms: number;
}

const API = process.env.AXIS_API_URL ?? 'http://localhost:8000';
const dia = (iso: string | null) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString('es-PE') : '—');
const SEMAFORO = { rojo: 'rojo', ambar: 'amarillo', verde: 'verde' } as const;

async function revision(id: string): Promise<Revision | null | 'sin-conexion'> {
  try {
    const r = await fetch(`${API}/seleccion/procesos/${encodeURIComponent(id)}/revision`, { cache: 'no-store' });
    if (r.status === 404) return null;
    return r.ok ? ((await r.json()) as Revision) : 'sin-conexion';
  } catch {
    return 'sin-conexion';
  }
}

export default async function PaginaProcesoSeace({ params }: { params: Promise<{ id: string }> }) {
  const r = await revision((await params).id);
  if (r === null) notFound();
  if (r === 'sin-conexion') {
    return (
      <section className="content-panel">
        <h1>Servidor de Axis no disponible</h1>
        <p>La revisión de postores corre en la API de Axis (puerto 8000). Cuando esté disponible, recarga la página.</p>
      </section>
    );
  }
  const p = r.proceso;
  const conAlertas = r.postores.filter((x) => x.hallazgos.length).length;
  const ganador = r.postores.find((x) => x.ganador);
  return (
    <>
      <div className="review-breadcrumb"><Link className="back" href="/seleccion"><Icono nombre="back" tamano={17} /> Selección</Link></div>
      <section className="review-heading">
        <div>
          <span className="fase-etiqueta">Fase 2 · Selección</span>
          <h1>{p.descripcion.length > 140 ? p.descripcion.slice(0, 140) + '…' : p.descripcion}</h1>
          <p><span className="mono">{p.nomenclatura}</span> <span className="divider-dot" /> {p.entidad} <span className="divider-dot" /> Convocado el {dia(p.convocatoria)}{p.monto_referencial ? <> <span className="divider-dot" /> Valor referencial S/ {Number(p.monto_referencial).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</> : null}</p>
        </div>
      </section>

      <div className={`summary-strip resultado-${r.semaforo ? SEMAFORO[r.semaforo] : 'gris'}`}>
        <div className="summary-main">
          <Semaforo estado={r.semaforo ? SEMAFORO[r.semaforo] : 'gris'} />
          <div>
            <strong>{r.semaforo === 'rojo' ? 'Hay un postor que figura inhabilitado' : r.semaforo === 'ambar' ? 'Hay antecedentes que conviene mirar' : r.semaforo === 'verde' ? 'Sin antecedentes en el registro' : 'No se pudo consultar a ningún postor'}</strong>
            <small>
              Revisado a la fecha de la convocatoria ({dia(r.al_dia)}) con el {r.fuente.nombre.replace(/^Registro/, 'registro')}{r.fuente.corte ? `, actualizado al ${dia(r.fuente.corte)}` : ''}. Una sanción posterior a esa fecha no aparece.
              {ganador ? ` La buena pro corresponde a ${ganador.nombre}; Axis no cambia ese resultado.` : ''}
            </small>
          </div>
        </div>
        <dl>
          <div><dt>Postores</dt><dd>{r.postores.length}</dd></div>
          <div><dt>Con antecedentes</dt><dd>{conAlertas}</dd></div>
          <div><dt>Sin RUC propio</dt><dd>{r.postores_sin_ruc}</dd></div>
        </dl>
      </div>

      <ul className="postores-seace">
        {r.postores.map((x) => (
          <li key={x.identificador} className={x.ganador ? 'es-ganador' : ''}>
            <div className="postor-seace-cabecera">
              <strong>{x.nombre}</strong>
              {x.ganador && <span className="pill confirmed"><Icono nombre="check" tamano={12} />Ganador</span>}
              <span className="mono">{x.revisado ? `RUC ${x.identificador}` : x.es_consorcio ? 'Consorcio sin RUC propio: revisa a sus integrantes' : 'Sin RUC'}</span>
            </div>
            {x.hallazgos.length ? (
              <ul className="hallazgos-motor">
                {x.hallazgos.map((h) => (
                  <li key={h.clave} className="hallazgo-motor">
                    <div className="hallazgo-motor-meta"><span className={`pill ${h.severidad === 'rojo' ? 'alta' : 'media'}`}>{h.severidad === 'rojo' ? 'Impedimento' : 'Revisar a fondo'}</span></div>
                    <strong>{h.titulo}</strong>
                    <p>{h.explicacion}</p>
                    <dl className="factores-motor">{h.factores.map((f, i) => <div key={i}><dt>{f.nombre}</dt><dd>{f.valor}</dd></div>)}</dl>
                  </li>
                ))}
              </ul>
            ) : x.revisado ? <p className="sin-antecedentes"><Icono nombre="check" tamano={15} /> Sin antecedentes en el registro.</p> : null}
          </li>
        ))}
      </ul>
      <p className="inline-note"><Icono nombre="alert" tamano={15} /> Son registros públicos del OECE, citados tal cual: no son acusaciones. La decisión y la verificación posterior (art. 83 del Reglamento) son del comité y de la DEC.</p>
    </>
  );
}
