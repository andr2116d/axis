# Una sola imagen para API, migraciones y entrenamiento: en AWS se sube a ECR y cada
# servicio de ECS cambia solo el comando.

FROM ghcr.io/astral-sh/uv:0.13.1 AS uv

FROM python:3.13-slim AS dependencias
COPY --from=uv /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never
WORKDIR /app
# Primero solo las dependencias: esta capa se reutiliza mientras no cambie uv.lock.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.13-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --create-home --uid 10001 axis
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    # Tesseract usa un hilo por proceso: el paralelismo lo maneja Axis, página por página.
    OMP_THREAD_LIMIT=1
WORKDIR /app
COPY --from=dependencias /app /app
COPY alembic.ini ./
COPY migraciones ./migraciones
COPY herramientas ./herramientas
USER axis
EXPOSE 8000
CMD ["granian", "--interface", "asgi", "--factory", "--host", "0.0.0.0", "--port", "8000", \
     "--workers", "2", "--loop", "uvloop", "axis.arranque.api:create_app"]
