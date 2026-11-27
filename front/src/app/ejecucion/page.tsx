import { usaBlob } from '@/servidor/respaldo';
import Link from 'next/link';
import { listarEjecucion, listarExpedientes, leerProceso } from '@/servidor/almacen';
import { RegistrarObra } from '@/componentes/ejecucion/RegistrarObra';
import { Icono } from '@/componentes/Icono';
import { diasEntre, fechaCorta, hoyIso, sumarDias } from '@/dominio/fechas';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Control de obra' };

export default async function PaginaEjecucion({ searchParams }: { searchParams: Promise<{ expediente?: string; proceso?: string }> }) {
  const q = await searchParams;
  const [expedientes, obras] = await Promise.all([listarExpedientes(), listarEjecucion()]);
  const opciones = expedientes.filter((e) => e.estado === 'analizado' && e.semaforo !== 'gris').map(({ id, clave, nombre }) => ({ id, clave, nombre }));
  const proceso = q.proceso ? await leerProceso(q.proceso).catch(() => null) : null;
  const ganador = proceso?.postores.find((x) => x.id === proceso.resultado.ganador);
  const hoy = hoyIso();
  return (
    <>
      <section className="page-lead">
        <span className="fase-etiqueta">Fase 3 · Ejecución</span>
        <h1>Cada solicitud del contratista, cotejada con el expediente.</h1>
        <p>Ampliaciones de plazo, consultas, adicionales y valorizaciones: Axis calcula cuánto tiempo tiene la entidad para responder —en varios casos el silencio aprueba lo pedido—, revisa si lo que se alega ya estaba en el expediente y redacta el pronunciamiento con su base legal.</p>
      </section>
      <div className="seleccion-grid">
        <RegistrarObra key={q.expediente ?? ''} subidaDirecta={usaBlob} expedientes={opciones} inicial={{ expedienteId: q.expediente, procesoId: proceso?.id, contratista: ganador?.nombre, monto: ganador?.oferta }} />
        <aside className="content-panel lado-seleccion">
          <h2>Obras en ejecución</h2>
          {obras.length ? (
            <ul className="lista-procesos">
              {obras.map((o) => {
                const pendientes = o.solicitudes.filter((s) => s.estado === 'pendiente');
                const proximo = pendientes.flatMap((s) => s.analisis.plazos.filter((p) => p.actor === 'Entidad')).sort((a, b) => a.vence.localeCompare(b.vence))[0];
                return (
                  <li key={o.id}>
                    <Link href={`/ejecucion/${o.id}`}><span className="mono">{o.clave}</span> {o.nombre}</Link>
                    <small>{o.contratista} · termina el {fechaCorta(sumarDias(o.inicio, o.plazoDias, false))}{proximo ? ` · responder antes del ${fechaCorta(proximo.vence)} (${diasEntre(hoy, proximo.vence, proximo.habiles)} días)` : ''}</small>
                  </li>
                );
              })}
            </ul>
          ) : <p className="empty-line">Aún no hay obras registradas.</p>}
          <h2 className="lado-subtitulo">Qué controla Axis</h2>
          <ul className="lista-ley">
            <li><b>Ampliación de plazo</b><span>Contenido y oportunidad (art. 200), causal ajena al contratista y ruta crítica (art. 198). Si la entidad no responde en 10 días hábiles, se aprueba.</span></li>
            <li><b>Consultas</b><span>Si el expediente ya tiene la respuesta, y si una modificación trae informe técnico (art. 190).</span></li>
            <li><b>Adicionales</b><span>Previsto o no en el expediente, regularización prohibida, topes de 15 %, 30 % y 50 % (Ley, art. 64).</span></li>
            <li><b>Valorizaciones</b><span>Partida por partida contra el presupuesto contractual: precio, metrado y partidas nuevas (art. 210).</span></li>
          </ul>
        </aside>
      </div>
    </>
  );
}
