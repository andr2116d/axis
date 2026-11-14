import { NextResponse } from 'next/server';
import { territorio } from '@/lib/analisis/datos-servidor';
import { distancia } from '@/lib/geo';

// Capas reales alrededor de un punto (para el mapa): inversiones del MEF con ubicación precisa, peligros, puntos críticos y cauces.
export async function GET(req: Request) {
  const u = new URL(req.url);
  const lat = Number(u.searchParams.get('lat')), lng = Number(u.searchParams.get('lng'));
  const r = Math.min(5000, Math.max(100, Number(u.searchParams.get('r') ?? 1500)));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ error: 'Indique lat y lng' }, { status: 400 });
  const c = { lat, lng };
  const t = territorio();
  const cerca = (p: { lat: number; lng: number }) => distancia(c, p) <= r;
  const puntos = (capa?: { fuente: string; features: { geometry: { type: string; coordinates: any }; properties: Record<string, unknown> }[] }) =>
    capa ? { fuente: capa.fuente, features: capa.features.filter((f) => f.geometry.type === 'Point' && cerca({ lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] })) } : null;
  const lineas = (capa?: { fuente: string; features: { geometry: { type: string; coordinates: any }; properties: Record<string, unknown> }[] }) =>
    capa ? { fuente: capa.fuente, features: capa.features.filter((f) => (f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : []).some((l: number[][]) => l.some((q) => cerca({ lat: q[1], lng: q[0] })))) } : null;
  return NextResponse.json({
    centro: c, radio: r,
    inversiones: t.inversiones.filter((x) => !x.ubicacionGenerica && x.lat != null && cerca({ lat: x.lat, lng: x.lng! })).slice(0, 400),
    peligros: puntos(t.peligros), zonasCriticas: puntos(t.zonasCriticas), puntosCriticosAna: puntos(t.puntosCriticosAna), rios: lineas(t.rios),
  });
}
