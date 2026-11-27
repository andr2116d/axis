import 'server-only';
import type { ObraEjecucion, Solicitud, TipoSolicitud } from '@/dominio/tipos';
import { hoyIso } from '@/dominio/fechas';
import * as almacen from '../almacen';
import type { ArchivoEntrante } from '../http';
import { leerDocumento } from '../motores/lectura';
import { clasificador } from '../analisis/datos';
import { buscarEvidencia } from '../obras';
import { analizarSolicitud, NOMBRE_TIPO } from './analizar';

// Servicio de control de la obra: registra la obra en ejecución (enlazada a su
// expediente aprobado) y analiza cada solicitud del contratista.

const TIPOS: TipoSolicitud[] = ['ampliacion', 'consulta', 'adicional', 'valorizacion', 'otro'];
const texto = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export async function crearObra(c: Record<string, unknown>): Promise<ObraEjecucion | string> {
  const expedienteId = texto(c.expedienteId, 64);
  const expediente = expedienteId ? await almacen.leerExpediente(expedienteId) : null;
  if (!expediente || expediente.estado !== 'analizado') return 'Elige el expediente técnico aprobado de la obra.';
  const inicio = texto(c.inicio, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return 'Indica la fecha de inicio del plazo de ejecución.';
  const plazoDias = Number(c.plazoDias);
  if (!(plazoDias > 0 && plazoDias <= 2000)) return 'Indica el plazo de ejecución en días calendario.';
  const monto = Number(String(c.montoContrato ?? '').replace(/[^\d.]/g, ''));
  const o: ObraEjecucion = {
    id: almacen.nuevoId(),
    clave: await almacen.siguienteClave('ejecucion', 'OBE'),
    expedienteId: expediente.id,
    nombre: expediente.nombre,
    contratista: texto(c.contratista) || 'Contratista',
    supervisor: texto(c.supervisor) || undefined,
    inicio, plazoDias,
    montoContrato: monto > 0 ? monto : undefined,
    procesoId: texto(c.procesoId, 64) || undefined,
    creado: new Date().toISOString(),
    solicitudes: [],
  };
  await almacen.guardarEjecucion(o);
  return o;
}

export async function agregarSolicitud(id: string, entrada: { campos: Record<string, string>; archivos: ArchivoEntrante[] }): Promise<Solicitud> {
  const obra = await almacen.leerEjecucion(id);
  if (!obra) throw new Error('Obra no encontrada');
  const expediente = await almacen.leerExpediente(obra.expedienteId);
  if (!expediente) throw new Error('No se encontró el expediente de la obra.');

  let paginas: string[] = [];
  let documento: Solicitud['documento'];
  let unidad = 'pág.';
  const archivo = entrada.archivos[0];
  if (archivo) {
    const l = await leerDocumento(archivo.nombre, archivo.datos);
    paginas = l.paginas;
    unidad = l.unidad;
    documento = { nombre: archivo.nombre, paginas: l.paginas.length };
  }
  const pegado = texto(entrada.campos.texto, 20000);
  if (pegado) paginas = [...paginas, pegado];
  if (!paginas.join('').trim()) throw new Error('Pega el texto de la anotación o sube el documento de la solicitud.');

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(entrada.campos.fecha ?? '') ? entrada.campos.fecha : hoyIso();
  const tipo = TIPOS.includes(entrada.campos.tipo as TipoSolicitud) ? entrada.campos.tipo as TipoSolicitud : undefined;
  const textosExpediente = await Promise.all(expediente.documentos.map((d) => almacen.leerTexto('expedientes', expediente.id, d.id)));
  const analisis = analizarSolicitud({
    obra, expediente, textosExpediente, paginas, fecha, tipo,
    nombreDocumento: documento?.nombre ?? 'Anotación del cuaderno', unidad: documento ? unidad : 'texto',
    modelo: clasificador(),
    evidencia: (c) => buscarEvidencia(expediente, textosExpediente, c),
  });
  const s: Solicitud = {
    id: almacen.nuevoId(),
    numero: obra.solicitudes.length + 1,
    fecha,
    titulo: texto(entrada.campos.titulo, 160) || NOMBRE_TIPO[analisis.tipo],
    texto: paginas.join('\n\n').slice(0, 6000),
    documento,
    analisis,
    estado: 'pendiente',
    creada: new Date().toISOString(),
  };
  obra.solicitudes.push(s);
  await almacen.guardarEjecucion(obra);
  return s;
}

export async function actualizarSolicitud(id: string, sid: string, cambios: { estado?: unknown; carta?: unknown }) {
  const obra = await almacen.leerEjecucion(id);
  if (!obra) throw new Error('Obra no encontrada');
  const s = obra.solicitudes.find((x) => x.id === sid);
  if (!s) throw new Error('Solicitud no encontrada');
  if (cambios.estado === 'pendiente' || cambios.estado === 'respondida') s.estado = cambios.estado;
  if (typeof cambios.carta === 'string') s.analisis.carta = cambios.carta.slice(0, 12000);
  await almacen.guardarEjecucion(obra);
  return s;
}
