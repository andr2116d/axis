// Tipos compartidos entre el navegador y el servidor.

export type Naturaleza = 'real' | 'pública' | 'derivada' | 'sintética';
export type Resultado = 'pasa' | 'falla' | 'no_verificable' | 'no_aplica';
export type Severidad = 'alta' | 'media' | 'baja';
export type TipoPrueba = 'presencia' | 'consistencia' | 'contexto' | 'plausibilidad';
export type Seccion =
  | 'caratula' | 'memoria' | 'suelos' | 'factibilidad' | 'presupuesto'
  | 'metrados' | 'acu' | 'et' | 'cronograma' | 'planos' | 'otro';

export const NOMBRE_SECCION: Record<Seccion, string> = {
  caratula: 'Carátula',
  memoria: 'Memoria descriptiva',
  suelos: 'Estudio de mecánica de suelos',
  factibilidad: 'Factibilidad de servicios',
  presupuesto: 'Presupuesto',
  metrados: 'Planilla de metrados',
  acu: 'Análisis de precios unitarios',
  et: 'Especificaciones técnicas',
  cronograma: 'Cronograma de ejecución',
  planos: 'Índice de planos',
  otro: 'Otros',
};

export interface LatLng { lat: number; lng: number }

/** Página del expediente ya convertida a líneas de texto y con datos personales ocultos. */
export interface Pagina { numero: number; lineas: string[] }

export type Certeza = 'alta' | 'media' | 'baja';

/** Todo dato extraído guarda su página y el texto de donde salió (principio 4). */
export interface Dato<T> {
  valor: T;
  pagina: number;
  extracto: string;
  certeza: Certeza;
  editado?: boolean;
}

export interface Partida {
  codigo: string;
  descripcion: string;
  unidad: string;
  metrado: number;
  precio?: number;
  pagina: number;
}

export interface InsumoAcu {
  partida: string;
  insumo: string;
  unidad: string;
  precio: number;
  pagina: number;
}

export interface FilaCronograma {
  codigo: string;
  descripcion: string;
  semanaInicio: number;
  semanaFin: number;
  pagina: number;
}

export interface Ficha {
  nombre?: Dato<string>;
  codigo?: Dato<string>;
  entidad?: Dato<string>;
  tipoObra?: Dato<string>;
  ubicacionTexto?: Dato<string>;
  coordenadas?: Dato<LatLng>;
  areaIntervencion?: Dato<LatLng[]>;
  intervieneVia?: Dato<boolean>;
  cimentacion?: Dato<string>;
  desplante?: Dato<number>;
  excavacionMax?: Dato<number>;
  conexionDesague?: Dato<string>;
  plazoDias?: Dato<number>;
  // Estudio de suelos
  calicatas?: Dato<number>;
  profExploracion?: Dato<number>;
  /** null = el estudio declara que no encontró napa hasta la profundidad explorada */
  napa?: Dato<number | null>;
  tipoSuelo?: Dato<string>;
  capacidadPortante?: Dato<number>;
  // Documentos
  factibilidad?: Dato<string>;
  presupuesto: Partida[];
  metrados: Partida[];
  acu: InsumoAcu[];
  especificaciones: { codigo: string; titulo: string; pagina: number }[];
  cronogramaInicio?: Dato<string>; // ISO yyyy-mm-dd
  cronograma: FilaCronograma[];
  planos: { codigo: string; titulo: string; pagina: number }[];
  secciones: Partial<Record<Seccion, number[]>>;
  /** texto de las páginas del estudio de suelos (para búsquedas de palabras) */
  textoSuelos: string;
  paginas: number;
}

export interface Evidencia { seccion: string; pagina?: number; texto: string }

export interface Origen {
  obra: string;
  lugar: string;
  entidad?: string;
  documento: string;
  fecha?: string;
  impacto?: string;
  url?: string;
  naturaleza: Naturaleza;
  resumen: string;
}

export interface PlantillaHallazgoCercano {
  tipo: 'hallazgo-cercano';
  categoriaHallazgo: string;
  radio: number; // metros
  excavacionMinima: number; // metros
  palabrasPartida: string[];
  palabrasEstudio: string[];
}

export interface Prueba {
  id: string;
  nombre: string;
  version: string;
  tipos: TipoPrueba[];
  descripcion: string;
  causa: { categoria: string; subcausa: string };
  origen: Origen;
  activacion: string;
  datosNecesarios: string[];
  verificacion: string;
  evidenciaExigida: string;
  severidad: Severidad;
  recomendacion: string;
  norma: string;
  naturaleza: Naturaleza;
  estado: 'candidata' | 'validada' | 'en revisión' | 'retirada';
  curador: string;
  fechaValidacion: string;
  historico: { activada: number; fallada: number; util: number; falsa: number };
  /** Pruebas creadas por el curador desde la interfaz: se ejecutan con una plantilla declarativa. */
  plantilla?: PlantillaHallazgoCercano;
  registroOrigen?: string;
}

export interface Evaluacion {
  pruebaId: string;
  resultado: Resultado;
  motivos: string[]; // por qué se activó (o por qué no aplica)
  hallazgo: string; // qué encontré
  evidencia: Evidencia[];
  severidad: Severidad;
}

export interface Hallazgo {
  id: string;
  obraId: string;
  obraNombre: string;
  fecha: string;
  rol: string;
  fuente: string;
  descripcion: string;
  categoria: string;
  subcausa: string;
  ubicacion: LatLng;
  profundidad?: number;
  impacto?: string;
  detectableAntes: string;
  estado: 'nuevo' | 'en análisis' | 'convertido en prueba' | 'descartado';
  pruebaId?: string;
}

export interface ResultadoRevision {
  fecha: string;
  versionBiblioteca: string;
  zona: InfoZona | null;
  evaluaciones: Evaluacion[];
  resumen: { activadas: number; pasa: number; falla: number; no_verificable: number; no_aplica: number };
}

export interface InfoZona {
  napa: { id: string; nombre: string; rango: string; naturaleza: Naturaleza } | null;
  suelo: { id: string; nombre: string; naturaleza: Naturaleza } | null;
  vecinos: { id: string; distancia: number; napa: number; anio: number; fuente: string }[];
  napaEstimada: number | null;
  confiabilidad: 'alta' | 'media' | 'baja' | 'sin datos';
  fueraDeCobertura: boolean;
}
