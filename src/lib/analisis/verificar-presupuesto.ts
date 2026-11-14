// Verificadores que trabajan solo con el presupuesto.
// Cada uno es una regla general derivada de errores reales observados en licitaciones de La Libertad.

import { difRel, normalizar, redondear } from './numeros';
import { hijos, partidas, type ItemPresupuesto, type Presupuesto } from './presupuesto';
import type { Deteccion } from './tipos-analisis';

const DOC = 'Presupuesto';
const soles = (n: number) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ev = (i: { pagina: number; extracto: string }) => ({ documento: DOC, pagina: i.pagina, extracto: i.extracto });

/** V-ARIT-PARTIDA: parcial = metrado × precio unitario. */
export function aritmeticaPartidas(p: Presupuesto): Deteccion[] {
  const out: Deteccion[] = [];
  for (const i of partidas(p)) {
    if (i.metrado == null || i.precio == null) continue;
    const esperado = redondear(i.metrado * i.precio);
    const tol = Math.max(0.06, esperado * 0.001);
    if (Math.abs(esperado - i.parcial) > tol) {
      out.push({
        verificador: 'V-ARIT-PARTIDA', resultado: 'falla', severidad: Math.abs(esperado - i.parcial) > 1000 ? 'alta' : 'media',
        titulo: `«${i.descripcion.toLowerCase().slice(0, 48)}» (${i.codigo}): metrado por precio no da el parcial`,
        detalle: `${i.descripcion}: ${i.metrado} ${i.unidad} × ${soles(i.precio)} = ${soles(esperado)}, pero el presupuesto consigna ${soles(i.parcial)}.`,
        evidencias: [ev(i)], montoInvolucrado: Math.abs(esperado - i.parcial),
      });
    }
  }
  return out;
}

/**
 * V-ARIT-TITULO: cada título suma exactamente todas las partidas que contiene (a cualquier profundidad).
 * Se compara contra las partidas (hojas) y no contra los subtítulos, para que un subtotal mal escrito
 * se reporte una sola vez, en el título que realmente está mal.
 */
export function aritmeticaTitulos(p: Presupuesto): Deteccion[] {
  const out: Deteccion[] = [];
  for (const t of p.items.filter((x) => x.esTitulo)) {
    const hojas = p.items.filter((i) => !i.esTitulo && i.codigo.startsWith(t.codigo + '.'));
    if (!hojas.length) continue;
    const suma = redondear(hojas.reduce((s, x) => s + x.parcial, 0));
    if (Math.abs(suma - t.parcial) > Math.max(0.1, t.parcial * 0.0005)) {
      const omitidos = hijos(p, t.codigo).filter((h) => h.esTitulo && Math.abs(h.parcial - Math.abs(suma - t.parcial)) < 0.1);
      out.push({
        verificador: 'V-ARIT-TITULO', resultado: 'falla', severidad: 'media',
        titulo: `El subtotal ${t.codigo} no es la suma de sus partidas`,
        detalle: `"${t.descripcion}" declara ${soles(t.parcial)}, pero sus ${hojas.length} partidas suman ${soles(suma)} (diferencia ${soles(Math.abs(suma - t.parcial))}).` +
          (omitidos.length ? ` La diferencia es exactamente el subtítulo ${omitidos[0].codigo} "${omitidos[0].descripcion}", que no se sumó.` : ''),
        evidencias: [ev(t), ...omitidos.map(ev)], montoInvolucrado: Math.abs(suma - t.parcial),
      });
    }
  }
  return out;
}

/** V-RESUMEN: costo directo, gastos generales, utilidad, IGV y total son coherentes. */
export function resumen(p: Presupuesto): Deteccion[] {
  const r = p.resumen;
  const out: Deteccion[] = [];
  const falla = (titulo: string, detalle: string, c: { pagina: number; extracto: string }, monto?: number, severidad: 'alta' | 'media' = 'alta') =>
    out.push({ verificador: 'V-RESUMEN', resultado: 'falla', severidad, titulo, detalle, evidencias: [ev(c)], montoInvolucrado: monto });

  // Se compara con la suma de las partidas: si un subtotal está mal escrito, eso lo reporta V-ARIT-TITULO una sola vez.
  const hojas = partidas(p);
  if (r.costoDirecto && hojas.length) {
    const suma = redondear(hojas.reduce((s, x) => s + x.parcial, 0));
    if (Math.abs(suma - r.costoDirecto.monto) > Math.max(1, suma * 0.0005))
      falla('El costo directo no coincide con la suma de las partidas', `Las ${hojas.length} partidas suman ${soles(suma)}, pero el costo directo dice ${soles(r.costoDirecto.monto)}.`, r.costoDirecto, Math.abs(suma - r.costoDirecto.monto));
  }
  for (const c of [r.gastosGenerales, r.utilidad]) {
    if (c && c.porcentaje != null && r.costoDirecto) {
      const esperado = redondear((r.costoDirecto.monto * c.porcentaje) / 100);
      if (Math.abs(esperado - c.monto) > Math.max(1, esperado * 0.001))
        falla(`${c.nombre} no corresponde a su porcentaje`, `${c.porcentaje}% de ${soles(r.costoDirecto.monto)} es ${soles(esperado)}, pero se consigna ${soles(c.monto)}.`, c, Math.abs(esperado - c.monto));
    }
  }
  if (r.subtotal && r.costoDirecto) {
    const esperado = redondear(r.costoDirecto.monto + (r.gastosGenerales?.monto ?? 0) + (r.utilidad?.monto ?? 0));
    if (Math.abs(esperado - r.subtotal.monto) > 1)
      falla('El subtotal no suma costo directo, gastos generales y utilidad', `Debería ser ${soles(esperado)} y figura ${soles(r.subtotal.monto)}.`, r.subtotal, Math.abs(esperado - r.subtotal.monto));
  }
  if (r.igv) {
    if (r.igv.porcentaje != null && r.igv.porcentaje !== 18)
      falla('Tasa de IGV distinta de 18%', `El presupuesto aplica ${r.igv.porcentaje}% de IGV.`, r.igv, undefined, 'media');
    const base = r.subtotal?.monto;
    if (base != null) {
      const esperado = redondear(base * 0.18);
      if (Math.abs(esperado - r.igv.monto) > Math.max(1, esperado * 0.001))
        falla('El IGV no es el 18% del subtotal', `18% de ${soles(base)} es ${soles(esperado)}, pero se consigna ${soles(r.igv.monto)}.`, r.igv, Math.abs(esperado - r.igv.monto));
    }
  }
  if (r.total && r.subtotal && r.igv) {
    const esperado = redondear(r.subtotal.monto + r.igv.monto);
    if (Math.abs(esperado - r.total.monto) > 1)
      falla('El total del presupuesto no suma subtotal e IGV', `Debería ser ${soles(esperado)} y figura ${soles(r.total.monto)}.`, r.total, Math.abs(esperado - r.total.monto));
  }
  return out;
}

/** V-LETRAS: el monto escrito en letras coincide con algún total en números. */
export function montoEnLetras(p: Presupuesto): Deteccion[] {
  if (!p.enLetras) return [];
  const candidatos = [p.resumen.total, p.resumen.totalInversion, ...p.resumen.otros].filter(Boolean).map((c) => c!.monto);
  if (!candidatos.length) return [];
  if (Number.isNaN(p.enLetras.valor))
    return [{ verificador: 'V-LETRAS', resultado: 'no_verificable', severidad: 'baja', titulo: 'No se pudo interpretar el monto en letras', detalle: p.enLetras.texto, evidencias: [{ documento: DOC, pagina: p.enLetras.pagina, extracto: 'SON: ' + p.enLetras.texto }] }];
  if (candidatos.some((c) => Math.abs(c - p.enLetras!.valor) < 0.01)) return [];
  const cercano = candidatos.reduce((a, b) => (Math.abs(b - p.enLetras!.valor) < Math.abs(a - p.enLetras!.valor) ? b : a));
  return [{
    verificador: 'V-LETRAS', resultado: 'falla', severidad: 'alta',
    titulo: 'El monto en letras no coincide con el monto en números',
    detalle: `En letras dice ${soles(p.enLetras.valor)} ("${p.enLetras.texto}"), pero el total en números es ${soles(cercano)}. La diferencia es ${soles(Math.abs(cercano - p.enLetras.valor))}.`,
    evidencias: [{ documento: DOC, pagina: p.enLetras.pagina, extracto: 'SON: ' + p.enLetras.texto }],
    montoInvolucrado: Math.abs(cercano - p.enLetras.valor),
  }];
}

/** V-GLOBAL: una partida "global" o "estimado" debe tener metrado 1. */
export function unidadGlobal(p: Presupuesto): Deteccion[] {
  return partidas(p)
    .filter((i) => ['glb', 'gbl', 'gl', 'est'].includes(i.unidad ?? '') && i.metrado != null && Math.abs(i.metrado - 1) > 1e-6)
    .map((i) => ({
      verificador: 'V-GLOBAL', resultado: 'falla' as const, severidad: 'baja' as const,
      titulo: `«${i.descripcion.toLowerCase().slice(0, 48)}» está en unidad global pero con cantidad ${i.metrado}`,
      detalle: `"${i.descripcion}" está en unidad ${i.unidad} pero tiene metrado ${i.metrado}. Una unidad global no se mide en cantidades: o la unidad es otra (und, mes, m²) o el metrado debe ser 1 con el precio total.`,
      evidencias: [ev(i)], montoInvolucrado: i.parcial,
    }));
}

// ---------- Geometría: volumen = área × espesor ----------

/** Extrae espesor/altura en metros de la descripción: "e=0.10m", "E=15CM", "H=20CM", "e = 0.10 m", 'E=2"'. */
export function espesorEnMetros(desc: string): number | null {
  const n = normalizar(desc);
  const m = n.match(/\b(?:E|H|ESP(?:ESOR)?)\s*=\s*(\d+(?:[.,]\d+)?)\s*(CM|MM|M|")?/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  const u = m[2] ?? (v < 1 ? 'M' : 'CM');
  return u === 'CM' ? v / 100 : u === 'MM' ? v / 1000 : u === '"' ? v * 0.0254 : v;
}

/** Sección transversal "0.15X0.40" en metros (ancho × alto). */
export function seccionEnMetros(desc: string): [number, number] | null {
  const m = normalizar(desc).match(/\b(0[.,]\d+)\s*X\s*(0[.,]\d+)\b/);
  return m ? [Number(m[1].replace(',', '.')), Number(m[2].replace(',', '.'))] : null;
}

const moda = (xs: number[]) => {
  const c = new Map<number, number>();
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
};

const VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'EN', 'CON', 'Y', 'PARA', 'POR', 'A', 'AL', 'E', 'H', 'M', 'CM', 'CONCRETO', 'INCL', 'ADITIVO', 'MAQUINARIA', 'MANUAL', 'MATERIAL', 'PRODUCTO', 'FC', 'KG', 'CM2', 'NIVEL']);
/** Sustantivos significativos de una descripción, en singular aproximado (VEREDAS → VEREDA). */
export function claves(desc: string): Set<string> {
  return new Set(
    normalizar(desc).replace(/[^A-Z ]/g, ' ').split(' ')
      .filter((w) => w.length > 3 && !VACIAS.has(w))
      .map((w) => w.replace(/(ES|S)$/, '')),
  );
}
const comparten = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/** V-GEOMETRIA: el volumen (m³) de un elemento debe ser su área × espesor, o su sección × longitud. */
export function geometria(p: Presupuesto): Deteccion[] {
  const out: Deteccion[] = [];
  for (const t of p.items.filter((x) => x.esTitulo)) {
    const h = hijos(p, t.codigo).filter((x) => !x.esTitulo);
    for (const i of h.filter((x) => x.unidad === 'm3' && x.metrado)) {
      // Solo se compara con partidas que hablan del mismo elemento (vereda, sardinel, martillo, losa...)
      const k = claves(i.descripcion);
      const mismas = h.filter((x) => x !== i && comparten(k, claves(x.descripcion)));
      const areas = mismas.filter((x) => x.unidad === 'm2' && x.metrado && !/ENCOFRADO/.test(normalizar(x.descripcion))).map((x) => x.metrado!);
      // Las juntas se miden por su propia longitud (cortes cada cierto tramo), no por la del elemento
      const longitudes = mismas.filter((x) => (x.unidad === 'm' || x.unidad === 'ml') && x.metrado && !/JUNTA/.test(normalizar(x.descripcion))).map((x) => x.metrado!);
      const nd = normalizar(i.descripcion);
      // Sección explícita "0.15X0.40" o alto y espesor juntos "(H=0.50 M, E=0.15 M)"
      const hMatch = nd.match(/\bH\s*=\s*(\d+(?:[.,]\d+)?)\s*(CM|M)?/);
      const e = espesorEnMetros(i.descripcion);
      const alto = hMatch ? Number(hMatch[1].replace(',', '.')) / (hMatch[2] === 'CM' || (!hMatch[2] && Number(hMatch[1]) >= 1) ? 100 : 1) : null;
      const eMatch = nd.match(/\bE\s*=\s*(\d+(?:[.,]\d+)?)\s*(CM|M)?/);
      const esp = eMatch ? Number(eMatch[1].replace(',', '.')) / (eMatch[2] === 'CM' || (!eMatch[2] && Number(eMatch[1]) >= 1) ? 100 : 1) : null;
      const sec = seccionEnMetros(i.descripcion) ?? (alto && esp ? ([esp, alto] as [number, number]) : null);
      // En elementos lineales o verticales, las áreas de encofrado o curado son caras, no área en planta
      const lineal = /SARDINEL|MURO|VIGA|COLUMNA|ZAPATA|CIMIENTO|PEDESTAL|DADO|CUNETA|BORDILLO/.test(nd);
      let esperado: number | null = null;
      let base = '';
      if (sec && longitudes.length) {
        const L = moda(longitudes)!;
        esperado = sec[0] * sec[1] * L;
        base = `sección ${sec[0]}×${sec[1]} m × ${L} m`;
      } else if (sec) {
        continue; // sección conocida pero sin longitud del mismo elemento: no hay con qué comparar
      } else if (e && areas.length >= 1 && !lineal) {
        const A = moda(areas)!;
        esperado = A * e;
        base = `${A} m² × ${e} m`;
      }
      if (esperado == null || esperado <= 0) continue;
      const d = difRel(esperado, i.metrado!);
      if (d > 0.05) {
        out.push({
          verificador: 'V-GEOMETRIA', resultado: 'falla', severidad: d > 0.25 ? 'alta' : 'media',
          titulo: `«${i.descripcion.toLowerCase().slice(0, 48)}» (${i.codigo}): el volumen no cuadra con el área y el espesor`,
          detalle: `"${i.descripcion}" tiene ${i.metrado} m³, pero según las demás partidas del mismo título (${base}) debería ser ${redondear(esperado)} m³ (${Math.round(d * 100)}% de diferencia).`,
          evidencias: [ev(i)], montoInvolucrado: Math.abs(esperado - i.metrado!) * (i.precio ?? 0),
        });
      }
    }
  }
  return out;
}

/** V-IMPOSIBLE: dimensiones físicamente imposibles en la descripción (p. ej. buzón de 120 m de diámetro). */
export function valoresImposibles(p: Presupuesto): Deteccion[] {
  const out: Deteccion[] = [];
  for (const i of p.items) {
    const n = normalizar(i.descripcion);
    const d = n.match(/\b(?:DI|D|Ø|DIAM(?:ETRO)?)\s*=\s*(\d+(?:[.,]\d+)?)\s*(M|CM|MM)\b/);
    if (d) {
      const v = Number(d[1].replace(',', '.'));
      const metros = d[2] === 'M' ? v : d[2] === 'CM' ? v / 100 : v / 1000;
      if (metros > 5) out.push({
        verificador: 'V-IMPOSIBLE', resultado: 'falla', severidad: 'media',
        titulo: `«${i.descripcion.toLowerCase().slice(0, 48)}» (${i.codigo}) tiene una medida imposible`,
        detalle: `"${i.descripcion}" indica un diámetro de ${v} ${d[2].toLowerCase()} (${metros} m). Probablemente es un error de unidad o de separador decimal.`,
        evidencias: [ev(i)],
      });
    }
    const e = espesorEnMetros(i.descripcion);
    if (e != null && e > 3) out.push({
      verificador: 'V-IMPOSIBLE', resultado: 'falla', severidad: 'media',
      titulo: `«${i.descripcion.toLowerCase().slice(0, 48)}» (${i.codigo}) tiene un espesor o una altura imposible`,
      detalle: `"${i.descripcion}" indica ${e} m. Revise la unidad.`, evidencias: [ev(i)],
    });
  }
  return out;
}

export function verificarPresupuesto(p: Presupuesto): Deteccion[] {
  if (p.calidad.nivel === 'baja') {
    return [{ verificador: 'V-LEGIBLE', resultado: 'no_verificable', severidad: 'media', titulo: 'El presupuesto no es verificable automáticamente',
      detalle: `${p.calidad.motivo}. Axis no lanza alertas aritméticas sobre texto ilegible para no acusar errores que pueden ser del escaneo. Solicite el presupuesto en formato digital (el Reglamento exige publicarlo legible).`,
      evidencias: [{ documento: DOC, pagina: p.paginas[0], extracto: 'Calidad del texto' }] }];
  }
  return [
    ...montoEnLetras(p), ...resumen(p), ...aritmeticaTitulos(p), ...aritmeticaPartidas(p),
    ...geometria(p), ...valoresImposibles(p), ...unidadGlobal(p),
  ];
}

export type { ItemPresupuesto };
