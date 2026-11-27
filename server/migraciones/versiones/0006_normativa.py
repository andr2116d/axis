"""normas indexadas por artículo, con búsqueda de texto completo, y respuestas del lector

Revision ID: 0006
Revises: 0005
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR

revision = "0006"
down_revision = "0005"


def upgrade() -> None:
    op.create_table(
        "normas",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("nombre", sa.Text, nullable=False),
        sa.Column("tipo", sa.Text, nullable=False),
        sa.Column("vigente_al", sa.Text, nullable=False),
        # Cambia si cambia el texto: con ella se invalidan las respuestas guardadas.
        sa.Column("huella", sa.Text, nullable=False),
    )
    op.create_table(
        "fragmentos_norma",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column(
            "norma_id", sa.Text, sa.ForeignKey("normas.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("clave", sa.Text, nullable=False),
        sa.Column("etiqueta", sa.Text, nullable=False),
        sa.Column("titulo", sa.Text, nullable=False),
        sa.Column("texto", sa.Text, nullable=False),
        sa.Column("ubicacion", JSONB, nullable=False),
        sa.Column("orden", sa.Integer, nullable=False),
        # Sin tildes y en minúsculas (lo hace la API): "contratacion" encuentra "Contratación".
        sa.Column("texto_busqueda", sa.Text, nullable=False),
        sa.Column(
            "busqueda",
            TSVECTOR,
            sa.Computed("to_tsvector('spanish', texto_busqueda)", persisted=True),
        ),
    )
    op.create_index(
        "ix_fragmentos_busqueda", "fragmentos_norma", ["busqueda"], postgresql_using="gin"
    )
    # El lector recibe las leyes enteras en orden: es el texto que se guarda en caché.
    op.create_index("ix_fragmentos_norma_orden", "fragmentos_norma", ["norma_id", "orden"])
    op.create_table(
        "respuestas_normativa",
        sa.Column("clave", sa.Text, primary_key=True),
        sa.Column("respuesta", JSONB, nullable=False),
        sa.Column(
            "creada_en", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    op.drop_table("respuestas_normativa")
    op.drop_table("fragmentos_norma")
    op.drop_table("normas")
