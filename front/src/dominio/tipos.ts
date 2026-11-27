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
  /** 'descartada': el modelo leyó el expediente y decidió no correrla. */
  estado: 'observa' | 'confirmar' | 'pasa' | 'no-aplica' | 'descartada';
  /** Por qué no aplicó o por qué el modelo la descartó. */
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
  /** Plazo del entregable del consultor (días): la subsanación no puede pasar del 30 % (art. 144.4). */
  plazoEntregable?: number;
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
  /** Alertas que el evaluador justificó con juicio de experto. */
  justificaciones?: Justificacion[];
  /** Versión anterior de este mismo expediente (la que se observó). */
  versionDe?: string;
  version?: number;
  elaboradoPor?: ElaboradoPor;
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

// ── Fase 1 · Expediente: juicio de experto y versiones ───────

/** Cómo quedó una justificación del evaluador después de que Axis la revisó. */
export type VeredictoJustificacion = 'aceptada' | 'insuficiente' | 'no-justificable';

export interface Justificacion {
  hallazgo: string;
  texto: string;
  /** Documento del expediente que la respalda (id), si lo hay. */
  documento?: string;
  fecha: string;
  evaluacion: {
    veredicto: VeredictoJustificacion;
    /** Por qué se aceptó o no, en orden. */
    razones: string[];
    /** Qué falta para aceptarla. */
    faltan: string[];
    /** Dónde el documento citado respalda lo que dice la justificación. */
    respaldo?: Fuente;
  };
}

/** Quién elaboró el expediente: cambia la carta y los plazos (Reglamento, art. 144 y 172). */
export type ElaboradoPor = 'entidad' | 'consultor';

// ── Fase 2 · Selección del contratista ───────────────────────

export interface Consorciado {
  nombre: string;
  ruc: string;
  /** % de participación en el consorcio (100 si es una sola empresa). */
  participacion: number;
  /** Experiencia que aporta en obras similares (S/). */
  experiencia: number;
  /** Inicio de actividades según SUNAT (AAAA-MM-DD). */
  inicio?: string;
}

export interface Postor {
  id: string;
  nombre: string;
  integrantes: Consorciado[];
  oferta: number;
  puntajeTecnico?: number;
  puntajeTotal: number;
  mype?: boolean;
  mypeDiscapacidad?: boolean;
  domicilio?: string;
  representante?: string;
  telefono?: string;
  /** Apoderados que firman por cada integrante (vigencia de poder). */
  apoderados?: string[];
  /** Personal clave ofrecido (nombres). */
  personal: string[];
  /** Archivo de la oferta del que se leyeron los datos. */
  archivo?: string;
}

/** Una obra que el ganador declara como experiencia (Anexo 11) y lo que la respalda. */
export interface FilaExperiencia {
  n: number;
  cliente: string;
  contrato: string;
  fecha?: string;
  conformidad?: string;
  integrante: string;
  monto: number;
  /** Constancia o acta que la respalda, si llegó. */
  constancia?: { monto?: number; contratista?: string; fuente: Fuente };
  /** Cotejo con el SEACE (OCDS), si el contrato es una nomenclatura conocida. */
  seace?: { coincide: boolean; detalle: string };
}

export interface VerificacionGanador {
  creada: string;
  documentos: { nombre: string; paginas: number }[];
  filas: FilaExperiencia[];
  totalDeclarado?: number;
  senales: SenalSeleccion[];
  ejecucion: EjecucionMotor[];
}

export type NivelSenal = 'alta' | 'media' | 'info';

export interface SenalSeleccion {
  id: string;
  /** Postor al que se refiere (vacío si es del proceso). */
  postor?: string;
  nivel: NivelSenal;
  titulo: string;
  detalle: string;
  /** Qué hacer y quién. */
  accion: string;
  /** Base legal. */
  base: string;
  /** De dónde salió el dato. */
  fuente: string;
}

export interface ResultadoSeleccion {
  orden: { postor: string; puesto: number | null; admitida: boolean; motivo?: string }[];
  ganador: string | null;
  /** Cómo se resolvió un empate, si lo hubo. */
  desempate?: string;
  senales: SenalSeleccion[];
  recomendaciones: { para: string; texto: string; base: string }[];
  ejecucion: EjecucionMotor[];
}

export interface ProcesoSeleccion {
  id: string;
  clave: string;
  nomenclatura: string;
  objeto: string;
  entidad?: string;
  expedienteId?: string;
  /** Licitación pública sin modalidad o abreviada: cambia el desempate (art. 81). */
  procedimiento: 'licitacion' | 'abreviada';
  valorReferencial: number;
  fechaBuenaPro: string;
  /** % mínimo de participación por consorciado fijado en las bases (art. 72.3 d), si lo hay. */
  minimoParticipacion?: number;
  postores: Postor[];
  creado: string;
  resultado: ResultadoSeleccion;
  /** Documentos del ganador para la suscripción del contrato (art. 83 y 88). */
  verificacion?: VerificacionGanador;
}

// ── Fase 3 · Control de la obra en ejecución ─────────────────

export type TipoSolicitud = 'ampliacion' | 'consulta' | 'adicional' | 'valorizacion' | 'otro';

export interface Plazo {
  actor: string;
  accion: string;
  /** Fecha límite (AAAA-MM-DD). */
  vence: string;
  habiles: boolean;
  base: string;
  /** Qué pasa si no se cumple. */
  silencio?: string;
}

export interface CondicionSolicitud {
  id: string;
  nombre: string;
  frase: string;
  previsto: boolean;
  evidencia?: Fuente;
}

export interface AnalisisSolicitud {
  tipo: TipoSolicitud;
  resumen: string;
  /** observar: hay razones para no aceptarla tal cual; evaluar: puede proceder; informar: solo registro. */
  dictamen: 'observar' | 'evaluar' | 'informar';
  razones: { nivel: NivelSenal; texto: string; base?: string; fuente?: Fuente }[];
  condiciones: CondicionSolicitud[];
  plazos: Plazo[];
  /** Respuesta del expediente a una consulta, si la tiene. */
  respuesta?: Fuente;
  diasSolicitados?: number;
  causal?: { inicio?: string; fin?: string };
  /** Lo que el expediente no previó: alimenta el aprendizaje y el reporte del art. 64.5 de la Ley. */
  deficiencias: string[];
  carta: string;
  ejecucion: EjecucionMotor[];
}

export interface Solicitud {
  id: string;
  numero: number;
  /** Fecha de la anotación o de presentación (AAAA-MM-DD). */
  fecha: string;
  titulo: string;
  texto: string;
  documento?: { nombre: string; paginas: number };
  analisis: AnalisisSolicitud;
  estado: 'pendiente' | 'respondida';
  creada: string;
}

export interface ObraEjecucion {
  id: string;
  clave: string;
  expedienteId: string;
  nombre: string;
  contratista: string;
  supervisor?: string;
  /** Inicio del plazo de ejecución (AAAA-MM-DD). */
  inicio: string;
  plazoDias: number;
  montoContrato?: number;
  procesoId?: string;
  creado: string;
  solicitudes: Solicitud[];
}
