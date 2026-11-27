from axis.compartido.dominio.errores import ErrorAxis


class ErrorOrquestador(ErrorAxis): ...


class FuenteNoEncontrada(ErrorOrquestador):
    """El documento o expediente a evaluar no existe."""
