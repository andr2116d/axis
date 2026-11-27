import Link from 'next/link';
import { listarPruebas } from '@/servidor/almacen';
import { Icono } from '@/componentes/Icono';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pruebas' };

// Resultados de la validación con documentos reales (scripts/analisis y docs de la versión anterior).
const VALIDACION: { cifra: string; titulo: string; detalle: string }[] = [
  { cifra: '249', titulo: 'PDF reales del SEACE leídos sin errores', detalle: 'Bases y anexos de obras de La Libertad. Se corrigieron las falsas alarmas que aparecieron (94 alertas falsas en un PDF, bases subidas como expediente, escaneos).' },
  { cifra: '3', titulo: 'errores reales en la Av. Jaime Blanco', detalle: 'LP-ABR-12-2026-MDEP (CUI 2735216): monto en letras S/ 20,000 mayor que el total, subtotal 01.07 que no suma su subtítulo y partidas globales con cantidad 2, 2 y 39.' },
  { cifra: '2', titulo: 'errores reales en la Calle Miguel Barreto', detalle: 'LP-ABR-10-2026-MDEP (CUI 2721555): «excavación de zanja para sardinel H=35 m» y una partida global con metrado 4. Es el origen real de V-IMPOSIBLE.' },
  { cifra: '0', titulo: 'falsas alarmas en presupuestos de control', detalle: 'Presupuestos reales de Santa Verónica, Indoamérica, Av. Perú y Av. C (Alto Trujillo) pasan sin observaciones inventadas; un escaneo se declara no verificable en vez de acusar.' },
  { cifra: '87 %', titulo: 'exactitud del clasificador de causas', detalle: 'Regresión logística entrenada con 11,408 consultas reales de 926 procesos; validación cruzada agrupada por proceso sobre 240 consultas etiquetadas.' },
  { cifra: '11/11', titulo: 'documentos ajenos rechazados', detalle: 'Un CV, una receta o un contrato no se revisan ni salen «sin observaciones».' },
  { cifra: '91/91', titulo: 'pruebas de regresión', detalle: 'Presupuestos reales, los tres expedientes sintéticos con sus errores sembrados, terreno, pertinencia, aprendizaje, clasificador, plazos legales y selección del contratista con datos del OECE (npm run analisis:regresion).' },
];

export default async function Pruebas() {
  const todas = pruebasConocidas(await listarPruebas());
  const activas = todas.filter((p) => p.estado === 'activa');
  const deObras = activas.filter((p) => p.origen === 'obra').length;
  const propuestas = todas.filter((p) => p.estado === 'propuesta').length;
  return (
    <>
      <nav className="subnav" aria-label="Aprendizaje"><Link href="/obras">Obras terminadas y paralizadas</Link><Link href="/pruebas" aria-current="page">Pruebas aprendidas</Link></nav>
      <section className="page-lead">
        <h1>Axis aprendió {activas.length} pruebas</h1>
        <p>
          {activas.length - deObras} salieron del entrenamiento con datos reales (pliegos del SEACE, informes de la Contraloría, presupuestos publicados) y {deObras} de obras terminadas o paralizadas registradas aquí.
          {propuestas ? ` Hay ${propuestas} propuesta(s) esperando que las aceptes en Obras terminadas.` : ''} Cada obra nueva puede enseñarle otra.
        </p>
      </section>

      <section aria-labelledby="lista" className="bloque">
        <h2 id="lista">Pruebas y de dónde las aprendió</h2>
        <ul className="biblioteca">
          {[...todas].sort((a, b) => Number(b.origen === 'obra') - Number(a.origen === 'obra')).map((p) => (
            <li key={p.id} className={p.origen === 'obra' ? 'de-obra' : ''}>
              <div className="obra-head">
                <span className="mono">{p.id}</span>
                <span className={`pill ${p.estado === 'activa' ? 'confirmed' : p.estado === 'propuesta' ? 'media' : 'alta'}`}>{p.estado === 'activa' ? (p.origen === 'obra' ? 'Aprendida de una obra' : 'Aprendida en el entrenamiento') : p.estado}</span>
              </div>
              <strong>{p.nombre}</strong>
              <p>{p.queRevisa}</p>
              <p className="origen"><Icono nombre={p.origen === 'obra' ? 'layers' : 'file'} tamano={14} /> Aprendida de {p.aprendidaDe}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="validacion" className="bloque">
        <h2 id="validacion">Cómo sabemos que funciona</h2>
        <ul className="cifras">
          {VALIDACION.map((v) => <li key={v.titulo}><b>{v.cifra}</b><strong>{v.titulo}</strong><span>{v.detalle}</span></li>)}
        </ul>
        <p className="inline-note"><Icono nombre="list" tamano={15} /> ¿Cómo encaja cada modelo? Ver <Link href="/como-funciona">Cómo funciona</Link>.</p>
      </section>
    </>
  );
}
