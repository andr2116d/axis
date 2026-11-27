"""El LLM lee la norma y elige qué fragmentos aplican al caso.

Sirve igual con la API directa que con Amazon Bedrock: cambia el cliente, no la lectura.

La ley entera va en el prompt de sistema con caché de 1 hora: es el mismo texto en cada
consulta, así que después de la primera se lee desde la caché (más rápido y ~10 veces más
barato). Del reglamento solo van los candidatos de la búsqueda, en el mensaje del usuario.
"""

from collections.abc import Mapping, Sequence
from typing import Literal

import anthropic
import botocore.exceptions
import structlog
from anthropic import AsyncAnthropic, AsyncAnthropicBedrockMantle, omit
from anthropic.types.beta import BetaTextBlockParam
from pydantic import BaseModel, Field

from axis.normativa.aplicacion.dto import CitaPropuesta, ConsultaLector
from axis.normativa.dominio.errores import LectorNoDisponible
from axis.normativa.dominio.valores import Fragmento, Pertinencia

log = structlog.get_logger()

INSTRUCCIONES = """\
Asistes al evaluador de una Unidad Ejecutora de Inversiones del Perú que revisa expedientes \
técnicos, procesos de selección y la ejecución de obras públicas. El evaluador necesita saber \
qué dice la normativa de contrataciones públicas sobre un caso concreto, con citas que pueda \
poner en una observación o en una carta.

Recibes el texto completo de la Ley y, en el mensaje, fragmentos del Reglamento u otras normas \
que una búsqueda encontró parecidos al caso. Cada fragmento empieza con su identificador entre \
corchetes, por ejemplo [ley_32069:art-45].

Elige los fragmentos que regulan el caso o que el evaluador debe invocar. Para cada uno:
- id_fragmento: el identificador exacto, sin corchetes. Solo de fragmentos que recibiste.
- extracto: copia literal del fragmento, de una a tres oraciones, la parte que aplica. Puedes \
omitir texto intermedio con (...). No parafrasees: el extracto se compara con el texto oficial \
y si no coincide se descarta.
- razon: una o dos oraciones que conecten el fragmento con este caso concreto, en el lenguaje \
del evaluador.
- pertinencia: "alta" si regula directamente el caso; "media" si lo enmarca o complementa.

Si un artículo tiene una nota "(*) Artículo modificado" y además aparece su texto modificado, \
cita el texto que corresponda y advierte en la razón si su vigencia está condicionada.
Prefiere pocas citas precisas a muchas generales. Si nada de lo recibido aplica, devuelve la \
lista vacía: es mejor no citar que citar mal."""


type Esfuerzo = Literal["low", "medium", "high", "xhigh", "max"]


class CitaLector(BaseModel):
    id_fragmento: str
    extracto: str
    razon: str
    pertinencia: Literal["alta", "media"]


class RespuestaLector(BaseModel):
    citas: list[CitaLector] = Field(default_factory=list)


class LectorNormativaLLM:
    def __init__(
        self,
        cliente: AsyncAnthropic | AsyncAnthropicBedrockMantle,
        *,
        modelo: str,
        esfuerzo: Esfuerzo,
        respaldo_en_servidor: bool = False,
    ) -> None:
        """`respaldo_en_servidor`: si el LLM declina, la API reintenta con otro modelo.

        Solo existe en la API directa del proveedor; en Bedrock lo hace el middleware del cliente.
        """
        self._cliente = cliente
        self._modelo = modelo
        self._esfuerzo = esfuerzo
        self._respaldo = respaldo_en_servidor

    @property
    def nombre(self) -> str:
        return self._modelo

    async def leer(self, consulta: ConsultaLector) -> Sequence[CitaPropuesta]:
        try:
            respuesta = await self._cliente.beta.messages.parse(
                model=self._modelo,
                max_tokens=16000,
                system=self._sistema(consulta),
                messages=[{"role": "user", "content": _mensaje(consulta)}],
                thinking={"type": "adaptive"},
                output_config={"effort": self._esfuerzo},
                output_format=RespuestaLector,
                betas=["server-side-fallback-2026-07-01"] if self._respaldo else omit,
                fallbacks="default" if self._respaldo else omit,
            )
        except (anthropic.AnthropicError, botocore.exceptions.BotoCoreError) as error:
            raise LectorNoDisponible(f"{type(error).__name__}: {error}"[:300]) from error
        uso = respuesta.usage
        log.info(
            "lector_normativa",
            modelo=respuesta.model,
            parada=respuesta.stop_reason,
            entrada=uso.input_tokens,
            cache_leida=uso.cache_read_input_tokens,
            cache_escrita=uso.cache_creation_input_tokens,
            salida=uso.output_tokens,
        )
        if respuesta.stop_reason == "refusal":
            raise LectorNoDisponible("el modelo no quiso responder esta consulta")
        if respuesta.parsed_output is None:
            raise LectorNoDisponible(f"respuesta sin formato (parada: {respuesta.stop_reason})")
        return [
            CitaPropuesta(c.id_fragmento, c.extracto, c.razon, Pertinencia(c.pertinencia))
            for c in respuesta.parsed_output.citas
        ]

    def _sistema(self, consulta: ConsultaLector) -> list[BetaTextBlockParam]:
        leyes = _bloque_de_normas(consulta.leyes, consulta.nombres)
        return [
            {"type": "text", "text": INSTRUCCIONES},
            {
                "type": "text",
                "text": f"<leyes>\n{leyes}\n</leyes>",
                # Lo estable va primero y con caché: el caso, que cambia, va en el mensaje.
                "cache_control": {"type": "ephemeral", "ttl": "1h"},
            },
        ]


def _mensaje(consulta: ConsultaLector) -> str:
    partes = []
    if consulta.candidatos:
        candidatos = _bloque_de_normas(consulta.candidatos, consulta.nombres)
        partes.append(f"<fragmentos_candidatos>\n{candidatos}\n</fragmentos_candidatos>")
    if consulta.contexto:
        partes.append(f"<caso>\n{consulta.contexto.strip()}\n</caso>")
    partes.append(f"<pregunta>\n{consulta.pregunta.strip()}\n</pregunta>")
    partes.append(f"Devuelve como máximo {consulta.maximo_citas} citas.")
    return "\n\n".join(partes)


def _bloque_de_normas(lista: Sequence[Fragmento], nombres: Mapping[str, str]) -> str:
    bloques: list[str] = []
    norma_actual: str | None = None
    for fragmento in lista:
        if fragmento.id_norma != norma_actual:
            norma_actual = fragmento.id_norma
            bloques.append(f"# {nombres.get(norma_actual, norma_actual)}")
        ubicacion = " / ".join(fragmento.ubicacion)
        encabezado = f"[{fragmento.id}] {fragmento.etiqueta}. {fragmento.titulo}".rstrip(". ")
        bloques.append(
            f"{encabezado}\n({ubicacion})\n{fragmento.texto}"
            if ubicacion
            else f"{encabezado}\n{fragmento.texto}"
        )
    return "\n\n".join(bloques)
