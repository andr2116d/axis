"""correcciones del evaluador y fuente de cada clasificación

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"


def upgrade() -> None:
    op.create_table(
        "correcciones",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("hash_contenido", sa.Text, nullable=False),
        sa.Column("pagina", sa.Integer),
        sa.Column("etiqueta_anterior", sa.Text),
        sa.Column("etiqueta", sa.Text, nullable=False),
        sa.Column("fase", sa.Text),
        sa.Column("version_modelos", sa.Text, nullable=False),
        sa.Column("corregido_en", sa.DateTime(timezone=True), nullable=False),
    )
    # Se buscan siempre por archivo: al analizarlo, al corregirlo y al entrenar.
    op.create_index("ix_correcciones_hash", "correcciones", ["hash_contenido", "corregido_en"])
    op.add_column("paginas", sa.Column("fuente", sa.Text, nullable=False, server_default="modelo"))
    op.add_column(
        "documentos", sa.Column("tipo_fuente", sa.Text, nullable=False, server_default="modelo")
    )


def downgrade() -> None:
    op.drop_column("documentos", "tipo_fuente")
    op.drop_column("paginas", "fuente")
    op.drop_table("correcciones")
