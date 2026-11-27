import asyncio
import time
from dataclasses import dataclass

import structlog

from axis.compartido.dominio.motores import EntradaMotor, Hallazgo, Motor
from axis.compartido.dominio.valores import Fase
from axis.orquestador.aplicacion.puertos import CatalogoMotores, FuenteEntradas
from axis.orquestador.dominio.evaluacion import Evaluacion, FallaMotor
from axis.orquestador.dominio.plan import planificar_por_ficha

log = structlog.get_logger()


@dataclass(frozen=True, slots=True)
class OrdenEvaluar:
    id_documento: str
    fase: Fase | None = None
    tipologia: str | None = None


class EvaluarDocumento:
    """Decide qué motores aplican, los corre en paralelo y junta los hallazgos."""

    def __init__(
        self, *, catalogo: CatalogoMotores, fuente: FuenteEntradas, limite_segundos: float
    ) -> None:
        self._catalogo = catalogo
        self._fuente = fuente
        self._limite = limite_segundos

    async def ejecutar(self, orden: OrdenEvaluar) -> Evaluacion:
        inicio = time.perf_counter()
        entrada = await self._fuente.de_documento(orden.id_documento, orden.fase, orden.tipologia)
        motores = {m.ficha.id: m for m in self._catalogo.motores()}
        plan = planificar_por_ficha([m.ficha for m in motores.values()], entrada)
        resultados = await asyncio.gather(
            *(self._correr(motores[id_motor], entrada) for id_motor in plan.motores)
        )
        hallazgos = tuple(h for r in resultados if isinstance(r, tuple) for h in r)
        fallas = tuple(r for r in resultados if isinstance(r, FallaMotor))
        return Evaluacion(plan, hallazgos, fallas, round((time.perf_counter() - inicio) * 1000))

    async def _correr(
        self, motor: Motor, entrada: EntradaMotor
    ) -> tuple[Hallazgo, ...] | FallaMotor:
        # Un motor que se cae o se cuelga no puede arrastrar a los demás.
        try:
            async with asyncio.timeout(self._limite):
                return tuple(await motor.evaluar(entrada))
        except TimeoutError:
            return FallaMotor(motor.ficha.id, f"tardó más de {self._limite:g} s")
        except Exception as error:  # se informa como falla del motor, no se oculta
            log.exception("motor_fallo", motor=motor.ficha.id)
            return FallaMotor(motor.ficha.id, f"{type(error).__name__}: {error}"[:200])
