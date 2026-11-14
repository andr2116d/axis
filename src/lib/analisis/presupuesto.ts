// Lector del PRESUPUESTO de obra.
// Funciona con el formato que exportan S10, Delphin y hojas de cálculo (el que se publica en el SEACE):
//   ITEM  DESCRIPCIÓN  UND.  METRADO  PRECIO  PARCIAL
// y con el resumen final (costo directo, gastos generales, utilidad, IGV, total y monto en letras).
// Acepta líneas de `pdftotext -layout` (columnas con varios espacios) o del navegador (celdas unidas con " | ").

import { aNumero, letrasANumero, normalizar } from './numeros';

export interface ItemPresupuesto {
  codigo: string;
  nivel: number;
  descripcion: string;
  /** Solo las partidas tienen unidad, metrado y precio; los títulos solo parcial. */
  unidad?: string;
  metrado?: number;
  precio?: number;
  parcial: number;
  esTitulo: boolean;
  pagina: number;
  extracto: string;
}

export interface ConceptoResumen {
  nombre: string;
  porcentaje?: number;
  monto: number;
  pagina: number;
  extracto: string;
}

export interface Presupuesto {
  nombreObra?: string;
  cui?: string;
  fechaCosto?: string;
  lugar?: string;
  items: ItemPresupuesto[];
  resumen: {
    costoDirecto?: ConceptoResumen;
    gastosGenerales?: ConceptoResumen;
    utilidad?: ConceptoResumen;
    subtotal?: ConceptoResumen;
    igv?: ConceptoResumen;
    total?: ConceptoResumen;
    supervision?: ConceptoResumen;
    totalInversion?: ConceptoResumen;
    otros: ConceptoResumen[];
  };
  enLetras?: { texto: string; valor: number; pagina: number };
  paginas: number[];
  /** 'baja' cuando el texto parece venir de un escaneo con OCR (números mal formados, unidades irreconocibles). */
  calidad: { nivel: 'buena' | 'baja'; partidasDudosas: number; motivo?: string };
}

/** Unidades de medida habituales en presupuestos peruanos (en minúsculas, sin punto final). */
const UNIDADES = [
  'm', 'ml', 'm2', 'm3', 'm3k', 'km', 'und', 'un', 'u', 'unid', 'pza', 'pz', 'jgo', 'juego', 'glb', 'gbl', 'gl', 'est', 'kg', 'tn', 't', 'lb',
  'mes', 'meses', 'dia', 'día', 'sem', 'hh', 'hm', 'h', 'hr', 'l', 'lt', 'gal', 'p2', 'pt', 'pto', 'rll', 'bls', 'bol', 'var', 'mll', 'cjto', 'cto', 'm3-km', 'm3xkm', 'kit',
];
const ALT_UNIDADES = UNIDADES.map((u) => u.replace('.', '\\.')).sort((a, b) => b.length - a.length).join('|');
/** Unidad separada por espacios: "...PAVIMENTACIÓN   m2" (cualquier mayúscula/minúscula). */
const RE_UNIDAD_SEPARADA = new RegExp(`\\s(${ALT_UNIDADES})\\.?$`, 'i');
/** Unidad pegada a la descripción en mayúsculas: "...SUMERGIDOm3" (solo unidad en minúsculas). */
const RE_UNIDAD_PEGADA = new RegExp(`(?<=[A-ZÁÉÍÓÚÑ")])(${ALT_UNIDADES})\\.?$`);
const RE_CODIGO = /^(\d{2,3}(?:\.\d{2,3}){0,6})\s+(.*)$/;
const RE_NUM = /-?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|-?\d+(?:[.,]\d+)?/;
// Hasta 8 números al final: los presupuestos «desagregados» agregan columnas de mano de obra, materiales, equipos…
const RE_NUMS_FINALES = new RegExp(`((?:\\s+(?:${RE_NUM.source})){1,8})\\s*$`);

const limpiar = (l: string) => l.replace(/\s*\|\s*/g, '   ').replace(/ /g, ' ').replace(/\s+$/, '');

function separarNumeros(linea: string): { resto: string; numeros: number[] } {
  const m = (' ' + linea).match(RE_NUMS_FINALES);
  if (!m) return { resto: linea.trim(), numeros: [] };
  const numeros = m[1].trim().split(/\s+/).map(aNumero);
  const resto = (' ' + linea).slice(0, m.index).trim();
  return { resto, numeros };
}

/**
 * Metrado, precio y parcial de una partida. Formato normal: los 3 últimos números. Formato desagregado: el primero y el
 * segundo (metrado y precio) y el último (parcial), con columnas de costos en medio. Se acepta la lectura en la que
 * metrado × precio = parcial (±1%).
 */
function ternaPartida(n: number[]): [number, number, number] | null {
  const cuadra = (m: number, pr: number, pa: number) => Math.abs(m * pr - pa) <= Math.max(0.05, Math.abs(pa) * 0.01);
  if (n.length < 3) return null;
  const [a, b, c] = n.slice(-3);
  if (n.length === 3) return [a, b, c];
  if (cuadra(a, b, c)) return [a, b, c];
  if (cuadra(n[0], n[1], n[n.length - 1])) return [n[0], n[1], n[n.length - 1]];
  return null;
}

function separarUnidad(resto: string): { descripcion: string; unidad?: string } {
  const r = resto.trimEnd();
  const m = r.match(RE_UNIDAD_SEPARADA) ?? r.match(RE_UNIDAD_PEGADA);
  if (!m || m.index === undefined) return { descripcion: r.trim().replace(/\s{2,}/g, ' ') };
  const descripcion = r.slice(0, m.index).trim();
  if (!descripcion) return { descripcion: r.trim() };
  return { descripcion: descripcion.replace(/\s{2,}/g, ' '), unidad: m[1].toLowerCase() };
}

const RESUMEN: [keyof Omit<Presupuesto['resumen'], 'otros'>, RegExp][] = [
  ['costoDirecto', /^COSTO DIRECTO\b/],
  ['gastosGenerales', /^GASTOS? GENERALES?\b/],
  ['utilidad', /^UTILIDAD(ES)?\b/],
  ['subtotal', /^SUB ?-?TOTAL\b/],
  ['igv', /^(IGV|I\.G\.V\.?|IMPUESTO GENERAL)/],
  ['totalInversion', /^(PRESUPUESTO|COSTO) TOTAL( DE (LA )?INVERSION| DEL PROYECTO)\b/],
  ['supervision', /^SUPERVISION\b/],
  ['total', /^(PRESUPUESTO (DE OBRA|TOTAL|BASE)|VALOR REFERENCIAL|TOTAL PRESUPUESTO|COSTO TOTAL( DE OBRA)?|TOTAL( GENERAL)?)\b/],
];

/**
 * Lee el presupuesto a partir de las páginas que lo contienen.
 * `paginas`: [{numero, lineas}] tal como llegan del lector de PDF.
 */
export function leerPresupuesto(paginas: { numero: number; lineas: string[] }[]): Presupuesto {
  const p: Presupuesto = { items: [], resumen: { otros: [] }, paginas: paginas.map((x) => x.numero), calidad: { nivel: 'buena', partidasDudosas: 0 } };
  let dudosas = 0;
  const vistos = new Set<string>();
  let pendiente: { codigo: string; descripcion: string; unidad?: string; pagina: number; extracto: string } | null = null;

  for (const pag of paginas) {
    for (let i = 0; i < pag.lineas.length; i++) {
      const original = pag.lineas[i];
      const linea = limpiar(original);
      const n = normalizar(linea);
      if (!n) continue;

      // Cabecera
      const cui = n.match(/\bCUI\s*:?\s*N?°?\s*(\d{6,7})\b/);
      if (cui && !p.cui) p.cui = cui[1];
      const fecha = linea.match(/Costo al\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
      if (fecha && !p.fechaCosto) p.fechaCosto = fecha[1];
      if (/^PRESUPUESTO\s+\d{5,}/.test(n) && !p.nombreObra) {
        let nombre = linea.replace(/^\s*Presupuesto\s+\d+\s+/i, '').trim();
        const sig = pag.lineas[i + 1] ? limpiar(pag.lineas[i + 1]).trim() : '';
        if (sig && !/^(Cliente|Lugar|Item|Subpresupuesto)/i.test(sig)) nombre += ' ' + sig;
        p.nombreObra = nombre.replace(/\s+/g, ' ');
      }
      if (/^LUGAR\s/.test(n) && !p.lugar) p.lugar = linea.replace(/^\s*Lugar\s+/i, '').replace(/\s{2,}.*/, '').trim();

      // Monto en letras
      if (/^SON\s*:/.test(n)) {
        let texto = linea.replace(/^\s*SON\s*:\s*/i, '').trim();
        // Los céntimos a veces quedan en la línea siguiente ("... Y" / "07/100 SOLES")
        const sig = pag.lineas[i + 1] ? limpiar(pag.lineas[i + 1]).trim() : '';
        if (!/\/\s*100/.test(texto) && /^\d{1,2}\s*\/\s*100/.test(sig)) texto += ' ' + sig;
        const valor = letrasANumero(texto);
        p.enLetras = { texto, valor, pagina: pag.numero };
        continue;
      }

      // Resumen (sin código de ítem)
      if (!RE_CODIGO.test(linea.trim())) {
        const { resto, numeros } = separarNumeros(linea);
        const r = normalizar(resto);
        if (numeros.length >= 1 && r) {
          for (const [clave, re] of RESUMEN) {
            if (re.test(r)) {
              const pct = r.match(/\(?\s*(\d+(?:[.,]\d+)?)\s*%\s*\)?/);
              const c: ConceptoResumen = { nombre: resto.trim(), porcentaje: pct ? aNumero(pct[1]) : undefined, monto: numeros[numeros.length - 1], pagina: pag.numero, extracto: linea.trim() };
              if (!p.resumen[clave]) p.resumen[clave] = c;
              else p.resumen.otros.push(c);
              break;
            }
          }
        }
        // Continuación de una partida partida en dos líneas: "DESCRIPCIÓN   metrado precio parcial"
        if (pendiente && numeros.length === 3 && !RESUMEN.some(([, re]) => re.test(r))) {
          const { descripcion, unidad } = separarUnidad(resto);
          agregar({ ...pendiente, descripcion: (pendiente.descripcion + ' ' + descripcion).trim(), unidad: pendiente.unidad ?? unidad, numeros, extracto: pendiente.extracto + ' / ' + linea.trim() });
          pendiente = null;
        }
        continue;
      }

      const m = linea.trim().match(RE_CODIGO)!;
      const codigo = m[1];
      const { resto, numeros } = separarNumeros(m[2]);
      if (numeros.length === 0) {
        // Ítem sin números: título vacío o partida que sigue en la línea siguiente
        const soloUnidad = resto.trim().match(new RegExp(`^(${ALT_UNIDADES})\\.?$`, 'i'));
        const { descripcion, unidad } = soloUnidad ? { descripcion: '', unidad: soloUnidad[1].toLowerCase() } : separarUnidad(resto);
        pendiente = { codigo, descripcion, unidad, pagina: pag.numero, extracto: linea.trim() };
        continue;
      }
      pendiente = null;
      // Un título (un solo número) conserva su descripción completa; solo las partidas llevan unidad.
      const { descripcion, unidad } = numeros.length >= 3 ? separarUnidad(resto) : { descripcion: resto.trim().replace(/\s{2,}/g, ' '), unidad: undefined };
      agregar({ codigo, descripcion, unidad, numeros, pagina: pag.numero, extracto: linea.trim() });
    }
  }

  function agregar(x: { codigo: string; descripcion: string; unidad?: string; numeros: number[]; pagina: number; extracto: string }) {
    if (vistos.has(x.codigo)) return; // los títulos se repiten en cada página
    // Señales de OCR: números con letras o separadores imposibles, o partidas sin unidad reconocible
    if (/\d[A-Za-z]\d|\d[.,]\d{3}[.,]\d{3}[.,]|\d[.,]\d{1}\s|S\/\.\d/.test(x.extracto) || x.numeros.some((v) => Number.isNaN(v)) || (x.numeros.length === 3 && !x.unidad) || (x.numeros.length > 3 && x.unidad && !ternaPartida(x.numeros))) dudosas++;
    vistos.add(x.codigo);
    const nivel = x.codigo.split('.').length;
    const terna = ternaPartida(x.numeros);
    if (x.numeros.length >= 3 && x.unidad && terna) {
      const [metrado, precio, parcial] = terna;
      p.items.push({ codigo: x.codigo, nivel, descripcion: x.descripcion, unidad: x.unidad, metrado, precio, parcial, esTitulo: false, pagina: x.pagina, extracto: x.extracto });
    } else if (x.numeros.length === 3 || (x.numeros.length > 3 && x.unidad)) {
      // Tres números sin unidad reconocible (o columnas que no cuadran): partida con unidad desconocida
      const [metrado, precio, parcial] = terna ?? x.numeros.slice(-3);
      p.items.push({ codigo: x.codigo, nivel, descripcion: x.descripcion, unidad: x.unidad ?? '?', metrado, precio, parcial, esTitulo: false, pagina: x.pagina, extracto: x.extracto });
    } else {
      p.items.push({ codigo: x.codigo, nivel, descripcion: x.descripcion, parcial: x.numeros[x.numeros.length - 1], esTitulo: true, pagina: x.pagina, extracto: x.extracto });
    }
  }

  const n = p.items.filter((i) => !i.esTitulo).length;
  p.calidad = { nivel: n && dudosas / n > 0.08 ? 'baja' : 'buena', partidasDudosas: dudosas,
    motivo: n && dudosas / n > 0.08 ? `${dudosas} de ${n} partidas tienen números o unidades ilegibles (texto de escaneo con OCR)` : undefined };
  return p;
}

/** Hijos directos de un título. */
export function hijos(p: Presupuesto, codigo: string): ItemPresupuesto[] {
  const nivel = codigo.split('.').length;
  return p.items.filter((i) => i.codigo.startsWith(codigo + '.') && i.nivel === nivel + 1);
}

export const partidas = (p: Presupuesto) => p.items.filter((i) => !i.esTitulo);
