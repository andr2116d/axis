import type { LatLng } from './base';

const R = 6371000;
const rad = (g: number) => (g * Math.PI) / 180;

/** Distancia en metros entre dos puntos. */
export function distancia(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Proyección local en metros (válida para distancias cortas, como un distrito). */
function local(p: LatLng, ref: LatLng) {
  return { x: rad(p.lng - ref.lng) * R * Math.cos(rad(ref.lat)), y: rad(p.lat - ref.lat) * R };
}

/** Distancia en metros de un punto a una polilínea. */
export function distanciaALinea(p: LatLng, linea: LatLng[]): number {
  let min = Infinity;
  for (let i = 0; i < linea.length - 1; i++) {
    const a = local(linea[i], p);
    const b = local(linea[i + 1], p);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    const cx = a.x + t * dx;
    const cy = a.y + t * dy;
    min = Math.min(min, Math.hypot(cx, cy));
  }
  return min;
}

/** ¿El punto está dentro del polígono? (ray casting) */
export function dentroDe(p: LatLng, poligono: LatLng[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) {
      dentro = !dentro;
    }
  }
  return dentro;
}

export function centroide(poligono: LatLng[]): LatLng {
  const n = poligono.length;
  return {
    lat: poligono.reduce((s, p) => s + p.lat, 0) / n,
    lng: poligono.reduce((s, p) => s + p.lng, 0) / n,
  };
}

/** GeoJSON usa [lng, lat]. */
export const aLatLng = (c: number[]): LatLng => ({ lat: c[1], lng: c[0] });

/**
 * Convierte coordenadas UTM (WGS84) a latitud/longitud.
 * Trujillo está en la zona 17 Sur. Los expedientes peruanos suelen usar UTM.
 */
export function utmALatLng(este: number, norte: number, zona = 17, sur = true): LatLng {
  const a = 6378137;
  const f = 1 / 298.257223563;
  const k0 = 0.9996;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const x = este - 500000;
  const y = sur ? norte - 10000000 : norte;
  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = ep2 * Math.cos(phi1) ** 2;
  const r1 = (a * (1 - e2)) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5;
  const d = x / (n1 * k0);
  const lat =
    phi1 -
    ((n1 * Math.tan(phi1)) / r1) *
      ((d * d) / 2 - ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6) / 720);
  const lng0 = rad((zona - 1) * 6 - 180 + 3);
  const lng =
    lng0 +
    (d - ((1 + 2 * t1 + c1) * d ** 3) / 6 + ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) / 120) /
      Math.cos(phi1);
  return { lat: (lat * 180) / Math.PI, lng: (lng * 180) / Math.PI };
}
