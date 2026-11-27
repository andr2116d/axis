import asyncio
from collections.abc import Sequence
from decimal import Decimal

from axis.compartido.dominio.motores import (
    EntradaMotor,
    Factor,
    FichaMotor,
    Hallazgo,
    PartidaUbicada,
    Severidad,
)
from axis.motores.precio_atipico.ficha import ficha
from axis.motores.precio_atipico.modelo import Comparacion, ModeloPrecios, Umbrales


class MotorPrecioAtipico:
    def __init__(self, modelo: ModeloPrecios, version: str) -> None:
        self._modelo = modelo
        self._ficha = ficha(version)

    @property
    def ficha(self) -> FichaMotor:
        return self._ficha

    async def evaluar(self, entrada: EntradaMotor) -> Sequence[Hallazgo]:
        return await asyncio.to_thread(self._evaluar, entrada.partidas_de("presupuesto"))

    def _evaluar(self, ubicadas: Sequence[PartidaUbicada]) -> list[Hallazgo]:
        hallazgos = []
        for ubicada in ubicadas:
            partida = ubicada.partida
            # Solo filas que cuadran: si cantidad × precio no da el parcial, el precio leído
            # puede estar mal y no se acusa a nadie por un error de lectura.
            if not partida.cuadra or partida.unidad is None or partida.precio_unitario is None:
                continue
            precio = float(partida.precio_unitario)
            comparacion = self._modelo.comparar(partida.descripcion, partida.unidad, precio)
            if comparacion is None:
                continue
            severidad = severidad_de(comparacion, self._modelo.umbrales)
            if severidad is not None:
                hallazgos.append(self._hallazgo(ubicada, comparacion, severidad))
        return hallazgos

    def _hallazgo(self, ubicada: PartidaUbicada, c: Comparacion, severidad: Severidad) -> Hallazgo:
        partida = ubicada.partida
        g = c.grupo
        direccion = "más caro" if c.veces > 1 else "más barato"
        veces = c.veces if c.veces > 1 else 1 / c.veces
        unidad = partida.unidad or ""
        return Hallazgo(
            id_motor=self._ficha.id,
            version_motor=self._ficha.version,
            severidad=severidad,
            titulo=f"Precio {veces:.1f} veces {direccion} que lo usual: {partida.descripcion[:70]}",
            explicacion=(
                f"La partida {partida.item} cuesta {_soles(partida.precio_unitario)} por {unidad}. "
                f"En {g.obras} obras reales con partidas parecidas («{g.ejemplo[:60]}»), la "
                f"mediana es {_soles(g.mediana)} y lo usual va de {_soles(g.p10)} a "
                f"{_soles(g.p90)}. Si hay una razón (zona alejada, especificación distinta), "
                f"conviene justificarla."
            ),
            confianza=_confianza(c),
            factores=(
                Factor("Precio unitario", f"{_soles(partida.precio_unitario)} / {unidad}"),
                Factor("Mediana de partidas parecidas", f"{_soles(g.mediana)} / {unidad}"),
                Factor("Rango usual (p10–p90)", f"{_soles(g.p10)} – {_soles(g.p90)}"),
                Factor("Comparado con", f"{g.precios} precios de {g.obras} obras"),
                Factor("Parecido de la descripción", f"{c.similitud:.0%}"),
            ),
            pagina=partida.pagina,
            item=partida.item,
            id_documento=ubicada.id_documento,
            seccion=ubicada.tipo_pagina,
            metadatos={"veces": f"{c.veces:.3f}", "desvios": f"{c.desvios:.2f}"},
        )


def severidad_de(c: Comparacion, umbrales: Umbrales) -> Severidad | None:
    if max(c.veces, 1 / c.veces) < umbrales.veces_minimas:
        return None
    if abs(c.desvios) >= umbrales.desvios_rojo:
        return Severidad.ROJO
    if abs(c.desvios) >= umbrales.desvios_ambar:
        return Severidad.AMBAR
    return None


def _confianza(c: Comparacion) -> float:
    # Más obras y descripciones más parecidas dan más confianza; nunca 1: es una comparación.
    por_obras = min(1.0, c.grupo.obras / 10)
    return round(min(0.95, 0.5 * c.similitud + 0.45 * por_obras), 2)


def _soles(valor: float | Decimal | None) -> str:
    return f"S/ {float(valor or 0):,.2f}"
