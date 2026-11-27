import type { Consorciado, Postor } from '@/dominio/tipos';
import { fechasEnTexto } from '@/dominio/fechas';
import { aNumero, normalizar } from '../analisis/numeros';
import { compactar, plano } from '../texto';

// Lectura de una oferta de obra (bases estándar, Ley 32069). Cada archivo es la oferta de
// un postor: Anexo 1 (datos de cada integrante), vigencia de poder (apoderado y fecha de
// constitución), Anexo 4 (promesa de consorcio con el % de obligaciones) y Anexo 6 (oferta
// económica). Lo que no encuentra lo deja vacío y lo avisa; nada se inventa.

export interface OfertaLeida {
  postor: Omit<Postor, 'id' | 'puntajeTotal'> & { puntajeTotal?: number };
  avisos: string[];
}

/** Valor de una línea «Etiqueta: valor» (la etiqueta en mayúsculas sin tildes). */
function valor(lineas: string[], etiqueta: RegExp): string | undefined {
  for (const l of lineas) {
    const n = normalizar(l);
    const m = etiqueta.exec(n);
    if (m && n.indexOf(':', m.index) !== -1) {
      const v = l.slice(n.indexOf(':', m.index) + 1).trim();
      if (v) return compactar(v);
    }
  }
  return undefined;
}

const RUC = /\b(10|15|17|20)\d{9}\b/;

/** Primer grupo de `re` buscado sin tildes, devuelto con las tildes del texto original. */
function grupo(texto: string, re: RegExp): string | undefined {
  const t = compactar(texto);
  const p = plano(t);
  const m = re.exec(p);
  if (!m?.[1]) return undefined;
  const i = p.indexOf(m[1], m.index);
  return t.slice(i, i + m[1].length).trim();
}
const titulo = (s: string) => compactar(s).replace(/,$/, '');

export function leerOferta(paginas: string[], archivo: string): OfertaLeida {
  const avisos: string[] = [];
  const integrantes: (Consorciado & { domicilio?: string; telefono?: string; apoderado?: string; mype?: boolean })[] = [];
  let consorcio: string | undefined;
  let representante: string | undefined;
  let domicilioComun: string | undefined;
  let oferta: number | undefined;
  const promesa: { nombre: string; ruc: string; pct: number }[] = [];

  paginas.forEach((pag) => {
    const lineas = pag.split('\n');
    const n = normalizar(pag);
    if (/DECLARACION JURADA DE DATOS DEL POSTOR/.test(n)) {
      const nombre = valor(lineas, /RAZON SOCIAL/);
      const ruc = valor(lineas, /^RUC/)?.match(RUC)?.[0];
      if (nombre && ruc) {
        const mype = valor(lineas, /^MYPE/);
        integrantes.push({
          nombre: titulo(nombre), ruc, participacion: 0, experiencia: 0,
          domicilio: valor(lineas, /DOMICILIO/), telefono: valor(lineas, /TELEFONO/),
          mype: mype ? /SI \(\s*X\s*\)/i.test(normalizar(mype)) : undefined,
        });
      }
      consorcio = grupo(pag, /INTEGRANTE DEL (CONSORCIO [A-Z0-9Ñ .&-]+?)(?:,| DECLARO)/) ?? consorcio;
    }
    if (/VIGENCIA DE PODER/.test(n)) {
      const ruc = n.match(RUC)?.[0];
      const quien = integrantes.find((m) => m.ruc === ruc) ?? integrantes[integrantes.length - 1];
      if (quien) {
        quien.apoderado = valor(lineas, /APODERADO|REPRESENTANTE LEGAL|GERENTE/);
        const constitucion = valor(lineas, /FECHA DE CONSTITUCION|INICIO DE ACTIVIDADES/);
        const f = constitucion ? fechasEnTexto(constitucion)[0]?.fecha : undefined;
        if (f) quien.inicio = f;
      }
    }
    if (/PROMESA DE CONSORCIO/.test(n)) {
      consorcio = grupo(pag, /OFERTA CONJUNTA COMO (CONSORCIO [A-Z0-9Ñ .&-]+?)[.,]/) ?? consorcio;
      representante = grupo(pag, /REPRESENTANTE COMUN (?:A )?([^,.]+)/);
      domicilioComun = grupo(pag, /DOMICILIO COMUN (?:EN )?(.+?) Y CORREO/);
      for (const l of lineas) {
        const ruc = l.match(RUC)?.[0];
        const pct = /(\d{1,3}(?:[.,]\d+)?)\s*%/.exec(l);
        if (ruc && pct) promesa.push({ nombre: titulo(l.split('|')[0]), ruc, pct: aNumero(pct[1]) });
      }
    }
    if (/OFERTA ECONOMICA/.test(n)) {
      const total = valor(lineas, /MONTO TOTAL|TOTAL DE LA OFERTA|OFERTA TOTAL/) ?? lineas.find((l) => /TOTAL/i.test(l) && /\d/.test(l));
      const m = total?.match(/(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?)/);
      if (m) oferta = aNumero(m[1]);
    }
  });

  // Participación: de la promesa de consorcio; una sola empresa es el 100 %.
  if (promesa.length) {
    for (const p of promesa) {
      const m = integrantes.find((x) => x.ruc === p.ruc);
      if (m) m.participacion = p.pct;
      else integrantes.push({ nombre: p.nombre, ruc: p.ruc, participacion: p.pct, experiencia: 0 });
    }
  } else if (integrantes.length === 1) integrantes[0].participacion = 100;
  else if (integrantes.length > 1) avisos.push('Hay varios integrantes pero no se encontró la promesa de consorcio (Anexo 4) con sus porcentajes.');

  if (!integrantes.length) avisos.push('No se encontró el Anexo 1 (datos del postor) con razón social y RUC.');
  if (!oferta) avisos.push('No se encontró el monto de la oferta económica (Anexo 6).');
  const nombre = consorcio ? frase(consorcio) : integrantes[0]?.nombre ?? archivo.replace(/\.[a-z]+$/i, '');

  return {
    postor: {
      nombre,
      integrantes: integrantes.map(({ nombre: nm, ruc, participacion, experiencia, inicio }) => ({ nombre: nm, ruc, participacion, experiencia, inicio })),
      oferta: oferta ?? 0,
      mype: integrantes.length > 0 && integrantes.every((m) => m.mype),
      domicilio: domicilioComun ?? integrantes[0]?.domicilio,
      representante: representante ?? integrantes[0]?.apoderado,
      telefono: integrantes[0]?.telefono,
      apoderados: integrantes.map((m) => m.apoderado).filter((x): x is string => !!x),
      personal: [],
      archivo,
    },
    avisos,
  };
}

/** «CONSORCIO VIAS DEL NORTE» → «Consorcio Vias Del Norte» (respeta siglas cortas). */
function frase(s: string) {
  return s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()).replace(/\b(De|Del|La|Las|Los|Y)\b/g, (w) => w.toLowerCase());
}

/** Puntaje por precio (único factor en obras «solo construcción»): 100 a la menor oferta válida. */
export function puntajePorPrecio(ofertas: number[], valorReferencial: number): number[] {
  const validas = ofertas.filter((o) => o / valorReferencial >= 0.95 && o / valorReferencial <= 1.1);
  const menor = Math.min(...validas);
  return ofertas.map((o) => (validas.includes(o) ? Math.round((menor / o) * 10000) / 100 : 0));
}
