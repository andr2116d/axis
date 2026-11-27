"""Correcciones del evaluador como datos de entrenamiento: las únicas etiquetas reales seguras."""

import asyncio
from dataclasses import dataclass

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import create_async_engine

from axis.arranque.config import Config
from axis.documentos.adaptadores.salida.postgres import correcciones, documentos, paginas
from axis.documentos.dominio.entidades import Pagina
from axis.documentos.dominio.valores import OrigenPagina


@dataclass(frozen=True)
class PaginaCorregida:
    hash_contenido: str
    numero: int
    texto: str
    etiqueta: str


@dataclass(frozen=True)
class DocumentoCorregido:
    hash_contenido: str
    etiqueta: str
    fase: str | None
    paginas: tuple[Pagina, ...]
    # Páginas que el evaluador también corrigió: se usan tal cual al armar sus rasgos.
    etiquetas_corregidas: dict[int, str]


@dataclass(frozen=True)
class Correcciones:
    paginas: list[PaginaCorregida]
    documentos: list[DocumentoCorregido]


def cargar() -> Correcciones:
    try:
        return asyncio.run(_cargar(Config().base_datos_url))
    except OSError as error:
        print(f"Sin correcciones: no se pudo conectar a la base de datos ({error})")
        return Correcciones([], [])


async def _cargar(url: str) -> Correcciones:
    motor = create_async_engine(url)
    try:
        async with motor.connect() as conexion:
            filas = (
                (
                    await conexion.execute(
                        sa.select(correcciones).order_by(correcciones.c.corregido_en)
                    )
                )
                .mappings()
                .all()
            )
            # Si corrigió dos veces lo mismo, vale la última.
            por_pagina: dict[tuple[str, int], str] = {}
            por_documento: dict[str, tuple[str, str | None]] = {}
            for f in filas:
                if f["pagina"] is None:
                    por_documento[f["hash_contenido"]] = (f["etiqueta"], f["fase"])
                else:
                    por_pagina[(f["hash_contenido"], f["pagina"])] = f["etiqueta"]
            textos = await _paginas(conexion, {h for h, _ in por_pagina} | set(por_documento))
    finally:
        await motor.dispose()
    paginas_corregidas = [
        PaginaCorregida(h, n, textos[h][n].texto, etiqueta)
        for (h, n), etiqueta in por_pagina.items()
        if h in textos and n in textos[h] and textos[h][n].texto.strip()
    ]
    documentos_corregidos = [
        DocumentoCorregido(
            h,
            etiqueta,
            fase,
            tuple(textos[h].values()),
            {n: e for (hh, n), e in por_pagina.items() if hh == h},
        )
        for h, (etiqueta, fase) in por_documento.items()
        if h in textos
    ]
    return Correcciones(paginas_corregidas, documentos_corregidos)


async def _paginas(conexion: object, hashes: set[str]) -> dict[str, dict[int, Pagina]]:
    if not hashes:
        return {}
    consulta = (
        sa.select(documentos.c.hash_contenido, paginas)
        .join(paginas, paginas.c.documento_id == documentos.c.id)
        .where(documentos.c.hash_contenido.in_(hashes))
        .order_by(paginas.c.numero)
    )
    filas = (await conexion.execute(consulta)).mappings().all()  # type: ignore[attr-defined]
    resultado: dict[str, dict[int, Pagina]] = {}
    for f in filas:
        resultado.setdefault(f["hash_contenido"], {})[f["numero"]] = Pagina(
            f["numero"], OrigenPagina(f["origen"]), f["texto"], f["ancho_pt"], f["alto_pt"]
        )
    return resultado
