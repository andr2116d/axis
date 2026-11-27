from axis.normativa.aplicacion.dto import ResumenNorma
from axis.normativa.aplicacion.puertos import RepositorioNormativa
from axis.normativa.dominio.errores import FragmentoNoEncontrado
from axis.normativa.dominio.valores import Fragmento


class ConsultarNormas:
    """Qué normas están indexadas y el texto completo de un fragmento citado."""

    def __init__(self, *, repositorio: RepositorioNormativa) -> None:
        self._repositorio = repositorio

    async def normas(self) -> tuple[ResumenNorma, ...]:
        return await self._repositorio.normas()

    async def fragmento(self, id_fragmento: str) -> Fragmento:
        fragmento = await self._repositorio.obtener(id_fragmento)
        if fragmento is None:
            raise FragmentoNoEncontrado(f"no existe el fragmento {id_fragmento}")
        return fragmento
