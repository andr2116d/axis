from axis.compartido.dominio.errores import ErrorAxis


class ErrorDocumentos(ErrorAxis): ...


class ArchivoVacio(ErrorDocumentos): ...


class ArchivoNoSoportado(ErrorDocumentos): ...


class ArchivoIlegible(ErrorDocumentos): ...


class ArchivoDemasiadoGrande(ErrorDocumentos): ...


class DocumentoNoEncontrado(ErrorDocumentos): ...


class PaginaNoEncontrada(ErrorDocumentos): ...


class EtiquetaInvalida(ErrorDocumentos): ...


class ModelosNoDisponibles(ErrorDocumentos):
    """Todavía no hay una versión entrenada de los modelos de documentos."""
