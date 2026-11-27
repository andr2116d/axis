import { notFound } from 'next/navigation';
import Link from 'next/link';
import { leerEjecucion, leerExpediente, listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { AvisoAprendizaje } from '@/componentes/ejecucion/Aprendizaje';
import { usaBlob } from '@/servidor/respaldo';
import { NuevaSolicitud, TarjetaSolicitud } from '@/componentes/ejecucion/Solicitudes';
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
  const pendientes = o.solicitudes.filter((s) => s.estado === 'pendiente');
  const plazos = pendientes.flatMap((s) => s.analisis.plazos.map((p) => ({ ...p, s }))).sort((a, b) => a.vence.localeCompare(b.vence));
  const deficiencias = [...new Set(o.solicitudes.flatMap((s) => s.analisis.deficiencias))];
  const solicitudes = [...o.solicitudes].reverse();
  const todas = await listarPruebas();
  const ids = new Set(o.solicitudes.flatMap((s) => s.aprendizaje?.pruebas ?? []));
  const pruebas = todas.filter((p) => ids.has(p.id));
  const existentes = pruebasConocidas(todas).filter((x) => x.estado === 'activa').map(({ id, nombre }) => ({ id, nombre }));
  const porAprender = o.solicitudes.filter((s) => s.aprendizaje?.estado === 'pendiente' || s.aprendizaje?.estado === 'pospuesto').length;
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
      {porAprender > 0 && <p className="por-aprender-banda"><Icono nombre="layers" tamano={17} /><span><b>{porAprender === 1 ? 'Un entregable trae' : `${porAprender} entregables traen`} algo que el expediente no previó.</b> Conviértelo en prueba desde la solicitud.</span></p>}
      <AvisoAprendizaje obraId={o.id} solicitudes={o.solicitudes} pruebas={pruebas} existentes={existentes} expediente={e?.clave ?? 'original'} />

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
          {solicitudes.length ? solicitudes.map((s) => <TarjetaSolicitud key={s.id} obraId={o.id} s={s} pruebas={pruebas} existentes={existentes} />) : <p className="empty-line">Aún no hay solicitudes. Cuando el contratista anote una ampliación, consulta, adicional o valorización, analízala aquí.</p>}
        </div>
        <div>
          <NuevaSolicitud obraId={o.id} subidaDirecta={usaBlob} />
          {deficiencias.length > 0 && (
            <section className="content-panel lo-no-previsto">
              <h2>Lo que el expediente no previó</h2>
              <ul>{deficiencias.map((d) => <li key={d}>{d}</li>)}</ul>
              <p>Si se aprueba un adicional por deficiencias del expediente, la entidad debe informarlo al Tribunal y a la Contraloría (Ley 32069, art. 64.5). Axis te ofrece aprender de cada entregable en cuanto lo detecta; al terminar o paralizarse la obra, el informe final completa el aprendizaje.</p>
              <Link className="btn primary" href={`/obras?expediente=${o.expedienteId}`}><Icono nombre="layers" tamano={17} />Registrar el informe final</Link>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
