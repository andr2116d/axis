import hashlib
import time
from collections.abc import Mapping, Sequence

import structlog

from axis.normativa.aplicacion.dto import CitaPropuesta, ConsultaLector, OrdenCitar
from axis.normativa.aplicacion.puertos import (
    CacheRespuestas,
    LectorNormativa,
    RepositorioNormativa,
)
from axis.normativa.dominio.errores import ConsultaVacia, LectorNoDisponible
from axis.normativa.dominio.servicios import es_extracto_literal, parrafo_mas_cercano
from axis.normativa.dominio.valores import (
    Cita,
    Fragmento,
    OrigenCita,
    Pertinencia,
    RespuestaNormativa,
    TipoNorma,
)

log = structlog.get_logger()

# Del reglamento (y de lo que no es ley) el lector recibe estos candidatos, no el texto entero.
CANDIDATOS = 14
# Sin lector, se muestran pocas coincidencias: son una pista, no una respuesta.
CITAS_POR_BUSQUEDA = 3
_RAZON_BUSQUEDA = (
    "Coincide en palabras con el caso. Ningún modelo lo leyó todavía: revísalo antes de citarlo."
)


class CitarNormativa:
    """Encuentra los artículos que aplican a un caso y los cita con un extracto literal.

    Las leyes se leen enteras; del reglamento, solo los candidatos de la búsqueda. Cada cita
    del lector se verifica contra el texto oficial: si el fragmento no existe o el extracto no
    está tal cual, la cita no sale. Si el lector no responde, se dicen las coincidencias por
    palabras, marcadas como tales.
    """

    def __init__(
        self,
        *,
        repositorio: RepositorioNormativa,
        lector: LectorNormativa | None,
        cache: CacheRespuestas,
    ) -> None:
        self._repositorio = repositorio
        self._lector = lector
        self._cache = cache

    async def ejecutar(self, orden: OrdenCitar) -> RespuestaNormativa:
        if not orden.pregunta.strip():
            raise ConsultaVacia("la consulta está vacía")
        inicio = time.perf_counter()
        clave = await self._clave(orden)
        guardada = await self._cache.obtener(clave)
        if guardada is not None:
            return RespuestaNormativa(
                guardada.citas,
                guardada.origen,
                guardada.lector,
                guardada.descartadas,
                _ms(inicio),
                desde_cache=True,
            )
        consulta = await self._consulta(orden)
        respuesta = await self._responder(orden, consulta, inicio)
        if respuesta.origen is OrigenCita.LECTOR:
            await self._cache.guardar(clave, respuesta)
        log.info(
            "normativa_citada",
            origen=respuesta.origen,
            citas=len(respuesta.citas),
            descartadas=respuesta.descartadas,
            ms=respuesta.duracion_ms,
        )
        return respuesta

    async def _clave(self, orden: OrdenCitar) -> str:
        lector = self._lector.nombre if self._lector else "sin_lector"
        version = await self._repositorio.version()
        base = "|".join(
            (
                lector,
                version,
                orden.pregunta.strip(),
                (orden.contexto or "").strip(),
                str(orden.maximo_citas),
            )
        )
        return hashlib.sha256(base.encode()).hexdigest()

    async def _consulta(self, orden: OrdenCitar) -> ConsultaLector:
        leyes = await self._repositorio.fragmentos_de_tipo(TipoNorma.LEY)
        texto = f"{orden.pregunta}\n{orden.contexto or ''}"
        candidatos = await self._repositorio.buscar(
            texto, excluir=frozenset({TipoNorma.LEY}), limite=CANDIDATOS
        )
        nombres = {r.norma.id: r.norma.nombre for r in await self._repositorio.normas()}
        return ConsultaLector(
            orden.pregunta, orden.contexto, leyes, nombres, candidatos, orden.maximo_citas
        )

    async def _responder(
        self, orden: OrdenCitar, consulta: ConsultaLector, inicio: float
    ) -> RespuestaNormativa:
        if self._lector is not None:
            try:
                propuestas = await self._lector.leer(consulta)
            except LectorNoDisponible as error:
                log.warning("lector_normativa_no_disponible", razon=str(error))
            else:
                citas, descartadas = verificar(propuestas, consulta)
                return RespuestaNormativa(
                    citas[: orden.maximo_citas],
                    OrigenCita.LECTOR,
                    self._lector.nombre,
                    descartadas,
                    _ms(inicio),
                )
        return RespuestaNormativa(
            await self._por_busqueda(orden), OrigenCita.BUSQUEDA, None, 0, _ms(inicio)
        )

    async def _por_busqueda(self, orden: OrdenCitar) -> tuple[Cita, ...]:
        texto = f"{orden.pregunta}\n{orden.contexto or ''}"
        encontrados = await self._repositorio.buscar(
            texto, excluir=frozenset(), limite=CITAS_POR_BUSQUEDA
        )
        nombres = {r.norma.id: r.norma.nombre for r in await self._repositorio.normas()}
        return tuple(
            Cita(
                fragmento=f,
                nombre_norma=nombres.get(f.id_norma, f.id_norma),
                extracto=parrafo_mas_cercano(f.texto, texto),
                razon=_RAZON_BUSQUEDA,
                pertinencia=Pertinencia.MEDIA,
                origen=OrigenCita.BUSQUEDA,
            )
            for f in encontrados
        )


def verificar(
    propuestas: Sequence[CitaPropuesta], consulta: ConsultaLector
) -> tuple[tuple[Cita, ...], int]:
    """Deja solo las citas cuyo fragmento se le dio al lector y cuyo extracto es literal."""
    conocidos: Mapping[str, Fragmento] = {f.id: f for f in (*consulta.leyes, *consulta.candidatos)}
    citas: list[Cita] = []
    vistos: set[str] = set()
    for propuesta in propuestas:
        fragmento = conocidos.get(propuesta.id_fragmento)
        if (
            fragmento is None
            or fragmento.id in vistos
            or not es_extracto_literal(propuesta.extracto, fragmento.texto)
        ):
            continue
        vistos.add(fragmento.id)
        citas.append(
            Cita(
                fragmento=fragmento,
                nombre_norma=consulta.nombres.get(fragmento.id_norma, fragmento.id_norma),
                extracto=propuesta.extracto.strip(),
                razon=propuesta.razon.strip(),
                pertinencia=propuesta.pertinencia,
                origen=OrigenCita.LECTOR,
            )
        )
    citas.sort(key=lambda c: c.pertinencia is not Pertinencia.ALTA)
    return tuple(citas), len(propuestas) - len(citas)


def _ms(inicio: float) -> int:
    return round((time.perf_counter() - inicio) * 1000)
