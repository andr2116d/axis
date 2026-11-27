from axis.compartido.dominio.errores import ErrorAxis


class ErrorExpediente(ErrorAxis): ...


class ExpedienteNoEncontrado(ErrorExpediente): ...


class DocumentoNoEncontrado(ErrorExpediente): ...


class DocumentoYaAdjunto(ErrorExpediente): ...


class ExpedienteSinDocumentos(ErrorExpediente):
    """No hay nada que evaluar todavía."""
