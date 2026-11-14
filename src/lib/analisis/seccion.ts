// Sección vial paramétrica (modelo 3D simple de la vía): capas del pavimento con sus espesores, corte, anchos de
// calzada y veredas, leídos del presupuesto, las especificaciones y la memoria. Sirve para dibujar la vía en 3D y
// para una verificación física: el corte presupuestado debe alcanzar para alojar las capas del pavimento.

import type { SeccionEt } from './lectores';
import { normalizar } from './numeros';
import type { ItemPresupuesto, Presupuesto } from './presupuesto';
import type { Deteccion } from './tipos-analisis';
import { espesorEnMetros } from './verificar-presupuesto';

export interface Capa { nombre: string; espesor: number; partida: string; zona: 'calzada' | 'vereda'; area?: number }
/** Zonas de intervención: capas de calzada con la misma área (±3%). Una rehabilitación puede tener parches, sellado y reconstrucción. */
export function zonasCalzada(capas: Capa[]): { area: number; capas: Capa[]; paquete: number }[] {
  const grupos: { area: number; capas: Capa[]; paquete: number }[] = [];
  for (const c of capas.filter((x) => x.zona === 'calzada')) {
    const a = c.area ?? 0;
    const g = grupos.find((x) => (a === 0 && x.area === 0) || (a > 0 && Math.abs(x.area - a) / Math.max(x.area, a) <= 0.03));
    if (g) { g.capas.push(c); g.paquete += c.espesor; } else grupos.push({ area: a, capas: [c], paquete: c.espesor });
  }
  return grupos.sort((x, y) => y.area - x.area);
}

export interface SeccionVial {
  longitud?: number; anchoCalzada?: number; anchoVereda?: number;
  capas: Capa[]; paqueteCalzada: number;
  corte?: { partida: string; volumen: number; area: number; profundidad: number };
  relleno: boolean;
}

const RE_CAPA = /CARPETA|LOSA DE (?:CONCRETO|RODADURA)|PAVIMENTO RIGIDO|BASE GRANULAR|SUB ?BASE|BASE DE AFIRMADO|AFIRMADO|ADOQUIN|VEREDA DE CONCRETO|CAMA DE ARENA/;
const RE_CORTE = /CORTE (?:DE TERRENO|DE MATERIAL|A NIVEL)|EXCAVACION (?:MASIVA|A NIVEL|HASTA (?:EL )?NIVEL)|CORTE .*SUBRASANTE/;
const RE_RELLENO = /RELLENO|MEJORAMIENTO DE (?:LA )?SUBRASANTE|MEJORAMIENTO DE SUELO|OVER|CONFORMACION DE TERRAPLEN/;

function zona(i: ItemPresupuesto, items: ItemPresupuesto[]): 'calzada' | 'vereda' {
  const titulos = items.filter((t) => t.esTitulo && i.codigo.startsWith(t.codigo + '.')).map((t) => normalizar(t.descripcion));
  return /VEREDA|PEATONAL/.test(normalizar(i.descripcion)) || titulos.some((t) => /VEREDA|PEATONAL/.test(t)) ? 'vereda' : 'calzada';
}

export function seccionTipica(p: Presupuesto, et: SeccionEt[], generales: { longitudM?: number; anchoCalzadaM?: number }, textoMemoria = ''): SeccionVial {
  const hojas = p.items.filter((i) => !i.esTitulo);
  const capas: Capa[] = [];
  for (const i of hojas) {
    const d = normalizar(i.descripcion);
    if (!RE_CAPA.test(d) || /IMPRIMACION|CURADO|ENCOFRADO|JUNTA|SELLADO|CORTE|DEMOLICION|ELIMINACION|ROTURA|EXCAVACION|PERFILADO/.test(d)) continue;
    const e = et.find((s) => s.codigo === i.codigo)?.espesor ?? espesorEnMetros(i.descripcion);
    if (!e || e <= 0 || e > 1) continue;
    capas.push({ nombre: i.descripcion, espesor: e, partida: i.codigo, zona: zona(i, p.items), area: i.unidad?.toLowerCase() === 'm2' ? i.metrado : undefined });
  }
  const zonas = zonasCalzada(capas);
  // La sección que se dibuja es la de la zona principal (mayor área)
  const paqueteCalzada = zonas[0]?.paquete ?? 0;
  const anchoVereda = Number(normalizar(textoMemoria).match(/VEREDAS?[^.]{0,40}?DE\s+(\d\.\d{1,2})\s*M\s+DE\s+ANCHO/)?.[1]) || undefined;
  // Área de calzada: de la memoria (largo × ancho) o, si no, la mayor partida en m2 de una capa de calzada
  const area = generales.longitudM && generales.anchoCalzadaM ? generales.longitudM * generales.anchoCalzadaM : zonas[0]?.area ?? 0;
  const pc = hojas.find((i) => RE_CORTE.test(normalizar(i.descripcion)) && i.unidad?.toLowerCase() === 'm3' && zona(i, p.items) === 'calzada');
  return {
    longitud: generales.longitudM, anchoCalzada: generales.anchoCalzadaM, anchoVereda, capas, paqueteCalzada,
    corte: pc && pc.metrado && area > 0 ? { partida: pc.codigo, volumen: pc.metrado, area, profundidad: pc.metrado / area } : undefined,
    relleno: hojas.some((i) => RE_RELLENO.test(normalizar(i.descripcion)) && zona(i, p.items) === 'calzada'),
  };
}

/** X-SECCION: el corte debe alcanzar para la estructura del pavimento (o debe haber relleno/nivelación presupuestada). */
export function verificarSeccion(s: SeccionVial): Deteccion[] {
  const zonas = zonasCalzada(s.capas);
  if (!zonas.length || !s.corte) return [];
  const cm = (m: number) => `${(m * 100).toFixed(1)} cm`;
  if (zonas.length > 1) {
    // Varias zonas de intervención: el corte vale si alcanza para alguna de ellas (sobre su propia área)
    const cabe = zonas.some((z) => z.area > 0 && s.corte!.volumen / z.area + 0.02 >= z.paquete);
    if (cabe || s.relleno) return [{ verificador: 'X-SECCION', resultado: 'pasa', severidad: 'baja', titulo: 'El corte alcanza para las capas de alguna de las zonas de intervención', detalle: `El presupuesto tiene ${zonas.length} zonas con capas distintas (por ejemplo parches y reconstrucción); el corte ${s.corte.partida} es compatible con al menos una.`, evidencias: [] }];
    return [{ verificador: 'X-SECCION', resultado: 'no_verificable', severidad: 'baja', titulo: 'No se pudo asignar el corte a una zona de intervención', detalle: `Hay ${zonas.length} zonas con capas distintas y el corte ${s.corte.partida} no alcanza para ninguna sobre su propia área. Revise en los planos qué zona se excava.`, evidencias: [] }];
  }
  const calz = zonas[0].capas;
  const capas = calz.map((c) => `${c.partida} ${cm(c.espesor)}`).join(' + ');
  if (s.corte.profundidad + 0.02 < s.paqueteCalzada && !s.relleno)
    return [{ verificador: 'X-SECCION', resultado: 'falla', severidad: 'media', titulo: `El corte no alcanza para la estructura del pavimento`,
      detalle: `El corte presupuestado (${s.corte.partida}: ${s.corte.volumen.toFixed(2)} m³ sobre ${s.corte.area.toFixed(0)} m² de calzada) equivale a ${cm(s.corte.profundidad)} de profundidad, pero las capas suman ${cm(s.paqueteCalzada)} (${capas}). Sin relleno ni nivelación presupuestados, la rasante quedaría ${cm(s.paqueteCalzada - s.corte.profundidad)} por encima de lo previsto o faltaría excavación.`,
      evidencias: [{ documento: 'Presupuesto', extracto: `${s.corte.partida}: ${s.corte.volumen.toFixed(2)} m³` }] }];
  return [{ verificador: 'X-SECCION', resultado: 'pasa', severidad: 'baja', titulo: 'El corte alcanza para las capas del pavimento',
    detalle: `Corte de ${cm(s.corte.profundidad)} frente a capas de ${cm(s.paqueteCalzada)} (${capas}).`, evidencias: [] }];
}
