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
      { id: 'lectura', nombre: 'Lectura y OCR', proposito: 'Lee PDF (rearma las líneas por posición), Word y Excel, y oculta datos personales.', estado: 'parcial', pendiente: 'OCR de escaneos en el servidor.' },
      { id: 'tablas', nombre: 'Reconstrucción de tablas', proposito: 'Recupera partidas, unidades, metrados y precios de presupuestos S10, Delphin y desagregados.', estado: 'activo' },
      { id: 'clasificacion-documental', nombre: 'Clasificación documental', proposito: 'Reconoce qué parte del expediente es cada archivo y cada página.', estado: 'activo' },
      { id: 'extraccion', nombre: 'Extracción técnica', proposito: 'Lee espesores, resistencias, rendimientos, fechas, coeficientes y plazos.', estado: 'activo' },
      { id: 'identidad', nombre: 'Identidad y versiones', proposito: 'Detecta documentos de otra obra o con otro CUI.', estado: 'activo' },
      { id: 'cobertura', nombre: 'Cobertura documental', proposito: 'Comprueba el contenido mínimo y si lo subido es un expediente.', estado: 'activo' },
    ],
  },
  {
    id: 'territorio', nombre: 'Territorio y diseño', icono: 'map', motores: [
      { id: 'ubicacion', nombre: 'Ubicación y tramo', proposito: 'Ubica la vía por coordenadas o por su nombre en OpenStreetMap dentro del distrito.', estado: 'activo' },
      { id: 'relieve', nombre: 'Relieve y drenaje', proposito: 'Perfil, pendiente y cuenca aportante con Copernicus GLO-30.', estado: 'activo' },
      { id: 'suelos', nombre: 'Suelos y materiales', proposito: 'Cruza la estructura del pavimento con el corte y el suelo.', estado: 'parcial', pendiente: 'Lectura de ensayos (CBR, SUCS) del estudio de suelos.' },
      { id: 'redes', nombre: 'Redes e interferencias', proposito: 'Inversiones de agua y desagüe pendientes en la misma vía (MEF).', estado: 'activo' },
      { id: 'peligros', nombre: 'Peligros y restricciones', proposito: 'Peligros geológicos (INGEMMET), puntos críticos y faja marginal (ANA).', estado: 'activo' },
      { id: 'geometria', nombre: 'Geometría y sección', proposito: 'Volumen = área × espesor, longitud real de la vía y sección paramétrica.', estado: 'activo' },
    ],
  },
  {
    id: 'coherencia', nombre: 'Coherencia, costos y plazos', icono: 'coins', motores: [
      { id: 'verificadores', nombre: 'Biblioteca de verificadores', proposito: '30 reglas nacidas de errores reales en obras de La Libertad, cada una con su caso de origen.', estado: 'activo' },
      { id: 'correspondencia', nombre: 'Correspondencia entre partidas', proposito: 'Vincula cada partida del presupuesto con sus metrados, APU y especificación.', estado: 'activo' },
      { id: 'coherencia-tecnica', nombre: 'Coherencia técnica', proposito: 'Espesores y resistencias iguales en presupuesto y especificaciones.', estado: 'activo' },
      { id: 'metrados', nombre: 'Metrados', proposito: 'Cantidades y unidades iguales en metrados y presupuesto.', estado: 'activo' },
      { id: 'aritmetica', nombre: 'Aritmética presupuestal', proposito: 'Partidas, subtotales, resumen, gastos generales y monto en letras.', estado: 'activo' },
      { id: 'apu', nombre: 'Precios unitarios', proposito: 'Suma de insumos, cuadrillas, coeficientes y precio igual al presupuesto.', estado: 'activo' },
      { id: 'comparables', nombre: 'Precios comparables', proposito: 'Fechas de cotizaciones frente a la del presupuesto.', estado: 'parcial', pendiente: 'Rangos de precio por partida con presupuestos de la región.' },
      { id: 'anomalias', nombre: 'Anomalías', proposito: 'Combinaciones inusuales dentro de grupos de obras comparables.', estado: 'en-desarrollo' },
      { id: 'cronograma', nombre: 'Cronograma y recursos', proposito: 'Secuencia constructiva, plazo y rendimiento contra duración.', estado: 'activo' },
      { id: 'normativa', nombre: 'Requisitos técnicos y normativos', proposito: 'Fórmula polinómica, planos mínimos y contenido del expediente.', estado: 'parcial', pendiente: 'Cruce con el RNE por tipo de obra.' },
    ],
  },
  {
    id: 'aprendizaje', nombre: 'Antecedentes y aprendizaje', icono: 'layers', motores: [
      { id: 'antecedentes', nombre: 'Búsqueda de antecedentes', proposito: 'Corre las pruebas aprendidas de obras cercanas y el historial de costos de la zona (MEF).', estado: 'activo' },
      { id: 'evidencia-obra', nombre: 'Evidencia de obra', proposito: 'Extrae lo que pasó en obra de resoluciones, informes, actas y liquidaciones.', estado: 'activo' },
      { id: 'causas', nombre: 'Clasificación de causas', proposito: 'Regresión logística entrenada con 11,408 consultas reales (87 % de exactitud) más reglas de campo.', estado: 'activo' },
      { id: 'generacion-pruebas', nombre: 'Generación y validación de pruebas', proposito: 'Convierte lo que el expediente no previó en una prueba y la valida contra ese expediente.', estado: 'activo' },
      { id: 'entrenamiento', nombre: 'Entrenamiento y evaluación', proposito: 'Validación cruzada por proceso y regresión de 81 casos reales y sintéticos.', estado: 'parcial', pendiente: 'Reentrenar el clasificador con los hechos de cada obra registrada.' },
    ],
  },
  {
    id: 'revision', nombre: 'Revisión', icono: 'check', motores: [
      { id: 'consolidacion', nombre: 'Consolidación y semáforo', proposito: 'Agrupa y prioriza hallazgos y da el resultado general.', estado: 'activo' },
      { id: 'carta', nombre: 'Explicación y carta', proposito: 'Arma la carta de observaciones con lo que decide el evaluador.', estado: 'activo' },
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
