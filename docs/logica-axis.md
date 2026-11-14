# Lógica de Axis (versión La Libertad)

Estado: en construcción, 12 nov 2026. La interfaz se rehace después.

## Principio

Las alertas no están programadas para salir. Las producen verificadores generales que corren igual sobre un expediente sintético o sobre documentos reales del SEACE. Cada verificador nació de errores reales observados en licitaciones de La Libertad, y esos casos se citan como su origen.

## Roles (decididos)

| Rol | Qué hace con la lógica |
|---|---|
| Evaluador (UEI / subgerencia de estudios) | Sube el expediente, confirma los datos leídos, decide cada alerta y emite el informe |
| Proyectista | Corre la misma revisión antes de entregar |
| Supervisor / inspector | Registra hallazgos de obra. El clasificador los ubica en la taxonomía y propone una prueba |
| Curador | Valida o rechaza las pruebas propuestas y ve el acierto de cada prueba |
| Control (solo lectura) | Ve la trazabilidad: qué se revisó, qué se alertó, qué se decidió y quién lo decidió |

## Capas de la lógica

1. **Lectores de documentos** (`src/lib/analisis/`): presupuesto (formato S10/Delphin/Excel, el que se publica en el SEACE), planilla de metrados, especificaciones técnicas, cronograma, fórmula polinómica y cotizaciones.
2. **Verificadores de un documento**: aritmética de partidas, subtotales, resumen (gastos generales, utilidad, IGV), monto en letras, unidades "global" con cantidad, geometría (volumen = área × espesor) y valores imposibles.
3. **Verificadores entre documentos**: presupuesto frente a metrados (partidas, unidades, cantidades), presupuesto frente a especificaciones (espesor, f'c), fechas de cotizaciones frente a fecha del presupuesto, coeficientes de la fórmula polinómica, secuencia del cronograma, y que todos los documentos sean de la misma obra.
4. **Conocimiento aprendido de datos reales** (`src/data/aprendido/`):
   - precios de referencia por tipo de partida, sacados de presupuestos reales de La Libertad, para detectar precios fuera de rango;
   - partidas que casi siempre aparecen en obras del mismo tipo, para detectar omisiones;
   - frecuencia de cada tipo de error por tipo de obra, sacada de los pliegos de absolución, para ordenar las alertas;
   - clasificador de texto entrenado con las consultas reales, que pone cada hallazgo en la taxonomía.
5. **Contexto territorial real**: postes y redes de OpenStreetMap, peligros geológicos de INGEMMET, puntos críticos y faja marginal de la ANA, y obras vecinas del MEF.
6. **Proveedor**: el RUC del ganador se cruza con las sanciones y penalidades del OECE.
7. **Validación retrospectiva**: los verificadores corren sobre presupuestos reales del SEACE y se comparan con lo que observaron los postores.

## Primer resultado real

Presupuesto publicado de "Reparación de calzada Av. Jaime Blanco, El Porvenir" (CUI 2735216, S/ 2.79 M):
- El monto en letras (S/ 2,850,931.07) no coincide con el total (S/ 2,830,931.07). Diferencia: S/ 20,000.
- El subtotal 01.07 "Señalización" no suma su subtítulo 01.07.05 "Señalización vertical" (S/ 13,255.98).
- Tres partidas en unidad "global" tienen cantidades distintas de 1 (2, 2 y 39).
- Las comprobaciones geométricas (veredas, martillos, sardineles) y el resumen (8%, 5%, 18%) pasan.

## Estado al 12 nov 2026 (cierre)

**Corpus real completo:** 1,410 obras de La Libertad licitadas entre enero de 2025 y octubre de 2026 (OECE OCDS); 918 pliegos de absolución con **11,408 consultas de 926 procesos**; 266 bases de pistas y veredas.

**Cobertura de reglas.** Temas más observados por los postores sobre el expediente (1,971 observaciones; 627 aceptadas por la entidad) y regla que los cubre:

| Tema | Observaciones | Regla |
|---|---|---|
| Análisis de precios unitarios | 331 | X-APU-PRES, V-APU-SUMA, V-APU-CUADRILLA, V-APU-COEF |
| Especificaciones faltantes o contradictorias | 322 | X-ET-COBERTURA, X-ET-PRES |
| Gastos generales | 315 | X-GG, V-RESUMEN |
| Planos | 308 | D-PLANOS |
| Metrados | 307 | X-MET-PRES, V-GEOMETRIA |
| Cronograma | 169 | X-CRONOGRAMA, X-RENDIMIENTO |
| Aritmética del presupuesto | 160 | V-ARIT-*, V-RESUMEN, V-LETRAS |
| Cotizaciones | 126 | X-FECHAS |
| Fórmula polinómica | 59 | X-FORMULA |

La biblioteca tiene 28 verificadores, cada uno con su caso real de origen en `src/data/verificadores.ts`. No se creó una regla de "insumo con precios distintos" porque no se encontró ningún caso real que la origine.

**Clasificador de causas: gana la regresión logística.** Validación cruzada de 5 particiones agrupadas por proceso, sobre 240 consultas al azar:

| | Reglas | Naive Bayes | Regresión logística |
|---|---|---|---|
| Exactitud | 72.5% | 77.1% | **87.1%** |
| Expediente frente a bases | 73.3% | 87.1% | **92.9%** |
| Causa dentro de errores del expediente | 34.0% | 71.3% | **77.7%** |

- Probabilidades calibradas (pérdida logarítmica 0.48).
- Para hallazgos de obra se usa un enfoque híbrido: reglas de campo para hechos físicos inequívocos (redes, napa, relleno, restos arqueológicos, terreno) y el modelo para el resto. El curador elige entre las 3 causas más probables.

**Expediente sintético con errores (LL-01):** detecta los **19 errores sembrados**, cada uno copiado de un caso real, más el contexto real de la zona. El limpio (LL-02) no tiene fallas y el incompleto (LL-03) reporta solo lo que falta.

**Validación retrospectiva con documentos reales:**
- 11 presupuestos completos con texto: solo la Av. Jaime Blanco tiene errores (los 3 reales); el resto, sin falsas alarmas.
- 1 presupuesto escaneado: declarado no verificable.
- Resumen de cuantía en 266 bases: 72 cuadran, 26 tienen lectura dudosa, 167 no son legibles.
- 1 discrepancia por revisar: Calle Las Congonas, S/ 19,166 entre las bases y el valor referencial publicado en el SEACE.
- 47% de los PDF de las bases son escaneos.

**Pruebas de regresión** (`npm run analisis:regresion`): **48 de 48 pasan**. Cubren números y textos, 5 presupuestos reales, los 3 expedientes sintéticos con sus 19 errores, el ciclo de aprendizaje y los mínimos de calidad del clasificador.

**Falsos positivos corregidos gracias a datos reales:**
- ubicaciones genéricas del MEF (Laredo);
- presupuestos escaneados con OCR;
- sardinel peraltado con alto y espesor;
- juntas de dilatación usadas como longitud;
- límite de frentes de trabajo en tareas manuales;
- la palabra "redes existentes" en una frase que dice que la obra no interviene las redes.

**Pendiente:** interfaz (propuesta de diseño primero) y revisión de las etiquetas por el equipo.

## Estado al 12 nov 2026 (noche): más allá del modelo supervisado

Se añadieron cuatro fuentes reales y cinco piezas de lógica. El modelo supervisado (clasificador de causas) se mantiene; lo nuevo es determinístico, físico o estadístico, y cada regla cita un caso real. **Regresión: 62/62** (`npm run analisis:regresion`).

### 1. Gemelo de terreno 3D (`src/lib/analisis/terreno.ts`)
- **Datos:** Copernicus GLO-30 (ESA, 30 m) recortado a Trujillo metropolitano (`dem_trujillo.bin`, 1.1 MB) y la red vial de OpenStreetMap (14,831 vías, Overpass; exige User-Agent).
- **Qué calcula:** ubica la vía del expediente por nombre (≤ 500 m de las coordenadas), recorta el tramo con la longitud de la memoria, saca el perfil longitudinal (mediana móvil de 50 m) y el área que drena hacia la calle (relleno de depresiones de Barnes 2014 y flujo D8). Tarda unos 20 ms por calle.
- **Resultados reales:** Calle Los Incas tiene 11.6% de pendiente; Av. Jaime Blanco recibe agua de 115 ha; Av. España (centro) tiene 0.5%.
- **C-DRENAJE:** si la pendiente pasa de 4% o la calle recibe agua de más de 5 ha y no hay partidas de drenaje, alerta. Los umbrales son de Axis y se presentan como tales.
  - Origen: Contraloría en Julcán (24415-2025-CG/TRACO-SVC), Orán (13-2026-CG/GRLO, "incumple CE.010") y Yamango (36-2026-CG/GRPI).
  - Además, el 28% de los contratos de La Libertad con adicionales involucra drenaje.
- **X-LONGITUD:** las metas de la memoria frente a la longitud real de la vía. Origen: 019-2024-OCI/0419-SCC, Huamachuco ("incompatibilidad entre los planos y lo verificado en el terreno").
- **Límite:** es un modelo de superficie (incluye techos), así que sirve para pendientes y cuencas de decenas de metros, no para bombeo ni cunetas.

### 2. Sección vial paramétrica (`seccion.ts`)
- Capas y espesores (presupuesto y especificaciones), anchos (memoria) y corte. Es el modelo 3D de la vía para la interfaz.
- **X-SECCION:** el corte debe alojar las capas o debe haber relleno presupuestado. Origen: 070-2026-OCI/0392-SVC (Urubamba, espesores de capas inconsistentes) y adicionales de subrasante en La Libertad (29%).

### 3. Supervisor: plan de verificación en obra (`supervision.ts`)
- Se genera del expediente: qué medir, con el valor que fija el expediente (espesor, f'c, sección), y cuándo.
- No inventa tolerancias. Si las especificaciones y el presupuesto se contradicen, pide aclarar.
- Prioridad = 50% peso en el costo + 50% frecuencia en hallazgos reales de la Contraloría. Cada punto cita un informe, primero de La Libertad.

### 4. Contraloría: qué falla de verdad en obras viales
- **Corpus:** buscador público (endpoint `BusquedaInformesCGR.ashx`). Hay 4,640 informes sobre pistas, veredas y movilidad urbana; 3,215 son de 2022 en adelante, 170 de ellos de La Libertad.
- **Fichas resumen:** de las fichas descargadas al cierre se extrajeron 1,631 situaciones adversas de 647 informes (295 de La Libertad). Se guardan sin nombres ni DNI.
- **Hallazgo clave:**

| Situación adversa | Proporción |
|---|---|
| Calidad de lo ejecutado | 37% |
| Valorizaciones y pagos | 33% |
| Supervisión | 29% |
| Atribuible al expediente de forma explícita | solo 5% |

  Por eso el rol de supervisor ahora tiene herramienta propia.
- **Elementos con más fallas de calidad:** veredas (74), base (50), losa (42), sardinel (40). Ensayos más citados: resistencia (38), compactación (17), espesor (9).

### 5. Adicionales reales de La Libertad (OCR local con Apple Vision, `scripts/ocr/ocr.swift`)
- Se procesaron 335 documentos de adicionales, ampliaciones, nulidades y resoluciones publicados en contratos OCDS.
- **Cuidado:** muchas resoluciones copian la definición legal ("deficiencias del expediente técnico o situaciones imprevisibles…"). Por eso solo se cuentan afirmaciones causales sobre la obra, y se auditó una muestra.
- **Causas (contratos con documentos):**
  - mayores metrados: 35%
  - demora de la entidad: 28%
  - terreno o interferencias: 21%
  - **deficiencias del expediente (explícitas): 20%**
- **Trabajos más frecuentes en los adicionales:** drenaje 28%, subrasante 29%, redes 17%.
- **Prueba de la premisa (rehecha):** se fija la pregunta de antemano y se publica el resultado, salga como salga. Ver la sección "Premisa: resultado final".

### 6. Ganador: competencia, ejecución e integrantes de consorcios (`competencia.ts`, `ganador.ts`)
- **Indicadores de la guía de banderas rojas de Open Contracting (2024):**

| Señal | Regla |
|---|---|
| Un solo participante | Solo métodos competitivos |
| Concentración por entidad | Un proveedor con ≥ 50% del monto, en entidades con ≥ 4 obras |
| Variación del costo | Por encima del percentil 90 de La Libertad (17%) |
| Ampliación de plazo | Por encima del percentil 90 |
| Fin anticipado del contrato | Nulidad o resolución publicada |

  Marca al 7% de 970 obras adjudicadas, así que discrimina.
- **Descartado a propósito:** "adjudicado ≈ 100% del valor referencial". Con la Licitación Pública Abreviada (Ley 32069), 508 obras se adjudican exactamente al 100%, así que marcaría al 72%.
- **No se cita un umbral legal de adicionales:** la lectura del art. 64 de la Ley 32069 (15/30/50%) está en discusión. Se usan percentiles.
- **Integrantes de consorcios:**
  - El enlace oficial CONOSCE de consorcios da 404.
  - Se leen del contrato de consorcio publicado en el SEACE: RUC en el texto, menos la entidad y el RUC tributario del consorcio, con el nombre oficial tomado de las partes OCDS.
  - Ahora cada integrante se verifica contra sanciones e historial.

### Para regenerar
`sh scripts/datos/actualizar-derivados.sh ../datos-crudos`, cuando terminen las descargas largas (`contraloria.py pdf`, `adicionales.py`, `consorcios_contratos.py` con `PARTE`/`PARTES`).

## Datos crudos

Están en `../datos-crudos/`, fuera del repositorio. Se regeneran con `python3 -I scripts/datos/oece_corpus.py ../datos-crudos 2025-01 2026-10`.

## Premisa: resultado final (descargas completas, 12-13 nov 2026)

- **Datos completos:**
  - 3,207 fichas de la Contraloría, de las que salen 6,004 situaciones adversas de 2,323 informes. Solo el 5% es atribuible explícitamente al expediente.
  - 377 documentos de adicionales con OCR. Causas explícitas: mayores metrados 28%, deficiencias del expediente 18%, subrasante o suelo 22%.
  - 504 contratos de consorcio, de los que salen 353 consorcios con integrantes identificados.
- **Premisa** (285 contratos con pliego y plazo vencido, regresión logística ajustada por tamaño, tipo, plazo y consultas, más permutación y corrección de Holm en 9 pruebas): **ninguna asociación**. El tamaño de la obra es lo que predice adicionales y ampliaciones.
- **Precursores:**

| Tema del adicional | Contratos | Ya planteado en el pliego | Esperado al azar | p |
|---|---|---|---|---|
| Suelo | 37 | 5 | 3.3 | 0.19 |
| Redes/terreno | 35 | 6 | 5.1 | 0.39 |
| Metrados | 27 | 3 | 0.9 | 0.036 sin corregir |

  El p de metrados no sobrevive a la corrección por las 3 pruebas (p de Holm ≈ 0.11), así que no se afirma.
- **Conclusión que sí se sostiene:** la mayoría de los problemas que terminan en adicional no los anticipó ningún postor en el pliego. Eso justifica las pruebas que no dependen de los postores. **No** se afirma que Axis reduzca adicionales.

## Interfaz y subida de expedientes reales (13 nov 2026)

- **Flujo en cuatro pasos visibles:**
  1. Elegir un ejemplo o subir uno o varios PDF.
  2. Confirmar las partes: se muestra una tira de páginas por documento, con su tipo editable.
  3. Ver la revisión por etapas, con cifras reales de cada etapa.
  4. Ver las observaciones, la calle y el plan de obra.
- **Lectura:** el PDF se lee en el navegador y los datos personales se ocultan antes de enviar el texto. En los demos hay datos ficticios para mostrar el ocultamiento.
- **Robustez con PDF reales:** se probaron 249 PDF de las bases del SEACE (`scripts/analisis/probar-pdfs-reales.ts`). No hubo ningún error. Lo que se corrigió:
  - Se avisa cuando se sube **las bases** en lugar del expediente (66 casos).
  - Los escaneos se declaran «por revisar», sin inventar números.
  - Más de 6 alertas iguales se agrupan, y si tocan a casi todas las partidas se tratan como un problema de lectura (antes salían 94 alertas falsas en un PDF).
  - La identidad del proyecto solo se compara con textos que parecen nombres de proyecto.
  - Se leen los presupuestos «desagregados» (con columnas de mano de obra, materiales y equipos): metrado × precio = parcial.
  - Cuando llegan varios archivos de presupuesto, se usa el que tiene más partidas.
  - El nombre del archivo sirve como pista del tipo de documento.
  - Si se marca «solo subí algunas partes», lo que falta no se cuenta como observación.
  - La sección vial se analiza por zonas de intervención (parches, sellado, reconstrucción). Así se evitó un falso positivo en la Av. Jaime Blanco.
- **Ubicación por nombre:** sin coordenadas, la vía se busca en OpenStreetMap dentro de los límites del distrito (INEI), incluido el tramo «desde… hasta…». Se avisa que es una ubicación estimada. En las reparaciones, la falta de drenaje no se acusa.
- **Hallazgo real nuevo:** en LP-ABR-10-2026-MDEP (Calle Miguel Barreto, El Porvenir, CUI 2721555), el presupuesto publicado dice «EXCAVACION DE ZANJA PARA SARDINEL H=35 m» y tiene una partida global con metrado 4. Es ahora el origen real de V-IMPOSIBLE.
- **Regresión:** 68/68. Los flujos en el navegador se prueban con Playwright: los 3 demos, el ciclo de aprendizaje, y Portugal y Miguel Barreto subidos por partes.

## Rediseño de presentación (13 nov 2026, tarde)

- **Diseño base:** minimalista y legible, propio de una herramienta pública. Fondo azul muy claro, tarjetas blancas, un solo azul principal (#1D4ED8) y colores de estado solo como acento. Tipografía Public Sans. Se definió con la guía ui-ux-pro-max (design-system).
- **Menos opciones:**
  - La portada es la herramienta: arrastrar el PDF o «Probar con un ejemplo», con un clic.
  - El menú tiene 3 entradas (Revisar, Ganadores, Cómo funciona) y el perfil queda como «Soy …».
  - Pruebas, Hallazgos de obra y Datos se mueven al pie de página.
- **Partes del documento:** el ejemplo ya no pide confirmarlas. Con archivos propios se ve «Encontramos estas partes. ¿Está bien?» y el editor de páginas solo se abre si se pide.
- **Resultado:** veredicto en una frase → lo primero que hay que corregir (con «por qué importa») → el expediente pieza por pieza (mosaico) → la calle explicada en frases. Los títulos están en lenguaje simple y nombran la partida.
- **OCR en el navegador** (tesseract.js, español) para las páginas escaneadas, hasta 30 por archivo. La imagen no sale del equipo. Si la lectura queda dudosa, el presupuesto se marca «por confirmar» en lugar de acusar.
- **Ubicación estimada por nombre:** el distrito también se toma de la línea «Lugar» del presupuesto. Con ubicación estimada, las alertas de contexto bajan como máximo a «importante».

## Pertinencia: antes de revisar, ¿es un expediente? (13 nov)

Problema: un archivo sin relación (CV, receta) pasaba todas las pruebas «sin problemas», porque ninguna prueba tenía de qué quejarse.

- `src/lib/analisis/pertinencia.ts` decide `expediente | dudoso | ajeno` con señales verificables:
  - partes reconocidas por su encabezado;
  - partidas de presupuesto;
  - líneas con unidad de obra (M2, M3, GLB…);
  - vocabulario de obra (palabra completa: «LOSA» no cuenta dentro de «GLOSARIO»);
  - nombre de inversión o CUI;
  - nombre del archivo.

  Si el documento se presenta como otra cosa, dice qué parece: bases, pliego, contrato, informe de control, norma, valorización o adicional, TdR, comprobante, documento académico o trámite.
- **Calibración** (`scripts/analisis/probar-pertinencia.ts`):
  - 11 de 11 documentos ajenos rechazados;
  - 3 de 3 ejemplos y 8 de 8 presupuestos reales aceptados;
  - en los 133 PDF reales del SEACE con texto, solo quedan fuera anexos sin nada que revisar (asignación de riesgos, botadero, fianzas).
- **Interfaz:**
  - si nada es de una obra, aparece la pantalla «Esto no parece un expediente técnico de obra», con qué parece cada archivo, y no se corre ninguna prueba;
  - con varios archivos, el ajeno y el repetido se dejan fuera con aviso;
  - si los archivos declaran CUI distintos, se avisa;
  - «Sí, revisar» exige al menos una parte del expediente.
- **Motor:**
  - si no es expediente, devuelve solo `D-PERTINENCIA`;
  - `cobertura` lista los grupos de pruebas que sí corrieron; sin cobertura, el veredicto es «No pudimos revisar nada» o «Revisamos muy poco», nunca «No encontramos problemas»;
  - una obra no vial (colegio, agua) recibe el aviso `D-ALCANCE` y no se le aplican sección, drenaje ni longitud de la calle;
  - con coordenadas fuera de La Libertad no se inventa el entorno.
- **Regresión:** 83/83, con 15 pruebas nuevas.
