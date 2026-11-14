// Ciclo de aprendizaje: un hallazgo en obra (registrado por el supervisor y validado por el curador)
// se convierte en una prueba que corre sola sobre todo expediente nuevo que se ubique cerca.

import { distancia } from '../geo';
import { clasificar, type ModeloClasificador } from './clasificador';
import type { LatLng } from '../tipos';
import { normalizar } from './numeros';
import type { Presupuesto } from './presupuesto';
import type { Deteccion } from './tipos-analisis';

export interface HallazgoObra {
  id: string;
  obra: string;
  descripcion: string;
  ubicacion: LatLng;
  profundidad?: number;
  fecha: string;
  fuente: string; // p. ej. "Asiento N° 23 del cuaderno de obra"
}

export interface PruebaAprendida {
  id: string;
  nombre: string;
  causa: string;
  hallazgo: HallazgoObra;
  radio: number;
  palabrasPartida: string[];
  palabrasEstudio: string[];
  recomendacion: string;
  estado: 'candidata' | 'validada' | 'retirada';
  curador?: string;
  fechaValidacion?: string;
}

interface Plantilla { condicion: string; partida: string[]; estudio: string[]; recomendacion: string; radio: number }

/** Plantillas según lo que describe el hallazgo (causa sugerida por el clasificador + palabras del texto). */
function plantilla(causa: string, descripcion: string): Plantilla {
  const d = normalizar(descripcion);
  if (/NAPA|FREATIC|AGUA SUBTERRANEA|FILTRACION|AFLORAMIENTO DE AGUA/.test(d))
    return { condicion: 'Napa freática alta', partida: ['bombeo', 'abatimiento', 'achique', 'subdren', 'drenaje'], estudio: ['nivel freatico', 'napa'], radio: 400,
      recomendacion: 'Solicitar que el estudio de suelos sustente el nivel freático con exploración a la profundidad de excavación e incorporar bombeo o subdrenaje.' };
  if (/RELLENO|DESMONTE|BASURA|MATERIAL ORGANICO|NO CONTROLADO/.test(d))
    return { condicion: 'Relleno no controlado', partida: ['eliminacion de relleno', 'sobreexcavacion', 'reemplazo de material', 'mejoramiento de suelo', 'material de prestamo'], estudio: ['relleno'], radio: 200,
      recomendacion: 'Solicitar exploración adicional para descartar rellenos no controlados y, de confirmarse, la partida de eliminación y reemplazo de material (Norma E.050).' };
  if (causa === 'Interferencias' || /TUBERIA|RED DE|BUZON|CABLE|POSTE|CONEXION|INTERFEREN/.test(d))
    return { condicion: 'Red o instalación existente no catastrada', partida: ['reubicacion', 'proteccion de red', 'proteccion de tuberia', 'interferencia', 'empalme', 'desvio de red'], estudio: ['interferencia', 'catastro de redes', 'catastro de interferencias', 'proteccion de redes'], radio: 300,
      recomendacion: 'Solicitar el catastro de redes de la empresa prestadora (SEDALIB, Hidrandina) y las partidas de protección o reubicación de las redes existentes.' };
  if (/ROCA|PIEDRA|BOLONERIA|DURO/.test(d))
    return { condicion: 'Terreno rocoso no previsto', partida: ['roca', 'excavacion en terreno rocoso', 'voladura', 'roca suelta', 'roca fija'], estudio: ['roca'], radio: 300,
      recomendacion: 'Solicitar la clasificación del terreno por tramos y las partidas de excavación en roca.' };
  return { condicion: causa, partida: [], estudio: [], radio: 200, recomendacion: 'Evaluar si el expediente considera la condición registrada en la obra cercana.' };
}

export function borradorDesdeHallazgo(h: HallazgoObra, causaSugerida: string, numero: number): PruebaAprendida {
  const t = plantilla(causaSugerida, h.descripcion);
  return {
    id: `A-${String(numero).padStart(3, '0')}`,
    nombre: `${t.condicion} registrada en una obra cercana`,
    causa: causaSugerida, hallazgo: h, radio: t.radio, palabrasPartida: t.partida, palabrasEstudio: t.estudio,
    recomendacion: t.recomendacion, estado: 'candidata',
  };
}

/** Corre las pruebas aprendidas validadas sobre un expediente ubicado. */
export function evaluarAprendidas(pruebas: PruebaAprendida[], ubicacion: LatLng | undefined, presupuesto: Presupuesto | undefined, textoEstudios: string): Deteccion[] {
  const out: Deteccion[] = [];
  const texto = normalizar(textoEstudios);
  for (const p of pruebas.filter((x) => x.estado === 'validada')) {
    if (!ubicacion) {
      out.push({ verificador: p.id, resultado: 'no_verificable', severidad: 'media', titulo: p.nombre, detalle: 'El expediente no indica coordenadas: no se puede saber si está cerca del hallazgo.', evidencias: [] });
      continue;
    }
    const d = distancia(ubicacion, p.hallazgo.ubicacion);
    if (d > p.radio) continue;
    const h = p.hallazgo;
    const partida = presupuesto?.items.find((i) => !i.esTitulo && p.palabrasPartida.some((k) => normalizar(i.descripcion).includes(normalizar(k))));
    const enEstudio = p.palabrasEstudio.find((k) => texto.includes(normalizar(k)));
    const origen = { documento: `Hallazgo ${h.id} – ${h.fuente}`, extracto: `${h.obra} (${h.fecha}): "${h.descripcion}"${h.profundidad ? ` a ${h.profundidad} m` : ''}` };
    if (partida || enEstudio) {
      out.push({ verificador: p.id, resultado: 'pasa', severidad: 'baja', titulo: `${p.nombre}: el expediente la considera`,
        detalle: `A ${Math.round(d)} m se registró "${h.descripcion}". ${partida ? `El presupuesto incluye la partida ${partida.codigo} "${partida.descripcion}".` : ''}${enEstudio ? ` Los estudios mencionan "${enEstudio}".` : ''}`.trim(),
        evidencias: [origen, ...(partida ? [{ documento: 'Presupuesto', pagina: partida.pagina, extracto: partida.extracto }] : [])] });
    } else {
      out.push({ verificador: p.id, resultado: 'falla', severidad: 'alta', titulo: p.nombre,
        detalle: `A ${Math.round(d)} m de esta obra, en "${h.obra}", se registró: "${h.descripcion}"${h.profundidad ? ` a ${h.profundidad} m de profundidad` : ''}. Este expediente no menciona la condición en sus estudios ni tiene partidas para tratarla (${p.palabrasPartida.slice(0, 3).join(', ') || 'sin partidas asociadas'}). ${p.recomendacion}`,
        evidencias: [origen] });
    }
  }
  return out;
}

// ---------- Sugerencia de causa para un hallazgo de obra ----------
// El modelo aprendió del lenguaje de los pliegos (postores); los hallazgos de obra describen hechos físicos.
// Para esos hechos inequívocos manda una regla de campo explícita; en el resto, el modelo. El curador siempre decide.


const REGLAS_CAMPO: [RegExp, string, string][] = [
  [/TUBERIA|RED (DE )?(AGUA|DESAGUE|ALCANTARILLADO|ELECTRICA|GAS)|BUZON|CABLE|POSTE|CONEXION(ES)? DOMICILIARIA|CAJA DE (AGUA|REGISTRO|MEDIDOR)|DUCTO|INTERFEREN/, 'Interferencias', 'el hallazgo describe una red o instalación existente'],
  [/NAPA|FREATIC|AGUA SUBTERRANEA|FILTRACION|AFLORAMIENTO DE AGUA|SUELO SATURADO/, 'Estudios básicos', 'el hallazgo describe agua en el subsuelo'],
  [/RELLENO|DESMONTE|BASURA ENTERRADA|MATERIAL ORGANICO|ROCA|BOLONERIA|SUELO (BLANDO|COLAPSABLE|EXPANSIVO)|CAPACIDAD PORTANTE/, 'Estudios básicos', 'el hallazgo describe una condición del suelo'],
  [/RESTOS ARQUEOLOGICOS|HALLAZGO ARQUEOLOGICO|OSAMENTA|CERAMICA PREHISPANICA/, 'Normativa', 'el hallazgo describe restos arqueológicos (Ministerio de Cultura)'],
  [/INVASION|POSESIONARIO|NO HAY LIBRE DISPONIBILIDAD|PROPIEDAD DE TERCEROS|CERCO EXISTENTE/, 'Factibilidades y terreno', 'el hallazgo describe un problema de disponibilidad del terreno'],
];

export interface SugerenciaCausa { causa: string; fuente: 'regla de campo' | 'modelo'; motivo: string; probabilidad?: number; alternativas: { causa: string; probabilidad: number }[] }

export function sugerirCausaHallazgo(m: Pick<ModeloClasificador, 'tipo' | 'clases' | 'sesgo' | 'pesos' | 'idf' | 'temperatura'>, texto: string): SugerenciaCausa {
  const p = clasificar(m, texto);
  const n = normalizar(texto);
  const regla = REGLAS_CAMPO.find(([re]) => re.test(n));
  const alternativas = [{ causa: p.causa, probabilidad: p.probabilidad }, ...p.alternativas];
  if (regla) return { causa: regla[1], fuente: 'regla de campo', motivo: regla[2], alternativas: alternativas.filter((a) => a.causa !== regla[1]).slice(0, 2) };
  return { causa: p.causa, fuente: 'modelo', motivo: p.porque.length ? `palabras que más pesaron: ${p.porque.join(', ')}` : 'sin palabras conocidas', probabilidad: p.probabilidad, alternativas: p.alternativas };
}
