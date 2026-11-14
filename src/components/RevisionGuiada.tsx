'use client';
import Link from 'next/link';
import type { Deteccion } from '@/lib/analisis/tipos-analisis';
import { verificadorPorId } from '@/data/verificadores';
import { NOMBRE_PIEZA, piezaDe } from '@/lib/explicaciones';
import { IconoChevron, IconoFlecha } from './iconos';
import { grupoDe, GRUPOS, type GrupoRevision } from './ResumenRevision';

export function RevisionGuiada({ detecciones, filtro, indice, alFiltro, alIndice, rol }: {
  detecciones: Deteccion[]; filtro: GrupoRevision | ''; indice: number;
  alFiltro: (g: GrupoRevision | '') => void; alIndice: (i: number) => void; rol: string;
}) {
  const lista = detecciones.filter((d) => !filtro || grupoDe(d) === filtro);
  const posicion = Math.min(indice, Math.max(0, lista.length - 1));
  const d = lista[posicion];
  const ficha = d && verificadorPorId(d.verificador);
  if (!d) return <div className="review-empty"><h2>No hay observaciones en este grupo</h2><p>Puedes consultar los documentos revisados o continuar con el plan de obra.</p></div>;
  return <div className="guided-review">
    <div className="guided-toolbar"><label htmlFor="grupo-revision" className="rotulo">Revisar<select id="grupo-revision" className="campo" value={filtro} onChange={(e) => alFiltro(e.target.value as GrupoRevision | '')}><option value="">Todos los temas ({detecciones.length})</option>{GRUPOS.map((g) => { const n = detecciones.filter((x) => grupoDe(x) === g).length; return n ? <option key={g} value={g}>{g} ({n})</option> : null; })}</select></label><p aria-live="polite">Punto <b>{posicion + 1}</b> de {lista.length}</p></div>
    <article key={`${filtro}-${posicion}`} className="guided-finding" aria-labelledby="hallazgo-titulo">
      <div className="finding-label"><span className={d.resultado === 'no_verificable' ? 'text-revisar' : d.severidad === 'alta' ? 'text-falla' : 'text-aviso'}>{d.resultado === 'no_verificable' ? 'Por confirmar' : d.severidad === 'alta' ? 'Prioridad alta' : 'Requiere revisión'}</span><span>{NOMBRE_PIEZA[piezaDe(d)]}</span></div>
      <h2 id="hallazgo-titulo" tabIndex={-1}>{d.titulo}</h2>
      <section className="finding-action" aria-label="Acción recomendada"><h3>{rol === 'proyectista' ? 'Qué corregir' : 'Qué hacer ahora'}</h3><p>{d.resultado === 'no_verificable' ? 'Comprueba este punto en el documento original y completa la información que falta para verificarlo.' : ficha?.recomendacion ?? 'Contrasta esta observación con el expediente y solicita que se aclare o corrija la información.'}</p></section>
      <details className="finding-evidence"><summary>Ver evidencia y fuente<IconoChevron className="h-4 w-4" /></summary><div><p className="finding-explanation">{d.detalle}</p>{d.evidencias.length > 0 && <div className="evidence-pair">{d.evidencias.map((e, i) => <figure key={i}><figcaption>{e.documento}{e.pagina ? ` · página ${e.pagina}` : ''}</figcaption><blockquote className="cita">{e.extracto}</blockquote></figure>)}</div>}{ficha && <p className="finding-source">La prueba nace de casos documentados como {ficha.origen[0].obra}. <Link href={`/pruebas#${ficha.id}`} className="enlace">Consultar la prueba</Link></p>}</div></details>
    </article>
    <nav className="guided-pagination" aria-label="Recorrer observaciones"><button className="boton-borde" disabled={posicion === 0} onClick={() => alIndice(posicion - 1)}><IconoFlecha className="h-4 w-4 rotate-180" />Anterior</button>{posicion < lista.length - 1 ? <button className="boton-principal" onClick={() => alIndice(posicion + 1)}>Siguiente punto<IconoFlecha className="h-4 w-4" /></button> : <Link href="/informe" className="boton-principal">Abrir informe<IconoFlecha className="h-4 w-4" /></Link>}</nav>
  </div>;
}
