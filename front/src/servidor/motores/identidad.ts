import type { MotorExpediente } from './tipos';
import { citar, extracto, frase, nombrePropio, parecido, plano } from '../texto';

// Motor «Identidad y versiones». Lee el nombre de la obra y el CUI en las primeras
// páginas de cada documento. Si un documento nombra otra obra u otro CUI, lo reporta:
// es el error de «copiar y pegar» de otro expediente.

const INICIO_NOMBRE = /\b(MEJORAMIENTO|CREACION|REHABILITACION|AMPLIACION|INSTALACION|RECUPERACION|CONSTRUCCION|REPARACION|RENOVACION|REMODELACION)\b/;
const FIN_NOMBRE = /,?\s*\b(DISTRITO|PROVINCIA|DEPARTAMENTO|REGION|C\.?U\.?I|CODIGO|META|UBICACION|FECHA|PLAZO)\b|["”]|\n\s*\n/;
const VIA = /\b(calle|avenida|av\.|jr\.|jir[oó]n|pasaje|psje\.|prolongaci[oó]n|prolog\.)\s*([^,;]+?)(?=,|\s+desde\b|\s+hasta\b|\s+entre\b|\s+y\s|$)/g;
const CUI = /\b(?:C\.?U\.?I\.?|CODIGO UNICO DE INVERSION(?:ES)?)\s*(?:N[°ºO]?\.?)?\s*:?\s*(\d{7})\b/;
const PAGINAS = 3;
/** Por debajo de este parecido, dos nombres se consideran obras distintas. */
const UMBRAL_PARECIDO = 0.35;

export interface IdentidadDocumento {
  nombre?: { texto: string; pagina: number; extracto: string };
  cui?: { valor: string; pagina: number; extracto: string };
}

export function identidadDeDocumento(paginas: string[]): IdentidadDocumento {
  const id: IdentidadDocumento = {};
  for (let i = 0; i < Math.min(PAGINAS, paginas.length); i += 1) {
    const original = paginas[i].replace(/ \| /g, ' ');
    const p = plano(original);
    if (!id.nombre) {
      const m = INICIO_NOMBRE.exec(p);
      if (m) {
        const resto = p.slice(m.index);
        const fin = FIN_NOMBRE.exec(resto.slice(15));
        const largo = Math.min(fin ? fin.index + 15 : resto.length, 220);
        // Los títulos de obra van en mayúsculas; una palabra suelta en el cuerpo del texto no.
        const titulo = esTitulo(original.slice(m.index, m.index + largo));
        const texto = conVias(frase(original.slice(m.index, m.index + largo)).replace(/[\s,.;:–-]+$/, ''));
        if (titulo && texto.length >= 25) id.nombre = { texto, pagina: i + 1, extracto: extracto(original, m.index, m.index + largo, 0) };
      }
    }
    if (!id.cui) {
      const m = CUI.exec(p);
      if (m) id.cui = { valor: m[1], pagina: i + 1, extracto: extracto(original, m.index, m.index + m[0].length, 20) };
    }
  }
  return id;
}

function esTitulo(texto: string): boolean {
  const letras = texto.replace(/[^\p{L}]/gu, '');
  return letras.length >= 20 && letras.replace(/\p{Ll}/gu, '').length / letras.length >= 0.8;
}

/** «… en la calle los almendros, desde la av.husares» → «… en la Calle Los Almendros, desde la Av. Husares». */
export function conVias(texto: string): string {
  return texto.replace(VIA, (_, via: string, nombre: string) => `${nombrePropio(via.replace(/\.(?=\S)/, '. '))} ${nombrePropio(nombre)}`.replace(/\.\s*$/, '.'));
}

/** El nombre más repetido entre documentos: el de la obra. */
export function nombreDeObra(identidades: IdentidadDocumento[]): string | null {
  const nombres = identidades.map((i) => i.nombre?.texto).filter((n): n is string => !!n);
  if (!nombres.length) return null;
  let mejor = nombres[0];
  let votos = -1;
  for (const n of nombres) {
    const v = nombres.filter((o) => parecido(n, o) >= UMBRAL_PARECIDO).length;
    if (v > votos || (v === votos && n.length < mejor.length)) { mejor = n; votos = v; }
  }
  return mejor;
}

export const motorIdentidad: MotorExpediente = {
  id: 'identidad',
  async ejecutar({ expediente, texto, reportar }) {
    const docs = await Promise.all(expediente.documentos.map(async (d) => ({ d, id: identidadDeDocumento(await texto(d.id)) })));
    const conNombre = docs.filter((x) => x.id.nombre);
    const conCui = docs.filter((x) => x.id.cui);
    if (!conNombre.length && !conCui.length) return { estado: 'sin-datos', nota: 'Ningún documento declara nombre de obra ni CUI en sus primeras páginas.' };

    const obra = nombreDeObra(docs.map((x) => x.id));
    if (obra) {
      for (const { d, id } of conNombre) {
        if (parecido(id.nombre!.texto, obra) >= UMBRAL_PARECIDO) continue;
        const referencia = conNombre.find((x) => parecido(x.id.nombre!.texto, obra) >= UMBRAL_PARECIDO)!;
        reportar({
          categoria: 'documentos', prioridad: 'alta',
          titulo: `${d.nombre} parece de otra obra`,
          detalle: `Este documento nombra «${id.nombre!.texto}», mientras que el expediente corresponde a «${obra}». Puede ser un documento copiado de otro expediente o una versión equivocada.`,
          accion: 'Confirmar con el proyectista que el documento corresponde a esta obra y pedir la versión correcta.',
          solicitud: `Reemplazar «${d.nombre}» por la versión que corresponde a esta obra o aclarar la diferencia en el nombre.`,
          fuentes: [
            { documento: d.nombre, pagina: citar(d.unidad, id.nombre!.pagina), extracto: id.nombre!.extracto },
            { documento: referencia.d.nombre, pagina: citar(referencia.d.unidad, referencia.id.nombre!.pagina), extracto: referencia.id.nombre!.extracto },
          ],
          motores: ['lectura', 'identidad'],
          prueba: 'X-IDENTIDAD',
        });
      }
    }

    const cuis = new Set(conCui.map((x) => x.id.cui!.valor));
    if (cuis.size > 1) {
      reportar({
        categoria: 'documentos', prioridad: 'alta',
        titulo: `Los documentos citan ${cuis.size} CUI distintos`,
        detalle: `Un expediente corresponde a una sola inversión. Aparecen los CUI ${[...cuis].join(', ')}.`,
        accion: 'Confirmar el CUI de la inversión y pedir que se corrijan los documentos que citan otro.',
        solicitud: 'Uniformizar el código único de inversión en todos los documentos del expediente.',
        fuentes: conCui.map((x) => ({ documento: x.d.nombre, pagina: citar(x.d.unidad, x.id.cui!.pagina), extracto: x.id.cui!.extracto })),
        motores: ['lectura', 'identidad'],
          prueba: 'X-IDENTIDAD',
      });
    }
    return { estado: 'ok', nota: `${conNombre.length} documento(s) con nombre de obra, ${conCui.length} con CUI.` };
  },
};
