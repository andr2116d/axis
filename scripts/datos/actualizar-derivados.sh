#!/bin/sh
# Regenera los datos derivados cuando terminan las descargas largas (Contraloría, adicionales, contratos de consorcio).
# Uso: sh scripts/datos/actualizar-derivados.sh <datos-crudos>   (desde la carpeta del proyecto)
set -e
C="$1"
python3 -I scripts/datos/situaciones.py "$C/contraloria" "$C/contraloria/situaciones.json"
python3 -I scripts/datos/taxonomia_situaciones.py "$C/contraloria/situaciones.json" "$C/contraloria/situaciones_etiquetadas.json"
python3 -I scripts/datos/antecedentes_contraloria.py "$C/contraloria/situaciones_etiquetadas.json" src/data/real/antecedentes_contraloria.json
python3 -I scripts/datos/competencia.py "$C/obras_la_libertad.json" "$C/contratos_la_libertad.json" src/data/real/competencia_la_libertad.json
python3 -I scripts/datos/miembros_consorcios.py "$C/oece" "$C/contratos_txt" "$C/obras_la_libertad.json" src/data/real/competencia_la_libertad.json
python3 -I scripts/datos/causas_adicionales.py "$C/adicionales" "$C/contratos_la_libertad.json" "$C/consultas.json" "$C/causas_adicionales.json"
npx tsx scripts/analisis/exposicion-pliegos.ts "$C/consultas.json" "$C/exposicion_pliegos.json"
python3 -I scripts/datos/premisa.py "$C/obras_la_libertad.json" "$C/contratos_la_libertad.json" "$C/exposicion_pliegos.json" "$C/premisa.json"
python3 -I scripts/datos/precursores.py "$C/causas_adicionales.json" "$C/exposicion_pliegos.json" "$C/obras_la_libertad.json" "$C/precursores.json"
npm run -s analisis:regresion
