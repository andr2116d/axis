import { listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { estadoEscenarios } from '@/servidor/aprendizaje/escenarios';
import { usaBlob } from '@/servidor/respaldo';
import { CargaExpediente } from '@/componentes/CargaExpediente';
import { Icono } from '@/componentes/Icono';
import { MapaPortada } from '@/componentes/territorio/Territorio';
import { BotonDemo } from '@/componentes/KitDemo';

export const dynamic = 'force-dynamic';

const FASES = [
  { n: '1', titulo: 'Expediente técnico', href: '#cargar', texto: 'Sube cada parte, corrige hasta el verde y justifica lo que tenga razón técnica.', quien: 'Unidad ejecutora · equipo revisor' },
  { n: '2', titulo: 'Selección', href: '/seleccion', texto: 'El ganador según la ley y qué verificar de él: sanciones, consorcios, vínculos.', quien: 'Comité u oficial de compra · DEC' },
  { n: '3', titulo: 'Ejecución', href: '/ejecucion', texto: 'Cada solicitud del contratista cotejada con el expediente, con tus plazos.', quien: 'Unidad ejecutora · supervisión' },
  { n: '↻', titulo: 'Cierre y aprendizaje', href: '/obras', texto: 'Lo que pasó en la obra se vuelve una prueba para el siguiente expediente.', quien: 'Quien registra la obra terminada o paralizada' },
];

export default async function Inicio() {
  const aprendidas = await listarPruebas();
  const pruebas = pruebasConocidas(aprendidas).filter((p) => p.estado === 'activa').length;
  const escenarios = estadoEscenarios(aprendidas);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="fase-etiqueta">Fase 1 · Expediente técnico</span>
          <h1>Revisa expedientes<br className="desktop-br" /> antes de construir.</h1>
          <p>Axis ya aprendió {pruebas} pruebas de errores reales en obras de La Libertad y aprende una nueva con cada obra terminada o paralizada. Da un semáforo, la evidencia de cada observación, acepta tu juicio de experto si está bien sustentado y arma la carta para el consultor.</p>
          <BotonDemo subidaDirecta={usaBlob} actual={escenarios.actual} lista={escenarios.lista} />
          <a className="text-link" href="#cargar">O sube tu propio expediente <Icono nombre="chevron" tamano={15} /></a>
        </div>
        <div className="cover-territory"><MapaPortada clave="incas" lugar="El Porvenir, La Libertad" /></div>
      </section>
      <section className="fases" aria-label="Las fases en que actúa Axis">
        {FASES.map((f) => (
          <a key={f.titulo} href={f.href} className="fase">
            <span className="fase-num">{f.n}</span>
            <strong>{f.titulo}</strong>
            <span>{f.texto}</span>
            <small>{f.quien}</small>
          </a>
        ))}
      </section>
      <section className="start-grid" aria-label="Cómo iniciar una revisión">
        <CargaExpediente subidaDirecta={usaBlob} />
        <div className="samples-section que-subir">
          <div className="section-heading"><h2>Qué subir</h2><p>Lo mismo que entrega el proyectista.</p></div>
          <ul>
            <li><Icono nombre="files" tamano={18} /><span><b>El expediente completo en un PDF</b> o sus partes por separado: memoria, presupuesto, metrados, precios unitarios, especificaciones, cronograma, fórmula polinómica, estudio de suelos y planos.</span></li>
            <li><Icono nombre="file" tamano={18} /><span><b>PDF, Word o Excel.</b> Los presupuestos exportados de S10 o Delphin se leen partida por partida.</span></li>
            <li><Icono nombre="check" tamano={18} /><span><b>Axis confirma contigo qué es cada archivo</b> antes de revisar y te dice qué no pudo leer.</span></li>
            <li><Icono nombre="upload" tamano={18} /><span><b>¿Sin archivos a mano?</b> Descarga el <a href="/demo/REAL_presupuesto_av-jaime-blanco_SEACE.pdf" download>presupuesto real de la Av. Jaime Blanco</a> (SEACE, con 3 errores reales) o un <a href="/demo/LL-03_pistas-pasaje-los-rosales_incompleto.pdf" download>expediente incompleto</a> y súbelos aquí.</span></li>
          </ul>
        </div>
      </section>
    </>
  );
}
