import threading

# PDFium no es seguro entre hilos: todo uso de pypdfium2 del proceso pasa por este candado.
# Es un recurso del proceso entero (como la biblioteca nativa), por eso vive a nivel de módulo.
CANDADO_PDFIUM = threading.Lock()
