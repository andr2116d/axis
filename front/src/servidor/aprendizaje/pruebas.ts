import type { Fuente, Hallazgo, LatLng, PruebaAprendida } from '@/dominio/tipos';
import { distancia } from '../analisis/geo';
import { normalizar } from '../analisis/numeros';
import { CONDICIONES, presente } from './condiciones';

// Corre las pruebas aprendidas de obras terminadas o paralizadas sobre un expediente.
// Una prueba aplica si la obra está dentro de su radio (o, sin coordenadas, en el mismo
// distrito). Si el expediente no tiene partidas ni estudios para la condición, alerta.

export interface ObraEvaluada {
  id: string;
  ubicacion: LatLng | null;
  distrito: string | null;
  /** Texto de presupuesto, metrados y precios unitarios. */
  textoPartidas: string;
  /** Texto de memoria, estudios y especificaciones. */
  textoEstudios: string;
}

export type Veredicto =
  | { aplica: false; motivo: string }
  | { aplica: true; dispara: false; evidencia: string; distancia?: number }
  | { aplica: true; dispara: true; distancia?: number };

export function evaluarPrueba(p: PruebaAprendida, obra: ObraEvaluada): Veredicto {
  let d: number | undefined;
  if (p.alcance.centro && obra.ubicacion) {
    d = Math.round(distancia(p.alcance.centro, obra.ubicacion));
    if (d > p.alcance.radio) return { aplica: false, motivo: `a ${d} m, fuera del radio de ${p.alcance.radio} m` };
  } else {
    const mismo = p.alcance.distrito && obra.distrito && normalizar(p.alcance.distrito) === normalizar(obra.distrito);
    if (!mismo) return { aplica: false, motivo: 'sin coordenadas y en otro distrito' };
  }
  const partida = presente(obra.textoPartidas, p.palabrasPartida);
  const estudio = presente(obra.textoEstudios, p.palabrasEstudio);
  if (partida || estudio) return { aplica: true, dispara: false, distancia: d, evidencia: partida ? `partida con «${partida}»` : `estudios que mencionan «${estudio}»` };
  return { aplica: true, dispara: true, distancia: d };
}

export function hallazgoDePrueba(p: PruebaAprendida, v: Extract<Veredicto, { dispara: true }>): Omit<Hallazgo, 'id'> {
  const o = p.origen;
  const donde = v.distancia !== undefined ? `A ${v.distancia} m de esta obra` : `En el mismo distrito`;
  const fuentes: Fuente[] = [{ ...o.fuente, documento: `${o.obraClave} · ${o.fuente.documento}` }];
  return {
    categoria: 'aprendidas', prioridad: 'alta',
    titulo: p.nombre,
    detalle: `${donde}, en la obra «${o.expedienteNombre}» (${o.situacion}), se registró esta condición y su expediente no la había previsto. Este expediente tampoco tiene partidas ni estudios para tratarla (se buscó: ${[...p.palabrasPartida.slice(0, 3), ...p.palabrasEstudio.slice(0, 2)].join(', ')}).`,
    accion: p.recomendacion,
    solicitud: p.recomendacion,
    fuentes,
    motores: ['antecedentes', 'generacion-pruebas'],
    prueba: p.id,
    origen: [{ titulo: `${o.obraClave} · obra ${o.situacion}`, detalle: `Prueba ${p.id} aprendida al comparar los documentos de la obra con su expediente ${o.expedienteClave}. Causa sugerida: ${p.causa.nombre} (${p.causa.fuente}).` }],
  };
}

export function nombreCondicion(id: string) {
  return CONDICIONES.find((c) => c.id === id)?.nombre ?? id;
}
