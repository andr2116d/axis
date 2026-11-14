// Verificadores que cruzan documentos del expediente.
// Origen: observaciones reales de postores en licitaciones de obras de La Libertad (pliegos de absolución, SEACE 2026).

import type { ActividadCronograma, Apu, Cotizacion, Formula, GastosGenerales, ItemMetrado, Plano, SeccionEt } from './lectores';
import { difRel, normalizar, redondear } from './numeros';
import { partidas, type Presupuesto } from './presupuesto';
import type { Deteccion } from './tipos-analisis';
import { claves, espesorEnMetros } from './verificar-presupuesto';

const evP = (i: { pagina: number; extracto: string }) => ({ documento: 'Presupuesto', pagina: i.pagina, extracto: i.extracto });
const evM = (i: { pagina: number; extracto: string }) => ({ documento: 'Planilla de metrados', pagina: i.pagina, extracto: i.extracto });
const evE = (i: { pagina: number; extracto: string }) => ({ documento: 'Especificaciones técnicas', pagina: i.pagina, extracto: i.extracto });
const fmt = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

const UNI_EQ: Record<string, string> = { ml: 'm', gbl: 'glb', gl: 'glb', un: 'und', u: 'und', unid: 'und', pza: 'und' };
const uni = (u?: string) => (u ? UNI_EQ[u] ?? u : u);

/** Empareja por código; si el código no existe, por descripción normalizada. */
function emparejar<T extends { codigo: string; descripcion: string }>(codigo: string, descripcion: string, lista: T[]): T | undefined {
  return lista.find((x) => x.codigo === codigo) ?? lista.find((x) => normalizar(x.descripcion) === normalizar(descripcion));
}

/** X-MET-PRES: presupuesto y metrados tienen las mismas partidas, unidades y cantidades (Cochorco, Parcoy, Curgos, Santiago de Chuco). */
/** Nombre corto de una partida para títulos legibles: «vereda de concreto e=0.10 m». */
function corto(desc: string): string {
  const d = desc.toLowerCase().replace(/\s+/g, ' ').trim();
  if (d.length <= 48) return d;
  const c = d.slice(0, 48);
  return c.slice(0, c.lastIndexOf(' ')) + '…';
}

export function presupuestoVsMetrados(p: Presupuesto, metrados: ItemMetrado[]): Deteccion[] {
  if (!metrados.length) return [{ verificador: 'X-MET-PRES', resultado: 'no_verificable', severidad: 'media', titulo: 'No se encontró la planilla de metrados', detalle: 'Sin planilla de metrados no se puede comprobar que el presupuesto esté sustentado.', evidencias: [] }];
  const out: Deteccion[] = [];
  const conMetrado = metrados.filter((m) => m.unidad && m.metrado != null);
  // Si el presupuesto casi no se pudo leer, cruzarlo daría una alerta por cada metrado: no es un error del expediente sino de lectura.
  if (partidas(p).length < Math.max(3, conMetrado.length * 0.3))
    return [{ verificador: 'X-MET-PRES', resultado: 'no_verificable', severidad: 'media', titulo: 'No se pudo cruzar el presupuesto con los metrados',
      detalle: `Se leyeron ${conMetrado.length} metrados pero solo ${partidas(p).length} partidas del presupuesto (puede estar escaneado o en un formato no reconocido). Revise que el presupuesto sea legible o súbalo por separado.`, evidencias: [] }];
  for (const i of partidas(p)) {
    const m = emparejar(i.codigo, i.descripcion, conMetrado);
    if (!m) {
      out.push({ verificador: 'X-MET-PRES', resultado: 'falla', severidad: 'alta', titulo: `«${corto(i.descripcion)}» (${i.codigo}) está en el presupuesto pero no fue medida`,
        detalle: `"${i.descripcion}" (${i.metrado} ${i.unidad}, ${i.parcial.toLocaleString('es-PE')} soles) está en el presupuesto pero no aparece en la planilla de metrados.`,
        evidencias: [evP(i)], montoInvolucrado: i.parcial });
      continue;
    }
    if (uni(m.unidad) !== uni(i.unidad)) {
      out.push({ verificador: 'X-MET-PRES', resultado: 'falla', severidad: 'media', titulo: `«${corto(i.descripcion)}» (${i.codigo}) se mide en otra unidad en los metrados`,
        detalle: `"${i.descripcion}" se presupuesta en ${i.unidad} pero se mide en ${m.unidad} en la planilla de metrados.`,
        evidencias: [evP(i), evM(m)], montoInvolucrado: i.parcial });
    } else if (m.metrado != null && i.metrado != null && difRel(m.metrado, i.metrado) > 0.005 && Math.abs(m.metrado - i.metrado) > 0.01) {
      const delta = Math.abs(m.metrado - i.metrado) * (i.precio ?? 0);
      out.push({ verificador: 'X-MET-PRES', resultado: 'falla', severidad: delta > 5000 ? 'alta' : 'media', titulo: `«${corto(i.descripcion)}» (${i.codigo}) tiene otra cantidad en los metrados`,
        detalle: `"${i.descripcion}": la planilla de metrados sustenta ${m.metrado} ${m.unidad}, pero el presupuesto consigna ${i.metrado} ${i.unidad} (${Math.round(difRel(m.metrado, i.metrado) * 1000) / 10}% de diferencia, unos ${redondear(delta).toLocaleString('es-PE')} soles).`,
        evidencias: [evP(i), evM(m)], montoInvolucrado: delta });
    }
    const eP = espesorEnMetros(i.descripcion);
    const eM = espesorEnMetros(m.descripcion);
    if (eP && eM && Math.abs(eP - eM) > 0.001) {
      out.push({ verificador: 'X-MET-PRES', resultado: 'falla', severidad: 'alta', titulo: `«${corto(i.descripcion)}» (${i.codigo}) tiene otro espesor en los metrados`,
        detalle: `El presupuesto dice e = ${eP} m y la planilla de metrados e = ${eM} m para "${i.descripcion}".`, evidencias: [evP(i), evM(m)], montoInvolucrado: i.parcial });
    }
  }
  for (const m of conMetrado) {
    if (!emparejar(m.codigo, m.descripcion, partidas(p))) {
      out.push({ verificador: 'X-MET-PRES', resultado: 'falla', severidad: 'media', titulo: `Se midió «${corto(m.descripcion)}» (${m.codigo}) pero no está en el presupuesto`,
        detalle: `"${m.descripcion}" (${m.metrado} ${m.unidad}) está metrado pero no presupuestado: o falta la partida o sobra el metrado.`, evidencias: [evM(m)] });
    }
  }
  return out;
}

/** X-ET-PRES: las especificaciones técnicas dicen lo mismo que el presupuesto (Parcoy: vereda 0.15 vs 0.10). */
export function presupuestoVsEspecificaciones(p: Presupuesto, et: SeccionEt[]): Deteccion[] {
  if (!et.length) return [];
  const out: Deteccion[] = [];
  for (const i of partidas(p)) {
    const s = et.find((x) => x.codigo === i.codigo) ?? et.find((x) => normalizar(x.titulo) === normalizar(i.descripcion));
    if (!s) continue;
    if (s.unidadMedida && uni(s.unidadMedida) !== uni(i.unidad)) {
      out.push({ verificador: 'X-ET-PRES', resultado: 'falla', severidad: 'media', titulo: `La especificación mide «${corto(i.descripcion)}» (${i.codigo}) en otra unidad`,
        detalle: `Presupuesto: ${i.unidad}. Especificación técnica: ${s.unidadMedida}. La forma de pago depende de la unidad de medida.`, evidencias: [evP(i), evE(s)] });
    }
    const eP = espesorEnMetros(i.descripcion);
    if (eP && s.espesor && Math.abs(eP - s.espesor) > 0.001) {
      out.push({ verificador: 'X-ET-PRES', resultado: 'falla', severidad: 'alta', titulo: `«${corto(i.descripcion)}» (${i.codigo}) tiene un espesor en el presupuesto y otro en las especificaciones`,
        detalle: `El presupuesto considera e = ${eP} m, pero la especificación técnica exige e = ${s.espesor} m para "${i.descripcion}". Uno de los dos documentos está mal y cambia el costo.`,
        evidencias: [evP(i), evE(s)], montoInvolucrado: i.parcial });
    }
    const fcP = normalizar(i.descripcion).match(/F'?\s*C\s*=\s*(\d{3})/);
    if (fcP && s.fc && Number(fcP[1]) !== s.fc) {
      out.push({ verificador: 'X-ET-PRES', resultado: 'falla', severidad: 'alta', titulo: `«${corto(i.descripcion)}» (${i.codigo}) tiene una resistencia en el presupuesto y otra en las especificaciones`,
        detalle: `Presupuesto: f'c = ${fcP[1]} kg/cm². Especificación técnica: f'c = ${s.fc} kg/cm².`, evidencias: [evP(i), evE(s)], montoInvolucrado: i.parcial });
    }
  }
  return out;
}

/** X-FECHAS: las cotizaciones que sustentan precios no pueden ser posteriores a la fecha del presupuesto (Curgos). */
export function fechasCotizaciones(p: Presupuesto, cot: Cotizacion[]): Deteccion[] {
  if (!p.fechaCosto || !cot.length) return [];
  const [d, m, y] = p.fechaCosto.split('/').map(Number);
  const fp = new Date(Date.UTC(y < 100 ? 2000 + y : y, m - 1, d));
  return cot.filter((c) => c.fecha > fp).map((c) => ({
    verificador: 'X-FECHAS', resultado: 'falla' as const, severidad: 'media' as const,
    titulo: 'Cotización posterior a la fecha del presupuesto',
    detalle: `El presupuesto tiene precios "al ${p.fechaCosto}", pero se sustenta con una cotización del ${fmt(c.fecha)}${c.proveedor ? ` (${c.proveedor})` : ''}. Un precio no puede sustentarse en un documento que aún no existía.`,
    evidencias: [{ documento: 'Cotización', pagina: c.pagina, extracto: c.extracto }],
  }));
}

/** X-FORMULA: fórmula polinómica conforme al DS 011-79-VC art. 2 (máx. 8 monomios, cada uno ≥ 0.05, suma = 1). */
export function formulaPolinomica(formulas: Formula[]): Deteccion[] {
  const out: Deteccion[] = [];
  for (const f of formulas) {
    const ev = [{ documento: 'Fórmula polinómica', pagina: f.pagina, extracto: f.extracto }];
    const suma = redondear(f.monomios.reduce((s, x) => s + x.coeficiente, 0), 4);
    if (Math.abs(suma - 1) > 0.0005)
      out.push({ verificador: 'X-FORMULA', resultado: 'falla', severidad: 'alta', titulo: 'Los coeficientes de la fórmula polinómica no suman 1', detalle: `Suman ${suma}. El reajuste de todas las valorizaciones quedaría mal calculado.`, evidencias: ev });
    if (f.monomios.length > 8)
      out.push({ verificador: 'X-FORMULA', resultado: 'falla', severidad: 'media', titulo: 'La fórmula polinómica tiene más de 8 monomios', detalle: `Tiene ${f.monomios.length}; el DS 011-79-VC permite hasta 8.`, evidencias: ev });
    for (const m of f.monomios.filter((x) => x.coeficiente < 0.05))
      out.push({ verificador: 'X-FORMULA', resultado: 'falla', severidad: 'media', titulo: `La fórmula de reajuste tiene un término demasiado pequeño (${m.simbolo} = ${m.coeficiente})`, detalle: `Coeficiente ${m.coeficiente}. El DS 011-79-VC exige agruparlo con otro hasta llegar al mínimo.`, evidencias: ev });
  }
  if (formulas.length > 1) {
    const firma = (f: Formula) => f.monomios.map((m) => `${m.simbolo}:${m.coeficiente}`).sort().join('|');
    const distintas = new Set(formulas.map(firma));
    if (distintas.size > 1)
      out.push({ verificador: 'X-FORMULA', resultado: 'falla', severidad: 'alta', titulo: 'La fórmula polinómica cambia entre documentos',
        detalle: `Aparecen ${distintas.size} versiones distintas de la fórmula en el expediente (como en el caso de la Av. Jaime Blanco). Debe quedar una sola.`,
        evidencias: formulas.map((f) => ({ documento: 'Fórmula polinómica', pagina: f.pagina, extracto: f.extracto })) });
  }
  return out;
}

/** Fases constructivas en orden. Una actividad de fase posterior no debería empezar antes que una de fase anterior del mismo elemento. */
const FASES: [number, RegExp][] = [
  [0, /OBRAS? PROVISIONAL|TRABAJOS PRELIMINARES|MOVILIZACION|CARTEL|TRAZO/],
  [1, /DEMOLICION|CORTE|EXCAVACION|MOVIMIENTO DE TIERRAS|ROTURA|DESMONTAJE/],
  [2, /RELLENO|PERFILADO|SUBRASANTE|COMPACTACION|BASE|SUB ?BASE|AFIRMADO|SOLADO/],
  [3, /CONCRETO|ENCOFRADO|ACERO|MURO|ALBANILERIA|SARDINEL|LOSA|CIMIENTO|COLUMNA|VIGA|IMPRIMACION|CARPETA|PAVIMENTO/],
  [4, /TARRAJEO|REVOQUE|PISO|PORCELANATO|CERAMICO|ACABADO|PINTURA|SENALIZACION|DEMARCACION|CARPINTERIA|VIDRIO/],
  [5, /LIMPIEZA FINAL|ENTREGA/],
];
const fase = (desc: string) => FASES.find(([, re]) => re.test(normalizar(desc)))?.[0];

/** Precedencias constructivas explícitas entre elementos distintos: [lo que va antes, lo que va después]. */
const PRECEDENCIAS: [RegExp, RegExp][] = [
  [/CARPETA|PAVIMENTO|LOSA DE RODADURA/, /PINTURA DE TRAFICO|DEMARCACION|SENALIZACION HORIZONTAL/],
  [/IMPRIMACION/, /CARPETA/],
  [/BASE (GRANULAR|DE MATERIAL GRANULAR)|SUB ?BASE/, /IMPRIMACION/],
  [/MURO|ALBANILERIA/, /PORCELANATO|CERAMICO|TARRAJEO|REVOQUE|PINTURA DE MUROS/],
  [/COLUMNA|VIGA|LOSA ALIGERADA|TECHO/, /PISO|PORCELANATO|CARPINTERIA/],
];

/** X-CRONOGRAMA: secuencia constructiva lógica (Curgos: porcelanato programado antes que los muros). */
export function secuenciaCronograma(acts: ActividadCronograma[], plazoDias?: number): Deteccion[] {
  if (!acts.length) return [{ verificador: 'X-CRONOGRAMA', resultado: 'no_verificable', severidad: 'baja', titulo: 'El cronograma no tiene fechas legibles', detalle: 'Sin fechas de inicio y fin no se puede revisar la secuencia ni la temporada de lluvias.', evidencias: [] }];
  const out: Deteccion[] = [];
  const reportadas = new Set<string>();
  const reportar = (antes: ActividadCronograma, despues: ActividadCronograma) => {
    if (reportadas.has(despues.descripcion)) return;
    reportadas.add(despues.descripcion);
    out.push({ verificador: 'X-CRONOGRAMA', resultado: 'falla', severidad: 'media', titulo: 'Secuencia constructiva imposible en el cronograma',
      detalle: `"${despues.descripcion}" empieza el ${fmt(despues.inicio)}, antes que "${antes.descripcion}" (${fmt(antes.inicio)}), que debe ejecutarse primero.`,
      evidencias: [{ documento: 'Cronograma', pagina: despues.pagina, extracto: despues.extracto }, { documento: 'Cronograma', pagina: antes.pagina, extracto: antes.extracto }] });
  };
  // 1) Dentro de un mismo elemento (vereda, sardinel, losa...): excavar → base → concreto → acabado
  const conFase = acts.map((a) => ({ a, f: fase(a.descripcion), k: claves(a.descripcion) })).filter((x) => x.f != null && x.f > 0 && x.f < 5);
  for (const x of conFase) for (const y of conFase) {
    if (y.f! > x.f! && [...x.k].some((w) => y.k.has(w)) && y.a.inicio < x.a.inicio) reportar(x.a, y.a);
  }
  // 2) Precedencias explícitas entre elementos
  for (const [antes, despues] of PRECEDENCIAS) {
    const A = acts.filter((a) => antes.test(normalizar(a.descripcion)) && !despues.test(normalizar(a.descripcion)));
    const D = acts.filter((a) => despues.test(normalizar(a.descripcion)));
    if (!A.length) continue;
    const primeraA = A.reduce((m, a) => (a.inicio < m.inicio ? a : m));
    for (const d of D) if (d.inicio < primeraA.inicio) reportar(primeraA, d);
  }
  if (plazoDias) {
    const ini = Math.min(...acts.map((a) => +a.inicio));
    const fin = Math.max(...acts.map((a) => +a.fin));
    const dias = Math.round((fin - ini) / 86400000) + 1;
    if (Math.abs(dias - plazoDias) > 2)
      out.push({ verificador: 'X-CRONOGRAMA', resultado: 'falla', severidad: 'media', titulo: 'El cronograma no coincide con el plazo de ejecución',
        detalle: `El expediente declara ${plazoDias} días calendario, pero el cronograma abarca ${dias} días.`, evidencias: [{ documento: 'Cronograma', pagina: acts[0].pagina, extracto: acts[0].extracto }] });
  }
  return out;
}

/** X-IDENTIDAD: todos los documentos son de la misma obra (Chepén: se subió el estudio de suelos de otro proyecto). */
export function identidadDocumentos(principal: { cui?: string; nombre?: string }, docs: { documento: string; pagina: number; cui?: string; proyecto?: string }[]): Deteccion[] {
  const out: Deteccion[] = [];
  const palabras = (s: string) => new Set(normalizar(s).replace(/[^A-Z ]/g, ' ').split(' ').filter((w) => w.length > 4));
  const base = principal.nombre ? palabras(principal.nombre) : null;
  for (const d of docs) {
    if (principal.cui && d.cui && d.cui !== principal.cui) {
      out.push({ verificador: 'X-IDENTIDAD', resultado: 'falla', severidad: 'alta', titulo: `${d.documento} corresponde a otro CUI`,
        detalle: `El expediente es del CUI ${principal.cui}, pero ${d.documento.toLowerCase()} indica CUI ${d.cui}.`, evidencias: [{ documento: d.documento, pagina: d.pagina, extracto: `CUI ${d.cui}` }] });
    } else if (base && d.proyecto) {
      const p = palabras(d.proyecto);
      const comun = [...p].filter((w) => base.has(w)).length / Math.max(1, Math.min(p.size, base.size));
      if (comun < 0.4)
        out.push({ verificador: 'X-IDENTIDAD', resultado: 'falla', severidad: 'alta', titulo: `${d.documento} parece ser de otra obra`,
          detalle: `Su encabezado dice "${d.proyecto.slice(0, 140)}", que no coincide con el nombre del proyecto.`, evidencias: [{ documento: d.documento, pagina: d.pagina, extracto: d.proyecto.slice(0, 160) }] });
    }
  }
  return out;
}

// =====================================================================================
// Reglas nuevas (derivadas de los temas más observados por postores en La Libertad)
// =====================================================================================


const evA = (a: { pagina: number; extracto: string }) => ({ documento: 'Análisis de precios unitarios', pagina: a.pagina, extracto: a.extracto });
const sol = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** X-APU-PRES: el precio unitario del presupuesto es el costo del APU (Salaverry: S/ 52.63 en presupuesto distinto del APU). Y toda partida tiene APU. */
export function apuVsPresupuesto(p: Presupuesto, apus: Apu[]): Deteccion[] {
  if (!apus.length) return [];
  const out: Deteccion[] = [];
  const sinApu: string[] = [];
  for (const i of partidas(p)) {
    const a = apus.find((x) => x.codigo === i.codigo) ?? apus.find((x) => normalizar(x.descripcion) === normalizar(i.descripcion));
    if (!a) { sinApu.push(i.codigo); continue; }
    if (a.costoUnitario != null && i.precio != null && Math.abs(a.costoUnitario - i.precio) > 0.01) {
      const monto = Math.abs(a.costoUnitario - i.precio) * (i.metrado ?? 0);
      out.push({ verificador: 'X-APU-PRES', resultado: 'falla', severidad: monto > 1000 ? 'alta' : 'media', titulo: `«${corto(i.descripcion)}» (${i.codigo}) no tiene el precio que calcula su análisis de precios`,
        detalle: `"${i.descripcion}": el presupuesto usa ${sol(i.precio)} por ${i.unidad}, pero su APU calcula ${sol(a.costoUnitario)}. Con ${i.metrado} ${i.unidad}, la diferencia es ${sol(monto)}.`,
        evidencias: [evP(i), evA(a)], montoInvolucrado: monto });
    }
  }
  if (sinApu.length) out.push({ verificador: 'X-APU-PRES', resultado: 'falla', severidad: 'media', titulo: `${sinApu.length} partida(s) sin análisis de precios unitarios`,
    detalle: `No se encontró el APU de: ${sinApu.slice(0, 8).join(', ')}${sinApu.length > 8 ? '…' : ''}. Sin APU el precio no está sustentado.`, evidencias: [] });
  return out;
}

const AGREGADO = /ARENA|PIEDRA|GRAVA|HORMIGON|AFIRMADO|AGREGADO|MATERIAL GRANULAR|CONFITILLO/;

/** V-APU: cada APU suma bien, cada recurso cuadra y las cantidades son físicamente posibles. */
export function apuInterno(apus: Apu[]): Deteccion[] {
  const out: Deteccion[] = [];
  for (const a of apus) {
    if (!a.recursos.length) continue;
    // Suma de recursos = costo unitario
    const suma = redondear(a.recursos.reduce((s, r) => s + r.parcial, 0));
    if (a.costoUnitario != null && Math.abs(suma - a.costoUnitario) > Math.max(0.02, a.costoUnitario * 0.005))
      out.push({ verificador: 'V-APU-SUMA', resultado: 'falla', severidad: 'media', titulo: `El análisis de precios de «${corto(a.descripcion)}» (${a.codigo}) no suma`,
        detalle: `Sus recursos suman ${sol(suma)}, pero declara un costo unitario de ${sol(a.costoUnitario)}.`, evidencias: [evA(a)] });
    // Cantidad de mano de obra y equipo = cuadrilla × 8 h / rendimiento
    if (a.rendimiento && a.rendimiento > 0) {
      for (const r of a.recursos.filter((x) => (x.unidad === 'hh' || x.unidad === 'hm') && x.cuadrilla && x.cuadrilla > 0)) {
        const esperado = (r.cuadrilla! * 8) / a.rendimiento;
        if (Math.abs(esperado - r.cantidad) > Math.max(0.0015, esperado * 0.02)) {
          out.push({ verificador: 'V-APU-CUADRILLA', resultado: 'falla', severidad: 'media', titulo: `La mano de obra o equipo («${r.descripcion.toLowerCase()}») no cuadra con el rendimiento en el análisis de «${corto(a.descripcion)}» (${a.codigo})`,
            detalle: `Con cuadrilla ${r.cuadrilla} y rendimiento ${a.rendimiento} ${a.unidad}/día, corresponde ${redondear(esperado, 4)} ${r.unidad} por ${a.unidad}, pero el APU consigna ${r.cantidad}. El costo de mano de obra o equipo queda mal calculado.`,
            evidencias: [evA(a), { documento: 'Análisis de precios unitarios', pagina: a.pagina, extracto: r.extracto }] });
          break;
        }
      }
    }
    // Agregados por m³ de concreto, relleno o base: no pueden ser mucho menos que el volumen (Sarín: 0.044 y 0.2625 m³ por m³)
    if ((a.unidad === 'm3') && /CONCRETO|RELLENO|CAMA DE APOYO|BASE|AFIRMADO|SOLADO|SUB ?BASE/.test(normalizar(a.descripcion))) {
      const ag = a.recursos.filter((r) => r.unidad === 'm3' && AGREGADO.test(normalizar(r.descripcion)));
      const total = ag.reduce((s, r) => s + r.cantidad, 0);
      if (ag.length && total < 0.9)
        out.push({ verificador: 'V-APU-COEF', resultado: 'falla', severidad: 'alta', titulo: `Faltan materiales en el análisis de «${corto(a.descripcion)}» (${a.codigo})`,
          detalle: `"${a.descripcion}" se paga por m³, pero su APU solo considera ${redondear(total, 4)} m³ de agregados (${ag.map((r) => r.descripcion.toLowerCase() + ' ' + r.cantidad).join(', ')}) por cada m³. Un m³ de concreto o relleno requiere alrededor de 1 m³ o más de agregados.`,
          evidencias: [evA(a), ...ag.map((r) => ({ documento: 'Análisis de precios unitarios', pagina: a.pagina, extracto: r.extracto }))] });
    }
  }
  return out;
}

/** X-GG: el desagregado de gastos generales suma lo del presupuesto y cubre el plazo, no más (El Porvenir: un mes fuera del plazo; Pacanga: 7 meses en obra de 5). */
export function gastosGenerales(p: Presupuesto | undefined, g: GastosGenerales | null, plazoDias?: number): Deteccion[] {
  if (!g || !g.items.length) return [];
  const out: Deteccion[] = [];
  const ev = { documento: 'Desagregado de gastos generales', pagina: g.pagina, extracto: g.extracto ?? 'Total de gastos generales' };
  const suma = redondear(g.items.reduce((s, x) => s + x.parcial, 0));
  if (g.total != null && Math.abs(suma - g.total) > 1)
    out.push({ verificador: 'X-GG', resultado: 'falla', severidad: 'media', titulo: 'El desagregado de gastos generales no suma su total', detalle: `Las filas suman ${sol(suma)} y el total dice ${sol(g.total)}.`, evidencias: [ev] });
  const gg = p?.resumen.gastosGenerales?.monto;
  if (gg != null && g.total != null && Math.abs(gg - g.total) > 1)
    out.push({ verificador: 'X-GG', resultado: 'falla', severidad: 'alta', titulo: 'Los gastos generales del presupuesto no son los del desagregado',
      detalle: `El presupuesto aplica ${sol(gg)} de gastos generales, pero su desagregado suma ${sol(g.total)}.`, evidencias: [ev, { documento: 'Presupuesto', pagina: p!.resumen.gastosGenerales!.pagina, extracto: p!.resumen.gastosGenerales!.extracto }] });
  if (plazoDias) {
    const meses = plazoDias / 30;
    const personal = g.items.filter((x) => x.unidad.startsWith('mes') && x.tiempo > 0);
    const excede = personal.filter((x) => x.tiempo > meses + 0.25);
    if (excede.length)
      out.push({ verificador: 'X-GG', resultado: 'falla', severidad: 'media', titulo: 'Gastos generales calculados para más tiempo que el plazo',
        detalle: `El plazo es de ${plazoDias} días (${redondear(meses, 2)} meses), pero ${excede.map((x) => `"${x.descripcion}" se paga por ${x.tiempo} meses`).slice(0, 3).join('; ')}. La diferencia es ${sol(excede.reduce((s, x) => s + x.parcial * (1 - meses / x.tiempo), 0))}.`,
        evidencias: excede.slice(0, 3).map((x) => ({ documento: 'Desagregado de gastos generales', pagina: x.pagina, extracto: x.extracto })) });
  }
  return out;
}

/** X-ET-COBERTURA: toda partida presupuestada tiene su especificación técnica (Huanchaco: partidas sin especificaciones ni planos). */
export function coberturaEspecificaciones(p: Presupuesto, et: SeccionEt[]): Deteccion[] {
  if (!et.length) return [];
  const faltan = partidas(p).filter((i) => !et.some((s) => s.codigo === i.codigo || normalizar(s.titulo) === normalizar(i.descripcion)));
  if (!faltan.length) return [];
  return [{ verificador: 'X-ET-COBERTURA', resultado: 'falla', severidad: faltan.length > 3 ? 'alta' : 'media', titulo: `${faltan.length} partida(s) sin especificación técnica`,
    detalle: `No tienen especificación técnica: ${faltan.slice(0, 6).map((i) => `${i.codigo} "${i.descripcion}"`).join('; ')}${faltan.length > 6 ? '…' : ''}. Sin ella no está definido cómo se ejecuta, se controla ni se paga.`,
    evidencias: faltan.slice(0, 3).map(evP), montoInvolucrado: faltan.reduce((s, i) => s + i.parcial, 0) }];
}

/** D-PLANOS: planos mínimos por tipo de obra y planos que exigen las propias partidas (La Esperanza: plan de desvío sin plano). */
export function planosMinimos(p: Presupuesto | undefined, planos: Plano[], tipoObra: string): Deteccion[] {
  if (!planos.length) return [];
  const nombres = planos.map((x) => normalizar(x.codigo + ' ' + x.nombre));
  const hay = (re: RegExp) => nombres.some((n) => re.test(n));
  const req: [string, RegExp][] = tipoObra === 'pistas_veredas'
    ? [['ubicación', /UBICACION|LOCALIZACION/], ['topografía o perfil longitudinal', /TOPOGRAF|PERFIL/], ['secciones viales', /SECCION/], ['pavimentos y detalles', /PAVIMENTO|DETALLE/]]
    : [['ubicación', /UBICACION|LOCALIZACION/]];
  const texto = normalizar((p?.items ?? []).map((i) => i.descripcion).join(' '));
  if (/DESVIO/.test(texto)) req.push(['plan de desvío de tránsito', /DESVIO/]);
  if (/SENALIZACION|SENAL VERTICAL|PINTURA DE TRAFICO/.test(texto)) req.push(['señalización', /SENALIZACION/]);
  if (/DRENAJE|CUNETA|ALCANTARILLA/.test(texto)) req.push(['drenaje', /DRENAJE|CUNETA/]);
  const faltan = req.filter(([, re]) => !hay(re)).map(([n]) => n);
  if (!faltan.length) return [];
  return [{ verificador: 'D-PLANOS', resultado: 'falla', severidad: 'media', titulo: `Faltan planos: ${faltan.join(', ')}`,
    detalle: `El índice de planos no incluye ${faltan.join(', ')}, que la obra o sus propias partidas requieren. Sin esos planos, la partida no tiene sustento técnico ni se puede valorizar con certeza.`,
    evidencias: [{ documento: 'Índice de planos', pagina: planos[0].pagina, extracto: planos.map((x) => x.codigo).join(', ') }] }];
}

/** X-RENDIMIENTO: lo programado en el cronograma es posible con el rendimiento del APU (Jaime Blanco: 5,846 m² de base en 4 días). */
export function rendimientoCronograma(p: Presupuesto, apus: Apu[], acts: ActividadCronograma[]): Deteccion[] {
  if (!apus.length || !acts.length) return [];
  const out: Deteccion[] = [];
  for (const i of partidas(p)) {
    const a = apus.find((x) => x.codigo === i.codigo);
    const act = acts.find((x) => x.codigo === i.codigo);
    if (!a?.rendimiento || !act || !i.metrado || ['glb', 'est'].includes(i.unidad ?? '')) continue;
    const dias = Math.round((+act.fin - +act.inicio) / 86400000) + 1;
    const frentes = i.metrado / (a.rendimiento * dias);
    // Con maquinaria pesada no se multiplican los frentes como con peones: 3 equipos a la vez frente a 10 cuadrillas manuales
    const conMaquinaria = a.recursos.some((r) => r.unidad === 'hm' && (r.cuadrilla ?? 0) > 0 && !/VIBRADOR|MEZCLADORA|PLANCHA|HERRAMIENTA/.test(normalizar(r.descripcion)));
    const maxFrentes = conMaquinaria ? 3 : 10;
    if (frentes > maxFrentes)
      out.push({ verificador: 'X-RENDIMIENTO', resultado: 'falla', severidad: 'media', titulo: `No alcanza el tiempo programado para «${corto(i.descripcion)}» (${i.codigo})`,
        detalle: `"${i.descripcion}": el cronograma da ${dias} día(s) para ${i.metrado} ${i.unidad}, pero su APU rinde ${a.rendimiento} ${a.unidad ?? i.unidad}/día por cuadrilla. Harían falta ${Math.ceil(frentes)} ${conMaquinaria ? 'equipos' : 'cuadrillas'} trabajando a la vez (se consideran como máximo ${maxFrentes} para una obra de este tipo).`,
        evidencias: [{ documento: 'Cronograma', pagina: act.pagina, extracto: act.extracto }, evA(a)] });
  }
  return out;
}
