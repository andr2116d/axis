// Ocultamiento de datos personales (Ley N° 29733). Se aplica al leer cada documento,
// antes de guardar su texto.

const TITULO = '(?:Ing\\.|Ingº|Arq\\.|Abog\\.|Lic\\.|Bach\\.|Sr\\.|Sra\\.|Srta\\.)';
const PALABRA_NOMBRE = "[A-ZÁÉÍÓÚÑ][a-záéíóúñ'-]+";

const PATRONES: { re: RegExp; reemplazo: string | ((...m: string[]) => string); tipo: string }[] = [
  { re: /\bDNI\s*(?:N[°ºo.]\s*)?:?\s*\d{8}\b/gi, reemplazo: 'DNI [oculto]', tipo: 'DNI' },
  { re: /\bC\.?I\.?P\.?\s*(?:N[°ºo.]\s*)?:?\s*\d{4,7}\b/gi, reemplazo: 'CIP [oculto]', tipo: 'colegiatura' },
  { re: /\bC\.?A\.?P\.?\s*(?:N[°ºo.]\s*)?:?\s*\d{4,7}\b/g, reemplazo: 'CAP [oculto]', tipo: 'colegiatura' },
  { re: /\bRUC\s*(?:N[°ºo.]\s*)?:?\s*10\d{9}\b/gi, reemplazo: 'RUC de persona natural [oculto]', tipo: 'RUC' },
  { re: /\b9\d{2}[\s-]?\d{3}[\s-]?\d{3}\b/g, reemplazo: '[teléfono oculto]', tipo: 'teléfono' },
  { re: /[\w.+-]+@[\w-]+\.[\w.]+/g, reemplazo: '[correo oculto]', tipo: 'correo' },
  {
    re: new RegExp(`(${TITULO})\\s+${PALABRA_NOMBRE}(?:\\s+${PALABRA_NOMBRE}){1,3}`, 'g'),
    reemplazo: (_m: string, t: string) => `${t} [nombre oculto]`,
    tipo: 'nombre',
  },
  { re: /^(\s*Firma\s*:?).*/i, reemplazo: (_m: string, f: string) => `${f} [firma oculta]`, tipo: 'firma' },
];

export interface ResultadoOcultamiento {
  lineas: string[];
  ocultos: Record<string, number>;
}

export function ocultarDatosPersonales(lineas: string[]): ResultadoOcultamiento {
  const ocultos: Record<string, number> = {};
  const salida = lineas.map((linea) => {
    let l = linea;
    for (const p of PATRONES) {
      l = l.replace(p.re, (...args: string[]) => {
        ocultos[p.tipo] = (ocultos[p.tipo] || 0) + 1;
        return typeof p.reemplazo === 'string' ? p.reemplazo : p.reemplazo(...args);
      });
    }
    return l;
  });
  return { lineas: salida, ocultos };
}
