from collections.abc import Mapping, Sequence
from typing import Protocol

from axis.seleccion.dominio.valores import Antecedente, FuenteAntecedentes, Proceso


class RepositorioProcesos(Protocol):
    async def obtener(self, id_proceso: str) -> Proceso | None: ...


class RegistroAntecedentes(Protocol):
    """El historial público de proveedores (en Perú, los registros del OECE)."""

    async def de(self, rucs: Sequence[str]) -> Mapping[str, tuple[Antecedente, ...]]:
        """Todos los antecedentes de esos RUC, en una sola consulta."""
        ...

    async def fuente(self) -> FuenteAntecedentes: ...
