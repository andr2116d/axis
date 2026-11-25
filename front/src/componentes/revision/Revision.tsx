'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Categoria, Expediente, Hallazgo, Prioridad } from '@/dominio/tipos';
import { nombreMotor } from '@/dominio/motores';
import { Icono, type NombreIcono } from '../Icono';
import { useAviso } from '../Aviso';
import { Territorio } from '../territorio/Territorio';
import { CATEGORIAS, LECTURA, PRIORIDADES, Pill, categoria, tamano } from '../ui';
import { guardarCarta } from './guardar-carta';
import { SEMAFORO, Semaforo } from '../Semaforo';

type Pestana = 'hallazgos' | 'pruebas' | 'documentos' | 'territorio';
type Orden = 'prioridad' | 'categoria' | 'titulo';
const RANGO: Record<Prioridad, number> = { alta: 0, media: 1, confirmar: 2 };

export function Revision({ expediente }: { expediente: Expediente }) {
  const e = expediente;
  const avisar = useAviso();
  const [pestana, setPestana] = useState<Pestana>('hallazgos');
  const [cat, setCat] = useState<Categoria | 'todos'>('todos');
  const [filtro, setFiltro] = useState<Prioridad | 'todos'>('todos');
  const [orden, setOrden] = useState<Orden>('prioridad');
  const [elegido, setElegido] = useState(e.hallazgos[0]?.id ?? '');
  const [incluidos, setIncluidos] = useState(() => new Set(e.carta.incluidos));

  const todos = e.hallazgos;
  const lista = useMemo(() => todos
    .filter((h) => (cat === 'todos' || h.categoria === cat) && (filtro === 'todos' || h.prioridad === filtro))
    .sort((a, b) => orden === 'categoria'
      ? CATEGORIAS.findIndex((c) => c.id === a.categoria) - CATEGORIAS.findIndex((c) => c.id === b.categoria) || RANGO[a.prioridad] - RANGO[b.prioridad]
      : orden === 'prioridad' ? RANGO[a.prioridad] - RANGO[b.prioridad] : a.titulo.localeCompare(b.titulo, 'es')), [todos, cat, filtro, orden]);
  const actual = lista.find((h) => h.id === elegido) ?? lista[0];

  const altas = todos.filter((h) => h.prioridad === 'alta').length;
  const observaciones = todos.filter((h) => h.prioridad !== 'confirmar').length;
  const pendientes = todos.length - observaciones;
  const lecturaIncompleta = e.documentos.some((d) => d.lectura !== 'leido');

  const alternar = async (id: string) => {
    const siguiente = new Set(incluidos);
    const quitar = siguiente.has(id);
    if (quitar) siguiente.delete(id); else siguiente.add(id);
    setIncluidos(siguiente);
    avisar(quitar ? 'Observación retirada de la carta.' : 'Observación agregada a la carta.');
    await guardarCarta(e.id, { incluidos: [...siguiente] }).catch(() => avisar('No se pudo guardar el cambio en la carta.'));
  };

  const pestanas: [Pestana, string, NombreIcono][] = [
    ['hallazgos', 'Hallazgos', 'list'], ['pruebas', e.pruebas ? `Pruebas (${e.pruebas.aplicadas} de ${e.pruebas.total})` : 'Pruebas', 'check'], ['documentos', 'Documentos', 'files'], ['territorio', 'Territorio', 'map'],
  ];

  return (
    <>
      <div className="review-breadcrumb"><Link className="back" href="/"><Icono nombre="back" tamano={17} /> Nueva revisión</Link></div>
      <section className="review-heading">
        <div>
          <h1>{e.nombre}</h1>
          <p><Icono nombre="pin" tamano={16} /> {e.lugar ?? 'Ubicación no declarada'} <span className="divider-dot" /> {e.documentos.length} documentos <span className="divider-dot" /> <span className="mono">{e.clave}</span></p>
        </div>
        <Link className="btn primary" href={`/revision/${e.id}/carta`}><Icono nombre="file" tamano={18} />Abrir carta <span className="btn-count">{incluidos.size}</span></Link>
      </section>

      <div className={`summary-strip resultado-${e.semaforo}`}>
        <div className="summary-main">
          <Semaforo estado={e.semaforo} />
          <div>
            <strong>{SEMAFORO[e.semaforo].titulo}</strong>
            <small>
              {altas ? `${altas} ${altas === 1 ? 'observación' : 'observaciones'} de prioridad alta. Empieza por esos puntos. ` : SEMAFORO[e.semaforo].texto + ' '}
              {e.pruebas ? `Aplicaron ${e.pruebas.aplicadas} de las ${e.pruebas.total} pruebas que Axis aprendió` : `Se revisaron ${e.cobertura.length} grupos de pruebas`}{lecturaIncompleta ? '; hay documentos que no se leyeron completos' : ''}.
            </small>
          </div>
        </div>
        <dl>
          <div><dt>Observaciones</dt><dd>{observaciones}</dd></div>
          <div><dt>Por confirmar</dt><dd>{pendientes}</dd></div>
          <div><dt>Documentos</dt><dd>{e.documentos.length}</dd></div>
        </dl>
      </div>

      <div className="review-tabs" role="group" aria-label="Secciones de la revisión">
        {pestanas.map(([id, texto, icono]) => (
          <button key={id} className="review-tab" type="button" aria-pressed={pestana === id} onClick={() => setPestana(id)}><Icono nombre={icono} tamano={17} />{texto}</button>
        ))}
      </div>

      {pestana === 'hallazgos' && altas > 0 && filtro !== 'alta' && (
        <div className="review-notices">
          <button className="priority-jump" type="button" onClick={() => { setCat('todos'); setFiltro('alta'); }}>
            <Icono nombre="alert" tamano={21} /><span><b>{altas} {altas === 1 ? 'observación' : 'observaciones'} de prioridad alta</b><small>Ver las comprobaciones que requieren atención primero.</small></span><Icono nombre="chevron" tamano={18} />
          </button>
        </div>
      )}

      {pestana === 'hallazgos' && (
        <>
          <div className="category-bar" role="group" aria-label="Categorías de hallazgos">
            {[{ id: 'todos' as const, nombre: 'Todas', icono: 'list' as NombreIcono }, ...CATEGORIAS].map((c) => (
              <button key={c.id} className="category" type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
                <Icono nombre={c.icono} tamano={17} />{c.nombre}<b>{c.id === 'todos' ? todos.length : todos.filter((h) => h.categoria === c.id).length}</b>
              </button>
            ))}
          </div>
          <div className="review-grid">
            <section className="finding-list" aria-labelledby="titulo-hallazgos">
              <div className="findings-head">
                <h2 id="titulo-hallazgos">Hallazgos <span>{lista.length}</span></h2>
                <div className="filters">
                  <label><span className="sr-only">Filtrar por prioridad</span>
                    <select value={filtro} onChange={(x) => setFiltro(x.target.value as Prioridad | 'todos')}>
                      <option value="todos">Todos los estados</option>
                      {(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => <option key={p} value={p}>{PRIORIDADES[p].texto}</option>)}
                    </select>
                  </label>
                  <label><span className="sr-only">Ordenar hallazgos</span>
                    <select value={orden} onChange={(x) => setOrden(x.target.value as Orden)}>
                      <option value="prioridad">Por prioridad</option><option value="categoria">Por categoría</option><option value="titulo">Por título</option>
                    </select>
                  </label>
                </div>
              </div>
              <div role="group" aria-label="Elegir un hallazgo">
                {lista.length ? lista.map((h, i) => (
                  <div key={h.id}>
                    {orden === 'categoria' && cat === 'todos' && lista[i - 1]?.categoria !== h.categoria && <h3 className="finding-group">{categoria(h.categoria).nombre}</h3>}
                    <button type="button" className="finding" aria-pressed={actual?.id === h.id} onClick={() => setElegido(h.id)}>
                      <span className="finding-content">
                        <span className="finding-meta"><Pill prioridad={h.prioridad} /><span>{categoria(h.categoria).nombre}</span></span>
                        <strong>{h.titulo}</strong>
                        <span className="finding-source">{h.fuentes[0]?.documento} · {h.fuentes[0]?.pagina}</span>
                      </span>
                      <Icono nombre="chevron" tamano={19} />
                    </button>
                  </div>
                )) : (
                  <div className="empty">
                    <h3>{todos.length ? 'Sin hallazgos en esta vista' : 'Sin observaciones'}</h3>
                    <p>{todos.length ? 'Elige otra categoría o borra el filtro de estado.' : 'Los motores que corrieron no encontraron observaciones. Revisa en «Pruebas» qué corrió y qué no aplicó.'}</p>
                    {todos.length
                      ? <button type="button" className="btn secondary" onClick={() => { setCat('todos'); setFiltro('todos'); }}>Ver todos los hallazgos</button>
                      : <button type="button" className="btn secondary" onClick={() => setPestana('pruebas')}><Icono nombre="check" tamano={18} />Ver las pruebas</button>}
                  </div>
                )}
              </div>
            </section>
            {actual && <Evidencia h={actual} incluido={incluidos.has(actual.id)} alAlternar={() => alternar(actual.id)} alVerTerritorio={e.territorio ? () => setPestana('territorio') : undefined} />}
          </div>
        </>
      )}

      {pestana === 'documentos' && (
        <section className="content-panel documents-panel">
          <h2>Documentos de esta revisión</h2>
          <p>Tipo confirmado y resultado de la lectura de cada archivo.</p>
          <ul className="docs-table">
            {e.documentos.map((d) => (
              <li key={d.id}>
                <Icono nombre="file" tamano={22} />
                <span><strong>{d.nombre}</strong><small>{d.tipo}{d.tipo !== d.sugerencia.tipo ? ` · Axis sugirió ${d.sugerencia.tipo}` : ''}</small></span>
                <span>{d.paginas} pág. · {tamano(d.bytes)}</span>
                <span className="doc-status">{LECTURA[d.lectura]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {pestana === 'territorio' && (e.territorio
        ? <Territorio clave={e.territorio} lugar={e.lugar ?? ''} haySobreTerritorio={todos.some((h) => h.categoria === 'territorio')} alVerHallazgos={() => { setPestana('hallazgos'); setCat('territorio'); }} />
        : (
          <section className="content-panel territory-empty">
            <h2>Ubicación {e.lugar ? 'sin recorte de terreno' : 'por confirmar'}</h2>
            <p>{e.lugar
              ? `Axis ubicó la obra en ${e.lugar}, pero todavía no tiene el terreno de la vía. Los motores de relieve y drenaje están en desarrollo.`
              : 'Los documentos no declaran distrito ni departamento. La memoria descriptiva o el plano de ubicación permiten ubicar el tramo.'}</p>
            <button type="button" className="btn secondary" onClick={() => setPestana('documentos')}><Icono nombre="files" tamano={18} />Ir a documentos</button>
          </section>
        ))}

      {pestana === 'pruebas' && <PanelPruebas e={e} />}
    </>
  );
}

const ESTADO_PRUEBA = {
  observa: { texto: 'Observó', clase: 'alta' },
  confirmar: { texto: 'Por confirmar', clase: 'confirmar' },
  pasa: { texto: 'Pasó', clase: 'confirmed' },
  'no-aplica': { texto: 'No aplica', clase: 'neutral' },
} as const;

function PanelPruebas({ e }: { e: Expediente }) {
  const lista = e.resultadoPruebas ?? [];
  const cuenta = (estado: keyof typeof ESTADO_PRUEBA) => lista.filter((r) => r.estado === estado).length;
  const orden = { observa: 0, confirmar: 1, pasa: 2, 'no-aplica': 3 };
  return (
    <section className="content-panel panel-pruebas">
      <h2>{e.pruebas ? `Corrieron ${e.pruebas.aplicadas} de las ${e.pruebas.total} pruebas que Axis aprendió` : 'Pruebas'}</h2>
      <p>Cada prueba nació de un error real o de una obra terminada o paralizada. El modelo elige las que aplican según los documentos y la ubicación de la obra.</p>
      <ul className="chips">
        {(Object.keys(ESTADO_PRUEBA) as (keyof typeof ESTADO_PRUEBA)[]).map((k) => <li key={k} className={`chip-${ESTADO_PRUEBA[k].clase}`}>{ESTADO_PRUEBA[k].texto}: {cuenta(k)}</li>)}
      </ul>
      <ul className="lista-pruebas">
        {[...lista].sort((a, b) => Number(b.origen === 'obra') - Number(a.origen === 'obra') || orden[a.estado] - orden[b.estado]).map((r) => (
          <li key={r.id} className={r.origen === 'obra' ? 'de-obra' : ''}>
            <span className="mono">{r.id}</span>
            <span className="nombre-prueba">{r.nombre}{r.origen === 'obra' && <small>Aprendida de una obra</small>}{r.motivo && <small>{r.motivo}</small>}</span>
            <span className={`pill ${ESTADO_PRUEBA[r.estado].clase}`}>{ESTADO_PRUEBA[r.estado].texto}</span>
          </li>
        ))}
      </ul>
      <details className="engine-details">
        <summary>Detalle técnico: motores que corrieron</summary>
        {e.cobertura.length > 0 && <ul className="chips">{e.cobertura.map((c) => <li key={c}>{c}</li>)}</ul>}
        <ul className="docs-table">
          {e.ejecucion.map((x) => (
            <li key={x.motor}>
              <Icono nombre={x.estado === 'ok' ? 'check' : x.estado === 'sin-datos' ? 'clock' : 'alert'} tamano={20} />
              <span><strong>{nombreMotor(x.motor)}</strong><small>{x.nota ?? ''}</small></span>
              <span className="mono">{x.ms} ms</span>
              <span className="doc-status">{x.estado === 'ok' ? 'Corrió' : x.estado === 'sin-datos' ? 'Sin datos' : 'Error'}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function Evidencia({ h, incluido, alAlternar, alVerTerritorio }: { h: Hallazgo; incluido: boolean; alAlternar: () => void; alVerTerritorio?: () => void }) {
  const c = categoria(h.categoria);
  return (
    <aside className="evidence" aria-label="Evidencia del hallazgo">
      <div className="evidence-top"><span><Icono nombre={c.icono} tamano={17} /> {c.nombre}</span><span className="mono">{h.id}</span></div>
      <div className="evidence-body">
        <Pill prioridad={h.prioridad} />
        <h3 tabIndex={-1}>{h.titulo}</h3>
        <div className="next-action"><h4>Acción sugerida</h4><p>{h.accion}</p></div>
        <p>{h.detalle}</p>
        <div className="evidence-source">
          <h4>Documentos y referencias</h4>
          {h.fuentes.map((f, i) => (
            <figure key={i}><figcaption><Icono nombre="file" tamano={15} /> <strong>{f.documento}</strong><span>{f.pagina}</span></figcaption><blockquote>{f.extracto}</blockquote></figure>
          ))}
        </div>
        {h.monto ? <p className="monto">Monto involucrado: S/ {h.monto.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p> : null}
        {h.origen?.length ? (
          <div className="origen-prueba">
            <h4>Por qué Axis corre esta prueba{h.prueba ? ` (${h.prueba})` : ''}</h4>
            <ul>{h.origen.slice(0, 2).map((o, i) => <li key={i}><b>{o.titulo}</b><span>{o.detalle}</span></li>)}</ul>
          </div>
        ) : null}
        <details className="engine-details"><summary>Motores que intervienen</summary><p>{h.motores.map(nombreMotor).join(' → ')}</p></details>
        {h.categoria === 'territorio' && alVerTerritorio && (
          <div className="evidence-origin terrain-origin"><span><Icono nombre="pin" tamano={16} /> Ubicación del tramo disponible</span><button type="button" className="btn secondary" onClick={alVerTerritorio}>Abrir mapa y perfil</button></div>
        )}
        <div className="evidence-actions">
          {incluido && <span className="included-label"><Icono nombre="check" tamano={17} /> Incluida en la carta</span>}
          <button type="button" className="btn secondary" onClick={alAlternar}><Icono nombre={incluido ? 'close' : 'plus'} tamano={17} />{incluido ? 'Quitar de la carta' : 'Añadir a la carta'}</button>
        </div>
      </div>
    </aside>
  );
}
