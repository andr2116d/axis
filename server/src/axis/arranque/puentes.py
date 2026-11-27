"""Puentes entre contextos. Los contextos no se importan entre sí: solo `arranque` los conecta."""

from collections.abc import Mapping, Sequence
from uuid import UUID

from axis.compartido.dominio.motores import EntradaMotor, PartidaUbicada, ResultadoMotor
from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.puertos import RepositorioDocumentos
from axis.documentos.dominio.valores import IdDocumento
from axis.expediente.aplicacion.dto import ResultadoDeMotores, ResumenDocumento
from axis.expediente.dominio.entidades import Expediente, OmisionMotor, Seccion
from axis.orquestador.aplicacion.casos_de_uso.evaluar import EvaluarEntrada
from axis.orquestador.aplicacion.puertos import CatalogoMotores
from axis.orquestador.dominio.errores import FuenteNoEncontrada


class EntradasDesdeDocumentos:
    """Arma lo que leen los motores a partir de un documento ya analizado."""

    def __init__(self, documentos: RepositorioDocumentos) -> None:
        self._documentos = documentos

    async def de_documento(
        self, id_documento: str, fase: Fase | None, tipologia: str | None
    ) -> EntradaMotor:
        try:
            documento = await self._documentos.obtener(IdDocumento(UUID(id_documento)))
        except ValueError as error:
            raise FuenteNoEncontrada(f"«{id_documento}» no es un id de documento") from error
        if documento is None:
            raise FuenteNoEncontrada(f"no existe el documento {id_documento}")
        tipos = {
            p.numero: p.clasificacion.etiqueta if p.clasificacion else None
            for p in documento.paginas
        }
        return EntradaMotor(
            id_fuente=id_documento,
            fase=fase or documento.fase_subida,
            tipologia=tipologia,
            partes_presentes=frozenset(p.etiqueta for p in documento.partes),
            partidas=tuple(
                PartidaUbicada(p, tipos.get(p.pagina), id_documento) for p in documento.partidas
            ),
            firmas={p.etiqueta: documento.hash_contenido for p in documento.partes},
        )


class ResumenesDesdeDocumentos:
    """Lo que el expediente necesita saber de un documento ya analizado."""

    def __init__(self, documentos: RepositorioDocumentos) -> None:
        self._documentos = documentos

    async def resumen(self, id_documento: str) -> ResumenDocumento | None:
        try:
            documento = await self._documentos.obtener(IdDocumento(UUID(id_documento)))
        except ValueError:
            return None
        if documento is None:
            return None
        partes = tuple(dict.fromkeys(p.etiqueta for p in documento.partes))
        return ResumenDocumento(
            str(documento.id), documento.nombre_original, documento.tipo.etiqueta, partes
        )


class EvaluadorDesdeOrquestador:
    """Arma la entrada de los motores con las secciones vigentes y se la pasa al orquestador."""

    def __init__(
        self, documentos: RepositorioDocumentos, evaluar: EvaluarEntrada, catalogo: CatalogoMotores
    ) -> None:
        self._documentos = documentos
        self._evaluar = evaluar
        self._catalogo = catalogo

    async def evaluar(
        self,
        expediente: Expediente,
        secciones: Sequence[Seccion],
        previos: Mapping[str, ResultadoMotor],
    ) -> ResultadoDeMotores:
        entrada = await self._entrada(expediente, secciones)
        evaluacion = await self._evaluar.ejecutar(entrada, previos)
        fichas = {m.ficha.id: m.ficha for m in self._catalogo.motores()}
        revisadas = frozenset(
            parte
            for id_motor in evaluacion.plan.motores
            for parte in (fichas[id_motor].partes_requeridas if id_motor in fichas else ())
        )
        return ResultadoDeMotores(
            resultados=evaluacion.resultados,
            omitidos=tuple(
                OmisionMotor(o.id_motor, o.nombre, o.razon, o.faltan)
                for o in evaluacion.plan.omisiones
            ),
            fallas=tuple((f.id_motor, f.razon) for f in evaluacion.fallas),
            secciones_revisadas=revisadas,
            duracion_ms=evaluacion.duracion_ms,
        )

    async def _entrada(self, expediente: Expediente, secciones: Sequence[Seccion]) -> EntradaMotor:
        # Cada sección se lee del documento que la trae hoy, y solo de sus páginas.
        documentos = {}
        for id_documento in {s.id_documento for s in secciones}:
            documento = await self._documentos.obtener(IdDocumento(UUID(id_documento)))
            if documento is not None:
                documentos[id_documento] = documento
        partidas: list[PartidaUbicada] = []
        for seccion in secciones:
            documento = documentos.get(seccion.id_documento)
            if documento is None:
                continue
            paginas = {
                p.numero
                for p in documento.paginas
                if p.clasificacion is not None and p.clasificacion.etiqueta == seccion.etiqueta
            }
            partidas.extend(
                PartidaUbicada(p, seccion.etiqueta, seccion.id_documento)
                for p in documento.partidas
                if p.pagina in paginas
            )
        return EntradaMotor(
            id_fuente=str(expediente.id),
            fase=Fase.EXPEDIENTE,
            tipologia=expediente.tipologia,
            partes_presentes=frozenset(s.etiqueta for s in secciones),
            partidas=tuple(partidas),
            firmas={s.etiqueta: s.id_documento for s in secciones},
        )
