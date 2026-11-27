# Arquitectura del backend de Axis

Axis tiene muchos modelos pequeños, cada uno experto en un error, y un orquestador que decide cuáles activar para cada caso. La estructura de carpetas está hecha para que el catálogo pueda pasar de 30 a 100 motores sin que el resto del sistema cambie.

## Mapa

```
server/
  src/axis/
    compartido/      lo que todos entienden igual: Semaforo, Fase, Tipologia, Hallazgo y el contrato Motor
    documentos/      sube, extrae y estructura cada archivo (PDF, Excel, OCR, IFC) una sola vez
    expediente/      fase 1: secciones, semáforo, justificaciones, observaciones al consultor
    seleccion/       fase 2: postores, consorcios, alertas al comité
    ejecucion/       fase 3: entregables, solicitudes, cartas, informe final
    normativa/       la ley indexada: encuentra y cita el artículo aplicable
    orquestador/     el modelo grande: elige motores, los corre en paralelo, emite hallazgos
    motores/         el catálogo: un paquete por modelo
    aprendizaje/     obra terminada o paralizada → pruebas nuevas → reentrenar → promover
    arranque/        crea la API y el worker; el único lugar que conecta todo
  tests/             unitarias, contrato, integracion, api, modelos
  herramientas/      entrenamiento, datos sintéticos, preparación local (no van en la API)
  migraciones/       Alembic
  infra/             Terraform (AWS)
```

Cada contexto, salvo `motores`, `compartido` y `arranque`, es un hexágono con tres capas:

```
<contexto>/dominio/       reglas puras, sin librerías
<contexto>/aplicacion/    puertos (Protocol) + casos_de_uso/
<contexto>/adaptadores/   entrada/ (HTTP, cola)  ·  salida/ (Postgres, S3, Bedrock, ONNX, falsos)
```

## Cómo el orquestador elige qué motores activar

El orquestador decide en cuatro filtros, del más barato al más caro. Así casi todas las decisiones se resuelven en milisegundos:

1. **Elegibilidad (reglas de la ficha).** Cada motor declara en su ficha en qué fases aplica, a qué tipologías y qué entradas necesita. Si falta la entrada (por ejemplo, no hay IFC), el motor no se considera. Esto es un filtro, no un juicio.
2. **Enrutador aprendido.** Es un modelo rápido (LightGBM) que recibe los rasgos del caso: tipología, monto, región, secciones presentes, historial del postor. Predice qué motores tienen probabilidad de encontrar algo útil. Aprende de lo que el evaluador aceptó o descartó: un motor que nunca aporta en cierto tipo de obra deja de activarse ahí.
3. **Asesor LLM (en Amazon Bedrock).** Solo interviene cuando el enrutador duda, o cuando la tipología es nueva y no hay historia. Lee el resumen del caso y las fichas del catálogo, y propone qué activar con una razón escrita. En `aprendizaje` también propone motores nuevos cuando una obra falló por algo que ningún motor cubría.
4. **Exploración.** Siempre se activa un porcentaje pequeño de motores que no fueron elegidos. Si no, el enrutador solo aprendería de lo que ya activa y nunca descubriría que otro motor también servía.

Cada activación queda registrada con su origen (`ficha`, `enrutador`, `asesor` o `exploracion`) y su puntaje. Con eso el evaluador puede preguntar por qué se corrió un motor, y `aprendizaje` tiene datos para reentrenar al enrutador.

## Por qué está organizado así

**Contextos por fase del flujo.** La carpeta refleja cómo trabaja la UEI: expediente → selección → ejecución → aprendizaje. Si una regla de selección cambia, se toca `seleccion/` y nada más.

**Hexágono dentro de cada contexto.** El dominio no sabe si los datos vienen de Postgres o de un falso en memoria, ni si el modelo corre en ONNX o en otra cosa. Por eso:
- las pruebas unitarias corren en milisegundos, sin AWS;
- cambiar de tecnología (Textract por otro OCR, Bedrock por otro proveedor) es escribir otro adaptador.

**`motores/` es un catálogo, no un contexto.** Cada motor es un paquete propio que implementa el contrato `Motor` de `compartido`. Los motores no se conocen entre sí, y ningún contexto importa un motor directamente: `arranque` los registra. Agregar el motor 31 es crear su carpeta y anotarlo en el catálogo, sin tocar el orquestador ni las fases.

**El contrato `Motor` vive en `compartido`.** Lo usan tres lados: el orquestador lo ejecuta, `aprendizaje` lo reentrena y cada motor lo implementa. Si viviera en uno de ellos, los otros tendrían que importarlo y los contextos dejarían de ser independientes.

**`orquestador/` separado de `motores/`.** El orquestador es un modelo en sí, con sus propios datos (las decisiones y la retroalimentación del evaluador), su reentrenamiento y sus métricas. Tiene un ciclo de vida distinto al de cada motor.

**`documentos/` aparte.** Un expediente pasa por decenas de motores. Si cada motor parseara el PDF, se haría 30 veces el trabajo más lento del sistema. El documento se extrae una sola vez, queda en caché por su hash, y todos los motores leen esa versión estructurada.

**`aprendizaje/` aparte de la API.** Entrenar es lento y pesado, así que corre en el worker (SQS + ECS Spot) y nunca frena a quien está revisando un expediente. Una versión nueva solo se promueve si supera a la anterior, y la API la carga sin reiniciarse.

**`arranque/` es el único que conoce todo.** Las dependencias se arman ahí por constructor. No hay globals ni magia, así que cada pieza se puede probar sola.

**La arquitectura se verifica, no se promete.** `pyproject.toml` trae contratos de import-linter, y `uv run lint-imports` falla si alguien rompe una regla:
- el dominio importa una librería;
- un contexto importa a otro;
- alguien que no sea `arranque` conecta piezas.

## Un motor por dentro (cuando exista el primero)

```
motores/<id_motor>/
  ficha.py            qué detecta, fases, tipologías, entradas que necesita, señal de la que aprende
  caracteristicas.py  documento estructurado → tabla de rasgos (Polars)
  inferencia.py       implementa Motor: carga el ONNX al arrancar, predice y explica cada hallazgo
  entrenamiento.py    solo en el worker: entrena, exporta a ONNX, devuelve métricas
  evaluacion/         conjunto dorado sintético y umbrales mínimos (los datos reales viven en S3)
```

## Local hoy, AWS mañana

Una sola imagen Docker sirve para todo. Cada pieza local tiene su par en AWS, y el código solo ve variables `AXIS_*`, así que pasar a AWS es cambiar valores, no código.

| Local (`docker compose`) | AWS (Terraform) | Qué cambia |
|---|---|---|
| `api` (Granian + FastAPI) | ECS Fargate detrás de un ALB | nada; la misma imagen desde ECR |
| `postgres` (pgvector 0.8.1, pg17) | RDS Postgres + RDS Proxy | `AXIS_BASE_DATOS_URL` |
| `almacen` (SeaweedFS, API de S3) | S3: `axis-documentos`, `axis-modelos` | se quita `AXIS_S3_ENDPOINT` |
| `preparar` (buckets + `alembic upgrade head`) | tarea ECS única en cada despliegue | Terraform crea los buckets |
| `entrenar` | tarea ECS programada, en Spot | lee los datos de un bucket en vez de un volumen |
| Tesseract dentro de la imagen | Textract | otro adaptador del puerto `MotorOcr` |
| credenciales `local` | rol IAM de la tarea | ninguna clave en el código |

## Cómo se lee un documento (`documentos/`)

1. **Huella** (sin modelos, milisegundos). Se calcula el hash del archivo; si ya se analizó con los modelos vigentes, se devuelve el resultado guardado. Se reconoce el tipo real por el contenido, se leen los metadatos (programas, fechas, revisiones, firmas) y se decide si cada página es digital, escaneada, mixta o vacía.
2. **Texto.** Las páginas digitales se leen directo. Solo las escaneadas pasan por OCR, en paralelo.
3. **Partes.** Un modelo clasifica cada página por su tipo (memoria, metrados, valorización…), y las páginas seguidas del mismo tipo forman una parte.
4. **Qué es.** Otro modelo mira la composición de partes y dice qué es el archivo completo y a qué fase pertenece. Si no coincide con la fase en la que se subió, la API avisa.
5. **¿Fue editado?** Se reportan hechos observables, cada uno con su explicación y sus páginas. Además, un modelo de anomalías dice qué tan raro es el archivo frente a ~1 200 documentos reales de SEACE.

Los modelos se entrenan con `herramientas/entrenar_documentos.py`, que usa documentos reales y sintéticos. El nombre del archivo sirve como etiqueta débil solo durante el entrenamiento. La API nunca mira el nombre.

## Correcciones: de sintético a real

El generador sintético sirve para arrancar, pero el modelo solo conoce las formas que se le muestran. Lo que lo ancla a la realidad son las correcciones del evaluador.

- `POST /documentos/{id}/correcciones` con `{"pagina": 16, "etiqueta": "cotizacion"}` corrige una página. Sin `pagina`, corrige el tipo del documento completo.
- La corrección se guarda por **hash del archivo**, no por análisis. Si el archivo se reanaliza con modelos nuevos, la corrección se vuelve a aplicar.
- Al corregir se rehacen las partes. Si solo se corrigieron páginas, el tipo del documento se recalcula.
- Una etiqueta que el modelo no conoce se acepta (`es_etiqueta_nueva: true`) y se aprende en el próximo entrenamiento.
- Al entrenar, cada página corregida pesa 5 veces lo que pesa una sintética. Si el archivo corregido también está en el corpus real, se descarta su etiqueta por nombre.
- Las métricas separan tres cosas:
  - la exactitud en **correcciones que el modelo no vio** (la medida honesta);
  - cuántas correcciones **reproduce** el modelo final (verifica que las aprendió);
  - la exactitud en sintéticos (que sola no dice nada).

## Partidas: tablas leídas por posición

Casi todos los motores leen partidas (precios, metrados, valorizaciones). Se extraen una sola vez, al analizar el documento, de **todas** las páginas. Como es barato, una corrección del tipo de página no obliga a releer el archivo.

- **No se lee el texto línea por línea.** En un presupuesto S10 real, el texto plano separa las descripciones de los números. Se usan palabras con su posición:
  - en un PDF digital, cajas de carácter "holgadas" de pdfium (con la altura de la fuente, para que un punto no parta la fila);
  - en un escaneo, las líneas que reconoce Tesseract (endereza la hoja torcida);
  - en un Excel, la columna y la fila de cada celda.
- Cada fila se interpreta como ítem, descripción, unidad y números, y trae **su propio control: cantidad × precio ≈ parcial**. Una fila sin unidad es un título con su subtotal.
- **Medido sobre presupuestos reales de SEACE:**
  - digitales: 998 de 1010 filas verificables cuadran, en milisegundos por documento;
  - escaneado: 58 de 60 en uno de 7 páginas, en 2,8 s con OCR.
- **El LLM de Bedrock no se usa aquí todavía.** La API marca las `paginas_dudosas` (menos de la mitad cuadra). Esas serían las candidatas a una segunda lectura con el LLM, y se conecta solo si el volumen lo justifica.
- La clave de caché incluye `VERSION_LECTURA`: si cambia el extractor, el mismo archivo se vuelve a leer.
