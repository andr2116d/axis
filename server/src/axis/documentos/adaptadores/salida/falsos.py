"""Adaptadores en memoria para pruebas: se comportan como los reales, sin red ni disco."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime

from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.dto import TextoReconocido
from axis.documentos.dominio.entidades import Documento, Huella, Pagina
from axis.documentos.dominio.valores import (
    Clasificacion,
    Etiqueta,
    IdDocumento,
    TipoArchivo,
    TipoDocumento,
)


class RepositorioDocumentosEnMemoria:
    def __init__(self) -> None:
        self._por_id: dict[IdDocumento, Documento] = {}

    async def buscar_por_hash(self, hash_contenido: str) -> Documento | None:
        return next((d for d in self._por_id.values() if d.hash_contenido == hash_contenido), None)

    async def obtener(self, id_documento: IdDocumento) -> Documento | None:
        return self._por_id.get(id_documento)

    async def guardar(self, documento: Documento) -> None:
        anterior = await self.buscar_por_hash(documento.hash_contenido)
        if anterior is not None:
            del self._por_id[anterior.id]
        self._por_id[documento.id] = documento


class AlmacenEnMemoria:
    def __init__(self) -> None:
        self.archivos: dict[str, bytes] = {}

    async def guardar(self, clave: str, contenido: bytes, tipo_archivo: TipoArchivo) -> None:
        self.archivos[clave] = contenido


class OcrFalso:
    def __init__(self, texto: str = "texto reconocido") -> None:
        self._texto = texto
        self.paginas_pedidas: list[int] = []

    async def reconocer(
        self, contenido: bytes, tipo_archivo: TipoArchivo, paginas: Sequence[int]
    ) -> Mapping[int, TextoReconocido]:
        self.paginas_pedidas.extend(paginas)
        return {n: TextoReconocido(f"{self._texto} {n}", 0.9) for n in paginas}


class ClasificadorPaginasPorPalabra:
    """Clasifica por la primera palabra del texto: suficiente para probar el flujo."""

    async def clasificar(self, textos: Sequence[str]) -> list[Clasificacion]:
        return [Clasificacion(Etiqueta(t.split()[0].lower()), 0.9) for t in textos]


@dataclass
class ClasificadorDocumentosFijo:
    etiqueta: str = "expediente_tecnico"
    fase: Fase | None = Fase.EXPEDIENTE
    confianza: float = 0.8

    async def clasificar(self, paginas: Sequence[Pagina]) -> TipoDocumento:
        return TipoDocumento(Etiqueta(self.etiqueta), self.confianza, self.fase)


@dataclass
class MedidorRarezaFijo:
    rareza: float | None = 0.5

    async def medir(self, huella: Huella, paginas: Sequence[Pagina]) -> float | None:
        return self.rareza


@dataclass
class ModelosFalsos:
    version: str = "prueba-1"
    paginas: ClasificadorPaginasPorPalabra = field(default_factory=ClasificadorPaginasPorPalabra)
    documentos: ClasificadorDocumentosFijo = field(default_factory=ClasificadorDocumentosFijo)
    rareza: MedidorRarezaFijo = field(default_factory=MedidorRarezaFijo)


class ProveedorModelosFijo:
    def __init__(self, modelos: ModelosFalsos | None) -> None:
        self._modelos = modelos

    def actual(self) -> ModelosFalsos | None:
        return self._modelos


@dataclass
class RelojFijo:
    momento: datetime = field(default_factory=lambda: datetime(2026, 11, 27, 12, tzinfo=UTC))

    def ahora(self) -> datetime:
        return self.momento
