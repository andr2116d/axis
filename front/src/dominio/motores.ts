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

export type Fase = 'expediente' | 'seleccion' | 'ejecucion' | 'aprendizaje';

export interface GrupoMotores {
  id: string;
  nombre: string;
  icono: 'files' | 'map' | 'coins' | 'layers' | 'check' | 'user' | 'building' | 'clock';
  fase: Fase;
  motores: FichaMotor[];
}

export const GRUPOS_MOTORES: GrupoMotores[] = [
  {
    id: 'lectura', fase: 'expediente', nombre: 'Lectura e identificación', icono: 'files', motores: [
      { id: 'lectura', nombre: 'Lectura y OCR', proposito: 'Lee PDF (rearma las líneas por posición), Word y Excel, y oculta datos personales.', estado: 'parcial', pendiente: 'OCR de escaneos en el servidor.' },
      { id: 'tablas', nombre: 'Reconstrucción de tablas', proposito: 'Recupera partidas, unidades, metrados y precios de presupuestos S10, Delphin y desagregados.', estado: 'activo' },
      { id: 'clasificacion-documental', nombre: 'Clasificación documental', proposito: 'Reconoce qué parte del expediente es cada archivo y cada página.', estado: 'activo' },
      { id: 'extraccion', nombre: 'Extracción técnica', proposito: 'Lee espesores, resistencias, rendimientos, fechas, coeficientes y plazos.', estado: 'activo' },
      { id: 'identidad', nombre: 'Identidad y versiones', proposito: 'Detecta documentos de otra obra o con otro CUI.', estado: 'activo' },
      { id: 'cobertura', nombre: 'Cobertura documental', proposito: 'Comprueba el contenido mínimo y si lo subido es un expediente.', estado: 'activo' },
    ],
  },
  {
    id: 'territorio', fase: 'expediente', nombre: 'Territorio y diseño', icono: 'map', motores: [
      { id: 'ubicacion', nombre: 'Ubicación y tramo', proposito: 'Ubica la vía por coordenadas o por su nombre en OpenStreetMap dentro del distrito.', estado: 'activo' },
      { id: 'relieve', nombre: 'Relieve y drenaje', proposito: 'Perfil, pendiente y cuenca aportante con Copernicus GLO-30.', estado: 'activo' },
      { id: 'suelos', nombre: 'Suelos y materiales', proposito: 'Cruza la estructura del pavimento con el corte y el suelo.', estado: 'parcial', pendiente: 'Lectura de ensayos (CBR, SUCS) del estudio de suelos.' },
      { id: 'redes', nombre: 'Redes e interferencias', proposito: 'Inversiones de agua y desagüe pendientes en la misma vía (MEF).', estado: 'activo' },
      { id: 'peligros', nombre: 'Peligros y restricciones', proposito: 'Peligros geológicos (INGEMMET), puntos críticos y faja marginal (ANA).', estado: 'activo' },
      { id: 'geometria', nombre: 'Geometría y sección', proposito: 'Volumen = área × espesor, longitud real de la vía y sección paramétrica.', estado: 'activo' },
    ],
  },
  {
    id: 'coherencia', fase: 'expediente', nombre: 'Coherencia, costos y plazos', icono: 'coins', motores: [
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
    id: 'aprendizaje', fase: 'aprendizaje', nombre: 'Antecedentes y aprendizaje', icono: 'layers', motores: [
      { id: 'seleccion-pruebas', nombre: 'Selección de pruebas', proposito: 'Lee el expediente y decide qué pruebas valen la pena para esta obra, y por qué descarta las demás.', estado: 'parcial', pendiente: 'Entrenar la selección con las pruebas que más observan por tipo de obra.' },
      { id: 'antecedentes', nombre: 'Búsqueda de antecedentes', proposito: 'Corre las pruebas aprendidas de obras cercanas y el historial de costos de la zona (MEF).', estado: 'activo' },
      { id: 'evidencia-obra', nombre: 'Evidencia de obra', proposito: 'Extrae lo que pasó en obra de resoluciones, informes, actas y liquidaciones.', estado: 'activo' },
      { id: 'causas', nombre: 'Clasificación de causas', proposito: 'Regresión logística entrenada con 11,408 consultas reales (87 % de exactitud) más reglas de campo.', estado: 'activo' },
      { id: 'generacion-pruebas', nombre: 'Generación y validación de pruebas', proposito: 'Convierte lo que el expediente no previó en una prueba y la valida contra ese expediente.', estado: 'activo' },
      { id: 'entrenamiento', nombre: 'Entrenamiento y evaluación', proposito: 'Validación cruzada por proceso y regresión de 81 casos reales y sintéticos.', estado: 'parcial', pendiente: 'Reentrenar el clasificador con los hechos de cada obra registrada.' },
    ],
  },
  {
    id: 'revision', fase: 'expediente', nombre: 'Revisión', icono: 'check', motores: [
      { id: 'consolidacion', nombre: 'Consolidación y semáforo', proposito: 'Agrupa y prioriza hallazgos y da el resultado general.', estado: 'activo' },
      { id: 'carta', nombre: 'Explicación y carta', proposito: 'Arma la carta al consultor (plazos del art. 144) o el informe al equipo de la entidad.', estado: 'activo' },
      { id: 'juicio-experto', nombre: 'Juicio de experto', proposito: 'Revisa la justificación del evaluador: pertinencia (con el clasificador), cifras, respaldo en el documento citado y contradicciones con la ubicación. Los errores objetivos no se justifican.', estado: 'activo' },
      { id: 'versiones', nombre: 'Versiones del expediente', proposito: 'Compara cada versión corregida con la anterior: observaciones levantadas, que siguen y nuevas.', estado: 'activo' },
    ],
  },
  {
    id: 'seleccion', fase: 'seleccion', nombre: 'Selección del contratista', icono: 'user', motores: [
      { id: 'orden-legal', nombre: 'Orden legal', proposito: 'Admite ofertas entre 95 % y 110 % del valor referencial, excluye a los inhabilitados, ordena por puntaje y desempata (art. 81).', estado: 'activo' },
      { id: 'antecedentes-oece', nombre: 'Antecedentes OECE', proposito: 'Inhabilitaciones, multas y penalidades de cada RUC con los datos abiertos del OECE.', estado: 'activo' },
      { id: 'historial-obras', nombre: 'Historial de obras', proposito: 'Obras previas en La Libertad del postor y de sus consorcios: sobrecostos, ampliaciones, nulidades (OCDS).', estado: 'activo' },
      { id: 'consorcios', nombre: 'Consorcios', proposito: 'Quién aporta la experiencia frente a quién tiene la participación, mínimos de las bases y empresas recién creadas.', estado: 'activo' },
      { id: 'vinculos', nombre: 'Vínculos entre postores', proposito: 'Domicilio, representante, integrantes o personal clave compartidos entre postores que compiten.', estado: 'activo' },
      { id: 'senales-proceso', nombre: 'Señales del proceso', proposito: 'Oferta única, ofertas casi idénticas o en el tope y concentración de adjudicaciones (banderas rojas OCP).', estado: 'activo' },
      { id: 'recomendaciones', nombre: 'Qué hacer y quién', proposito: 'Verificación posterior (art. 83), remisión a Indecopi (DCF 24.ª) y mínimos para las próximas bases (art. 72.3 d).', estado: 'activo' },
    ],
  },
  {
    id: 'ejecucion', fase: 'ejecucion', nombre: 'Control de la obra', icono: 'building', motores: [
      { id: 'tipo-solicitud', nombre: 'Tipo de solicitud', proposito: 'Reconoce si el asiento es una ampliación, consulta, adicional o valorización.', estado: 'activo' },
      { id: 'cotejo-expediente', nombre: 'Cotejo con el expediente', proposito: 'Comprueba si la condición alegada (napa, redes, suelo, drenaje…) estaba prevista en partidas o estudios.', estado: 'activo' },
      { id: 'requisitos-ampliacion', nombre: 'Requisitos de la ampliación', proposito: 'Contenido mínimo, oportunidad de 10 días hábiles y días pedidos frente a la duración de la causal (art. 198 y 200).', estado: 'activo' },
      { id: 'respuesta-en-expediente', nombre: 'Respuesta en el expediente', proposito: 'Busca en el expediente la línea que responde la consulta (recuperación por rareza de términos).', estado: 'activo' },
      { id: 'causa-adicional', nombre: 'Causa del adicional', proposito: 'Clasifica el origen del adicional y mide los topes de la Ley (15 %, 30 %, 50 %).', estado: 'activo' },
      { id: 'cotejo-valorizacion', nombre: 'Cotejo de la valorización', proposito: 'Precio, metrado y partidas nuevas contra el presupuesto contractual (art. 210).', estado: 'activo' },
      { id: 'plazos', nombre: 'Plazos legales', proposito: 'Calcula en días hábiles o calendario lo que vence para supervisor y entidad, y qué pasa si no se responde.', estado: 'activo' },
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
