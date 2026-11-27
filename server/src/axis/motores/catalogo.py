"""Los motores que existen y cómo se carga cada uno desde su artefacto.

Agregar un motor es crear su paquete y anotarlo aquí: el orquestador no cambia.
"""

from collections.abc import Callable
from dataclasses import dataclass

from axis.compartido.dominio.motores import Motor
from axis.motores.precio_atipico import artefacto as precio_atipico


@dataclass(frozen=True)
class EntradaCatalogo:
    prefijo: str  # dónde está su registro en el bucket de modelos
    cargar: Callable[[bytes], Motor]


CATALOGO: tuple[EntradaCatalogo, ...] = (
    EntradaCatalogo(precio_atipico.PREFIJO, precio_atipico.cargar),
)
