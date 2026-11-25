// Biblioteca de verificadores de Axis. Cada uno es una regla general que nació de errores reales
// en licitaciones de obras de La Libertad (pliegos de absolución de consultas publicados en el SEACE, 2026),
// de documentos publicados o de datos abiertos oficiales. Los procesos se citan por su nomenclatura SEACE.

import type { FichaVerificador } from '@/servidor/analisis/tipos-analisis';

export interface Verificador extends FichaVerificador {
  tipo: 'consistencia' | 'presencia' | 'contexto' | 'plausibilidad' | 'proveedor';
  documentos: string[];
  recomendacion: string;
  norma?: string;
}

const SEACE = 'Pliego de absolución de consultas y observaciones (SEACE)';
const CGR = 'Ficha resumen del informe de control (Contraloría, buscador público)';
const OCDS = 'OECE – Contrataciones Abiertas (OCDS)';

export const VERIFICADORES: Verificador[] = [
  {
    id: 'V-LETRAS', nombre: 'Monto en letras igual al monto en números', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Presupuesto'],
    queRevisa: 'Convierte a número el monto escrito en letras ("SON: …") y lo compara con el total del presupuesto.',
    recomendacion: 'Corregir el monto en letras para que coincida con el valor del presupuesto de obra antes de aprobar el expediente.',
    origen: [{ proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Reparación de calzada Av. Jaime Blanco, El Porvenir (CUI 2735216)', hallazgo: 'Las bases integradas publicaron el presupuesto con el total en letras S/ 2,850,931.07 frente a S/ 2,830,931.07 en números: S/ 20,000 de diferencia. Lo detectó Axis.', documento: 'Bases integradas – presupuesto (SEACE)' }],
  },
  {
    id: 'V-ARIT-TITULO', nombre: 'Cada subtotal suma sus partidas', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Presupuesto'],
    queRevisa: 'Suma todas las partidas de cada título y la compara con el subtotal declarado. Si la diferencia coincide con un subtítulo, lo señala.',
    recomendacion: 'Recalcular los subtotales del presupuesto en el software de costos y volver a exportarlo.',
    origen: [{ proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Av. Jaime Blanco, El Porvenir (CUI 2735216)', hallazgo: 'El título 01.07 "Señalización" declara S/ 46,865.39 y no suma su subtítulo 01.07.05 "Señalización vertical" (S/ 13,255.98). Lo detectó Axis.', documento: 'Bases integradas – presupuesto (SEACE)' }],
  },
  {
    id: 'V-RESUMEN', nombre: 'Costo directo, gastos generales, utilidad e IGV coherentes', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Presupuesto'],
    queRevisa: 'Verifica que el costo directo sea la suma de las partidas, que los gastos generales y la utilidad correspondan a su porcentaje, que el IGV sea el 18% y que el total cuadre.',
    recomendacion: 'Corregir el resumen del presupuesto; el valor referencial de la convocatoria depende de él.',
    origen: [
      { proceso: 'LP-ABR-1-2026-MDSCH/CS-1', obra: 'Municipalidad Distrital de Santiago de Chuco (CUI 2566648)', hallazgo: 'Un postor observó que el IGV consignado no era el 18% del subtotal.', documento: SEACE },
      { proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Av. Jaime Blanco, El Porvenir', hallazgo: 'Un postor pidió verificar la consistencia aritmética entre costo directo, gastos generales, utilidad y subtotal.', documento: SEACE },
      { proceso: 'LP-SM-6-2026-MPSCH/CS-1', obra: 'Santiago de Chuco (CUI 2283665)', hallazgo: 'Gastos generales de 9.63% del costo directo que no correspondían al monto consignado. Se acogió y se corrigió.', documento: SEACE },
    ],
  },
  {
    id: 'V-GLOBAL', nombre: 'Partida global con cantidad 1', causa: 'Metrados', tipo: 'plausibilidad', documentos: ['Presupuesto'],
    queRevisa: 'Una partida en unidad "global" o "estimado" no se mide por cantidades: su metrado debe ser 1.',
    recomendacion: 'Cambiar la unidad (und, mes, m²) o dejar el metrado en 1 con el precio total.',
    origen: [{ proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Av. Jaime Blanco, El Porvenir', hallazgo: '"Suministro de señalización vertical" en unidad glb con metrado 39, y otras dos partidas glb con metrado 2. Lo detectó Axis.', documento: 'Bases integradas – presupuesto (SEACE)' }],
  },
  {
    id: 'V-GEOMETRIA', nombre: 'Volumen = área × espesor', causa: 'Metrados', tipo: 'consistencia', documentos: ['Presupuesto'],
    queRevisa: 'En partidas del mismo elemento (vereda, sardinel, losa…), el volumen en m³ debe ser el área por el espesor indicado, o la sección por la longitud.',
    recomendacion: 'Revisar la planilla de metrados del elemento y corregir el volumen o el espesor.',
    origen: [{ proceso: 'LP-SM-2-2026-MPSCH/CS-1', obra: 'Agua potable y alcantarillado, Santiago de Chuco (CUI 2594121)', hallazgo: 'Un postor observó que la losa de techo de un afloramiento se metró como un rectángulo que no corresponde a su geometría (1.26 m³).', documento: SEACE }],
  },
  {
    id: 'V-IMPOSIBLE', nombre: 'Dimensiones físicamente posibles', causa: 'Presupuesto y precios', tipo: 'plausibilidad', documentos: ['Presupuesto'],
    queRevisa: 'Detecta diámetros, espesores o alturas imposibles en la descripción de las partidas (errores de unidad o de separador decimal).',
    recomendacion: 'Corregir la descripción de la partida y verificar que el precio unitario corresponda a la dimensión real.',
    origen: [{ proceso: 'LP-ABR-10-2026-MDEP/CS-OBRAS-1', obra: 'Reparación de calzada, Calle Miguel Barreto, El Porvenir (CUI 2721555)', hallazgo: 'El presupuesto publicado dice "EXCAVACION DE ZANJA PARA SARDINEL H=35 m": una zanja de 35 metros para un sardinel; debía ser 35 cm. Lo detectó Axis en un presupuesto real que no había visto antes.', documento: 'Presupuesto desagregado publicado en el SEACE' }, { proceso: 'LP-ABR-3-2026--MDS-1', obra: 'Movilidad urbana, Salaverry (CUI 2691314)', hallazgo: 'El presupuesto consignó buzones de "DI = 120 M" en lugar de 1.20 m. El comité lo reconoció como error material.', documento: SEACE }],
  },
  {
    id: 'X-MET-PRES', nombre: 'Presupuesto sustentado por la planilla de metrados', causa: 'Metrados', tipo: 'consistencia', documentos: ['Presupuesto', 'Planilla de metrados'],
    queRevisa: 'Cada partida del presupuesto debe existir en la planilla de metrados con la misma unidad, la misma cantidad y el mismo espesor; y cada metrado debe estar presupuestado.',
    recomendacion: 'Conciliar presupuesto y planilla de metrados partida por partida antes de aprobar.',
    origen: [
      { proceso: 'LP-ABR-1-2026-MDC/CS-1', obra: 'Agua potable y saneamiento, Cochorco (CUI 2485259)', hallazgo: '8 partidas con unidad distinta entre presupuesto y planilla (m³ y m², und y m). La entidad reconoció que subió una planilla equivocada.', documento: SEACE },
      { proceso: 'LP-ABR-12-2026-MDP/C-1', obra: 'Calzada y vereda, anexo Arcay, Parcoy (CUI 2735019)', hallazgo: '660.13 m³ en el resumen de metrados frente a 660.80 m³ en el presupuesto, y vereda e = 0.15 m frente a 0.10 m. Se acogió la observación.', documento: SEACE },
      { proceso: 'LP-ABR-4-2026-MDC/CS-1', obra: 'I.E. 82022, Curgos (CUI 2720631)', hallazgo: 'Acero de refuerzo presupuestado para el muro de contención sin su metrado en la planilla.', documento: SEACE },
      { proceso: 'LP-ABR-15-2026-MPT/C-1', obra: 'Municipalidad Provincial de Trujillo (CUI 2716480)', hallazgo: 'Partida en m³ en el presupuesto y m² en la planilla de metrados.', documento: SEACE },
    ],
  },
  {
    id: 'X-ET-PRES', nombre: 'Especificaciones coherentes con el presupuesto', causa: 'Especificaciones técnicas', tipo: 'consistencia', documentos: ['Presupuesto', 'Especificaciones técnicas'],
    queRevisa: "Compara unidad de medida, espesor y resistencia del concreto (f'c) entre la especificación técnica y la partida del presupuesto.",
    recomendacion: 'Definir el valor correcto en ambos documentos; la diferencia cambia el costo y genera controversias en obra.',
    origen: [{ proceso: 'LP-ABR-12-2026-MDP/C-1', obra: 'Calzada y vereda, anexo Arcay, Parcoy (CUI 2735019)', hallazgo: 'Vereda de 0.15 m en el resumen de metrados frente a 0.10 m en presupuesto, análisis de precios y especificaciones técnicas.', documento: SEACE }],
  },
  {
    id: 'X-FECHAS', nombre: 'Cotizaciones anteriores a la fecha del presupuesto', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Presupuesto', 'Cotizaciones'],
    queRevisa: 'Un precio no puede sustentarse en una cotización emitida después de la fecha del presupuesto ("costo al").',
    recomendacion: 'Actualizar la fecha del presupuesto o sustentar los precios con cotizaciones vigentes a esa fecha.',
    origen: [{ proceso: 'LP-ABR-4-2026-MDC/CS-1', obra: 'I.E. 82022, Curgos (CUI 2720631)', hallazgo: 'Presupuesto con "fecha proyecto" 22/04/2026 sustentado con cotizaciones del 20 y 22 de mayo de 2026.', documento: SEACE }],
  },
  {
    id: 'X-FORMULA', nombre: 'Fórmula polinómica conforme a la norma', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Fórmula polinómica'],
    queRevisa: 'Máximo 8 monomios, cada coeficiente de al menos 0.05, suma igual a 1, y una sola versión en todo el expediente.',
    norma: 'D.S. N° 011-79-VC, artículo 2',
    recomendacion: 'Reformular la fórmula agrupando los insumos de incidencia menor al 5% y unificar la versión en todos los documentos.',
    origen: [
      { proceso: 'LP-ABR-12-2026-MDP/C-1', obra: 'Parcoy (CUI 2735019)', hallazgo: "Monomio con nomenclatura no reglamentaria e insumos con coeficientes de incidencia menores al 5%.", documento: SEACE },
      { proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Av. Jaime Blanco, El Porvenir', hallazgo: 'Un factor de la fórmula aparecía como 0.11504 en un documento y 0.130 en otro.', documento: SEACE },
    ],
  },
  {
    id: 'X-CRONOGRAMA', nombre: 'Cronograma con secuencia lógica y dentro del plazo', causa: 'Cronograma', tipo: 'consistencia', documentos: ['Cronograma de ejecución'],
    queRevisa: 'Que ninguna actividad empiece antes que la que debe precederla (base, imprimación y carpeta; muros y acabados) y que el cronograma dure lo mismo que el plazo declarado.',
    recomendacion: 'Rehacer la programación con predecesoras y ruta crítica, ajustada al plazo de ejecución.',
    origen: [
      { proceso: 'LP-ABR-3-2026-MDC/CS-1', obra: 'I.E. 2352, Curgos (CUI 2610598)', hallazgo: 'Piso de porcelanato programado antes que los muros de albañilería.', documento: SEACE },
      { proceso: 'LP-ABR-13-2026-MDEP/CS-OBRAS-1', obra: 'Transitabilidad vehicular y peatonal, El Porvenir (CUI 2491504)', hallazgo: 'El cronograma abarcaba 80 días corridos pero declaraba un plazo de 75.', documento: SEACE },
    ],
  },
  {
    id: 'X-IDENTIDAD', nombre: 'Todos los documentos son de la misma obra', causa: 'Estudios básicos', tipo: 'presencia', documentos: ['Todos'],
    queRevisa: 'Compara el CUI y el nombre del proyecto que declara cada documento con los del expediente.',
    recomendacion: 'Reemplazar el documento por el que corresponde a la obra.',
    origen: [{ proceso: 'LP-ABR-3-2026-MPCH/CS-1', obra: 'Agua potable AA.HH. San Simón, Chepén (CUI 2553582)', hallazgo: 'Se publicó un estudio de mecánica de suelos que no correspondía al proyecto; también el estudio de libre disponibilidad mencionaba otras calles.', documento: SEACE }],
  },
  {
    id: 'D-CONTENIDO', nombre: 'Contenido mínimo del expediente', causa: 'Estudios básicos', tipo: 'presencia', documentos: ['Todos'],
    queRevisa: 'Que el expediente incluya memoria, presupuesto, planilla de metrados, especificaciones, cronograma, fórmula polinómica, estudio de suelos y planos.',
    recomendacion: 'Completar el expediente antes de su aprobación.',
    origen: [{ proceso: 'Varios (2026)', obra: 'Electrificación rural, Sanagorán', hallazgo: 'El expediente publicado no incluía memoria descriptiva, especificaciones, planos ni factibilidad.', documento: SEACE }],
  },
  {
    id: 'C-COORDINACION', nombre: 'No pavimentar donde hay redes de agua pendientes', causa: 'Interferencias', tipo: 'contexto', documentos: ['Ubicación'],
    queRevisa: 'Busca, con ubicación precisa, inversiones de agua o desagüe aprobadas y sin ejecutar cerca de una obra de pistas y veredas, y si nombran la misma vía.',
    recomendacion: 'Coordinar el orden de ejecución con la entidad responsable de las redes o incorporar las redes en este expediente.',
    origen: [
      { proceso: 'MEF – Banco de Inversiones', obra: 'Calle Los Incas cdra. 5, El Porvenir', hallazgo: 'Pista y vereda aprobada (CUI 2618792, municipalidad distrital) y renovación de redes de agua y alcantarillado aprobada en la misma cuadra (CUI 2686702, municipalidad provincial).', documento: 'Datos abiertos MEF' },
      { proceso: 'MEF – Banco de Inversiones', obra: 'Av. Santa, Trujillo', hallazgo: 'Movilidad urbana de S/ 10.3 M (CUI 2683978) y redes de agua y desagüe de S/ 3.5 M aprobadas sin expediente en la misma avenida (CUI 2723502).', documento: 'Datos abiertos MEF' },
    ],
  },
  {
    id: 'C-DUPLICIDAD', nombre: 'Sin otra inversión igual en el mismo lugar', causa: 'Factibilidades y terreno', tipo: 'contexto', documentos: ['Ubicación'],
    queRevisa: 'Busca inversiones de la misma función a menos de 40 m (ubicación precisa) para evitar metas superpuestas.',
    recomendacion: 'Verificar que las metas no se superpongan con la otra inversión.',
    origen: [{ proceso: 'MEF – Banco de Inversiones', obra: 'La Libertad', hallazgo: 'Inversiones de la misma función registradas en el mismo punto.', documento: 'Datos abiertos MEF' }],
  },
  {
    id: 'C-PELIGRO', nombre: 'Peligros geológicos cercanos evaluados', causa: 'Estudios básicos', tipo: 'contexto', documentos: ['Ubicación', 'Estudio de mecánica de suelos'],
    queRevisa: 'Cruza la ubicación con el inventario de peligros geológicos y las zonas críticas de INGEMMET, con un radio según el tipo de peligro.',
    recomendacion: 'Incluir la evaluación del peligro y, si corresponde, obras de protección o drenaje.',
    origen: [{ proceso: 'INGEMMET – Boletín C 50', obra: 'Riesgo geológico en la región La Libertad', hallazgo: '798 peligros y 88 zonas críticas inventariados en la región.', documento: 'GEOCATMIN' }],
  },
  {
    id: 'C-AGUA', nombre: 'Riesgo de inundación y faja marginal', causa: 'Estudios básicos', tipo: 'contexto', documentos: ['Ubicación'],
    queRevisa: 'Busca puntos críticos de inundación de la ANA a menos de 500 m y cauces a menos de 100 m.',
    recomendacion: 'Verificar drenaje pluvial, cotas y que la obra esté fuera de la faja marginal.',
    origen: [{ proceso: 'ANA – Puntos críticos', obra: 'La Libertad', hallazgo: '538 puntos críticos con riesgo de inundación identificados en la región.', documento: 'SNIRH – ANA' }],
  },
  {
    id: 'C-HISTORIAL', nombre: 'Historial de obras similares en la zona', causa: 'Presupuesto y precios', tipo: 'contexto', documentos: ['Ubicación'],
    queRevisa: 'Cuenta cuántas obras similares a menos de 1.5 km aumentaron más de 25% su costo o terminaron en arbitraje. Es informativo: sirve para priorizar la revisión.',
    recomendacion: 'Revisar con más detalle metrados, estudios básicos e interferencias.',
    origen: [{ proceso: 'MEF – Banco de Inversiones', obra: 'La Libertad', hallazgo: '1,966 inversiones aumentaron más de 15% sobre su monto viable; 49 tienen laudo arbitral (S/ 45.5 M).', documento: 'Datos abiertos MEF' }],
  },
  {
    id: 'P-PROVEEDOR', nombre: 'Antecedentes del postor ganador', causa: 'Proveedor', tipo: 'proveedor', documentos: ['Buena pro'],
    queRevisa: 'Cruza el RUC del ganador con las inhabilitaciones, multas y penalidades registradas por el OECE a la fecha de la buena pro. Para consorcios, pide verificar a cada integrante.',
    recomendacion: 'Verificar la vigencia de la sanción en el RNP antes de suscribir el contrato.',
    origen: [{ proceso: 'OECE – Datos abiertos', obra: '991 adjudicaciones de obras en La Libertad (2025-2026)', hallazgo: '76% fueron a consorcios. De 237 empresas: 7 estuvieron inhabilitadas en los últimos 5 años, 12 fueron multadas y 21 tenían penalidades.', documento: 'CONOSCE / datosabiertos.gob.pe' }],
  },
  {
    id: 'X-APU-PRES', nombre: 'Precio del presupuesto igual al de su análisis de precios', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Presupuesto', 'Análisis de precios unitarios'],
    queRevisa: 'Que cada precio unitario del presupuesto sea el costo unitario de su APU y que toda partida tenga APU.',
    recomendacion: 'Volver a exportar el presupuesto desde el software de costos para que tome el costo de cada APU.',
    origen: [{ proceso: 'LP-ABR-1-2025-MDS-1', obra: 'Salaverry (CUI 2612633)', hallazgo: 'El concreto de veredas y martillos figuraba a S/ 52.63/m² en el presupuesto, distinto de su análisis de precios unitarios.', documento: SEACE }],
  },
  {
    id: 'V-APU-SUMA', nombre: 'Cada APU suma su costo unitario', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Análisis de precios unitarios'],
    queRevisa: 'Que los recursos de cada análisis de precios sumen el costo unitario que declara.',
    recomendacion: 'Recalcular el análisis de precios unitarios.',
    origen: [{ proceso: 'Varios (2025-2026)', obra: 'La Libertad', hallazgo: '331 observaciones de postores sobre análisis de precios unitarios (insumos, rendimientos, coeficientes); 114 aceptadas por las entidades.', documento: SEACE }],
  },
  {
    id: 'V-APU-CUADRILLA', nombre: 'Mano de obra coherente con cuadrilla y rendimiento', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Análisis de precios unitarios'],
    queRevisa: 'La cantidad de horas-hombre y horas-máquina de cada APU debe ser cuadrilla × 8 horas ÷ rendimiento diario.',
    recomendacion: 'Corregir la cantidad o el rendimiento en el APU; el costo de mano de obra queda mal calculado.',
    origen: [{ proceso: 'Varios (2025-2026)', obra: 'La Libertad', hallazgo: 'Postores observaron rendimientos y cantidades de mano de obra incoherentes en los APU (por ejemplo, trazo y replanteo con rendimientos que no corresponden a la cuadrilla).', documento: SEACE }],
  },
  {
    id: 'V-APU-COEF', nombre: 'Agregados suficientes por m³', causa: 'Presupuesto y precios', tipo: 'plausibilidad', documentos: ['Análisis de precios unitarios'],
    queRevisa: 'Un m³ de concreto, relleno, base o cama de apoyo no puede llevar mucho menos de 1 m³ de agregados.',
    recomendacion: 'Corregir los coeficientes de agregados del APU según el diseño de mezcla o el esponjamiento del material.',
    origen: [{ proceso: 'LP-ABR-3-2026-MDS/C-1', obra: 'Centro deportivo, Sarín (CUI 2711420)', hallazgo: 'Cama de apoyo con 0.044 m³ de arena por m³ y relleno con 0.2625 m³ de grava por m³. La entidad acogió la observación.', documento: SEACE }],
  },
  {
    id: 'X-GG', nombre: 'Gastos generales coherentes con el presupuesto y el plazo', causa: 'Presupuesto y precios', tipo: 'consistencia', documentos: ['Desagregado de gastos generales', 'Presupuesto'],
    queRevisa: 'Que el desagregado sume los gastos generales del presupuesto y que el personal no se pague por más tiempo que el plazo de ejecución.',
    recomendacion: 'Ajustar el desagregado al plazo de ejecución y al monto del presupuesto.',
    origen: [
      { proceso: 'LP-ABR-13-2026-MDEP/CS-OBRAS-1', obra: 'Transitabilidad, El Porvenir (CUI 2491504)', hallazgo: 'Gastos generales calculados para 2.5 meses que incluían un mes de liquidación del residente fuera del plazo de 75 días.', documento: SEACE },
      { proceso: 'LP-SM-2-2026-MDP-COMITE-1', obra: 'Pacanga (CUI 2601417)', hallazgo: 'Garantía de fiel cumplimiento costeada por 7 meses en una obra de 5 meses.', documento: SEACE },
    ],
  },
  {
    id: 'X-ET-COBERTURA', nombre: 'Toda partida tiene especificación técnica', causa: 'Especificaciones técnicas', tipo: 'presencia', documentos: ['Presupuesto', 'Especificaciones técnicas'],
    queRevisa: 'Que cada partida presupuestada tenga su especificación técnica (cómo se ejecuta, se controla y se paga).',
    recomendacion: 'Completar las especificaciones técnicas de las partidas faltantes.',
    origen: [{ proceso: 'LP-ABR-9-2026-MDH/CS-1', obra: 'Infraestructura deportiva, Huanchaco (CUI 2721029)', hallazgo: 'Partidas del presupuesto sin planos de detalle, especificaciones técnicas ni metrados que las sustenten.', documento: SEACE }],
  },
  {
    id: 'D-PLANOS', nombre: 'Planos mínimos y planos que exigen las partidas', causa: 'Planos', tipo: 'presencia', documentos: ['Índice de planos', 'Presupuesto'],
    queRevisa: 'Planos mínimos según el tipo de obra (ubicación, topografía, secciones, pavimentos) y los que piden sus partidas (desvío, señalización, drenaje).',
    recomendacion: 'Incorporar los planos faltantes al expediente.',
    origen: [
      { proceso: 'LP-ABR-5-2026-MDE/C--1', obra: 'La Esperanza (CUI 2713072)', hallazgo: 'El presupuesto incluía "plan de desvío vehicular", pero el expediente no adjuntaba el plano ni el plan.', documento: SEACE },
      { proceso: 'LP-SM-5-2025-GRLL - GRCO-1', obra: 'Gobierno Regional La Libertad (CUI 2484025)', hallazgo: 'Faltaban planos de detalle del plan de contingencia. Se acogió y se adjuntaron.', documento: SEACE },
    ],
  },
  {
    id: 'X-RENDIMIENTO', nombre: 'Cronograma posible con los rendimientos del APU', causa: 'Cronograma', tipo: 'plausibilidad', documentos: ['Cronograma de ejecución', 'Análisis de precios unitarios'],
    queRevisa: 'Que lo programado para cada partida se pueda ejecutar con el rendimiento de su APU: como máximo 3 equipos pesados o 10 cuadrillas manuales a la vez.',
    recomendacion: 'Reprogramar la partida o sustentar los frentes de trabajo y equipos adicionales.',
    origen: [{ proceso: 'LP-ABR-12-2026-MDEP/CS-OBRAS-1', obra: 'Av. Jaime Blanco, El Porvenir (CUI 2735216)', hallazgo: 'El cronograma daba 4 días a 5,846.13 m² de base granular con maquinaria (unos 1,461 m²/día). La entidad acogió la observación.', documento: SEACE }],
  },
  {
    id: 'V-LEGIBLE', nombre: 'Presupuesto legible para verificar', causa: 'Presupuesto y precios', tipo: 'presencia', documentos: ['Presupuesto'],
    queRevisa: 'Si el presupuesto es un escaneo con números ilegibles, Axis no lanza alertas aritméticas (podrían ser errores del escaneo) y pide la versión digital.',
    recomendacion: 'Publicar el presupuesto en formato digital legible.',
    origen: [{ proceso: 'Bases de pistas y veredas, La Libertad (2025-2026)', obra: '218 PDF revisados', hallazgo: '103 de 218 PDF de las bases (47%) son escaneos sin texto; varios postores pidieron el presupuesto en formato editable.', documento: 'SEACE' }],
  },
  {
    id: 'C-DRENAJE', nombre: 'Drenaje pluvial donde la calle conduce agua (gemelo de terreno)', causa: 'Estudios básicos', tipo: 'contexto', documentos: ['Presupuesto', 'Memoria descriptiva'],
    queRevisa: 'Ubica la vía en OpenStreetMap, saca su perfil del modelo de elevación Copernicus (30 m) y calcula el área que drena hacia ella (flujo D8). Si la pendiente media pasa de 4% o recibe agua de más de 5 ha y el presupuesto no tiene cunetas, sumideros ni badenes, alerta.',
    recomendacion: 'Incluir el drenaje pluvial (cunetas, badenes, sumideros) con su memoria de cálculo hidráulico, o sustentar por qué no se requiere.',
    norma: 'RNE CE.010 Pavimentos Urbanos y CE.040 Drenaje Pluvial',
    origen: [
      { proceso: 'Informe 24415-2025-CG/TRACO-SVC', obra: 'Transitabilidad vehicular y peatonal en barrios de Julcán, La Libertad', hallazgo: 'Se modificó la geometría de las cunetas y se aprobó el adicional n.° 4 sin cálculo hidráulico: no se garantiza la evacuación de aguas pluviales y hubo reclamos sociales.', documento: CGR },
      { proceso: 'Informe 13-2026-CG/GRLO', obra: 'Movilidad urbana en calles del C.P. Orán, Loreto', hallazgo: 'No se consideró el diseño ni el presupuesto de un sistema de drenaje pluvial integral ni cunetas longitudinales, incumpliendo la Norma CE.010.', documento: CGR },
      { proceso: 'Informe 36-2026-CG/GRPI', obra: 'Vías locales del C.P. Yamango, Piura', hallazgo: 'No se hizo la memoria de cálculo de alcantarillas ni cunetas.', documento: CGR },
    ],
  },
  {
    id: 'X-LONGITUD', nombre: 'Metas físicas que caben en la vía real', causa: 'Metrados', tipo: 'contexto', documentos: ['Memoria descriptiva'],
    queRevisa: 'Compara la longitud declarada en la memoria con la longitud de la vía en OpenStreetMap (por nombre, a menos de 500 m de las coordenadas).',
    recomendacion: 'Verificar en campo la longitud y el tramo; corregir metas y metrados.',
    origen: [
      { proceso: 'Informe 019-2024-OCI/0419-SCC', obra: 'Movilidad urbana en la Av. Solitario de Sayán, Huamachuco (La Libertad)', hallazgo: 'Incompatibilidad entre los planos y lo verificado en el terreno, por lo que las metas del proyecto no estarían definidas.', documento: CGR },
      { proceso: 'Informe 012-2026-OCI/0961-SCC', obra: 'Viaducto desde la Av. Javier Prado, Ate (Lima)', hallazgo: 'El estudio de topografía presentaba inconsistencias que comprometen los datos altimétricos del replanteo.', documento: CGR },
    ],
  },
  {
    id: 'R-COMPETENCIA', nombre: 'Competencia en el procedimiento', causa: 'Bases y procedimiento', tipo: 'proveedor', documentos: ['SEACE (OCDS)'],
    queRevisa: 'Participantes registrados en el proceso frente a la mediana de las obras de La Libertad (10). No se aplica a contrataciones directas.',
    recomendacion: 'Revisar si los requisitos de las bases restringieron la participación.',
    norma: 'Open Contracting Partnership, Red flags guide (2024): "un solo postor"',
    origen: [{ proceso: '1,410 obras de La Libertad (2025-2026)', obra: 'OECE OCDS', hallazgo: 'Solo el 2.7% de los procesos tuvo un único participante registrado; la mediana es 10.', documento: OCDS }],
  },
  {
    id: 'R-CONCENTRACION', nombre: 'Concentración de adjudicaciones en una entidad', causa: 'Bases y procedimiento', tipo: 'proveedor', documentos: ['SEACE (OCDS)'],
    queRevisa: 'En entidades con 4 o más obras adjudicadas, si un mismo proveedor se lleva la mitad o más del monto.',
    recomendacion: 'El OCI puede revisar los procesos de esa entidad con ese proveedor.',
    norma: 'Open Contracting Partnership, Red flags guide (2024)',
    origen: [{ proceso: '73 entidades de La Libertad con 4 o más obras', obra: 'OECE OCDS 2025-2026', hallazgo: 'En 10 entidades, un solo proveedor concentra la mitad o más del monto adjudicado en obras.', documento: OCDS }],
  },
  {
    id: 'E-VARIACION', nombre: 'Variación del costo final frente a las obras de La Libertad', causa: 'Presupuesto y precios', tipo: 'proveedor', documentos: ['SEACE (OCDS)'],
    queRevisa: 'Valor final del contrato (adicionales menos deductivos) frente al monto contratado; alerta si supera al 90% de las obras de La Libertad con valor final publicado.',
    recomendacion: 'Revisar las causas de los adicionales: si nacen de deficiencias del expediente, son la evidencia que alimenta nuevas pruebas.',
    origen: [{ proceso: '123 contratos de obra con valor final (La Libertad, 2025-2026)', obra: 'OECE OCDS', hallazgo: 'Mediana +6.8%; percentil 90 +17%. Parcoy: +28.1% y 290 días de ampliación.', documento: OCDS }],
  },
  {
    id: 'E-AMPLIACION', nombre: 'Ampliación de plazo frente a las obras de La Libertad', causa: 'Cronograma', tipo: 'proveedor', documentos: ['SEACE (OCDS)'],
    queRevisa: 'Días de ampliación respecto al plazo contractual; alerta si supera al 90% de las obras de La Libertad.',
    recomendacion: 'Revisar las causales de ampliación publicadas en el SEACE.',
    origen: [{ proceso: 'Contratos de obra de La Libertad con fecha final publicada', obra: 'OECE OCDS', hallazgo: 'La mediana de ampliación es 16% del plazo; el percentil 90, 98% (casi el doble del plazo).', documento: OCDS }],
  },
  {
    id: 'E-CONTRATO', nombre: 'Nulidad o resolución del contrato', causa: 'Bases y procedimiento', tipo: 'proveedor', documentos: ['SEACE (OCDS)'],
    queRevisa: 'Si la entidad publicó documentos de nulidad o resolución del contrato.',
    recomendacion: 'Considerarlo en la verificación de experiencia y antecedentes del proveedor.',
    origen: [{ proceso: 'Contratos de obra de La Libertad (2025-2026)', obra: 'OECE OCDS', hallazgo: '30 documentos de nulidad y 12 de resolución de contrato publicados.', documento: OCDS }],
  },
  {
    id: 'P-HISTORIAL', nombre: 'Historial de ejecución del ganador y de los integrantes del consorcio', causa: 'Bases y procedimiento', tipo: 'proveedor', documentos: ['SEACE (OCDS)', 'Contrato de consorcio'],
    queRevisa: 'Obras previas en La Libertad del mismo RUC o de consorcios con los mismos integrantes (leídos del contrato de consorcio publicado): sobrecostos, ampliaciones, nulidades o resoluciones.',
    recomendacion: 'Revisar esas obras antes de firmar; no es causal de descalificación por sí sola.',
    origen: [{ proceso: '991 adjudicaciones de La Libertad', obra: 'OECE OCDS + contratos de consorcio', hallazgo: 'El 76% de las adjudicaciones fue a consorcios, cuyo código no tiene antecedentes propios: hay que revisar a cada integrante.', documento: 'Contrato de consorcio publicado en el SEACE' }],
  },
  {
    id: 'X-SECCION', nombre: 'El corte aloja las capas del pavimento (sección vial paramétrica)', causa: 'Metrados', tipo: 'plausibilidad', documentos: ['Presupuesto', 'Especificaciones técnicas', 'Memoria descriptiva'],
    queRevisa: 'Arma la sección de la vía con las capas y espesores del presupuesto y las especificaciones, y el área de calzada de la memoria. Divide el volumen de corte entre el área: esa profundidad debe alcanzar para las capas, o debe haber relleno o nivelación presupuestados.',
    recomendacion: 'Revisar la rasante del proyecto y los metrados de corte, relleno y eliminación.',
    origen: [
      { proceso: 'Informe 070-2026-OCI/0392-SVC', obra: 'Calle Cien Ventanas, Urubamba (Cusco)', hallazgo: 'Falta de definición del nivel de rasante e inconsistencias en los espesores de las capas de la estructura del pavimento.', documento: CGR },
      { proceso: 'Adicionales de obra publicados en SEACE (La Libertad, 2025-2026)', obra: 'Poroto y otras', hallazgo: 'El 29% de los contratos con adicionales involucra mejoramiento de subrasante o suelo; en Poroto se atribuye a "no establecer una adecuada nivelación y un estudio de suelos deficiente".', documento: 'Documentos de adicionales (OCR)' },
    ],
  },
];

export const verificadorPorId = (id: string) => VERIFICADORES.find((v) => v.id === id);
