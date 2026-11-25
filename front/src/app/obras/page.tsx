import Link from 'next/link';
import { listarExpedientes, listarObras, listarPruebas } from '@/servidor/almacen';
import { usaBlob } from '@/servidor/respaldo';
import { RegistroObra } from '@/componentes/obras/RegistroObra';
import { Icono } from '@/componentes/Icono';
import { LECTURA, fecha } from '@/componentes/ui';
import { PropuestaPrueba } from '@/componentes/obras/PropuestaPrueba';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { escenarioPorId } from '@/servidor/aprendizaje/escenarios';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Obras terminadas y paralizadas' };

export default async function PaginaObras({ searchParams }: { searchParams: Promise<{ escenario?: string; obra?: string }> }) {
  const params = await searchParams;
  const esc = escenarioPorId(params.escenario);
  const demo = esc ? { archivo: esc.obra.archivo, via: esc.original.via, situacion: esc.situacion } : undefined;
  const [expedientes, obras, pruebas] = await Promise.all([listarExpedientes(), listarObras(), listarPruebas()]);
  const porId = new Map(expedientes.map((e) => [e.id, e]));
  const pruebaPorId = new Map(pruebas.map((p) => [p.id, p]));
  // En la demo solo se muestra la obra de quien la recorre.
  const visibles = esc ? obras.filter((o) => o.id === params.obra) : obras;
  const existentes = pruebasConocidas(pruebas).filter((x) => x.estado === 'activa').map(({ id, nombre }) => ({ id, nombre }));
  // Solo expedientes reales y ya revisados: al menos un documento reconocido como parte del expediente.
  const opciones = expedientes
    .filter((e) => e.estado === 'analizado' && e.semaforo !== 'gris')
    .map(({ id, clave, nombre }) => ({ id, clave, nombre }));

  return (
    <>
      <section className="page-lead">
        <h1>Obras terminadas y paralizadas</h1>
        <p>Lo que pasó en una obra es la mejor prueba de lo que le faltó a su expediente. Axis lee los documentos de la obra, encuentra lo que el expediente no previó y lo convierte en una prueba que corre en las revisiones siguientes.</p>
      </section>
      <ol className="evidence-progress" aria-label="Cómo aprende Axis de una obra">
        <li aria-current="step"><span>1</span>Registrar la obra y sus documentos</li>
        <li><span>2</span>Comparar con el expediente original</li>
        <li><span>3</span>Generar y validar la prueba</li>
        <li><span>4</span>Aplicarla en nuevas revisiones</li>
      </ol>
      <div className="learn-grid">
        {esc && params.obra ? (
          <section className="content-panel learn-input">
            <span className="pill confirmed"><Icono nombre="check" tamano={13} />Obra registrada</span>
            <h2>{esc.original.via} · obra {esc.situacion}</h2>
            <p>Axis leyó la {esc.obra.tipo.toLowerCase()}, la comparó con el expediente original y te muestra a la derecha lo que encontró y la prueba que propone.</p>
          </section>
        ) : <RegistroObra expedientes={opciones} subidaDirecta={usaBlob} demo={demo} />}
        <section className="content-panel learn-validation">
          <h2>{esc ? 'Lo que Axis encontró en la obra' : 'Lo que Axis aprendió'}</h2>
          {visibles.length ? (
            <ul className="obra-list">
              {visibles.map((o) => {
                const e = porId.get(o.expedienteId);
                const hechos = o.hechos ?? [];
                return (
                  <li key={o.id}>
                    <div className="obra-head">
                      <span className={`pill ${o.situacion === 'paralizada' ? 'alta' : 'confirmed'}`}>{o.situacion === 'paralizada' ? 'Paralizada' : 'Terminada'}</span>
                      <span className="mono">{o.clave} · {fecha(o.creado)}</span>
                    </div>
                    <strong>{e ? <Link href={`/revision/${e.id}`}>{e.clave} · {e.nombre}</Link> : 'Expediente no disponible'}</strong>
                    <ul className="attached-evidence">
                      {o.documentos.map((d) => <li key={d.id}><Icono nombre="file" tamano={17} /><span>{d.nombre}</span><small>{d.tipo} · {LECTURA[d.lectura]}</small></li>)}
                    </ul>
                    {hechos.length ? hechos.map((h) => {
                      const p = h.prueba ? pruebaPorId.get(h.prueba) : undefined;
                      return (
                        <article key={h.condicion} className="hecho">
                          <h3>{h.nombre}</h3>
                          <blockquote>{h.fuente.extracto}<cite>{h.fuente.documento} · {h.fuente.pagina}</cite></blockquote>
                          <dl className="learning-facts">
                            <div><dt>Causa sugerida</dt><dd>{h.causa.nombre} <small>({h.causa.fuente}{h.causa.probabilidad ? `, ${Math.round(h.causa.probabilidad * 100)} %` : ''})</small></dd></div>
                            <div><dt>¿El expediente lo previó?</dt><dd>{h.previsto.si ? <>Sí: {h.previsto.evidencia?.documento} · {h.previsto.evidencia?.pagina} — «{h.previsto.evidencia?.extracto}»</> : `No. ${e?.clave ?? 'El expediente'} no tenía partidas ni estudios para esta condición.`}</dd></div>
                          </dl>
                          {p && <PropuestaPrueba prueba={p} existentes={existentes} />}
                          {h.previsto.si && <p className="inline-note">No genera prueba: el expediente ya lo consideraba (probablemente fue un mayor metrado).</p>}
                        </article>
                      );
                    }) : <p className="empty-line">Axis no encontró en estos documentos ninguna condición que sepa convertir en prueba (redes, napa, subrasante, drenaje, relleno, roca o muros).</p>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="empty-line">{esc ? 'Pulsa «Registrar obra»: aquí aparecerá lo que pasó en la obra, si el expediente lo había previsto y la prueba nueva que propone Axis.' : 'Aún no hay obras registradas.'}</p>}
          <p className="inline-note"><Icono nombre="layers" tamano={15} /> Todas las pruebas que Axis aprendió están en <Link href="/pruebas">Pruebas</Link>.</p>
        </section>
      </div>
    </>
  );
}
