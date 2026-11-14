// Gemelo de terreno de la vía: geometría real (OpenStreetMap) + modelo de elevación (Copernicus GLO-30, 30 m).
// Calcula el perfil longitudinal, la pendiente y el área que drena hacia la calle (flujo D8 sobre el terreno con
// depresiones rellenadas, Barnes et al. 2014). Todo es determinístico y se puede repetir con los mismos datos.
//
// Límites honestos: Copernicus es un modelo de SUPERFICIE (incluye techos y árboles) con celdas de ~30 m; sirve para
// pendientes de decenas de metros y cuencas de hectáreas, no para niveles de detalle (bombeo, cunetas). Por eso las
// conclusiones se expresan en esas escalas y con el texto "según el modelo de elevación".

import { distancia, distanciaALinea } from '../geo';
import type { LatLng } from '../tipos';
import { normalizar } from './numeros';
import type { Deteccion } from './tipos-analisis';

export interface Dem { latN: number; lonO: number; paso: number; filas: number; cols: number; sinDato: number; datos: Int16Array; fuente?: string }
export interface ViaOsm { id: number; n?: string; h?: string; s?: string; a?: string; g: [number, number][] }
export interface RedVial { fuente: string; licencia: string; fecha: string; vias: ViaOsm[] }

const M_POR_GRADO = 111320;

/** Elevación (m) por interpolación bilineal entre centros de celda; null fuera del modelo. */
export function elevacion(dem: Dem, p: LatLng): number | null {
  const y = (dem.latN - p.lat) / dem.paso - 0.5, x = (p.lng - dem.lonO) / dem.paso - 0.5;
  const i = Math.floor(y), j = Math.floor(x);
  if (i < 0 || j < 0 || i + 1 >= dem.filas || j + 1 >= dem.cols) return null;
  const v = (a: number, b: number) => dem.datos[a * dem.cols + b];
  const q = [v(i, j), v(i, j + 1), v(i + 1, j), v(i + 1, j + 1)];
  if (q.some((z) => z === dem.sinDato)) return null;
  const fy = y - i, fx = x - j;
  return ((q[0] * (1 - fx) + q[1] * fx) * (1 - fy) + (q[2] * (1 - fx) + q[3] * fx) * fy) / 10;
}

// ---------- Geometría de la vía ----------

const TIPOS_VIA = /^(?:CALLE|CA\.?|AV\.?|AVENIDA|JR\.?|JIRON|PJE\.?|PSJE\.?|PASAJE|PROLONGACION|PROL\.?|MALECON|CARRETERA)\s+/;
/** Nombre de la vía sin el tipo: "Calle Los Incas" → "LOS INCAS". */
export function nucleoVia(nombre: string): string {
  return normalizar(nombre).replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().replace(TIPOS_VIA, '').trim();
}
const nucleoValido = (n: string) => n.length >= 3 || /^[A-Z]$|^\d{1,3}$/.test(n);

const pt = (c: [number, number]): LatLng => ({ lat: c[1], lng: c[0] });
export function longitud(l: LatLng[]): number {
  let s = 0;
  for (let i = 1; i < l.length; i++) s += distancia(l[i - 1], l[i]);
  return s;
}

/** Une tramos OSM que comparten extremos (tolerancia 5 m) en polilíneas continuas. */
function unir(tramos: LatLng[][]): LatLng[][] {
  const rest = tramos.map((t) => [...t]);
  const out: LatLng[][] = [];
  while (rest.length) {
    let linea = rest.shift()!;
    let cambio = true;
    while (cambio) {
      cambio = false;
      for (let k = 0; k < rest.length; k++) {
        const t = rest[k], a = linea[0], b = linea[linea.length - 1];
        if (distancia(b, t[0]) < 5) linea = [...linea, ...t.slice(1)];
        else if (distancia(b, t[t.length - 1]) < 5) linea = [...linea, ...[...t].reverse().slice(1)];
        else if (distancia(a, t[t.length - 1]) < 5) linea = [...t, ...linea.slice(1)];
        else if (distancia(a, t[0]) < 5) linea = [...[...t].reverse(), ...linea.slice(1)];
        else continue;
        rest.splice(k, 1); cambio = true; break;
      }
    }
    out.push(linea);
  }
  return out;
}

/** Recorta una polilínea a `largo` metros centrados en la proyección de `centro`. */
function recortar(l: LatLng[], centro: LatLng, largo: number): LatLng[] {
  const acum = [0];
  for (let i = 1; i < l.length; i++) acum.push(acum[i - 1] + distancia(l[i - 1], l[i]));
  const total = acum[acum.length - 1];
  if (total <= largo * 1.15) return l;
  // posición aproximada del centro sobre la línea
  let mejor = 0, dMin = Infinity;
  for (let s = 0; s <= total; s += 5) { const d = distancia(enPos(l, acum, s), centro); if (d < dMin) { dMin = d; mejor = s; } }
  const s0 = Math.max(0, Math.min(total - largo, mejor - largo / 2));
  const out: LatLng[] = [enPos(l, acum, s0)];
  for (let i = 0; i < l.length; i++) if (acum[i] > s0 && acum[i] < s0 + largo) out.push(l[i]);
  out.push(enPos(l, acum, s0 + largo));
  return out;
}
function enPos(l: LatLng[], acum: number[], s: number): LatLng {
  let i = 1;
  while (i < l.length - 1 && acum[i] < s) i++;
  const f = acum[i] === acum[i - 1] ? 0 : (s - acum[i - 1]) / (acum[i] - acum[i - 1]);
  return { lat: l[i - 1].lat + (l[i].lat - l[i - 1].lat) * f, lng: l[i - 1].lng + (l[i].lng - l[i - 1].lng) * f };
}

export interface TrazoVia { nombreOsm: string; idsOsm: number[]; trazo: LatLng[]; longitudVia: number; distancia: number; porNombre: boolean; superficie?: string }

/**
 * Busca la vía del expediente en la red vial OSM: por nombre (sin el tipo de vía) a ≤ 500 m de la ubicación;
 * si no hay nombre que coincida, la vía más cercana a ≤ 40 m. `largo` (de la memoria) recorta el tramo de obra.
 */
export function trazoDeVia(red: RedVial, ubicacion: LatLng, nombresVia: string[], largo?: number): TrazoVia | null {
  const nucleos = new Set(nombresVia.map(nucleoVia).filter(nucleoValido));
  const cerca = red.vias.filter((v) => v.g.length > 1 && distanciaALinea(ubicacion, v.g.map(pt)) <= 500);
  let elegidas = cerca.filter((v) => v.n && nucleos.has(nucleoVia(v.n)));
  const porNombre = elegidas.length > 0;
  if (!porNombre) {
    const masCercana = cerca.map((v) => ({ v, d: distanciaALinea(ubicacion, v.g.map(pt)) })).sort((a, b) => a.d - b.d)[0];
    if (!masCercana || masCercana.d > 40) return null;
    elegidas = [masCercana.v];
  }
  const lineas = unir(elegidas.map((v) => v.g.map(pt)));
  const linea = lineas.map((l) => ({ l, d: distanciaALinea(ubicacion, l) })).sort((a, b) => a.d - b.d)[0];
  const longitudVia = longitud(linea.l);
  return {
    nombreOsm: elegidas[0].n ?? '(sin nombre en OSM)', idsOsm: elegidas.map((v) => v.id), porNombre, longitudVia, distancia: linea.d,
    trazo: largo ? recortar(linea.l, ubicacion, largo) : linea.l, superficie: elegidas.find((v) => v.s)?.s,
  };
}

// ---------- Perfil y pendientes ----------

export interface Perfil { puntos: { d: number; z: number; p: LatLng }[]; longitud: number; desnivel: number; pendienteMedia: number; pendienteMax: number; zMin: number; zMax: number }

/** Perfil longitudinal cada `paso` m, suavizado con mediana móvil de 50 m (reduce el ruido de techos del modelo de superficie). */
export function perfil(dem: Dem, trazo: LatLng[], paso = 10): Perfil | null {
  const acum = [0];
  for (let i = 1; i < trazo.length; i++) acum.push(acum[i - 1] + distancia(trazo[i - 1], trazo[i]));
  const total = acum[acum.length - 1];
  if (total < 20) return null;
  const crudo: { d: number; z: number; p: LatLng }[] = [];
  for (let s = 0; s <= total + 0.01; s += paso) {
    const p = enPos(trazo, acum, Math.min(s, total));
    const z = elevacion(dem, p);
    if (z === null) return null;
    crudo.push({ d: Math.min(s, total), z, p });
  }
  const k = Math.max(1, Math.round(25 / paso));
  const puntos = crudo.map((x, i) => {
    const v = crudo.slice(Math.max(0, i - k), i + k + 1).map((y) => y.z).sort((a, b) => a - b);
    return { ...x, z: v[Math.floor(v.length / 2)] };
  });
  const zs = puntos.map((x) => x.z);
  const desnivel = Math.abs(zs[zs.length - 1] - zs[0]);
  let pendienteMax = 0;
  const ventana = Math.max(1, Math.round(50 / paso));
  for (let i = 0; i + ventana < puntos.length; i++) pendienteMax = Math.max(pendienteMax, Math.abs(puntos[i + ventana].z - puntos[i].z) / (puntos[i + ventana].d - puntos[i].d));
  return { puntos, longitud: total, desnivel, pendienteMedia: desnivel / total, pendienteMax, zMin: Math.min(...zs), zMax: Math.max(...zs) };
}

// ---------- Área que drena hacia la vía ----------

export interface Cuenca { areaHa: number; celdas: number; tocaBorde: boolean; desnivelAguasArriba: number; celdasCuenca: [number, number][] }

/** Cola de prioridad mínima (montículo binario). */
class Monticulo {
  private a: { z: number; k: number }[] = [];
  get size() { return this.a.length; }
  push(z: number, k: number) {
    const a = this.a; a.push({ z, k });
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].z <= a[i].z) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop()!;
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].z < a[m].z) m = l; if (r < a.length && a[r].z < a[m].z) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; }
    }
    return top;
  }
}

/**
 * Área aguas arriba cuyo escurrimiento llega a la vía. Ventana local de `margen` m alrededor del trazo; si la cuenca
 * toca el borde de la ventana, el área es un mínimo (`tocaBorde`).
 */
export function cuencaAportante(dem: Dem, trazo: LatLng[], margen = 1500, anchoVia = 20): Cuenca | null {
  const lats = trazo.map((p) => p.lat), lngs = trazo.map((p) => p.lng);
  const mLat = margen / M_POR_GRADO, mLng = margen / (M_POR_GRADO * Math.cos((lats[0] * Math.PI) / 180));
  const i0 = Math.max(0, Math.floor((dem.latN - (Math.max(...lats) + mLat)) / dem.paso)), i1 = Math.min(dem.filas - 1, Math.ceil((dem.latN - (Math.min(...lats) - mLat)) / dem.paso));
  const j0 = Math.max(0, Math.floor((Math.min(...lngs) - mLng - dem.lonO) / dem.paso)), j1 = Math.min(dem.cols - 1, Math.ceil((Math.max(...lngs) + mLng - dem.lonO) / dem.paso));
  const F = i1 - i0 + 1, C = j1 - j0 + 1;
  if (F < 5 || C < 5) return null;
  const z = new Float64Array(F * C);
  for (let i = 0; i < F; i++) for (let j = 0; j < C; j++) {
    const v = dem.datos[(i0 + i) * dem.cols + (j0 + j)];
    if (v === dem.sinDato) return null;
    z[i * C + j] = v / 10;
  }
  // Relleno de depresiones con prioridad (Barnes, Lehman y Mulla 2014) con un épsilon para que todo drene.
  const llenado = new Float64Array(z), cerrado = new Uint8Array(F * C), cola = new Monticulo();
  for (let i = 0; i < F; i++) for (let j = 0; j < C; j++) if (i === 0 || j === 0 || i === F - 1 || j === C - 1) { cola.push(z[i * C + j], i * C + j); cerrado[i * C + j] = 1; }
  const vec = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  while (cola.size) {
    const { k } = cola.pop(); const i = Math.floor(k / C), j = k % C;
    for (const [di, dj] of vec) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= F || b >= C) continue;
      const n = a * C + b; if (cerrado[n]) continue;
      cerrado[n] = 1; llenado[n] = Math.max(z[n], llenado[k] + 1e-4); cola.push(llenado[n], n);
    }
  }
  // Dirección D8 (máxima pendiente; las diagonales pesan √2). -1 = sale de la ventana.
  const lat0 = dem.latN - (i0 + F / 2) * dem.paso;
  const dy = dem.paso * M_POR_GRADO, dx = dy * Math.cos((lat0 * Math.PI) / 180);
  const destino = new Int32Array(F * C).fill(-1);
  for (let i = 1; i < F - 1; i++) for (let j = 1; j < C - 1; j++) {
    const k = i * C + j; let mejor = 0, d = -1;
    for (const [di, dj] of vec) {
      const n = (i + di) * C + (j + dj), dist = Math.hypot(di * dy, dj * dx);
      const s = (llenado[k] - llenado[n]) / dist;
      if (s > mejor) { mejor = s; d = n; }
    }
    destino[k] = d;
  }
  // Celdas de la vía: centro a ≤ anchoVia m del trazo
  const enVia = new Uint8Array(F * C);
  for (let i = 0; i < F; i++) for (let j = 0; j < C; j++) {
    const p = { lat: dem.latN - (i0 + i + 0.5) * dem.paso, lng: dem.lonO + (j0 + j + 0.5) * dem.paso };
    if (distanciaALinea(p, trazo) <= anchoVia) enVia[i * C + j] = 1;
  }
  // Recorrido inverso desde la vía
  const donantes: number[][] = Array.from({ length: F * C }, () => []);
  for (let k = 0; k < F * C; k++) if (destino[k] >= 0) donantes[destino[k]].push(k);
  const visto = new Uint8Array(F * C), pila: number[] = [];
  for (let k = 0; k < F * C; k++) if (enVia[k]) { visto[k] = 1; pila.push(k); }
  let tocaBorde = false; const celdas: [number, number][] = [];
  let zMaxArriba = -Infinity, zMinVia = Infinity;
  for (let k = 0; k < F * C; k++) if (enVia[k]) zMinVia = Math.min(zMinVia, z[k]);
  while (pila.length) {
    const k = pila.pop()!; const i = Math.floor(k / C), j = k % C;
    celdas.push([i0 + i, j0 + j]); zMaxArriba = Math.max(zMaxArriba, z[k]);
    if (i === 0 || j === 0 || i === F - 1 || j === C - 1) tocaBorde = true;
    for (const n of donantes[k]) if (!visto[n]) { visto[n] = 1; pila.push(n); }
  }
  return { areaHa: (celdas.length * dx * dy) / 10000, celdas: celdas.length, tocaBorde, desnivelAguasArriba: zMaxArriba - zMinVia, celdasCuenca: celdas };
}

/** Carga el modelo de elevación desde su metadato y el binario Int16 (decímetros). */
export function crearDem(meta: Omit<Dem, 'datos'>, bin: ArrayBuffer | Uint8Array): Dem {
  const u8 = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
  const copia = new Uint8Array(u8.byteLength); copia.set(u8);
  return { ...meta, datos: new Int16Array(copia.buffer) };
}

// ---------- Verificadores con el gemelo de terreno ----------


export interface ResultadoTerreno { via: TrazoVia; perfil: Perfil | null; cuenca: Cuenca | null }
export interface EntradaTerreno {
  ubicacion: LatLng; nombresVia: string[]; longitudDeclarada?: number;
  /** Largo del tramo cuando se estimó por el nombre (desde/hasta); solo recorta, no se compara como meta. */
  largoRecorte?: number;
  partidas: { codigo: string; descripcion: string; esTitulo?: boolean }[]; textoEstudios: string;
  /** Nombre del proyecto: las reparaciones o mantenimientos no rediseñan el drenaje. */
  nombreProyecto?: string;
}

const RE_DRENAJE = /CUNETA|SUMIDERO|DRENAJE|BADEN|REJILLA|ALCANTARILL|CANALETA|PLUVIAL|PASE DE AGUA|ZANJA DE CORONACION/;
/** Umbrales Axis (heurísticos, documentados en docs/logica-axis.md): desde aquí la vía conduce agua de lluvia en cantidad. */
export const UMBRAL_DRENAJE = { pendienteFuerte: 0.08, areaFuerteHa: 20, pendienteModerada: 0.04, areaModeradaHa: 5 };

export function verificarTerreno(dem: Dem, red: RedVial, e: EntradaTerreno): { detecciones: Deteccion[]; terreno?: ResultadoTerreno } {
  const det: Deteccion[] = [];
  if (elevacion(dem, e.ubicacion) === null) {
    det.push({ verificador: 'C-DRENAJE', resultado: 'no_verificable', severidad: 'baja', titulo: 'La obra está fuera del área del modelo de terreno',
      detalle: 'El gemelo de terreno cubre Trujillo metropolitano (Copernicus GLO-30). Para otras zonas se debe añadir su recorte del modelo de elevación.', evidencias: [] });
    return { detecciones: det };
  }
  const via = trazoDeVia(red, e.ubicacion, e.nombresVia, e.longitudDeclarada ?? e.largoRecorte);
  if (!via) {
    det.push({ verificador: 'C-DRENAJE', resultado: 'no_verificable', severidad: 'baja', titulo: 'No se encontró la vía en OpenStreetMap',
      detalle: 'Ninguna vía con ese nombre a menos de 500 m de las coordenadas, ni otra vía a menos de 40 m. Revise las coordenadas del expediente.', evidencias: [] });
    return { detecciones: det };
  }
  const pf = perfil(dem, via.trazo), cu = cuencaAportante(dem, via.trazo);
  const fuenteVia = `OpenStreetMap: "${via.nombreOsm}" (${via.porNombre ? 'coincide el nombre' : 'vía más cercana'}, a ${via.distancia.toFixed(0)} m de las coordenadas)`;

  // X-LONGITUD: metas físicas frente a la vía real
  if (e.longitudDeclarada && via.porNombre) {
    const sobra = e.longitudDeclarada - via.longitudVia;
    det.push(sobra > Math.max(20, via.longitudVia * 0.1)
      ? { verificador: 'X-LONGITUD', resultado: 'falla', severidad: 'media', titulo: `La memoria declara ${e.longitudDeclarada} m, pero la vía mide ${via.longitudVia.toFixed(0)} m`,
          detalle: `Las metas físicas superan en ${sobra.toFixed(0)} m la longitud de la vía en ${fuenteVia}. Puede haber metrados inflados o una ubicación equivocada.`, evidencias: [{ documento: 'Memoria descriptiva', extracto: `${e.longitudDeclarada} m de longitud` }] }
      : { verificador: 'X-LONGITUD', resultado: 'pasa', severidad: 'baja', titulo: `La longitud declarada cabe en la vía real (${via.longitudVia.toFixed(0)} m)`, detalle: fuenteVia, evidencias: [] });
  }
  if (!pf || !cu) return { detecciones: det, terreno: { via, perfil: pf, cuenca: cu } };

  // C-DRENAJE: la vía conduce agua de lluvia y el expediente no dice cómo se evacúa
  const partidasDren = e.partidas.filter((p) => !p.esTitulo && RE_DRENAJE.test(normalizar(p.descripcion)));
  const mencion = /DRENAJE PLUVIAL|AGUAS? PLUVIAL|EVACUACION DE (?:LAS )?AGUAS?|CUNETA/.test(normalizar(e.textoEstudios));
  const U = UMBRAL_DRENAJE;
  const fuerte = pf.pendienteMedia >= U.pendienteFuerte || cu.areaHa >= U.areaFuerteHa;
  const moderado = pf.pendienteMedia >= U.pendienteModerada || cu.areaHa >= U.areaModeradaHa;
  const cifras = `Según el modelo de elevación (Copernicus GLO-30), el tramo de ${pf.longitud.toFixed(0)} m baja ${pf.desnivel.toFixed(1)} m (pendiente media ${(pf.pendienteMedia * 100).toFixed(1)}%) y recibe la escorrentía de ${cu.tocaBorde ? 'al menos ' : ''}${cu.areaHa.toFixed(1)} ha aguas arriba.`;
  const evid = [{ documento: 'Gemelo de terreno', extracto: `${fuenteVia}; cotas ${pf.zMin.toFixed(1)}–${pf.zMax.toFixed(1)} m` }];
  const esReparacion = /^\W*(REPARACION|MANTENIMIENTO|RENOVACION)\b/.test(normalizar(e.nombreProyecto ?? ''));
  if ((fuerte || moderado) && !partidasDren.length && esReparacion) {
    det.push({ verificador: 'C-DRENAJE', resultado: 'no_verificable', severidad: 'baja', titulo: 'La calle conduce agua de lluvia; al ser una reparación, el drenaje puede estar fuera del alcance',
      detalle: `${cifras} El presupuesto no tiene partidas de drenaje. En una reparación o mantenimiento eso puede ser correcto, pero conviene confirmar que la calle ya tiene cómo evacuar el agua.`, evidencias: evid });
  } else if ((fuerte || moderado) && !partidasDren.length) {
    det.push({ verificador: 'C-DRENAJE', resultado: 'falla', severidad: fuerte ? (pf.pendienteMedia >= U.pendienteFuerte && cu.areaHa >= U.areaModeradaHa) || cu.areaHa >= 50 ? 'alta' : 'media' : 'baja',
      titulo: `La calle conduce agua de lluvia y el expediente no tiene partidas de drenaje`,
      detalle: `${cifras} El presupuesto no tiene cunetas, sumideros, badenes ni otra partida de drenaje pluvial${mencion ? ' (la memoria o las especificaciones lo mencionan, pero no se presupuesta)' : ' y los estudios no dicen cómo se evacuará el agua'}. En lluvias del Niño, una calle así funciona como cauce y erosiona la base del pavimento.`,
      evidencias: evid });
  } else if (partidasDren.length) {
    det.push({ verificador: 'C-DRENAJE', resultado: 'pasa', severidad: 'baja', titulo: `Incluye ${partidasDren.length} partida(s) de drenaje pluvial`,
      detalle: `${cifras} Partidas: ${partidasDren.slice(0, 4).map((p) => p.codigo).join(', ')}. Axis no dimensiona el drenaje; el evaluador debe revisar la memoria de cálculo hidráulico.`, evidencias: evid });
  } else {
    det.push({ verificador: 'C-DRENAJE', resultado: 'pasa', severidad: 'baja', titulo: 'Calle casi plana y con poca área aguas arriba', detalle: cifras, evidencias: evid });
  }
  return { detecciones: det, terreno: { via, perfil: pf, cuenca: cu } };
}

// ---------- Ubicar la obra por el nombre de la vía (cuando el expediente no trae coordenadas) ----------

export interface UbicacionEstimada { ubicacion: LatLng; via: string; tramo?: { desde: string; hasta: string; largo: number }; distrito: string }
type PoligonoDistrito = { properties: Record<string, unknown>; geometry: { type: string; coordinates: any } };

function anillos(g: PoligonoDistrito['geometry']): LatLng[][] {
  const pol = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return pol.map((p: number[][][]) => p[0].map((c) => ({ lat: c[1], lng: c[0] })));
}
function dentro(p: LatLng, poligono: LatLng[]) {
  let d = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i], b = poligono[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) d = !d;
  }
  return d;
}

/**
 * Estima la ubicación con el nombre del proyecto: «Ca. Portugal tramo desde Ca. Hipólito Unanue hasta Av. Sánchez Carrión,
 * distrito de El Porvenir». Busca la primera vía nombrada dentro del distrito (límites oficiales del INEI) y, si el nombre
 * dice desde/hasta, el tramo entre las vías que la cruzan. Devuelve null si no hay una coincidencia clara.
 */
export function ubicarPorNombre(nombresVia: string[], distrito: string | undefined, red: RedVial, distritos: PoligonoDistrito[]): UbicacionEstimada | null {
  if (!nombresVia.length || !distrito) return null;
  const dn = normalizar(distrito).trim();
  const f = distritos.find((x) => normalizar(String(x.properties.NM_DIST ?? '')) === dn);
  if (!f) return null;
  const poligonos = anillos(f.geometry);
  const enDistrito = (v: ViaOsm) => v.g.some((c) => poligonos.some((pl) => dentro({ lat: c[1], lng: c[0] }, pl)));
  const buscar = (nombre: string) => {
    const nucleo = nucleoVia(nombre);
    if (!nucleoValido(nucleo)) return [];
    return unir(red.vias.filter((v) => v.n && nucleoVia(v.n) === nucleo && enDistrito(v)).map((v) => v.g.map(pt)));
  };
  const lineas = buscar(nombresVia[0]);
  if (!lineas.length) return null;
  const principal = lineas.sort((a, b) => longitud(b) - longitud(a))[0];
  // Tramo entre dos vías transversales nombradas ("desde … hasta …")
  if (nombresVia.length >= 3) {
    const cruce = (nombre: string) => {
      let mejor: { p: LatLng; d: number } | null = null;
      for (const l of buscar(nombre)) for (const c of l) {
        const d = distanciaALinea(c, principal);
        if (d < 40 && (!mejor || d < mejor.d)) mejor = { p: c, d };
      }
      return mejor?.p ?? null;
    };
    const a = cruce(nombresVia[1]), b = cruce(nombresVia[2]);
    if (a && b) return { ubicacion: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }, via: nombresVia[0], tramo: { desde: nombresVia[1], hasta: nombresVia[2], largo: distancia(a, b) }, distrito: String(f.properties.NM_DIST) };
  }
  const acum = [0];
  for (let i = 1; i < principal.length; i++) acum.push(acum[i - 1] + distancia(principal[i - 1], principal[i]));
  return { ubicacion: enPos(principal, acum, acum[acum.length - 1] / 2), via: nombresVia[0], distrito: String(f.properties.NM_DIST) };
}
