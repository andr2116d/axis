import Link from 'next/link';
import { listarExpedientes } from '@/servidor/almacen';
import { usaBlob } from '@/servidor/respaldo';
import { CargaExpediente } from '@/componentes/CargaExpediente';
import { Icono } from '@/componentes/Icono';
import { MapaPortada } from '@/componentes/territorio/Territorio';
import { fecha } from '@/componentes/ui';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const recientes = (await listarExpedientes()).slice(0, 6);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Revisa expedientes<br className="desktop-br" /> antes de construir.</h1>
          <p>Revisa metrados, presupuesto y diseño en un solo lugar, con las pruebas que Axis aprende de las obras terminadas y paralizadas. Abre la evidencia de cada observación y prepara tu carta.</p>
          <div className="hero-actions">
            <a className="btn primary" href="#cargar"><Icono nombre="upload" tamano={18} />Subir un expediente</a>
            <Link className="text-link" href="/obras">Registrar una obra terminada o paralizada <Icono nombre="chevron" tamano={15} /></Link>
          </div>
        </div>
        <div className="cover-territory"><MapaPortada clave="incas" lugar="El Porvenir, La Libertad" /></div>
      </section>
      <section className="start-grid" aria-label="Cómo iniciar una revisión">
        <CargaExpediente subidaDirecta={usaBlob} />
        <div className="samples-section">
          <div className="section-heading"><h2>Revisiones recientes</h2><p>Expedientes subidos por la entidad.</p></div>
          {recientes.length ? (
            <div className="samples">
              {recientes.map((e) => (
                <Link key={e.id} className="sample" href={`/revision/${e.id}`}>
                  <span className="sample-icon"><Icono nombre={e.estado === 'analizado' ? 'check' : 'clock'} tamano={19} /></span>
                  <span>
                    <strong>{e.nombre}</strong>
                    <small><span className="mono">{e.clave}</span> · {e.estado === 'analizado' ? `${e.hallazgos.length} hallazgo(s)` : 'Por confirmar documentos'} · {fecha(e.creado)}</small>
                  </span>
                  <Icono nombre="chevron" tamano={19} />
                </Link>
              ))}
            </div>
          ) : <p className="empty-line">Todavía no hay revisiones. Sube el primer expediente.</p>}
        </div>
      </section>
    </>
  );
}
