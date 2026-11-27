import structlog

from axis.compartido.dominio.motores import Motor
from axis.compartido.infraestructura.registro_artefactos import RegistroArtefactos
from axis.compartido.infraestructura.s3 import ClienteS3
from axis.motores.catalogo import CATALOGO

log = structlog.get_logger()


class CatalogoRecargable:
    """Tiene cargada la versión vigente de cada motor y la cambia sin reiniciar la API."""

    def __init__(self, s3: ClienteS3, bucket: str) -> None:
        self._entradas = [(e, RegistroArtefactos(s3, bucket, e.prefijo)) for e in CATALOGO]
        self._cargados: dict[str, tuple[str, Motor]] = {}

    def motores(self) -> list[Motor]:
        return [m for _, m in self._cargados.values()]

    async def refrescar(self) -> None:
        for entrada, registro in self._entradas:
            puntero = await registro.puntero()
            if puntero is None:
                continue  # el motor todavía no tiene una versión entrenada
            actual = self._cargados.get(entrada.prefijo)
            if actual is not None and actual[0] == puntero["version"]:
                continue
            motor = entrada.cargar(await registro.cargar(puntero))
            self._cargados[entrada.prefijo] = (puntero["version"], motor)
            log.info("motor_cargado", motor=motor.ficha.id, version=puntero["version"])
