import time

import structlog

from axis.compartido.dominio.motores import Severidad
from axis.compartido.dominio.reloj import Reloj
from axis.seleccion.aplicacion.dto import OrdenRevisarProceso, RevisionPostor, RevisionProceso
from axis.seleccion.aplicacion.puertos import RegistroAntecedentes, RepositorioProcesos
from axis.seleccion.dominio.errores import ProcesoNoEncontrado
from axis.seleccion.dominio.servicios import revisar_postor

log = structlog.get_logger()


class RevisarProceso:
    """Revisa el historial público de todos los postores de un procedimiento de selección."""

    def __init__(
        self,
        *,
        procesos: RepositorioProcesos,
        antecedentes: RegistroAntecedentes,
        reloj: Reloj,
    ) -> None:
        self._procesos = procesos
        self._antecedentes = antecedentes
        self._reloj = reloj

    async def ejecutar(self, orden: OrdenRevisarProceso) -> RevisionProceso:
        inicio = time.perf_counter()
        proceso = await self._procesos.obtener(orden.id_proceso)
        if proceso is None:
            raise ProcesoNoEncontrado(f"no existe el proceso {orden.id_proceso}")
        dia = orden.al_dia or proceso.convocatoria or self._reloj.ahora().date()
        con_ruc = [p.identificador for p in proceso.postores if p.tiene_ruc]
        registros = await self._antecedentes.de(con_ruc)
        fuente = await self._antecedentes.fuente()
        revisiones = tuple(
            RevisionPostor(
                p,
                revisar_postor(proceso, p, registros.get(p.identificador, ()), fuente, dia)
                if p.tiene_ruc
                else (),
                p.tiene_ruc,
            )
            for p in proceso.postores
        )
        # Primero los ganadores y los que tienen alertas rojas: es lo que el comité mira primero.
        ordenadas = tuple(
            sorted(
                revisiones,
                key=lambda r: (
                    not r.postor.ganador,
                    not any(h.severidad is Severidad.ROJO for h in r.hallazgos),
                    -len(r.hallazgos),
                ),
            )
        )
        ms = round((time.perf_counter() - inicio) * 1000)
        log.info("proceso_revisado", postores=len(revisiones), ms=ms)
        return RevisionProceso(proceso, dia, fuente, ordenadas, ms)
