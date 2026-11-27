"""Qué le dice al comité el historial público de cada postor.

Son hechos registrados por el OECE, no juicios: cada hallazgo cita la resolución, el motivo y la
vigencia, y dice hasta qué fecha está actualizado el registro. La buena pro sigue las reglas de la
ley; Axis solo señala dónde conviene mirar más a fondo.
"""

import re
import unicodedata
from collections.abc import Sequence
from datetime import date
from decimal import Decimal

from axis.compartido.dominio.motores import Factor, Hallazgo, Severidad
from axis.seleccion.dominio.valores import (
    Antecedente,
    FuenteAntecedentes,
    Postor,
    Proceso,
    TipoAntecedente,
)

ID_MOTOR = "antecedentes_oece"
SECCION = "postores"
_INEXACTA = re.compile(r"inexact|fals|adulter")
_INHABILITACIONES = frozenset(
    {TipoAntecedente.INHABILITACION, TipoAntecedente.INHABILITACION_JUDICIAL}
)
_MAXIMO_FACTORES = 4


def es_por_informacion_inexacta(antecedente: Antecedente) -> bool:
    """Sanción por presentar información inexacta o documentos falsos: lo que paralizó Huanchaco."""
    texto = unicodedata.normalize("NFKD", antecedente.motivo.lower())
    return bool(_INEXACTA.search("".join(c for c in texto if not unicodedata.combining(c))))


def revisar_postor(
    proceso: Proceso,
    postor: Postor,
    antecedentes: Sequence[Antecedente],
    fuente: FuenteAntecedentes,
    dia: date,
) -> tuple[Hallazgo, ...]:
    """Los hallazgos de un postor a la fecha de la convocatoria (o la indicada)."""
    inhabilitaciones = [a for a in antecedentes if a.tipo in _INHABILITACIONES]
    vigentes = [a for a in inhabilitaciones if a.vigente_en(dia)]
    pasadas = [
        a
        for a in inhabilitaciones
        if not a.vigente_en(dia) and (a.inicio is None or a.inicio <= dia)
    ]
    inexactas = [a for a in pasadas if es_por_informacion_inexacta(a)]
    otras = [a for a in pasadas if not es_por_informacion_inexacta(a)]
    previas = [a for a in antecedentes if a.inicio is None or a.inicio <= dia]
    penalidades = [a for a in previas if a.tipo is TipoAntecedente.PENALIDAD]
    multas = [a for a in previas if a.tipo is TipoAntecedente.MULTA]
    base = _Base(proceso, postor, fuente, dia)
    hallazgos = [
        base.inhabilitado(vigentes) if vigentes else None,
        base.inexacta(inexactas) if inexactas else None,
        base.otras_sanciones(otras) if otras else None,
        base.penalidades(penalidades) if penalidades else None,
        base.multas(multas) if multas else None,
    ]
    return tuple(h for h in hallazgos if h is not None)


class _Base:
    def __init__(
        self, proceso: Proceso, postor: Postor, fuente: FuenteAntecedentes, dia: date
    ) -> None:
        self._proceso = proceso
        self._postor = postor
        self._fuente = fuente
        self._dia = dia

    def inhabilitado(self, vigentes: Sequence[Antecedente]) -> Hallazgo:
        return self._hallazgo(
            "inhabilitacion_vigente",
            Severidad.ROJO,
            titulo=f"{self._postor.nombre} figura inhabilitado para contratar con el Estado",
            explicacion=(
                f"A la fecha {_fecha(self._dia)}, el registro del OECE tiene {len(vigentes)} "
                "inhabilitación(es) vigente(s) para este postor. Verifique su situación antes "
                "del otorgamiento o el consentimiento de la buena pro."
            ),
            confianza=0.95,
            factores=[_factor_sancion(a) for a in vigentes],
        )

    def inexacta(self, antecedentes: Sequence[Antecedente]) -> Hallazgo:
        return self._hallazgo(
            "antecedente_informacion_inexacta",
            Severidad.AMBAR,
            titulo=(
                f"{self._postor.nombre} fue sancionado antes por información inexacta "
                "o documentos falsos"
            ),
            explicacion=(
                f"El OECE registra {len(antecedentes)} sanción(es) ya cumplida(s) por presentar "
                "información inexacta o documentos falsos. No le impide contratar hoy, pero "
                "conviene verificar a fondo los documentos de su oferta y de su personal clave."
            ),
            confianza=0.8,
            factores=[_factor_sancion(a) for a in antecedentes],
        )

    def otras_sanciones(self, antecedentes: Sequence[Antecedente]) -> Hallazgo:
        return self._hallazgo(
            "antecedente_sancion",
            Severidad.AMBAR,
            titulo=f"{self._postor.nombre} tiene sanciones anteriores del Tribunal",
            explicacion=(
                f"El OECE registra {len(antecedentes)} inhabilitación(es) ya cumplida(s), por "
                "ejemplo por contratos resueltos. Revise su experiencia y su capacidad de "
                "ejecución."
            ),
            confianza=0.7,
            factores=[_factor_sancion(a) for a in antecedentes],
        )

    def penalidades(self, antecedentes: Sequence[Antecedente]) -> Hallazgo:
        total = sum((a.monto or Decimal(0) for a in antecedentes), Decimal(0))
        entidades = sorted({a.entidad for a in antecedentes if a.entidad})
        factores = [
            Factor("Penalidades registradas", str(len(antecedentes))),
            Factor("Monto total", f"S/ {total:,.2f}"),
            *(Factor("Aplicada por", e) for e in entidades[:2]),
        ]
        return self._hallazgo(
            "penalidades_previas",
            Severidad.AMBAR,
            titulo=f"{self._postor.nombre} recibió penalidades en contratos anteriores",
            explicacion=(
                f"El OECE registra {len(antecedentes)} penalidad(es) aplicada(s) por entidades "
                f"públicas por S/ {total:,.2f} en total. Es una señal de riesgo de cumplimiento, "
                "no un impedimento."
            ),
            confianza=0.6,
            factores=factores,
        )

    def multas(self, antecedentes: Sequence[Antecedente]) -> Hallazgo:
        total = sum((a.monto or Decimal(0) for a in antecedentes), Decimal(0))
        return self._hallazgo(
            "multas_previas",
            Severidad.AMBAR,
            titulo=f"{self._postor.nombre} fue multado por el Tribunal",
            explicacion=(
                f"El OECE registra {len(antecedentes)} multa(s) por S/ {total:,.2f} en total."
            ),
            confianza=0.6,
            factores=[_factor_sancion(a) for a in antecedentes],
        )

    def _hallazgo(  # noqa: PLR0913 - con nombre: no se confunden al llamarla
        self,
        regla: str,
        severidad: Severidad,
        *,
        titulo: str,
        explicacion: str,
        confianza: float,
        factores: Sequence[Factor],
    ) -> Hallazgo:
        corte = self._fuente.corte
        fuente = f"{self._fuente.nombre}, corte {_fecha(corte)}" if corte else self._fuente.nombre
        return Hallazgo(
            id_motor=ID_MOTOR,
            version_motor=f"corte-{corte.isoformat() if corte else 'sin-fecha'}",
            severidad=severidad,
            titulo=titulo,
            explicacion=explicacion,
            confianza=confianza,
            factores=(*list(factores)[:_MAXIMO_FACTORES], Factor("Fuente", fuente)),
            item=f"{self._postor.identificador}·{regla}",
            id_documento=self._proceso.id,
            seccion=SECCION,
            metadatos={"postor": self._postor.identificador, "regla": regla},
        )


def _factor_sancion(a: Antecedente) -> Factor:
    vigencia = f"{_fecha(a.inicio)} a {_fecha(a.fin) if a.fin else 'sin fecha de fin'}"
    resolucion = f"Resolución {a.resolucion}: " if a.resolucion else ""
    return Factor(f"{resolucion}{vigencia}", a.motivo[:160])


def _fecha(dia: date | None) -> str:
    return dia.strftime("%d/%m/%Y") if dia else "sin fecha"
