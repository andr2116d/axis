from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from enum import StrEnum


class TipoAntecedente(StrEnum):
    INHABILITACION = "inhabilitacion"  # sanción administrativa del Tribunal de Contrataciones
    INHABILITACION_JUDICIAL = "inhabilitacion_judicial"
    MULTA = "multa"
    PENALIDAD = "penalidad"  # aplicada por una entidad en un contrato anterior


@dataclass(frozen=True, slots=True)
class Antecedente:
    """Un registro público del OECE sobre un proveedor. Se cita, no se interpreta."""

    ruc: str
    tipo: TipoAntecedente
    motivo: str
    inicio: date | None
    fin: date | None  # None en una inhabilitación: definitiva o sin fecha de fin registrada
    resolucion: str | None = None
    monto: Decimal | None = None
    entidad: str | None = None  # para penalidades: quién la aplicó
    objeto: str | None = None  # para penalidades: obra, servicio, consultoría…

    def vigente_en(self, dia: date) -> bool:
        if self.inicio is not None and self.inicio > dia:
            return False
        return self.fin is None or self.fin >= dia


@dataclass(frozen=True, slots=True)
class Postor:
    """Quien se presentó al procedimiento. Un consorcio no tiene RUC propio."""

    identificador: str
    nombre: str
    ganador: bool = False

    @property
    def tiene_ruc(self) -> bool:
        return len(self.identificador) == 11 and self.identificador[:2] in {"10", "20"}  # noqa: PLR2004

    @property
    def es_consorcio(self) -> bool:
        return self.nombre.upper().startswith("CONSORCIO")


@dataclass(frozen=True, slots=True)
class Proceso:
    """Un procedimiento de selección de obra, con sus postores."""

    id: str
    nomenclatura: str
    entidad: str
    descripcion: str
    monto_referencial: Decimal | None
    cui: str | None
    convocatoria: date | None
    postores: tuple[Postor, ...]


@dataclass(frozen=True, slots=True)
class FuenteAntecedentes:
    """De dónde salen los antecedentes y hasta qué día están actualizados."""

    nombre: str
    corte: date | None
