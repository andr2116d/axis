"""Puentes entre contextos. Los contextos no se importan entre sí: solo `arranque` los conecta."""

from uuid import UUID

from axis.compartido.dominio.motores import EntradaMotor, PartidaUbicada
from axis.compartido.dominio.valores import Fase
from axis.documentos.aplicacion.puertos import RepositorioDocumentos
from axis.documentos.dominio.valores import IdDocumento
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
            partidas=tuple(PartidaUbicada(p, tipos.get(p.pagina)) for p in documento.partidas),
        )
