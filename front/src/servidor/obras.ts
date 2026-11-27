import 'server-only';
import type { DocumentoObra, EjecucionMotor, Expediente, Fuente, HechoObra, PruebaAprendida, RegistroObra, SituacionObra } from '@/dominio/tipos';
import * as almacen from './almacen';
import type { ArchivoEntrante } from './http';
import { leerDocumento } from './motores/lectura';
import { clasificarDocumentoObra } from './motores/clasificacion';
import { senalesEnObra, presente, type Condicion } from './aprendizaje/condiciones';
import { evaluarPrueba } from './aprendizaje/pruebas';
import { sugerirCausaHallazgo } from './analisis/aprendizaje';
import { clasificador } from './analisis/datos';
import { distancia } from './analisis/geo';
import { obraEvaluada } from './expedientes';
import { citar } from './texto';
import { verificadorPorId } from '@/datos/verificadores';

// Servicio de quien registra una obra terminada o paralizada. Compara lo que pasó en
// la obra con su expediente original: cada condición que el expediente no previó se
// convierte en una prueba aprendida, validada contra ese mismo expediente, que corre
// sobre las revisiones siguientes.

export async function registrarObra(entrada: { expedienteId: string; situacion: SituacionObra; archivos: ArchivoEntrante[] }): Promise<RegistroObra> {
  const expediente = await almacen.leerExpediente(entrada.expedienteId);
  if (!expediente) throw new Error('Expediente no encontrado');
  if (expediente.estado !== 'analizado') throw new Error('Primero hay que revisar el expediente original.');

  const id = almacen.nuevoId();
  const clave = await almacen.siguienteClave('obras', 'OBR');
  const ejecucion: EjecucionMotor[] = [];
  const medir = async <T,>(motor: string, fn: () => Promise<T> | T, nota?: (r: T) => string): Promise<T> => {
    const inicio = performance.now();
    const r = await fn();
    const previo = ejecucion.find((e) => e.motor === motor);
    const ms = Math.round(performance.now() - inicio);
    if (previo) previo.ms += ms;
    else ejecucion.push({ motor, estado: 'ok', ms, nota: nota?.(r) });
    return r;
  };

  // 1. Lectura y clasificación de los documentos de la obra.
  const documentos: DocumentoObra[] = [];
  const textos: string[][] = [];
  for (const archivo of entrada.archivos) {
    const docId = almacen.nuevoId();
    await almacen.guardarArchivo('obras', id, docId, archivo.datos);
    const lectura = await medir('lectura', () => leerDocumento(archivo.nombre, archivo.datos));
    await almacen.guardarTexto('obras', id, docId, lectura.paginas);
    const tipo = await medir('clasificacion-documental', () => clasificarDocumentoObra(archivo.nombre, lectura.paginas).tipo);
    textos.push(lectura.paginas);
    documentos.push({
      id: docId, nombre: archivo.nombre, bytes: archivo.datos.byteLength, tipo,
      lectura: lectura.estado, paginas: lectura.paginas.length, paginasConTexto: lectura.paginasConTexto, unidad: lectura.unidad,
    });
  }

  // 2. Qué pasó en la obra: condiciones descritas en sus documentos, con su causa.
  const senales = await medir('evidencia-obra', () => {
    const vistas = new Set<string>();
    return documentos.flatMap((d, i) => senalesEnObra(textos[i])
      .filter((s) => !vistas.has(s.condicion.id) && vistas.add(s.condicion.id))
      .map((s) => ({ ...s, documento: d })));
  }, (r) => `${r.length} condición(es) encontradas en ${documentos.length} documento(s).`);

  const modelo = clasificador();
  const conCausa = await medir('causas', () => senales.map((s) => ({ ...s, causa: sugerirCausaHallazgo(modelo, s.frase) })),
    (r) => r.length ? r.map((x) => `${x.condicion.nombre.split(':')[0]} → ${x.causa.causa}`).join('; ') : 'Sin condiciones que clasificar.');

  // 3. ¿El expediente original lo había previsto? Lo no previsto se vuelve una prueba propuesta.
  const { hechos } = await medir('generacion-pruebas',
    () => aprenderDeHechos(expediente, conCausa.map((s) => ({
      condicion: s.condicion, causa: { nombre: s.causa.causa, fuente: s.causa.fuente, probabilidad: s.causa.probabilidad },
      fuente: { documento: s.documento.nombre, pagina: citar(s.documento.unidad, s.pagina), extracto: s.frase },
    })), { id, clave, situacion: entrada.situacion }),
    (r) => `${r.nuevas.length} prueba(s) nueva(s) propuesta(s); ${r.hechos.filter((h) => h.previsto.si).length} condición(es) ya estaban previstas en el expediente.`);

  const registro: RegistroObra = {
    id, clave, expedienteId: expediente.id, situacion: entrada.situacion,
    creado: new Date().toISOString(), documentos, hechos, ejecucion,
  };
  await almacen.guardarObra(registro);
  return registro;
}

/**
 * Compara cada condición observada en la obra con el expediente original. Si el expediente
 * no la previó, propone una prueba (validada contra ese expediente) y la guarda; si ya
 * existe una prueba para esa condición en el mismo lugar, la reutiliza.
 */
export async function aprenderDeHechos(
  expediente: Expediente,
  observadas: { condicion: Condicion; causa: HechoObra['causa']; fuente: Fuente }[],
  obra: { id: string; clave: string; situacion: SituacionObra },
): Promise<{ hechos: HechoObra[]; nuevas: PruebaAprendida[] }> {
  const textosExp = await Promise.all(expediente.documentos.map((d) => almacen.leerTexto('expedientes', expediente.id, d.id)));
  const original = obraEvaluada(expediente, null, textosExp);
  const existentes = await almacen.listarPruebas();
  const otros = (await almacen.listarExpedientes()).filter((e) => e.estado === 'analizado' && e.id !== expediente.id);
  const nuevas: PruebaAprendida[] = [];
  const hechos: HechoObra[] = [];
  for (const s of observadas) {
    const evidencia = buscarEvidencia(expediente, textosExp, s.condicion);
    const hecho: HechoObra = { condicion: s.condicion.id, nombre: s.condicion.nombre, causa: s.causa, fuente: s.fuente, previsto: { si: !!evidencia, evidencia: evidencia ?? undefined } };
    if (!evidencia) {
      const repetida = [...existentes, ...nuevas].find((p) => p.condicion === s.condicion.id && mismoLugar(p, expediente));
      if (repetida) hecho.prueba = repetida.id;
      else {
        const prueba = await crearPrueba(s.condicion, s.causa, s.fuente, expediente, obra, existentes.length + nuevas.length + 1);
        prueba.validacion = await validar(prueba, original, expediente, otros);
        // Solo se propone si habría alertado al expediente original; el evaluador decide si la acepta.
        if (prueba.validacion.estado === 'validada') {
          nuevas.push(prueba);
          hecho.prueba = prueba.id;
        }
      }
    }
    hechos.push(hecho);
  }
  for (const p of nuevas) await almacen.guardarPrueba(p);
  return { hechos, nuevas };
}

/** Página del expediente original que muestra que la condición estaba prevista. */
export function buscarEvidencia(e: Expediente, textos: string[][], c: Condicion): Fuente | null {
  const grupos: [string[], (t: string) => boolean][] = [
    [c.partidas, (t) => ['Presupuesto', 'Metrados', 'Precios unitarios', 'Expediente completo'].includes(t)],
    [c.estudios, (t) => ['Memoria', 'Estudio de suelos', 'Especificaciones', 'Planos', 'Expediente completo'].includes(t)],
  ];
  for (const [palabras, aplica] of grupos) {
    for (let i = 0; i < e.documentos.length; i += 1) {
      const d = e.documentos[i];
      if (!aplica(d.tipo)) continue;
      for (let j = 0; j < textos[i].length; j += 1) {
        const palabra = presente(textos[i][j], palabras);
        if (!palabra) continue;
        const linea = textos[i][j].split('\n').find((l) => presente(l, [palabra])) ?? palabra;
        return { documento: d.nombre, pagina: citar(d.unidad, j + 1), extracto: linea.replace(/ \| /g, ' · ').trim().slice(0, 220) };
      }
    }
  }
  return null;
}

function mismoLugar(p: PruebaAprendida, e: Expediente) {
  if (p.alcance.centro && e.ubicacion) return distancia(p.alcance.centro, e.ubicacion.punto) < 50;
  return p.origen.expedienteId === e.id;
}

async function crearPrueba(
  c: Condicion, causa: HechoObra['causa'], fuente: Fuente, e: Expediente,
  obra: { id: string; clave: string; situacion: SituacionObra }, n: number,
): Promise<PruebaAprendida> {
  return {
    id: `PA-${String(n).padStart(3, '0')}`,
    nombre: `${c.nombre} en una obra cercana`,
    condicion: c.id,
    causa,
    alcance: { centro: e.ubicacion?.punto ?? null, radio: c.radio, distrito: e.ubicacion?.distrito ?? e.lugar?.split(',')[0] ?? null },
    palabrasPartida: c.partidas,
    palabrasEstudio: c.estudios,
    recomendacion: c.recomendacion,
    origen: {
      obraId: obra.id, obraClave: obra.clave, situacion: obra.situacion,
      expedienteId: e.id, expedienteClave: e.clave, expedienteNombre: e.nombre, fuente,
    },
    validacion: { estado: 'descartada', motivo: '', expedientesQueDispara: [] },
    estado: 'propuesta',
    relacionadas: (c.relacionadas ?? []).map((r) => ({ ...r, nombre: verificadorPorId(r.id)?.nombre ?? r.id })),
    creada: new Date().toISOString(),
  };
}

/** La prueba vale si habría alertado al expediente original; además se mide en el resto. */
async function validar(p: PruebaAprendida, original: ReturnType<typeof obraEvaluada>, e: Expediente, otros: Expediente[]): Promise<PruebaAprendida['validacion']> {
  const enOriginal = evaluarPrueba(p, original);
  if (!enOriginal.aplica || !enOriginal.dispara) {
    return { estado: 'descartada', motivo: `No habría alertado al expediente original ${e.clave}: ${enOriginal.aplica ? `ya tenía ${enOriginal.evidencia}` : enOriginal.motivo}.`, expedientesQueDispara: [] };
  }
  const dispara: string[] = [];
  for (const o of otros) {
    const textos = await Promise.all(o.documentos.map((d) => almacen.leerTexto('expedientes', o.id, d.id)));
    const v = evaluarPrueba(p, obraEvaluada(o, null, textos));
    if (v.aplica && v.dispara) dispara.push(o.clave);
  }
  return {
    estado: 'validada',
    motivo: `Habría alertado al expediente original ${e.clave}, que no tenía partidas ni estudios para esta condición.`,
    expedientesQueDispara: dispara,
  };
}
