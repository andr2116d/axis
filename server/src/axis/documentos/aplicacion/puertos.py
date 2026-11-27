from collections.abc import Awaitable, Callable, Mapping, Sequence
from typing import Protocol

from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.dto import LecturaArchivo, TextoReconocido
from axis.documentos.dominio.entidades import Correccion, Documento, Huella, Pagina
from axis.documentos.dominio.valores import (
    Clasificacion,
    Etiqueta,
    IdDocumento,
    TipoArchivo,
    TipoDocumento,
)


class AlmacenArchivos(Protocol):
    """Guarda el archivo original tal como llegó."""

    async def guardar(self, clave: str, contenido: bytes, tipo_archivo: TipoArchivo) -> None: ...


class RepositorioDocumentos(Protocol):
    async def buscar_por_hash(self, hash_contenido: str) -> Documento | None: ...
    async def obtener(self, id_documento: IdDocumento) -> Documento | None: ...
    async def guardar(self, documento: Documento) -> None: ...


class RepositorioCorrecciones(Protocol):
    async def guardar(self, correccion: Correccion) -> None: ...
    async def listar(self, hash_contenido: str) -> list[Correccion]:
        """Las correcciones de un archivo, de la más antigua a la más reciente."""
        ...


class LectorArchivos(Protocol):
    """Reconoce el tipo real del archivo y saca su huella y el texto que ya trae."""

    def detectar_tipo(self, contenido: bytes) -> TipoArchivo: ...
    async def leer(self, contenido: bytes, tipo_archivo: TipoArchivo) -> LecturaArchivo: ...


class MotorOcr(Protocol):
    """Lee el texto de las páginas que son imagen."""

    async def reconocer(
        self,
        contenido: bytes,
        tipo_archivo: TipoArchivo,
        paginas: Sequence[int],
        al_leer: Callable[[int], Awaitable[None]] | None = None,
    ) -> Mapping[int, TextoReconocido]:
        """`al_leer` recibe el número de cada página apenas termina: sirve para avisar avance."""
        ...


class ClasificadorPaginas(Protocol):
    """Dice qué tipo de parte es cada página (memoria, metrados, valorización…)."""

    @property
    def etiquetas(self) -> tuple[Etiqueta, ...]: ...
    async def clasificar(self, textos: Sequence[str]) -> list[Clasificacion]: ...


class ClasificadorDocumentos(Protocol):
    """Dice qué es el archivo completo a partir de sus páginas ya clasificadas."""

    @property
    def etiquetas(self) -> tuple[Etiqueta, ...]: ...
    def fase_de(self, etiqueta: Etiqueta) -> Fase | None: ...
    async def clasificar(self, paginas: Sequence[Pagina]) -> TipoDocumento: ...


class MedidorRareza(Protocol):
    """Compara la huella del archivo con el corpus real y dice qué tan inusual es."""

    async def medir(self, huella: Huella, paginas: Sequence[Pagina]) -> float | None: ...


class ModelosDocumentos(Protocol):
    """La versión de modelos cargada. Se reemplaza entera cuando se promueve una nueva."""

    @property
    def version(self) -> str: ...
    @property
    def paginas(self) -> ClasificadorPaginas: ...
    @property
    def documentos(self) -> ClasificadorDocumentos: ...
    @property
    def rareza(self) -> MedidorRareza: ...


class ProveedorModelos(Protocol):
    def actual(self) -> ModelosDocumentos | None: ...
