import 'server-only';
import type { Postor, ProcesoSeleccion } from '@/dominio/tipos';
import * as almacen from '../almacen';
import { competencia, proveedores } from '../analisis/datos';
import { evaluarProceso } from './evaluar';
import { leerOferta, puntajePorPrecio } from './ofertas';
import { verificarGanador } from './contrato';
import { leerDocumento } from '../motores/lectura';
import type { ArchivoEntrante } from '../http';

// Servicio de la fase de selección: valida lo que llega del formulario, corre el motor
// con los datos reales del OECE y guarda el proceso con su resultado.

const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const numero = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() ? Number(v.replace(/[^\d.-]/g, '')) : NaN);

export function validarProceso(c: Record<string, unknown>): Omit<ProcesoSeleccion, 'resultado' | 'id' | 'clave' | 'creado'> | string {
  const valorReferencial = numero(c.valorReferencial);
  if (!(valorReferencial > 0)) return 'Indica el valor referencial (monto del expediente aprobado).';
  const fecha = texto(c.fechaBuenaPro, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Indica la fecha de la buena pro.';
  const lista = Array.isArray(c.postores) ? c.postores : [];
  if (!lista.length) return 'Agrega al menos un postor.';
  const postores: Postor[] = [];
  for (const [i, x] of lista.slice(0, 30).entries()) {
    const r = (x ?? {}) as Record<string, unknown>;
    const integrantes = (Array.isArray(r.integrantes) ? r.integrantes : []).slice(0, 10).map((m) => {
      const y = (m ?? {}) as Record<string, unknown>;
      return { nombre: texto(y.nombre), ruc: texto(y.ruc, 11).replace(/\D/g, ''), participacion: numero(y.participacion), experiencia: numero(y.experiencia) || 0, inicio: /^\d{4}-\d{2}-\d{2}$/.test(texto(y.inicio, 10)) ? texto(y.inicio, 10) : undefined };
    }).filter((m) => m.nombre);
    const nombre = texto(r.nombre) || integrantes[0]?.nombre || `Postor ${i + 1}`;
    if (!integrantes.length) return `${nombre}: agrega la empresa o los integrantes del consorcio.`;
    if (integrantes.length === 1 && !(integrantes[0].participacion > 0)) integrantes[0].participacion = 100;
    if (integrantes.some((m) => !(m.participacion > 0))) return `${nombre}: indica el % de participación de cada integrante.`;
    const oferta = numero(r.oferta);
    const puntajeTotal = numero(r.puntajeTotal);
    if (!(oferta > 0)) return `${nombre}: indica el monto de la oferta.`;
    if (!(puntajeTotal >= 0)) return `${nombre}: indica el puntaje total.`;
    postores.push({
      id: `P${i + 1}`, nombre, integrantes, oferta, puntajeTotal,
      puntajeTecnico: Number.isFinite(numero(r.puntajeTecnico)) ? numero(r.puntajeTecnico) : undefined,
      mype: r.mype === true, mypeDiscapacidad: r.mypeDiscapacidad === true,
      domicilio: texto(r.domicilio) || undefined, representante: texto(r.representante) || undefined,
      telefono: texto(r.telefono, 40) || undefined, archivo: texto(r.archivo) || undefined,
      apoderados: (Array.isArray(r.apoderados) ? r.apoderados : []).map((n) => texto(n, 80)).filter(Boolean).slice(0, 10),
      personal: (Array.isArray(r.personal) ? r.personal : String(r.personal ?? '').split(/[,;\n]/)).map((n) => texto(n, 80)).filter(Boolean).slice(0, 15),
    });
  }
  const minimo = numero(c.minimoParticipacion);
  return {
    nomenclatura: texto(c.nomenclatura) || 'Procedimiento sin nomenclatura',
    objeto: texto(c.objeto, 300) || 'Ejecución de obra',
    entidad: texto(c.entidad) || undefined,
    expedienteId: texto(c.expedienteId, 64) || undefined,
    procedimiento: c.procedimiento === 'licitacion' ? 'licitacion' : 'abreviada',
    valorReferencial, fechaBuenaPro: fecha,
    minimoParticipacion: minimo > 0 && minimo < 100 ? minimo : undefined,
    postores,
  };
}

export async function crearProceso(datos: Omit<ProcesoSeleccion, 'resultado' | 'id' | 'clave' | 'creado'>): Promise<ProcesoSeleccion> {
  const resultado = evaluarProceso(datos, { idx: proveedores(), comp: competencia() });
  const p: ProcesoSeleccion = { ...datos, id: almacen.nuevoId(), clave: await almacen.siguienteClave('procesos', 'SEL'), creado: new Date().toISOString(), resultado };
  await almacen.guardarProceso(p);
  return p;
}

/** Lee las ofertas subidas (un archivo por postor) y devuelve los postores para revisar. */
export async function leerOfertas(archivos: ArchivoEntrante[], valorReferencial: number) {
  const leidas = [];
  for (const a of archivos) {
    const l = await leerDocumento(a.nombre, a.datos);
    const o = leerOferta(l.paginas, a.nombre);
    if (l.estado !== 'leido') o.avisos.push(l.estado === 'escaneado' ? 'Es un escaneo sin texto: hay que completar los datos a mano.' : 'No se pudo leer completo.');
    leidas.push(o);
  }
  const puntajes = valorReferencial > 0 ? puntajePorPrecio(leidas.map((o) => o.postor.oferta), valorReferencial) : [];
  return leidas.map((o, i) => ({ ...o, postor: { ...o.postor, puntajeTotal: puntajes[i] } }));
}

/** Documentos del ganador para firmar el contrato: los lee y los coteja (art. 83). */
export async function verificarContrato(id: string, archivos: ArchivoEntrante[]): Promise<ProcesoSeleccion> {
  const p = await almacen.leerProceso(id);
  if (!p) throw new Error('Proceso no encontrado');
  if (!p.resultado.ganador) throw new Error('El proceso no tiene un ganador único.');
  const docs = [];
  for (const a of archivos) {
    const l = await leerDocumento(a.nombre, a.datos);
    docs.push({ nombre: a.nombre, unidad: l.unidad, paginas: l.paginas });
  }
  p.verificacion = verificarGanador(p, docs, competencia());
  await almacen.guardarProceso(p);
  return p;
}
