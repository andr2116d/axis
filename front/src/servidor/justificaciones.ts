import 'server-only';
import type { Expediente, Fuente, Hallazgo, Justificacion } from '@/dominio/tipos';
import { verificadorPorId } from '@/datos/verificadores';
import * as almacen from './almacen';
import { clasificador } from './analisis/datos';
import { sugerirCausaHallazgo } from './analisis/aprendizaje';
import { citar, compactar, palabras, plano } from './texto';

// Motor «Juicio de experto»: el evaluador puede justificar una alerta (una obra remota
// cuesta más, un rendimiento distinto por el clima…). Axis no la acepta por buena fe:
// revisa que explique algo, que hable de lo que observa la alerta, que cuantifique,
// que el documento citado la respalde y que no contradiga lo que el expediente dice
// de la obra. Si no, dice qué falta. Cada decisión queda registrada para el control.

/** Errores objetivos: se corrigen, no se justifican (una suma que no cuadra no tiene contexto). */
const NO_JUSTIFICABLES: Record<string, string> = {
  'V-LETRAS': 'el monto en letras debe coincidir con el monto en números',
  'V-ARIT-TITULO': 'un subtotal que no suma sus partidas es un error de cálculo',
  'V-RESUMEN': 'el resumen del presupuesto debe cuadrar aritméticamente',
  'V-APU-SUMA': 'un análisis de precios que no suma su costo unitario es un error de cálculo',
  'X-APU-PRES': 'el precio del presupuesto debe ser el de su análisis de precios',
  'X-MET-PRES': 'el presupuesto y la planilla de metrados deben tener la misma cantidad',
  'V-GEOMETRIA': 'el volumen debe ser área por espesor',
  'V-IMPOSIBLE': 'una dimensión físicamente imposible es un error de digitación',
  'X-IDENTIDAD': 'un documento de otra obra no se justifica: se reemplaza',
  'X-FECHAS': 'una cotización posterior al presupuesto no pudo sustentarlo',
};

/** Distritos urbanos del área metropolitana de Trujillo: «obra remota» no encaja ahí. */
const URBANOS = ['TRUJILLO', 'LA ESPERANZA', 'EL PORVENIR', 'FLORENCIA DE MORA', 'VICTOR LARCO', 'HUANCHACO', 'MOCHE', 'LAREDO', 'ALTO TRUJILLO', 'SALAVERRY'];
const REMOTO = /REMOT|DIFICIL ACCESO|LEJAN|AISLAD|ACEMILA|BURRO|MULA|TROCHA|HERRADURA|SIN ACCESO VEHICULAR|A PIE|HORAS DE CAMINO/;

const VACIAS = new Set(['QUE', 'SON', 'POR', 'ESTE', 'ESTA', 'ESTO', 'COMO', 'PERO', 'MAS', 'TIENE', 'TIENEN', 'HAY', 'SER', 'FUE', 'SIDO', 'UNA', 'UNO', 'SUS', 'LAS', 'LOS', 'DEL', 'PARA', 'CON', 'SIN', 'MUY', 'YA', 'NOS', 'ESE', 'ESA', 'OBRA', 'EXPEDIENTE', 'PORQUE', 'SOLO', 'TODO', 'BIEN', 'CASO', 'ZONA']);
const raiz = (p: string) => p.slice(0, 5);
const significativas = (t: string) => [...palabras(t)].filter((p) => !VACIAS.has(p) && !/^\d+$/.test(p));

const NUMERO_CON_UNIDAD = /(S\/\s?\d|\d[\d.,]*\s?(%|KM|M3|M2|ML|M\b|KG|TN|HORAS?|HRS?|DIAS?|SOLES|UND|GLB|VIAJES?|MESES?))/;
const VOCAB_COSTO = ['COSTO', 'PRECIO', 'FLETE', 'TRANSP', 'COTIZ', 'MOVIL', 'ACARR', 'PROVE', 'INSUM', 'JORNA'];

const COMPARTIDAS_MIN = 2;

export async function justificar(id: string, entrada: { hallazgo: string; texto: string; documento?: string }): Promise<Expediente> {
  const e = await almacen.leerExpediente(id);
  if (!e) throw new Error('Expediente no encontrado');
  const h = e.hallazgos.find((x) => x.id === entrada.hallazgo);
  if (!h) throw new Error('La alerta no existe en esta revisión.');
  const texto = compactar(entrada.texto ?? '').slice(0, 2000);
  const doc = entrada.documento ? e.documentos.find((d) => d.id === entrada.documento) : undefined;
  const paginas = doc ? await almacen.leerTexto('expedientes', e.id, doc.id) : [];
  const evaluacion = evaluarJustificacion(e, h, texto, doc ? { nombre: doc.nombre, unidad: doc.unidad, paginas } : undefined);
  const j: Justificacion = { hallazgo: h.id, texto, documento: doc?.id, fecha: new Date().toISOString(), evaluacion };
  e.justificaciones = [...(e.justificaciones ?? []).filter((x) => x.hallazgo !== h.id), j];
  // Una alerta justificada y aceptada sale de la carta; si no se acepta, se queda.
  if (evaluacion.veredicto === 'aceptada') e.carta.incluidos = e.carta.incluidos.filter((x) => x !== h.id);
  await almacen.guardarExpediente(e);
  return e;
}

export async function retirarJustificacion(id: string, hallazgo: string): Promise<Expediente> {
  const e = await almacen.leerExpediente(id);
  if (!e) throw new Error('Expediente no encontrado');
  e.justificaciones = (e.justificaciones ?? []).filter((x) => x.hallazgo !== hallazgo);
  if (!e.carta.incluidos.includes(hallazgo) && e.hallazgos.some((x) => x.id === hallazgo)) e.carta.incluidos.push(hallazgo);
  await almacen.guardarExpediente(e);
  return e;
}

export function evaluarJustificacion(
  e: Expediente, h: Hallazgo, texto: string,
  doc?: { nombre: string; unidad: string; paginas: string[] },
): Justificacion['evaluacion'] {
  const razones: string[] = [];
  const faltan: string[] = [];

  if (h.prueba && NO_JUSTIFICABLES[h.prueba]) {
    return {
      veredicto: 'no-justificable',
      razones: [],
      faltan: [`Esta alerta es un error objetivo: ${NO_JUSTIFICABLES[h.prueba]}. El juicio de experto no aplica: hay que corregir el documento y subir la versión corregida.`],
    };
  }

  const plana = plano(texto);
  const suyas = significativas(texto);

  // 1. Que explique algo.
  const distintas = new Set(plana.replace(/[^A-ZÑ]/g, ''));
  if (suyas.length < 8 || distintas.size < 8) {
    return {
      veredicto: 'insuficiente',
      razones: [],
      faltan: [`La justificación es demasiado corta para sustentar nada (${suyas.length} palabra${suyas.length === 1 ? '' : 's'} con contenido). Explicar qué condición de la obra hace que la alerta no aplique, con cifras y el documento que lo respalda.`],
    };
  }

  // 2. Que hable de lo que observa la alerta (palabras en común o el mismo tema según el clasificador).
  const deLaAlerta = new Set(significativas([h.titulo, h.detalle, h.accion, ...h.fuentes.map((f) => f.extracto)].join(' ')).map(raiz));
  const comunes = [...new Set(suyas.map(raiz))].filter((r) => deLaAlerta.has(r));
  const causaAlerta = h.prueba ? verificadorPorId(h.prueba)?.causa : undefined;
  const tema = sugerirCausaHallazgo(clasificador(), texto);
  const mismoTema = !!causaAlerta && tema.causa === causaAlerta;
  if (comunes.length >= COMPARTIDAS_MIN || mismoTema) {
    razones.push(comunes.length >= COMPARTIDAS_MIN
      ? `Se refiere a lo que observa la alerta (${comunes.length} términos en común).`
      : `El clasificador ubica la justificación en el mismo tema que la alerta (${causaAlerta}).`);
  } else {
    faltan.push(`Referirse a lo que observa la alerta: «${h.titulo}».${causaAlerta && tema.causa !== causaAlerta ? ` El clasificador ubica el texto en «${tema.causa}», no en «${causaAlerta}».` : ''}`);
  }

  // 3. Que cuantifique, si la alerta es de costos o cantidades.
  const pideCifras = h.categoria === 'costos' || h.categoria === 'documentos' || !!h.monto || VOCAB_COSTO.some((v) => plana.includes(v));
  const cifras = NUMERO_CON_UNIDAD.test(plana);
  if (pideCifras) {
    if (cifras) razones.push('Cuantifica el sustento (montos, distancias, tiempos o porcentajes).');
    else faltan.push('Cuantificar: cuánto cuesta, cuánto mide o cuánto tarda (por ejemplo «flete S/ 85 por viaje, 4 h de trocha»).');
  }

  // 4. Que el documento citado respalde lo NUEVO que dice la justificación (no las palabras de la alerta).
  let respaldo: Fuente | undefined;
  if (doc) {
    const textoAlerta = plano([h.titulo, h.detalle, ...h.fuentes.map((f) => f.extracto)].join(' '));
    const buscar = new Set(suyas.filter((p) => p.length > 4).map(raiz).filter((r) => !deLaAlerta.has(r)));
    const numeros = [...plana.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => m[0].replace(',', '.')).filter((n) => Number(n) >= 2 && !textoAlerta.includes(n));
    let mejor = { pagina: -1, puntos: 0, linea: '' };
    doc.paginas.forEach((pag, i) => {
      const p = plano(pag);
      const terminos = [...buscar].filter((r) => p.includes(r)).length;
      const nums = numeros.filter((n) => p.includes(n)).length;
      const puntos = terminos + 2 * nums;
      if (puntos > mejor.puntos) {
        const linea = pag.split('\n').map((l) => ({ l, n: [...buscar].filter((r) => plano(l).includes(r)).length + numeros.filter((x) => plano(l).includes(x)).length }))
          .sort((a, b) => b.n - a.n)[0]?.l ?? '';
        mejor = { pagina: i, puntos, linea };
      }
    });
    if (mejor.puntos >= 3) {
      respaldo = { documento: doc.nombre, pagina: citar(doc.unidad, mejor.pagina + 1), extracto: compactar(mejor.linea.replace(/ \| /g, ' · ')).slice(0, 220) };
      razones.push(`${doc.nombre} lo respalda en ${respaldo.pagina}.`);
    } else {
      faltan.push(`${doc.nombre} no menciona lo que dice la justificación. Citar el documento que sí lo sustenta (cotización, estudio, acta, memoria).`);
    }
  } else if (h.prioridad === 'alta') {
    faltan.push('Una alerta de prioridad alta necesita un documento de sustento del expediente (cotización, estudio, memoria o acta).');
  }

  // 5. Que no contradiga lo que se sabe de la obra.
  const distrito = plano(e.ubicacion?.distrito ?? e.lugar ?? '');
  if (REMOTO.test(plana) && URBANOS.some((u) => distrito.includes(u))) {
    faltan.push(`La justificación alega una zona remota o de difícil acceso, pero la obra está en ${e.ubicacion?.distrito ?? e.lugar}, área urbana de Trujillo con acceso vehicular. Sustentar con la ruta real y su costo.`);
  }

  return { veredicto: faltan.length ? 'insuficiente' : 'aceptada', razones, faltan, respaldo };
}
