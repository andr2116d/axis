import 'server-only';
import type { DocumentoObra, EjecucionMotor, RegistroObra, SituacionObra } from '@/dominio/tipos';
import * as almacen from './almacen';
import type { ArchivoEntrante } from './http';
import { leerDocumento } from './motores/lectura';
import { clasificarDocumentoObra } from './motores/clasificacion';

// Servicio de quien registra una obra terminada o paralizada. Guarda sus documentos
// junto al expediente original para que los motores de aprendizaje los comparen.
// Hoy lee y clasifica; la extracción de hechos y la generación de pruebas están en desarrollo.

export async function registrarObra(entrada: { expedienteId: string; situacion: SituacionObra; archivos: ArchivoEntrante[] }): Promise<RegistroObra> {
  const expediente = await almacen.leerExpediente(entrada.expedienteId);
  if (!expediente) throw new Error('Expediente no encontrado');

  const id = almacen.nuevoId();
  const clave = await almacen.siguienteClave('obras', 'OBR');
  const documentos: DocumentoObra[] = [];
  let msLectura = 0;
  for (const archivo of entrada.archivos) {
    const docId = almacen.nuevoId();
    const { datos } = archivo;
    await almacen.guardarArchivo('obras', id, docId, datos);
    const inicio = performance.now();
    const lectura = await leerDocumento(archivo.nombre, datos);
    msLectura += performance.now() - inicio;
    await almacen.guardarTexto('obras', id, docId, lectura.paginas);
    documentos.push({
      id: docId, nombre: archivo.nombre, bytes: datos.byteLength,
      tipo: clasificarDocumentoObra(archivo.nombre, lectura.paginas).tipo,
      lectura: lectura.estado, paginas: lectura.paginas.length, paginasConTexto: lectura.paginasConTexto, unidad: lectura.unidad,
    });
  }

  const ejecucion: EjecucionMotor[] = [
    { motor: 'lectura', estado: 'ok', ms: Math.round(msLectura) },
    { motor: 'evidencia-obra', estado: 'ok', ms: 0, nota: `${documentos.length} documento(s) clasificados.` },
  ];
  const registro: RegistroObra = {
    id,
    clave,
    expedienteId: expediente.id,
    situacion: entrada.situacion,
    creado: new Date().toISOString(),
    documentos,
    ejecucion,
  };
  await almacen.guardarObra(registro);
  return registro;
}
