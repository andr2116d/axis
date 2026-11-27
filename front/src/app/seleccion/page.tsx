import Link from 'next/link';
import { listarExpedientes, listarProcesos } from '@/servidor/almacen';
import { FormProceso } from '@/componentes/seleccion/FormProceso';
import { Icono } from '@/componentes/Icono';
import { fecha } from '@/componentes/ui';
import { usaBlob } from '@/servidor/respaldo';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Selección del contratista' };

export default async function PaginaSeleccion({ searchParams }: { searchParams: Promise<{ expediente?: string }> }) {
  const q = await searchParams;
  const [expedientes, procesos] = await Promise.all([listarExpedientes(), listarProcesos()]);
  const opciones = expedientes.filter((e) => e.estado === 'analizado' && e.semaforo !== 'gris').map(({ id, clave, nombre }) => ({ id, clave, nombre }));
  return (
    <>
      <section className="page-lead">
        <span className="fase-etiqueta">Fase 2 · Selección</span>
        <h1>¿A quién le corresponde la obra y qué revisar de él?</h1>
        <p>Sube las ofertas que llegaron por el SEACE. Axis las lee y aplica la ley tal cual: admite las ofertas válidas, ordena por puntaje y resuelve los empates. Ese resultado no lo cambia. Después revisa a cada postor con datos del OECE y del SEACE y te dice qué verificar, quién debe hacerlo y con qué base legal. Cuando el ganador entrega sus documentos para el contrato, Axis coteja su experiencia.</p>
      </section>
      <div className="seleccion-grid">
        <FormProceso key={q.expediente ?? ''} subidaDirecta={usaBlob} expedientes={opciones} inicial={q.expediente ? { expedienteId: q.expediente } : undefined} />
        <aside className="content-panel lado-seleccion">
          <h2>Qué revisa Axis</h2>
          <ul className="lista-ley">
            <li><b>Orden legal</b><span>Rango de 95 % a 110 % del valor referencial, puntaje y desempate (art. 81).</span></li>
            <li><b>Sanciones y penalidades</b><span>Inhabilitaciones, multas y penalidades de cada RUC (OECE). Un inhabilitado está impedido (Ley, art. 30).</span></li>
            <li><b>Consorcios</b><span>Quién pone la experiencia y quién la participación; empresas recién creadas con la mayor parte de la obra.</span></li>
            <li><b>Vínculos entre postores</b><span>Mismo domicilio, teléfono, apoderado, integrante o personal clave: se remite a Indecopi (DCF 24.ª).</span></li>
            <li><b>Documentos del ganador</b><span>Experiencia del Anexo 11 contra constancias, fechas de constitución y el SEACE (art. 83).</span></li>
            <li><b>Ofertas y competencia</b><span>Una sola oferta, ofertas casi idénticas o en el tope, concentración en la entidad.</span></li>
          </ul>
          <p className="inline-note"><Icono nombre="alert" tamano={15} /> Lo usan los evaluadores (comité u oficial de compra) y la DEC para la verificación posterior de la oferta ganadora (art. 83).</p>
          {procesos.length > 0 && (
            <>
              <h2 className="lado-subtitulo">Procesos analizados</h2>
              <ul className="lista-procesos">
                {procesos.slice(0, 8).map((p) => (
                  <li key={p.id}><Link href={`/seleccion/${p.id}`}><span className="mono">{p.clave}</span> {p.nomenclatura}</Link><small>{p.postores.length} postores · {fecha(p.creado)}</small></li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </>
  );
}
