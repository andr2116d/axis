import { notFound } from 'next/navigation';
import Link from 'next/link';
import { leerEjecucion, leerExpediente } from '@/servidor/almacen';
import { usaBlob } from '@/servidor/respaldo';
import { ESCENARIOS } from '@/servidor/aprendizaje/escenarios';
import { NuevaSolicitud, TarjetaSolicitud } from '@/componentes/ejecucion/Solicitudes';
import { ejemplosSolicitud } from '@/componentes/ejecucion/ejemplos';
import { Icono } from '@/componentes/Icono';
import { diasEntre, fechaCorta, hoyIso, sumarDias } from '@/dominio/fechas';

export const dynamic = 'force-dynamic';

export default async function PaginaObra({ params }: { params: Promise<{ id: string }> }) {
  const o = await leerEjecucion((await params).id).catch(() => null);
  if (!o) notFound();
  const e = await leerExpediente(o.expedienteId);
  const fin = sumarDias(o.inicio, o.plazoDias, false);
  const hoy = hoyIso();
  const transcurrido = Math.min(100, Math.max(0, Math.round((diasEntre(o.inicio, hoy, false) / o.plazoDias) * 100)));
  // La condición del escenario de demostración, si el expediente es uno de ellos.
  const escenario = ESCENARIOS.find((x) => e?.documentos.some((d) => x.original.archivo.endsWith(d.nombre)));
  const ejemplos = ejemplosSolicitud(o.inicio, escenario?.condicion ?? 'napa', o.contratista, o.montoContrato);
  const pendientes = o.solicitudes.filter((s) => s.estado === 'pendiente');
  const plazos = pendientes.flatMap((s) => s.analisis.plazos.map((p) => ({ ...p, s }))).sort((a, b) => a.vence.localeCompare(b.vence));
  const deficiencias = [...new Set(o.solicitudes.flatMap((s) => s.analisis.deficiencias))];
  const solicitudes = [...o.solicitudes].reverse();
  return (
    <>
      <div className="review-breadcrumb"><Link className="back" href="/ejecucion"><Icono nombre="back" tamano={17} /> Control de obra</Link></div>
      <section className="review-heading">
        <div>
          <span className="fase-etiqueta">Fase 3 · Ejecución</span>
          <h1>{o.nombre}</h1>
          <p><span className="mono">{o.clave}</span> <span className="divider-dot" /> {o.contratista}{o.supervisor ? <> <span className="divider-dot" /> Supervisión: {o.supervisor}</> : null} <span className="divider-dot" /> {e ? <Link href={`/revision/${e.id}`}>Expediente {e.clave}</Link> : 'Expediente no disponible'}</p>
        </div>
        <Link className="btn secondary" href={`/obras?expediente=${o.expedienteId}`}><Icono nombre="layers" tamano={18} />Cerrar la obra y aprender</Link>
      </section>

      <div className="obra-resumen">
        <div><span>Inicio</span><b>{fechaCorta(o.inicio)}</b></div>
        <div><span>Fin contractual</span><b>{fechaCorta(fin)}</b></div>
        <div className="avance"><span>Plazo transcurrido</span><b>{transcurrido} %</b><i style={{ width: `${transcurrido}%` }} /></div>
        <div><span>Solicitudes pendientes</span><b>{pendientes.length}</b></div>
      </div>

      {plazos.length > 0 && (
        <section className="bloque">
          <h2>Plazos que corren</h2>
          <ol className="tablero-plazos">
            {plazos.map((p) => {
              const quedan = diasEntre(hoy, p.vence, p.habiles);
              return (
                <li key={p.s.id + p.actor + p.accion} className={p.actor === 'Entidad' ? (quedan < 0 ? 'vencido' : quedan <= 3 ? 'urgente' : 'entidad') : ''}>
                  <span className="plazo-fecha">{fechaCorta(p.vence)}<small>{quedan < 0 ? `venció hace ${-quedan} d` : `quedan ${quedan} d ${p.habiles ? 'háb.' : 'cal.'}`}</small></span>
                  <span><b>{p.actor}</b> · {p.accion} <a href={`#sol-${p.s.id}`}>(solicitud N.° {p.s.numero})</a>{p.silencio && p.actor === 'Entidad' && <em>{p.silencio}</em>}</span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className="ejecucion-grid">
        <div className="solicitudes">
          {solicitudes.length ? solicitudes.map((s) => <TarjetaSolicitud key={s.id} obraId={o.id} s={s} />) : <p className="empty-line">Aún no hay solicitudes. Cuando el contratista anote una ampliación, consulta, adicional o valorización, analízala aquí.</p>}
        </div>
        <div>
          <NuevaSolicitud obraId={o.id} subidaDirecta={usaBlob} ejemplos={ejemplos} />
          {deficiencias.length > 0 && (
            <section className="content-panel lo-no-previsto">
              <h2>Lo que el expediente no previó</h2>
              <ul>{deficiencias.map((d) => <li key={d}>{d}</li>)}</ul>
              <p>Si se aprueba un adicional por deficiencias del expediente, la entidad debe informarlo al Tribunal y a la Contraloría (Ley 32069, art. 64.5). Al terminar o paralizarse la obra, registra su informe final: Axis aprende de esto para los próximos expedientes.</p>
              <Link className="btn primary" href={`/obras?expediente=${o.expedienteId}`}><Icono nombre="layers" tamano={17} />Registrar el informe final</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
