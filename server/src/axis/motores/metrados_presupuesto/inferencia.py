"""Compara, partida por partida, la cantidad del presupuesto con la de la planilla de metrados.

Antes de acusar una diferencia se confirma que es la misma partida (mismo ítem, misma unidad y
descripciones parecidas) y que los dos números se leyeron con seguridad. Un número mal leído
por el OCR no se convierte en una alarma roja.
"""

import asyncio
import re
import unicodedata
from collections import defaultdict
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
from axis.motores.metrados_presupuesto.ficha import ficha

# La planilla y el presupuesto redondean distinto: por debajo de esto no es una diferencia.
TOLERANCIA_RELATIVA = Decimal("0.005")
TOLERANCIA_ABSOLUTA = Decimal("0.02")
DIFERENCIA_ROJA = Decimal("0.10")  # 10 % o más de diferencia en la cantidad
# Parecido mínimo entre descripciones (proporción de palabras en común) para darlas por la misma.
PARECIDO_MINIMO = 0.5
# "Sin sustento" solo se dice si la planilla se leyó bien: si hay metrado para al menos esta
# proporción de las partidas del presupuesto. Si no, faltaría por la lectura, no por ellos.
COBERTURA_PARA_SIN_SUSTENTO = 0.7
_PALABRA = re.compile(r"[a-z0-9]{3,}")
_UNIDADES_GLOBALES = frozenset({"glb", "gbl", "est"})


def clave_item(item: str) -> str:
    """01.01.01, 1.1.1 y 01,01,01 son el mismo ítem."""
    partes = re.split(r"[.,]", item.strip().strip("."))
    return ".".join(str(int(p)) for p in partes if p.isdigit())


def _palabras(texto: str) -> frozenset[str]:
    sin_tildes = "".join(
        c for c in unicodedata.normalize("NFKD", texto.lower()) if not unicodedata.combining(c)
    )
    return frozenset(_PALABRA.findall(sin_tildes))


def parecido(a: str, b: str) -> float:
    pa, pb = _palabras(a), _palabras(b)
    return len(pa & pb) / max(1, min(len(pa), len(pb)))


class MotorMetradosPresupuesto:
    def __init__(self) -> None:
        self._ficha = ficha()

    @property
    def ficha(self) -> FichaMotor:
        return self._ficha

    async def evaluar(self, entrada: EntradaMotor) -> Sequence[Hallazgo]:
        return await asyncio.to_thread(
            self._evaluar, entrada.partidas_de("presupuesto"), entrada.partidas_de("metrados")
        )

    def _evaluar(
        self, presupuesto: Sequence[PartidaUbicada], metrados: Sequence[PartidaUbicada]
    ) -> list[Hallazgo]:
        por_item: dict[str, list[PartidaUbicada]] = defaultdict(list)
        for m in metrados:
            if m.partida.unidad and m.partida.numeros:
                por_item[clave_item(m.partida.item)].append(m)
        # Solo filas del presupuesto que cuadran: la cantidad leída es la que dice el documento.
        comparables = [
            p
            for p in presupuesto
            if p.partida.unidad and p.partida.cantidad is not None and p.partida.cuadra
        ]
        hallazgos: list[Hallazgo] = []
        sin_metrado: list[PartidaUbicada] = []
        for p in comparables:
            candidatos = [m for m in por_item.get(clave_item(p.partida.item), []) if _misma(p, m)]
            if not candidatos:
                sin_metrado.append(p)
                continue
            hallazgo = self._comparar(p, candidatos)
            if hallazgo is not None:
                hallazgos.append(hallazgo)
        cobertura = 1 - len(sin_metrado) / max(1, len(comparables))
        if comparables and cobertura >= COBERTURA_PARA_SIN_SUSTENTO:
            hallazgos += [
                self._sin_sustento(p)
                for p in sin_metrado
                if p.partida.unidad not in _UNIDADES_GLOBALES
            ]
        return hallazgos

    def _comparar(self, p: PartidaUbicada, candidatos: list[PartidaUbicada]) -> Hallazgo | None:
        cantidad = p.partida.cantidad or Decimal(0)
        # En la planilla, el metrado de la partida es el último número de su fila.
        if any(_igual(cantidad, m.partida.numeros[-1]) for m in candidatos):
            return None
        m = min(candidatos, key=lambda c: abs(c.partida.numeros[-1] - cantidad))
        metrado = m.partida.numeros[-1]
        if _es_coma_corrida(cantidad, metrado):
            return self._posible_coma(p, m, cantidad, metrado)
        diferencia = abs(cantidad - metrado) / max(abs(metrado), Decimal("0.01"))
        # Roja solo si la diferencia importa y el metrado se leyó con seguridad.
        confirmado = _metrado_confirmado(m)
        roja = diferencia >= DIFERENCIA_ROJA and confirmado
        unidad = p.partida.unidad or ""
        return Hallazgo(
            id_motor=self._ficha.id,
            version_motor=self._ficha.version,
            severidad=Severidad.ROJO if roja else Severidad.AMBAR,
            titulo=(
                f"La cantidad del presupuesto no coincide con el metrado: "
                f"{p.partida.descripcion[:60]}"
            ),
            explicacion=(
                f"La partida {p.partida.item} figura con {_numero(cantidad)} {unidad} en el "
                f"presupuesto (página {p.partida.pagina}), pero la planilla de metrados da "
                f"{_numero(metrado)} {unidad} (página {m.partida.pagina}): una diferencia de "
                f"{diferencia:.1%}. Lo que se paga tiene que salir del metrado."
            ),
            confianza=0.9 if roja else (0.7 if confirmado else 0.5),
            factores=(
                Factor("Cantidad en el presupuesto", f"{_numero(cantidad)} {unidad}"),
                Factor("Metrado en la planilla", f"{_numero(metrado)} {unidad}"),
                Factor("Diferencia", f"{diferencia:.1%}"),
                Factor(
                    "Parecido de la descripción",
                    f"{parecido(p.partida.descripcion, m.partida.descripcion):.0%}",
                ),
            ),
            pagina=p.partida.pagina,
            item=p.partida.item,
            id_documento=p.id_documento,
            seccion="presupuesto",
            metadatos={
                "pagina_metrado": str(m.partida.pagina),
                "documento_metrado": m.id_documento or "",
            },
        )

    def _posible_coma(
        self, p: PartidaUbicada, m: PartidaUbicada, cantidad: Decimal, metrado: Decimal
    ) -> Hallazgo:
        unidad = p.partida.unidad or ""
        relacion = max(cantidad, metrado) / min(cantidad, metrado)
        return Hallazgo(
            id_motor=self._ficha.id,
            version_motor=self._ficha.version,
            severidad=Severidad.AMBAR,
            titulo=f"Posible coma corrida en presupuesto o metrado: {p.partida.descripcion[:55]}",
            explicacion=(
                f"La partida {p.partida.item} figura con {_numero(cantidad)} {unidad} en el "
                f"presupuesto (página {p.partida.pagina}) y {_numero(metrado)} {unidad} en la "
                f"planilla de metrados (página {m.partida.pagina}). La diferencia es exactamente "
                f"una potencia de 10: puede ser una coma corrida en el documento o en la lectura. "
                f"Verifíquelo antes de observar."
            ),
            confianza=0.4,
            factores=(
                Factor("Cantidad en el presupuesto", f"{_numero(cantidad)} {unidad}"),
                Factor("Metrado en la planilla", f"{_numero(metrado)} {unidad}"),
                Factor("Relación", f"×{float(relacion):,.0f}"),
            ),
            pagina=p.partida.pagina,
            item=p.partida.item,
            id_documento=p.id_documento,
            seccion="presupuesto",
            metadatos={"pagina_metrado": str(m.partida.pagina)},
        )

    def _sin_sustento(self, p: PartidaUbicada) -> Hallazgo:
        cantidad = f"{_numero(p.partida.cantidad)} {p.partida.unidad}"
        return Hallazgo(
            id_motor=self._ficha.id,
            version_motor=self._ficha.version,
            severidad=Severidad.AMBAR,
            titulo=f"Partida sin metrado que la sustente: {p.partida.descripcion[:60]}",
            explicacion=(
                f"La partida {p.partida.item} está en el presupuesto con {cantidad}, pero no "
                f"aparece en la planilla de metrados. Toda cantidad del presupuesto debe tener su "
                f"sustento."
            ),
            confianza=0.6,
            factores=(
                Factor("Cantidad en el presupuesto", cantidad),
                Factor("En la planilla de metrados", "no se encontró el ítem"),
            ),
            pagina=p.partida.pagina,
            item=p.partida.item,
            id_documento=p.id_documento,
            seccion="presupuesto",
        )


def _misma(p: PartidaUbicada, m: PartidaUbicada) -> bool:
    return (
        p.partida.unidad == m.partida.unidad
        and parecido(p.partida.descripcion, m.partida.descripcion) >= PARECIDO_MINIMO
    )


def _metrado_confirmado(m: PartidaUbicada) -> bool:
    """La planilla repite el valor en la fila (parcial y total): se leyó dos veces igual."""
    numeros = m.partida.numeros
    return len(numeros) >= 2 and _igual(numeros[-1], numeros[-2])  # noqa: PLR2004


def _es_coma_corrida(a: Decimal, b: Decimal) -> bool:
    if a <= 0 or b <= 0:
        return False
    razon = max(a, b) / min(a, b)
    return any(_igual(razon, Decimal(10) ** k) for k in (1, 2, 3))


def _igual(a: Decimal, b: Decimal) -> bool:
    return abs(a - b) <= max(TOLERANCIA_ABSOLUTA, abs(b) * TOLERANCIA_RELATIVA)


def _numero(valor: Decimal | None) -> str:
    return f"{float(valor or 0):,.2f}"
