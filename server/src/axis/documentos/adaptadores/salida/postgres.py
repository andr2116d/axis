from collections.abc import Mapping
from datetime import datetime
from decimal import Decimal
from uuid import UUID

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine

from axis.compartido.dominio.valores import Fase
from axis.documentos.dominio.entidades import (
    Correccion,
    Documento,
    EvaluacionEdicion,
    Huella,
    Pagina,
    Parte,
    SenalEdicion,
)
from axis.documentos.dominio.partidas import Partida
from axis.documentos.dominio.valores import (
    Clasificacion,
    CodigoSenal,
    Etiqueta,
    FuenteClasificacion,
    IdCorreccion,
    IdDocumento,
    OrigenPagina,
    TipoArchivo,
    TipoDocumento,
)

metadatos = sa.MetaData()

documentos = sa.Table(
    "documentos",
    metadatos,
    sa.Column("id", sa.Uuid, primary_key=True),
    sa.Column("hash_contenido", sa.Text, nullable=False, unique=True),
    sa.Column("nombre_original", sa.Text, nullable=False),
    sa.Column("huella", JSONB, nullable=False),
    sa.Column("tipo_etiqueta", sa.Text, nullable=False),
    sa.Column("tipo_confianza", sa.Float, nullable=False),
    sa.Column("tipo_fase", sa.Text),
    sa.Column("tipo_fuente", sa.Text, nullable=False, server_default="modelo"),
    sa.Column("senales", JSONB, nullable=False),
    sa.Column("rareza", sa.Float),
    sa.Column("fase_subida", sa.Text),
    sa.Column("version_modelos", sa.Text, nullable=False),
    sa.Column("subido_en", sa.DateTime(timezone=True), nullable=False),
)

paginas = sa.Table(
    "paginas",
    metadatos,
    sa.Column(
        "documento_id",
        sa.Uuid,
        sa.ForeignKey("documentos.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column("numero", sa.Integer, primary_key=True),
    sa.Column("origen", sa.Text, nullable=False),
    sa.Column("texto", sa.Text, nullable=False),
    sa.Column("ancho_pt", sa.Float, nullable=False),
    sa.Column("alto_pt", sa.Float, nullable=False),
    sa.Column("etiqueta", sa.Text),
    sa.Column("confianza", sa.Float),
    sa.Column("fuente", sa.Text, nullable=False, server_default="modelo"),
    sa.Column("confianza_ocr", sa.Float),
)

partidas = sa.Table(
    "partidas",
    metadatos,
    sa.Column(
        "documento_id",
        sa.Uuid,
        sa.ForeignKey("documentos.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column("orden", sa.Integer, primary_key=True),
    sa.Column("pagina", sa.Integer, nullable=False),
    sa.Column("item", sa.Text, nullable=False),
    sa.Column("descripcion", sa.Text, nullable=False),
    sa.Column("unidad", sa.Text),
    sa.Column("numeros", JSONB, nullable=False),
    sa.Column("cantidad", sa.Numeric),
    sa.Column("precio_unitario", sa.Numeric),
    sa.Column("parcial", sa.Numeric),
    sa.Column("cuadra", sa.Boolean),
)

correcciones = sa.Table(
    "correcciones",
    metadatos,
    sa.Column("id", sa.Uuid, primary_key=True),
    # Por hash y sin clave foránea: la corrección sobrevive a que el documento se reanalice.
    sa.Column("hash_contenido", sa.Text, nullable=False, index=True),
    sa.Column("pagina", sa.Integer),
    sa.Column("etiqueta_anterior", sa.Text),
    sa.Column("etiqueta", sa.Text, nullable=False),
    sa.Column("fase", sa.Text),
    sa.Column("version_modelos", sa.Text, nullable=False),
    sa.Column("corregido_en", sa.DateTime(timezone=True), nullable=False),
)

partes = sa.Table(
    "partes",
    metadatos,
    sa.Column(
        "documento_id",
        sa.Uuid,
        sa.ForeignKey("documentos.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    sa.Column("orden", sa.Integer, primary_key=True),
    sa.Column("etiqueta", sa.Text, nullable=False),
    sa.Column("desde", sa.Integer, nullable=False),
    sa.Column("hasta", sa.Integer, nullable=False),
    sa.Column("confianza", sa.Float, nullable=False),
)


class RepositorioDocumentosPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def buscar_por_hash(self, hash_contenido: str) -> Documento | None:
        return await self._buscar(documentos.c.hash_contenido == hash_contenido)

    async def obtener(self, id_documento: IdDocumento) -> Documento | None:
        return await self._buscar(documentos.c.id == id_documento)

    async def guardar(self, documento: Documento) -> None:
        async with self._motor.begin() as conexion:
            # Un reanálisis del mismo archivo (con modelos nuevos) reemplaza al anterior.
            await conexion.execute(
                sa.delete(documentos).where(documentos.c.hash_contenido == documento.hash_contenido)
            )
            await conexion.execute(sa.insert(documentos).values(_fila_documento(documento)))
            if documento.paginas:
                await conexion.execute(
                    sa.insert(paginas), [_fila_pagina(documento.id, p) for p in documento.paginas]
                )
            if documento.partes:
                await conexion.execute(
                    sa.insert(partes),
                    [_fila_parte(documento.id, i, p) for i, p in enumerate(documento.partes)],
                )
            if documento.partidas:
                await conexion.execute(
                    sa.insert(partidas),
                    [_fila_partida(documento.id, i, p) for i, p in enumerate(documento.partidas)],
                )

    async def _buscar(self, condicion: sa.ColumnElement[bool]) -> Documento | None:
        async with self._motor.connect() as conexion:
            fila = (
                (await conexion.execute(sa.select(documentos).where(condicion))).mappings().first()
            )
            if fila is None:
                return None
            return await _armar(conexion, dict(fila))


class RepositorioCorreccionesPostgres:
    def __init__(self, motor: AsyncEngine) -> None:
        self._motor = motor

    async def guardar(self, correccion: Correccion) -> None:
        async with self._motor.begin() as conexion:
            await conexion.execute(
                sa.insert(correcciones).values(
                    id=correccion.id,
                    hash_contenido=correccion.hash_contenido,
                    pagina=correccion.pagina,
                    etiqueta_anterior=correccion.etiqueta_anterior,
                    etiqueta=correccion.etiqueta,
                    fase=correccion.fase.value if correccion.fase else None,
                    version_modelos=correccion.version_modelos,
                    corregido_en=correccion.corregido_en,
                )
            )

    async def listar(self, hash_contenido: str) -> list[Correccion]:
        consulta = (
            sa.select(correcciones)
            .where(correcciones.c.hash_contenido == hash_contenido)
            .order_by(correcciones.c.corregido_en)
        )
        async with self._motor.connect() as conexion:
            filas = (await conexion.execute(consulta)).mappings().all()
        return [_correccion(dict(f)) for f in filas]


def _correccion(fila: Mapping[str, object]) -> Correccion:
    pagina, anterior, fase = fila["pagina"], fila["etiqueta_anterior"], fila["fase"]
    return Correccion(
        id=IdCorreccion(_uuid(fila["id"])),
        hash_contenido=str(fila["hash_contenido"]),
        pagina=_int(pagina) if pagina is not None else None,
        etiqueta_anterior=Etiqueta(str(anterior)) if anterior is not None else None,
        etiqueta=Etiqueta(str(fila["etiqueta"])),
        fase=Fase(str(fase)) if fase else None,
        version_modelos=str(fila["version_modelos"]),
        corregido_en=_fecha(fila["corregido_en"]),
    )


async def _armar(conexion: AsyncConnection, fila: Mapping[str, object]) -> Documento:
    id_documento = fila["id"]
    filas_paginas = (
        await conexion.execute(
            sa.select(paginas)
            .where(paginas.c.documento_id == id_documento)
            .order_by(paginas.c.numero)
        )
    ).mappings()
    filas_partes = (
        await conexion.execute(
            sa.select(partes).where(partes.c.documento_id == id_documento).order_by(partes.c.orden)
        )
    ).mappings()
    filas_partidas = (
        await conexion.execute(
            sa.select(partidas)
            .where(partidas.c.documento_id == id_documento)
            .order_by(partidas.c.orden)
        )
    ).mappings()
    huella = _a_dict(fila["huella"])
    senales = fila["senales"]
    tipo_fase = fila["tipo_fase"]
    fase_subida = fila["fase_subida"]
    rareza = fila["rareza"]
    return Documento(
        id=IdDocumento(_uuid(id_documento)),
        hash_contenido=str(fila["hash_contenido"]),
        nombre_original=str(fila["nombre_original"]),
        huella=_huella(huella),
        paginas=tuple(_pagina(dict(p)) for p in filas_paginas),
        partes=tuple(
            Parte(
                Etiqueta(str(p["etiqueta"])),
                _int(p["desde"]),
                _int(p["hasta"]),
                _float(p["confianza"]),
            )
            for p in filas_partes
        ),
        tipo=TipoDocumento(
            Etiqueta(str(fila["tipo_etiqueta"])),
            _float(fila["tipo_confianza"]),
            Fase(str(tipo_fase)) if tipo_fase else None,
            FuenteClasificacion(str(fila["tipo_fuente"])),
        ),
        edicion=EvaluacionEdicion(
            tuple(_senal(_a_dict(s)) for s in senales) if isinstance(senales, list) else (),
            _float(rareza) if rareza is not None else None,
        ),
        fase_subida=Fase(str(fase_subida)) if fase_subida else None,
        version_modelos=str(fila["version_modelos"]),
        subido_en=_fecha(fila["subido_en"]),
        partidas=tuple(_partida(dict(p)) for p in filas_partidas),
    )


def _fila_documento(documento: Documento) -> dict[str, object]:
    h = documento.huella
    return {
        "id": documento.id,
        "hash_contenido": documento.hash_contenido,
        "nombre_original": documento.nombre_original,
        "huella": {
            "tipo_archivo": h.tipo_archivo.value,
            "tamano_bytes": h.tamano_bytes,
            "programa_creador": h.programa_creador,
            "programa_productor": h.programa_productor,
            "creado_en": h.creado_en.isoformat() if h.creado_en else None,
            "modificado_en": h.modificado_en.isoformat() if h.modificado_en else None,
            "revisiones": h.revisiones,
            "firmas": h.firmas,
            "firmas_que_no_cubren_todo": h.firmas_que_no_cubren_todo,
        },
        "tipo_etiqueta": documento.tipo.etiqueta,
        "tipo_confianza": documento.tipo.confianza,
        "tipo_fase": documento.tipo.fase.value if documento.tipo.fase else None,
        "tipo_fuente": documento.tipo.fuente.value,
        "senales": [
            {"codigo": s.codigo.value, "descripcion": s.descripcion, "paginas": list(s.paginas)}
            for s in documento.edicion.senales
        ],
        "rareza": documento.edicion.rareza,
        "fase_subida": documento.fase_subida.value if documento.fase_subida else None,
        "version_modelos": documento.version_modelos,
        "subido_en": documento.subido_en,
    }


def _fila_pagina(id_documento: IdDocumento, pagina: Pagina) -> dict[str, object]:
    c = pagina.clasificacion
    return {
        "documento_id": id_documento,
        "numero": pagina.numero,
        "origen": pagina.origen.value,
        # Postgres no acepta el carácter nulo dentro de un texto; algunos PDF lo traen.
        "texto": pagina.texto.replace("\x00", ""),
        "ancho_pt": pagina.ancho_pt,
        "alto_pt": pagina.alto_pt,
        "etiqueta": c.etiqueta if c else None,
        "confianza": c.confianza if c else None,
        "fuente": c.fuente.value if c else FuenteClasificacion.MODELO.value,
        "confianza_ocr": pagina.confianza_ocr,
    }


def _fila_partida(id_documento: IdDocumento, orden: int, partida: Partida) -> dict[str, object]:
    return {
        "documento_id": id_documento,
        "orden": orden,
        "pagina": partida.pagina,
        "item": partida.item,
        "descripcion": partida.descripcion.replace("\x00", ""),
        "unidad": partida.unidad,
        # En JSON como texto: así no se pierde ningún decimal.
        "numeros": [str(n) for n in partida.numeros],
        "cantidad": partida.cantidad,
        "precio_unitario": partida.precio_unitario,
        "parcial": partida.parcial,
        "cuadra": partida.cuadra,
    }


def _partida(fila: Mapping[str, object]) -> Partida:
    numeros = fila["numeros"]
    unidad, cuadra = fila["unidad"], fila["cuadra"]
    return Partida(
        pagina=_int(fila["pagina"]),
        item=str(fila["item"]),
        descripcion=str(fila["descripcion"]),
        unidad=str(unidad) if unidad is not None else None,
        numeros=tuple(Decimal(str(n)) for n in numeros) if isinstance(numeros, list) else (),
        cantidad=_decimal(fila["cantidad"]),
        precio_unitario=_decimal(fila["precio_unitario"]),
        parcial=_decimal(fila["parcial"]),
        cuadra=bool(cuadra) if cuadra is not None else None,
    )


def _decimal(valor: object) -> Decimal | None:
    if valor is None:
        return None
    if isinstance(valor, Decimal):
        return valor
    return Decimal(str(valor))


def _fila_parte(id_documento: IdDocumento, orden: int, parte: Parte) -> dict[str, object]:
    return {
        "documento_id": id_documento,
        "orden": orden,
        "etiqueta": parte.etiqueta,
        "desde": parte.desde,
        "hasta": parte.hasta,
        "confianza": parte.confianza,
    }


def _pagina(fila: Mapping[str, object]) -> Pagina:
    etiqueta, confianza = fila["etiqueta"], fila["confianza"]
    confianza_ocr = fila["confianza_ocr"]
    return Pagina(
        numero=_int(fila["numero"]),
        origen=OrigenPagina(str(fila["origen"])),
        texto=str(fila["texto"]),
        ancho_pt=_float(fila["ancho_pt"]),
        alto_pt=_float(fila["alto_pt"]),
        clasificacion=(
            Clasificacion(
                Etiqueta(str(etiqueta)), _float(confianza), FuenteClasificacion(str(fila["fuente"]))
            )
            if etiqueta is not None and confianza is not None
            else None
        ),
        confianza_ocr=_float(confianza_ocr) if confianza_ocr is not None else None,
    )


def _huella(datos: Mapping[str, object]) -> Huella:
    def texto(clave: str) -> str | None:
        valor = datos.get(clave)
        return str(valor) if valor is not None else None

    creado, modificado = texto("creado_en"), texto("modificado_en")
    return Huella(
        tipo_archivo=TipoArchivo(str(datos["tipo_archivo"])),
        tamano_bytes=_int(datos["tamano_bytes"]),
        programa_creador=texto("programa_creador"),
        programa_productor=texto("programa_productor"),
        creado_en=datetime.fromisoformat(creado) if creado else None,
        modificado_en=datetime.fromisoformat(modificado) if modificado else None,
        revisiones=_int(datos["revisiones"]),
        firmas=_int(datos["firmas"]),
        firmas_que_no_cubren_todo=_int(datos["firmas_que_no_cubren_todo"]),
    )


def _senal(datos: Mapping[str, object]) -> SenalEdicion:
    numeros = datos.get("paginas")
    return SenalEdicion(
        CodigoSenal(str(datos["codigo"])),
        str(datos["descripcion"]),
        tuple(_int(n) for n in numeros) if isinstance(numeros, list) else (),
    )


def _a_dict(valor: object) -> dict[str, object]:
    if not isinstance(valor, dict):
        raise TypeError("se esperaba un objeto JSON")
    return {str(k): v for k, v in valor.items()}


def _uuid(valor: object) -> UUID:
    return valor if isinstance(valor, UUID) else UUID(str(valor))


def _int(valor: object) -> int:
    if isinstance(valor, bool) or not isinstance(valor, int | float | str):
        raise TypeError(f"se esperaba un número: {valor!r}")
    return int(valor)


def _float(valor: object) -> float:
    if isinstance(valor, bool) or not isinstance(valor, int | float | str):
        raise TypeError(f"se esperaba un número: {valor!r}")
    return float(valor)


def _fecha(valor: object) -> datetime:
    if not isinstance(valor, datetime):
        raise TypeError("se esperaba una fecha")
    return valor
