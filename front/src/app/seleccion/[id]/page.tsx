import { notFound } from 'next/navigation';
import Link from 'next/link';
import { leerProceso, listarEjecucion } from '@/servidor/almacen';
import { Icono } from '@/componentes/Icono';
import type { SenalSeleccion } from '@/dominio/tipos';
import { nombreMotor } from '@/dominio/motores';

export const dynamic = 'force-dynamic';

const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NIVEL = { alta: { texto: 'Revisar a fondo', clase: 'alta' }, media: { texto: 'Verificar', clase: 'media' }, info: { texto: 'Dato', clase: 'confirmar' } } as const;

function Senal({ s }: { s: SenalSeleccion }) {
  return (
    <li className={`senal senal-${s.nivel}`}>
      <span className={`pill ${NIVEL[s.nivel].clase}`}>{NIVEL[s.nivel].texto}</span>
      <strong>{s.titulo}</strong>
      <p>{s.detalle}</p>
      <p className="senal-accion"><b>Qué hacer:</b> {s.accion}</p>
      <small>{s.base} · Fuente: {s.fuente}</small>
    </li>
  );
}

export default async function PaginaProceso({ params }: { params: Promise<{ id: string }> }) {
  const p = await leerProceso((await params).id).catch(() => null);
  if (!p) notFound();
  const r = p.resultado;
  const ganador = p.postores.find((x) => x.id === r.ganador);
  const deProceso = r.senales.filter((s) => !s.postor);
  const obra = (await listarEjecucion()).find((o) => o.procesoId === p.id);
  const cuenta = (id: string) => r.senales.filter((s) => s.postor === id && s.nivel !== 'info').length;
  return (
    <>
      <div className="review-breadcrumb"><Link className="back" href="/seleccion"><Icono nombre="back" tamano={17} /> Selección</Link></div>
      <section className="review-heading">
        <div>
          <span className="fase-etiqueta">Fase 2 · Selección</span>
          <h1>{p.objeto}</h1>
          <p><span className="mono">{p.clave}</span> <span className="divider-dot" /> {p.nomenclatura} <span className="divider-dot" /> Valor referencial {soles(p.valorReferencial)}</p>
        </div>
        {ganador && p.expedienteId && (
          obra
            ? <Link className="btn secondary" href={`/ejecucion/${obra.id}`}><Icono nombre="building" tamano={18} />Ver la obra en ejecución</Link>
            : <Link className="btn primary" href={`/ejecucion?expediente=${p.expedienteId}&proceso=${p.id}`}><Icono nombre="arrow" tamano={18} />Siguiente: control de la obra</Link>
        )}
      </section>

      <div className={`ganador-legal ${ganador ? '' : 'sin-ganador'}`}>
        <div>
          <span className="pill confirmed"><Icono nombre="check" tamano={13} />Resultado según la ley</span>
          <h2>{ganador ? <>La buena pro corresponde a <b>{ganador.nombre}</b></> : 'No hay un ganador único'}</h2>
          <p>{ganador ? `Oferta de ${soles(ganador.oferta)} (${((ganador.oferta / p.valorReferencial) * 100).toFixed(1)} % del valor referencial), ${ganador.puntajeTotal} puntos.` : r.desempate ?? 'Ninguna oferta es válida.'}{ganador && r.desempate ? ` ${r.desempate}` : ''}</p>
        </div>
        {ganador && <p className="ganador-nota">{cuenta(ganador.id) ? `Tiene ${cuenta(ganador.id)} punto(s) que verificar: Axis no cambia el resultado, te dice qué revisar a fondo antes del contrato.` : 'Axis no encontró nada que verificar en su oferta con los datos disponibles.'}</p>}
      </div>

      <section className="bloque">
        <h2>Orden de prelación</h2>
        <table className="tabla-orden">
          <thead><tr><th>Puesto</th><th>Postor</th><th>Oferta</th><th>% del VR</th><th>Puntaje</th><th>Señales</th></tr></thead>
          <tbody>
            {r.orden.map((o) => {
              const x = p.postores.find((y) => y.id === o.postor)!;
              return (
                <tr key={o.postor} className={o.postor === r.ganador ? 'fila-ganador' : !o.admitida ? 'fila-fuera' : ''}>
                  <td>{o.puesto ?? '—'}</td>
                  <td><strong>{x.nombre}</strong>{x.integrantes.length > 1 && <small>{x.integrantes.map((m) => `${m.nombre} ${m.participacion} %`).join(' · ')}</small>}{!o.admitida && <small className="motivo">{o.motivo}</small>}</td>
                  <td>{soles(x.oferta)}</td>
                  <td>{((x.oferta / p.valorReferencial) * 100).toFixed(1)} %</td>
                  <td>{x.puntajeTotal}</td>
                  <td>{cuenta(x.id) ? <a href={`#postor-${x.id}`}>{cuenta(x.id)}</a> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {r.recomendaciones.length > 0 && (
        <section className="bloque">
          <h2>Qué hacer y quién</h2>
          <ol className="recomendaciones">
            {r.recomendaciones.map((x) => <li key={x.texto}><span className="rec-para">{x.para}</span><p>{x.texto}</p><small>{x.base}</small></li>)}
          </ol>
        </section>
      )}

      <section className="bloque">
        <h2>Señales por postor</h2>
        <div className="senales-postores">
          {r.orden.map((o) => {
            const x = p.postores.find((y) => y.id === o.postor)!;
            const suyas = r.senales.filter((s) => s.postor === x.id);
            return (
              <article key={x.id} id={`postor-${x.id}`} className="content-panel">
                <h3>{x.nombre}{o.postor === r.ganador && <span className="pill confirmed">Ganador legal</span>}</h3>
                {suyas.length ? <ul className="senales">{suyas.map((s) => <Senal key={s.id} s={s} />)}</ul> : <p className="empty-line">Sin señales con los datos disponibles: no registra sanciones, penalidades ni vínculos con otros postores.</p>}
              </article>
            );
          })}
        </div>
      </section>

      {deProceso.length > 0 && (
        <section className="bloque">
          <h2>Señales del proceso</h2>
          <ul className="senales">{deProceso.map((s) => <Senal key={s.id} s={s} />)}</ul>
        </section>
      )}

      <details className="engine-details">
        <summary>Detalle técnico: motores que corrieron</summary>
        <ul className="docs-table">
          {r.ejecucion.map((x) => (
            <li key={x.motor}><Icono nombre="check" tamano={20} /><span><strong>{nombreMotor(x.motor)}</strong><small>{x.nota}</small></span><span className="mono">{x.ms} ms</span><span className="doc-status">Corrió</span></li>
          ))}
        </ul>
      </details>
    </>
  );
}
