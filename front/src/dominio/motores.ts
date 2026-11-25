// Catálogo de motores de Axis. Lo usan el servidor (para registrar qué corrió) y la
// página «Cómo funciona». El estado es el real: solo se marca «activo» lo que corre.

export type EstadoMotor = 'activo' | 'parcial' | 'en-desarrollo';

export interface FichaMotor {
  id: string;
  nombre: string;
  proposito: string;
  estado: EstadoMotor;
  /** Qué falta, si el motor no está completo. */
  pendiente?: string;
}

export interface GrupoMotores {
  id: string;
  nombre: string;
  icono: 'files' | 'map' | 'coins' | 'layers' | 'check';
  motores: FichaMotor[];
}

export const GRUPOS_MOTORES: GrupoMotores[] = [
  {
    id: 'lectura', nombre: 'Lectura e identificación', icono: 'files', motores: [
      { id: 'lectura', nombre: 'Lectura y OCR', proposito: 'Lee el texto de cada página y detecta escaneos.', estado: 'parcial', pendiente: 'OCR de escaneos, Excel y Word.' },
      { id: 'tablas', nombre: 'Reconstrucción de tablas', proposito: 'Recupera filas, columnas y celdas dudosas.', estado: 'en-desarrollo' },
      { id: 'clasificacion-documental', nombre: 'Clasificación documental', proposito: 'Reconoce qué parte del expediente es cada archivo.', estado: 'activo' },
      { id: 'extraccion', nombre: 'Extracción técnica', proposito: 'Identifica partidas, unidades, dimensiones y coordenadas.', estado: 'en-desarrollo' },
      { id: 'identidad', nombre: 'Identidad y versiones', proposito: 'Relaciona cada archivo con su obra y detecta documentos de otra obra.', estado: 'activo' },
      { id: 'cobertura', nombre: 'Cobertura documental', proposito: 'Comprueba el contenido mínimo del expediente y qué pruebas se pueden correr.', estado: 'activo' },
    ],
  },
  {
    id: 'territorio', nombre: 'Territorio y diseño', icono: 'map', motores: [
      { id: 'ubicacion', nombre: 'Ubicación y tramo', proposito: 'Resuelve distrito, calle y límites de la intervención.', estado: 'parcial', pendiente: 'Geocodificación de cualquier calle; hoy reconoce distrito y los tramos con recorte local.' },
      { id: 'relieve', nombre: 'Relieve y drenaje', proposito: 'Calcula perfil, pendiente y escorrentía de referencia.', estado: 'en-desarrollo' },
      { id: 'suelos', nombre: 'Suelos y materiales', proposito: 'Cruza estudios de suelo y solución de pavimento.', estado: 'en-desarrollo' },
      { id: 'redes', nombre: 'Redes e interferencias', proposito: 'Relaciona redes, postes y obras concurrentes.', estado: 'en-desarrollo' },
      { id: 'peligros', nombre: 'Peligros y restricciones', proposito: 'Consulta capas y restricciones de la zona.', estado: 'en-desarrollo' },
      { id: 'geometria', nombre: 'Geometría, planos y BIM', proposito: 'Cruza anchos, longitudes y espesores.', estado: 'en-desarrollo' },
    ],
  },
  {
    id: 'coherencia', nombre: 'Coherencia, costos y plazos', icono: 'coins', motores: [
      { id: 'correspondencia', nombre: 'Correspondencia entre partidas', proposito: 'Vincula trabajos equivalentes en distintos archivos.', estado: 'en-desarrollo' },
      { id: 'coherencia-tecnica', nombre: 'Coherencia técnica', proposito: 'Busca respaldo o contradicciones entre documentos.', estado: 'en-desarrollo' },
      { id: 'metrados', nombre: 'Metrados', proposito: 'Contrasta cantidades, unidades y dimensiones.', estado: 'en-desarrollo' },
      { id: 'aritmetica', nombre: 'Aritmética presupuestal', proposito: 'Comprueba importes, subtotales y totales.', estado: 'en-desarrollo' },
      { id: 'apu', nombre: 'Precios unitarios', proposito: 'Descompone insumos, equipos y rendimientos.', estado: 'en-desarrollo' },
      { id: 'comparables', nombre: 'Precios comparables', proposito: 'Contrasta referencias según alcance y fecha.', estado: 'en-desarrollo' },
      { id: 'anomalias', nombre: 'Anomalías', proposito: 'Detecta combinaciones inusuales dentro de grupos comparables.', estado: 'en-desarrollo' },
      { id: 'cronograma', nombre: 'Cronograma y recursos', proposito: 'Comprueba secuencias, duraciones y recursos.', estado: 'en-desarrollo' },
      { id: 'normativa', nombre: 'Requisitos técnicos y normativos', proposito: 'Relaciona exigencias aplicables con su evidencia.', estado: 'en-desarrollo' },
    ],
  },
  {
    id: 'aprendizaje', nombre: 'Antecedentes y aprendizaje', icono: 'layers', motores: [
      { id: 'antecedentes', nombre: 'Búsqueda de antecedentes', proposito: 'Recupera obras terminadas o paralizadas parecidas.', estado: 'en-desarrollo' },
      { id: 'evidencia-obra', nombre: 'Evidencia de obra', proposito: 'Extrae lo que pasó en obra de informes, actas, adicionales y liquidaciones.', estado: 'parcial', pendiente: 'Hoy lee y clasifica los documentos; falta extraer cada hecho.' },
      { id: 'causas', nombre: 'Clasificación de causas', proposito: 'Sugiere el origen técnico de lo que pasó en obra.', estado: 'en-desarrollo' },
      { id: 'generacion-pruebas', nombre: 'Generación y validación de pruebas', proposito: 'Convierte la diferencia entre expediente y obra en una prueba reutilizable.', estado: 'en-desarrollo' },
      { id: 'entrenamiento', nombre: 'Entrenamiento y evaluación', proposito: 'Reentrena los modelos con cada obra registrada y compara versiones.', estado: 'en-desarrollo' },
    ],
  },
  {
    id: 'revision', nombre: 'Revisión', icono: 'check', motores: [
      { id: 'consolidacion', nombre: 'Consolidación y prioridad', proposito: 'Agrupa y prioriza hallazgos con su evidencia.', estado: 'activo' },
      { id: 'carta', nombre: 'Explicación y carta', proposito: 'Reúne los hallazgos elegidos y sus solicitudes.', estado: 'activo' },
    ],
  },
];

const PORID = new Map(GRUPOS_MOTORES.flatMap((g) => g.motores.map((m) => [m.id, m] as const)));

export function fichaMotor(id: string): FichaMotor | undefined {
  return PORID.get(id);
}

export function nombreMotor(id: string): string {
  return PORID.get(id)?.nombre ?? id;
}
