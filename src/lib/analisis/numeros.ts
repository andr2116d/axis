// Utilidades numéricas compartidas por el lector y los verificadores.

export const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
export const normalizar = (s: string) => sinTildes(s).toUpperCase().replace(/\s+/g, ' ').trim();

/** "1,234.50" | "1.234,50" | "120" | "2 090 093.80" → número. */
export function aNumero(s: string | undefined | null): number {
  if (s == null) return NaN;
  let t = String(s).trim().replace(/\s/g, '').replace(/^S\/\.?/i, '');
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+\.\d{1,2}$/.test(t)) t = t.replace(/\.(?=.*\.)/g, ''); // 45.500.00 → 45500.00
  else if (/^-?\d{1,3}(,\d{3})+,\d{2}$/.test(t)) t = t.replace(/,(?=.*,)/g, '').replace(',', '.'); // 1,234,56 → 1234.56
  else if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  return t === '' ? NaN : Number(t);
}

export const redondear = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Diferencia relativa |a-b| / max(|a|,|b|). */
export const difRel = (a: number, b: number) => (a === b ? 0 : Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-9));

const UNIDADES: Record<string, number> = {
  CERO: 0, UN: 1, UNO: 1, UNA: 1, DOS: 2, TRES: 3, CUATRO: 4, CINCO: 5, SEIS: 6, SIETE: 7, OCHO: 8, NUEVE: 9,
  DIEZ: 10, ONCE: 11, DOCE: 12, TRECE: 13, CATORCE: 14, QUINCE: 15, DIECISEIS: 16, DIECISIETE: 17, DIECIOCHO: 18,
  DIECINUEVE: 19, VEINTE: 20, VEINTIUN: 21, VEINTIUNO: 21, VEINTIUNA: 21, VEINTIDOS: 22, VEINTITRES: 23,
  VEINTICUATRO: 24, VEINTICINCO: 25, VEINTISEIS: 26, VEINTISIETE: 27, VEINTIOCHO: 28, VEINTINUEVE: 29,
  TREINTA: 30, CUARENTA: 40, CINCUENTA: 50, SESENTA: 60, SETENTA: 70, OCHENTA: 80, NOVENTA: 90,
  CIEN: 100, CIENTO: 100, DOSCIENTOS: 200, DOSCIENTAS: 200, TRESCIENTOS: 300, TRESCIENTAS: 300,
  CUATROCIENTOS: 400, CUATROCIENTAS: 400, QUINIENTOS: 500, QUINIENTAS: 500, SEISCIENTOS: 600, SEISCIENTAS: 600,
  SETECIENTOS: 700, SETECIENTAS: 700, OCHOCIENTOS: 800, OCHOCIENTAS: 800, NOVECIENTOS: 900, NOVECIENTAS: 900,
};

/**
 * Convierte un monto escrito en letras ("DOS MILLONES OCHOCIENTOS CINCUENTA MIL ... Y 07/100 SOLES") a número.
 * Devuelve NaN si encuentra palabras que no reconoce (para no inventar un valor).
 */
export function letrasANumero(texto: string): number {
  let t = normalizar(texto).replace(/^SON\s*:?\s*/, '');
  let centimos = 0;
  const cent = t.match(/(\d{1,2})\s*\/\s*100/);
  if (cent) {
    centimos = Number(cent[1]) / 100;
    t = t.slice(0, cent.index);
  }
  t = t.replace(/\b(Y|CON)\s*$/, '').replace(/\b(SOLES|NUEVOS|SOL)\b/g, '').trim();
  // Contracciones frecuentes: NOVENTIOCHO, TREINTAICINCO → NOVENTA Y OCHO, TREINTA Y CINCO
  t = t.replace(/\b(TREINT|CUARENT|CINCUENT|SESENT|SETENT|OCHENT|NOVENT)A?I(UNO|UN|DOS|TRES|CUATRO|CINCO|SEIS|SIETE|OCHO|NUEVE)\b/g, '$1A Y $2');
  const palabras = t.split(/[\s,]+/).filter(Boolean);
  let total = 0;
  let grupo = 0;
  let reconocidas = 0;
  for (const p of palabras) {
    if (p === 'Y') continue;
    if (p in UNIDADES) {
      grupo += UNIDADES[p];
      reconocidas++;
    } else if (p === 'MIL') {
      grupo = (grupo || 1) * 1000;
      reconocidas++;
      total += grupo;
      grupo = 0;
    } else if (p === 'MILLON' || p === 'MILLONES') {
      // lo acumulado (incluidos los miles) multiplica a un millón
      total = (total + (grupo || 1)) * 1_000_000;
      grupo = 0;
      reconocidas++;
    } else {
      return NaN;
    }
  }
  if (!reconocidas) return NaN;
  return redondear(total + grupo + centimos);
}
