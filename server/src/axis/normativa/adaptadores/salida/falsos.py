"""Adaptadores en memoria para pruebas."""

from collections.abc import Callable, Sequence

from axis.normativa.aplicacion.dto import CitaPropuesta, ConsultaLector, ResumenNorma
from axis.normativa.dominio.errores import LectorNoDisponible
from axis.normativa.dominio.servicios import palabras_de
from axis.normativa.dominio.valores import Fragmento, Norma, RespuestaNormativa, TipoNorma


class RepositorioNormativaEnMemoria:
    def __init__(self) -> None:
        self._normas: dict[str, Norma] = {}
        self._fragmentos: dict[str, tuple[Fragmento, ...]] = {}
        self._versiones = 0

    async def reemplazar(self, norma: Norma, fragmentos: Sequence[Fragmento]) -> None:
        self._normas[norma.id] = norma
        self._fragmentos[norma.id] = tuple(fragmentos)
        self._versiones += 1

    async def normas(self) -> tuple[ResumenNorma, ...]:
        return tuple(ResumenNorma(n, len(self._fragmentos[i])) for i, n in self._normas.items())

    async def fragmentos_de_tipo(self, tipo: TipoNorma) -> tuple[Fragmento, ...]:
        return tuple(
            f for i, n in self._normas.items() if n.tipo is tipo for f in self._fragmentos[i]
        )

    async def obtener(self, id_fragmento: str) -> Fragmento | None:
        return next(
            (f for fs in self._fragmentos.values() for f in fs if f.id == id_fragmento), None
        )

    async def buscar(
        self, consulta: str, *, excluir: frozenset[TipoNorma], limite: int
    ) -> tuple[Fragmento, ...]:
        palabras = palabras_de(consulta)

        def coincidencias(f: Fragmento) -> int:
            return len(palabras & palabras_de(f"{f.titulo} {f.texto}"))

        posibles = [
            f
            for i, n in self._normas.items()
            if n.tipo not in excluir
            for f in self._fragmentos[i]
            if coincidencias(f)
        ]
        return tuple(sorted(posibles, key=coincidencias, reverse=True)[:limite])

    async def version(self) -> str:
        return str(self._versiones)


class LectorPorFuncion:
    """Responde con una función de prueba y guarda lo que recibió."""

    def __init__(self, funcion: Callable[[ConsultaLector], Sequence[CitaPropuesta]]) -> None:
        self._funcion = funcion
        self.consultas: list[ConsultaLector] = []

    @property
    def nombre(self) -> str:
        return "lector-de-prueba"

    async def leer(self, consulta: ConsultaLector) -> Sequence[CitaPropuesta]:
        self.consultas.append(consulta)
        return self._funcion(consulta)


class LectorCaido:
    @property
    def nombre(self) -> str:
        return "lector-caido"

    async def leer(self, consulta: ConsultaLector) -> Sequence[CitaPropuesta]:
        raise LectorNoDisponible("sin credenciales")


class CacheEnMemoria:
    def __init__(self) -> None:
        self._respuestas: dict[str, RespuestaNormativa] = {}

    async def obtener(self, clave: str) -> RespuestaNormativa | None:
        return self._respuestas.get(clave)

    async def guardar(self, clave: str, respuesta: RespuestaNormativa) -> None:
        self._respuestas[clave] = respuesta
