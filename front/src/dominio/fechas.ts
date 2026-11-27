// Fechas y plazos legales. Los plazos de la ejecución contractual cuentan en días
// calendario salvo que la norma diga «días hábiles» (Reglamento de la Ley 32069).
// Feriados nacionales del Perú (Ley 31788, 31961 y anteriores).

const FERIADOS = new Set([
  // 2026
  '2026-01-01', '2026-04-02', '2026-04-03', '2026-05-01', '2026-06-07', '2026-06-29', '2026-07-23', '2026-07-28', '2026-07-29',
  '2026-08-06', '2026-08-30', '2026-10-08', '2026-11-01', '2026-12-08', '2026-12-09', '2026-12-25',
  // 2027
  '2027-01-01', '2027-03-25', '2027-03-26', '2027-05-01', '2027-06-07', '2027-06-29', '2027-07-23', '2027-07-28', '2027-07-29',
  '2027-08-06', '2027-08-30', '2027-10-08', '2027-11-01', '2027-12-08', '2027-12-09', '2027-12-25',
]);

/** AAAA-MM-DD de una fecha (en hora local de Lima no importa: trabajamos con días). */
export const iso = (d: Date) => d.toISOString().slice(0, 10);

export function fechaDe(s: string): Date {
  return new Date(`${s}T12:00:00Z`);
}

export function esHabil(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia !== 0 && dia !== 6 && !FERIADOS.has(iso(d));
}

/** Suma días (hábiles o calendario) contados desde el día siguiente. */
export function sumarDias(desde: string, dias: number, habiles: boolean): string {
  const d = fechaDe(desde);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!habiles || esHabil(d)) n += 1;
  }
  return iso(d);
}

/** Días hábiles o calendario entre dos fechas (positivo si `hasta` es posterior). */
export function diasEntre(desde: string, hasta: string, habiles: boolean): number {
  const a = fechaDe(desde);
  const b = fechaDe(hasta);
  const signo = b >= a ? 1 : -1;
  const [ini, fin] = signo > 0 ? [a, b] : [b, a];
  let n = 0;
  const d = new Date(ini);
  while (d < fin) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (!habiles || esHabil(d)) n += 1;
  }
  return signo * n;
}

export const hoyIso = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];

export function fechaLarga(s: string): string {
  const d = fechaDe(s);
  return `${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

export function fechaCorta(s: string): string {
  const d = fechaDe(s);
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
}

/** Fechas escritas en un texto: «12 de mayo de 2026», «12/05/2026», «2026-05-12». */
export function fechasEnTexto(texto: string): { fecha: string; indice: number }[] {
  const out: { fecha: string; indice: number }[] = [];
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const largo = /(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|setiembre|septiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+(\d{4}))?/g;
  for (const m of t.matchAll(largo)) {
    const mes = m[2] === 'septiembre' ? 8 : MESES.indexOf(m[2]);
    const anio = m[3] ? Number(m[3]) : null;
    if (anio) out.push({ fecha: `${anio}-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`, indice: m.index! });
    else out.push({ fecha: `????-${String(mes + 1).padStart(2, '0')}-${m[1].padStart(2, '0')}`, indice: m.index! });
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.push({ fecha: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, indice: m.index! });
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.push({ fecha: m[0], indice: m.index! });
  // Una fecha sin año toma el de la fecha completa más cercana.
  const conAnio = out.filter((f) => !f.fecha.startsWith('????'));
  return out
    .map((f) => {
      if (!f.fecha.startsWith('????')) return f;
      const ref = conAnio.sort((a, b) => Math.abs(a.indice - f.indice) - Math.abs(b.indice - f.indice))[0];
      return ref ? { ...f, fecha: ref.fecha.slice(0, 4) + f.fecha.slice(4) } : null;
    })
    .filter((f): f is { fecha: string; indice: number } => !!f && !Number.isNaN(fechaDe(f.fecha).getTime()))
    .sort((a, b) => a.indice - b.indice);
}
