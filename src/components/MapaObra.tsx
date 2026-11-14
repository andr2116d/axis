'use client';
// Mapa de la obra: trazo real (OSM) y área que drena hacia la calle (modelo de elevación).
import { useEffect, useId, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '@/lib/tipos';

export interface PropsMapa { trazo: LatLng[]; ubicacion?: LatLng; cuenca?: { celdas: [number, number][]; paso: number } | null; alto?: number }

export default function MapaObra({ trazo, ubicacion, cuenca, alto = 300 }: PropsMapa) {
  const ayuda = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    // La vista se fija ANTES de añadir capas: Leaflet falla al recortar geometrías en un mapa sin vista.
    const via = trazo.map((p) => [p.lat, p.lng] as [number, number]);
    const centro: [number, number] | null = ubicacion ? [ubicacion.lat, ubicacion.lng] : via[0] ?? null;
    if (!centro) return;
    // SVG se desmonta sin dejar un repintado Canvas pendiente en React Strict Mode.
    const mapa = L.map(ref.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false }).setView(centro, 16);
    L.control.zoom({ zoomInTitle: 'Acercar mapa', zoomOutTitle: 'Alejar mapa' }).addTo(mapa);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© colaboradores de OpenStreetMap' }).addTo(mapa);
    const capas: L.Layer[] = [];
    if (cuenca?.celdas.length) {
      const h = cuenca.paso / 2;
      const g = L.featureGroup(cuenca.celdas.map(([la, lo]) => L.rectangle([[la - h, lo - h], [la + h, lo + h]], { stroke: false, fillColor: '#1D4ED8', fillOpacity: 0.18, interactive: false })));
      g.addTo(mapa); capas.push(g);
    }
    if (via.length > 1) {
      const base = L.polyline(via, { color: '#0F172A', weight: 9, opacity: 0.9 }).addTo(mapa);
      L.polyline(via, { color: '#F2B705', weight: 2.5, dashArray: '8 7' }).addTo(mapa);
      capas.push(base);
    }
    if (ubicacion) L.circleMarker([ubicacion.lat, ubicacion.lng], { radius: 5, color: '#22262A', weight: 2, fillColor: '#F6F7F4', fillOpacity: 1 }).addTo(mapa);
    const grupo = L.featureGroup(capas);
    if (capas.length && grupo.getBounds().isValid()) mapa.fitBounds(grupo.getBounds(), { padding: [18, 18], maxZoom: 17 });
    return () => { mapa.remove(); };
  }, [trazo, ubicacion, cuenca]);
  return <><p id={ayuda} className="sr-only">Mapa interactivo del tramo. Usa las flechas para desplazarlo y los botones para acercar o alejar. Los datos del terreno también se describen en el texto de esta sección.</p><div ref={ref} role="region" aria-label="Mapa del tramo y su cuenca" aria-describedby={ayuda} style={{ height: alto }} className="w-full rounded-xl border border-borde" /></>;
}
