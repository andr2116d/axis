from enum import StrEnum


class Fase(StrEnum):
    """Fases del proceso de inversión en las que trabaja la unidad ejecutora."""

    EXPEDIENTE = "expediente"
    SELECCION = "seleccion"
    EJECUCION = "ejecucion"


class Semaforo(StrEnum):
    VERDE = "verde"
    AMBAR = "ambar"
    ROJO = "rojo"
