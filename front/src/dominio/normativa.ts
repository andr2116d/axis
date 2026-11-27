import indice from '@/datos/normativa/indice.json';

// Citas a la Ley 32069 y su Reglamento: separa una cita escrita («Reglamento, art. 200.1 a y
// 198.1») en tramos de texto y enlaces al artículo oficial. Sin norma explícita, «art.» es del Reglamento.

export type Norma = 'ley' | 'reglamento';
export const NOMBRE_NORMA: Record<Norma, string> = { ley: 'Ley 32069', reglamento: 'Reglamento' };

const INDICE = indice as Record<Norma, Record<string, string>>;

export function tituloArticulo(norma: Norma, n: number): string | undefined {
  return INDICE[norma][String(n)];
}

export function hrefArticulo(norma: Norma, n: number, numeral?: string) {
  return `/normativa/${norma}/${n}${numeral ? `#n-${numeral.replace(/\./g, '-')}` : ''}`;
}

export type Tramo = { texto: string } | { texto: string; norma: Norma; n: number; numeral?: string };

export function tramosCita(cita: string): Tramo[] {
  const re = /\b(Ley 32069|Ley|Reglamento)\b|([Aa]rts?\.|[Aa]rtículos?)\s*(\d+)((?:\.\d+)*)|\by\s+(\d+)((?:\.\d+)*)(?!\s*%|\s*d[íi]as)/g;
  const out: Tramo[] = [];
  let norma: Norma = 'reglamento';
  let ultimo = 0;
  let previo = -1;
  for (const m of cita.matchAll(re)) {
    if (m[1]) { norma = m[1] === 'Reglamento' ? 'reglamento' : 'ley'; continue; }
    // «y 198.1» solo enlaza si sigue de inmediato a otra cita (o a su literal): evita «y 10 días».
    if (m[5] && (previo < 0 || m.index - previo > 6)) continue;
    const n = Number(m[3] ?? m[5]);
    const sub = m[4] ?? m[6] ?? '';
    // «art. 64.5 de la Ley», «art. 190.3 del Reglamento»: la norma va después del número.
    const despues = cita.slice(m.index + m[0].length).match(/^(?:\s*[a-z]\))?\s*(de la Ley|del Reglamento)\b/);
    if (despues) norma = despues[1] === 'de la Ley' ? 'ley' : 'reglamento';
    if (!tituloArticulo(norma, n)) continue;
    const numero = `${n}${sub}`;
    const inicio = m.index + m[0].length - numero.length;
    if (inicio > ultimo) out.push({ texto: cita.slice(ultimo, inicio) });
    out.push({ texto: numero, norma, n, numeral: sub ? numero : undefined });
    ultimo = inicio + numero.length;
    previo = ultimo;
  }
  if (ultimo < cita.length) out.push({ texto: cita.slice(ultimo) });
  return out;
}
