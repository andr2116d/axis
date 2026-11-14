// Plan de verificación en obra para el supervisor o inspector, generado del propio expediente (presupuesto y
// especificaciones técnicas) y priorizado con lo que la Contraloría encuentra con más frecuencia en obras viales
// urbanas reales (fichas resumen de informes de control 2022-2026). No inventa tolerancias: el valor a verificar
// es el que fija el expediente; si el expediente no lo fija, lo dice.

import { espesorEnMetros } from './verificar-presupuesto';
import type { SeccionEt } from './lectores';
import { normalizar } from './numeros';
import type { Presupuesto } from './presupuesto';

export interface AntecedentesContraloria {
  fuente: string; situaciones: number; informes: number; calidad: number;
  laLibertad: { situaciones: number; informes: number };
  elementos: Record<string, { peru: number; laLibertad: number; ejemplos: { informe: string; lugar: string; fecha: string; texto: string }[] }>;
  ensayos: Record<string, { peru: number; ejemplos: { informe: string; lugar: string; fecha: string; texto: string }[] }>;
}

export interface PuntoControl {
  partidas: { codigo: string; descripcion: string; metrado?: number; unidad?: string; parcial: number }[];
  elemento: string;
  verificar: { que: string; valor: string; momento: string }[];
  prioridad: number; // 0-100
  porque: string;
  antecedentes: { informe: string; lugar: string; fecha: string; texto: string }[];
}

type Valor = number | [number, number] | undefined; // [especificación, presupuesto] cuando se contradicen
interface Regla { elemento: string; patron: RegExp; excluir?: RegExp; controles: (d: { e: Valor; fc: Valor; et?: SeccionEt; desc: string }) => PuntoControl['verificar'] }
const val = (x: number | undefined | [number, number], f: (v: number) => string, sinDato: string) =>
  Array.isArray(x) ? `${f(x[0])} según las especificaciones y ${f(x[1])} según el presupuesto: aclarar con el proyectista antes de ejecutar` : x !== undefined ? f(x) : sinDato;
const cm = (m: number) => `${(m * 100).toFixed(m < 0.1 ? 1 : 0)} cm`;
const SIN_ET = 'el expediente no lo fija: pedir al proyectista que lo precise';

const REGLAS: Regla[] = [
  { elemento: 'vereda', patron: /VEREDA/, excluir: /EXCAVACION|ENCOFRADO|CURADO|JUNTA|BASE|AFIRMADO/, controles: ({ e, fc }) => [
    { que: 'Espesor de la losa de vereda', valor: val(e, cm, SIN_ET), momento: 'Antes del vaciado (encofrado) y con extracción de núcleos si hay duda' },
    { que: 'Resistencia del concreto (probetas)', valor: val(fc, (v) => `f'c = ${v} kg/cm²`, SIN_ET), momento: 'Muestreo en cada vaciado; rotura a 7 y 28 días' },
  ] },
  { elemento: 'sardinel', patron: /SARDINEL/, excluir: /EXCAVACION|ENCOFRADO|CURADO/, controles: ({ fc, desc }) => [
    { que: 'Sección del sardinel', valor: desc.match(/\d\.\d{2}\s*X\s*\d\.\d{2}/)?.[0]?.replace(/\s+/g, '') + ' m' || SIN_ET, momento: 'Al encofrar' },
    { que: 'Resistencia del concreto (probetas)', valor: val(fc, (v) => `f'c = ${v} kg/cm²`, SIN_ET), momento: 'En cada vaciado' },
  ] },
  { elemento: 'base y sub base', patron: /BASE (?:GRANULAR|DE AFIRMADO)|SUB ?BASE|AFIRMADO/, excluir: /IMPRIMACION/, controles: ({ e }) => [
    { que: 'Espesor compactado de la capa', valor: val(e, cm, SIN_ET), momento: 'Antes de imprimar o vaciar encima' },
    { que: 'Compactación (densidad de campo)', valor: 'el porcentaje de la máxima densidad seca que exige la especificación', momento: 'Por capa, antes de colocar la siguiente' },
  ] },
  { elemento: 'carpeta asfáltica', patron: /CARPETA|MEZCLA ASFALTICA/, controles: ({ e }) => [
    { que: 'Espesor compactado de la carpeta', valor: val(e, cm, SIN_ET), momento: 'Con extracción de testigos después del compactado' },
    { que: 'Temperatura y contenido de asfalto de la mezcla', valor: 'según el diseño de mezcla aprobado', momento: 'En cada entrega de mezcla' },
  ] },
  { elemento: 'losa de concreto', patron: /LOSA|PAVIMENTO RIGIDO|CONCRETO HIDRAULICO/, controles: ({ e, fc }) => [
    { que: 'Espesor de la losa', valor: val(e, cm, SIN_ET), momento: 'Al encofrar y con núcleos' },
    { que: 'Resistencia del concreto (probetas o vigas)', valor: val(fc, (v) => `f'c = ${v} kg/cm²`, SIN_ET), momento: 'En cada vaciado' },
  ] },
  { elemento: 'subrasante y relleno', patron: /SUBRASANTE|RELLENO|MEJORAMIENTO DE SUELO/, excluir: /CORTE/, controles: () => [
    { que: 'Compactación de la subrasante o del relleno', valor: 'el porcentaje de la máxima densidad seca que exige la especificación', momento: 'Antes de colocar la base' },
  ] },
  { elemento: 'juntas', patron: /JUNTA/, controles: ({ desc }) => [
    { que: 'Separación y sellado de juntas', valor: desc.match(/@\s*\d+(?:\.\d+)?\s*M/)?.[0] ?? SIN_ET, momento: 'Al vaciar y antes de la recepción' },
  ] },
  { elemento: 'cunetas y drenaje', patron: /CUNETA|SUMIDERO|BADEN|DRENAJE|REJILLA/, controles: () => [
    { que: 'Pendiente y sección de cunetas y badenes', valor: 'la de los planos de drenaje y su memoria de cálculo hidráulico', momento: 'Al trazar y al vaciar' },
  ] },
  { elemento: 'señalización', patron: /SENAL|PINTURA DE TRAFICO/, controles: () => [
    { que: 'Cantidad, tipo y ubicación de señales', valor: 'la del plano de señalización', momento: 'Al final, antes de la recepción' },
  ] },
];

/** Construye el plan de control de calidad en obra, ordenado por prioridad. */
export function planVerificacion(p: Presupuesto, et: SeccionEt[], ant?: AntecedentesContraloria): PuntoControl[] {
  const total = p.items.filter((i) => !i.esTitulo).reduce((s, i) => s + i.parcial, 0) || 1;
  const maxFrecuencia = ant ? Math.max(...Object.values(ant.elementos).map((x) => x.peru)) : 1;
  const out: PuntoControl[] = [];
  for (const r of REGLAS) {
    const partidas = p.items.filter((i) => !i.esTitulo && r.patron.test(normalizar(i.descripcion)) && !(r.excluir && r.excluir.test(normalizar(i.descripcion))));
    if (!partidas.length) continue;
    const principal = partidas.reduce((a, b) => (b.parcial > a.parcial ? b : a));
    const sec = et.find((s) => s.codigo === principal.codigo);
    const fcDesc = Number(normalizar(principal.descripcion).match(/F'?C\s*=\s*(\d{3})/)?.[1]) || undefined;
    const eDesc = espesorEnMetros(principal.descripcion) ?? undefined;
    const ambos = (a: number | undefined, b: number | undefined): Valor => (a !== undefined && b !== undefined && Math.abs(a - b) > 1e-6 ? [a, b] : a ?? b);
    const controles = r.controles({ e: ambos(sec?.espesor, eDesc), fc: ambos(sec?.fc, fcDesc), et: sec, desc: normalizar(principal.descripcion) });
    const peso = partidas.reduce((s, i) => s + i.parcial, 0) / total;
    const a = ant?.elementos[r.elemento];
    const frecuencia = a ? a.peru / maxFrecuencia : 0;
    out.push({
      partidas: partidas.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, metrado: i.metrado, unidad: i.unidad, parcial: i.parcial })),
      elemento: r.elemento, verificar: controles,
      prioridad: Math.round(100 * (0.5 * Math.min(1, peso * 4) + 0.5 * frecuencia)),
      porque: `${(peso * 100).toFixed(1)}% del costo directo` + (a ? `; la Contraloría registró ${a.peru} situaciones adversas de calidad en ${r.elemento} en obras viales del Perú (${a.laLibertad} en La Libertad)` : ''),
      antecedentes: a?.ejemplos ?? [],
    });
  }
  return out.sort((x, y) => y.prioridad - x.prioridad);
}
