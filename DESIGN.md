---
name: Axis
description: "Axis Cube: una tarea principal y evidencia a demanda."
colors:
  fondo: "#FCFAF7"
  tinta: "#282723"
  tinta-2: "#504E4A"
  gris: "#65615C"
  borde: "#DEDAD5"
  borde-control: "#817D76"
  blanco: "#FFFFFF"
  accion: "#FE6F2D"
  sobre-accion: "#271E18"
  primario: "#AC4014"
  primario-oscuro: "#AC4014"
  primario-claro: "#FFF0E6"
  falla: "#AE332D"
  falla-tenue: "#FEF1EF"
  aviso: "#805716"
  aviso-tenue: "#FBF5E8"
  pasa: "#326B4D"
  pasa-tenue: "#EFF6F0"
  revisar: "#50616B"
  revisar-tenue: "#F0F4F6"
  filtro-activo: "#282723"
  filtro-texto: "#FFFFFF"
  papel-suave: "#FCFAF7"
  verde-suave: "#F4F1ED"
  grafico-pista: "#F4F1ED"
  grafico-capa: "#C75222"
  perfil-linea: "#C75222"
  perfil-area: "#FFF0E6"
  perfil-guia: "#817D76"
typography:
  display:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "clamp(32px, 3.6vw, 48px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  display-mobile:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "clamp(29px, 7.8vw, 42px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  body-small:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: "20px"
  review-action:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: "20px"
  navigation:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  observation-title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "15.5px"
    fontWeight: 600
    lineHeight: 1.375
  evidence-body:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.625
  result-heading:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.03em"
  decision:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  guided-title:
    fontFamily: "Public Sans, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    lineHeight: 1.45
    letterSpacing: "-0.02em"
  quote:
    fontFamily: "IBM Plex Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.625
rounded:
  sm: "2px"
  chart: "4px"
  badge: "5px"
  chip: "6px"
  lg: "8px"
  list: "10px"
  xl: "12px"
  panel: "14px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
components:
  button-primary:
    backgroundColor: "{colors.accion}"
    textColor: "{colors.sobre-accion}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primario-oscuro}"
  button-review:
    backgroundColor: "{colors.primario}"
    textColor: "{colors.blanco}"
    typography: "{typography.review-action}"
    rounded: "{rounded.lg}"
    padding: "10px 22px"
  button-outline:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "10px 16px"
  button-outline-hover:
    backgroundColor: "{colors.primario-claro}"
  field:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "10px 12px"
    width: "100%"
  navigation-item:
    textColor: "{colors.tinta-2}"
    typography: "{typography.navigation}"
  navigation-item-active:
    textColor: "{colors.primario}"
  filter-chip:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.chip}"
    padding: "9px 14px"
  filter-chip-selected:
    backgroundColor: "{colors.filtro-activo}"
    textColor: "{colors.filtro-texto}"
  card:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
  observation:
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
    padding: "16px"
  start-panel:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    padding: "28px"
  source-disclosure:
    textColor: "{colors.tinta}"
  guided-finding:
    backgroundColor: "{colors.blanco}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.xl}"
    padding: "28px"
  topic-chart-row:
    textColor: "{colors.tinta}"
    rounded: "{rounded.chart}"
    padding: "10px 4px"
  topic-chart-track:
    backgroundColor: "{colors.grafico-pista}"
    height: "8px"
  layer-chart-track:
    backgroundColor: "{colors.grafico-pista}"
    height: "12px"
---

# Design System: Axis

## Overview

**Creative North Star: "Axis Cube"**

Axis convierte conocimiento de obras anteriores en una revisión legible y concreta. Conserva papel marfil, tinta grafito, acentos naranja y Public Sans. La interfaz presenta una tarea principal; las fuentes, los datos de contexto y el detalle técnico se consultan cuando hacen falta.

La preferencia explícita del usuario define la composición: navegación horizontal, menú móvil dentro del flujo y menos información simultánea. Las superficies son tranquilas y la evidencia conserva su origen. La accesibilidad se expresa mediante controles distinguibles, texto suficiente, foco visible y recorridos de teclado.

**Key Characteristics:**

- Navegación horizontal y menú móvil dentro de la página.
- Una decisión, una acción principal y un punto por vez, con contexto desplegable.
- Papel marfil, tinta grafito y piezas naranja.
- Campos contrastados, foco sólido y controles amplios.
- Evidencia documental accesible sin marcos exteriores anidados.

Fuentes: `globals.css`, `tailwind.config.ts`, `Encabezado.tsx`, `FlujoRevision.tsx`, `Resultados.tsx`, `ResumenRevision.tsx`, `RevisionGuiada.tsx`, `DibujoCalle.tsx` y `MapaObra.tsx`. Esta actualización sustituye la composición anterior. El frontmatter registra valores vigentes; el sidecar añade estados y ejemplos autónomos. Los alias heredados de Tailwind siguen apuntando a esta paleta.

## Colors

El cubo y el botón principal usan Monarch Orange (#FE6F2D). El texto del botón es oscuro en ambos modos. El modo oscuro combina un fondo carbón (#262524), paneles (#302F2D) y texto marfil (#F6F2EC). La cabecera permite cambiar el modo y recordar la elección. Las rampas OKLCH del sidecar son muestras calculadas para el visor, no tokens adicionales de la aplicación.

### Primary

- **Naranja de contraste — `primario`:** enlaces, navegación y pestañas seleccionadas, cursor y foco.
- **Tinta profunda — `primario-oscuro`:** énfasis en enlaces.
- **Arena clara — `primario-claro`:** hover secundario, recomendaciones y destino activo del menú estrecho.

### Neutral

- **Papel cálido — `fondo`:** lienzo, cabecera, carga y extractos.
- **Tinta carbón — `tinta` / `tinta-2`:** lectura principal y explicación.
- **Gris cálido — `gris`:** metadatos y texto contextual.
- **Línea mineral — `borde`:** divisores y contenedores; **borde de control — `borde-control`:** campos, menú y superficie de perfil.
- **Blanco — `blanco`:** superficies de trabajo.
- **Carbón seleccionado — `filtro-activo` / `filtro-texto`:** únicamente la inversión de filtros seleccionados.
- **Papel suave — `papel-suave`:** lectura secundaria y hover de listados.
- **Verde suave — `verde-suave`:** avisos de contexto.

### Functional

`falla`, `aviso`, `pasa` y `revisar`, con sus fondos tenues, distinguen observaciones, advertencias, conformidad y comprobaciones pendientes.

### Gráficas

Las cantidades por tema usan naranja de contraste sobre `grafico-pista`. Los espesores usan `grafico-capa`; el perfil combina `perfil-linea`, `perfil-area` y `perfil-guia`. Son colores de lectura gráfica, con valores y etiquetas explícitos.

**The Estado legible Rule.** La etiqueta explica el estado; el color y los iconos lo refuerzan sin sustituirla.

## Typography

**Display Font:** Public Sans, con `system-ui, sans-serif`.  
**Body Font:** Public Sans.  
**Label/Mono Font:** Public Sans para controles; IBM Plex Mono, con `ui-monospace, monospace`, para citas y códigos.

La fuente principal carga pesos 400–800 y la monoespaciada, 400 y 500. Los tamaños responden a funciones concretas, sin imponer una escala modular artificial.

- **Inicio:** usa `display`; hasta 699 px usa `display-mobile`. El titular se centra en escritorio y se alinea a la izquierda en móvil. La explicación usa 16 px y altura 1.75.
- **Cabeceras y secciones:** `headline` pasa a 28 px en móvil. La cabecera de resultados usa `result-heading` y pasa a 24 px hasta 799 px. La decisión usa `decision`, 28 px hasta 799 px y 27 px hasta 599 px. El título del punto guiado usa `guided-title` y pasa a 20 px hasta 599 px.
- **Lectura:** base de 16 px; contexto de 14–15 px. Los metadatos compactos usan 13 px. El título de observación y su detalle conservan sus roles específicos del frontmatter.
- **Controles:** botones base de 14 px; “Revisar ejemplo” de 16 px, o 15 px en móvil. Navegación de 14 px, o 16 px hasta 699 px. Pestañas de inicio de 15 px, 14 px en móvil y 13 px hasta 360 px.
- **Citas:** 12 px monoespaciados, saltos conservados y palabras largas divisibles; la medida de texto de revisión es 68ch.
- **Cifras:** importes y conteos usan números tabulares. Las cantidades de la gráfica por tema acompañan etiquetas de 15 px; la cobertura usa 22 px; los espesores usan 20 px y unidades de 13 px.

El logotipo vectorial integra el cubo y el nombre Axis. En la cabecera ocupa 116 px de ancho y en el informe 98 px. Los tamaños pequeños son locales a metadatos y evidencia; no son el tamaño base de campos o explicación.

**The Evidencia distinguible Rule.** El monoespaciado identifica material documental y códigos; el razonamiento y las acciones permanecen en Public Sans.

## Layout

La cabecera horizontal tiene un contenedor de 1240 px, padding de 18 px 32 px y separación de 32 px. Sus cinco destinos son “Revisar”, “Biblioteca”, “Proveedores”, “Hallazgos” y “Cómo funciona”. El perfil se abre mediante `details`; no compite con la tarea principal.

El área principal tiene máximo de 1180 px y padding de 44 px 32 px 64 px. La portada se concentra en 680 px: propósito, dos pestañas —ejemplo o PDF propio— y una acción principal. El selector ofrece tres expedientes; el antecedente aparece bajo “¿De dónde salen las pruebas?”.

Los resultados tienen máximo de 1050 px y cuatro pestañas: “Resumen”, “Revisar puntos”, “Territorio” y “Plan de obra”. Resumen presenta una decisión, una acción principal y cantidades por tema. Su composición de columnas 1fr / .95fr usa separación de 48 px. El recorrido guiado tiene máximo de 820 px y muestra un punto y su acción a la vez; su filtro de temas ocupa hasta 360 px.

“Consultar por documento” conserva un selector de máximo 540 px en cualquier anchura, bajo disclosure. El detalle continúa sin marco exterior adicional. Los datos del expediente y los antecedentes del plan se despliegan a demanda. Territorio antepone mapa y perfil, en dos columnas iguales con separación de 32 px; debajo sitúa los espesores, de máximo 720 px, y las comprobaciones plegadas.

| Condición | Comportamiento vigente |
| --- | --- |
| Hasta 1199 px | Los filtros de proveedores cambian a dos columnas. |
| Hasta 1099 px | “Menú” muestra la navegación dentro de la cabecera; el perfil abierto pasa al flujo; padding principal lateral de 24 px. |
| Hasta 799 px | Resumen y gráficas territoriales pasan a una columna. |
| Hasta 699 px | Navegación vertical dentro de la página; contenido de una columna; padding principal de 32 px 20 px 48 px; panel inicial de 22 px 18 px. |
| Hasta 599 px | Las cuatro pestañas de resultados forman dos filas de dos; filtro y progreso se apilan; la ficha guiada usa padding de 22 px 18 px y las citas pasan a una columna. |
| Hasta 360 px | Pestañas más compactas; acción principal y enlace PDF se apilan. |

El menú usa `aria-expanded`, `aria-controls` y estado de destino. Escape cierra primero el perfil y devuelve el foco a su summary; si el menú está abierto, lo cierra y devuelve foco al botón. La selección de ruta cierra ambos. La marca es un enlace nativo a `/`: vuelve al inicio aunque ya se esté en esa ruta y conserva el análisis de `sessionStorage` para reanudarlo. No se incorpora navegación lateral, drawer ni diálogo modal.

### Impresión

Los elementos `no-imprimir` se ocultan. El documento usa fondo blanco, área principal sin padding y márgenes de página de 18 mm. Las tarjetas pierden sombras; el informe pierde borde, radio y padding. Los textos largos pueden partirse.

## Elevation & Depth

La jerarquía depende del contenido, las líneas de 1 px y el tono. Las superficies de trabajo son planas. El perfil abierto usa borde contrastado y fondo blanco; en escritorio se sitúa a 54 px del extremo superior de su contenedor, con ancho de 280 px, y hasta 1099 px se integra en el flujo.

Tailwind conserva la sombra `0 8px 30px -16px rgba(36,44,40,0.12)`, sin uso observado de `shadow-tarjeta`. No es un tratamiento por defecto. El foco de campos es un contorno sólido, no una sombra translúcida.

**The Superficie tranquila Rule.** El contenido abierto amplía la lectura; no se añade un marco exterior para envolver cada nivel de evidencia.

Las transiciones de color de botones duran 150 ms. Los chevrons giran 90 grados al abrirse; las observaciones usan una transición de transformación de 150 ms. Movimiento reducido elimina animaciones y transiciones y evita desplazamiento suave.

## Shapes

Botones y campos usan radio `lg`; filtros, `chip`; tarjetas generales y observaciones, `xl`; área inicial, `panel`. La carga usa `list`. Las filas de la gráfica por tema usan `chart`; las pistas de datos conservan extremos rectos. Los bordes discontinuos identifican carga o vacío; los divisores finos organizan documentos y antecedentes desplegables.

La marca combina el nombre Axis con tres caras del Axis Cube. Los cortes oblicuos forman piezas desiguales. El ícono de pestaña agrupa los cortes para conservar su lectura a 16 px. Los iconos de interfaz usan una cuadrícula de 24 × 24, trazo de 1.75 y extremos redondeados. Los disclosures mantienen un chevron visible cuando se retira el marcador nativo.

## Components

### Buttons

La base tiene mínimo de 44 px, separación de 8 px y padding normativo. El principal usa naranja y texto oscuro; el secundario usa blanco, tinta y borde mineral. Hover ilumina el principal y cambia borde/fondo del secundario. Deshabilitado: opacidad del 50% y cursor correspondiente.

“Revisar ejemplo” tiene mínimo de 48 px y padding horizontal de 22 px; en móvil, 14 px. El enlace PDF conserva un área mínima de 44 px. Los enlaces textuales mantienen subrayado y separación de 4 px.

### Inputs / Fields

Los campos base son blancos, de 16 px, ancho completo y mínimo de 44 px. El borde usa `borde-control`. En foco, borde y contorno sólido de 2 px usan naranja de contraste, con separación de 2 px. El rótulo permanece fuera del campo. El selector de ejemplo tiene tres opciones y peso 500; documentos y perfil usan el mismo lenguaje de campo.

La búsqueda de biblioteca desplaza el texto 40 px para la lupa y mantiene 16 px. Hasta 699 px, los campos del área principal fuerzan 16 px para que una variante compacta no reduzca la lectura móvil.

### Navigation

Los enlaces horizontales tienen mínimo de 44 × 44 px. El activo combina naranja de contraste, peso 600 y borde inferior de 2 px; hover cambia el texto a naranja de contraste. En móvil, el activo suma fondo de arena clara y subrayado. El menú se abre dentro del documento y mantiene los destinos accesibles sin superposición.

### Chips

Los filtros usan texto de 14 px, mínimo de 44 px, borde mineral, padding de 9 px 14 px y radio `chip`. `aria-pressed` distingue la selección, que invierte a carbón y texto claro. No sustituyen al selector de ejemplos de la portada.

### Disclosures y evidencia

La fuente de portada, los datos del expediente, todos los documentos y el origen del plan usan `details/summary`. Se distinguen mediante texto, divisor y chevron; su apertura revela contexto sin duplicar contenedores.

La ficha guiada muestra estado, documento, título y “Qué hacer ahora” —“Qué corregir” para proyectista— antes de la evidencia. “Ver evidencia y fuente” abre explicación, citas y origen. El filtro agrupa por costos y cantidades, documentos y diseño, territorio o aprendizaje de obra. “Anterior” y “Siguiente punto” recorren la lista; comenzar o avanzar mueve el foco al título. El último punto ofrece “Abrir informe”. Leer o avanzar no marca una corrección como realizada.

La consulta documental y las comprobaciones territoriales mantienen sus observaciones desplegables. El selector documental funciona igual en escritorio y móvil.

### Pestañas, foco y mapa

Inicio y resultados mantienen roles de pestaña, estado seleccionado y flechas/Home/End. Resultados conserva cuatro destinos y comienza en Resumen. El panel de resultados conserva `tabIndex={0}` y contorno visible de 2 px separado 6 px. El detalle documental tiene su propio contorno cuando recibe foco.

El foco global usa 2 px y separación de 4 px. La excepción del título de fase y del destino principal del salto de contenido no se extiende al título guiado: este tiene foco visible de 2 px separado 7 px. Los modos de colores forzados refuerzan foco, controles y selección. El enlace “Saltar al contenido” aparece al recibir foco.

El mapa tiene nombre de región, instrucciones de teclado y controles “Acercar mapa” / “Alejar mapa” de al menos 44 × 44 px. Su foco usa contorno de 2 px separado 2 px. La rueda no cambia el zoom; los datos del terreno también se describen en texto.

### Gráficas y siguiente acción

Las barras de observaciones representan cantidades por tema: cada longitud es el conteo dividido por el mayor conteo visible. Cada fila es un botón de mínimo 66 px que abre el recorrido filtrado; los números y los nombres permanecen visibles. No representa porcentaje de aprobación.

El perfil dibuja elevación contra distancia, con ejes HTML de 13 px y altura gráfica de 180 px. El SVG tiene descripción accesible; la lectura declara pendiente, desnivel, metros sobre el nivel del mar y fuente Copernicus de resolución 30 m. Se indica que los ejes usan escalas distintas. Los espesores muestran centímetros y barras proporcionales al mayor espesor visible. Si hay varias zonas de calzada, un selector las separa; no suma intervenciones diferentes. Las capas de vereda se identifican por separado.

La acción del resumen depende del estado: revisar observaciones o pendientes, subir más documentos cuando la cobertura es limitada, o consultar controles de obra. Sin observaciones no equivale a aprobación. Si falta una parte dinámica de la aplicación, aparece un aviso de carga y “Actualizar aplicación” recarga la pestaña; no se atribuye el fallo a un expediente inválido.

## Do's and Don'ts

### Do:

- **Do** conservar navegación horizontal y menú móvil dentro de la página.
- **Do** mostrar una decisión y una acción principal; recorrer un punto a la vez y abrir su evidencia a demanda.
- **Do** explicar unidades, fuente y escala de cada gráfica y separar las zonas de intervención.
- **Do** mantener selector de documentos en todas las anchuras.
- **Do** reutilizar campos contrastados, foco sólido y áreas de interacción existentes.
- **Do** conservar el acceso por teclado, el origen de la evidencia y la impresión.

### Don't:

- **Don't** reintroducir sidebar, índice lateral, drawer o menú modal.
- **Don't** volver a mostrar simultáneamente todas las funciones en la portada.
- **Don't** añadir un marco exterior alrededor de los detalles documentales.
- **Don't** quitar el foco de controles o el chevron de los disclosures.
- **Don't** reducir el texto base para encajar más información.
- **Don't** usar color o mapa como única explicación de un resultado.
- **Don't** presentar una cobertura limitada como aprobación ni un punto leído como corregido.

