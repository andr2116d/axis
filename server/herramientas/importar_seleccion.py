"""Carga los procesos de obra de La Libertad y los antecedentes públicos de proveedores.

    uv run python -m herramientas.importar_seleccion          # contra el Postgres local (5433)

Fuentes (datos abiertos, en datos-crudos):
  - obras_la_libertad.json: procesos de obra con sus postores y ganadores (OCDS del OECE);
  - sanciones/CONOSCE*.csv: inhabilitaciones, multas y penalidades del OECE (latin-1, con "|").
"""

import ast
import asyncio
import csv
import json
import os
from collections.abc import Iterator
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from sqlalchemy.ext.asyncio import create_async_engine

from axis.arranque.config import Config
from axis.seleccion.adaptadores.salida.postgres import (
    RegistroAntecedentesPostgres,
    RepositorioProcesosPostgres,
)
from axis.seleccion.dominio.valores import (
    Antecedente,
    FuenteAntecedentes,
    Postor,
    Proceso,
    TipoAntecedente,
)

FUENTE = "Registro del OECE (sanciones, multas y penalidades)"


def _lista(valor: object) -> list[dict[str, object]]:
    if isinstance(valor, list):
        return valor
    if not valor:
        return []
    try:
        leido = ast.literal_eval(str(valor))
    except (ValueError, SyntaxError):
        return []
    return leido if isinstance(leido, list) else []


def _decimal(texto: object) -> Decimal | None:
    try:
        return Decimal(str(texto).replace(",", "")) if texto not in (None, "") else None
    except InvalidOperation:
        return None


def _fecha(texto: str, formato: str = "%Y%m%d") -> date | None:
    texto = (texto or "").strip()
    try:
        return datetime.strptime(texto, formato).date() if texto else None  # noqa: DTZ007 - es solo una fecha
    except ValueError:
        return None


def procesos(datos: Path) -> list[Proceso]:
    # Un mismo proceso puede venir dos veces (versiones del OCDS): vale el último registro.
    salida: dict[str, Proceso] = {}
    for obra in json.loads((datos / "obras_la_libertad.json").read_text()):
        ganadores = {str(g.get("ruc")) for g in _lista(obra.get("ganadores"))}
        ganadores |= {str(g.get("nombre")) for g in _lista(obra.get("ganadores"))}
        postores = tuple(
            Postor(
                str(p.get("ruc")),
                str(p.get("nombre") or ""),
                str(p.get("ruc")) in ganadores or str(p.get("nombre")) in ganadores,
            )
            for p in _lista(obra.get("postores"))
        )
        convocatoria = str(obra.get("fecha_convocatoria") or "")[:10]
        salida[str(obra["proceso"])] = Proceso(
            id=str(obra["proceso"]),
            nomenclatura=str(obra.get("nomenclatura") or ""),
            entidad=str(obra.get("entidad") or ""),
            descripcion=str(obra.get("descripcion") or ""),
            monto_referencial=_decimal(obra.get("monto_referencial")),
            cui=str(obra["cui"]) if obra.get("cui") else None,
            convocatoria=_fecha(convocatoria, "%Y-%m-%d"),
            postores=postores,
        )
    return list(salida.values())


def _campo(fila: dict[str, str], nombre: str) -> str:
    """Hay filas cortas o con campos vacíos: se leen como texto vacío."""
    return (fila.get(nombre) or "").strip()


def _filas(ruta: Path) -> Iterator[dict[str, str]]:
    with ruta.open(encoding="latin-1", newline="") as archivo:
        yield from csv.DictReader(archivo, delimiter="|")


def antecedentes(sanciones: Path) -> tuple[list[Antecedente], date | None]:
    lista: list[Antecedente] = []
    cortes: list[date] = []
    for f in _filas(sanciones / "CONOSCESANCIONINHABILITANEW.csv"):
        lista.append(
            Antecedente(
                _campo(f, "RUC"),
                TipoAntecedente.INHABILITACION,
                _campo(f, "DE_MOTIVO_INFRACCION"),
                _fecha(_campo(f, "FECHA_INICIO")),
                _fecha(_campo(f, "FECHA_FIN")),
                _campo(f, "NUMERO_RESOLUCION") or None,
            )
        )
        if corte := _fecha(_campo(f, "FECHA_CORTE")):
            cortes.append(corte)
    for f in _filas(sanciones / "CONOSCEINHABILITAJUDINEW.csv"):
        lista.append(
            Antecedente(
                _campo(f, "RUC_DNI"),
                TipoAntecedente.INHABILITACION_JUDICIAL,
                f"Inhabilitación judicial: {_campo(f, 'ORGANO_JURISDICCIONAL')}",
                _fecha(_campo(f, "FECHA_INICIO")),
                _fecha(_campo(f, "FECHA_FIN")),
                _campo(f, "NUMERO_RESOLUCION") or None,
            )
        )
    for f in _filas(sanciones / "CONOSCESANCIONMULTANEW.csv"):
        lista.append(
            Antecedente(
                _campo(f, "RUC"),
                TipoAntecedente.MULTA,
                _campo(f, "DE_MOTIVO_INFRACCION"),
                _fecha(_campo(f, "FECHA_INICIO")),
                _fecha(_campo(f, "FECHA_FIN")),
                _campo(f, "NUMERO_RESOLUCION") or None,
                _decimal(_campo(f, "MONTO")),
            )
        )
    for f in _filas(sanciones / "CONOSCEPENALIDADNEW.csv"):
        inicio = _fecha(_campo(f, "FECHA PENALIDAD"), "%d/%m/%y")
        lista.append(
            Antecedente(
                _campo(f, "RUC CONTRATISTA"),
                TipoAntecedente.PENALIDAD,
                _campo(f, "DESCRIPCION/MOTIVO") or _campo(f, "TIPO PENALIDAD"),
                inicio,
                inicio,
                None,
                _decimal(_campo(f, "MONTO")),
                _campo(f, "ENTIDAD CONTRATANTE") or None,
                _campo(f, "OBJETO CONTRATO") or None,
            )
        )
    return lista, max(cortes) if cortes else None


async def principal() -> None:
    datos = Path(os.environ.get("AXIS_DATOS_CRUDOS", "../../datos-crudos")).resolve()
    motor = create_async_engine(Config().base_datos_url)
    try:
        lista_procesos = procesos(datos)
        await RepositorioProcesosPostgres(motor).reemplazar_todos(lista_procesos)
        lista, corte = antecedentes(datos / "sanciones")
        await RegistroAntecedentesPostgres(motor).reemplazar_todos(
            lista, FuenteAntecedentes(FUENTE, corte)
        )
        postores = sum(len(p.postores) for p in lista_procesos)
        print(f"{len(lista_procesos)} procesos, {postores} postores")
        print(f"{len(lista)} antecedentes de proveedores (corte {corte})")
    finally:
        await motor.dispose()


if __name__ == "__main__":
    asyncio.run(principal())
