// Tipos del dominio de Axis, compartidos por el servidor (motores, almacén) y la interfaz.

export type Prioridad = 'alta' | 'media' | 'confirmar';

export type Categoria = 'costos' | 'documentos' | 'territorio' | 'aprendidas';

export const TIPOS_DOCUMENTO = [
  'Expediente completo',
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
  /** Prueba que lo produjo (verificador o prueba aprendida). */
  prueba?: string;
  /** Casos reales de los que nació la prueba: por qué Axis la corre. */
  origen?: { titulo: string; detalle: string }[];
  /** Diferencia monetaria involucrada (S/), si aplica. */
  monto?: number;
}

export interface ResultadoPrueba {
  id: string;
  nombre: string;
  origen: 'entrenamiento' | 'obra';
  estado: 'observa' | 'confirmar' | 'pasa' | 'no-aplica';
  /** Por qué no aplicó (documentos que faltan, fuera del radio…). */
  motivo?: string;
}

/** Resultado general de la revisión. */
export type Semaforo = 'rojo' | 'amarillo' | 'verde' | 'gris';

export interface LatLng { lat: number; lng: number }

export interface EjecucionMotor {
  motor: string;
  estado: 'ok' | 'sin-datos' | 'error';
  ms: number;
  nota?: string;
}

export type EstadoExpediente = 'por-confirmar' | 'analizado';

export interface DatosCarta {
  incluidos: string[];
  destinatario: string;
  entidad?: string;
  numero?: string;
  evaluador?: string;
  cargo?: string;
  /** Días hábiles para subsanar. */
  plazo?: number;
}

export const CAMPOS_CARTA = ['destinatario', 'entidad', 'numero', 'evaluador', 'cargo'] as const;

export interface Expediente {
  id: string;
  /** Clave legible (EXP-0001). */
  clave: string;
  nombre: string;
  lugar: string | null;
  /** Clave del recorte de territorio si el motor de ubicación resolvió el tramo. */
  territorio: string | null;
  /** Coordenadas de la obra (del expediente o estimadas por el nombre de la vía). */
  ubicacion: { punto: LatLng; distrito: string | null; estimada: boolean } | null;
  semaforo: Semaforo;
  /** Grupos de pruebas que tuvieron con qué trabajar. */
  cobertura: string[];
  /** Cuántas de las pruebas que conoce Axis aplicaron a este expediente. */
  pruebas?: { aplicadas: number; total: number };
  /** Resultado de cada prueba sobre este expediente. */
  resultadoPruebas?: ResultadoPrueba[];
  creado: string;
  estado: EstadoExpediente;
  documentos: Documento[];
  hallazgos: Hallazgo[];
  ejecucion: EjecucionMotor[];
  /** Decisiones del evaluador sobre la carta. */
  carta: DatosCarta;
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

/** Algo que pasó en la obra, leído de sus documentos y comparado con el expediente. */
export interface HechoObra {
  condicion: string;
  nombre: string;
  /** Causa sugerida por el clasificador (o por una regla de campo). */
  causa: { nombre: string; fuente: 'regla de campo' | 'modelo'; probabilidad?: number };
  fuente: Fuente;
  /** ¿El expediente original ya lo consideraba? */
  previsto: { si: boolean; evidencia?: Fuente };
  /** Prueba generada a partir de este hecho, si el expediente no lo previó. */
  prueba?: string;
}

export interface RegistroObra {
  id: string;
  clave: string;
  /** Expediente original con el que se compara. */
  expedienteId: string;
  situacion: SituacionObra;
  creado: string;
  documentos: DocumentoObra[];
  hechos: HechoObra[];
  ejecucion: EjecucionMotor[];
}

/** Prueba que Axis aprendió de una obra terminada o paralizada. */
export interface PruebaAprendida {
  id: string;
  nombre: string;
  condicion: string;
  causa: HechoObra['causa'];
  /** Dónde aplica: cerca de la obra de origen, o en su mismo distrito si no hay coordenadas. */
  alcance: { centro: LatLng | null; radio: number; distrito: string | null };
  palabrasPartida: string[];
  palabrasEstudio: string[];
  recomendacion: string;
  origen: {
    obraId: string; obraClave: string; situacion: SituacionObra;
    expedienteId: string; expedienteClave: string; expedienteNombre: string;
    fuente: Fuente;
  };
  /** Comprobación automática: la prueba habría alertado al expediente original. */
  validacion: { estado: 'validada' | 'descartada'; motivo: string; expedientesQueDispara: string[] };
  /** Decisión del evaluador: solo las aceptadas corren en las revisiones. */
  estado: 'propuesta' | 'aceptada' | 'rechazada';
  decision?: { fecha: string };
  /** Pruebas existentes que revisan algo parecido (para confirmar que es nueva). */
  relacionadas: { id: string; nombre: string; diferencia: string }[];
  creada: string;
}
