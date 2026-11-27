from dataclasses import dataclass, replace
from datetime import datetime
from enum import StrEnum
from typing import NewType
from uuid import UUID

from axis.compartido.dominio.motores import Hallazgo, ResultadoMotor, Severidad, semaforo_de
from axis.compartido.dominio.valores import Semaforo
from axis.expediente.dominio.errores import DocumentoYaAdjunto

IdExpediente = NewType("IdExpediente", UUID)
IdEvaluacion = NewType("IdEvaluacion", UUID)


@dataclass(frozen=True, slots=True)
class DocumentoAdjunto:
    id_documento: str
    nombre: str
    tipo: str  # qué es el documento según el modelo: expediente_tecnico, metrados…
    partes: tuple[str, ...]  # tipos de parte que trae
    adjuntado_en: datetime


@dataclass(frozen=True, slots=True)
class Seccion:
    """Una parte del expediente (metrados, presupuesto…) y el documento que la trae hoy."""

    etiqueta: str
    id_documento: str
    nombre_documento: str
    version: int  # cuántas veces se subió esta parte
    adjuntada_en: datetime


@dataclass(frozen=True, slots=True)
class Expediente:
    id: IdExpediente
    nombre_obra: str
    cui: str | None
    entidad: str | None
    tipologia: str | None
    documentos: tuple[DocumentoAdjunto, ...]
    creado_en: datetime

    def adjuntar(self, documento: DocumentoAdjunto) -> "Expediente":
        if any(d.id_documento == documento.id_documento for d in self.documentos):
            raise DocumentoYaAdjunto(f"el documento {documento.id_documento} ya está adjunto")
        return replace(self, documentos=(*self.documentos, documento))

    def secciones_vigentes(self) -> tuple[Seccion, ...]:
        """Cada parte la da el documento más reciente que la trae: subir solo metrados nuevos
        reemplaza la sección de metrados y deja las demás como estaban."""
        vigentes: dict[str, Seccion] = {}
        for documento in sorted(self.documentos, key=lambda d: d.adjuntado_en):
            for etiqueta in documento.partes:
                anterior = vigentes.get(etiqueta)
                vigentes[etiqueta] = Seccion(
                    etiqueta=etiqueta,
                    id_documento=documento.id_documento,
                    nombre_documento=documento.nombre,
                    version=(anterior.version + 1) if anterior else 1,
                    adjuntada_en=documento.adjuntado_en,
                )
        return tuple(sorted(vigentes.values(), key=lambda s: s.etiqueta))


class EstadoSeccion(StrEnum):
    SIN_REVISAR = "sin_revisar"  # ningún motor lee esta parte todavía
    VERDE = "verde"
    AMBAR = "ambar"
    ROJO = "rojo"


@dataclass(frozen=True, slots=True)
class OmisionMotor:
    id_motor: str
    nombre: str
    razon: str
    faltan: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class EvaluacionExpediente:
    id: IdEvaluacion
    id_expediente: IdExpediente
    numero: int
    creada_en: datetime
    resultados: tuple[ResultadoMotor, ...]
    omitidos: tuple[OmisionMotor, ...]
    fallas: tuple[tuple[str, str], ...]  # (motor, razón)
    secciones_revisadas: frozenset[str]
    duracion_ms: int

    @property
    def hallazgos(self) -> tuple[Hallazgo, ...]:
        return tuple(h for r in self.resultados for h in r.hallazgos)

    def abiertos(self, cerrados: frozenset[str] = frozenset()) -> tuple[Hallazgo, ...]:
        """Los hallazgos que el evaluador no descartó ni justificó."""
        return tuple(h for h in self.hallazgos if h.clave not in cerrados)

    def semaforo(self, cerrados: frozenset[str] = frozenset()) -> Semaforo:
        return semaforo_de(self.abiertos(cerrados), hay_fallas=bool(self.fallas))

    def de_seccion(self, seccion: Seccion) -> tuple[Hallazgo, ...]:
        """Solo cuentan los hallazgos del documento vigente de esa sección."""
        return tuple(
            h
            for h in self.hallazgos
            if h.seccion == seccion.etiqueta and h.id_documento == seccion.id_documento
        )

    def estado_de(self, seccion: Seccion, cerrados: frozenset[str] = frozenset()) -> EstadoSeccion:
        if seccion.etiqueta not in self.secciones_revisadas:
            return EstadoSeccion.SIN_REVISAR
        propios = {h.severidad for h in self.de_seccion(seccion) if h.clave not in cerrados}
        if Severidad.ROJO in propios:
            return EstadoSeccion.ROJO
        if Severidad.AMBAR in propios:
            return EstadoSeccion.AMBAR
        return EstadoSeccion.VERDE
