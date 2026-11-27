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

## Orquestador y primer motor (implementados)

`POST /evaluaciones {"id_documento": …, "fase"?, "tipologia"?}` responde con:
- el semáforo;
- los motores activados y por qué;
- los omitidos y qué falta para prenderlos ("Falta subir: presupuesto");
- los hallazgos, cada uno con su explicación;
- las fallas.

- **Hoy decide la ficha.** Cada motor declara fases, tipologías y partes requeridas. El enrutador aprendido, el asesor LLM y la exploración se suman después como otras fuentes de activación (`OrigenActivacion`).
- Los motores corren en paralelo, con un límite de tiempo cada uno (`AXIS_SEGUNDOS_POR_MOTOR`). Si uno se cae o tarda, se informa como falla y no frena a los demás.
- El puente entre `documentos` y `orquestador` vive en `arranque/puentes.py`: los contextos no se importan entre sí.
- Cada motor tiene su registro en S3 (`motores/<id>/actual.json`). `arranque/catalogo.py` lo carga y lo recarga sin reiniciar. Agregar un motor es crear su paquete y anotarlo en `motores/catalogo.py`.

### Motor `precio_atipico`

- **Cómo agrupa:** solo compara partidas de la **misma unidad y la misma actividad** (la primera palabra con contenido: remoción, relleno, corte…), parecidas en palabras y en letras.
- **Cómo decide que un precio es raro:** cada grupo guarda la distribución del precio en escala logarítmica (mediana y MAD). Un precio es raro si se aleja varias dispersiones de la mediana **y** la diferencia importa en plata.
- **Cuándo no opina:**
  - partidas globales (`glb`, `est`);
  - filas que no cuadran (el precio leído puede ser un error de lectura);
  - partidas sin grupo parecido.
- **Cómo se ajusta** (`herramientas/entrenar_precios.py`): la agrupación y los umbrales se eligen por validación cruzada **por obra**. Se mide:
  - las falsas alarmas sobre precios reales (máximo 5 %);
  - la detección de errores metidos a propósito (×3, ÷3, ×10);
  - la cobertura.
- **Primera versión, con 956 precios de 23 obras:**
  - **falsas alarmas: 3 %;**
  - **detección: 82–95 %;**
  - **cobertura: 38 %** de las partidas.

  Varias de las "falsas alarmas" son en realidad precios raros que vale la pena mirar (trazo y replanteo a 4,5 veces lo usual).

## Expediente (implementado)

- `POST /expedientes` crea un expediente (obra, CUI, entidad, tipología).
- `POST /expedientes/{id}/documentos {"id_documento"}` adjunta un documento ya analizado. **Cada parte la da el documento más reciente que la trae**: subir solo metrados nuevos reemplaza la sección de metrados (v2) y deja las demás.
- `POST /expedientes/{id}/evaluar` arma la entrada de los motores con las **secciones vigentes**, cada una leída solo de sus páginas en su documento.
  - Cada resultado de motor guarda una **firma**: el motor, su versión y el documento de cada parte que lee. Al reevaluar, un motor cuyas partes no cambiaron **no se vuelve a correr**.
  - Cada sección queda `rojo`, `ambar`, `verde` o **`sin_revisar`**. Una sección que ningún motor lee todavía no se pinta de verde.
- Las evaluaciones se numeran y se guardan completas (resultados, omisiones, fallas), así que se puede reconstruir qué se dijo en cada versión.

### Motor `metrados_presupuesto`

- **Necesita** las partes `metrados` y `presupuesto`. Compara la cantidad de cada partida del presupuesto con el metrado de la planilla (el último número de su fila).
- **Para no acusar por un error de lectura:**
  - solo usa filas del presupuesto que cuadran;
  - exige el mismo ítem (01.01.01 = 1.1.1), la misma unidad y una descripción parecida;
  - **roja** solo si la diferencia es de 10 % o más **y** el metrado está confirmado (la planilla repite el valor en la fila);
  - una diferencia de ×10, ×100 o ×1000 se marca **ámbar** como posible coma corrida, con confianza 0,4.
- **"Sin metrado que la sustente"** solo se dice si la planilla se leyó bien: hay metrado para al menos el 70 % de las partidas.
- Es una verificación de coherencia: no se entrena. Se registra en `motores/catalogo.py` como motor fijo.
- **Primera prueba real** (proceso 1156628, escaneado): 4 diferencias aparentes, de las cuales 3 eran comas que el OCR no leyó y 1 era un 5 leído como 6. Con los resguardos queda 1 aviso ámbar de baja confianza.

## Revisión del evaluador (implementada)

`POST /expedientes/{id}/hallazgos/{clave}/revision {"decision", "motivo"?}` registra lo que el evaluador decide sobre un hallazgo de la última evaluación:

- **`confirmado`:** es un problema; se observa al consultor. La sección sigue en rojo o ámbar.
- **`descartado`:** falsa alarma; el motor se equivocó. Pide motivo.
- **`justificado`:** es inusual, pero tiene una razón válida (flete, zona alejada…). Pide motivo.

Cómo se comporta:
- Un hallazgo descartado o justificado **deja de pintar** su sección y el semáforo. La salida dice cuántos quedan `abiertos` por sección y cuántos están `sin_revisar` en total.
- Cada hallazgo tiene una **clave estable**: motor, documento, sección, página e ítem. No usa el título ni la versión, porque traen números que cambian al reentrenar, y la decisión tiene que seguir valiendo. Si se sube un documento nuevo para esa parte, el hallazgo es otro y se vuelve a revisar.
- Se guarda **todo el historial** (`revisiones_hallazgo`); vale la última decisión. Cada revisión lleva una copia del hallazgo tal como lo vio el evaluador, con su motor y versión.

Por qué importa: estas revisiones son las **etiquetas** que faltaban. Con ellas se entrena el enrutador aprendido (qué motores sirven en qué expedientes) y se mide cada motor con alarmas reales, no solo con errores metidos a propósito.

## Normativa (implementada)

Las citas legales las elige un modelo que **lee el texto oficial**. Ningún número de artículo está escrito en el código.

**Índice.** `herramientas/indexar_normas.py` parte en artículos y disposiciones los textos consolidados vigentes:
- **Ley N.° 32069** (texto al 19-07-2026): 100 artículos y 41 disposiciones.
- **Reglamento, D.S. N.° 009-2025-EF** (texto al 09-01-2026): 390 artículos y 22 disposiciones.

Cómo se lee la estructura:
- El parser sigue la estructura del texto: Título, Capítulo y Subcapítulo; artículos (con títulos de varias líneas); disposiciones complementarias finales, transitorias, modificatorias y derogatorias.
- Se salta lo que no es norma: el decreto aprobatorio (antes del Título I) y la fe de erratas.
- Cuando una modificación transcribe el texto nuevo de un artículo, queda como `art-82~2`, con la etiqueta "Artículo 82 (texto modificado)", junto a la nota de vigencia.
- Cada fragmento se guarda sin tildes en un `tsvector` en español, con el título pesando doble. Buscar toma unos 6 ms.
- Reindexar cambia la huella de la norma, y eso invalida las respuestas guardadas.

**Lectura** (`POST /normativa/consultas {"pregunta", "contexto"?}`):
1. **La ley entera va en el prompt de sistema del LLM** (por Bedrock, `anthropic.claude-opus-5-5`, con pensamiento adaptativo), con **caché de 1 hora**. Son unos 55k tokens, que después de la primera consulta se leen desde la caché.
2. **Del reglamento van solo los 14 fragmentos candidatos** de la búsqueda, en el mensaje del usuario junto con el caso. Es demasiado largo (~250k tokens) para mandarlo entero cada vez.
3. El LLM responde con un JSON estructurado: identificador del fragmento, extracto, razón y pertinencia (`alta` o `media`).
4. **Cada cita se verifica contra el texto oficial.** El fragmento tiene que estar entre los que se le dieron, y el extracto tiene que ser literal (se admiten omisiones con "(...)", en orden). Si no, se descarta y se cuenta en `descartadas`.
5. La respuesta se guarda por consulta y versión del índice: la misma pregunta no se vuelve a pagar ni a esperar.

**Si el LLM no responde** (sin credenciales, un error o una negativa), la API no falla. Devuelve las 3 coincidencias por palabras con `origen: "busqueda"` y `leida_por_modelo: false`, y avisa en cada cita que nadie la leyó. Si el modelo declina, la reintenta `anthropic.claude-opus-4-8` mediante el middleware del SDK, porque Bedrock no tiene fallback del lado del servidor.

**Por hallazgo:** `GET /expedientes/{id}/hallazgos/{clave}/normativa` arma la consulta con el hallazgo (obra, sección, explicación y factores) y devuelve los artículos en los que el evaluador puede apoyar la observación. La ruta vive en `arranque/rutas_compuestas.py`, porque une `expediente` con `normativa`.

**Configuración:**
- `AXIS_LECTOR_NORMATIVA` (`api` | `bedrock` | `ninguno`), `AXIS_MODELO_LLM` (Bedrock), `AXIS_MODELO_LLM_API` (API directa del proveedor, `claude-opus-5-5`), `AXIS_MODELO_LLM_RESPALDO` y `AXIS_ESFUERZO_NORMATIVA` (por defecto `medium`).
- Con `api`, la clave sale del entorno del SDK. En local va en `server/.env.local`, que docker compose lee y git ignora. Si el LLM declina, la API reintenta con otro modelo (`fallbacks: "default"`); en Bedrock eso lo hace el middleware del cliente.
- En AWS se usa el rol IAM de la tarea.
- En local, `docker compose` monta `~/.aws`; exporta `AXIS_AWS_PERFIL` con tu perfil SSO.

## Avance en vivo (SSE, implementado)

`POST /expedientes/{id}/archivos/en-vivo` hace lo mismo que `/archivos`, pero transmite por Server-Sent Events cada etapa apenas ocurre. Usa el SSE nativo de FastAPI, que manda keep-alive para que un OCR largo no corte la conexión.

| evento | cuándo | datos |
|---|---|---|
| `recibido` | al llegar el archivo | bytes |
| `ya_analizado` | el mismo archivo ya estaba analizado | — |
| `lectura` | páginas leídas | páginas, escaneadas |
| `ocr` | cada página que termina el OCR | página, hechas, total |
| `documento` | tipo, partes y partidas | id_documento, tipo, partes, partidas |
| `plan` | qué motores se activan | activados, reutilizados, omitidos |
| `motor` | cada motor apenas termina (el rápido no espera al lento) | motor, versión, hallazgos o falla |
| `hallazgo` | cada hallazgo | clave, severidad, sección, página, ítem |
| `listo` | fin | el expediente completo, igual que `/archivos` |
| `error` | un error de dominio | error, detalle, código HTTP equivalente |

- **Cómo avisan los casos de uso.** Usan el puerto `Avisador` de `compartido`. Por defecto no avisan, así que las rutas que responden de una vez no cambian.
- **Si el cliente se desconecta,** el trabajo a medias se cancela.
- **Primera prueba real** (relación de insumos escaneada, 5 páginas): el evaluador ve la lectura a los 70 ms y el OCR página por página, y el resultado llega a los 6 s.

**Semáforo vacío.** Si ningún motor revisó ninguna sección, el semáforo global es `null`, no verde. Verde quiere decir "se revisó y está bien".

## Selección: antecedentes de los postores (implementada)

`GET /seleccion/procesos/{id}/revision?al_dia=` revisa el historial público de cada postor de un procedimiento de selección y le dice al comité dónde mirar más a fondo. La buena pro sigue las reglas de la ley; Axis no la decide.

**Datos** (`herramientas/importar_seleccion.py`, datos abiertos):
- **1 408 procesos de obra de La Libertad**, con 19 238 postores y sus ganadores. Fuente: OCDS del OECE.
- **21 629 antecedentes de proveedores:** inhabilitaciones administrativas y judiciales, multas y penalidades del OECE. El corte del registro es el **08-03-2025**, y cada hallazgo lo dice.

**Reglas.** Son hechos del registro, no un modelo. Se evalúan a la fecha de la convocatoria, o a la que se pida:

| Hallazgo | Severidad | Cuándo |
|---|---|---|
| Inhabilitado para contratar | rojo | Inhabilitación vigente a esa fecha |
| Antecedente de información inexacta o documentos falsos | ámbar | Sanción ya cumplida por ese motivo (el patrón de Huanchaco): verificar a fondo los documentos y el personal clave |
| Sanciones anteriores del Tribunal | ámbar | Otra inhabilitación ya cumplida (por ejemplo, un contrato resuelto) |
| Penalidades en contratos anteriores | ámbar | Cuántas, por cuánto y quién las aplicó |
| Multas del Tribunal | ámbar | Cuántas y por cuánto |

Lo que pasa después de la fecha de la convocatoria no cuenta para ese proceso. Cada hallazgo cita la resolución, el motivo, la vigencia y la fuente con su corte. Usa el mismo contrato `Hallazgo` que el expediente, con una clave propia por postor y regla.

**Lo que no se revisa todavía:**
- **Consorcios.** Un consorcio no tiene RUC propio en el OCDS, así que sale como «no revisado». Hay que leer sus integrantes de los contratos.
- **Sanciones posteriores al corte.** No están en el registro cargado.

**Primera corrida sobre los 1 408 procesos reales** (14 s, unos 10 ms por proceso):
- En **11 procesos se presentó un postor que figuraba inhabilitado** a la fecha de la convocatoria. Ninguno ganó.
- Un mismo proveedor, inhabilitado hasta el 15-03-2027 por información inexacta, se presentó a 7 procesos de setiembre y octubre de 2026.
- En 9 procesos, el ganador tenía antecedentes de información inexacta o documentos falsos.
- 21 ganadores tenían penalidades previas.
