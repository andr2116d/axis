import Link from 'next/link';
import { GRUPOS_MOTORES, type Fase } from '@/dominio/motores';
import { listarPruebas } from '@/servidor/almacen';
import { pruebasConocidas } from '@/servidor/aprendizaje/biblioteca';
import { Icono, type NombreIcono } from '@/componentes/Icono';
import { Cita } from '@/componentes/Cita';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cómo funciona' };

// El proceso real de una obra pública (Ley 32069 y su Reglamento, DS 009-2025-EF) y en
// qué punto actúa Axis. Cada paso dice quién lo usa y la norma que lo sostiene.

interface Paso { t: string; d: string; i: NombreIcono }
interface FaseInfo { id: Fase; n: string; nombre: string; quien: string; resumen: string; pasos: Paso[]; normas: string[]; href: string }

const FASES: FaseInfo[] = [
  {
    id: 'expediente', n: '1', nombre: 'Expediente técnico', quien: 'Unidad ejecutora, equipo revisor o supervisor del expediente', href: '/',
    resumen: 'La entidad elabora el expediente o contrata a un consultor. Antes de convocar, debe aprobarlo: es responsable de sus errores. Aquí se evita la mayoría de adicionales.',
    pasos: [
      { t: 'Sube cada parte', d: 'Metrados, presupuesto, APU, planos, estudios: PDF, Word o Excel.', i: 'upload' },
      { t: 'Semáforo y evidencia', d: 'El modelo elige las pruebas que aplican y cita documento y página.', i: 'alert' },
      { t: 'Juicio de experto', d: 'Justificas una alerta; Axis revisa el sustento antes de aceptarla.', i: 'user' },
      { t: 'Carta y nueva versión', d: 'Al consultor con los plazos del art. 144; corriges hasta el verde.', i: 'rotate' },
    ],
    normas: ['Aprobación del expediente antes de la convocatoria (art. 158.1 a)', 'Conformidad en 20 días y subsanación ≤ 30 % del plazo del entregable (art. 144)', 'Supervisión obligatoria del expediente desde 585 UIT (art. 185.3)', 'Retroalimentación a la unidad formuladora (art. 173.2)'],
  },
  {
    id: 'seleccion', n: '2', nombre: 'Selección del contratista', quien: 'Comité u oficial de compra; la DEC en la verificación posterior', href: '/seleccion',
    resumen: 'Los postores no hacen el expediente: lo revisan, consultan y ofertan un precio en el SEACE. Gana quien dicen las bases; Axis no lo cambia, pero dice qué verificar a fondo.',
    pasos: [
      { t: 'Orden legal', d: 'Ofertas válidas (95 % a 110 %), puntaje y desempate del art. 81.', i: 'list' },
      { t: 'Antecedentes', d: 'Sanciones, penalidades e historial de obras de cada RUC.', i: 'files' },
      { t: 'Consorcios y vínculos', d: 'Experiencia frente a participación; postores que comparten datos.', i: 'target' },
      { t: 'Qué hacer y quién', d: 'Verificación posterior, Indecopi o mínimos para las próximas bases.', i: 'check' },
    ],
    normas: ['Evaluadores autónomos (art. 56.6)', 'Verificación posterior en 10 días hábiles (art. 83)', 'Mínimo de participación en consorcio (art. 72.3 d)', 'Remisión a Indecopi por posible concertación (Ley, DCF 24.ª)'],
  },
  {
    id: 'ejecucion', n: '3', nombre: 'Ejecución de la obra', quien: 'Unidad ejecutora, con el supervisor o inspector', href: '/ejecucion',
    resumen: 'Todo pasa por el cuaderno de incidencias. El contratista pide; la entidad tiene plazos y, si no responde a tiempo, en varios casos lo pedido queda aprobado.',
    pasos: [
      { t: 'Llega la solicitud', d: 'Ampliación, consulta, adicional o valorización.', i: 'file' },
      { t: 'Plazos de la entidad', d: 'Días hábiles o calendario y qué pasa si no responde.', i: 'clock' },
      { t: 'Cotejo con el expediente', d: '¿Ya estaba previsto? ¿El expediente responde la consulta?', i: 'files' },
      { t: 'Pronunciamiento', d: 'Borrador con base legal para que lo firme el responsable.', i: 'print' },
    ],
    normas: ['Consultas (art. 190)', 'Adicionales y topes de 15 %, 30 % y 50 % (art. 194; Ley, art. 64)', 'Ampliación de plazo y silencio positivo (art. 198 y 200)', 'Valorización mensual y pago (art. 210; Ley, art. 67)'],
  },
  {
    id: 'aprendizaje', n: '↻', nombre: 'Cierre y aprendizaje', quien: 'Quien registra la obra terminada o paralizada', href: '/obras',
    resumen: 'Lo que pasó en la obra es la mejor prueba de lo que le faltó al expediente. Axis lo convierte en una prueba nueva que corre en las revisiones siguientes.',
    pasos: [
      { t: 'Informe final', d: 'Resoluciones, informes, actas, liquidación.', i: 'building' },
      { t: '¿Qué pasó y por qué?', d: 'Extrae cada condición y el clasificador sugiere la causa.', i: 'target' },
      { t: '¿Lo previó el expediente?', d: 'Lo compara con el expediente original.', i: 'files' },
      { t: 'Prueba nueva', d: 'Se valida, el evaluador la acepta y corre en la próxima revisión.', i: 'layers' },
    ],
    normas: ['Adicionales por deficiencias del expediente: informar al Tribunal y a la Contraloría (Ley, art. 64.5)', 'Recepción y liquidación (art. 212 y 215)'],
  },
];

const DATOS: [string, string][] = [
  ['11,408 consultas y observaciones', 'Pliegos de absolución de 926 procesos de obra (SEACE, La Libertad 2025-2026)'],
  ['6,004 situaciones adversas', 'Fichas de 2,323 informes de control de la Contraloría'],
  ['377 adicionales y ampliaciones', 'Resoluciones publicadas en contratos OCDS, leídas con OCR'],
  ['1,410 obras licitadas', 'OECE · Contrataciones Abiertas, cruzadas con el MEF por CUI'],
  ['10,627 proveedores con antecedentes', 'Inhabilitaciones, multas y penalidades (OECE, datos abiertos)'],
  ['Territorio', 'OpenStreetMap, Copernicus GLO-30, INGEMMET, ANA e INEI'],
];

export default async function ComoFunciona() {
  const pruebas = pruebasConocidas(await listarPruebas()).filter((p) => p.estado === 'activa');
  const deObras = pruebas.filter((p) => p.origen === 'obra').length;
  const motores = GRUPOS_MOTORES.reduce((s, g) => s + g.motores.length, 0);
  return (
    <>
      <section className="page-lead">
        <h1>Cómo funciona Axis</h1>
        <p>Axis acompaña a la entidad en las tres fases de una obra pública en que tiene que decidir —aprobar el expediente, verificar al ganador y responder al contratista— y aprende de cómo terminó cada obra. Son {motores} modelos; hoy corren <b>{pruebas.length}</b> pruebas sobre los expedientes{deObras ? `, ${deObras} aprendidas de obras` : ''}.</p>
      </section>

      <section aria-labelledby="proceso" className="bloque">
        <h2 id="proceso">El proceso y dónde actúa Axis</h2>
        <ol className="proceso-fases">
          {FASES.map((f) => (
            <li key={f.id} className={`proceso-fase fase-${f.id}`}>
              <header>
                <span className="fase-num">{f.n}</span>
                <div><h3>{f.nombre}</h3><small>{f.quien}</small></div>
                <Link className="text-link" href={f.href}>Abrir <Icono nombre="chevron" tamano={15} /></Link>
              </header>
              <p>{f.resumen}</p>
              <ol className="fase-pasos">
                {f.pasos.map((p) => <li key={p.t}><span className="flujo-icono"><Icono nombre={p.i} tamano={18} /></span><strong>{p.t}</strong><small>{p.d}</small></li>)}
              </ol>
              <details>
                <summary>Base legal</summary>
                <ul>{f.normas.map((n) => <li key={n}><Cita texto={n} /></li>)}</ul>
              </details>
            </li>
          ))}
        </ol>
        <p className="flujos-nota"><Icono nombre="rotate" tamano={16} /> Lo que el expediente no previó —una consulta que lo corrige, un adicional, una ampliación— vuelve como prueba nueva a la fase 1. <Link href="/pruebas">Ver las pruebas</Link></p>
      </section>

      <section aria-labelledby="motores" className="bloque">
        <h2 id="motores">Los modelos, por fase</h2>
        {FASES.map((f) => {
          const grupos = GRUPOS_MOTORES.filter((g) => g.fase === f.id);
          if (!grupos.length) return null;
          return (
            <div key={f.id} className="motores-fase">
              <h3><span className="fase-num chica">{f.n}</span>{f.nombre}</h3>
              <div className="grupos-motores">
                {grupos.map((g) => (
                  <article key={g.id}>
                    <h3><span className="flujo-icono"><Icono nombre={g.icono} tamano={20} /></span>{g.nombre}</h3>
                    <ul>{g.motores.map((m) => <li key={m.id}><strong>{m.nombre}</strong><span>{m.proposito}</span></li>)}</ul>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
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
