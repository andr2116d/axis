// Descarga capas REALES de OpenStreetMap para el distrito de Trujillo y las guarda como GeoJSON.
// Uso: node scripts/descargar-osm.mjs
// Datos © colaboradores de OpenStreetMap, licencia ODbL (https://www.openstreetmap.org/copyright).
import fs from 'node:fs';

const BBOX = '-8.145,-79.075,-8.065,-78.995';
const QUERY = `[out:json][timeout:90];
(
  node["amenity"="school"](${BBOX});
  way["amenity"="school"](${BBOX});
  way["waterway"](${BBOX});
  way["power"~"^(line|minor_line)$"](${BBOX});
);
out geom tags;`;

const res = await fetch('https://overpass-api.de/api/interpreter', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'axis-hackathon-prototype' },
  body: 'data=' + encodeURIComponent(QUERY),
});
if (!res.ok) throw new Error('Overpass respondió ' + res.status);
const { elements } = await res.json();

const colegios = [];
const agua = [];
const electricas = [];
const r5 = (n) => Math.round(n * 1e5) / 1e5;

for (const e of elements) {
  const t = e.tags || {};
  if (t.amenity === 'school') {
    let lat, lng;
    if (e.type === 'node') { lat = e.lat; lng = e.lon; }
    else if (e.geometry?.length) {
      lat = e.geometry.reduce((s, p) => s + p.lat, 0) / e.geometry.length;
      lng = e.geometry.reduce((s, p) => s + p.lon, 0) / e.geometry.length;
    } else continue;
    colegios.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [r5(lng), r5(lat)] },
      properties: { nombre: t.name || 'Institución educativa (sin nombre en OSM)', osm: `${e.type}/${e.id}` } });
  } else if (t.waterway && e.geometry) {
    agua.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: e.geometry.map((p) => [r5(p.lon), r5(p.lat)]) },
      properties: { tipo: t.waterway, nombre: t.name || null, osm: `way/${e.id}` } });
  } else if (t.power && e.geometry) {
    electricas.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: e.geometry.map((p) => [r5(p.lon), r5(p.lat)]) },
      properties: { tipo: t.power, tension: t.voltage || null, operador: t.operator || null, osm: `way/${e.id}` } });
  }
}

const salida = {
  fuente: 'OpenStreetMap (Overpass API)',
  licencia: 'ODbL — © colaboradores de OpenStreetMap',
  descargado: new Date().toISOString().slice(0, 10),
  bbox: BBOX,
  colegios: { type: 'FeatureCollection', features: colegios },
  cursosDeAgua: { type: 'FeatureCollection', features: agua },
  lineasElectricas: { type: 'FeatureCollection', features: electricas },
};
fs.writeFileSync(new URL('../src/data/osm-trujillo.json', import.meta.url), JSON.stringify(salida));
console.log(`Colegios: ${colegios.length} · Cursos de agua: ${agua.length} · Líneas eléctricas: ${electricas.length}`);
