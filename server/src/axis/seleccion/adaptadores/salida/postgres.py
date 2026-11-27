from collections import defaultdict
from collections.abc import Mapping, Sequence
from datetime import date
from decimal import Decimal
from typing import cast

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncEngine

from axis.seleccion.dominio.valores import (
    Antecedente,
    FuenteAntecedentes,
    Postor,
    Proceso,
    TipoAntecedente,
)

metadatos = sa.MetaData()
procesos = sa.Table(
    "procesos_seleccion",
    metadatos,
    sa.Column("id", sa.Text, primary_key=True),
    sa.Column("nomenclatura", sa.Text, nullable=False),
    sa.Column("entidad", sa.Text, nullable=False),
    sa.Column("descripcion", sa.Text, nullable=False),
    sa.Column("monto_referencial", sa.Numeric),
    sa.Column("cui", sa.Text),
    sa.Column("convocatoria", sa.Date),
    sa.Column("postores", JSONB, nullable=False),
)
antecedentes = sa.Table(
    "antecedentes_proveedor",
    metadatos,
    sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
    sa.Column("ruc", sa.Text, nullable=False),
    sa.Column("tipo", sa.Text, nullable=False),
    sa.Column("motivo", sa.Text, nullable=False),
    sa.Column("inicio", sa.Date),
    sa.Column("fin", sa.Date),
    sa.Column("resolucion", sa.Text),
    sa.Column("monto", sa.Numeric),
    sa.Column("entidad", sa.Text),
    sa.Column("objeto", sa.Text),
)
fuentes = sa.Table(
    "fuentes_antecedentes",
    metadatos,
    sa.Column("nombre", sa.Text, primary_key=True),
    sa.Column("corte", sa.Date),
)

type Json = dict[str, object]
_LOTE = 5000


class RepositorioProcesosPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def obtener(self, id_proceso: str) -> Proceso | None:
        async with self._motor.connect() as conexion:
            fila = (
                (await conexion.execute(sa.select(procesos).where(procesos.c.id == id_proceso)))
                .mappings()
                .first()
            )
        if fila is None:
            return None
        return Proceso(
            id=str(fila["id"]),
            nomenclatura=str(fila["nomenclatura"]),
            entidad=str(fila["entidad"]),
            descripcion=str(fila["descripcion"]),
            monto_referencial=cast(Decimal | None, fila["monto_referencial"]),
            cui=cast(str | None, fila["cui"]),
            convocatoria=cast(date | None, fila["convocatoria"]),
            postores=tuple(
                Postor(str(p["identificador"]), str(p["nombre"]), bool(p.get("ganador")))
                for p in cast(list[Json], fila["postores"])
            ),
        )

    async def buscar(self, texto: str, limite: int) -> tuple[Proceso, ...]:
        patron = f"%{texto.strip()}%"
        sentencia = (
            sa.select(procesos.c.id)
            .where(
                sa.or_(
                    procesos.c.id == texto.strip(),
                    procesos.c.nomenclatura.ilike(patron),
                    procesos.c.entidad.ilike(patron),
                    procesos.c.descripcion.ilike(patron),
                    procesos.c.cui == texto.strip(),
                )
            )
            .order_by(procesos.c.convocatoria.desc().nulls_last())
            .limit(limite)
        )
        async with self._motor.connect() as conexion:
            ids = (await conexion.execute(sentencia)).scalars().all()
        encontrados = [await self.obtener(str(i)) for i in ids]
        return tuple(p for p in encontrados if p is not None)

    async def reemplazar_todos(self, lista: Sequence[Proceso]) -> None:
        """Carga inicial o actualización completa desde los datos abiertos."""
        async with self._motor.begin() as conexion:
            await conexion.execute(sa.delete(procesos))
            for inicio in range(0, len(lista), _LOTE):
                await conexion.execute(
                    sa.insert(procesos), [_fila_proceso(p) for p in lista[inicio : inicio + _LOTE]]
                )


def _fila_proceso(p: Proceso) -> Json:
    return {
        "id": p.id,
        "nomenclatura": p.nomenclatura,
        "entidad": p.entidad,
        "descripcion": p.descripcion,
        "monto_referencial": p.monto_referencial,
        "cui": p.cui,
        "convocatoria": p.convocatoria,
        "postores": [
            {"identificador": x.identificador, "nombre": x.nombre, "ganador": x.ganador}
            for x in p.postores
        ],
    }


class RegistroAntecedentesPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def de(self, rucs: Sequence[str]) -> Mapping[str, tuple[Antecedente, ...]]:
        if not rucs:
            return {}
        async with self._motor.connect() as conexion:
            filas = (
                (
                    await conexion.execute(
                        sa.select(antecedentes)
                        .where(antecedentes.c.ruc.in_(list(set(rucs))))
                        .order_by(antecedentes.c.inicio)
                    )
                )
                .mappings()
                .all()
            )
        agrupados: dict[str, list[Antecedente]] = defaultdict(list)
        for f in filas:
            agrupados[str(f["ruc"])].append(
                Antecedente(
                    ruc=str(f["ruc"]),
                    tipo=TipoAntecedente(str(f["tipo"])),
                    motivo=str(f["motivo"]),
                    inicio=cast(date | None, f["inicio"]),
                    fin=cast(date | None, f["fin"]),
                    resolucion=cast(str | None, f["resolucion"]),
                    monto=cast(Decimal | None, f["monto"]),
                    entidad=cast(str | None, f["entidad"]),
                    objeto=cast(str | None, f["objeto"]),
                )
            )
        return {ruc: tuple(lista) for ruc, lista in agrupados.items()}

    async def fuente(self) -> FuenteAntecedentes:
        async with self._motor.connect() as conexion:
            fila = (await conexion.execute(sa.select(fuentes).limit(1))).mappings().first()
        if fila is None:
            return FuenteAntecedentes("Registros del OECE (no cargados)", None)
        return FuenteAntecedentes(str(fila["nombre"]), cast(date | None, fila["corte"]))

    async def reemplazar_todos(
        self, lista: Sequence[Antecedente], fuente: FuenteAntecedentes
    ) -> None:
        async with self._motor.begin() as conexion:
            await conexion.execute(sa.delete(antecedentes))
            await conexion.execute(sa.delete(fuentes))
            await conexion.execute(
                sa.insert(fuentes).values(nombre=fuente.nombre, corte=fuente.corte)
            )
            for inicio in range(0, len(lista), _LOTE):
                await conexion.execute(
                    sa.insert(antecedentes),
                    [
                        {
                            "ruc": a.ruc,
                            "tipo": a.tipo.value,
                            "motivo": a.motivo,
                            "inicio": a.inicio,
                            "fin": a.fin,
                            "resolucion": a.resolucion,
                            "monto": a.monto,
                            "entidad": a.entidad,
                            "objeto": a.objeto,
                        }
                        for a in lista[inicio : inicio + _LOTE]
                    ],
                )
