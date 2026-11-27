from axis.seleccion.aplicacion.puertos import RepositorioProcesos
from axis.seleccion.dominio.valores import Proceso

MAXIMO = 20


class BuscarProcesos:
    """Encuentra un proceso de selección sin tener que saber su número exacto."""

    def __init__(self, *, procesos: RepositorioProcesos) -> None:
        self._procesos = procesos

    async def ejecutar(self, texto: str) -> tuple[Proceso, ...]:
        if len(texto.strip()) < 3:  # noqa: PLR2004
            return ()
        return await self._procesos.buscar(texto, MAXIMO)
