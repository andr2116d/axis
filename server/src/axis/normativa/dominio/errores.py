from axis.compartido.dominio.errores import ErrorAxis


class ErrorNormativa(ErrorAxis): ...


class FragmentoNoEncontrado(ErrorNormativa): ...


class NormaSinFragmentos(ErrorNormativa):
    """El texto no tiene la estructura de artículos que se esperaba: no se indexa a medias."""


class ConsultaVacia(ErrorNormativa): ...


class LectorNoDisponible(ErrorNormativa):
    """El modelo que lee la norma no respondió; se cae a la búsqueda por palabras."""
