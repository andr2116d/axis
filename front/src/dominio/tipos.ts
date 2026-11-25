// Tipos del dominio de Axis, compartidos por el servidor (motores, almacén) y la interfaz.

export type Prioridad = 'alta' | 'media' | 'confirmar';

export type Categoria = 'costos' | 'documentos' | 'territorio' | 'aprendidas';

export const TIPOS_DOCUMENTO = [
  'Memoria',
  'Especificaciones',
  'Metrados',
  'Presupuesto',
  'Precios unitarios',
  'Fórmula polinómica',
  'Cronograma',
  'Planos',
  'Estudio de suelos',
  'Otro anexo',
  'Por identificar',
] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

/** Cómo se divide el texto de un archivo: páginas (PDF), bloques (Word) u hojas (Excel). */
export type UnidadPagina = 'pág.' | 'bloque' | 'hoja';

/** Resultado de leer un archivo. */
export type EstadoLectura = 'leido' | 'parcial' | 'escaneado' | 'no-legible' | 'formato-pendiente';

export interface Documento {
  id: string;
  nombre: string;
  bytes: number;
  /** Tipo vigente: el que confirmó la persona o, si no confirmó, el sugerido. */
  tipo: TipoDocumento;
  /** Lo que propuso el motor de clasificación, con su confianza (0–1). */
  sugerencia: { tipo: TipoDocumento; confianza: number; razon: string };
  lectura: EstadoLectura;
  paginas: number;
  /** Páginas con texto legible. */
  paginasConTexto: number;
  unidad: UnidadPagina;
}

export interface Fuente {
  documento: string;
  pagina: string;
  extracto: string;
}

export interface Hallazgo {
  id: string;
  categoria: Categoria;
  prioridad: Prioridad;
  titulo: string;
  detalle: string;
  /** Qué debería hacer el evaluador. */
  accion: string;
  /** Texto para la carta de observaciones (si difiere de la acción). */
  solicitud?: string;
  fuentes: Fuente[];
  /** Motores que produjeron el hallazgo, en orden. */
  motores: string[];
}

export interface EjecucionMotor {
  motor: string;
  estado: 'ok' | 'sin-datos' | 'error';
  ms: number;
  nota?: string;
}

export type EstadoExpediente = 'por-confirmar' | 'analizado';

export interface Expediente {
  id: string;
  /** Clave legible (EXP-0001). */
  clave: string;
  nombre: string;
  lugar: string | null;
  /** Clave del recorte de territorio si el motor de ubicación resolvió el tramo. */
  territorio: string | null;
  creado: string;
  estado: EstadoExpediente;
  documentos: Documento[];
  hallazgos: Hallazgo[];
  ejecucion: EjecucionMotor[];
  /** Decisiones del evaluador sobre la carta. */
  carta: { incluidos: string[]; destinatario: string };
}

export type SituacionObra = 'terminada' | 'paralizada';

export const TIPOS_DOCUMENTO_OBRA = [
  'Informe de paralización',
  'Liquidación',
  'Acta de recepción',
  'Resolución de adicional',
  'Ampliación de plazo',
  'Cuaderno de obra',
  'Informe de control',
  'Otro',
] as const;
export type TipoDocumentoObra = (typeof TIPOS_DOCUMENTO_OBRA)[number];

export interface DocumentoObra {
  id: string;
  nombre: string;
  bytes: number;
  tipo: TipoDocumentoObra;
  lectura: EstadoLectura;
  paginas: number;
  paginasConTexto: number;
  unidad: UnidadPagina;
}

export interface RegistroObra {
  id: string;
  clave: string;
  /** Expediente original con el que se compara. */
  expedienteId: string;
  situacion: SituacionObra;
  creado: string;
  documentos: DocumentoObra[];
  ejecucion: EjecucionMotor[];
}
