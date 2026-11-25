import Link from 'next/link';
import { GRUPOS_MOTORES } from '@/dominio/motores';
import { listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { Icono, type NombreIcono } from '@/componentes/Icono';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cómo funciona' };

const REVISION: [string, string, NombreIcono][] = [
  ['Sube el expediente', 'PDF, Word o Excel; un archivo o varios.', 'upload'],
  ['Lee y clasifica', 'Reconoce cada parte y rearma las tablas.', 'files'],
  ['Corre las pruebas', 'El modelo elige las que aplican a la obra.', 'check'],
  ['Semáforo y hallazgos', 'Cada observación con su documento y página.', 'alert'],
  ['Carta al proyectista', 'El evaluador decide qué enviar.', 'file'],
];

const APRENDIZAJE: [string, string, NombreIcono][] = [
  ['Obra terminada o paralizada', 'Resoluciones, informes, actas, liquidaciones.', 'building'],
  ['¿Qué pasó en obra?', 'Extrae cada condición de los documentos.', 'list'],
  ['¿Por qué?', 'El clasificador sugiere la causa.', 'target'],
  ['¿Lo previó el expediente?', 'Lo compara con el expediente original.', 'files'],
  ['Prueba nueva', 'La propone, el evaluador la acepta y corre en la próxima revisión.', 'layers'],
];

const DATOS: [string, string][] = [
  ['11,408 consultas y observaciones', 'Pliegos de absolución de 926 procesos de obra (SEACE, La Libertad 2025-2026)'],
  ['6,004 situaciones adversas', 'Fichas de 2,323 informes de control de la Contraloría'],
  ['377 adicionales y ampliaciones', 'Resoluciones publicadas en contratos OCDS, leídas con OCR'],
  ['1,410 obras licitadas', 'OECE · Contrataciones Abiertas, cruzadas con el MEF por CUI'],
  ['Territorio', 'OpenStreetMap, Copernicus GLO-30, INGEMMET, ANA e INEI'],
];

function Flujo({ titulo, pasos }: { titulo: string; pasos: [string, string, NombreIcono][] }) {
  return (
    <div className="flujo">
      <h3>{titulo}</h3>
      <ol>
        {pasos.map(([t, d, i], n) => (
          <li key={t}>
            <span className="flujo-icono"><Icono nombre={i} tamano={20} /></span>
            <strong><span className="mono">{n + 1}</span> {t}</strong>
            <small>{d}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function ComoFunciona() {
  const pruebas = pruebasConocidas(await listarPruebas()).filter((p) => p.estado === 'activa');
  const deObras = pruebas.filter((p) => p.origen === 'obra').length;
  const motores = GRUPOS_MOTORES.reduce((s, g) => s + g.motores.length, 0);
  return (
    <>
      <section className="page-lead">
        <h1>Cómo funciona Axis</h1>
        <p>Axis es un conjunto de {motores} modelos que aprenden pruebas. Empezaron con errores reales de obras de La Libertad y aprenden una nueva con cada obra terminada o paralizada que se registra. Cuantas más obras, más pruebas: hoy son <b>{pruebas.length}</b>{deObras ? `, ${deObras} aprendidas de obras` : ''}.</p>
      </section>

      <section className="flujos" aria-label="Los dos ciclos de Axis">
        <Flujo titulo="Revisión de un expediente" pasos={REVISION} />
        <Flujo titulo="Aprendizaje de una obra" pasos={APRENDIZAJE} />
        <p className="flujos-nota"><Icono nombre="rotate" tamano={16} /> Cada prueba aprendida se suma a las {pruebas.length} que ya corren en cada revisión. <Link href="/pruebas">Ver todas las pruebas</Link></p>
      </section>

      <section aria-labelledby="motores" className="bloque">
        <h2 id="motores">Los modelos, por función</h2>
        <div className="grupos-motores">
          {GRUPOS_MOTORES.map((g) => (
            <article key={g.id}>
              <h3><span className="flujo-icono"><Icono nombre={g.icono} tamano={20} /></span>{g.nombre}</h3>
              <ul>{g.motores.map((m) => <li key={m.id}><strong>{m.nombre}</strong><span>{m.proposito}</span></li>)}</ul>
            </article>
          ))}
        </div>
      </section>

      <section aria-labelledby="datos" className="bloque">
        <h2 id="datos">Con qué datos aprendió</h2>
        <ul className="cifras">
          {DATOS.map(([c, d]) => <li key={c}><strong>{c}</strong><span>{d}</span></li>)}
        </ul>
      </section>
    </>
  );
}
