// Lectores de los demás documentos del expediente: metrados, especificaciones técnicas,
// cronograma, fórmula polinómica, cotizaciones y datos generales (carátula / memoria).
// Todos reciben páginas [{numero, lineas}] y devuelven datos con su página y extracto.

import { aNumero, normalizar } from './numeros';
import { espesorEnMetros } from './verificar-presupuesto';

type Pag = { numero: number; lineas: string[] };
const limpiar = (l: string) => l.replace(/\s*\|\s*/g, '   ').replace(/ /g, ' ').trimEnd();
const RE_CODIGO = /^\s*(\d{2,3}(?:\.\d{2,3}){0,6})\s+(.*)$/;

// ---------- Planilla / resumen de metrados ----------

export interface ItemMetrado { codigo: string; descripcion: string; unidad?: string; metrado?: number; pagina: number; extracto: string }

const UNIDAD = /\s(m|ml|m2|m3|km|und|un|u|pza|jgo|glb|gbl|est|kg|mes|dia|día|hh|hm|l|gal|pto|kit)\.?\s*$/i;

/** Lee "ITEM  DESCRIPCIÓN  UND  METRADO" (resumen de metrados). Toma el último número como metrado total. */
export function leerMetrados(paginas: Pag[]): ItemMetrado[] {
  const out: ItemMetrado[] = [];
  const vistos = new Set<string>();
  for (const pag of paginas) {
    for (const original of pag.lineas) {
      const l = limpiar(original);
      const m = l.match(RE_CODIGO);
      if (!m) continue;
      const nums = m[2].match(/(?:\s|^)(-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?)\s*$/);
      let resto = m[2];
      let metrado: number | undefined;
      if (nums && nums.index !== undefined) {
        metrado = aNumero(nums[1]);
        resto = m[2].slice(0, nums.index);
      }
      const u = resto.match(UNIDAD);
      const unidad = u ? u[1].toLowerCase() : undefined;
      const descripcion = (u && u.index !== undefined ? resto.slice(0, u.index) : resto).trim().replace(/\s{2,}/g, ' ');
      if (vistos.has(m[1])) continue;
      vistos.add(m[1]);
      out.push({ codigo: m[1], descripcion, unidad, metrado: unidad ? metrado : undefined, pagina: pag.numero, extracto: l.trim() });
    }
  }
  return out;
}

// ---------- Especificaciones técnicas ----------

export interface SeccionEt { codigo: string; titulo: string; unidadMedida?: string; espesor?: number; fc?: number; pagina: number; extracto: string; texto: string }

/** Divide las especificaciones por partida (encabezado con código) y extrae unidad de medida, espesor y f'c. */
export function leerEspecificaciones(paginas: Pag[]): SeccionEt[] {
  const out: SeccionEt[] = [];
  let actual: SeccionEt | null = null;
  for (const pag of paginas) {
    for (const original of pag.lineas) {
      const l = limpiar(original).trim();
      const m = l.match(RE_CODIGO);
      if (m && /^[A-ZÁÉÍÓÚÑ0-9"'(]/.test(m[2].trim()) && m[2].trim() === m[2].trim().toUpperCase()) {
        actual = { codigo: m[1], titulo: m[2].trim(), pagina: pag.numero, extracto: l, texto: m[2] };
        out.push(actual);
        const e = espesorEnMetros(m[2]);
        if (e) actual.espesor = e;
        continue;
      }
      if (!actual) continue;
      actual.texto += '\n' + l;
      const n = normalizar(l);
      const um = n.match(/UNIDAD DE MEDIDA\s*:?\s*(?:SERA\s+(?:EL|LA)\s+)?([A-Z0-9²³ ]{1,30})/);
      if (um && !actual.unidadMedida) actual.unidadMedida = normalizarUnidadEt(um[1]);
      const fc = n.match(/F'?\s*C\s*=\s*(\d{3})\s*KG/);
      if (fc && !actual.fc) actual.fc = Number(fc[1]);
      const e = espesorEnMetros(l);
      if (e && !actual.espesor) { actual.espesor = e; actual.extracto = l; actual.pagina = pag.numero; }
    }
  }
  return out;
}

function normalizarUnidadEt(s: string): string {
  const t = normalizar(s).replace(/[^A-Z0-9²³ ]/g, '').trim();
  if (/^(METRO CUBICO|M3|M³)/.test(t)) return 'm3';
  if (/^(METRO CUADRADO|M2|M²)/.test(t)) return 'm2';
  if (/^(METRO LINEAL|ML|METRO)\b/.test(t)) return 'm';
  if (/^(GLOBAL|GLB)/.test(t)) return 'glb';
  if (/^(UNIDAD|UND|U)\b/.test(t)) return 'und';
  if (/^(KILOGRAMO|KG)/.test(t)) return 'kg';
  return t.toLowerCase();
}

// ---------- Cronograma ----------

export interface ActividadCronograma { codigo?: string; descripcion: string; inicio: Date; fin: Date; pagina: number; extracto: string }

const fecha = (s: string) => {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[1])));
};

/** Lee filas con dos fechas: "01.02  EXCAVACIÓN ...  03/05/2027  10/05/2027" (formato de MS Project / S10). */
export function leerCronograma(paginas: Pag[]): ActividadCronograma[] {
  const out: ActividadCronograma[] = [];
  for (const pag of paginas) {
    for (const original of pag.lineas) {
      const l = limpiar(original).trim();
      const fechas = [...l.matchAll(/\d{1,2}\/\d{1,2}\/\d{2,4}/g)];
      if (fechas.length < 2) continue;
      const ini = fecha(fechas[fechas.length - 2][0]);
      const fin = fecha(fechas[fechas.length - 1][0]);
      if (!ini || !fin) continue;
      const antes = l.slice(0, fechas[fechas.length - 2].index).replace(/\s+\d+\s*(d[ií]as?|d)?\s*$/i, '').trim();
      const m = antes.match(RE_CODIGO);
      out.push({ codigo: m?.[1], descripcion: (m ? m[2] : antes).trim().replace(/\s{2,}/g, ' '), inicio: ini, fin, pagina: pag.numero, extracto: l });
    }
  }
  return out;
}

// ---------- Fórmula polinómica ----------

export interface Monomio { coeficiente: number; simbolo: string; extracto: string }
export interface Formula { monomios: Monomio[]; pagina: number; extracto: string }

/** Lee "K = 0.385*(Jr/Jo) + 0.120*(Mr/Mo) + ..." o tablas "MONOMIO  FACTOR  %  SÍMBOLO  ÍNDICE". */
export function leerFormulaPolinomica(paginas: Pag[]): Formula[] {
  const out: Formula[] = [];
  for (const pag of paginas) {
    const texto = pag.lineas.map(limpiar).join('\n');
    for (const m of texto.matchAll(/K\s*=\s*([^\n]+(?:\n\s*\+[^\n]+)*)/g)) {
      const expr = m[1];
      const monomios = [...expr.matchAll(/(0[.,]\d{2,4})\s*\*?\s*\(?\s*([A-Za-z]{1,6})\s*r?\s*\/\s*[A-Za-z]{1,6}\s*o?\s*\)?/g)]
        .map((x) => ({ coeficiente: aNumero(x[1]), simbolo: x[2], extracto: x[0] }));
      if (monomios.length) out.push({ monomios, pagina: pag.numero, extracto: ('K = ' + expr).replace(/\s+/g, ' ').slice(0, 200) });
    }
  }
  return out;
}

// ---------- Cotizaciones ----------

export interface Cotizacion { proveedor?: string; fecha: Date; pagina: number; extracto: string }

/** Detecta cotizaciones de proveedores con su fecha ("COTIZACIÓN N° ... Fecha: 20/05/2026"). */
export function leerCotizaciones(paginas: Pag[]): Cotizacion[] {
  const out: Cotizacion[] = [];
  for (const pag of paginas) {
    const lineas = pag.lineas.map(limpiar);
    if (!lineas.some((l) => /COTIZACI[OÓ]N|PROFORMA/i.test(l))) continue;
    for (const l of lineas) {
      if (!/fecha/i.test(l)) continue;
      const f = fecha(l);
      if (f) {
        const prov = lineas.find((x) => /(S\.?A\.?C\.?|E\.?I\.?R\.?L\.?|S\.?R\.?L\.?|S\.?A\.?)\s*$/i.test(x.trim()));
        out.push({ proveedor: prov?.trim(), fecha: f, pagina: pag.numero, extracto: l.trim() });
        break;
      }
    }
  }
  return out;
}

// ---------- Identidad del documento ----------

/** Busca el CUI y el nombre del proyecto declarados en las primeras líneas de una página. */
export function identidadPagina(p: Pag): { cui?: string; proyecto?: string } {
  const primeras = p.lineas.slice(0, 12).map(limpiar).join(' ');
  const cui = normalizar(primeras).match(/\b(?:CUI|CODIGO UNICO(?: DE INVERSIONES)?)\s*(?:N[°ºO]\.?)?\s*:?\s*(\d{7})\b/);
  const proy = primeras.match(/(?:PROYECTO|OBRA)\s*:\s*["“]?([^"”]{20,200})/i);
  // Solo cuenta como nombre de proyecto si lo parece (nomenclatura de Invierte.pe); evita tomar frases sueltas de las bases.
  const nombre = proy?.[1]?.trim();
  const pareceProyecto = !!nombre && /^(MEJORAMIENTO|CREACION|CONSTRUCCION|AMPLIACION|REHABILITACION|REPARACION|INSTALACION|RECUPERACION|RENOVACION|REMODELACION|MANTENIMIENTO)/.test(normalizar(nombre).replace(/^["'\s]+/, ''));
  return { cui: cui?.[1], proyecto: pareceProyecto ? nombre : undefined };
}

// ---------- Análisis de precios unitarios (formato S10) ----------

export interface RecursoApu { categoria: string; descripcion: string; unidad: string; cuadrilla?: number; cantidad: number; precio: number; parcial: number; extracto: string }
export interface Apu { codigo: string; descripcion: string; unidad?: string; rendimiento?: number; costoUnitario?: number; recursos: RecursoApu[]; pagina: number; extracto: string }

const CATEGORIAS_APU = /^(MANO DE OBRA|MATERIALES|EQUIPOS?( Y HERRAMIENTAS)?|SUBCONTRATOS?|SUB ?PARTIDAS)$/;

/**
 * Lee bloques "Partida <código> <descripción>" / "Rendimiento <und>/DIA <n> ... Costo unitario directo por : <und> <precio>"
 * seguidos de recursos "<código> <descripción> <und> [cuadrilla] <cantidad> <precio> <parcial>".
 */
export function leerApu(paginas: Pag[]): Apu[] {
  const out: Apu[] = [];
  let actual: Apu | null = null;
  let categoria = '';
  for (const pag of paginas) {
    for (const original of pag.lineas) {
      const l = limpiar(original).trim();
      const n = normalizar(l);
      const p = l.match(/^Partida\s+(\d{2,3}(?:\.\d{2,3}){0,6})\s+(.+)$/i);
      if (p) { actual = { codigo: p[1], descripcion: p[2].trim().replace(/\s{2,}/g, ' '), recursos: [], pagina: pag.numero, extracto: l }; out.push(actual); categoria = ''; continue; }
      if (!actual) continue;
      const rend = n.match(/^RENDIMIENTO\s+([A-Z0-9]+)\s*\/\s*DIA\s+([\d.,]+)/);
      if (rend) {
        actual.unidad = rend[1].toLowerCase();
        actual.rendimiento = aNumero(rend[2]);
        const cu = l.match(/Costo unitario directo por\s*:?\s*\S+\s+([\d.,]+)\s*$/i);
        if (cu) actual.costoUnitario = aNumero(cu[1]);
        continue;
      }
      if (CATEGORIAS_APU.test(n)) { categoria = n; continue; }
      const nums = l.match(/((?:\s+-?[\d,]*\.\d+|\s+-?\d+){3,4})\s*$/);
      if (!nums || nums.index === undefined || !categoria) continue;
      const valores = nums[1].trim().split(/\s+/).map(aNumero);
      const antes = l.slice(0, nums.index).trim();
      const u = antes.match(/\s([a-zA-Z%0-9]{1,5})\.?$/);
      if (!u) continue;
      const descripcion = antes.slice(0, u.index).replace(/^\d{6,}\s+/, '').trim().replace(/\s{2,}/g, ' ');
      const [cuadrilla, cantidad, precio, parcial] = valores.length === 4 ? valores : [undefined, ...valores];
      actual.recursos.push({ categoria, descripcion, unidad: u[1].toLowerCase(), cuadrilla, cantidad: cantidad!, precio: precio!, parcial: parcial!, extracto: l });
    }
  }
  return out;
}

// ---------- Desagregado de gastos generales ----------

export interface ItemGasto { descripcion: string; unidad: string; cantidad: number; tiempo: number; precio: number; parcial: number; pagina: number; extracto: string }
export interface GastosGenerales { items: ItemGasto[]; total?: number; pagina: number; extracto?: string }

/** Filas "<descripción> <und> <cantidad> <tiempo (meses)> <precio> <parcial>" y el total. */
export function leerGastosGenerales(paginas: Pag[]): GastosGenerales | null {
  if (!paginas.length) return null;
  const g: GastosGenerales = { items: [], pagina: paginas[0].numero };
  for (const pag of paginas) {
    for (const original of pag.lineas) {
      const l = limpiar(original).trim();
      const tot = normalizar(l).match(/^TOTAL (DE )?GASTOS GENERALES\b.*?([\d.,]+)\s*$/);
      if (tot) { g.total = aNumero(tot[2]); g.extracto = l; continue; }
      const m = l.match(/^(.+?)\s+([a-zA-Z]{2,5})\.?\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/);
      if (!m) continue;
      g.items.push({ descripcion: m[1].trim().replace(/\s{2,}/g, ' '), unidad: m[2].toLowerCase(), cantidad: aNumero(m[3]), tiempo: aNumero(m[4]), precio: aNumero(m[5]), parcial: aNumero(m[6]), pagina: pag.numero, extracto: l });
    }
  }
  return g;
}

// ---------- Índice de planos ----------

export interface Plano { codigo: string; nombre: string; pagina: number }

/** Filas "U-01  Ubicación y localización" o "LAMINA PV-01 ...". */
export function leerPlanos(paginas: Pag[]): Plano[] {
  const out: Plano[] = [];
  for (const pag of paginas) for (const original of pag.lineas) {
    const m = limpiar(original).trim().match(/^(?:L[AÁ]MINA\s+)?([A-Z]{1,4}-?\d{1,3}[A-Z]?)\s+(.{4,})$/i);
    if (m && !/^(INDICE|RELACION|LISTA)/i.test(m[2])) out.push({ codigo: m[1].toUpperCase(), nombre: m[2].trim(), pagina: pag.numero });
  }
  return out;
}
