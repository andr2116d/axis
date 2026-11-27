from collections.abc import Sequence
from typing import Protocol

from axis.compartido.dominio.motores import EntradaMotor, Motor
from axis.compartido.dominio.valores import Fase


class CatalogoMotores(Protocol):
    def motores(self) -> Sequence[Motor]: ...


class FuenteEntradas(Protocol):
    """Arma lo que leen los motores a partir de un documento ya analizado."""

    async def de_documento(
        self, id_documento: str, fase: Fase | None, tipologia: str | None
    ) -> EntradaMotor: ...
