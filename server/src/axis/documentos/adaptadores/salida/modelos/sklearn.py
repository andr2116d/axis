"""Inferencia con la versión entrenada: páginas, documentos y rareza."""

import asyncio
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

import numpy as np

from axis.compartido.dominio.valores import Fase
from axis.documentos.adaptadores.salida.modelos.rasgos import (
    normalizar_texto,
    rasgos_documento,
    rasgos_edicion,
)
from axis.documentos.dominio.entidades import Huella, Pagina
from axis.documentos.dominio.valores import Clasificacion, Etiqueta, TipoArchivo, TipoDocumento


@dataclass(frozen=True, slots=True)
class ArtefactoDocumentos:
    """Lo que guarda el entrenamiento: los tres modelos y lo que necesitan para usarse."""

    version: str
    clasificador_paginas: object
    clasificador_documentos: object
    etiquetas_pagina: tuple[str, ...]
    fases_documento: Mapping[str, str | None]
    medidor_rareza: object
    puntajes_corpus: tuple[float, ...]  # ordenados de menor a mayor
    metricas: Mapping[str, object]


class ClasificadorPaginasSklearn:
    def __init__(self, modelo: object) -> None:
        self._modelo = modelo
        self._etiquetas = tuple(Etiqueta(str(c)) for c in modelo.classes_)  # type: ignore[attr-defined]

    @property
    def etiquetas(self) -> tuple[Etiqueta, ...]:
        return self._etiquetas

    async def clasificar(self, textos: Sequence[str]) -> list[Clasificacion]:
        if not textos:
            return []
        return await asyncio.to_thread(self._clasificar, textos)

    def _clasificar(self, textos: Sequence[str]) -> list[Clasificacion]:
        # Todas las páginas en una sola llamada: el modelo vectoriza por lotes mucho más rápido.
        probabilidades = self._modelo.predict_proba([normalizar_texto(t) for t in textos])  # type: ignore[attr-defined]  # scikit-learn sin tipos
        clases = self._modelo.classes_  # type: ignore[attr-defined]
        indices = np.argmax(probabilidades, axis=1)
        return [
            Clasificacion(Etiqueta(str(clases[i])), float(probabilidades[fila, i]))
            for fila, i in enumerate(indices)
        ]


class ClasificadorDocumentosSklearn:
    def __init__(
        self, modelo: object, etiquetas_pagina: Sequence[str], fases: Mapping[str, str | None]
    ) -> None:
        self._modelo = modelo
        self._etiquetas_pagina = tuple(etiquetas_pagina)
        self._fases = fases
        self._etiquetas = tuple(Etiqueta(str(c)) for c in modelo.classes_)  # type: ignore[attr-defined]

    @property
    def etiquetas(self) -> tuple[Etiqueta, ...]:
        return self._etiquetas

    def fase_de(self, etiqueta: Etiqueta) -> Fase | None:
        fase = self._fases.get(etiqueta)
        return Fase(fase) if fase else None

    async def clasificar(self, paginas: Sequence[Pagina]) -> TipoDocumento:
        return await asyncio.to_thread(self._clasificar, paginas)

    def _clasificar(self, paginas: Sequence[Pagina]) -> TipoDocumento:
        rasgos = np.array([rasgos_documento(paginas, self._etiquetas_pagina)])
        probabilidades = self._modelo.predict_proba(rasgos)[0]  # type: ignore[attr-defined]
        indice = int(np.argmax(probabilidades))
        etiqueta = str(self._modelo.classes_[indice])  # type: ignore[attr-defined]
        return TipoDocumento(
            etiqueta=Etiqueta(etiqueta),
            confianza=float(probabilidades[indice]),
            fase=self.fase_de(Etiqueta(etiqueta)),
        )


class MedidorRarezaSklearn:
    def __init__(self, modelo: object, puntajes_corpus: Sequence[float]) -> None:
        self._modelo = modelo
        self._puntajes = np.asarray(puntajes_corpus)

    async def medir(self, huella: Huella, paginas: Sequence[Pagina]) -> float | None:
        # El corpus de comparación son PDF de SEACE: un Excel o una foto no se comparan con eso.
        if self._puntajes.size == 0 or huella.tipo_archivo is not TipoArchivo.PDF:
            return None
        return await asyncio.to_thread(self._medir, huella, paginas)

    def _medir(self, huella: Huella, paginas: Sequence[Pagina]) -> float:
        rasgos = np.array([rasgos_edicion(huella, paginas)])
        puntaje = float(self._modelo.score_samples(rasgos)[0])  # type: ignore[attr-defined]
        # score_samples: más alto = más normal. La rareza es qué parte del corpus es más normal.
        mas_normales = self._puntajes.size - int(np.searchsorted(self._puntajes, puntaje, "right"))
        return round(mas_normales / self._puntajes.size, 4)


class ModelosSklearn:
    def __init__(self, artefacto: ArtefactoDocumentos) -> None:
        self._version = artefacto.version
        self._paginas = ClasificadorPaginasSklearn(artefacto.clasificador_paginas)
        self._documentos = ClasificadorDocumentosSklearn(
            artefacto.clasificador_documentos,
            artefacto.etiquetas_pagina,
            artefacto.fases_documento,
        )
        self._rareza = MedidorRarezaSklearn(artefacto.medidor_rareza, artefacto.puntajes_corpus)

    @property
    def version(self) -> str:
        return self._version

    @property
    def paginas(self) -> ClasificadorPaginasSklearn:
        return self._paginas

    @property
    def documentos(self) -> ClasificadorDocumentosSklearn:
        return self._documentos

    @property
    def rareza(self) -> MedidorRarezaSklearn:
        return self._rareza
