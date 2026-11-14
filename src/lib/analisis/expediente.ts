// Orquestador del análisis real de un expediente técnico.
// Recibe las páginas (ya sin datos personales), reconoce cada documento, lo lee y corre todos los verificadores.

import { verificarContexto, tipoDesdeNombre, vias, type DatosTerritorio, type ObraContexto } from './contexto';
import { ubicarPorNombre, verificarTerreno, type ResultadoTerreno } from './terreno';
import { planVerificacion, type AntecedentesContraloria, type PuntoControl } from './supervision';
import { seccionTipica, verificarSeccion, type SeccionVial } from './seccion';
import { evaluarAprendidas, type PruebaAprendida } from './aprendizaje';
import { identidadPagina, leerApu, leerCotizaciones, leerCronograma, leerEspecificaciones, leerFormulaPolinomica, leerGastosGenerales, leerMetrados, leerPlanos } from './lectores';
import { normalizar } from './numeros';
import { leerPresupuesto, type Presupuesto } from './presupuesto';
import type { Deteccion } from './tipos-analisis';
import { apuInterno, apuVsPresupuesto, coberturaEspecificaciones, fechasCotizaciones, formulaPolinomica, gastosGenerales, identidadDocumentos, planosMinimos, presupuestoVsEspecificaciones, presupuestoVsMetrados, rendimientoCronograma, secuenciaCronograma } from './verificar-cruzado';
import { verificarPresupuesto } from './verificar-presupuesto';
import { evaluarPertinencia, type Pertinencia } from './pertinencia';
import type { LatLng } from '../tipos';

import { NOMBRE_DOCUMENTO, type Documento } from './nombres';
export { NOMBRE_DOCUMENTO, type Documento };

type Pag = { numero: number; lineas: string[] };
import { clasificarPaginas, pareceBases } from './nombres';
export { clasificarPaginas, pareceBases };

export interface DatosGenerales { nombre?: string; cui?: string; plazoDias?: number; ubicacion?: LatLng; distrito?: string; longitudM?: number; anchoCalzadaM?: number;
  /** La ubicación no venía en el expediente: se estimó por el nombre de la vía. */
  ubicacionEstimada?: { via: string; distrito: string; tramo?: { desde: string; hasta: string; largo: number } } }

/** Datos generales desde carátula y memoria: nombre, CUI, plazo y coordenadas (geográficas o UTM 17S). */
export function leerDatosGenerales(paginas: Pag[], utmALatLng?: (e: number, n: number) => LatLng): DatosGenerales {
  const texto = paginas.map((p) => p.lineas.join('\n')).join('\n');
  const n = normalizar(texto);
  const out: DatosGenerales = {};
  const cui = n.match(/\b(?:CUI|CODIGO UNICO(?: DE INVERSIONES)?)\s*(?:N[°ºO]\.?)?\s*:?\s*(\d{7})\b/);
  if (cui) out.cui = cui[1];
  const nom = texto.match(/(?:PROYECTO|OBRA|NOMBRE DEL PROYECTO)\s*:\s*["“]?([^\n"”]{15,250})/i);
  if (nom) out.nombre = nom[1].replace(/\s*\|\s*/g, ' ').trim();
  const plazo = n.match(/PLAZO DE EJECUCION\s*:?\s*(\d{2,4})\s*(?:\(\w+\)\s*)?DIAS/);
  if (plazo) out.plazoDias = Number(plazo[1]);
  const geo = texto.match(/(-\d{1,2}\.\d{3,})\s*[,;\s]\s*(-\d{2}\.\d{3,})/);
  if (geo) out.ubicacion = { lat: Number(geo[1]), lng: Number(geo[2]) };
  else if (utmALatLng) {
    const e = n.match(/\bESTE\s*:?\s*(\d{6}(?:\.\d+)?)/), no = n.match(/\bNORTE\s*:?\s*(\d{7}(?:\.\d+)?)/);
    if (e && no) out.ubicacion = utmALatLng(Number(e[1]), Number(no[1]));
  }
  const dist = n.match(/DISTRITO\s*(?:DE)?\s*:?\s*([A-Z ]{4,30}?)(?:,|\s+PROVINCIA|\n|$)/);
  if (dist) out.distrito = dist[1].trim();
  const lon = n.match(/(\d{2,5}(?:\.\d+)?)\s*M(?:ETROS|L)?\.?\s+DE\s+LONGITUD/) ?? n.match(/LONGITUD(?: TOTAL)?(?: DE LA VIA)?\s*:\s*(\d{2,5}(?:\.\d+)?)\s*M/);
  if (lon) out.longitudM = Number(lon[1]);
  const ancho = n.match(/(?:CALZADA|PAVIMENTO \w+)[^.\n]{0,30}?DE\s+(\d{1,2}\.\d{1,2})\s*M\s+DE\s+ANCHO/);
  if (ancho) out.anchoCalzadaM = Number(ancho[1]);
  return out;
}

export interface ResultadoAnalisis {
  generales: DatosGenerales;
  documentos: { pagina: number; documento: Documento }[];
  faltantes: Documento[];
  presupuesto?: Presupuesto;
  /** Gemelo de terreno (perfil, cuenca y trazo real) cuando la obra está en el área del modelo. */
  terreno?: ResultadoTerreno;
  /** El archivo parece las bases del procedimiento de selección, no el expediente técnico. */
  pareceBases: boolean;
  /** Plan de control de calidad en obra para el supervisor, priorizado con hallazgos reales de la Contraloría. */
  planObra?: PuntoControl[];
  /** Sección vial paramétrica (capas, corte y anchos) para el modelo 3D. */
  seccion?: SeccionVial;
  /** ¿Lo subido es un expediente técnico de obra? Si no, no se corren las pruebas. */
  pertinencia: Pertinencia;
  /** Grupos de pruebas que sí pudieron correr (con los documentos que había). Sin esto, "sin observaciones" no dice nada. */
  cobertura: string[];
  /** Ámbito para el que está afinado Axis: si la obra no es vial, las pruebas de la calle no aplican. */
  ambito: { tipo: ReturnType<typeof tipoDesdeNombre>; vial: boolean };
  conteos: { partidas: number; metrados: number; especificaciones: number; actividades: number; formulas: number; cotizaciones: number; apus: number; gastosGenerales: number; planos: number };
  detecciones: Deteccion[];
}

const PESO_SEV = { alta: 3, media: 2, baja: 1 } as const;

function agrupar(det: Deteccion[], nPartidas: number): Deteccion[] {
  const porId = new Map<string, Deteccion[]>();
  for (const d of det) if (d.resultado === 'falla') porId.set(d.verificador, [...(porId.get(d.verificador) ?? []), d]);
  const out = det.filter((d) => d.resultado !== 'falla' || (porId.get(d.verificador)?.length ?? 0) <= 6);
  for (const [id, lista] of porId) {
    if (lista.length <= 6) continue;
    const masiva = nPartidas > 0 && lista.length > Math.max(10, nPartidas * 0.4);
    const sev = lista.some((d) => d.severidad === 'alta') ? 'alta' : lista.some((d) => d.severidad === 'media') ? 'media' : 'baja';
    out.push({
      verificador: id, resultado: masiva ? 'no_verificable' : 'falla', severidad: masiva ? 'media' : sev,
      titulo: masiva ? `${lista.length} alertas del mismo tipo: probablemente el documento no se leyó bien` : `${lista.length} casos: ${lista[0].titulo.replace(/\s*\([^)]*\)\s*$/, '')}`,
      detalle: (masiva ? 'Cuando una misma prueba falla en casi todas las partidas, lo usual es un formato que Axis no leyó bien, no un expediente con todos esos errores. Revise el documento o confirme la clasificación de páginas. ' : '')
        + 'Casos: ' + lista.slice(0, 8).map((d) => d.titulo).join('; ') + (lista.length > 8 ? `; y ${lista.length - 8} más.` : '.'),
      evidencias: lista.slice(0, 3).flatMap((d) => d.evidencias.slice(0, 1)),
      montoInvolucrado: masiva ? undefined : lista.reduce((s, d) => s + (d.montoInvolucrado ?? 0), 0) || undefined,
    });
  }
  return out;
}

const PESO_RES = { falla: 0, no_verificable: 1, pasa: 2 } as const;

export interface OpcionesAnalisis {
  territorio?: DatosTerritorio; utmALatLng?: (e: number, n: number) => LatLng; aprendidas?: PruebaAprendida[]; antecedentes?: AntecedentesContraloria;
  /** Clasificación de páginas confirmada por la persona (tiene prioridad sobre la automática). */
  clasificacion?: { pagina: number; documento: Documento }[];
  /** true si solo se subieron algunos documentos: lo que falta no es una observación, solo limita lo que se puede revisar. */
  parcial?: boolean;
  /** true si la persona indicó a mano qué es cada parte: entonces se revisa aunque el filtro de pertinencia dude. */
  partesIndicadas?: boolean;
}

/** Rango aproximado de La Libertad: fuera de él no hay datos del territorio. */
const EN_LA_LIBERTAD = (u: LatLng) => u.lat > -9.0 && u.lat < -6.9 && u.lng > -79.8 && u.lng < -76.9;
const PARTES_REQUERIDAS: Documento[] = ['memoria', 'presupuesto', 'metrados', 'apu', 'gastos', 'especificaciones', 'cronograma', 'formula', 'suelos', 'planos'];

export function analizarExpediente(paginas: Pag[], opciones: OpcionesAnalisis = {}): ResultadoAnalisis {
  const auto = clasificarPaginas(paginas);
  const dada = new Map((opciones.clasificacion ?? []).map((c) => [c.pagina, c.documento]));
  const documentos = auto.map((a) => ({ pagina: a.pagina, documento: dada.get(a.pagina) ?? a.documento }));
  // Lo que la persona dejó fuera ("otro") no cuenta para decidir si es un expediente
  const usadas = paginas.filter((p) => documentos.find((x) => x.pagina === p.numero)?.documento !== 'otro');
  const pertinencia = evaluarPertinencia(usadas);
  const indicadas = !!opciones.partesIndicadas && (opciones.clasificacion ?? []).some((c) => PARTES_REQUERIDAS.includes(c.documento));
  if (pertinencia.nivel === 'ajeno' && !indicadas) return sinRevision(documentos, pertinencia, pareceBases(paginas));
  const de = (d: Documento) => paginas.filter((p) => documentos.find((x) => x.pagina === p.numero)?.documento === d);
  const generales = leerDatosGenerales([...de('caratula'), ...de('memoria')], opciones.utmALatLng);
  const det: Deteccion[] = [];
  let terreno: ResultadoTerreno | undefined;
  let seccion: SeccionVial | undefined;

  const pagPres = de('presupuesto');
  const presupuesto = pagPres.length ? leerPresupuesto(pagPres) : undefined;
  if (presupuesto && !generales.cui && presupuesto.cui) generales.cui = presupuesto.cui;
  if (presupuesto && !generales.nombre && presupuesto.nombreObra) generales.nombre = presupuesto.nombreObra;
  // Axis está afinado para pistas y veredas: en un colegio o un sistema de agua las pruebas de la calle no aplican
  const tipoObra = tipoDesdeNombre(generales.nombre ?? '');
  const vial = tipoObra === 'pistas_veredas' || tipoObra === 'otro';
  if (!vial) det.push({ verificador: 'D-ALCANCE', resultado: 'no_verificable', severidad: 'baja', titulo: `La obra es de ${tipoObra === 'educacion' ? 'infraestructura educativa' : 'agua y saneamiento'}, no de pistas y veredas`,
    detalle: 'Axis está afinado para pistas y veredas. Se revisaron los documentos (presupuesto, metrados, precios, plazos), pero no la sección de la vía ni el drenaje de la calle.', evidencias: [] });
  const metrados = leerMetrados(de('metrados'));
  const et = leerEspecificaciones(de('especificaciones'));
  const acts = leerCronograma(de('cronograma'));
  const formulas = leerFormulaPolinomica([...de('formula'), ...de('presupuesto')]);
  const cot = leerCotizaciones(de('cotizaciones'));
  const apus = leerApu(de('apu'));
  const gg = leerGastosGenerales(de('gastos'));
  const planos = leerPlanos(de('planos'));

  const faltantes = PARTES_REQUERIDAS.filter((d) => !documentos.some((x) => x.documento === d));
  for (const f of faltantes) {
    if (opciones.parcial) {
      det.push({ verificador: 'D-CONTENIDO', resultado: 'no_verificable', severidad: 'baja', titulo: `No se subió: ${NOMBRE_DOCUMENTO[f].toLowerCase()}`,
        detalle: `Las pruebas que necesitan ${NOMBRE_DOCUMENTO[f].toLowerCase()} no se pudieron correr.`, evidencias: [] });
      continue;
    }
    det.push({ verificador: 'D-CONTENIDO', resultado: 'falla', severidad: ['presupuesto', 'metrados', 'suelos', 'apu'].includes(f) ? 'alta' : 'media',
      titulo: `Falta: ${NOMBRE_DOCUMENTO[f].toLowerCase()}`, detalle: `El expediente no incluye ${NOMBRE_DOCUMENTO[f].toLowerCase()}, que forma parte del contenido mínimo del expediente técnico de obra.`, evidencias: [] });
  }

  if (presupuesto && !presupuesto.items.some((i) => !i.esTitulo)) {
    det.push({ verificador: 'V-LEGIBLE', resultado: 'no_verificable', severidad: 'media', titulo: 'No se pudo leer el presupuesto',
      detalle: `Las páginas marcadas como presupuesto (${pagPres.map((p) => p.numero).join(', ')}) no tienen partidas legibles: puede ser un escaneo o un formato no reconocido. Las pruebas de presupuesto, metrados y precios no corrieron. Pida la versión digital (exportada de S10, Excel o Word).`, evidencias: [] });
  } else if (presupuesto) {
    det.push(...verificarPresupuesto(presupuesto));
    if (!faltantes.includes('metrados')) det.push(...presupuestoVsMetrados(presupuesto, metrados));
    det.push(...presupuestoVsEspecificaciones(presupuesto, et));
    det.push(...fechasCotizaciones(presupuesto, cot));
    det.push(...coberturaEspecificaciones(presupuesto, et));
    det.push(...apuVsPresupuesto(presupuesto, apus));
    det.push(...rendimientoCronograma(presupuesto, apus, acts));
    if (vial) {
      seccion = seccionTipica(presupuesto, et, generales, de('memoria').map((p) => p.lineas.join(' ')).join(' '));
      det.push(...verificarSeccion(seccion));
    }
  }
  det.push(...formulaPolinomica(formulas));
  det.push(...apuInterno(apus));
  det.push(...gastosGenerales(presupuesto, gg, generales.plazoDias));
  det.push(...planosMinimos(presupuesto, planos, tipoDesdeNombre(generales.nombre ?? '')));
  if (documentos.some((x) => x.documento === 'cronograma')) det.push(...secuenciaCronograma(acts, generales.plazoDias));

  // Identidad: cada documento debe ser de la misma obra
  const ids = paginas.map((p) => ({ p, d: documentos.find((x) => x.pagina === p.numero)!.documento, ...identidadPagina(p) }))
    .filter((x) => x.d !== 'caratula' && (x.cui || x.proyecto));
  const porDoc = new Map<string, (typeof ids)[number]>();
  for (const x of ids) if (!porDoc.has(x.d)) porDoc.set(x.d, x);
  det.push(...identidadDocumentos({ cui: generales.cui, nombre: generales.nombre },
    [...porDoc.values()].map((x) => ({ documento: NOMBRE_DOCUMENTO[x.d], pagina: x.p.numero, cui: x.cui, proyecto: x.proyecto }))));

  // Sin coordenadas: se estima la ubicación por el nombre de la vía dentro del distrito (se avisa que es estimada)
  if (vial && opciones.territorio && !generales.ubicacion && opciones.territorio.red && opciones.territorio.distritos) {
    // Distrito: de la memoria, del nombre del proyecto o de la línea «Lugar» del presupuesto (LA LIBERTAD - TRUJILLO - EL PORVENIR)
    const distrito = generales.distrito ?? normalizar(generales.nombre ?? '').match(/DISTRITO DE\s+([A-Z ]{3,30}?)(?:,|\s+PROVINCIA|\s+DEPARTAMENTO|$)/)?.[1]
      ?? (presupuesto?.lugar ? normalizar(presupuesto.lugar).split(/\s*-\s*/).pop()?.trim() : undefined);
    const est = ubicarPorNombre([...vias(generales.nombre ?? '')], distrito, opciones.territorio.red, opciones.territorio.distritos.features);
    if (est) {
      generales.ubicacion = est.ubicacion; generales.distrito ??= est.distrito;
      generales.ubicacionEstimada = { via: est.via, distrito: est.distrito, tramo: est.tramo };
      det.push({ verificador: 'C-UBICACION', resultado: 'no_verificable', severidad: 'baja', titulo: 'Ubicación estimada por el nombre de la vía',
        detalle: `El expediente no trae coordenadas. Axis ubicó «${est.via}» en el distrito de ${est.distrito.toLowerCase()} con OpenStreetMap${est.tramo ? `, entre ${est.tramo.desde.toLowerCase()} y ${est.tramo.hasta.toLowerCase()} (${Math.round(est.tramo.largo)} m)` : ''}. Las pruebas de contexto usan esa ubicación: confírmela en los planos.`, evidencias: [] });
    }
  }

  // Contexto territorial real (solo hay datos de La Libertad)
  const fuera = generales.ubicacion && !EN_LA_LIBERTAD(generales.ubicacion);
  if (fuera) {
    det.push({ verificador: 'C-UBICACION', resultado: 'no_verificable', severidad: 'baja', titulo: 'La obra está fuera de La Libertad',
      detalle: `Las coordenadas del expediente (${generales.ubicacion!.lat.toFixed(4)}, ${generales.ubicacion!.lng.toFixed(4)}) quedan fuera de La Libertad, donde Axis tiene los datos del territorio. Las pruebas de documentos sí corrieron; las del entorno no. Si es un error de coordenadas, corríjalo en la memoria.`, evidencias: [] });
  } else if (opciones.territorio && generales.ubicacion) {
    const obra: ObraContexto = { cui: generales.cui, nombre: generales.nombre ?? '', tipo: tipoDesdeNombre(generales.nombre ?? ''), ubicacion: generales.ubicacion };
    const ctx = verificarContexto(obra, opciones.territorio);
    // Con ubicación estimada por el nombre, el contexto orienta pero no puede ser «grave»: la posición exacta no está confirmada
    if (generales.ubicacionEstimada) for (const d of ctx) if (d.resultado === 'falla') {
      if (d.severidad === 'alta') d.severidad = 'media';
      d.detalle += ' (Ubicación estimada por el nombre de la vía: confírmela antes de pedir cambios.)';
    }
    det.push(...ctx);
    if (vial && opciones.territorio.dem && opciones.territorio.red) {
      const textoEstudios = [...de('memoria'), ...de('especificaciones'), ...de('planos')].map((p) => p.lineas.join(' ')).join(' ');
      const r = verificarTerreno(opciones.territorio.dem, opciones.territorio.red, {
        ubicacion: generales.ubicacion, nombresVia: [...vias(generales.nombre ?? '')], longitudDeclarada: generales.longitudM, largoRecorte: generales.ubicacionEstimada?.tramo?.largo,
        partidas: presupuesto?.items.map((i) => ({ codigo: i.codigo, descripcion: i.descripcion, esTitulo: i.esTitulo })) ?? [], textoEstudios, nombreProyecto: generales.nombre,
      });
      det.push(...r.detecciones); terreno = r.terreno;
    }
  } else if (opciones.territorio) {
    det.push({ verificador: 'C-UBICACION', resultado: 'no_verificable', severidad: 'media', titulo: 'El expediente no indica coordenadas de la obra', detalle: 'Sin coordenadas no se pueden revisar peligros, puntos críticos ni otras inversiones en la zona.', evidencias: [] });
  }

  // Pruebas aprendidas de hallazgos en obras cercanas (ciclo de aprendizaje)
  if (opciones.aprendidas?.length) {
    const textoEstudios = [...de('suelos'), ...de('memoria'), ...de('especificaciones')].map((p) => p.lineas.join(' ')).join(' ');
    det.push(...evaluarAprendidas(opciones.aprendidas, generales.ubicacion, presupuesto, textoEstudios));
  }

  // Muchas alertas iguales: se agrupan; si tocan a demasiadas partidas, es un problema de lectura y no se acusa.
  const agrupadas = agrupar(det, presupuesto?.items.filter((i) => !i.esTitulo).length ?? 0);
  det.length = 0; det.push(...agrupadas);
  det.sort((a, b) => PESO_RES[a.resultado] - PESO_RES[b.resultado] || PESO_SEV[b.severidad] - PESO_SEV[a.severidad] || (b.montoInvolucrado ?? 0) - (a.montoInvolucrado ?? 0));
  // Qué grupos de pruebas tuvieron con qué trabajar
  const hay = (d: Documento) => documentos.some((x) => x.documento === d);
  const legible = !!presupuesto?.items.some((i) => !i.esTitulo);
  const cobertura = [
    legible && 'Aritmética y montos del presupuesto',
    legible && metrados.length && 'Presupuesto contra metrados',
    legible && et.length && 'Presupuesto contra especificaciones',
    apus.length && 'Análisis de precios unitarios',
    gg && 'Gastos generales',
    hay('cronograma') && acts.length && 'Cronograma y plazo',
    formulas.length && 'Fórmula polinómica',
    cot.length && 'Cotizaciones',
    planos.length && 'Planos',
    seccion && 'Sección de la vía',
    generales.ubicacion && !fuera && opciones.territorio && 'Entorno de la obra',
    terreno?.perfil && 'Terreno y drenaje',
  ].filter((x): x is string => typeof x === 'string');
  return {
    generales, documentos, faltantes, presupuesto, terreno, seccion, pareceBases: pareceBases(paginas), pertinencia, cobertura, ambito: { tipo: tipoObra, vial },
    planObra: presupuesto ? planVerificacion(presupuesto, et, opciones.antecedentes) : undefined,
    conteos: { partidas: presupuesto?.items.filter((i) => !i.esTitulo).length ?? 0, metrados: metrados.length, especificaciones: et.length, actividades: acts.length, formulas: formulas.length, cotizaciones: cot.length, apus: apus.length, gastosGenerales: gg?.items.length ?? 0, planos: planos.length },
    detecciones: det,
  };
}

/** Lo subido no es un expediente: no se corre ninguna prueba (un CV "sin observaciones" no significa nada). */
function sinRevision(documentos: { pagina: number; documento: Documento }[], pertinencia: Pertinencia, bases: boolean): ResultadoAnalisis {
  return {
    generales: {}, documentos, faltantes: [], pareceBases: bases, pertinencia, cobertura: [], ambito: { tipo: 'otro', vial: true },
    conteos: { partidas: 0, metrados: 0, especificaciones: 0, actividades: 0, formulas: 0, cotizaciones: 0, apus: 0, gastosGenerales: 0, planos: 0 },
    detecciones: [{ verificador: 'D-PERTINENCIA', resultado: 'no_verificable', severidad: 'alta', titulo: 'Esto no parece un expediente técnico de obra', detalle: pertinencia.motivo + ' No se corrió ninguna prueba.', evidencias: [] }],
  };
}
