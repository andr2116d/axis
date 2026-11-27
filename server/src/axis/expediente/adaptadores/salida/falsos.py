"""Adaptadores en memoria para pruebas."""

from collections.abc import Callable, Mapping, Sequence

from axis.compartido.dominio.avance import Avisador
from axis.compartido.dominio.motores import ResultadoMotor
from axis.expediente.aplicacion.dto import ResultadoDeMotores, ResumenDocumento
from axis.expediente.dominio.entidades import (
    EvaluacionExpediente,
    Expediente,
    IdExpediente,
    Seccion,
)
from axis.expediente.dominio.revisiones import RevisionHallazgo


class RepositorioExpedientesEnMemoria:
    def __init__(self) -> None:
        self._expedientes: dict[IdExpediente, Expediente] = {}
        self._evaluaciones: dict[IdExpediente, list[EvaluacionExpediente]] = {}
        self._revisiones: dict[IdExpediente, list[RevisionHallazgo]] = {}

    async def guardar(self, expediente: Expediente) -> None:
        self._expedientes[expediente.id] = expediente

    async def obtener(self, id_expediente: IdExpediente) -> Expediente | None:
        return self._expedientes.get(id_expediente)

    async def guardar_evaluacion(self, evaluacion: EvaluacionExpediente) -> None:
        self._evaluaciones.setdefault(evaluacion.id_expediente, []).append(evaluacion)

    async def ultima_evaluacion(self, id_expediente: IdExpediente) -> EvaluacionExpediente | None:
        lista = self._evaluaciones.get(id_expediente)
        return lista[-1] if lista else None

    async def guardar_revision(self, revision: RevisionHallazgo) -> None:
        self._revisiones.setdefault(revision.id_expediente, []).append(revision)

    async def revisiones(self, id_expediente: IdExpediente) -> tuple[RevisionHallazgo, ...]:
        return tuple(self._revisiones.get(id_expediente, ()))


class DocumentosFijos:
    def __init__(self, resumenes: Mapping[str, ResumenDocumento]) -> None:
        self._resumenes = dict(resumenes)

    async def resumen(self, id_documento: str) -> ResumenDocumento | None:
        return self._resumenes.get(id_documento)


class EvaluadorPorFuncion:
    """Delega en una función de prueba y guarda con qué se lo llamó."""

    def __init__(
        self,
        funcion: Callable[
            [Expediente, Sequence[Seccion], Mapping[str, ResultadoMotor]], ResultadoDeMotores
        ],
    ) -> None:
        self._funcion = funcion
        self.llamadas: list[tuple[tuple[Seccion, ...], dict[str, ResultadoMotor]]] = []

    async def evaluar(
        self,
        expediente: Expediente,
        secciones: Sequence[Seccion],
        previos: Mapping[str, ResultadoMotor],
        avisar: Avisador,
    ) -> ResultadoDeMotores:
        self.llamadas.append((tuple(secciones), dict(previos)))
        return self._funcion(expediente, secciones, previos)
