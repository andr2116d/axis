from types import SimpleNamespace

import anthropic
import httpx
import pytest

from axis.normativa.adaptadores.salida.bedrock import (
    CitaLector,
    LectorNormativaBedrock,
    RespuestaLector,
)
from axis.normativa.aplicacion.dto import ConsultaLector
from axis.normativa.dominio.errores import LectorNoDisponible
from axis.normativa.dominio.valores import Fragmento, Pertinencia

LEY = Fragmento("ley_x", "art-1", "Artículo 1", "Objeto", "Texto de la ley.", ("TÍTULO I",), 0)
REGLAMENTO = Fragmento("reg_x", "art-9", "Artículo 9", "Metrados", "Texto del reglamento.", (), 0)
CONSULTA = ConsultaLector(
    "¿Qué aplica?",
    "Un caso.",
    (LEY,),
    {"ley_x": "Ley X", "reg_x": "Reglamento X"},
    (REGLAMENTO,),
    3,
)


class ClienteFalso:
    def __init__(self, resultado):
        self._resultado = resultado
        self.pedidos = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(parse=self._parse))

    async def _parse(self, **pedido):
        self.pedidos.append(pedido)
        if isinstance(self._resultado, Exception):
            raise self._resultado
        return self._resultado


def respuesta(parada="end_turn", citas=None):
    uso = SimpleNamespace(
        input_tokens=10,
        cache_read_input_tokens=5000,
        cache_creation_input_tokens=0,
        output_tokens=50,
    )
    salida = None if citas is None else RespuestaLector(citas=citas)
    return SimpleNamespace(model="m", stop_reason=parada, usage=uso, parsed_output=salida)


def lector(cliente):
    return LectorNormativaBedrock(cliente, modelo="anthropic.claude-opus-5-5", esfuerzo="medium")


async def test_la_ley_va_en_el_sistema_con_cache_y_el_caso_en_el_mensaje():
    cliente = ClienteFalso(respuesta(citas=[]))

    await lector(cliente).leer(CONSULTA)

    pedido = cliente.pedidos[0]
    instrucciones, leyes = pedido["system"]
    assert "cache_control" not in instrucciones
    assert leyes["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    assert "[ley_x:art-1] Artículo 1. Objeto\n(TÍTULO I)\nTexto de la ley." in leyes["text"]
    mensaje = pedido["messages"][0]["content"]
    assert "[reg_x:art-9]" in mensaje and "Un caso." in mensaje
    assert "[ley_x:art-1]" not in mensaje
    assert pedido["model"] == "anthropic.claude-opus-5-5"


async def test_devuelve_las_citas_propuestas():
    cliente = ClienteFalso(
        respuesta(
            citas=[
                CitaLector(
                    id_fragmento="reg_x:art-9",
                    extracto="Texto del reglamento",
                    razon="Aplica.",
                    pertinencia="alta",
                )
            ]
        )
    )

    propuestas = await lector(cliente).leer(CONSULTA)

    assert [(p.id_fragmento, p.pertinencia) for p in propuestas] == [
        ("reg_x:art-9", Pertinencia.ALTA)
    ]


@pytest.mark.parametrize(
    "resultado",
    [
        respuesta(parada="refusal", citas=[]),
        respuesta(parada="max_tokens", citas=None),
        anthropic.APIConnectionError(request=httpx.Request("POST", "https://bedrock")),
    ],
)
async def test_si_no_hay_respuesta_util_avisa_que_el_lector_no_esta(resultado):
    with pytest.raises(LectorNoDisponible):
        await lector(ClienteFalso(resultado)).leer(CONSULTA)
