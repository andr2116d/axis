# Fuentes de datos reales para Axis en La Libertad

Investigación del 12 nov 2026. Todas las fuentes de este documento se probaron en vivo; las cifras salen de esas consultas.

## Qué dicen las bases sobre datos

- Se aceptan datos sintéticos (glosario y "Producto esperado": no se exige acceso a datos reales), pero el Desafío 1 pide expresamente "verificación de antecedentes, registros y sanciones de proveedores **mediante fuentes oficiales disponibles**".
- Anexo 2: no usar datos personales ni información reservada sin autorización; **el prototipo no se conecta a sistemas productivos**. Por eso todo se descarga antes (al construir) y la app sirve una copia fija con fecha de corte. Nunca se consulta el SEACE ni otro sistema en vivo desde la app.
- Criterio 6 de la rúbrica (10 pts): seguridad, ética y cumplimiento de límites. Cada dato lleva fuente, licencia y fecha.
- Normativa del Desafío 1 que conviene citar: Ley 32069 y su Reglamento (DS 009-2025-EF), RD 0019-2026-EF/54.01 (Guía de Actuaciones Preparatorias, con anexos en Excel), Ley 27785 e Invierte.pe.

## 1. Obras y contrataciones (el corazón de Axis)

### OECE: contrataciones abiertas (OCDS) ✅ lo mejor que encontramos
- API: `https://contratacionesabiertas.oece.gob.pe/api/v1/releases?page=N`, además de `/record/{ocid}`, `/buyers` y `/process`.
- Descarga masiva mensual desde 2018: `/api/v1/files` lista los archivos; por ejemplo, `/api/v1/file/seace_v3/json/2026/10/` es un zip de 7.5 MB que trae un JSON de 71 MB. También hay versiones en CSV y XLSX.
- Licencia **CC BY 4.0**.
- **Octubre 2026, La Libertad: 84 contrataciones de obras** (más 118 de servicios y 105 de bienes). Se filtran por `parties[buyer].address.department == "LA LIBERTAD"`.
- Cada proceso trae:
  - entidad, descripción, monto, CUI (`planning.budget.projectID`), método de selección y fechas;
  - postores y ganador con su RUC;
  - enlaces públicos a los documentos: bases administrativas, **bases integradas (con el presupuesto de obra)**, **pliego de absolución de consultas y observaciones**, actas de evaluación y buena pro.
- Ejemplo verificado: "Reparación de calzada Av. Jaime Blanco, El Porvenir" (CUI 2735216, S/ 2.79 M).
  - Las bases integradas traen el presupuesto completo: partidas, metrados y precios.
  - El pliego trae observaciones reales de los postores sobre el expediente: metrados que no concuerdan con el presupuesto, un factor de la fórmula polinómica distinto entre documentos, plan de ensayos no conciliado con los metrados, y errores materiales.
  - **Estas observaciones son el mejor origen documentado para las pruebas de Axis**: errores reales de La Libertad que se corrigieron tarde, durante la licitación, y que Axis habría detectado antes de convocar.

### MEF: Detalle de inversiones (Invierte.pe) ✅
- CSV de 248 MB, actualizado el 10 nov 2026: `https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv`.
- Tiene 68 columnas. Las útiles para Axis:
  - `CODIGO_UNICO`, `LATITUD`, `LONGITUD`, `UBIGEO`;
  - `MONTO_VIABLE` frente a `COSTO_ACTUALIZADO`;
  - `MONTO_LAUDO`, `CTRL_CONCURR`, `AVANCE_FISICO`;
  - `EXPEDIENTE_TECNICO`, `TIENE_F8`, `MONTO_ET_F8`, `FEC_INI_EJECUCION` y `FEC_FIN_EJECUCION`;
  - `FUNCION`, `TIPO_INVERSION`.
- **La Libertad tiene 7,894 inversiones activas, y 7,885 tienen coordenadas.** De ellas:
  - **1,966** subieron su costo más de 15% sobre el monto viable.
  - **49** tienen laudo arbitral, por S/ 45.5 M en total.
  - **653** tienen control concurrente.
  - 6,228 tienen Formato 8 (expediente técnico registrado).
- **La unión con el OECE por CUI funciona al 100%**: los 86 CUI de las licitaciones de octubre están en el MEF.
- Uso en Axis: ubicar cada obra en el mapa, contar el historial de sobrecostos de la zona y del tipo de obra, y medir el impacto con montos reales.

### OECE: sanciones y penalidades (CONOSCE) ✅
- Página: `bi.seace.gob.pe/pentaho/api/repos/:public:portal:datosabiertospenalidades.html/content?userid=public&password=key`.
- CSV separados por `|`, en codificación latin-1:
  - `sancionados.csv` (inhabilitaciones): RUC, razón social, fechas, número de resolución y motivo;
  - `sancionados_multa.csv`;
  - `penalidades.csv`: contrato, RUC, tipo, entidad, fecha, motivo y monto.
- Fecha de corte de los archivos descargados: 8 mar 2025. Hay que buscar una versión más reciente en datosabiertos.gob.pe ("Proveedores sancionados 2025", diciembre 2025).
- Uso: el ganador o los postores de cada proceso (su RUC sale en el OCDS) se cruzan con las sanciones y penalidades. Esto cubre la segunda línea de solución del desafío.
- ⚠️ Los RUC que empiezan en 10 son personas naturales y llevan el DNI dentro del número. Hay que mostrar solo "tiene sanción vigente: sí o no" con el número de resolución, o limitarse a personas jurídicas (RUC 20).

### Infobras (Contraloría) ⚠️
- Solo tiene un portal web (`infobras.contraloria.gob.pe/InfobrasWeb/Mapa/Index`), sin API ni exportación.
- Uso: un enlace de consulta por obra. El avance y las fechas ya vienen del CSV del MEF.

### Informes de control (Contraloría) ⚠️
- Se consultan en el Buscador de Informes de Control de gob.pe/contraloria. Hay varios informes de La Libertad sobre expedientes deficientes (por ejemplo, la IE 82209 de El Porvenir y el paseo de la Av. Larco).
- Uso: selección manual de 5 a 10 casos como orígenes de pruebas, con el número de informe.

### Formatos oficiales
- RD 0019-2026-EF/54.01 aprueba la Guía de Actuaciones Preparatorias (84 páginas) y sus Anexos 1 y 2 (xlsx). Los sistemas de entrega de obras explican quién asume los errores del expediente técnico.
- Formatos de Invierte.pe que aparecen en el CSV del MEF: F8 (expediente técnico), F9 (cierre), F12B (seguimiento).
- Pendiente: el "formato de revisión del expediente técnico" que cita la propuesta (Anexo 12) hay que ubicarlo en la directiva vigente.

## 2. Territorio de La Libertad

Todos estos servicios son ArcGIS REST con consulta habilitada: devuelven GeoJSON (`f=geojson`) recortado al departamento.

### INGEMMET, GEOCATMIN ✅ (`geocatmin.ingemmet.gob.pe/arcgis/rest/services`)

Conteos dentro del recuadro de La Libertad, que también incluye zonas de las regiones vecinas:

| Servicio / capa | Elementos | Para qué sirve en Axis |
|---|---|---|
| `SERV_PELIGROS_GEOLOGICOS/0` Peligros geológicos | 2,771 | Prueba de contexto: la obra cae en una zona de huaico o deslizamiento. Cada punto trae sector, estudio de origen y recomendación ("zona no apta para vivienda") |
| `SERV_PELIGROS_GEOLOGICOS/2` Zonas críticas | 242 | Igual que la anterior, con mayor severidad |
| `SERV_SUSCEPTIBILIDAD_INUNDACION_FLUVIAL_MIL1` | 144,460 polígonos | Inundación fluvial (FEN) |
| `SERV_NEOTECTONICO/1` Fallas activas | 277 | Prueba sísmica |
| `SERV_GEOLOGIA_50K_INTEGRADA/7` Litología | 12,868 | Tipo de suelo o roca aproximado |
| `SERV_HIDROGEOLOGIA_PERU` | — | Acuíferos. No tiene capa regional de La Libertad, solo la nacional |
| `SERV_CARTOGRAFIA_DEMARCACION_WGS84/2` Distritos | 219 | Límites de los 84 distritos |
| `SERV_OTRAS_FUENTES` | 4,484 vías vecinales, 375 tramos nacionales, 211 departamentales, 520 puentes, 47 líneas de transmisión, 3,042 escuelas, 661 establecimientos de salud, 88 presas | Contexto de la obra. Las vías del MTC están en este servicio, pero son antiguas (de 2013 a 2014) |

### ANA ✅ (`geosnirh.ana.gob.pe/server/rest/services/Público`)

| Capa | Elementos | Uso |
|---|---|---|
| `PuntosCriticos` | 957 | Riesgo de inundación o erosión cerca de la obra |
| `FajaMarginal` | 22,989 | No se puede construir dentro de la faja marginal: es una prueba normativa clara |
| `Rios`, `Drenes`, `CanalDerivacion` | 98, 167 y 3,987 | Interferencias, cruces de canal y obras de arte |
| `EventosEmergenciasHidricas` | 458 | Historial de emergencias hídricas |
| `PC_DU_2026` | Puntos críticos de 2026 con presupuesto | Contexto del FEN |

### Otros
- **MINAM** (`geoservidorperu.minam.gob.pe`): activación de quebradas, ZEE y ubigeo. ✅
- **SENAMHI** (`idesep.senamhi.gob.pe/geoserver`, WMS): cuencas, hidrografía y clima. ✅
- **MTC**: el visor nuevo `vgeoportal.mtc.gob.pe` no expone un servicio abierto. Por ahora se usan sus capas a través de INGEMMET. ⚠️
- **CENEPRED / SIGRID**: el ArcGIS por HTTP responde, pero casi vacío, y la descarga de documentos por HTTPS no funcionó desde aquí. Hay que intentarlo desde un navegador: Mapa de Peligros de Trujillo (INDECI y UNT, 2002), documentos 3413 y 3398. ⚠️
- **OpenStreetMap**: calles y edificaciones de toda la región (ODbL). El servidor Overpass estaba caído durante la prueba; hay que reintentarlo o usar un espejo.

### Napa freática (el dato más sensible de la demo)
- No hay una capa oficial de napa para Trujillo. Lo real disponible:
  - tesis de la UNT de 2022 con piezómetros y mapa isofreático de la zona baja de Víctor Larco;
  - tesis de la UPN en Cortijo Bajo y El Golf;
  - tesis doctoral de Luján Silva (UNT, 2019) sobre microzonificación del distrito de Trujillo;
  - estudios de suelos que vienen dentro de los expedientes publicados en el SEACE.
- Propuesta: la capa de napa se arma con esos puntos citados ("derivada de expedientes y estudios académicos"), tal como describe la propuesta en la sección 10.3. Donde no hay datos, se dice "sin información confiable" en lugar de inventar zonas.

## 3. Cómo encaja en Axis (propuesta, sin construir todavía)

1. **Catálogo real de obras de La Libertad**: se unen el OECE y el MEF por CUI y se muestran en el mapa todas las obras licitadas, con monto, entidad, sobrecosto y laudos.
2. **Pruebas con origen real de La Libertad**: se extraen observaciones de los pliegos de absolución de consultas (metrados, fórmula polinómica, ensayos, interferencias) y de los informes de control. Cada prueba cita el documento del SEACE o de la Contraloría.
3. **Gemelo territorial regional**: peligros geológicos, inundación, faja marginal, puntos críticos, fallas, distritos, vías, escuelas y salud. Todos son reales y se etiquetan con su fuente y fecha de corte.
4. **Verificación del postor ganador**: se cruza con sanciones y penalidades del OECE. Es una fuente oficial, y lo piden las bases.
5. **Expedientes de prueba**: para la demostración en vivo siguen siendo sintéticos (las bases lo permiten), pero ahora ubicados en distritos reales de La Libertad, con contexto real. Además, se puede revisar el **presupuesto real** de una obra publicada (por ejemplo, Jaime Blanco) para mostrar que el lector funciona con documentos de verdad.

### Riesgos y límites
- Peso de los datos: los recortes se precalculan y simplifican en GeoJSON. La inundación fluvial tiene 144 mil polígonos, así que hay que simplificarla o servirla como mosaico (tiles).
- Los documentos del SEACE pueden traer nombres de personas, así que se pasan por el mismo filtro de privacidad antes de mostrarlos.
- Las alertas citan documentos; nunca acusan a personas ni empresas.
- Hay que guardar la fecha de corte de cada fuente y mostrarla en pantalla.


## 4. Fuentes añadidas el 12 nov 2026 (probadas)

| Fuente | Acceso | Qué se usa | Licencia o condición |
|---|---|---|---|
| Contraloría, buscador de informes de control | `POST appbp.contraloria.gob.pe/BuscadorCGR/Informes/BusquedaInformesCGR.ashx` (`Action=loadInformesElastic`, `pGeneral=<texto>`). El filtro por departamento no funciona por código; se filtra en el cliente. Ficha resumen en `apps8.contraloria.gob.pe/SPIC/srvDownload/ViewPDF?CRES_CODIGO=<código>&TIPOARCHIVO=RE` (texto, unos 30 KB; el informe completo es escaneado, de unos 40 MB) | Situaciones adversas | Información pública. El listado trae DNI y nombres de funcionarios: no se guardan |
| Copernicus DEM GLO-30 | `copernicus-dem-30m.s3.amazonaws.com` (4 teselas S08/S09 × W079/W080) | Perfil y cuencas | © DLR/Airbus, provisto bajo COPERNICUS por UE/ESA, con atribución |
| OpenStreetMap, red vial | Overpass `overpass-api.de` con User-Agent (sin él responde 406) | Trazo real de la vía | ODbL |
| OECE OCDS, documentos de contrato | `prod4.seace.gob.pe:9000/api/con/documentos/descargar/<id>` | Adicionales, ampliaciones, nulidades y contratos de consorcio (OCR local) | CC BY 4.0 (metadatos) y documentos públicos del SEACE |
| CONOSCE Consorcios | `tinyurl.com/conosceconsorcios2025` | **No disponible:** 404 en noviembre de 2026 | — |
