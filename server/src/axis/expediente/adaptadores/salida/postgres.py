from collections.abc import Mapping
from datetime import datetime
from typing import cast
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncEngine

from axis.compartido.dominio.motores import Factor, Hallazgo, ResultadoMotor, Severidad
from axis.expediente.dominio.entidades import (
    DocumentoAdjunto,
    EvaluacionExpediente,
    Expediente,
    IdEvaluacion,
    IdExpediente,
    OmisionMotor,
)

metadatos = sa.MetaData()

expedientes = sa.Table(
    "expedientes",
    metadatos,
    sa.Column("id", sa.Uuid, primary_key=True),
    sa.Column("nombre_obra", sa.Text, nullable=False),
    sa.Column("cui", sa.Text),
    sa.Column("entidad", sa.Text),
    sa.Column("tipologia", sa.Text),
    sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
)
documentos = sa.Table(
    "expediente_documentos",
    metadatos,
    sa.Column("expediente_id", sa.Uuid, primary_key=True),
    sa.Column("id_documento", sa.Text, primary_key=True),
    sa.Column("nombre", sa.Text, nullable=False),
    sa.Column("tipo", sa.Text, nullable=False),
    sa.Column("partes", JSONB, nullable=False),
    sa.Column("adjuntado_en", sa.DateTime(timezone=True), nullable=False),
)
evaluaciones = sa.Table(
    "evaluaciones_expediente",
    metadatos,
    sa.Column("id", sa.Uuid, primary_key=True),
    sa.Column("expediente_id", sa.Uuid, nullable=False),
    sa.Column("numero", sa.Integer, nullable=False),
    sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
    sa.Column("resultados", JSONB, nullable=False),
    sa.Column("omitidos", JSONB, nullable=False),
    sa.Column("fallas", JSONB, nullable=False),
    sa.Column("secciones_revisadas", JSONB, nullable=False),
    sa.Column("duracion_ms", sa.Integer, nullable=False),
)

type Json = dict[str, object]


class RepositorioExpedientesPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def guardar(self, expediente: Expediente) -> None:
        fila = {
            "id": expediente.id,
            "nombre_obra": expediente.nombre_obra,
            "cui": expediente.cui,
            "entidad": expediente.entidad,
            "tipologia": expediente.tipologia,
            "creado_en": expediente.creado_en,
        }
        async with self._motor.begin() as conexion:
            existe = await conexion.scalar(
                sa.select(sa.func.count())
                .select_from(expedientes)
                .where(expedientes.c.id == expediente.id)
            )
            if existe:
                await conexion.execute(
                    sa.update(expedientes).where(expedientes.c.id == expediente.id).values(fila)
                )
            else:
                await conexion.execute(sa.insert(expedientes).values(fila))
            await conexion.execute(
                sa.delete(documentos).where(documentos.c.expediente_id == expediente.id)
            )
            if expediente.documentos:
                await conexion.execute(
                    sa.insert(documentos),
                    [
                        {
                            "expediente_id": expediente.id,
                            "id_documento": d.id_documento,
                            "nombre": d.nombre,
                            "tipo": d.tipo,
                            "partes": list(d.partes),
                            "adjuntado_en": d.adjuntado_en,
                        }
                        for d in expediente.documentos
                    ],
                )

    async def obtener(self, id_expediente: IdExpediente) -> Expediente | None:
        async with self._motor.connect() as conexion:
            fila = (
                (
                    await conexion.execute(
                        sa.select(expedientes).where(expedientes.c.id == id_expediente)
                    )
                )
                .mappings()
                .first()
            )
            if fila is None:
                return None
            adjuntos = (
                (
                    await conexion.execute(
                        sa.select(documentos)
                        .where(documentos.c.expediente_id == id_expediente)
                        .order_by(documentos.c.adjuntado_en)
                    )
                )
                .mappings()
                .all()
            )
        return Expediente(
            id=IdExpediente(cast(UUID, fila["id"])),
            nombre_obra=str(fila["nombre_obra"]),
            cui=_texto(fila["cui"]),
            entidad=_texto(fila["entidad"]),
            tipologia=_texto(fila["tipologia"]),
            documentos=tuple(
                DocumentoAdjunto(
                    str(d["id_documento"]),
                    str(d["nombre"]),
                    str(d["tipo"]),
                    tuple(str(p) for p in cast(list[object], d["partes"])),
                    cast(datetime, d["adjuntado_en"]),
                )
                for d in adjuntos
            ),
            creado_en=cast(datetime, fila["creado_en"]),
        )

    async def guardar_evaluacion(self, evaluacion: EvaluacionExpediente) -> None:
        async with self._motor.begin() as conexion:
            await conexion.execute(
                sa.insert(evaluaciones).values(
                    id=evaluacion.id,
                    expediente_id=evaluacion.id_expediente,
                    numero=evaluacion.numero,
                    creada_en=evaluacion.creada_en,
                    resultados=[_resultado_a_json(r) for r in evaluacion.resultados],
                    omitidos=[
                        {
                            "motor": o.id_motor,
                            "nombre": o.nombre,
                            "razon": o.razon,
                            "faltan": list(o.faltan),
                        }
                        for o in evaluacion.omitidos
                    ],
                    fallas=[{"motor": m, "razon": r} for m, r in evaluacion.fallas],
                    secciones_revisadas=sorted(evaluacion.secciones_revisadas),
                    duracion_ms=evaluacion.duracion_ms,
                )
            )

    async def ultima_evaluacion(self, id_expediente: IdExpediente) -> EvaluacionExpediente | None:
        async with self._motor.connect() as conexion:
            fila = (
                (
                    await conexion.execute(
                        sa.select(evaluaciones)
                        .where(evaluaciones.c.expediente_id == id_expediente)
                        .order_by(evaluaciones.c.numero.desc())
                        .limit(1)
                    )
                )
                .mappings()
                .first()
            )
        if fila is None:
            return None
        return EvaluacionExpediente(
            id=IdEvaluacion(cast(UUID, fila["id"])),
            id_expediente=id_expediente,
            numero=int(cast(int, fila["numero"])),
            creada_en=cast(datetime, fila["creada_en"]),
            resultados=tuple(_resultado_de_json(r) for r in cast(list[Json], fila["resultados"])),
            omitidos=tuple(
                OmisionMotor(
                    str(o["motor"]),
                    str(o["nombre"]),
                    str(o["razon"]),
                    tuple(str(f) for f in cast(list[object], o["faltan"])),
                )
                for o in cast(list[Json], fila["omitidos"])
            ),
            fallas=tuple(
                (str(f["motor"]), str(f["razon"])) for f in cast(list[Json], fila["fallas"])
            ),
            secciones_revisadas=frozenset(
                str(s) for s in cast(list[object], fila["secciones_revisadas"])
            ),
            duracion_ms=int(cast(int, fila["duracion_ms"])),
        )


def _resultado_a_json(r: ResultadoMotor) -> Json:
    return {
        "motor": r.id_motor,
        "version": r.version_motor,
        "firma": r.firma,
        "hallazgos": [
            {
                "severidad": h.severidad.value,
                "titulo": h.titulo,
                "explicacion": h.explicacion,
                "confianza": h.confianza,
                "pagina": h.pagina,
                "item": h.item,
                "documento": h.id_documento,
                "seccion": h.seccion,
                "metadatos": h.metadatos,
                "factores": [{"nombre": f.nombre, "valor": f.valor} for f in h.factores],
            }
            for h in r.hallazgos
        ],
    }


def _resultado_de_json(datos: Json) -> ResultadoMotor:
    motor, version = str(datos["motor"]), str(datos["version"])
    hallazgos = tuple(
        Hallazgo(
            id_motor=motor,
            version_motor=version,
            severidad=Severidad(str(h["severidad"])),
            titulo=str(h["titulo"]),
            explicacion=str(h["explicacion"]),
            confianza=float(cast(float, h["confianza"])),
            factores=tuple(
                Factor(str(f["nombre"]), str(f["valor"])) for f in cast(list[Json], h["factores"])
            ),
            pagina=cast(int | None, h.get("pagina")),
            item=_texto(h.get("item")),
            id_documento=_texto(h.get("documento")),
            seccion=_texto(h.get("seccion")),
            metadatos={
                str(k): str(v) for k, v in cast(Mapping[str, object], h["metadatos"]).items()
            },
        )
        for h in cast(list[Json], datos["hallazgos"])
    )
    return ResultadoMotor(motor, version, str(datos["firma"]), hallazgos)


def _texto(valor: object) -> str | None:
    return str(valor) if valor is not None else None
