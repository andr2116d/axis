import { listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { estadoEscenarios } from '@/servidor/aprendizaje/escenarios';
import { usaBlob } from '@/servidor/respaldo';
import { CargaExpediente } from '@/componentes/CargaExpediente';
import { Icono } from '@/componentes/Icono';
import { MapaPortada } from '@/componentes/territorio/Territorio';
import { KitDemo } from '@/componentes/KitDemo';

export const dynamic = 'force-dynamic';

export default async function Inicio() {
  const aprendidas = await listarPruebas();
  const pruebas = pruebasConocidas(aprendidas).filter((p) => p.estado === 'activa').length;
  const escenarios = estadoEscenarios(aprendidas);
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
      <KitDemo subidaDirecta={usaBlob} actual={escenarios.actual} lista={escenarios.lista} />
      <section className="start-grid" aria-label="Cómo iniciar una revisión">
        <CargaExpediente subidaDirecta={usaBlob} />
        <div className="samples-section que-subir">
          <div className="section-heading"><h2>Qué subir</h2><p>Lo mismo que entrega el proyectista.</p></div>
          <ul>
            <li><Icono nombre="files" tamano={18} /><span><b>El expediente completo en un PDF</b> o sus partes por separado: memoria, presupuesto, metrados, precios unitarios, especificaciones, cronograma, fórmula polinómica, estudio de suelos y planos.</span></li>
            <li><Icono nombre="file" tamano={18} /><span><b>PDF, Word o Excel.</b> Los presupuestos exportados de S10 o Delphin se leen partida por partida.</span></li>
            <li><Icono nombre="check" tamano={18} /><span><b>Axis confirma contigo qué es cada archivo</b> antes de revisar y te dice qué no pudo leer.</span></li>
          </ul>
        </div>
      </section>
    </>
  );
}
