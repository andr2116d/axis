from axis.compartido.dominio.motores import FichaMotor
from axis.compartido.dominio.valores import Fase

ID_MOTOR = "precio_atipico"


def ficha(version: str) -> FichaMotor:
    return FichaMotor(
        id=ID_MOTOR,
        version=version,
        nombre="Precio unitario atípico",
        que_detecta=(
            "Partidas cuyo precio unitario se aleja de lo que cuestan partidas parecidas, con la "
            "misma unidad, en presupuestos reales de La Libertad."
        ),
        fases=frozenset({Fase.EXPEDIENTE, Fase.SELECCION}),
        partes_requeridas=frozenset({"presupuesto"}),
        aprende_de="Precios de presupuestos publicados en SEACE (solo filas que cuadran).",
    )
