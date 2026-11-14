'use client';
import { useState } from 'react';
import type { Perfil } from '@/lib/analisis/terreno';
import { zonasCalzada, type SeccionVial } from '@/lib/analisis/seccion';

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;

export function PerfilLongitudinal({ perfil, compacto = false }: { perfil: Perfil; compacto?: boolean }) {
  const W = 520, H = compacto ? 120 : 180;
  const puntos = perfil.puntos.filter((p) => Number.isFinite(p.d) && Number.isFinite(p.z));
  if (!puntos.length || perfil.longitud <= 0) return <p>No hay puntos suficientes para dibujar el perfil.</p>;
  const min = Math.floor(perfil.zMin - 1), max = Math.ceil(perfil.zMax + 1);
  const x = (d: number) => d / perfil.longitud * W;
  const y = (z: number) => 8 + (1 - (z - min) / Math.max(1, max - min)) * (H - 16);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(2)},${y(p.z).toFixed(2)}`).join(' ');
  const primero = puntos[0], ultimo = puntos[puntos.length - 1];
  return <figure className="terrain-chart">
    <figcaption className="terrain-chart-title">Perfil del terreno</figcaption>
    <p className="terrain-chart-reading"><strong>{pc(perfil.pendienteMedia)}</strong> de pendiente media · {Math.abs(perfil.desnivel).toFixed(1)} m de desnivel</p>
    <div className="profile-plot"><div className="profile-y" aria-hidden="true"><span>{max} m</span><span>{min} m</span></div><svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Elevación del terreno a lo largo de ${perfil.longitud.toFixed(0)} metros. Inicio: ${primero.z.toFixed(1)} metros sobre el nivel del mar. Final: ${ultimo.z.toFixed(1)} metros. Pendiente media: ${pc(perfil.pendienteMedia)}.`}>
      {[min, (min + max) / 2, max].map((z) => <line key={z} x1="0" x2={W} y1={y(z)} y2={y(z)} stroke="var(--control-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />)}
      <path d={`${linea} L${x(ultimo.d)},${H} L${x(primero.d)},${H} Z`} fill="var(--accent-soft)" />
      <path d={linea} fill="none" stroke="var(--chart)" strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg></div><div className="profile-x" aria-hidden="true"><span>Inicio · 0 m</span><span>{Math.round(perfil.longitud / 2)} m</span><span>{Math.round(perfil.longitud)} m</span></div>
    {!compacto && <p className="chart-caption">Elevación en metros sobre el nivel del mar. Copernicus, resolución de 30 m. Ejes a distinta escala para mostrar el desnivel.</p>}
  </figure>;
}

const nombreCapa = (n: string) => /SUB\s*BASE/i.test(n) ? 'Subbase' : /BASE/i.test(n) ? 'Base granular' : /CARPETA|ASFALT/i.test(n) ? 'Carpeta asfáltica' : /VEREDA/i.test(n) ? 'Concreto de vereda' : /CONCRETO|LOSA/i.test(n) ? 'Losa de concreto' : n.toLowerCase();

export function CapasPavimento({ s }: { s: SeccionVial }) {
  const zonas = zonasCalzada(s.capas);
  const [zona, setZona] = useState(0);
  const seleccion = zonas[Math.min(zona, Math.max(0, zonas.length - 1))];
  const capas = [...(seleccion?.capas ?? []), ...s.capas.filter((c) => c.zona === 'vereda')];
  const max = Math.max(.01, ...capas.map((c) => c.espesor));
  return <figure className="terrain-chart layers-chart"><figcaption className="terrain-chart-title">Espesores del pavimento</figcaption>
    {zonas.length > 1 && <label className="layer-zone rotulo">Zona de calzada<select className="campo" value={zona} onChange={(e) => setZona(Number(e.target.value))}>{zonas.map((z, i) => <option key={i} value={i}>Zona {i + 1}{z.area ? ` · ${z.area.toLocaleString('es-PE')} m²` : ' · área no indicada'}</option>)}</select></label>}
    <ul>{capas.map((c, i) => <li key={`${c.partida}-${c.zona}-${i}`}><div><span>{nombreCapa(c.nombre)}<small>{c.zona === 'vereda' ? 'Vereda' : 'Calzada'} · partida {c.partida}</small></span><strong>{+(c.espesor * 100).toFixed(1)} <span>cm</span></strong></div><div className="layer-track" aria-hidden="true"><span style={{ width: `${c.espesor / max * 100}%` }} /></div></li>)}</ul>
    <p className="chart-caption">Longitud de las barras proporcional al espesor indicado en el expediente.{zonas.length > 1 ? ' La calzada se muestra por zona, sin sumar intervenciones distintas.' : ''}</p>
  </figure>;
}
