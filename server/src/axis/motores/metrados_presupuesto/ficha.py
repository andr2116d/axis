from axis.compartido.dominio.motores import FichaMotor
from axis.compartido.dominio.valores import Fase

ID_MOTOR = "metrados_presupuesto"
# Es una verificación de coherencia: no se entrena. Sube cuando cambia la lógica.
VERSION = "coherencia-2"


def ficha() -> FichaMotor:
    return FichaMotor(
        id=ID_MOTOR,
        version=VERSION,
        nombre="Metrados contra presupuesto",
        que_detecta=(
            "Partidas cuya cantidad en el presupuesto no coincide con la de la planilla de "
            "metrados, y partidas del presupuesto que no tienen metrado que las sustente."
        ),
        fases=frozenset({Fase.EXPEDIENTE}),
        partes_requeridas=frozenset({"metrados", "presupuesto"}),
        aprende_de="No aprende: compara dos partes del mismo expediente.",
    )
