import asyncio
import time
from collections.abc import Mapping
from dataclasses import dataclass, replace

import structlog

from axis.compartido.dominio.avance import Avance, Avisador, sin_aviso
from axis.compartido.dominio.motores import EntradaMotor, Hallazgo, Motor, ResultadoMotor
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


class EvaluarEntrada:
    """Decide qué motores aplican y corre en paralelo solo los que tienen algo nuevo que leer."""

    def __init__(self, *, catalogo: CatalogoMotores, limite_segundos: float) -> None:
        self._catalogo = catalogo
        self._limite = limite_segundos

    async def ejecutar(
        self,
        entrada: EntradaMotor,
        previos: Mapping[str, ResultadoMotor] | None = None,
        avisar: Avisador = sin_aviso,
    ) -> Evaluacion:
        inicio = time.perf_counter()
        previos = previos or {}
        motores = {m.ficha.id: m for m in self._catalogo.motores()}
        plan = planificar_por_ficha([m.ficha for m in motores.values()], entrada)
        reutilizables: list[ResultadoMotor] = []
        por_correr: list[Motor] = []
        for id_motor in plan.motores:
            motor = motores[id_motor]
            anterior = previos.get(id_motor)
            # Si el motor y las partes que lee no cambiaron, su resultado sigue valiendo.
            if anterior is not None and anterior.firma == entrada.firma_para(motor.ficha):
                reutilizables.append(replace(anterior, reutilizado=True))
            else:
                por_correr.append(motor)
        await avisar(
            Avance(
                "plan",
                f"Se activan {len(plan.motores)} motores; {len(plan.omisiones)} no aplican aún.",
                {
                    "activados": ", ".join(plan.motores),
                    "reutilizados": ", ".join(r.id_motor for r in reutilizables),
                    "omitidos": len(plan.omisiones),
                },
            )
        )
        for reutilizado in reutilizables:
            await _avisar_resultado(avisar, reutilizado)
        # Cada motor se avisa apenas termina: el más rápido no espera al más lento.
        corridos: list[ResultadoMotor | FallaMotor] = []
        for tarea in asyncio.as_completed([self._correr(m, entrada) for m in por_correr]):
            corrido = await tarea
            corridos.append(corrido)
            await _avisar_resultado(avisar, corrido)
        resultados = tuple(reutilizables) + tuple(
            r for r in corridos if isinstance(r, ResultadoMotor)
        )
        fallas = tuple(r for r in corridos if isinstance(r, FallaMotor))
        return Evaluacion(plan, resultados, fallas, round((time.perf_counter() - inicio) * 1000))

    async def _correr(self, motor: Motor, entrada: EntradaMotor) -> ResultadoMotor | FallaMotor:
        # Un motor que se cae o se cuelga no puede arrastrar a los demás.
        try:
            async with asyncio.timeout(self._limite):
                hallazgos = tuple(await motor.evaluar(entrada))
        except TimeoutError:
            return FallaMotor(motor.ficha.id, f"tardó más de {self._limite:g} s")
        except Exception as error:  # se informa como falla del motor, no se oculta
            log.exception("motor_fallo", motor=motor.ficha.id)
            return FallaMotor(motor.ficha.id, f"{type(error).__name__}: {error}"[:200])
        return ResultadoMotor(
            motor.ficha.id, motor.ficha.version, entrada.firma_para(motor.ficha), hallazgos
        )


async def _avisar_resultado(avisar: Avisador, resultado: ResultadoMotor | FallaMotor) -> None:
    if isinstance(resultado, FallaMotor):
        await avisar(
            Avance(
                "motor",
                f"El motor {resultado.id_motor} falló: {resultado.razon}",
                {"motor": resultado.id_motor, "falla": resultado.razon},
            )
        )
        return
    await avisar(
        Avance(
            "motor",
            f"{resultado.id_motor}: {len(resultado.hallazgos)} hallazgos.",
            {
                "motor": resultado.id_motor,
                "version": resultado.version_motor,
                "hallazgos": len(resultado.hallazgos),
                "reutilizado": resultado.reutilizado,
            },
        )
    )
    for hallazgo in resultado.hallazgos:
        await avisar(_avance_hallazgo(hallazgo))


def _avance_hallazgo(h: Hallazgo) -> Avance:
    return Avance(
        "hallazgo",
        h.titulo,
        {
            "clave": h.clave,
            "motor": h.id_motor,
            "severidad": h.severidad.value,
            "seccion": h.seccion,
            "pagina": h.pagina,
            "item": h.item,
            "confianza": h.confianza,
        },
    )


class EvaluarDocumento:
    """Evalúa un documento suelto, sin historia: corre todo lo que aplica."""

    def __init__(
        self, *, catalogo: CatalogoMotores, fuente: FuenteEntradas, limite_segundos: float
    ) -> None:
        self._fuente = fuente
        self._evaluar = EvaluarEntrada(catalogo=catalogo, limite_segundos=limite_segundos)

    async def ejecutar(self, orden: OrdenEvaluar) -> Evaluacion:
        entrada = await self._fuente.de_documento(orden.id_documento, orden.fase, orden.tipologia)
        return await self._evaluar.ejecutar(entrada)
