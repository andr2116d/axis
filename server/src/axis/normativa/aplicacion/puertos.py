from collections.abc import Sequence
from typing import Protocol

from axis.normativa.aplicacion.dto import CitaPropuesta, ConsultaLector, ResumenNorma
from axis.normativa.dominio.valores import Fragmento, Norma, RespuestaNormativa, TipoNorma


class RepositorioNormativa(Protocol):
    async def reemplazar(self, norma: Norma, fragmentos: Sequence[Fragmento]) -> None:
        """Guarda la norma con sus fragmentos; si ya estaba, la versión anterior se borra."""
        ...

    async def normas(self) -> tuple[ResumenNorma, ...]: ...
    async def fragmentos_de_tipo(self, tipo: TipoNorma) -> tuple[Fragmento, ...]:
        """En orden: el texto que lee el modelo tiene que salir igual cada vez (caché)."""
        ...

    async def obtener(self, id_fragmento: str) -> Fragmento | None: ...
    async def buscar(
        self, consulta: str, *, excluir: frozenset[TipoNorma], limite: int
    ) -> tuple[Fragmento, ...]:
        """Los fragmentos que más comparten palabras con la consulta, del más al menos parecido."""
        ...

    async def version(self) -> str:
        """Cambia cada vez que se reindexa: invalida las respuestas guardadas."""
        ...


class LectorNormativa(Protocol):
    """Un modelo que lee la norma y elige qué fragmentos aplican al caso, con un extracto."""

    @property
    def nombre(self) -> str: ...

    async def leer(self, consulta: ConsultaLector) -> Sequence[CitaPropuesta]: ...


class CacheRespuestas(Protocol):
    async def obtener(self, clave: str) -> RespuestaNormativa | None: ...
    async def guardar(self, clave: str, respuesta: RespuestaNormativa) -> None: ...
