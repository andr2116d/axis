"""Avisos de avance: lo que va pasando mientras se procesa algo largo.

Los casos de uso avisan cuando termina cada etapa; quien los llama decide qué hacer con eso
(enviarlo por SSE, registrarlo o ignorarlo). Así un archivo escaneado de 80 páginas no deja al
evaluador mirando una pantalla quieta.
"""

from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Protocol

type Dato = str | int | float | bool | None


@dataclass(frozen=True, slots=True)
class Avance:
    etapa: str  # "lectura", "ocr", "motor", "hallazgo"…
    mensaje: str  # dicho para una persona
    datos: Mapping[str, Dato] = field(default_factory=dict)


class Avisador(Protocol):
    async def __call__(self, avance: Avance) -> None: ...


async def sin_aviso(avance: Avance) -> None:
    """Para quien no necesita seguir el avance."""
