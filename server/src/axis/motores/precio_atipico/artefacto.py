import io
from dataclasses import dataclass

import joblib

from axis.motores.precio_atipico.inferencia import MotorPrecioAtipico
from axis.motores.precio_atipico.modelo import ModeloPrecios

PREFIJO = "motores/precio_atipico"


@dataclass(frozen=True)
class ArtefactoPrecios:
    version: str
    modelo: ModeloPrecios
    metricas: dict[str, object]


def serializar(artefacto: ArtefactoPrecios) -> bytes:
    bufer = io.BytesIO()
    joblib.dump(artefacto, bufer, compress=3)
    return bufer.getvalue()


def cargar(contenido: bytes) -> MotorPrecioAtipico:
    artefacto = joblib.load(io.BytesIO(contenido))
    if not isinstance(artefacto, ArtefactoPrecios):
        raise TypeError("no es un artefacto del motor de precios")
    return MotorPrecioAtipico(artefacto.modelo, artefacto.version)
