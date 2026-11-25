'use client';

import { useCallback, useRef, useState } from 'react';
import { territorio, type MapaTramo } from '@/dominio/territorio';
import { Icono } from '../Icono';
import { useAviso } from '../Aviso';
import { Lienzo } from './Lienzo';
import { dibujarPerfil, dibujarPlano, dibujarRelieve, VISTA_INICIAL, type Vista } from './dibujo';

export function CreditosMapa({ mapa }: { mapa: MapaTramo }) {
  const [lat, lon] = mapa.center;
  return (
    <div className="map-credits">
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© colaboradores de OpenStreetMap</a>
      <span>{territorio.roadDate} · DEM Copernicus GLO-30</span>
      <a href={`https://www.openstreetmap.org/#map=17/${lat}/${lon}`} target="_blank" rel="noopener">Abrir mapa de la zona <Icono nombre="chevron" tamano={13} /></a>
    </div>
  );
}

/** Plano de calles de un recorte, con el tramo resaltado. */
export function MapaPortada({ clave, lugar }: { clave: string; lugar: string }) {
  const mapa = territorio.maps[clave];
  const dibujar = useCallback((c: HTMLCanvasElement) => dibujarPlano(c, mapa, { zoom: 1.03 }), [mapa]);
  return (
    <>
      <figure className="map-frame map-cover" aria-label={`Mapa de calles de ${mapa.name}`}>
        <Lienzo dibujar={dibujar} />
        <span className="map-legend"><i /> Tramo</span>
        <span className="map-north" aria-hidden="true">N <b>↑</b></span>
        <figcaption><Icono nombre="pin" tamano={17} /><span><b>{mapa.name}</b><small>{lugar}</small></span></figcaption>
      </figure>
      <CreditosMapa mapa={mapa} />
    </>
  );
}

/** Pestaña «Territorio» de una revisión: plano o relieve 3D, perfil y datos del tramo. */
export function Territorio({ clave, lugar, haySobreTerritorio, alVerHallazgos }: {
  clave: string; lugar: string; haySobreTerritorio: boolean; alVerHallazgos: () => void;
}) {
  const mapa = territorio.maps[clave];
  const avisar = useAviso();
  const [modo, setModo] = useState<'2d' | '3d'>('2d');
  const [vista, setVista] = useState<Vista>(VISTA_INICIAL);
  const arrastre = useRef<{ id: number; x: number; y: number } | null>(null);
  const relieve = modo === '3d';

  const dibujarMapa = useCallback((c: HTMLCanvasElement) => (relieve ? dibujarRelieve(c, mapa, vista) : dibujarPlano(c, mapa, vista)), [relieve, mapa, vista]);
  const dibujarCurva = useCallback((c: HTMLCanvasElement) => dibujarPerfil(c, mapa), [mapa]);
  const cotas = mapa.route.map((r) => r[3]);

  const zoom = (delta: number) => {
    const z = Math.min(2, Math.max(0.8, vista.zoom + delta));
    setVista({ ...vista, zoom: z });
    avisar(`Zoom del mapa al ${Math.round(z * 100)} %.`);
  };

  return (
    <section className="territory terrain-workspace">
      <div className="terrain-left inspector-map">
        <header className="atlas-header">
          <div><h2>Ubicación y terreno</h2><p>{mapa.name} · {lugar}</p></div>
          <div className="view-switch" role="group" aria-label="Vista del terreno">
            <button type="button" aria-pressed={!relieve} onClick={() => { setModo('2d'); setVista(VISTA_INICIAL); }}><Icono nombre="map" tamano={17} /> Mapa</button>
            <button type="button" aria-pressed={relieve} onClick={() => { setModo('3d'); setVista(VISTA_INICIAL); }}><Icono nombre="cube" tamano={17} /> Relieve 3D</button>
          </div>
        </header>
        <div className="map-stage">
          {relieve ? (
            <figure className="map-frame terrain-surface" aria-label={`Modelo tridimensional del relieve de ${mapa.name}, basado en Copernicus GLO-30`}>
              <Lienzo dibujar={dibujarMapa} />
              <span className="map-legend"><i /> Tramo</span>
              <figcaption><b>Modelo de superficie</b><small>Copernicus GLO-30 · relieve ampliado ×2</small></figcaption>
            </figure>
          ) : (
            <figure className="map-frame" aria-label={`Mapa de calles de ${mapa.name}`}>
              <Lienzo
                dibujar={dibujarMapa}
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.pointerType === 'touch') return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  arrastre.current = { id: e.pointerId, x: e.clientX - vista.x, y: e.clientY - vista.y };
                }}
                onPointerMove={(e) => {
                  const a = arrastre.current;
                  if (!a || a.id !== e.pointerId) return;
                  setVista((v) => ({ ...v, x: Math.max(-320, Math.min(320, e.clientX - a.x)), y: Math.max(-260, Math.min(260, e.clientY - a.y)) }));
                }}
                onLostPointerCapture={() => { arrastre.current = null; }}
              />
              <span className="map-legend"><i /> Tramo</span>
              <span className="map-north" aria-hidden="true">N <b>↑</b></span>
            </figure>
          )}
          <div className="map-tools" role="group" aria-label="Controles del mapa">
            <button type="button" className="map-icon" aria-label="Acercar" onClick={() => zoom(0.2)}><Icono nombre="plus" tamano={19} /></button>
            <button type="button" className="map-icon" aria-label="Alejar" onClick={() => zoom(-0.2)}><Icono nombre="minus" tamano={19} /></button>
            <button type="button" className="map-icon" aria-label="Centrar vista" onClick={() => { setVista({ ...VISTA_INICIAL, contours: vista.contours, roads: vista.roads }); avisar('Vista centrada.'); }}><Icono nombre="target" tamano={19} /></button>
            {relieve && <button type="button" className="map-icon" aria-label="Girar modelo" onClick={() => setVista({ ...vista, rotation: (vista.rotation + 35) % 360 })}><Icono nombre="rotate" tamano={19} /></button>}
          </div>
        </div>
        <div className="atlas-footer">
          {relieve
            ? <button type="button" className="layer-toggle" aria-pressed={vista.roads} onClick={() => setVista({ ...vista, roads: !vista.roads })}><Icono nombre="layers" tamano={16} /> Calles sobre el relieve</button>
            : <button type="button" className="layer-toggle" aria-pressed={vista.contours} onClick={() => setVista({ ...vista, contours: !vista.contours })}><Icono nombre="layers" tamano={16} /> Curvas de nivel</button>}
          <CreditosMapa mapa={mapa} />
        </div>
        <details className="data-note">
          <summary>Alcance de los datos y atribución</summary>
          <p>La línea naranja es el tramo de la vía sobre calles de OpenStreetMap. El modelo reproduce la superficie a unos 30 m de resolución y sirve para entender el entorno, no para diseñar cunetas ni bombeo.</p>
          <p>{territorio.demCredit}.</p>
        </details>
      </div>
      <aside className="terrain-context">
        <div className="content-panel profile-panel">
          <h2>Perfil del tramo</h2><p>Cotas aproximadas sobre el trazado.</p>
          <Lienzo className="profile-chart" dibujar={dibujarCurva} />
          <dl className="terrain-stats">
            <div><dt>Longitud</dt><dd>{mapa.length} m</dd></div>
            <div><dt>Pendiente entre extremos</dt><dd>{mapa.grade.toLocaleString('es-PE')} %</dd></div>
            <div><dt>Rango de cotas</dt><dd>{Math.round(Math.min(...cotas))}–{Math.round(Math.max(...cotas))} m</dd></div>
          </dl>
        </div>
        {haySobreTerritorio && (
          <div className="terrain-question">
            <span className="summary-icon"><Icono nombre="list" tamano={19} /></span>
            <div><h3>Hallazgos de territorio</h3><p>Hay observaciones de esta revisión vinculadas al tramo.</p></div>
            <button type="button" className="btn secondary" onClick={alVerHallazgos}><Icono nombre="arrow" tamano={18} />Ver hallazgos</button>
          </div>
        )}
      </aside>
    </section>
  );
}
