'use client';
import type { Deteccion } from '@/lib/analisis/tipos-analisis';
import { piezaDe } from '@/lib/explicaciones';
import { IconoFlecha, IconoCheck, IconoInfo } from './iconos';

export const GRUPOS = ['Costos y cantidades', 'Documentos y diseño', 'Territorio', 'Aprendizaje de obra'] as const;
export type GrupoRevision = typeof GRUPOS[number];
export function grupoDe(d: Deteccion): GrupoRevision {
  const p = piezaDe(d);
  return p === 'calle' ? 'Territorio' : p === 'aprendidas' ? 'Aprendizaje de obra' : ['presupuesto', 'metrados', 'apu', 'gastos', 'formula', 'cotizaciones'].includes(p) ? 'Costos y cantidades' : 'Documentos y diseño';
}

export function ResumenRevision({ fallas, pendientes, conformes, limitado, alRevisar, alPlan, alSubir, alDocumentos }: {
  fallas: Deteccion[]; pendientes: number; conformes: number; limitado: boolean;
  alRevisar: (grupo?: GrupoRevision) => void; alPlan: () => void; alSubir: () => void; alDocumentos: () => void;
}) {
  const graves = fallas.filter((d) => d.severidad === 'alta').length;
  const filas = GRUPOS.map((nombre) => ({ nombre, total: fallas.filter((d) => grupoDe(d) === nombre).length })).filter((g) => g.total > 0);
  const maximo = Math.max(1, ...filas.map((g) => g.total));
  const titulo = fallas.length ? 'Hay correcciones que revisar' : limitado ? 'Falta información para continuar' : pendientes ? 'Hay puntos que debes confirmar' : 'Puedes continuar con la revisión técnica';
  const texto = fallas.length ? `${fallas.length} ${fallas.length === 1 ? 'observación detectada' : 'observaciones detectadas'}${graves ? `; ${graves} de prioridad alta` : ''}. Empieza por la primera y comprueba qué corregir.` : limitado ? 'La revisión cubrió solo una parte del expediente. Completa los documentos antes de sacar conclusiones.' : pendientes ? `${pendientes} ${pendientes === 1 ? 'punto necesita' : 'puntos necesitan'} comprobación manual. Revisa la información que falta.` : 'Las pruebas aplicadas no encontraron observaciones. Consulta los controles que este expediente propone para la obra.';
  return <section className="result-overview" aria-labelledby="veredicto">
    <div className="next-decision">
      <h2 id="veredicto">{titulo}</h2><p>{texto}</p>
      <button className="boton-principal" onClick={() => fallas.length || (!limitado && pendientes) ? alRevisar() : limitado ? alSubir() : alPlan()}>{fallas.length ? 'Revisar primera observación' : limitado ? 'Subir más documentos' : pendientes ? 'Revisar punto pendiente' : 'Ver controles de obra'}<IconoFlecha className="h-4 w-4" /></button>
      <p className="decision-hint">{fallas.length || pendientes ? 'Una observación a la vez, con su acción y evidencia.' : 'El resultado apoya tu evaluación; no aprueba el expediente.'}</p>
    </div>
    {fallas.length ? <figure className="findings-chart"><figcaption>Dónde están las observaciones</figcaption><p>Selecciona un grupo para revisarlo.</p><ul>{filas.map((g) => <li key={g.nombre}><button onClick={() => alRevisar(g.nombre)} aria-label={`Revisar ${g.nombre}: ${g.total} observaciones`}><span className="chart-row-label">{g.nombre}<strong>{g.total}<IconoFlecha className="h-4 w-4" /></strong></span><span className="chart-track" aria-hidden="true"><span style={{ width: `${g.total / maximo * 100}%` }} /></span></button></li>)}</ul><p className="chart-caption">Cantidad de observaciones por tema.</p></figure> : <div className="review-coverage">{limitado || pendientes ? <IconoInfo className="h-7 w-7" /> : <IconoCheck className="h-7 w-7" />}<h3>{limitado ? 'Consulta el alcance de esta revisión' : 'Lo revisado, a la vista'}</h3><dl><div><dt>Comprobaciones sin observación</dt><dd>{conformes}</dd></div><div><dt>Por confirmar</dt><dd>{pendientes}</dd></div></dl><button className="enlace" onClick={alDocumentos}>Ver documentos revisados<IconoFlecha className="h-4 w-4" /></button></div>}
  </section>;
}
