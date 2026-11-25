// Normalización de texto que conserva la longitud: los índices de una coincidencia
// en el texto normalizado sirven para recortar el texto original.

const SIN_TILDE: Record<string, string> = {
  Á: 'A', À: 'A', Ä: 'A', Â: 'A', É: 'E', È: 'E', Ë: 'E', Ê: 'E', Í: 'I', Ì: 'I', Ï: 'I', Î: 'I',
  Ó: 'O', Ò: 'O', Ö: 'O', Ô: 'O', Ú: 'U', Ù: 'U', Ü: 'U', Û: 'U',
};

/** Mayúsculas sin tildes, misma longitud que la entrada (la Ñ se conserva). */
export function plano(texto: string): string {
  let salida = '';
  for (const c of texto.toUpperCase()) {
    const r = SIN_TILDE[c] ?? c;
    salida += r.length === c.length ? r : c;
  }
  return salida;
}

/** Espacios colapsados, para extractos legibles. */
export function compactar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** «MEJORAMIENTO DE LA CALLE» → «Mejoramiento de la calle». */
export function frase(texto: string): string {
  const t = compactar(texto).toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** «EL PORVENIR» → «El Porvenir». */
export function nombrePropio(texto: string): string {
  return compactar(texto)
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase())
    .replace(/(?<=\S\s+)\b(De|Del|Y)\b/g, (w) => w.toLowerCase());
}

const VACIAS = new Set(['DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'EN', 'A', 'AL', 'CON', 'PARA', 'POR', 'E']);

export function palabras(texto: string): Set<string> {
  return new Set(plano(texto).split(/[^A-Z0-9Ñ]+/).filter((p) => p.length > 2 && !VACIAS.has(p)));
}

/** Parecido de Jaccard entre dos textos (0–1). */
export function parecido(a: string, b: string): number {
  const x = palabras(a);
  const y = palabras(b);
  if (!x.size || !y.size) return 0;
  let comunes = 0;
  for (const p of x) if (y.has(p)) comunes += 1;
  return comunes / (x.size + y.size - comunes);
}

export function extracto(texto: string, inicio: number, fin: number, margen = 40): string {
  const a = Math.max(0, inicio - margen);
  const b = Math.min(texto.length, fin + margen);
  return `${a > 0 ? '…' : ''}${compactar(texto.slice(a, b))}${b < texto.length ? '…' : ''}`;
}

/** «pág. 3», «hoja 2», «bloque 1». */
export function citar(unidad: string, n: number): string {
  return `${unidad} ${n}`;
}
