'use client';
import { useEffect, useState } from 'react';
import { VERIFICADORES, type Verificador } from '@/data/verificadores';
import { CabeceraPagina, EstadoVacio } from '@/components/ui';
import { IconoChevron, IconoLupa } from '@/components/iconos';
import { PruebasAprendidas } from './aprendidas';

const GRUPOS: { id: string; titulo: string; filtro: (v: Verificador) => boolean }[] = [
  { id: 'documentos', titulo: 'Documentos', filtro: (v) => ['consistencia', 'presencia', 'plausibilidad'].includes(v.tipo) },
  { id: 'territorio', titulo: 'Territorio', filtro: (v) => v.tipo === 'contexto' },
  { id: 'proveedores', titulo: 'Proveedores', filtro: (v) => v.tipo === 'proveedor' },
];
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function Pruebas() {
  const [q, setQ] = useState('');
  const [grupo, setGrupo] = useState('');
  useEffect(() => {
    const abrir = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const nodo = document.getElementById(id);
      if (nodo instanceof HTMLDetailsElement) { nodo.open = true; nodo.scrollIntoView({ block: 'start' }); }
    };
    abrir(); window.addEventListener('hashchange', abrir);
    return () => window.removeEventListener('hashchange', abrir);
  }, [q, grupo]);
  const lista = VERIFICADORES.filter((v) => (!grupo || GRUPOS.find((g) => g.id === grupo)?.filtro(v)) && normalizar([v.id, v.nombre, v.queRevisa, v.causa, ...v.origen.map((o) => o.obra)].join(' ')).includes(normalizar(q)));
  return <div>
    <CabeceraPagina titulo="Cada prueba tiene una historia" descripcion="Detrás de cada verificación hay un error documentado. Explora qué revisa Axis, qué recomienda y el caso real que le enseñó a hacerlo." />
    <div className="library-toolbar"><label className="library-search"><IconoLupa className="h-4 w-4" /><span className="sr-only">Buscar una prueba</span><input className="campo" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por tema, obra o código de prueba" /></label><div className="filter-chips" role="group" aria-label="Filtrar pruebas por tema"><button aria-pressed={!grupo} onClick={() => setGrupo('')}>Todas <span>{VERIFICADORES.length}</span></button>{GRUPOS.map((g) => <button key={g.id} aria-pressed={grupo === g.id} onClick={() => setGrupo(g.id)}>{g.titulo}</button>)}</div></div>
    <p className="mb-4 text-xs text-gris" aria-live="polite">{lista.length} pruebas encontradas · Abre una para consultar su evidencia de origen.</p>
    {!lista.length ? <EstadoVacio titulo="No encontramos esa prueba" texto="Prueba con otro término, como metrados, drenaje o presupuesto."><button className="boton-borde" onClick={() => { setQ(''); setGrupo(''); }}>Mostrar todas</button></EstadoVacio> : <div className="rule-list">{lista.map((v) => <details key={v.id} id={v.id} className="rule-item group"><summary><span className="rule-code">{v.id}</span><span className="min-w-0 flex-1"><strong>{v.nombre}</strong><span className="rule-description">{v.queRevisa}</span></span><IconoChevron className="h-4 w-4 text-gris transition-transform group-open:rotate-90" /></summary><div className="rule-content"><div><h2>Qué pedir al proyectista</h2><p>{v.recomendacion}</p><p className="rule-reference">Causa: {v.causa}{v.norma ? ` · Referencia: ${v.norma}` : ''}</p></div><div><h2>{v.origen.length > 1 ? 'Casos que originaron esta prueba' : 'El caso que originó esta prueba'}</h2><ul>{v.origen.map((o, i) => <li key={i}><h3>{o.obra}</h3><p>{o.hallazgo}</p><p className="rule-reference">{o.proceso} · {o.documento}</p></li>)}</ul></div></div></details>)}</div>}
    <PruebasAprendidas />
  </div>;
}
