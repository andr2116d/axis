from datetime import datetime
from typing import Protocol


class Reloj(Protocol):
    """Fuente de la hora actual; el dominio nunca la lee por su cuenta."""

    def ahora(self) -> datetime: ...
