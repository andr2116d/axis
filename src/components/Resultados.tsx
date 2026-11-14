'use client';
// Resultado de la revisión, pensado para decidir: veredicto → lo primero que hay que corregir → el expediente pieza por pieza.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Deteccion } from '@/lib/analisis/tipos-analisis';
import type { Rol } from '@/lib/sesion';
import type { AnalisisCliente } from '@/lib/tipos-cliente';
import { verificadorPorId } from '@/data/verificadores';
import { NOMBRE_PIEZA, ORDEN_PIEZAS, piezaDe, porQueImporta, veredicto, type Pieza } from '@/lib/explicaciones';
import { PerfilLongitudinal, CapasPavimento } from './DibujoCalle';
import { MapaObraDinamico } from './MapaObraDinamico';
import { soles } from './ui';
import { Seguro } from './Seguro';
import { ResumenRevision, type GrupoRevision } from './ResumenRevision';
import { RevisionGuiada } from './RevisionGuiada';
import { IconoCheck, IconoMapa, IconoCasco, IconoChevron, IconoFlecha, IconoImprimir, IconoLupa } from './iconos';

interface Props { nombre: string; analisis: AnalisisCliente; ocultos: Record<string, number>; paginas: number; rol: Rol; alVolver: (modo?: 'subir') => void }

const GRAVEDAD = { alta: 'Grave', media: 'Importante', baja: 'Menor' } as const;
const CONTENIDO_MINIMO: Pieza[] = ['memoria', 'presupuesto', 'metrados', 'apu', 'gastos', 'especificaciones', 'cronograma', 'formula', 'suelos', 'planos'];
type PiezaEstado = { p: Pieza; problemas: Deteccion[]; pendientes: Deteccion[]; bien: Deteccion[]; falta: boolean; paginas: number[] };

export function Resultados({ nombre, analisis: a, ocultos, paginas, rol, alVolver }: Props) {
  const [evidenciaAbierta, setEvidenciaAbierta] = useState(false);
  const [pestana, setPestana] = useState<'resumen' | 'revision' | 'territorio' | 'obra'>('resumen');
  const [filtro, setFiltro] = useState<GrupoRevision | ''>('');
  const [indice, setIndice] = useState(0);
  const esInfo = (d: Deteccion) => d.verificador === 'C-HISTORIAL';
  const fallas = a.detecciones.filter((d) => d.resultado === 'falla' && !esInfo(d));
  const pendientes = a.detecciones.filter((d) => d.resultado === 'no_verificable');
  const parcial = pendientes.some((d) => d.verificador === 'D-CONTENIDO');
  const v = veredicto(fallas, parcial, rol, pendientes.length, a.cobertura);
  const nOcultos = Object.values(ocultos).reduce((s, n) => s + n, 0);
  const prioridad = { alta: 0, media: 1, baja: 2 };
  const porRevisar = [...fallas].sort((x, y) => prioridad[x.severidad] - prioridad[y.severidad] || (y.montoInvolucrado ?? 0) - (x.montoInvolucrado ?? 0));
  porRevisar.push(...pendientes);
  // Estado de cada pieza del expediente
  const piezas: PiezaEstado[] = useMemo(() => {
    const presentes = new Set<string>(a.documentos.map((d) => d.documento));
    const det = (p: Pieza) => a.detecciones.filter((d) => !esInfo(d) && piezaDe(d) === p);
    const lista: Pieza[] = [...CONTENIDO_MINIMO];
    if (presentes.has('cotizaciones') || det('cotizaciones').length) lista.push('cotizaciones');
    lista.push('calle');
    if (det('aprendidas').length) lista.push('aprendidas');
    return ORDEN_PIEZAS.filter((p) => lista.includes(p)).map((p) => {
      const ds = det(p);
      return {
        p, problemas: ds.filter((d) => d.resultado === 'falla'), pendientes: ds.filter((d) => d.resultado === 'no_verificable'), bien: ds.filter((d) => d.resultado === 'pasa'),
        falta: p !== 'calle' && p !== 'aprendidas' && !presentes.has(p), paginas: a.documentos.filter((d) => d.documento === p).map((d) => d.pagina),
      };
    });
  }, [a]);
  const [sel, setSel] = useState<Pieza>(piezas.find((x) => x.p !== 'calle' && x.problemas.length)?.p ?? piezas[0].p);
  const actual = piezas.find((x) => x.p === sel) ?? piezas[0];

  const titulo = a.generales.nombre || a.nombreObra ? capital(a.generales.nombre ?? a.nombreObra ?? '') : nombre;
  const enfocar = (id: string) => requestAnimationFrame(() => {
    const destino = document.getElementById(id);
    destino?.focus({ preventScroll: true });
    destino?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  });
  const comenzar = (grupo?: GrupoRevision) => { setFiltro(grupo ?? ''); setIndice(0); setPestana('revision'); enfocar('hallazgo-titulo'); };
  const avanzar = (i: number) => { setIndice(i); enfocar('hallazgo-titulo'); };
  const documentos = () => { setPestana('revision'); setEvidenciaAbierta(true); enfocar('pieza'); };
  const tabs = [{ id: 'resumen', texto: 'Resumen', icono: IconoLupa }, { id: 'revision', texto: 'Revisar puntos', icono: IconoCheck }, { id: 'territorio', texto: 'Territorio', icono: IconoMapa }, { id: 'obra', texto: 'Plan de obra', icono: IconoCasco }] as const;
  const estadoPieza = (x: PiezaEstado) => x.problemas.length ? `${x.problemas.length} ${x.problemas.length === 1 ? 'observación' : 'observaciones'}` : x.falta ? (parcial ? 'No se subió' : 'Falta documento') : x.pendientes.length && !x.bien.length ? 'Por confirmar' : 'Sin observaciones';
  if (a.pertinencia && a.pertinencia.nivel !== 'expediente' && a.detecciones.some((d) => d.verificador === 'D-PERTINENCIA')) return <NoEsExpediente motivo={a.pertinencia.motivo} alVolver={() => alVolver('subir')} />;
  return <div className="results-v3">
    <header className="review-titlebar"><div><h1>Resultado de la revisión</h1><p>{nombre}</p></div><Link href="/informe" className="boton-borde"><IconoImprimir className="h-4 w-4" />Ver informe</Link></header>
    <details className="result-context"><summary>{paginas} páginas · {a.generales.distrito ? capital(a.generales.distrito) : 'Distrito no identificado'}<span className="context-more">Datos del expediente</span><IconoChevron className="h-3.5 w-3.5" /></summary><dl><div className="project-full-name"><dt>Nombre de la obra</dt><dd>{titulo}</dd></div>{a.total != null && <div><dt>Presupuesto</dt><dd>{soles(a.total)}</dd></div>}{a.generales.plazoDias && <div><dt>Plazo</dt><dd>{a.generales.plazoDias} días</dd></div>}{a.generales.cui && <div><dt>CUI</dt><dd>{a.generales.cui}</dd></div>}<div><dt>Datos personales ocultados</dt><dd>{nOcultos}</dd></div>{a.cobertura && <div className="project-full-name"><dt>Alcance de las pruebas</dt><dd>{a.cobertura.length ? a.cobertura.join(', ') : 'Sin información suficiente para aplicar pruebas'}</dd></div>}</dl></details>
    <div className="result-tabs no-imprimir" role="tablist" aria-label="Vistas de la revisión">{tabs.map((tab, index) => <button key={tab.id} id={`tab-${tab.id}`} role="tab" tabIndex={pestana === tab.id ? 0 : -1} aria-selected={pestana === tab.id} aria-controls={`panel-${tab.id}`} onClick={() => setPestana(tab.id)} onKeyDown={(e) => { const i = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1; if (i >= 0) { e.preventDefault(); setPestana(tabs[i].id); document.getElementById(`tab-${tabs[i].id}`)?.focus(); } }}><tab.icono className="h-4 w-4" />{tab.texto}</button>)}</div>
    {tabs.map((tab) => <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} tabIndex={0} hidden={pestana !== tab.id} className="result-panel">
      {pestana === tab.id && (tab.id === 'resumen' ? <ResumenRevision fallas={fallas} pendientes={pendientes.length} conformes={a.detecciones.filter((d) => d.resultado === 'pasa' && !esInfo(d)).length} limitado={v.tono === 'parcial'} alRevisar={comenzar} alSubir={() => alVolver('subir')} alPlan={() => { setPestana('obra'); enfocar('panel-obra'); }} alDocumentos={documentos} /> : tab.id === 'obra' ? <PlanObra a={a} /> : tab.id === 'territorio' ? <PanelCalle a={a} x={piezas.find((x) => x.p === 'calle')!} /> : <>
        <RevisionGuiada detecciones={porRevisar} filtro={filtro} indice={indice} alFiltro={(g) => { setFiltro(g); setIndice(0); }} alIndice={avanzar} rol={rol} />
        <details className="document-disclosure" open={evidenciaAbierta} onToggle={(e) => setEvidenciaAbierta(e.currentTarget.open)}><summary><h2>Consultar por documento</h2><IconoChevron className="h-5 w-5" /></summary><div className="document-workspace"><label className="document-picker"><span className="rotulo">Parte del expediente</span><select className="campo mt-2" value={sel} onChange={(e) => setSel(e.target.value as Pieza)}>{piezas.filter((x) => x.p !== 'calle').map((x) => <option key={x.p} value={x.p}>{NOMBRE_PIEZA[x.p]} · {estadoPieza(x)}</option>)}</select></label><div id="pieza" tabIndex={-1} className="document-detail scroll-mt-8"><PanelPieza key={sel} x={actual} parcial={parcial} rol={rol} observacion="" /></div></div></details>
      </>)}
    </div>)}
  </div>;
}

function PanelPieza({ x, parcial, rol, observacion }: { x: PiezaEstado; parcial: boolean; rol: Rol; observacion: string }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-bold">{NOMBRE_PIEZA[x.p]}</h3>
        {x.paginas.length > 0 && <p className="text-xs text-gris">{x.paginas.length === 1 ? 'página' : 'páginas'} {rango(x.paginas)} del expediente</p>}
      </div>
      {x.falta && <p className="mt-2 max-w-texto text-[15px] leading-relaxed text-tinta-2">{parcial ? 'Esta parte no se subió, así que sus pruebas no corrieron.' : 'El expediente no incluye esta parte, que es del contenido mínimo.'}</p>}
      {x.problemas.length > 0 && <ul className="mt-4 space-y-3">{x.problemas.map((d, i) => <Item key={i} d={d} rol={rol} abierto={idObservacion(d) === observacion} />)}</ul>}
      {x.pendientes.length > 0 && !x.falta && (<><p className="mt-6 text-sm font-bold text-revisar">Por confirmar</p><ul className="mt-2 space-y-3">{x.pendientes.map((d, i) => <Item key={i} d={d} rol={rol} />)}</ul></>)}
      {x.bien.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-bold text-pasa">Lo que está bien</p>
          <ul className="mt-2 space-y-1.5">{x.bien.map((d, i) => <li key={i} className="flex items-start gap-2 text-sm text-tinta-2"><IconoCheck className="mt-0.5 h-4 w-4 shrink-0 text-pasa" />{d.titulo}</li>)}</ul>
        </div>
      )}
      {!x.problemas.length && !x.pendientes.length && !x.bien.length && !x.falta && <p className="mt-2 text-[15px] text-tinta-2">Las pruebas de esta parte no encontraron problemas.</p>}
    </div>
  );
}

function Item({ d, rol, abierto = false }: { d: Deteccion; rol: Rol; abierto?: boolean }) {
  const v = verificadorPorId(d.verificador);
  const color = d.resultado === 'falla' ? (d.severidad === 'alta' ? 'bg-falla' : d.severidad === 'media' ? 'bg-aviso' : 'bg-aviso') : 'bg-revisar';
  const importa = d.resultado === 'falla' ? porQueImporta(d) : '';
  return (
    <li className="rounded-xl border border-borde">
      <details id={idObservacion(d)} open={abierto} className="group scroll-mt-8">
        <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
          <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${color}`} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-semibold leading-snug">{d.titulo}</span>
            {importa && <span className="mt-1 block text-sm leading-relaxed text-tinta-2">{importa}</span>}
            <span className="mt-1.5 flex flex-wrap gap-x-3 text-xs font-semibold text-gris">
              {d.resultado === 'falla' ? <span>{GRAVEDAD[d.severidad]}</span> : <span className="text-revisar">Por confirmar</span>}
              {d.montoInvolucrado && d.resultado === 'falla' ? <span>{soles(d.montoInvolucrado)} involucrados</span> : null}
            </span>
          </span>
          <span className="mt-0.5 hidden shrink-0 text-xs font-semibold text-gris group-open:hidden sm:inline">Ver detalle</span>
          <span className="mt-0.5 hidden shrink-0 text-xs font-semibold text-gris sm:group-open:inline">Ocultar</span>
          <IconoChevron className="mt-1 h-4 w-4 text-gris transition-transform group-open:rotate-90" />
        </summary>
        <div className="space-y-4 border-t border-borde px-4 pb-4 pt-4 sm:pl-9 text-[14.5px] leading-relaxed">
          <p className="max-w-texto">{d.detalle}</p>
          {d.evidencias.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gris">Dónde está</p>
              {d.evidencias.map((e, i) => (
                <figure key={i} className="mt-1.5">
                  <figcaption className="text-xs text-gris">{e.documento}{e.pagina ? `, página ${e.pagina}` : ''}</figcaption>
                  <blockquote className="cita mt-1">{e.extracto}</blockquote>
                </figure>
              ))}
            </div>
          )}
          {v && d.resultado !== 'pasa' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-lg bg-primario-claro p-3">
                <p className="text-xs font-bold">{rol === 'proyectista' ? 'Cómo corregirlo' : 'Qué pedir al proyectista'}</p>
                <p className="mt-1 text-sm">{v.recomendacion}{v.norma ? ` (${v.norma})` : ''}</p>
              </div>
              <div className="rounded-lg bg-fondo p-3">
                <p className="text-xs font-bold">Por qué Axis revisa esto</p>
                <p className="mt-1 text-sm text-tinta-2">Pasó en {v.origen[0].obra} ({v.origen[0].proceso}): {v.origen[0].hallazgo}</p>
                <Link href={`/pruebas#${v.id}`} className="mt-1 inline-flex min-h-[44px] items-center text-sm font-semibold text-primario underline underline-offset-4">Más casos</Link>
              </div>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/** La calle explicada: primero en palabras, luego mapa, perfil y sección como apoyo. */
function PanelCalle({ a, x }: { a: AnalisisCliente; x: PiezaEstado }) {
  const t = a.terreno;
  const info = a.detecciones.find((d) => d.verificador === 'C-HISTORIAL');
  const pend = x.pendientes.filter((d) => d.verificador !== 'C-UBICACION');
  return <section className="territory-view" aria-labelledby="territorio-titulo">
    <h2 id="territorio-titulo">La obra, en su territorio</h2>
    {a.generales.ubicacionEstimada && <p className="location-notice">Ubicación estimada por el nombre de la calle en {capital(a.generales.ubicacionEstimada.distrito)}. Confírmala en los planos.</p>}
    {!t?.via && <p className="location-notice">{a.generales.ubicacion ? 'La ubicación no tiene cobertura de terreno o la calle no figura en OpenStreetMap.' : 'Se necesitan coordenadas o un nombre de calle reconocible para mostrar el entorno.'}</p>}
    <div className="territory-visuals">
      {t?.via && <figure className="territory-map"><Seguro aviso="El mapa no se pudo mostrar en este navegador."><MapaObraDinamico trazo={t.via.trazo} ubicacion={a.generales.ubicacion} cuenca={t.cuenca} alto={300} /></Seguro><figcaption><span className="map-line" aria-hidden="true" />Tramo de la obra{t.cuenca && <span className="map-catchment">El área azul aporta agua de lluvia: {t.cuenca.tocaBorde ? 'al menos ' : ''}{t.cuenca.areaHa.toFixed(1)} ha.</span>}</figcaption></figure>}
      {t?.perfil && <Seguro><PerfilLongitudinal perfil={t.perfil} /></Seguro>}
    </div>
    {a.seccion && a.seccion.capas.length > 0 && <Seguro><CapasPavimento s={a.seccion} /></Seguro>}
    <details className="territory-findings"><summary>Comprobaciones del entorno{ x.problemas.length > 0 ? ` · ${x.problemas.length} observaciones` : ''}<IconoChevron className="h-4 w-4" /></summary><div>
      {x.problemas.length > 0 && <ul className="space-y-3">{x.problemas.map((d, i) => <Item key={i} d={d} rol="evaluador" />)}</ul>}
      {pend.length > 0 && <ul className="mt-3 space-y-3">{pend.map((d, i) => <Item key={i} d={d} rol="evaluador" />)}</ul>}
      {x.bien.length > 0 && <ul className="mt-5 space-y-2">{x.bien.map((d, i) => <li key={i} className="flex items-start gap-2 text-sm text-tinta-2"><IconoCheck className="mt-0.5 h-4 w-4 text-pasa" />{d.titulo}</li>)}</ul>}
      {info && <p className="mt-6 text-sm leading-relaxed text-tinta-2">{info.titulo}. Conviene revisar metrados, estudios e interferencias.</p>}
    </div></details>
  </section>;
}

function PlanObra({ a }: { a: AnalisisCliente }) {
  if (!a.planObra?.length) return <p className="hoja p-5 text-sm">El expediente no trae un presupuesto legible, así que no se puede armar el plan de control.</p>;
  return (
    <div>
      <h2 className="text-xl font-bold">Qué controlar en la obra, en orden</h2>
      <p className="mt-1 max-w-texto text-[15px] leading-relaxed text-tinta-2">Con los valores de este expediente. Primero va lo que más pesa en el costo y lo que la Contraloría encuentra mal con más frecuencia en obras viales.</p>
      <ol className="mt-6 space-y-4">
        {a.planObra.map((p, n) => (
          <li key={p.elemento} className="border-b border-borde py-6 first:pt-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primario text-sm font-bold text-sobre-enfasis">{n + 1}</span>
              <h3 className="text-lg font-bold first-letter:uppercase">{p.elemento}</h3>
              <span className="text-xs text-gris">partidas {p.partidas.map((x) => x.codigo).join(', ')}</span>
            </div>
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {p.verificar.map((v) => (
                <li key={v.que} className={`rounded p-3 ${/aclarar|no lo fija/.test(v.valor) ? 'bg-falla-tenue' : 'bg-fondo'}`}>
                  <p className="text-sm font-bold">{v.que}</p>
                  <p className={`mt-1 text-[15px] font-semibold ${/aclarar|no lo fija/.test(v.valor) ? 'text-falla' : ''}`}>{v.valor}</p>
                  <p className="mt-1 text-xs text-gris">{v.momento}</p>
                </li>
              ))}
            </ul>
            {p.antecedentes[0] && (
              <details className="plan-origin"><summary>Por qué está en el plan<IconoChevron className="h-4 w-4" /></summary><p>{p.porque}. Por ejemplo, el informe {p.antecedentes[0].informe} ({p.antecedentes[0].lugar}): «{p.antecedentes[0].texto.replace(/^[:\s]+/, '').slice(0, 200)}…»</p></details>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

const idObservacion = (d: Deteccion) => `observacion-${encodeURIComponent(`${d.verificador}-${d.titulo}`)}`;
const rango = (ps: number[]) => (ps.length === 1 ? `${ps[0]}` : `${Math.min(...ps)} a ${Math.max(...ps)}`);
const capital = (s: string) => s.replace(/^["“'\s—–\-.,;:]+|["”'\s]+$/g, '').toLowerCase().replace(/(^|[\s(-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
  .replace(/(?<!(?:Calle|Av\.|Avenida|Jr\.|Jirón|Pasaje|Psje\.|-)\s)\b(De|Del|La|Las|Los|En|El|Y|A|Con)\b/g, (m) => m.toLowerCase()).replace(/^./, (x) => x.toUpperCase());

/** Lo subido no es un expediente: se dice qué parece y qué hacer, sin pruebas ni conteos que confundan. */
export function NoEsExpediente({ motivo, alVolver }: { motivo: string; alVolver: () => void }) {
  return <section className="tarjeta mx-auto max-w-2xl p-6 sm:p-8" aria-labelledby="no-expediente">
    <h1 id="no-expediente" className="text-2xl font-bold">Esto no parece un expediente técnico de obra</h1>
    <p className="mt-2 text-base leading-relaxed text-tinta-2">{motivo} Por eso no se corrió ninguna prueba: decir «sin observaciones» sobre algo que no es un expediente no tendría sentido.</p>
    <div className="mt-5 rounded-lg bg-fondo p-4 text-sm leading-relaxed">
      <p className="font-bold">Axis revisa expedientes técnicos de obra, por ejemplo:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-tinta-2"><li>el presupuesto con sus partidas (exportado de S10 o Excel),</li><li>la planilla de metrados, los análisis de precios y las especificaciones técnicas,</li><li>la memoria descriptiva, el cronograma, la fórmula polinómica o el estudio de suelos.</li></ul>
    </div>
    <div className="mt-6 flex flex-wrap gap-3"><button onClick={alVolver} className="boton-principal">Subir otro archivo</button><a href="/?demo=0" className="boton-borde">Probar con un ejemplo</a></div>
  </section>;
}
