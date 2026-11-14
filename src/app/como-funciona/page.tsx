import { metadataAxis } from '@/lib/metadata';
import Link from 'next/link';
import { CabeceraPagina } from '@/components/ui';
import { IconoFlecha, IconoCandado, IconoCheck } from '@/components/iconos';

const FUENTES: [string, string, string][] = [
  ['Pliegos de absolución de consultas de 926 licitaciones de obras de La Libertad (2025-2026)', 'OECE, Contrataciones Abiertas (OCDS) y SEACE', 'Origen de las pruebas y entrenamiento del clasificador de causas'],
  ['Inhabilitaciones, multas y penalidades', 'OECE, CONOSCE y datos abiertos', 'Verificación del ganador y de cada integrante del consorcio'],
  ['Contratos, adicionales y ampliaciones publicados', 'OECE (OCDS) y SEACE', 'Historial de ejecución y causas reales de adicionales'],
  ['Inversiones públicas con ubicación y avance', 'MEF, Detalle de inversiones', 'Obras de agua y desagüe pendientes en la misma calle'],
  ['Informes de control sobre obras viales (fichas resumen)', 'Contraloría General de la República', 'Prioridades del plan de control en obra'],
  ['Peligros geológicos, zonas críticas, puntos críticos de ríos', 'INGEMMET y ANA', 'Peligros cerca de la obra'],
  ['Modelo de elevación de 30 m', 'Copernicus GLO-30 (ESA)', 'Pendiente de la calle y área que drena hacia ella'],
  ['Calles', 'OpenStreetMap', 'Trazo y longitud reales de la vía'],
];

export const metadata = metadataAxis('/como-funciona', 'Cómo funciona', 'Conoce cómo Axis revisa los documentos, qué fuentes usa y cómo trata los datos de un expediente.');

export default function ComoFunciona() {
  return <div>
    <CabeceraPagina titulo="Una revisión que puedes explicar" descripcion="Axis conecta el expediente, el territorio y la memoria de otras obras. Cada observación tiene una evidencia y un origen; la decisión sigue en manos del evaluador." accion={<Link href="/revisar?demo=0" className="boton-principal">Probar un ejemplo<IconoFlecha className="h-4 w-4" /></Link>} />
    <nav className="guide-nav" aria-label="En esta página"><a href="#recorrido">El recorrido</a><a href="#fuentes">Fuentes de datos</a><a href="#privacidad">Privacidad y límites</a><a href="#validacion">Validación</a></nav>
    <section id="recorrido" className="guide-section"><h2>Del PDF a una observación con evidencia</h2><div className="guide-steps">{[
      ['Lee y organiza', 'Sube uno o varios PDF. Axis lee el texto en tu navegador, oculta datos personales y reconoce las partes del expediente. Con archivos propios, puedes corregir esa clasificación antes de continuar.'],
      ['Cruza y verifica', 'Comprueba aritmética, cantidades, espesores, precios y plazos entre documentos. Contrasta la obra con las calles, la elevación del terreno y los datos públicos de su entorno.'],
      ['Explica y acompaña', 'Ordena las observaciones por prioridad y muestra su evidencia. Puedes revisar el territorio, consultar un plan de control en obra y generar el informe para el evaluador.'],
    ].map(([t, d], i) => <div key={t}><span>{i + 1}</span><div><h3>{t}</h3><p>{d}</p></div></div>)}</div></section>
    <section id="fuentes" className="guide-section"><h2>Datos públicos, con un propósito claro</h2><p className="guide-intro">El prototipo trabaja con copias descargadas. Los expedientes de ejemplo son ficticios; los antecedentes y el contexto territorial provienen de estas fuentes.</p><div className="sources-table"><table><caption className="sr-only">Fuentes de datos de Axis y su uso</caption><thead><tr><th scope="col">Información</th><th scope="col">Fuente</th><th scope="col">Cómo se usa</th></tr></thead><tbody>{FUENTES.map(([d, f, p]) => <tr key={d}><td data-label="Información">{d}</td><td data-label="Fuente">{f}</td><td data-label="Uso">{p}</td></tr>)}</tbody></table></div></section>
    <section id="privacidad" className="guide-section guide-columns"><div><h2 className="flex items-center gap-2"><IconoCandado className="h-5 w-5" />Privacidad desde la lectura</h2><ul className="guide-list"><li>El archivo PDF se procesa en el navegador. Al servidor se envía el texto después de ocultar los datos personales que reconoce el filtro.</li><li>Los registros de hallazgos y las pruebas validadas se guardan en tu navegador. El último análisis se conserva en esta pestaña.</li><li>De las personas naturales sancionadas se muestran los hechos y la resolución, sin su nombre. Los datos de control no guardan nombres ni DNI de funcionarios.</li><li>El selector de perfil permite explorar los roles de la demostración; no es un sistema de autenticación.</li></ul></div><div><h2>Lo que todavía requiere criterio humano</h2><ul className="guide-list"><li>Los escaneos se intentan leer con OCR local, hasta 30 páginas por archivo. Una lectura insuficiente o dudosa se señala para revisión.</li><li>El modelo de elevación tiene una resolución de 30 m: orienta sobre pendientes y cuencas, pero no sustituye un levantamiento topográfico.</li><li>Los umbrales de pendiente de 4% y cuenca de 5 ha son criterios de Axis, no límites de una norma.</li><li>No está demostrado que Axis reduzca adicionales. Las alertas de proveedores informan hechos registrados y requieren revisión.</li></ul></div></section>
    <section id="validacion" className="guide-section"><h2>Pruebas sobre casos conocidos</h2><ul className="validation-list">{[
      ['Presupuestos reales', 'Las pruebas verifican los errores conocidos de la Av. Jaime Blanco y de Calle Miguel Barreto, junto con presupuestos de control sin falsas alarmas.'],
      ['Tres escenarios de demostración', 'El expediente observado contiene 21 errores sembrados. El conforme comprueba que no se inventen fallas; el incompleto permite distinguir lo que falta.'],
      ['Aprendizaje comprobable', 'Un hallazgo validado genera una nueva alerta en un expediente cercano. El clasificador fue evaluado sobre 240 consultas reales etiquetadas.'],
    ].map(([t, d]) => <li key={t}><IconoCheck className="h-5 w-5 text-pasa" /><div><h3>{t}</h3><p>{d}</p></div></li>)}</ul><Link href="/pruebas" className="enlace mt-6 inline-flex min-h-[44px] items-center gap-2">Explorar la biblioteca de pruebas<IconoFlecha className="h-4 w-4" /></Link></section>
  </div>;
}
