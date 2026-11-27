"""Tipos de parte y de documento con los que arranca el entrenamiento.

No es una regla del sistema: es el vocabulario inicial de las etiquetas. El modelo guarda las
etiquetas con las que se entrenó, y una corrección del evaluador puede agregar tipos nuevos.
"""

from dataclasses import dataclass

EXPEDIENTE, SELECCION, EJECUCION = "expediente", "seleccion", "ejecucion"


@dataclass(frozen=True)
class Tramo:
    parte: str
    minimo: int
    maximo: int
    probabilidad: float = 1.0  # probabilidad de que el tramo aparezca


@dataclass(frozen=True)
class Receta:
    """Cómo suele estar armado un tipo de documento."""

    fase: str | None
    tramos: tuple[Tramo, ...]
    desordenar: float = 0.0  # probabilidad de que los tramos vengan en otro orden
    por_volumenes: float = 0.0  # probabilidad de que llegue solo un volumen (un tramo seguido)


def _solo(parte: str, minimo: int, maximo: int, fase: str | None) -> Receta:
    return Receta(fase, (Tramo("caratula", 1, 1, 0.3), Tramo(parte, minimo, maximo)))


RECETAS: dict[str, Receta] = {
    "expediente_tecnico": Receta(
        EXPEDIENTE,
        (
            Tramo("caratula", 1, 1, 0.9),
            Tramo("indice", 1, 2, 0.7),
            Tramo("memoria_descriptiva", 3, 12),
            Tramo("especificaciones_tecnicas", 6, 30, 0.9),
            Tramo("metrados", 4, 30, 0.95),
            Tramo("presupuesto", 2, 8, 0.9),
            Tramo("gastos_generales", 1, 3, 0.7),
            Tramo("relacion_insumos", 1, 4, 0.5),
            Tramo("analisis_costos_unitarios", 4, 25, 0.85),
            Tramo("formula_polinomica", 1, 2, 0.7),
            Tramo("cronograma", 1, 3, 0.7),
            Tramo("cotizacion", 1, 6, 0.5),
            Tramo("estudio_suelos", 2, 10, 0.5),
            Tramo("panel_fotografico", 1, 5, 0.4),
            Tramo("planos", 2, 20, 0.7),
        ),
        desordenar=0.25,
        por_volumenes=0.3,
    ),
    "metrados": _solo("metrados", 2, 40, EXPEDIENTE),
    "presupuesto": Receta(
        EXPEDIENTE,
        (
            Tramo("caratula", 1, 1, 0.2),
            Tramo("presupuesto", 1, 8),
            Tramo("gastos_generales", 1, 2, 0.4),
            Tramo("relacion_insumos", 1, 3, 0.3),
            Tramo("analisis_costos_unitarios", 2, 20, 0.4),
            Tramo("formula_polinomica", 1, 1, 0.3),
        ),
    ),
    "memoria_descriptiva": _solo("memoria_descriptiva", 2, 15, EXPEDIENTE),
    "especificaciones_tecnicas": _solo("especificaciones_tecnicas", 3, 40, EXPEDIENTE),
    "analisis_costos_unitarios": _solo("analisis_costos_unitarios", 2, 30, EXPEDIENTE),
    "formula_polinomica": _solo("formula_polinomica", 1, 2, EXPEDIENTE),
    "cronograma": _solo("cronograma", 1, 4, EXPEDIENTE),
    "planos": _solo("planos", 1, 25, EXPEDIENTE),
    "estudio_suelos": _solo("estudio_suelos", 3, 15, EXPEDIENTE),
    "bases": Receta(SELECCION, (Tramo("bases", 15, 80),)),
    "tdr": Receta(SELECCION, (Tramo("tdr", 3, 20),)),
    "absolucion_consultas": Receta(SELECCION, (Tramo("absolucion_consultas", 2, 25),)),
    "contrato": Receta(EJECUCION, (Tramo("contrato", 3, 15),)),
    "valorizacion": Receta(
        EJECUCION,
        (
            Tramo("caratula", 1, 1, 0.5),
            Tramo("informe_obra", 1, 3, 0.4),
            Tramo("valorizacion", 2, 12),
            Tramo("panel_fotografico", 1, 4, 0.5),
        ),
    ),
    "informe_obra": Receta(
        EJECUCION,
        (
            Tramo("caratula", 1, 1, 0.6),
            Tramo("informe_obra", 3, 15),
            Tramo("valorizacion", 1, 3, 0.3),
            Tramo("panel_fotografico", 1, 6, 0.6),
            Tramo("acta", 1, 1, 0.2),
        ),
    ),
    "acta": Receta(None, (Tramo("acta", 1, 3),)),
}

FASES: dict[str, str | None] = {tipo: receta.fase for tipo, receta in RECETAS.items()}

PARTES: tuple[str, ...] = tuple(sorted({t.parte for r in RECETAS.values() for t in r.tramos}))

# Etiqueta débil a partir del nombre del archivo, SOLO para armar el corpus real de entrenamiento.
# En la API nunca se mira el nombre del archivo. El orden importa: lo más específico primero.
NOMBRE_A_TIPO: tuple[tuple[str, str], ...] = (
    # TDR va primero: "TDR ... ADAPTADA A LA ABSOLUCION" es un TDR, no una absolución.
    ("TDR", "tdr"),
    ("TERMINOS DE REFERENCIA", "tdr"),
    ("ABSOLUCION", "absolucion_consultas"),
    ("PLIEGO ABSOLUTORIO", "absolucion_consultas"),
    ("ANALISIS DE COSTO", "analisis_costos_unitarios"),
    ("COSTOS UNITARIOS", "analisis_costos_unitarios"),
    ("FORMULA", "formula_polinomica"),
    ("METRADO", "metrados"),
    ("ESPECIFICACION", "especificaciones_tecnicas"),
    ("MEMORIA", "memoria_descriptiva"),
    ("CRONOGRAMA", "cronograma"),
    ("PLANO", "planos"),
    ("PRESUPUESTO", "presupuesto"),
    ("BASES", "bases"),
    ("ACTA", "acta"),
    ("CONTRATO", "contrato"),
)
