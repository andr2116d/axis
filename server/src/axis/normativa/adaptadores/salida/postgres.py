import hashlib
import re
from collections.abc import Sequence
from typing import cast

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.ext.asyncio import AsyncEngine

from axis.normativa.aplicacion.dto import ResumenNorma
from axis.normativa.dominio.servicios import normalizar_para_busqueda
from axis.normativa.dominio.valores import (
    Cita,
    Fragmento,
    Norma,
    OrigenCita,
    Pertinencia,
    RespuestaNormativa,
    TipoNorma,
)

metadatos = sa.MetaData()

normas = sa.Table(
    "normas",
    metadatos,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("nombre", sa.Text, nullable=False),
    sa.Column("tipo", sa.Text, nullable=False),
    sa.Column("vigente_al", sa.Text, nullable=False),
    sa.Column("huella", sa.Text, nullable=False),
)
fragmentos = sa.Table(
    "fragmentos_norma",
    metadatos,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("norma_id", sa.Text, nullable=False),
    sa.Column("clave", sa.Text, nullable=False),
    sa.Column("etiqueta", sa.Text, nullable=False),
    sa.Column("titulo", sa.Text, nullable=False),
    sa.Column("texto", sa.Text, nullable=False),
    sa.Column("ubicacion", JSONB, nullable=False),
    sa.Column("orden", sa.Integer, nullable=False),
    sa.Column("texto_busqueda", sa.Text, nullable=False),
    sa.Column("busqueda", TSVECTOR, sa.Computed("to_tsvector('spanish', texto_busqueda)")),
)
respuestas = sa.Table(
    "respuestas_normativa",
    metadatos,
    sa.Column("clave", sa.Text, primary_key=True),
    sa.Column("respuesta", JSONB, nullable=False),
    sa.Column("creada_en", sa.DateTime(timezone=True), server_default=sa.func.now()),
)

type Json = dict[str, object]
_PALABRA = re.compile(r"[a-z0-9]{4,}")
_PALABRAS_MAXIMAS = 60


class RepositorioNormativaPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def reemplazar(self, norma: Norma, lista: Sequence[Fragmento]) -> None:
        huella = hashlib.sha256(
            "".join(f"{f.id}{f.titulo}{f.texto}" for f in lista).encode()
        ).hexdigest()[:16]
        async with self._motor.begin() as conexion:
            await conexion.execute(sa.delete(fragmentos).where(fragmentos.c.norma_id == norma.id))
            await conexion.execute(sa.delete(normas).where(normas.c.id == norma.id))
            await conexion.execute(
                sa.insert(normas).values(
                    id=norma.id,
                    nombre=norma.nombre,
                    tipo=norma.tipo.value,
                    vigente_al=norma.vigente_al,
                    huella=huella,
                )
            )
            if lista:
                await conexion.execute(sa.insert(fragmentos), [_fila(f) for f in lista])

    async def normas(self) -> tuple[ResumenNorma, ...]:
        consulta = (
            sa.select(normas, sa.func.count(fragmentos.c.id).label("cantidad"))
            .join(fragmentos, fragmentos.c.norma_id == normas.c.id, isouter=True)
            .group_by(normas.c.id)
            .order_by(normas.c.id)
        )
        async with self._motor.connect() as conexion:
            filas = (await conexion.execute(consulta)).mappings().all()
        return tuple(
            ResumenNorma(
                Norma(
                    str(f["id"]), str(f["nombre"]), TipoNorma(str(f["tipo"])), str(f["vigente_al"])
                ),
                int(cast(int, f["cantidad"])),
            )
            for f in filas
        )

    async def fragmentos_de_tipo(self, tipo: TipoNorma) -> tuple[Fragmento, ...]:
        consulta = (
            sa.select(fragmentos)
            .join(normas, normas.c.id == fragmentos.c.norma_id)
            .where(normas.c.tipo == tipo.value)
            .order_by(fragmentos.c.norma_id, fragmentos.c.orden)
        )
        return await self._fragmentos(consulta)

    async def obtener(self, id_fragmento: str) -> Fragmento | None:
        lista = await self._fragmentos(sa.select(fragmentos).where(fragmentos.c.id == id_fragmento))
        return lista[0] if lista else None

    async def obtener_varios(self, ids: Sequence[str]) -> dict[str, Fragmento]:
        lista = await self._fragmentos(sa.select(fragmentos).where(fragmentos.c.id.in_(ids)))
        return {f.id: f for f in lista}

    async def buscar(
        self, consulta: str, *, excluir: frozenset[TipoNorma], limite: int
    ) -> tuple[Fragmento, ...]:
        palabras = list(dict.fromkeys(_PALABRA.findall(normalizar_para_busqueda(consulta))))
        if not palabras:
            return ()
        # Cualquier palabra suma (OR); el rango premia las que coinciden más y en el título.
        pregunta = sa.func.to_tsquery("spanish", " | ".join(palabras[:_PALABRAS_MAXIMAS]))
        rango = sa.func.ts_rank(fragmentos.c.busqueda, pregunta, 1)
        sentencia = (
            sa.select(fragmentos)
            .join(normas, normas.c.id == fragmentos.c.norma_id)
            .where(fragmentos.c.busqueda.op("@@")(pregunta))
            .order_by(rango.desc())
            .limit(limite)
        )
        if excluir:
            sentencia = sentencia.where(normas.c.tipo.not_in([t.value for t in excluir]))
        return await self._fragmentos(sentencia)

    async def version(self) -> str:
        async with self._motor.connect() as conexion:
            huellas = (
                await conexion.execute(sa.select(normas.c.huella).order_by(normas.c.id))
            ).scalars()
            return hashlib.sha256("".join(huellas).encode()).hexdigest()[:16]

    async def _fragmentos(self, sentencia: sa.Select[tuple[object, ...]]) -> tuple[Fragmento, ...]:
        async with self._motor.connect() as conexion:
            filas = (await conexion.execute(sentencia)).mappings().all()
        return tuple(
            Fragmento(
                id_norma=str(f["norma_id"]),
                clave=str(f["clave"]),
                etiqueta=str(f["etiqueta"]),
                titulo=str(f["titulo"]),
                texto=str(f["texto"]),
                ubicacion=tuple(str(u) for u in cast(list[object], f["ubicacion"])),
                orden=int(cast(int, f["orden"])),
            )
            for f in filas
        )


def _fila(f: Fragmento) -> Json:
    # El título pesa doble: "Mayores metrados" dice más que una mención al pasar en el cuerpo.
    busqueda = normalizar_para_busqueda(f"{f.titulo} {f.titulo} {f.etiqueta} {f.texto}")
    return {
        "id": f.id,
        "norma_id": f.id_norma,
        "clave": f.clave,
        "etiqueta": f.etiqueta,
        "titulo": f.titulo,
        "texto": f.texto,
        "ubicacion": list(f.ubicacion),
        "orden": f.orden,
        "texto_busqueda": busqueda,
    }


class CacheRespuestasPostgres:
    """Una consulta ya respondida por el lector no se vuelve a pagar ni a esperar."""

    def __init__(self, motor: AsyncEngine, repositorio: RepositorioNormativaPostgres) -> None:
        self._motor = motor
        self._repositorio = repositorio

    async def obtener(self, clave: str) -> RespuestaNormativa | None:
        async with self._motor.connect() as conexion:
            datos = await conexion.scalar(
                sa.select(respuestas.c.respuesta).where(respuestas.c.clave == clave)
            )
        if datos is None:
            return None
        guardada = cast(Json, datos)
        citas = cast(list[Json], guardada["citas"])
        encontrados = await self._repositorio.obtener_varios([str(c["fragmento"]) for c in citas])
        if len(encontrados) != len({str(c["fragmento"]) for c in citas}):
            return None  # la norma se reindexó: la respuesta ya no vale
        return RespuestaNormativa(
            citas=tuple(_cita_de_json(c, encontrados) for c in citas),
            origen=OrigenCita(str(guardada["origen"])),
            lector=cast(str | None, guardada.get("lector")),
            descartadas=int(cast(int, guardada["descartadas"])),
            duracion_ms=int(cast(int, guardada["duracion_ms"])),
        )

    async def guardar(self, clave: str, respuesta: RespuestaNormativa) -> None:
        datos: Json = {
            "origen": respuesta.origen.value,
            "lector": respuesta.lector,
            "descartadas": respuesta.descartadas,
            "duracion_ms": respuesta.duracion_ms,
            "citas": [
                {
                    "fragmento": c.fragmento.id,
                    "norma": c.nombre_norma,
                    "extracto": c.extracto,
                    "razon": c.razon,
                    "pertinencia": c.pertinencia.value,
                    "origen": c.origen.value,
                }
                for c in respuesta.citas
            ],
        }
        sentencia = sa.dialects.postgresql.insert(respuestas).values(clave=clave, respuesta=datos)
        async with self._motor.begin() as conexion:
            await conexion.execute(
                sentencia.on_conflict_do_update(
                    index_elements=[respuestas.c.clave], set_={"respuesta": datos}
                )
            )


def _cita_de_json(datos: Json, fragmentos_por_id: dict[str, Fragmento]) -> Cita:
    return Cita(
        fragmento=fragmentos_por_id[str(datos["fragmento"])],
        nombre_norma=str(datos["norma"]),
        extracto=str(datos["extracto"]),
        razon=str(datos["razon"]),
        pertinencia=Pertinencia(str(datos["pertinencia"])),
        origen=OrigenCita(str(datos["origen"])),
    )
