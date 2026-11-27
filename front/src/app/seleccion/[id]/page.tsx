import { notFound } from 'next/navigation';
import Link from 'next/link';
import { leerProceso, listarEjecucion } from '@/servidor/almacen';
import { Icono } from '@/componentes/Icono';
import type { SenalSeleccion } from '@/dominio/tipos';
import { nombreMotor } from '@/dominio/motores';
import { VerificarContrato } from '@/componentes/seleccion/VerificarContrato';
import { usaBlob } from '@/servidor/respaldo';
import { fechaCorta } from '@/dominio/fechas';

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

      {ganador && (
        <section className="bloque" id="contrato">
          <h2>Documentos del ganador para el contrato</h2>
          <div className="contrato-grid">
            <div className="content-panel">
              <VerificarContrato procesoId={p.id} ganador={ganador.nombre} subidaDirecta={usaBlob} hecho={!!p.verificacion} ejemplo={/EJEMPLO/.test(p.nomenclatura) ? '/demo/seleccion/CONTRATO_consorcio-vias-del-norte.pdf' : undefined} />
            </div>
            {p.verificacion && (
              <div className="content-panel resultado-contrato">
                <h3>{p.verificacion.senales.filter((s) => s.nivel === 'alta').length ? `${p.verificacion.senales.filter((s) => s.nivel === 'alta').length} posible(s) información inexacta` : p.verificacion.senales.length ? 'Puntos que verificar' : 'Sin observaciones en los documentos'}</h3>
                <p className="empty-line">{p.verificacion.documentos.map((d) => `${d.nombre} (${d.paginas} pág.)`).join(' · ')}</p>
                {p.verificacion.filas.length > 0 && (
                  <table className="tabla-orden tabla-experiencia">
                    <thead><tr><th>N.°</th><th>Obra declarada</th><th>Integrante</th><th>Monto declarado</th><th>Constancia</th><th>SEACE</th></tr></thead>
                    <tbody>
                      {p.verificacion.filas.map((f) => {
                        const difiere = f.constancia?.monto && Math.abs(f.constancia.monto - f.monto) / f.monto > 0.01;
                        return (
                          <tr key={f.n}>
                            <td>{f.n}</td>
                            <td><strong>{f.contrato}</strong><small>{f.cliente}{f.fecha ? ` · ${fechaCorta(f.fecha)}` : ''}</small></td>
                            <td>{f.integrante}</td>
                            <td>{soles(f.monto)}</td>
                            <td className={!f.constancia ? 'celda-mal' : difiere ? 'celda-mal' : 'celda-bien'}>{!f.constancia ? 'No llegó' : f.constancia.monto ? soles(f.constancia.monto) : 'Sin monto'}{f.constancia && <small>{f.constancia.fuente.pagina}</small>}</td>
                            <td className={f.seace ? (f.seace.coincide ? 'celda-bien' : 'celda-mal') : ''}>{f.seace ? (f.seace.coincide ? 'Coincide' : 'Otro ganador') : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {p.verificacion.totalDeclarado ? <tfoot><tr><td /><td colSpan={2}>Suma de las obras · acumulado declarado</td><td colSpan={3}>{soles(p.verificacion.filas.reduce((a, f) => a + f.monto, 0))} · {soles(p.verificacion.totalDeclarado)}</td></tr></tfoot> : null}
                  </table>
                )}
                {p.verificacion.senales.length > 0 && <ul className="senales">{[...p.verificacion.senales].sort((a, b) => ['alta', 'media', 'info'].indexOf(a.nivel) - ['alta', 'media', 'info'].indexOf(b.nivel)).map((s) => <Senal key={s.id} s={s} />)}</ul>}
                {p.verificacion.senales.some((s) => s.nivel === 'alta') && <p className="inline-note aprende"><Icono nombre="alert" tamano={15} /> Si se comprueba la inexactitud, la entidad puede declarar la nulidad de la buena pro o del contrato y debe comunicarlo al Tribunal de Contrataciones Públicas (Reglamento, art. 83.2 y 83.3).</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {deProceso.length > 0 && (
        <section className="bloque">
          <h2>Señales del proceso</h2>
          <ul className="senales">{deProceso.map((s) => <Senal key={s.id} s={s} />)}</ul>
        </section>
      )}

      <details className="engine-details">
        <summary>Detalle técnico: motores que corrieron</summary>
        <ul className="docs-table">
          {[...r.ejecucion, ...(p.verificacion?.ejecucion ?? [])].map((x) => (
            <li key={x.motor}><Icono nombre="check" tamano={20} /><span><strong>{nombreMotor(x.motor)}</strong><small>{x.nota}</small></span><span className="mono">{x.ms} ms</span><span className="doc-status">Corrió</span></li>
          ))}
        </ul>
      </details>
    </>
  );
}
