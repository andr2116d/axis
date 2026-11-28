import 'server-only';
import type { Documento as DocumentoSubido, Hallazgo, Prioridad, Categoria, TipoDocumento } from '@/dominio/tipos';
import { verificadorPorId } from '@/datos/verificadores';
import { analizarExpediente as analizarLegado, type ResultadoAnalisis } from './expediente';
import { detectarPagina, type Documento } from './nombres';
import type { Deteccion } from './tipos-analisis';
import { antecedentesContraloria, territorio } from './datos';
import { citar } from '../texto';

// Puente entre los archivos que sube el evaluador y el motor de verificadores:
// arma las páginas numeradas de todo el expediente, respeta el tipo confirmado de
// cada archivo y traduce cada detección a un hallazgo con su archivo y página reales.

type HallazgoNuevo = Omit<Hallazgo, 'id'>;

export interface PaginaGlobal { numero: number; lineas: string[]; documento: DocumentoSubido; local: number }

/** Parte reconocida en una página → tipo de documento del expediente. */
export const PARTE_A_TIPO: Partial<Record<Documento, TipoDocumento>> = {
  memoria: 'Memoria', presupuesto: 'Presupuesto', metrados: 'Metrados', apu: 'Precios unitarios', especificaciones: 'Especificaciones',
  cronograma: 'Cronograma', formula: 'Fórmula polinómica', suelos: 'Estudio de suelos', planos: 'Planos', gastos: 'Presupuesto',
};

/** Partes del expediente reconocidas en las páginas de un archivo. */
/** Partes reconocidas con las páginas donde están (la página sin parte propia sigue a la anterior). */
export function partesConPaginas(paginas: string[]): { tipo: TipoDocumento; paginas: number[] }[] {
  const salida: { tipo: TipoDocumento; paginas: number[] }[] = [];
  let actual: { tipo: TipoDocumento; paginas: number[] } | undefined;
  paginas.forEach((t, i) => {
    const parte = detectarPagina({ numero: i + 1, lineas: t.split('\n') });
    const tipo = parte ? PARTE_A_TIPO[parte] : undefined;
    if (tipo && tipo !== actual?.tipo) {
      actual = salida.find((p) => p.tipo === tipo) ?? { tipo, paginas: [] };
      if (!salida.includes(actual)) salida.push(actual);
    }
    actual?.paginas.push(i + 1);
  });
  return salida;
}

export function partesDeArchivo(paginas: string[]): TipoDocumento[] {
  const partes = new Set<TipoDocumento>();
  paginas.forEach((t, i) => {
    const parte = detectarPagina({ numero: i + 1, lineas: t.split('\n') });
    const tipo = parte ? PARTE_A_TIPO[parte] : undefined;
    if (tipo) partes.add(tipo);
  });
  return [...partes];
}

const TIPO_A_PARTE: Record<TipoDocumento, Documento | null> = {
  'Expediente completo': null,
  Memoria: 'memoria', Especificaciones: 'especificaciones', Metrados: 'metrados', Presupuesto: 'presupuesto',
  'Precios unitarios': 'apu', 'Fórmula polinómica': 'formula', Cronograma: 'cronograma', Planos: 'planos',
  'Estudio de suelos': 'suelos', 'Otro anexo': 'otro', 'Por identificar': null,
};

/** Ya los cubren los motores de identidad y cobertura, con archivo y norma. */
const CUBIERTOS_POR_OTROS = new Set(['D-CONTENIDO', 'X-IDENTIDAD']);

interface Clase { categoria: Categoria; motores: string[] }
function clase(id: string): Clase {
  if (/^V-(LETRAS|ARIT|RESUMEN|GLOBAL|IMPOSIBLE)/.test(id) || id === 'X-GG') return { categoria: 'costos', motores: ['tablas', 'aritmetica'] };
  if (/^(X-APU|V-APU)/.test(id)) return { categoria: 'costos', motores: ['tablas', 'apu'] };
  if (id === 'X-FECHAS') return { categoria: 'costos', motores: ['extraccion', 'comparables'] };
  if (id === 'X-FORMULA') return { categoria: 'costos', motores: ['extraccion', 'normativa'] };
  if (id === 'X-MET-PRES') return { categoria: 'documentos', motores: ['correspondencia', 'metrados'] };
  if (id === 'V-GEOMETRIA') return { categoria: 'documentos', motores: ['extraccion', 'geometria', 'metrados'] };
  if (/^X-ET/.test(id)) return { categoria: 'documentos', motores: ['extraccion', 'coherencia-tecnica'] };
  if (/^X-(CRONOGRAMA|RENDIMIENTO)/.test(id)) return { categoria: 'documentos', motores: ['extraccion', 'cronograma'] };
  if (id === 'D-PLANOS') return { categoria: 'documentos', motores: ['cobertura', 'geometria'] };
  if (id === 'V-LEGIBLE' || id === 'D-PERTINENCIA' || id === 'D-ALCANCE') return { categoria: 'documentos', motores: ['lectura', 'cobertura'] };
  if (id === 'C-PELIGRO') return { categoria: 'territorio', motores: ['ubicacion', 'peligros'] };
  if (id === 'C-AGUA' || id === 'C-DRENAJE') return { categoria: 'territorio', motores: ['ubicacion', 'relieve'] };
  if (id === 'C-COORDINACION' || id === 'C-DUPLICIDAD') return { categoria: 'territorio', motores: ['ubicacion', 'redes'] };
  if (id === 'C-HISTORIAL') return { categoria: 'territorio', motores: ['ubicacion', 'antecedentes'] };
  if (id === 'X-SECCION') return { categoria: 'territorio', motores: ['geometria', 'suelos'] };
  if (id === 'X-LONGITUD' || id === 'C-UBICACION') return { categoria: 'territorio', motores: ['ubicacion', 'geometria'] };
  return { categoria: 'documentos', motores: ['coherencia-tecnica'] };
}

function prioridad(d: Deteccion): Prioridad {
  if (d.resultado === 'no_verificable') return 'confirmar';
  return d.severidad === 'alta' ? 'alta' : d.severidad === 'media' ? 'media' : 'confirmar';
}

export function paginasGlobales(documentos: DocumentoSubido[], textos: string[][]): PaginaGlobal[] {
  const out: PaginaGlobal[] = [];
  documentos.forEach((documento, i) => textos[i].forEach((t, j) => out.push({ numero: out.length + 1, lineas: t.split('\n'), documento, local: j + 1 })));
  return out;
}

export interface AnalisisVerificadores {
  hallazgos: HallazgoNuevo[];
  resultado: ResultadoAnalisis;
  paginas: PaginaGlobal[];
  /** Texto de las páginas de los tipos pedidos (para pruebas aprendidas). */
  textoDe(...tipos: TipoDocumento[]): string;
  /** Partes del expediente reconocidas, página por página. */
  partes: Set<TipoDocumento>;
  /** Pruebas de la biblioteca que corrieron sobre el expediente (pasaran o no). */
  ejecutadas: Set<string>;
}

export function correrVerificadores(documentos: DocumentoSubido[], textos: string[][]): AnalisisVerificadores {
  const paginas = paginasGlobales(documentos, textos);
  const clasificacion = paginas.map((p) => {
    const tipo = TIPO_A_PARTE[p.documento.tipo];
    const auto = detectarPagina(p);
    // Un presupuesto exportado de S10 suele traer gastos generales, fórmula y APU:
    // ahí se respeta lo que reconoce cada página. En el resto manda el tipo confirmado.
    const parte = tipo === null || tipo === 'otro' || tipo === 'presupuesto' ? auto ?? tipo ?? 'otro' : tipo;
    return { pagina: p.numero, documento: parte };
  });
  const resultado = analizarLegado(paginas, { clasificacion, partesIndicadas: true, territorio: territorio(), antecedentes: antecedentesContraloria() });

  const porNumero = new Map(paginas.map((p) => [p.numero, p]));
  const hallazgos: HallazgoNuevo[] = resultado.detecciones
    .filter((d) => d.resultado !== 'pasa' && !CUBIERTOS_POR_OTROS.has(d.verificador) && !(d.verificador === 'C-UBICACION' && d.severidad === 'baja' && /estimada/.test(d.titulo)))
    .map((d) => {
      const ficha = verificadorPorId(d.verificador);
      const { categoria, motores } = clase(d.verificador);
      return {
        categoria, prioridad: prioridad(d),
        titulo: d.titulo,
        detalle: d.detalle,
        accion: ficha?.recomendacion ?? (d.resultado === 'no_verificable' ? 'Revisar manualmente: Axis no pudo completar esta comprobación.' : 'Pedir al proyectista que corrija o sustente el punto.'),
        solicitud: ficha?.recomendacion,
        fuentes: d.evidencias.map((ev) => {
          const p = ev.pagina ? porNumero.get(ev.pagina) : undefined;
          return p
            ? { documento: p.documento.nombre, pagina: citar(p.documento.unidad, p.local), extracto: ev.extracto }
            : { documento: ev.documento, pagina: 'expediente', extracto: ev.extracto };
        }),
        motores: ['lectura', ...motores],
        prueba: d.verificador,
        origen: ficha?.origen.map((o) => ({ titulo: o.obra, detalle: `${o.hallazgo} — ${o.documento}${o.proceso ? `, ${o.proceso}` : ''}.` })),
        monto: d.montoInvolucrado,
      } satisfies HallazgoNuevo;
    });

  const tipoPagina = new Map(clasificacion.map((c) => [c.pagina, PARTE_A_TIPO[c.documento]]));
  return {
    hallazgos, resultado, paginas,
    textoDe: (...tipos) => paginas.filter((p) => tipos.includes(tipoPagina.get(p.numero) ?? p.documento.tipo)).map((p) => p.lineas.join(' ')).join('\n'),
    partes: new Set([...tipoPagina.values()].filter((t): t is TipoDocumento => !!t)),
    ejecutadas: new Set(resultado.detecciones.map((d) => d.verificador).filter((v) => verificadorPorId(v))),
  };
}
