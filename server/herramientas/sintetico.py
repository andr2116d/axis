"""Generador de páginas y documentos sintéticos para entrenar.

No busca copiar un formato: busca variedad. Cambia el orden, los títulos, las tablas, los
encabezados y pies, mete ruido de OCR y mezcla vocabulario real (obras, entidades y partidas
de La Libertad) cuando `datos-crudos` está disponible.
"""

import json
import random
import re
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

from herramientas.taxonomia import RECETAS

# ---------- Vocabulario ----------

_PARTIDAS_BASE = (
    ("TRAZO Y REPLANTEO", "m2"),
    ("LIMPIEZA DE TERRENO MANUAL", "m2"),
    ("EXCAVACION DE ZANJAS PARA CIMIENTOS", "m3"),
    ("RELLENO COMPACTADO CON MATERIAL PROPIO", "m3"),
    ("ELIMINACION DE MATERIAL EXCEDENTE", "m3"),
    ("CONCRETO f'c=210 kg/cm2 EN LOSAS", "m3"),
    ("ENCOFRADO Y DESENCOFRADO DE VEREDAS", "m2"),
    ("ACERO DE REFUERZO fy=4200 kg/cm2", "kg"),
    ("SUB BASE GRANULAR E=0.20 m", "m2"),
    ("BASE GRANULAR E=0.15 m", "m2"),
    ('CARPETA ASFALTICA EN CALIENTE E=2"', "m2"),
    ("SARDINEL DE CONCRETO", "m"),
    ("JUNTAS DE DILATACION CON ASFALTO", "m"),
    ("PINTURA DE TRAFICO EN PAVIMENTOS", "m2"),
    ("TUBERIA PVC UF ISO 1452 DN 110 mm", "m"),
    ("BUZON DE CONCRETO H=1.50 m", "und"),
    ("CONEXION DOMICILIARIA DE AGUA POTABLE", "und"),
    ("CARTEL DE IDENTIFICACION DE OBRA", "und"),
    ("MOVILIZACION Y DESMOVILIZACION DE EQUIPOS", "glb"),
    ("SEÑALIZACION Y SEGURIDAD", "glb"),
    ("CURADO DE CONCRETO", "m2"),
    ("NIVELACION Y COMPACTACION DE SUBRASANTE", "m2"),
    ("MURO DE ALBAÑILERIA DE SOGA", "m2"),
    ("TARRAJEO DE MUROS INTERIORES", "m2"),
)
_ENTIDADES_BASE = (
    "MUNICIPALIDAD DISTRITAL DE LA ESPERANZA",
    "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
    "MUNICIPALIDAD DISTRITAL DE EL PORVENIR",
    "GOBIERNO REGIONAL LA LIBERTAD",
    "MUNICIPALIDAD DISTRITAL DE HUANCHACO",
    "MUNICIPALIDAD PROVINCIAL DE SANCHEZ CARRION",
)
_LUGARES_BASE = (
    ("TRUJILLO", "LA ESPERANZA"),
    ("TRUJILLO", "EL PORVENIR"),
    ("TRUJILLO", "HUANCHACO"),
    ("SANCHEZ CARRION", "HUAMACHUCO"),
    ("PACASMAYO", "SAN PEDRO DE LLOC"),
    ("ASCOPE", "CASA GRANDE"),
    ("OTUZCO", "OTUZCO"),
    ("CHEPEN", "PACANGA"),
)
_OBRAS_BASE = (
    "MEJORAMIENTO DE PISTAS Y VEREDAS EN LA CALLE {calle}",
    "CREACION DEL SERVICIO DE AGUA POTABLE EN EL CASERIO {calle}",
    "MEJORAMIENTO DEL SERVICIO EDUCATIVO DE LA I.E. N° {numero}",
    "AMPLIACION DEL SISTEMA DE ALCANTARILLADO EN EL SECTOR {calle}",
)
_CALLES = (
    "LOS INCAS",
    "JOSE OLAYA",
    "BOLOGNESI",
    "MIRAFLORES",
    "SANTA ROSA",
    "LAS GARDENIAS",
    "SAN MARTIN",
    "LOS ANGELES",
    "VICTOR RAUL",
    "28 DE JULIO",
)
_MESES = (
    "ENERO",
    "FEBRERO",
    "MARZO",
    "ABRIL",
    "MAYO",
    "JUNIO",
    "JULIO",
    "AGOSTO",
    "SETIEMBRE",
    "OCTUBRE",
    "NOVIEMBRE",
    "DICIEMBRE",
)
_RECURSOS = (
    ("OPERARIO", "hh", 26.5),
    ("OFICIAL", "hh", 21.1),
    ("PEON", "hh", 19.0),
    ("CEMENTO PORTLAND TIPO I", "bol", 31.0),
    ("ARENA GRUESA", "m3", 65.0),
    ('PIEDRA CHANCADA 1/2"', "m3", 85.0),
    ("AGUA PUESTA EN OBRA", "m3", 8.0),
    ("MEZCLADORA DE CONCRETO 9-11 p3", "hm", 18.0),
    ("HERRAMIENTAS MANUALES", "%mo", 0.0),
    ("RODILLO LISO VIBRATORIO 10-12 t", "hm", 160.0),
    ("ALAMBRE NEGRO N°16", "kg", 6.5),
)

_PARTIDA = re.compile(
    r"^\s*(\d{2}(?:\.\d{2}){1,4})\s+(.{8,90}?)\s{2,}(m2|m3|m|ml|und|glb|kg|est|mes|pto)\s",
    re.IGNORECASE,
)


@dataclass
class Vocabulario:
    partidas: list[tuple[str, str]] = field(default_factory=lambda: list(_PARTIDAS_BASE))
    entidades: list[str] = field(default_factory=lambda: list(_ENTIDADES_BASE))
    lugares: list[tuple[str, str]] = field(default_factory=lambda: list(_LUGARES_BASE))
    obras: list[str] = field(default_factory=list)

    @classmethod
    def desde(cls, datos_crudos: Path | None) -> "Vocabulario":
        vocabulario = cls()
        if datos_crudos is None or not datos_crudos.exists():
            return vocabulario
        for archivo in sorted((datos_crudos / "presupuestos_txt").glob("*.txt")):
            for linea in archivo.read_text(errors="ignore").splitlines():
                m = _PARTIDA.match(linea)
                if m:
                    vocabulario.partidas.append((m.group(2).strip(), m.group(3).lower()))
        obras = datos_crudos / "obras_la_libertad.json"
        if obras.exists():
            for obra in json.loads(obras.read_text()):
                descripcion = str(obra.get("descripcion", "")).replace("EJECUCION DE OBRA:", "")
                if len(descripcion) > 30:
                    vocabulario.obras.append(descripcion.strip()[:220])
                if obra.get("entidad"):
                    vocabulario.entidades.append(str(obra["entidad"]))
                if obra.get("provincia_entidad") and obra.get("localidad_entidad"):
                    vocabulario.lugares.append(
                        (str(obra["provincia_entidad"]), str(obra["localidad_entidad"]))
                    )
        return vocabulario


@dataclass
class Contexto:
    """Los datos de una obra ficticia: se repiten en todas las páginas de un mismo documento."""

    obra: str
    entidad: str
    provincia: str
    distrito: str
    cui: str
    mes: str
    anio: int
    contratista: str
    proceso: str
    partidas: list[tuple[str, str, str]]  # (item, descripción, unidad)

    @classmethod
    def nuevo(cls, r: random.Random, v: Vocabulario) -> "Contexto":
        provincia, distrito = r.choice(v.lugares)
        if v.obras and r.random() < 0.7:
            obra = r.choice(v.obras)
        else:
            obra = r.choice(_OBRAS_BASE).format(calle=r.choice(_CALLES), numero=r.randint(80, 2200))
        elegidas = r.sample(v.partidas, k=min(len(v.partidas), r.randint(12, 40)))
        partidas = []
        titulo, sub, n = 1, 1, 1
        for descripcion, unidad in elegidas:
            partidas.append((f"{titulo:02d}.{sub:02d}.{n:02d}", descripcion, unidad))
            n += 1
            if r.random() < 0.25:
                sub, n = sub + 1, 1
            if r.random() < 0.1:
                titulo, sub, n = titulo + 1, 1, 1
        anio = r.choice((2024, 2025, 2026))
        return cls(
            obra=obra,
            entidad=r.choice(v.entidades),
            provincia=provincia,
            distrito=distrito,
            cui=str(r.randint(2_100_000, 2_699_999)),
            mes=r.choice(_MESES),
            anio=anio,
            contratista=r.choice(("CONSORCIO", "CONSTRUCTORA", "INVERSIONES", "CORPORACION"))
            + " "
            + r.choice(_CALLES)
            + r.choice((" S.A.C.", " E.I.R.L.", "", " S.R.L.")),
            proceso=f"{r.choice(('LP', 'LPA', 'AS', 'CP'))}-{r.randint(1, 40)}-{anio}",
            partidas=partidas,
        )


# ---------- Utilidades de forma ----------


def _num(r: random.Random, bajo: float, alto: float, decimales: int = 2) -> str:
    valor = r.uniform(bajo, alto)
    texto = f"{valor:,.{decimales}f}"
    return texto if r.random() < 0.8 else texto.replace(",", " ")


def _titulo(r: random.Random, *opciones: str) -> str:
    texto = r.choice(opciones)
    return texto.upper() if r.random() < 0.7 else texto.title()


def _parrafo(r: random.Random, frases: tuple[str, ...], ctx: Contexto, n: tuple[int, int]) -> str:
    elegidas = r.sample(frases, k=min(len(frases), r.randint(*n)))
    return " ".join(f.format(c=ctx) for f in elegidas)


def _encabezado(r: random.Random, ctx: Contexto, pagina: int) -> list[str]:
    lineas = []
    if r.random() < 0.5:
        lineas.append(ctx.entidad)
    if r.random() < 0.4:
        lineas.append(f"PROYECTO: {ctx.obra[:120]}")
    if r.random() < 0.3:
        lineas.append(f"CUI N° {ctx.cui}")
    if r.random() < 0.4:
        lineas.append(
            r.choice(
                (
                    f"Página {pagina}",
                    f"Pág. {pagina} de {pagina + r.randint(1, 60)}",
                    f"- {pagina} -",
                    f"Folio {pagina:04d}",
                )
            )
        )
    return lineas


def _filas_partidas(
    r: random.Random, ctx: Contexto, k: tuple[int, int]
) -> list[tuple[str, str, str]]:
    inicio = r.randint(0, max(0, len(ctx.partidas) - 3))
    return ctx.partidas[inicio : inicio + r.randint(*k)]


# ---------- Una función por tipo de parte ----------


def _caratula(r: random.Random, ctx: Contexto) -> list[str]:
    tipo = r.choice(
        (
            "EXPEDIENTE TÉCNICO",
            "EXPEDIENTE TECNICO DE OBRA",
            "VOLUMEN I",
            "INFORME MENSUAL",
            "VALORIZACIÓN DE OBRA",
            "TOMO II",
        )
    )
    return [
        ctx.entidad,
        "",
        tipo,
        "",
        f'"{ctx.obra}"',
        "",
        f"CUI: {ctx.cui}",
        f"{ctx.distrito} - {ctx.provincia} - LA LIBERTAD",
        f"{ctx.mes} {ctx.anio}",
    ]


def _indice(r: random.Random, ctx: Contexto) -> list[str]:
    if r.random() < 0.3:
        laminas = (
            "Ubicación y localización",
            "Topografía y perfil longitudinal",
            "Secciones viales",
            "Pavimentos, sardineles y veredas - detalles",
            "Señalización horizontal y vertical",
            "Plan de desvío de tránsito",
            "Redes de agua potable",
            "Redes de alcantarillado",
            "Arquitectura - planta",
        )
        codigos = ("U", "T", "SV", "PV", "SE", "PD", "AP", "AL", "A")
        return [_titulo(r, "Índice de planos", "Relación de planos", "Lista de láminas")] + [
            f"{codigos[i]}-{r.randint(1, 4):02d} {lamina}"
            for i, lamina in enumerate(laminas)
            if r.random() < 0.7
        ]
    secciones = [
        "Memoria descriptiva",
        "Especificaciones técnicas",
        "Planilla de metrados",
        "Presupuesto de obra",
        "Análisis de costos unitarios",
        "Fórmula polinómica",
        "Cronograma de ejecución",
        "Estudio de mecánica de suelos",
        "Planos",
        "Panel fotográfico",
        "Relación de insumos",
    ]
    r.shuffle(secciones)
    lineas = [_titulo(r, "Índice", "Contenido", "Índice general")]
    folio = 1
    for i, s in enumerate(secciones[: r.randint(5, len(secciones))], 1):
        lineas.append(
            f"{i}. {s.upper() if r.random() < 0.5 else s} {'.' * r.randint(5, 40)} {folio}"
        )
        folio += r.randint(2, 40)
    return lineas


_FRASES_MEMORIA = (
    "El presente proyecto tiene por objeto {c.obra}.",
    "La obra se ubica en el distrito de {c.distrito}, provincia de {c.provincia}, región La Libertad.",
    "La población beneficiaria asciende a aproximadamente 3 450 habitantes.",
    "Actualmente las vías se encuentran a nivel de terreno natural, generando polvo en época seca.",
    "El clima de la zona es templado, con temperaturas que oscilan entre 16 °C y 28 °C.",
    "La meta física comprende la construcción de pavimento rígido, veredas y sardineles.",
    "El plazo de ejecución previsto es de 120 días calendario.",
    "La modalidad de ejecución será por contrata, a suma alzada.",
    "Se ha considerado la reposición de redes de agua y alcantarillado en mal estado.",
    "El acceso a la zona de trabajo se realiza por vía asfaltada desde la ciudad de Trujillo.",
    "La topografía del terreno es relativamente plana, con pendientes menores al 3 %.",
    "El financiamiento proviene de recursos determinados de la entidad.",
)


def _memoria(r: random.Random, ctx: Contexto) -> list[str]:
    numeros = r.sample(range(1, 12), k=3)
    secciones = (
        "GENERALIDADES",
        "ANTECEDENTES",
        "OBJETIVO DEL PROYECTO",
        "UBICACIÓN",
        "DESCRIPCIÓN DEL PROYECTO",
        "METAS FÍSICAS",
        "PLAZO DE EJECUCIÓN",
        "MODALIDAD DE EJECUCIÓN",
        "CLIMA Y TOPOGRAFÍA",
        "JUSTIFICACIÓN",
    )
    lineas = (
        [_titulo(r, "Memoria descriptiva", "Memoria descriptiva general")]
        if r.random() < 0.6
        else []
    )
    for n in sorted(numeros):
        lineas.append(f"{n}. {r.choice(secciones)}")
        lineas.append(_parrafo(r, _FRASES_MEMORIA, ctx, (2, 5)))
    return lineas


_FRASES_ESPECIFICACION = (
    "Descripción: comprende los trabajos necesarios para la correcta ejecución de la partida.",
    "Materiales: se emplearán materiales que cumplan con las normas técnicas peruanas vigentes.",
    "Método de construcción: el contratista ejecutará los trabajos según planos y indicaciones del supervisor.",
    "Método de medición: la unidad de medida será la indicada en el presupuesto.",
    "Forma de pago: el pago se efectuará al precio unitario del contrato, previa aprobación del supervisor.",
    "Equipos: se utilizarán herramientas manuales y equipo liviano en buen estado.",
    "Control de calidad: se realizarán ensayos de resistencia a la compresión cada 50 m3.",
    "El supervisor verificará los niveles y alineamientos antes de autorizar el vaciado.",
)


def _especificaciones(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = (
        [_titulo(r, "Especificaciones técnicas", "Especificaciones técnicas generales")]
        if r.random() < 0.3
        else []
    )
    for item, descripcion, unidad in _filas_partidas(r, ctx, (1, 3)):
        lineas.append(f"{item} {descripcion}")
        lineas.append(_parrafo(r, _FRASES_ESPECIFICACION, ctx, (2, 5)))
        lineas.append(f"Unidad de medida: {unidad}")
    return lineas


def _metrados(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = [
        _titulo(r, "Planilla de metrados", "Hoja de metrados", "Metrados", "Sustento de metrados")
    ]
    if r.random() < 0.6:
        lineas.append(
            r.choice(
                (
                    "Item Descripción Und. N° veces Largo Ancho Alto Parcial Total",
                    "PARTIDA DESCRIPCION UND CANT. LARGO ANCHO ALTURA METRADO",
                    "Item Descripción Und. Elementos Long. Ancho Alt. Área Vol. Total",
                )
            )
        )
    for item, descripcion, unidad in _filas_partidas(r, ctx, (2, 6)):
        lineas.append(f"{item} {descripcion} {unidad}")
        for _ in range(r.randint(1, 5)):
            tramo = r.choice(("Tramo", "Eje", "Calle", "Cuadra", "Sector", "Jr."))
            lineas.append(
                f"{tramo} {r.randint(1, 12)} {r.randint(1, 4)} {_num(r, 2, 120)} "
                f"{_num(r, 0.1, 8)} {_num(r, 0.05, 1.5)} {_num(r, 1, 900)}"
            )
        lineas.append(f"{r.choice(('Total', 'TOTAL', 'Subtotal'))} {_num(r, 10, 9000)} {unidad}")
    return lineas


def _presupuesto(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = [
        r.choice(("S10", "", "Presupuesto", "PRESUPUESTO DE OBRA")),
        f'Presupuesto {r.randint(1000000, 1099999)} "{ctx.obra[:90]}"',
        f"Cliente {ctx.entidad}",
        f"Lugar LA LIBERTAD - {ctx.provincia} - {ctx.distrito}",
        f"Costo al {r.randint(1, 28):02d}/{r.randint(1, 12):02d}/{ctx.anio}",
        r.choice(
            (
                "Item Descripción Und. Metrado Precio S/. Parcial S/.",
                "ITEM DESCRIPCION UNIDAD CANTIDAD P.UNIT. PARCIAL",
            )
        ),
    ]
    for item, descripcion, unidad in _filas_partidas(r, ctx, (6, 18)):
        lineas.append(
            f"{item} {descripcion} {unidad} {_num(r, 1, 3000)} {_num(r, 1, 500)} {_num(r, 50, 90000)}"
        )
    if r.random() < 0.5:
        lineas += [
            f"COSTO DIRECTO {_num(r, 1e5, 4e6)}",
            f"GASTOS GENERALES (10%) {_num(r, 1e4, 4e5)}",
            f"UTILIDAD (5%) {_num(r, 5e3, 2e5)}",
            f"SUB TOTAL {_num(r, 1e5, 4e6)}",
            f"IGV (18%) {_num(r, 1e4, 7e5)}",
            f"VALOR REFERENCIAL {_num(r, 1e5, 5e6)}",
            "SON: "
            + r.choice(("UN MILLON", "DOS MILLONES", "OCHOCIENTOS MIL"))
            + " Y 00/100 SOLES",
        ]
    return lineas


def _acu(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = [
        r.choice(
            (
                "Análisis de precios unitarios",
                "ANALISIS DE COSTOS UNITARIOS",
                "S10 Análisis de precios unitarios",
            )
        )
    ]
    for item, descripcion, unidad in _filas_partidas(r, ctx, (1, 3)):
        rendimiento = r.choice((8, 12, 20, 25, 50, 100, 250, 500))
        lineas += [
            f"Partida {item} {descripcion}",
            f"Rendimiento {unidad}/DIA MO. {rendimiento:.4f} EQ. {rendimiento:.4f} "
            f"Costo unitario directo por : {unidad} {_num(r, 1, 600)}",
            "Código Descripción Recurso Unidad Cuadrilla Cantidad Precio S/. Parcial S/.",
            r.choice(("Mano de Obra", "MANO DE OBRA")),
        ]
        for recurso, und, precio in r.sample(_RECURSOS, k=r.randint(3, 7)):
            lineas.append(
                f"{r.randint(100000, 999999)} {recurso} {und} {_num(r, 0.1, 2, 4)} "
                f"{_num(r, 0.001, 2, 4)} {precio:.2f} {_num(r, 0.01, 90)}"
            )
    return lineas


def _formula(r: random.Random, ctx: Contexto) -> list[str]:
    simbolos = r.sample(("J", "M", "C", "A", "E", "GU", "I", "TA", "F"), k=r.randint(4, 6))
    pesos = [r.uniform(0.05, 0.4) for _ in simbolos]
    total = sum(pesos)
    terminos = " + ".join(
        f"{p / total:.3f}*({s}r/{s}o)" for p, s in zip(pesos, simbolos, strict=True)
    )
    return [
        _titulo(r, "Fórmula polinómica", "Fórmula polinómica de reajuste"),
        f"Presupuesto {ctx.obra[:80]}",
        f"K = {terminos}",
        "Monomio Factor (%) Símbolo Índice Descripción",
        *(
            f"{i} {p / total:.3f} {s} {r.randint(1, 80)} {r.choice(('MANO DE OBRA', 'CEMENTO', 'ACERO', 'AGREGADOS', 'ASFALTO', 'INDICE GENERAL DE PRECIOS'))}"
            for i, (p, s) in enumerate(zip(pesos, simbolos, strict=True), 1)
        ),
    ]


def _cronograma(r: random.Random, ctx: Contexto) -> list[str]:
    if r.random() < 0.5:
        return _cronograma_fechas(r, ctx)
    semanas = r.randint(8, 24)
    lineas = [
        _titulo(r, "Cronograma de ejecución de obra", "Diagrama de Gantt", "Cronograma valorizado"),
        "Id Nombre de tarea Duración Comienzo Fin "
        + " ".join(f"S{i}" for i in range(1, min(semanas, 12))),
    ]
    for item, descripcion, _ in _filas_partidas(r, ctx, (4, 12)):
        dias = r.randint(2, 45)
        lineas.append(
            f"{item} {descripcion} {dias} días lun {r.randint(1, 28)}/{r.randint(1, 12)}/{ctx.anio % 100} "
            f"vie {r.randint(1, 28)}/{r.randint(1, 12)}/{ctx.anio % 100}"
        )
    if r.random() < 0.5:
        lineas.append("Ruta crítica Tarea Hito Resumen Progreso")
    return lineas


def _cronograma_fechas(r: random.Random, ctx: Contexto) -> list[str]:
    plazo = r.choice((60, 75, 90, 120, 150, 180))
    lineas = [
        _titulo(
            r,
            "Cronograma de ejecución de obra",
            "Programación de obra",
            "Cronograma de avance de obra",
        ),
        f"Plazo de ejecución: {plazo} días calendario. Inicio previsto: {r.randint(1, 28):02d}/{r.randint(1, 12):02d}/{ctx.anio}.",
        r.choice(
            (
                "Item Actividad Días Inicio Fin",
                "ITEM PARTIDA DURACIÓN FECHA INICIO FECHA FIN",
                "Ítem Descripción Días Desde Hasta",
            )
        ),
    ]
    for item, descripcion, _ in _filas_partidas(r, ctx, (5, 14)):
        lineas.append(
            f"{item} {descripcion} {r.randint(1, plazo)} {r.randint(1, 28):02d}/{r.randint(1, 12):02d}/{ctx.anio} "
            f"{r.randint(1, 28):02d}/{r.randint(1, 12):02d}/{ctx.anio + r.choice((0, 0, 1))}"
        )
    return lineas


def _cotizacion(r: random.Random, ctx: Contexto) -> list[str]:
    producto, unidad = r.choice(
        (
            ("Mezcla asfáltica en caliente puesta en obra", "m3"),
            ("Cemento Portland tipo I", "bolsa"),
            ("Acero corrugado fy=4200", "kg"),
            ("Alquiler de rodillo vibratorio", "hm"),
            ("Tubería PVC UF DN 110 mm", "und"),
            ("Agregado grueso chancado", "m3"),
        )
    )
    return [
        r.choice(
            (
                f"COTIZACIÓN N° {r.randint(100, 9999):04d}-{ctx.anio}",
                "COTIZACION",
                "PROFORMA",
                f"Cotización Nro. {r.randint(1, 900)}",
            )
        ),
        f"{r.choice(('Proveedor', 'Señores', 'Razón social'))}: {r.choice(('ASFALTOS Y AGREGADOS', 'FERRETERIA', 'DISTRIBUIDORA', 'MAQUINARIAS'))} {r.choice(_CALLES)} S.A.C.",
        f"RUC: 20{r.randint(100000000, 999999999)}",
        f"Fecha: {r.randint(1, 28):02d}/{r.randint(1, 12):02d}/{ctx.anio}",
        f"Obra: {ctx.obra[:100]}" if r.random() < 0.6 else f"Atención: {ctx.entidad}",
        f"{producto}: S/ {_num(r, 5, 900)} por {unidad}."
        + r.choice((" Incluye IGV.", " No incluye flete.", "")),
        f"Validez de la oferta: {r.choice((15, 30, 45))} días."
        if r.random() < 0.7
        else "Forma de pago: contado contra entrega.",
    ]


def _planos(r: random.Random, ctx: Contexto) -> list[str]:
    codigo = r.choice(("PU", "PD", "SE", "TP", "IE", "IS", "AR", "ES", "PG"))
    return [
        r.choice(("LÁMINA:", "LAMINA N°", "PLANO:")) + f" {codigo}-{r.randint(1, 30):02d}",
        r.choice(
            (
                "PLANTA GENERAL",
                "SECCIONES TRANSVERSALES",
                "DETALLES DE VEREDAS",
                "PERFIL LONGITUDINAL",
                "UBICACIÓN Y LOCALIZACIÓN",
                "SEÑALIZACIÓN",
                "REDES DE AGUA",
            )
        ),
        f"ESCALA: 1/{r.choice((50, 75, 100, 200, 500, 1000))}",
        f"FECHA: {ctx.mes[:3]} {ctx.anio}",
        r.choice(("PROYECTISTA:", "DIBUJO:", "REVISADO:", "ESPECIALISTA:")),
        "NORTE",
        *(
            f"{r.choice(('Cota', 'Prog.', 'Km', 'Eje'))} {_num(r, 0, 999, 3)}"
            for _ in range(r.randint(0, 8))
        ),
    ]


_FRASES_SUELOS = (
    "Se excavaron calicatas a cielo abierto hasta una profundidad de 1.50 m.",
    "El nivel freático no fue encontrado hasta la profundidad explorada.",
    "Se detectó nivel freático a 1.20 m de profundidad en la calicata C-2.",
    "Los ensayos se realizaron según las normas ASTM D2216, D422 y D4318.",
    "El suelo se clasifica como arena limosa (SM) según SUCS.",
    "La capacidad portante admisible es de 1.10 kg/cm2.",
    "Se recomienda el mejoramiento de la subrasante con material de préstamo.",
    "El CBR al 95 % de la máxima densidad seca es de 12 %.",
)


def _suelos(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = (
        [_titulo(r, "Estudio de mecánica de suelos", "Estudio geotécnico", "Informe de suelos")]
        if r.random() < 0.5
        else []
    )
    lineas.append(_parrafo(r, _FRASES_SUELOS, ctx, (2, 5)))
    lineas.append("Calicata Profundidad (m) Humedad (%) LL LP IP SUCS AASHTO")
    for i in range(1, r.randint(2, 6)):
        lineas.append(
            f"C-{i} {_num(r, 0.5, 3)} {_num(r, 2, 25)} {r.choice(('NP', str(r.randint(18, 40))))} "
            f"{r.choice(('NP', str(r.randint(12, 25))))} {r.choice(('NP', str(r.randint(2, 15))))} "
            f"{r.choice(('SM', 'SP', 'SC', 'CL', 'GP', 'SP-SM'))} A-{r.randint(1, 7)}"
        )
    return lineas


def _panel(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = (
        [_titulo(r, "Panel fotográfico", "Panel fotografico de obra", "Registro fotográfico")]
        if r.random() < 0.6
        else []
    )
    for _ in range(r.randint(1, 4)):
        lineas.append(
            f"{r.choice(('FOTO', 'Fotografía', 'Foto N°'))} {r.randint(1, 60)}: "
            f"{r.choice(('Vista de', 'Se observa', 'Trabajos de', 'Estado actual de'))} "
            f"{r.choice(('la calle', 'la excavación', 'el vaciado de concreto', 'la zona de trabajo', 'la vereda', 'el buzón'))} "
            f"{r.choice(_CALLES).lower()}"
        )
    return lineas


def _valorizacion(r: random.Random, ctx: Contexto) -> list[str]:
    numero = r.randint(1, 12)
    lineas = [
        r.choice(
            (
                f"VALORIZACIÓN N° {numero:02d}",
                f"Valorización de obra N° {numero}",
                f"VALORIZACION MENSUAL Nro {numero}",
            )
        ),
        f"MES: {ctx.mes} {ctx.anio}",
        f"CONTRATISTA: {ctx.contratista}",
        r.choice(
            (
                "Item Descripción Und. Metrado contratado Avance anterior Avance actual Acumulado Saldo %",
                "PARTIDA UND PPTO METRADO ANTERIOR ACTUAL ACUMULADO SALDO % AVANCE",
                "Item Descripción Und. P.U. Metrado Anterior Valorizado actual Acumulado",
            )
        ),
    ]
    for item, descripcion, unidad in _filas_partidas(r, ctx, (4, 14)):
        lineas.append(
            f"{item} {descripcion} {unidad} {_num(r, 10, 3000)} {_num(r, 0, 1500)} "
            f"{_num(r, 0, 900)} {_num(r, 0, 3000)} {_num(r, 0, 1500)} {_num(r, 0, 100, 1)}%"
        )
    if r.random() < 0.6:
        lineas += [
            f"MONTO VALORIZADO DEL MES S/ {_num(r, 1e4, 9e5)}",
            f"AVANCE FÍSICO ACUMULADO {_num(r, 1, 100, 1)} %",
            f"AMORTIZACIÓN DE ADELANTO {_num(r, 1e3, 9e4)}",
            "RETENCIÓN DE GARANTÍA",
            r.choice(("Residente de obra", "Supervisor de obra", "V°B° Supervisión")),
        ]
    return lineas


_FRASES_INFORME = (
    "Durante el periodo se ejecutaron trabajos de excavación y vaciado de concreto.",
    "El avance físico acumulado es inferior al programado, generando un atraso de 12 días.",
    "Se anotó en el cuaderno de obra, asiento N° 45, la ocurrencia de lluvias intensas.",
    "La obra se encuentra paralizada desde el {c.mes} por falta de disponibilidad del terreno.",
    "El contratista solicitó ampliación de plazo por causas no atribuibles a su representada.",
    "La supervisión verificó la calidad de los materiales mediante ensayos de laboratorio.",
    "Se presentó un deductivo vinculado a la partida de veredas.",
    "El residente comunicó la presencia de agua subterránea en las excavaciones.",
    "Se recomienda a la entidad aprobar el adicional de obra N° 01.",
    "El personal clave se encuentra en obra según la propuesta técnica.",
    "Al excavar la caja del pavimento apareció agua y el suelo quedó saturado, lo que impide compactar.",
    "El expediente técnico no incluyó partidas de bombeo ni de subdrenaje.",
    "Se recomienda elaborar el expediente técnico del saldo de obra.",
    "La inspección verificó filtraciones en 140 m del tramo intervenido.",
    "El contratista suspendió los trabajos de movimiento de tierras en las cuadras 2 y 3.",
    "La obra tiene un avance físico de 38 % y un avance financiero de 41 %.",
    "Se notificó al contratista la intervención económica de la obra.",
    "La entidad evalúa la resolución del contrato por incumplimiento injustificado.",
    "Se constató que el sardinel no cumple con la sección indicada en los planos.",
)


def _informe(r: random.Random, ctx: Contexto) -> list[str]:
    numero = r.randint(1, 15)
    lineas = (
        [
            r.choice(
                (
                    f"INFORME MENSUAL N° {numero:02d}",
                    f"Informe N° {numero:03d}-{ctx.anio}-SO",
                    f"INFORME DE SUPERVISIÓN N° {numero}",
                    "INFORME DE SITUACIÓN DE OBRA PARALIZADA",
                    f"INFORME DEL RESIDENTE N° {numero}",
                    f"INFORME TÉCNICO N° {numero:03d}-{ctx.anio}-SGO – ESTADO SITUACIONAL DE OBRA",
                    f"INFORME N° {numero:03d}-{ctx.anio}-GDU/SGOP",
                    "INFORME DE PARALIZACIÓN DE OBRA",
                    f"INFORME DE LIQUIDACIÓN DE OBRA N° {numero}",
                )
            )
        ]
        if r.random() < 0.6
        else []
    )
    if r.random() < 0.5:
        lineas += [
            f"A: {ctx.entidad}",
            f"ASUNTO: {r.choice(('Informe mensual de avance', 'Situación de la obra', 'Ampliación de plazo', 'Estado situacional de la obra', 'Informe de paralización', 'Absolución de observaciones del supervisor'))}",
            f"FECHA: {r.randint(1, 28)} de {ctx.mes.lower()} de {ctx.anio}",
        ]
    numerar = r.random() < 0.6
    for n in sorted(r.sample(range(1, 9), k=r.randint(1, 3))):
        titulo = r.choice(
            (
                "ANTECEDENTES",
                "AVANCE FÍSICO",
                "AVANCE FINANCIERO",
                "OCURRENCIAS",
                "CONCLUSIONES",
                "RECOMENDACIONES",
                "PERSONAL Y EQUIPO",
                "ANÁLISIS",
                "CONCLUSIONES Y RECOMENDACIONES",
                "SITUACIÓN ACTUAL",
            )
        )
        lineas.append(f"{n}. {titulo}" if numerar else f"{titulo}:")
        lineas.append(_parrafo(r, _FRASES_INFORME, ctx, (2, 4)))
    return lineas


def _acta(r: random.Random, ctx: Contexto) -> list[str]:
    tipo = r.choice(
        (
            "ACTA DE ENTREGA DE TERRENO",
            "ACTA DE INICIO DE OBRA",
            "ACTA DE RECEPCIÓN DE OBRA",
            "ACTA DE OTORGAMIENTO DE LA BUENA PRO",
            "ACTA DE OBSERVACIONES",
            "ACTA DE CONSTATACIÓN FÍSICA",
        )
    )
    return [
        tipo,
        f"En el distrito de {ctx.distrito}, siendo las {r.randint(8, 17)}:{r.choice(('00', '30'))} horas del día "
        f"{r.randint(1, 28)} de {ctx.mes.lower()} de {ctx.anio}, se reunieron los representantes de la "
        f"{ctx.entidad} y {ctx.contratista}.",
        r.choice(
            (
                "Se procedió a la entrega física del terreno.",
                "Se verificó la culminación de los trabajos.",
                "El comité de selección otorgó la buena pro al postor que obtuvo el mayor puntaje.",
                "Se dejan constancia de las observaciones encontradas.",
            )
        ),
        "En señal de conformidad firman los presentes.",
        r.choice(
            (
                "Presidente del comité",
                "Residente de obra",
                "Supervisor",
                "Representante de la entidad",
            )
        ),
    ]


_FRASES_BASES = (
    "El presente procedimiento de selección se rige por la Ley N° 32069, Ley General de Contrataciones Públicas, y su Reglamento.",
    "Los participantes presentan sus consultas y observaciones a través del SEACE.",
    "El postor debe acreditar una experiencia en obras similares no menor a dos veces el valor referencial.",
    "La oferta se presenta en soles e incluye todos los tributos y seguros.",
    "Los factores de evaluación son el precio y la experiencia del postor en la especialidad.",
    "La garantía de fiel cumplimiento equivale al diez por ciento del monto del contrato.",
    "En el caso de consorcios, el porcentaje mínimo de participación de cada integrante es el indicado en las bases.",
    "El plazo de ejecución de la obra es de {c.mes} días calendario.".replace("{c.mes}", "120"),
    "El comité de selección evalúa las ofertas conforme a los requisitos de calificación.",
    "Las bases integradas incorporan las modificaciones producto de la absolución de consultas.",
)


def _bases(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = []
    if r.random() < 0.3:
        lineas += [
            r.choice(("BASES INTEGRADAS", "BASES ESTÁNDAR", "BASES")),
            f"{r.choice(('LICITACIÓN PÚBLICA', 'LICITACIÓN PÚBLICA ABREVIADA', 'ADJUDICACIÓN SIMPLIFICADA'))} N° {ctx.proceso}",
        ]
    lineas.append(
        r.choice(
            (
                "CAPÍTULO I",
                "CAPÍTULO II",
                "CAPÍTULO III",
                "SECCIÓN ESPECÍFICA",
                "SECCIÓN GENERAL",
                "ANEXO N° 5",
            )
        )
    )
    lineas.append(
        r.choice(
            (
                "GENERALIDADES",
                "DEL PROCEDIMIENTO DE SELECCIÓN",
                "REQUISITOS DE CALIFICACIÓN",
                "FACTORES DE EVALUACIÓN",
                "PROFORMA DEL CONTRATO",
                "DECLARACIÓN JURADA",
            )
        )
    )
    lineas.append(_parrafo(r, _FRASES_BASES, ctx, (2, 5)))
    return lineas


_FRASES_TDR = (
    "El consultor elaborará el expediente técnico conforme a la normativa vigente.",
    "El plazo de ejecución del servicio es de 60 días calendario.",
    "Perfil del profesional: ingeniero civil colegiado y habilitado con experiencia mínima de tres años.",
    "Entregables: primer entregable a los 20 días, segundo entregable a los 45 días.",
    "La forma de pago será en armadas, previa conformidad del área usuaria.",
    "Se aplicará una penalidad por cada día de atraso en la entrega.",
    "El servicio incluye el levantamiento topográfico y el estudio de mecánica de suelos.",
    "La finalidad pública es mejorar las condiciones de transitabilidad de la población.",
    "• Elaborar el expediente técnico de obra con entregables que permitan iniciar la ejecución por tramos.",
    "• Obtener los permisos, licencias y factibilidades de servicios necesarios para la ejecución.",
    "• Usar la metodología BIM como herramienta de trabajo colaborativo.",
    "El objetivo general de la presente contratación es {c.obra}.",
    "El proyecto se ejecutará mediante la modalidad de diseño y construcción.",
    "El área usuaria otorgará la conformidad en un plazo máximo de siete días.",
    "El contratista deberá contar con el siguiente personal clave: jefe de proyecto, especialista en estructuras y especialista en costos.",
    "Los entregables se presentarán en físico y en digital, firmados por los especialistas.",
)


def _tdr(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = (
        [
            r.choice(
                (
                    "TÉRMINOS DE REFERENCIA",
                    "TDR",
                    "TERMINOS DE REFERENCIA PARA LA CONTRATACIÓN DEL SERVICIO DE CONSULTORÍA",
                )
            )
        ]
        if r.random() < 0.5
        else []
    )
    for n in sorted(r.sample(range(1, 15), k=r.randint(2, 4))):
        lineas.append(
            f"{n}. {r.choice(('OBJETO', 'FINALIDAD PÚBLICA', 'ALCANCES DEL SERVICIO', 'PERFIL DEL CONSULTOR', 'ENTREGABLES', 'FORMA DE PAGO', 'PENALIDADES', 'PLAZO', 'OBJETIVO GENERAL', 'OBJETIVOS ESPECÍFICOS', 'DESCRIPCIÓN Y ALCANCE DEL PROYECTO', 'REQUISITOS DEL PERSONAL CLAVE', 'CONFORMIDAD'))}:"
        )
        lineas.append(_parrafo(r, _FRASES_TDR, ctx, (1, 3)))
    return lineas


def _absolucion(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = (
        [
            r.choice(
                (
                    "PLIEGO ABSOLUTORIO DE CONSULTAS Y OBSERVACIONES",
                    "CUADRO DE ABSOLUCIÓN DE CONSULTAS",
                    "Absolución de consultas y observaciones",
                )
            )
        ]
        if r.random() < 0.5
        else []
    )
    for _ in range(r.randint(1, 3)):
        lineas += [
            f"{r.choice(('Consulta', 'Observación', 'CONSULTA'))} N° {r.randint(1, 60)}",
            f"Participante: {ctx.contratista}",
            r.choice(
                (
                    "Se solicita precisar el porcentaje mínimo de participación en consorcio.",
                    "Solicitamos aclarar si la experiencia en obras de saneamiento es similar.",
                    "Se observa que el plazo es insuficiente para la magnitud de la obra.",
                )
            ),
            f"{r.choice(('Absolución', 'Respuesta del comité', 'ABSOLUCIÓN'))}: "
            + r.choice(
                ("Se acoge la consulta.", "No se acoge.", "Se precisa en las bases integradas.")
            ),
            "Análisis respecto de la consulta u observación",
        ]
    return lineas


def _contrato(r: random.Random, ctx: Contexto) -> list[str]:
    clausulas = r.sample(
        (
            "PRIMERA: ANTECEDENTES",
            "SEGUNDA: OBJETO",
            "TERCERA: MONTO CONTRACTUAL",
            "CUARTA: DEL PAGO",
            "QUINTA: PLAZO DE EJECUCIÓN",
            "SEXTA: GARANTÍAS",
            "SÉPTIMA: PENALIDADES",
            "OCTAVA: RESOLUCIÓN DEL CONTRATO",
            "NOVENA: SOLUCIÓN DE CONTROVERSIAS",
        ),
        k=r.randint(2, 4),
    )
    lineas = (
        [f"CONTRATO N° {r.randint(1, 90):03d}-{ctx.anio}-{ctx.entidad.split()[-1][:6]}"]
        if r.random() < 0.4
        else []
    )
    for c in clausulas:
        lineas.append(f"CLÁUSULA {c}")
        lineas.append(
            r.choice(
                (
                    f"Conste por el presente documento la contratación de la ejecución de la obra {ctx.obra[:80]}, que celebra de una parte {ctx.entidad} y de otra parte {ctx.contratista}.",
                    "EL CONTRATISTA entrega al perfeccionamiento del contrato la garantía de fiel cumplimiento.",
                    "En caso de retraso injustificado, LA ENTIDAD aplica una penalidad por cada día de atraso.",
                    "LA ENTIDAD se obliga a pagar la contraprestación en soles, en pagos periódicos, conforme a las valorizaciones.",
                )
            )
        )
    return lineas


def _gastos_generales(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = [
        r.choice(
            (
                "DESAGREGADO DE GASTOS GENERALES",
                "Gastos generales fijos y variables",
                "DETALLE DE GASTOS GENERALES",
            )
        ),
        r.choice(
            (
                "Descripción Unidad Cantidad Tiempo (meses) Precio S/ Parcial S/",
                "CONCEPTO UND CANT. MESES P.U. PARCIAL",
            )
        ),
    ]
    conceptos = (
        "Residente de obra",
        "Asistente técnico",
        "Prevencionista de seguridad",
        "Especialista ambiental",
        "Gastos de licitación y contrato",
        "Seguros, fianzas y gastos financieros",
        "Camioneta 4x4",
        "Ensayos de laboratorio",
        "Útiles de oficina",
        "Almacenero",
        "Guardianía",
        "Pruebas de calidad",
    )
    for concepto in r.sample(conceptos, k=r.randint(4, 9)):
        lineas.append(
            f"{concepto} {r.choice(('mes', 'glb', 'und'))} {_num(r, 0.2, 2)} {_num(r, 1, 6)} {_num(r, 300, 12000)} {_num(r, 300, 40000)}"
        )
    lineas.append(f"TOTAL GASTOS GENERALES {_num(r, 1e4, 3e5)}")
    if r.random() < 0.5:
        lineas.append(f"Porcentaje respecto al costo directo {_num(r, 6, 15)} %")
    return lineas


def _relacion_insumos(r: random.Random, ctx: Contexto) -> list[str]:
    lineas = [
        r.choice(
            (
                "Precios y cantidades de recursos requeridos por tipo",
                "RELACIÓN DE INSUMOS",
                "Listado de insumos del presupuesto",
            )
        ),
        "Código Recurso Unidad Cantidad Precio S/. Parcial S/.",
    ]
    for grupo in r.sample(
        ("MANO DE OBRA", "MATERIALES", "EQUIPOS", "SUBCONTRATOS"), k=r.randint(1, 3)
    ):
        lineas.append(grupo)
        for recurso, und, precio in r.sample(_RECURSOS, k=r.randint(3, 8)):
            lineas.append(
                f"{r.randint(1000000, 9999999)} {recurso} {und} {_num(r, 1, 5000)} {precio or _num(r, 1, 50)} {_num(r, 10, 90000)}"
            )
        lineas.append(f"Total {grupo.lower()} {_num(r, 1e3, 9e5)}")
    return lineas


GENERADORES: dict[str, Callable[[random.Random, Contexto], list[str]]] = {
    "gastos_generales": _gastos_generales,
    "cotizacion": _cotizacion,
    "relacion_insumos": _relacion_insumos,
    "caratula": _caratula,
    "indice": _indice,
    "memoria_descriptiva": _memoria,
    "especificaciones_tecnicas": _especificaciones,
    "metrados": _metrados,
    "presupuesto": _presupuesto,
    "analisis_costos_unitarios": _acu,
    "formula_polinomica": _formula,
    "cronograma": _cronograma,
    "planos": _planos,
    "estudio_suelos": _suelos,
    "panel_fotografico": _panel,
    "valorizacion": _valorizacion,
    "informe_obra": _informe,
    "acta": _acta,
    "bases": _bases,
    "tdr": _tdr,
    "absolucion_consultas": _absolucion,
    "contrato": _contrato,
}

# ---------- Ruido ----------

_CONFUSIONES = (
    ("o", "0"),
    ("l", "1"),
    ("i", "l"),
    ("rn", "m"),
    ("e", "c"),
    ("a", "o"),
    ("S", "5"),
    ("B", "8"),
    ("ó", "o"),
    ("í", "i"),
    ("á", "a"),
    ("é", "e"),
    ("ñ", "n"),
)


def ruido_ocr(texto: str, r: random.Random, intensidad: float) -> str:
    """Imita lo que deja un OCR sobre un escaneo malo: letras confundidas, cortes y basura."""
    caracteres = list(texto)
    for i, c in enumerate(caracteres):
        if r.random() < intensidad * 0.08:
            for a, b in _CONFUSIONES:
                if c == a[0]:
                    caracteres[i] = b
                    break
        elif r.random() < intensidad * 0.02:
            caracteres[i] = r.choice((" ", "", "|", ".", "'"))
    salida = "".join(caracteres)
    if r.random() < intensidad:
        salida = salida.replace("\n", " ") if r.random() < 0.5 else salida
    if r.random() < intensidad * 0.5:
        salida += "\n" + "".join(r.choice("|_-.,;:'\"~") for _ in range(r.randint(3, 25)))
    return salida


_TOKEN = re.compile(r"[\d.,/%:-]+|[^\d\s][^\s]*(?: [^\d\s][^\s]*)*")


def _celdas_por_linea(texto: str) -> str:
    """Así extraen muchos PDF las tablas: cada celda en su propia línea."""
    salida: list[str] = []
    for linea in texto.splitlines():
        if sum(ch.isdigit() for ch in linea) >= 6:
            salida.extend(t.strip() for t in _TOKEN.findall(linea) if t.strip())
        else:
            salida.append(linea)
    return "\n".join(salida)


def pagina(parte: str, r: random.Random, ctx: Contexto, numero: int) -> str:
    lineas = _encabezado(r, ctx, numero) + GENERADORES[parte](r, ctx)
    if r.random() < 0.15:
        # Un poco de texto de otra parte (una nota, un pie) para que no baste con una palabra.
        otra = r.choice(list(GENERADORES))
        lineas += GENERADORES[otra](r, ctx)[:1]
    texto = "\n".join(lineas)
    if r.random() < 0.3:
        texto = _celdas_por_linea(texto)
    if r.random() < 0.3:
        texto = texto.lower() if r.random() < 0.3 else texto
    if r.random() < 0.35:
        texto = ruido_ocr(texto, r, r.uniform(0.2, 1.0))
    return texto


def documento(
    tipo: str, r: random.Random, v: Vocabulario, max_paginas: int = 150
) -> list[tuple[str, str]]:
    """Devuelve (parte, texto) por página para un documento sintético del tipo pedido."""
    receta = RECETAS[tipo]
    ctx = Contexto.nuevo(r, v)
    tramos = [t for t in receta.tramos if r.random() < t.probabilidad]
    if len(tramos) > 3 and r.random() < receta.por_volumenes:
        # Un expediente grande se entrega por tomos: llega solo un tramo seguido de partes.
        inicio = r.randint(0, len(tramos) - 3)
        tramos = tramos[inicio : inicio + r.randint(3, len(tramos) - inicio)]
    if r.random() < receta.desordenar:
        cabeza = [t for t in tramos if t.parte in {"caratula", "indice"}]
        cuerpo = [t for t in tramos if t.parte not in {"caratula", "indice"}]
        r.shuffle(cuerpo)
        tramos = cabeza + cuerpo
    paginas: list[tuple[str, str]] = []
    for tramo in tramos:
        for _ in range(r.randint(tramo.minimo, tramo.maximo)):
            if len(paginas) >= max_paginas:
                return paginas
            paginas.append((tramo.parte, pagina(tramo.parte, r, ctx, len(paginas) + 1)))
    return paginas
