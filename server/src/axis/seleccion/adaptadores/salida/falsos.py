"""Adaptadores en memoria para pruebas."""

from collections.abc import Mapping, Sequence

from axis.seleccion.dominio.valores import Antecedente, FuenteAntecedentes, Proceso


class ProcesosFijos:
    def __init__(self, *lista: Proceso) -> None:
        self._procesos = {p.id: p for p in lista}

    async def obtener(self, id_proceso: str) -> Proceso | None:
        return self._procesos.get(id_proceso)


class AntecedentesFijos:
    def __init__(self, lista: Sequence[Antecedente], fuente: FuenteAntecedentes) -> None:
        self._lista = tuple(lista)
        self._fuente = fuente
        self.consultas: list[tuple[str, ...]] = []

    async def de(self, rucs: Sequence[str]) -> Mapping[str, tuple[Antecedente, ...]]:
        self.consultas.append(tuple(rucs))
        return {
            r: tuple(a for a in self._lista if a.ruc == r)
            for r in rucs
            if any(a.ruc == r for a in self._lista)
        }

    async def fuente(self) -> FuenteAntecedentes:
        return self._fuente
