// Verificadores de contexto territorial con datos reales (MEF, INGEMMET, ANA).
// No requieren el expediente completo: solo la ubicación, el tipo de obra y las fechas.

import { distancia, distanciaALinea } from '../geo';
import type { LatLng } from '../tipos';
import { normalizar } from './numeros';
import type { Deteccion } from './tipos-analisis';
import type { Dem, RedVial } from './terreno';

export interface InversionMef {
  cui: string; nombre: string; entidad: string; funcion: string; tipo: string; distrito: string; provincia: string;
  lat: number | null; lng: number | null; ubicacionGenerica: boolean; situacion: string; fechaViabilidad: string | null;
  montoViable: number | null; costoActualizado: number | null; montoLaudo: number; controlConcurrente: number;
  tieneExpediente: boolean; avanceFisico: number | null; devengado: number; inicioEjecucion: string | null; finEjecucion: string | null;
}
export interface CapaGeo { fuente: string; descargado: string; features: { geometry: { type: string; coordinates: any }; properties: Record<string, any> }[] }
export interface DatosTerritorio {
  inversiones: InversionMef[];
  peligros?: CapaGeo; zonasCriticas?: CapaGeo; puntosCriticosAna?: CapaGeo; rios?: CapaGeo; emergenciasHidricas?: CapaGeo;
  /** Gemelo de terreno: modelo de elevación y red vial OSM (Trujillo metropolitano). */
  dem?: Dem; red?: RedVial;
  /** Límites distritales (INEI) para ubicar obras por el nombre de su vía. */
  distritos?: { features: { properties: Record<string, unknown>; geometry: { type: string; coordinates: any } }[] };
}
export interface ObraContexto { cui?: string; nombre: string; tipo: 'pistas_veredas' | 'educacion' | 'agua_saneamiento' | 'otro'; ubicacion: LatLng; trazo?: LatLng[] }

const soles = (n: number) => 'S/ ' + Math.round(n).toLocaleString('es-PE');
const pt = (c: number[]): LatLng => ({ lat: c[1], lng: c[0] });
/** Distancia de la obra (punto o trazo) a un punto. */
function dObra(o: ObraContexto, p: LatLng) {
  return o.trazo && o.trazo.length > 1 ? distanciaALinea(p, o.trazo) : distancia(o.ubicacion, p);
}
function lineas(g: { type: string; coordinates: any }): LatLng[][] {
  if (g.type === 'LineString') return [g.coordinates.map(pt)];
  if (g.type === 'MultiLineString') return g.coordinates.map((l: number[][]) => l.map(pt));
  return [];
}

/** C-COORDINACION: no pavimentar donde hay una inversión de agua o desagüe aprobada y sin ejecutar (se rompería la pista nueva). */
export function coordinacionRedes(o: ObraContexto, t: DatosTerritorio, radio = 150): Deteccion[] {
  if (o.tipo !== 'pistas_veredas') return [];
  const pendientes = t.inversiones.filter((x) =>
    !x.ubicacionGenerica && x.lat != null && x.cui !== o.cui && x.funcion === 'SANEAMIENTO' &&
    (x.costoActualizado ?? 0) > 0 && x.devengado < 0.3 * (x.costoActualizado ?? 0) && (x.avanceFisico ?? 0) < 50,
  ).map((x) => ({ x, d: dObra(o, { lat: x.lat!, lng: x.lng! }) })).filter((y) => y.d <= radio).sort((a, b) => a.d - b.d);
  if (!pendientes.length) return [{ verificador: 'C-COORDINACION', resultado: 'pasa', severidad: 'baja', titulo: 'No hay inversiones de agua o desagüe pendientes en la zona', detalle: `No se encontraron inversiones de saneamiento sin ejecutar a menos de ${radio} m (MEF, ubicaciones precisas).`, evidencias: [] }];
  const viasObra = vias(o.nombre);
  return pendientes.slice(0, 3).map(({ x, d }) => {
    const misma = [...vias(x.nombre)].find((v) => viasObra.has(v));
    return {
    verificador: 'C-COORDINACION', resultado: 'falla' as const, severidad: d < 60 || misma ? 'alta' as const : 'media' as const,
    titulo: misma ? `La misma vía (${misma}) tiene una obra de agua o desagüe pendiente` : 'Hay una inversión de agua o desagüe pendiente en la misma zona',
    detalle: `A ${Math.round(d)} m está "${x.nombre}" (CUI ${x.cui}, ${x.entidad}), en situación ${x.situacion.toLowerCase()}${x.fechaViabilidad ? ` desde ${x.fechaViabilidad}` : ''}, por ${soles(x.costoActualizado ?? 0)}, con ${x.tieneExpediente ? 'expediente técnico' : 'sin expediente técnico'} y ${soles(x.devengado)} ejecutados.${misma ? ` Ambas inversiones nombran la misma vía: ${misma}.` : ''} Si se pavimenta antes, habrá que romper la pista nueva para instalar las redes. Coordine el orden de ejecución con la entidad responsable o incluya las redes en este expediente.`,
    evidencias: [{ documento: 'MEF – Banco de Inversiones (datos abiertos)', extracto: `CUI ${x.cui} · ${x.distrito} · ${x.lat}, ${x.lng}` }],
    montoInvolucrado: x.costoActualizado ?? undefined,
  }; });
}

/** Nombres de vías mencionados en el nombre de una inversión: "CALLE LOS INCAS", "AV SANTA", "JR BOLIVAR". */
export function vias(nombre: string): Set<string> {
  const n = normalizar(nombre).replace(/[.,;:"()]/g, ' ').replace(/\s+/g, ' ');
  const out = new Set<string>();
  const re = /\b(?:PROLG|PROLONGACION)?\s*(CALLE|CA|AV|AVENIDA|JR|JIRON|PSJE|PASAJE|PJE)\s+((?:(?!(?:CDRAS?|CDAS|CUADRAS?|DESDE|ENTRE|HASTA|Y|DEL|DE|SECTOR|SECTORES|DISTRITO|EN|PROVINCIA|TRAMOS?|CON|PARA)\b)[A-Z0-9]+\s?){1,3})/g;
  for (const m of n.matchAll(re)) {
    const tipo = /^(AV|AVENIDA)$/.test(m[1]) ? 'AV.' : /^(JR|JIRON)$/.test(m[1]) ? 'JR.' : /^(PSJE|PASAJE|PJE)$/.test(m[1]) ? 'PASAJE' : 'CALLE';
    const nom = m[2].trim();
    // nombres cortos ("Avenida C", "Calle 12") solo si son letra o número sueltos
    if (nom.length >= 3 || /^[A-Z]$|^\d{1,3}$/.test(nom)) out.add(`${tipo} ${nom}`);
  }
  return out;
}

/** C-DUPLICIDAD: otra inversión del mismo tipo en el mismo lugar (posible duplicidad o superposición). */
export function duplicidad(o: ObraContexto, t: DatosTerritorio, radio = 40): Deteccion[] {
  const funcion = o.tipo === 'pistas_veredas' ? 'TRANSPORTE' : o.tipo === 'educacion' ? 'EDUCACIÓN' : o.tipo === 'agua_saneamiento' ? 'SANEAMIENTO' : null;
  if (!funcion) return [];
  const cerca = t.inversiones.filter((x) => !x.ubicacionGenerica && x.lat != null && x.cui !== o.cui && x.funcion === funcion)
    .map((x) => ({ x, d: dObra(o, { lat: x.lat!, lng: x.lng! }) })).filter((y) => y.d <= radio);
  return cerca.slice(0, 2).map(({ x, d }) => ({
    verificador: 'C-DUPLICIDAD', resultado: 'falla' as const, severidad: 'media' as const,
    titulo: 'Otra inversión del mismo tipo en el mismo lugar',
    detalle: `A ${Math.round(d)} m está registrada "${x.nombre}" (CUI ${x.cui}, ${x.situacion.toLowerCase()}, avance físico ${x.avanceFisico ?? 's/d'}%). Verifique que no se superpongan las metas.`,
    evidencias: [{ documento: 'MEF – Banco de Inversiones (datos abiertos)', extracto: `CUI ${x.cui}` }],
  }));
}

/** C-PELIGRO: peligros geológicos inventariados por INGEMMET y zonas críticas cerca de la obra. */
export function peligros(o: ObraContexto, t: DatosTerritorio): Deteccion[] {
  const out: Deteccion[] = [];
  // Radio de influencia según el tipo de peligro: los flujos (huaicos) e inundaciones viajan por las quebradas;
  // derrumbes, caídas y deslizamientos solo afectan lo que está al pie de la ladera.
  const radioZona = (p: Record<string, any>) => (/FLUJO|INUNDACION|EROSION FLUVIAL|ARENAMIENTO/.test(normalizar(String(p.PELIGROS_G ?? ''))) ? 800 : 250);
  const radioPeligro = (p: Record<string, any>) => (String(p.TIP_PELIGRO ?? '').endsWith('1500') ? 600 : 250);
  const cerca = (capa: CapaGeo | undefined, radio: (p: Record<string, any>) => number) => (capa?.features ?? [])
    .filter((f) => f.geometry.type === 'Point')
    .map((f) => ({ f, d: dObra(o, pt(f.geometry.coordinates)) })).filter((y) => y.d <= radio(y.f.properties)).sort((a, b) => a.d - b.d);
  const reportados: LatLng[] = [];
  for (const { f, d } of cerca(t.zonasCriticas, radioZona).slice(0, 2)) {
    const p = f.properties;
    reportados.push(pt(f.geometry.coordinates));
    out.push({ verificador: 'C-PELIGRO', resultado: 'falla', severidad: d < 300 ? 'alta' : 'media', titulo: `Zona crítica por ${String(p.PELIGROS_G ?? 'peligro geológico').toLowerCase()} a ${Math.round(d)} m`,
      detalle: `INGEMMET registra la zona crítica "${p.PARAJE ?? ''}" (${p.DISTRITO ?? ''}). ${p.ELEMENTO ? 'Elementos expuestos: ' + p.ELEMENTO + '. ' : ''}El expediente debe evaluar este peligro y, si corresponde, incluir obras de protección o drenaje.`,
      evidencias: [{ documento: t.zonasCriticas!.fuente, extracto: `${p.BOLETIN ?? p.PROYECTO ?? ''}` }] });
  }
  // Un mismo peligro suele estar en ambas capas: no se repite si está a menos de 200 m de una zona crítica ya reportada
  for (const { f, d } of cerca(t.peligros, radioPeligro).filter((y) => !reportados.some((r) => distancia(r, pt(y.f.geometry.coordinates)) < 200)).slice(0, 2)) {
    const p = f.properties;
    out.push({ verificador: 'C-PELIGRO', resultado: 'falla', severidad: 'media', titulo: `Peligro geológico inventariado a ${Math.round(d)} m`,
      detalle: `Sector "${p.NM_SECTOR ?? ''}" (${p.NM_DIST ?? ''}). ${p.RE_ME_E_NE ? p.RE_ME_E_NE + '. ' : ''}${p.OTRA_EVISUAL ?? ''}`.trim(),
      evidencias: [{ documento: t.peligros!.fuente, extracto: String(p.TIESTU_ANO ?? '') }] });
  }
  return out;
}

/** C-AGUA: puntos críticos de inundación (ANA) y cauces cercanos (faja marginal). */
export function riesgoHidrico(o: ObraContexto, t: DatosTerritorio): Deteccion[] {
  const out: Deteccion[] = [];
  const pc = (t.puntosCriticosAna?.features ?? []).filter((f) => f.geometry.type === 'Point')
    .map((f) => ({ f, d: dObra(o, pt(f.geometry.coordinates)) })).filter((y) => y.d <= 500).sort((a, b) => a.d - b.d);
  for (const { f, d } of pc.slice(0, 2)) {
    const p = f.properties;
    out.push({ verificador: 'C-AGUA', resultado: 'falla', severidad: d < 200 ? 'alta' : 'media', titulo: `Punto crítico de inundación a ${Math.round(d)} m`,
      detalle: `La ANA identifica un punto crítico en ${p.Tipo ? String(p.Tipo).toLowerCase() + ' ' : ''}${p.Rio_QDA ?? ''} (${p.Distrito ?? ''}). Verifique drenaje pluvial y cotas del proyecto ante lluvias intensas o Fenómeno El Niño.`,
      evidencias: [{ documento: t.puntosCriticosAna!.fuente, extracto: `Código ${p.Codigo ?? ''} · ALA ${p.ALA ?? ''}` }] });
  }
  for (const f of t.rios?.features ?? []) {
    const d = Math.min(...lineas(f.geometry).map((l) => (o.trazo?.length ? Math.min(...o.trazo.map((q) => distanciaALinea(q, l))) : distanciaALinea(o.ubicacion, l))));
    if (d <= 100) {
      out.push({ verificador: 'C-AGUA', resultado: 'falla', severidad: d < 50 ? 'alta' : 'media', titulo: `Cauce a ${Math.round(d)} m de la obra`,
        detalle: `${f.properties.NOMBRE_CA ?? 'Un río o quebrada'} pasa a ${Math.round(d)} m. Confirme que la obra está fuera de la faja marginal delimitada por la ANA y que el expediente considera el cruce o la protección.`,
        evidencias: [{ documento: t.rios!.fuente, extracto: String(f.properties.CODIGO_CA ?? '') }] });
      break;
    }
  }
  return out;
}

/** C-HISTORIAL: qué pasó con obras similares cercanas (sobrecostos y arbitrajes). Informativo: ayuda a priorizar la revisión. */
export function historialZona(o: ObraContexto, t: DatosTerritorio, radio = 1500): Deteccion[] {
  const funcion = o.tipo === 'pistas_veredas' ? 'TRANSPORTE' : o.tipo === 'educacion' ? 'EDUCACIÓN' : o.tipo === 'agua_saneamiento' ? 'SANEAMIENTO' : null;
  if (!funcion) return [];
  const vecinas = t.inversiones.filter((x) => !x.ubicacionGenerica && x.lat != null && x.funcion === funcion && x.cui !== o.cui && x.tieneExpediente && (x.montoViable ?? 0) > 100000)
    .filter((x) => dObra(o, { lat: x.lat!, lng: x.lng! }) <= radio);
  if (vecinas.length < 3) return [];
  const sobre = vecinas.filter((x) => (x.costoActualizado ?? 0) > 1.25 * (x.montoViable ?? 0));
  const laudos = vecinas.filter((x) => x.montoLaudo > 0);
  if (!sobre.length && !laudos.length) return [];
  const pct = Math.round((sobre.length / vecinas.length) * 100);
  return [{
    verificador: 'C-HISTORIAL', resultado: 'falla', severidad: pct >= 40 || laudos.length ? 'media' : 'baja',
    titulo: `En esta zona, ${sobre.length} de ${vecinas.length} obras similares subieron más de 25% su costo`,
    detalle: `Obras de ${funcion.toLowerCase()} con expediente técnico a menos de ${radio / 1000} km (MEF): ${pct}% aumentaron su costo actualizado más de 25% respecto al monto viable${laudos.length ? ` y ${laudos.length} terminaron en arbitraje (laudos por ${soles(laudos.reduce((s, x) => s + x.montoLaudo, 0))})` : ''}. Revise con más detalle metrados, estudios básicos e interferencias.`,
    evidencias: sobre.slice(0, 3).map((x) => ({ documento: 'MEF – Banco de Inversiones (datos abiertos)', extracto: `CUI ${x.cui}: ${soles(x.montoViable ?? 0)} → ${soles(x.costoActualizado ?? 0)}` })),
  }];
}

export function verificarContexto(o: ObraContexto, t: DatosTerritorio): Deteccion[] {
  return [...coordinacionRedes(o, t), ...duplicidad(o, t), ...peligros(o, t), ...riesgoHidrico(o, t), ...historialZona(o, t)];
}

/** Tipo de obra a partir del nombre del proyecto. */
export function tipoDesdeNombre(nombre: string): ObraContexto['tipo'] {
  const n = normalizar(nombre);
  if (/CALZADA|PISTA|VEREDA|MOVILIDAD URBANA|TRANSITABILIDAD (VEHICULAR|PEATONAL)|PAVIMEN/.test(n)) return 'pistas_veredas';
  if (/EDUCA|I\.?E\.?|AULA|COLEGIO/.test(n)) return 'educacion';
  if (/AGUA|SANEAMIENTO|ALCANTARILL|DESAGUE/.test(n)) return 'agua_saneamiento';
  return 'otro';
}
