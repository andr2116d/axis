import Link from 'next/link';
import { listarExpedientes, listarObras } from '@/servidor/almacen';
import { usaBlob } from '@/servidor/respaldo';
import { RegistroObra } from '@/componentes/obras/RegistroObra';
import { Icono } from '@/componentes/Icono';
import { LECTURA, fecha } from '@/componentes/ui';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Obras terminadas y paralizadas' };

export default async function PaginaObras() {
  const [expedientes, obras] = await Promise.all([listarExpedientes(), listarObras()]);
  const porId = new Map(expedientes.map((e) => [e.id, e]));
  // Solo expedientes reales: al menos un documento reconocido como parte del expediente.
  const opciones = expedientes
    .filter((e) => e.estado === 'analizado' && e.documentos.some((d) => d.tipo !== 'Por identificar' && d.tipo !== 'Otro anexo'))
    .map(({ id, clave, nombre }) => ({ id, clave, nombre }));

  return (
    <>
      <section className="page-lead">
        <h1>Obras terminadas y paralizadas</h1>
        <p>Lo que pasó en una obra es la mejor prueba de lo que le faltó a su expediente. Axis compara los documentos de la obra con el expediente original y convierte cada diferencia en una prueba para las próximas revisiones.</p>
      </section>
      <ol className="evidence-progress" aria-label="Cómo aprende Axis de una obra">
        <li aria-current="step"><span>1</span>Registrar la obra y sus documentos</li>
        <li><span>2</span>Comparar con el expediente original</li>
        <li><span>3</span>Generar y validar la prueba</li>
        <li><span>4</span>Aplicarla en nuevas revisiones</li>
      </ol>
      <div className="learn-grid">
        <RegistroObra expedientes={opciones} subidaDirecta={usaBlob} />
        <section className="content-panel learn-validation">
          <h2>Obras registradas</h2>
          {obras.length ? (
            <ul className="obra-list">
              {obras.map((o) => {
                const e = porId.get(o.expedienteId);
                return (
                  <li key={o.id}>
                    <div className="obra-head">
                      <span className={`pill ${o.situacion === 'paralizada' ? 'alta' : 'confirmed'}`}>{o.situacion === 'paralizada' ? 'Paralizada' : 'Terminada'}</span>
                      <span className="mono">{o.clave}</span>
                    </div>
                    <strong>{e ? <Link href={`/revision/${e.id}`}>{e.nombre}</Link> : 'Expediente no disponible'}</strong>
                    <small>{fecha(o.creado)}</small>
                    <ul className="attached-evidence">
                      {o.documentos.map((d) => <li key={d.id}><Icono nombre="file" tamano={17} /><span>{d.nombre}</span><small>{d.tipo} · {LECTURA[d.lectura]}</small></li>)}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : <p className="empty-line">Aún no hay obras registradas.</p>}
          <p className="inline-note"><Icono nombre="clock" tamano={15} /> La comparación con el expediente y la generación de pruebas están en desarrollo. Hoy Axis lee y clasifica los documentos de cada obra y los deja listos para entrenar.</p>
        </section>
      </div>
    </>
  );
}
