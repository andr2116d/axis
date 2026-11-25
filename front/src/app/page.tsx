import Link from 'next/link';
import { listarExpedientes, listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { usaBlob } from '@/servidor/respaldo';
import { CargaExpediente } from '@/componentes/CargaExpediente';
import { Icono } from '@/componentes/Icono';
import { MapaPortada } from '@/componentes/territorio/Territorio';
import { fecha } from '@/componentes/ui';
import { Semaforo, SEMAFORO } from '@/componentes/Semaforo';
import { KitDemo } from '@/componentes/KitDemo';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const [todos, aprendidas] = await Promise.all([listarExpedientes(), listarPruebas()]);
  const recientes = todos.slice(0, 6);
  const pruebas = pruebasConocidas(aprendidas).filter((p) => p.estado === 'activa').length;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <h1>Revisa expedientes<br className="desktop-br" /> antes de construir.</h1>
          <p>Axis ya aprendió {pruebas} pruebas de errores reales en obras de La Libertad y aprende una nueva con cada obra terminada o paralizada. Da un semáforo, la evidencia de cada observación y la carta lista para enviar.</p>
          <div className="hero-actions">
            <a className="btn primary" href="#demo"><Icono nombre="arrow" tamano={18} />Probar la demo</a>
            <a className="text-link" href="#cargar">Subir mi expediente <Icono nombre="chevron" tamano={15} /></a>
          </div>
        </div>
        <div className="cover-territory"><MapaPortada clave="incas" lugar="El Porvenir, La Libertad" /></div>
      </section>
      <KitDemo subidaDirecta={usaBlob} />
      <section className="start-grid" aria-label="Cómo iniciar una revisión">
        <CargaExpediente subidaDirecta={usaBlob} />
        <div className="samples-section">
          <div className="section-heading"><h2>Revisiones recientes</h2><p>Expedientes subidos por la entidad.</p></div>
          {recientes.length ? (
            <div className="samples">
              {recientes.map((e) => (
                <Link key={e.id} className="sample" href={`/revision/${e.id}`}>
                  {e.estado === 'analizado' ? <Semaforo estado={e.semaforo} tamano="chico" /> : <span className="sample-icon"><Icono nombre="clock" tamano={19} /></span>}
                  <span>
                    <strong>{e.nombre}</strong>
                    <small><span className="mono">{e.clave}</span> · {e.estado === 'analizado' ? `${SEMAFORO[e.semaforo].titulo} · ${e.hallazgos.length} hallazgo(s)` : 'Por confirmar documentos'} · {fecha(e.creado)}</small>
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
