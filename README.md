# Axis · El eje que mantiene todo en su lugar

Axis convierte errores documentados de obras anteriores en pruebas para revisar expedientes técnicos de pistas y veredas. Prototipo de estudiantes de la UPAO para la Hackathon Innova Norte 3G (UNT), Desafío 1.

[Ver el despliegue público](https://axis-pe.vercel.app). El recorrido de entrada prioriza una demostración que se puede seguir sin preparar archivos.

## Ejecutar

```sh
npm install
npm run dev             # http://localhost:3000
npm run build           # compilación de producción
npm start               # servir la compilación
npm run analisis:regresion
```

Stack: Next.js 14, React 18, TypeScript, Tailwind CSS, Leaflet, pdf.js y Tesseract. Los datos públicos ya recortados están incluidos en `src/data/real`; los archivos de `../datos-crudos` no se necesitan para ejecutar la aplicación.

## Despliegue

El repositorio está conectado a Vercel:

- cada push a `main` publica en el despliegue de producción;
- cada push a otra rama genera una vista previa con su propio enlace.

Antes de fusionar en `main`, corre `npm run build` y `npm run analisis:regresion`.

## Recorrido de demostración

1. En **Revisar**, abre **Probar un ejemplo**, selecciona **Con observaciones** y pulsa **Revisar ejemplo**. Se lee el PDF real del ejemplo y se ejecuta el motor; no se simula el resultado.
2. El resumen muestra qué hacer y un gráfico de observaciones por tema. Pulsa **Revisar primera observación** o elige una barra: se muestra un punto, su acción y la evidencia desplegable. **Territorio** reúne mapa, perfil del terreno y espesores; **Plan de obra**, los controles.
3. Abre **Ver informe** para imprimir o guardar en PDF. **Volver a la revisión** recupera el análisis de esa pestaña. El logo vuelve al inicio y **Continuar revisión** recupera el resultado.
4. Compara los ejemplos **Sin observaciones** e **Incompleto**, o abre **Subir mis PDF** para cargar uno o varios archivos propios. Con archivos propios, confirma la clasificación y el alcance parcial/completo.
5. En **Hallazgos de obra**, prueba como supervisor, llena el ejemplo y registra el hallazgo. Pasa a curador, valida la prueba y aplícala al ejemplo de Calle Santa Clara. Aparece una alerta nueva en **Lo aprendido en obras cercanas**.
6. Usa **Ganadores y proveedores** para explorar adjudicaciones, filtrar obras o consultar un RUC. **Biblioteca de pruebas** permite buscar reglas y sus casos de origen.

## Rutas actuales

| Ruta | Función |
|---|---|
| `/` y `/revisar` | Selección/carga, lectura, confirmación y resultados |
| `/revisar?demo=0` | Abrir directamente el ejemplo observado (`1`: conforme, `2`: incompleto) |
| `/revisar?reanudar=1` | Recuperar la revisión de esta pestaña |
| `/informe` | Informe imprimible del último análisis |
| `/ganadores` | Obras adjudicadas y antecedentes de proveedores |
| `/obra` | Registro de hallazgos y validación de pruebas |
| `/pruebas` | Biblioteca buscable; cada regla admite enlace `#ID` |
| `/como-funciona` | Recorrido, fuentes, privacidad, alcance y validación |

API: `POST /api/analizar`, `POST /api/clasificar`, `GET /api/ganadores`, `GET /api/proveedor`, `GET /api/territorio`.

## Datos, estado y límites

Los tres expedientes de ejemplo son ficticios y sus errores representan casos documentados. El territorio y los antecedentes provienen de registros públicos descargados; no se consulta al SEACE/OECE en vivo. Las atribuciones y el alcance están en **Cómo funciona** y `docs/fuentes-de-datos-la-libertad.md`.

El PDF se lee en el navegador; antes de enviar texto al servidor se ocultan los datos personales que reconoce el filtro. El OCR intenta leer hasta 30 páginas escaneadas por archivo. La lectura dudosa se marca para confirmación. Axis apoya la revisión y no sustituye el criterio del evaluador.

Perfiles, hallazgos y reglas aprendidas se conservan en localStorage (`axis:v2`); el último análisis, en sessionStorage (`axis:analisis`). Los perfiles son parte de la demostración y no constituyen autenticación. Cada navegador tiene su propia sesión.

## Organización

- `src/lib/analisis`: lectores, verificadores, terreno, proveedores, clasificador y aprendizaje.
- `src/components`: flujo de revisión, resultados, mapa, diagramas y componentes comunes.
- `src/data/verificadores.ts`: reglas con sus recomendaciones y casos reales de origen.
- `scripts/analisis`: regresión, pruebas con documentos reales y entrenamiento.
- `scripts/datos`: descarga y preparación de fuentes públicas.
- `PRODUCT.md`, `DESIGN.md`: contexto y sistema visual del rediseño.

La suite de regresión cubre 85 casos: números, presupuestos reales, tres expedientes sintéticos, pertinencia (documentos que no son expedientes, como CV, informes o contratos, no se revisan), territorio, plan de obra, competencia, ciclo de aprendizaje y clasificación.
