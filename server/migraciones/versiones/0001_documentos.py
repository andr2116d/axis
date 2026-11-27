"""documentos, páginas y partes

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None


def upgrade() -> None:
    op.create_table(
        "documentos",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("hash_contenido", sa.Text, nullable=False),
        sa.Column("nombre_original", sa.Text, nullable=False),
        sa.Column("huella", JSONB, nullable=False),
        sa.Column("tipo_etiqueta", sa.Text, nullable=False),
        sa.Column("tipo_confianza", sa.Float, nullable=False),
        sa.Column("tipo_fase", sa.Text),
        sa.Column("senales", JSONB, nullable=False),
        sa.Column("rareza", sa.Float),
        sa.Column("fase_subida", sa.Text),
        sa.Column("version_modelos", sa.Text, nullable=False),
        sa.Column("subido_en", sa.DateTime(timezone=True), nullable=False),
    )
    # La consulta más frecuente: "¿ya vimos este archivo?" antes de procesarlo.
    op.create_index("ux_documentos_hash", "documentos", ["hash_contenido"], unique=True)
    op.create_table(
        "paginas",
        sa.Column(
            "documento_id",
            sa.Uuid,
            sa.ForeignKey("documentos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("numero", sa.Integer, primary_key=True),
        sa.Column("origen", sa.Text, nullable=False),
        sa.Column("texto", sa.Text, nullable=False),
        sa.Column("ancho_pt", sa.Float, nullable=False),
        sa.Column("alto_pt", sa.Float, nullable=False),
        sa.Column("etiqueta", sa.Text),
        sa.Column("confianza", sa.Float),
        sa.Column("confianza_ocr", sa.Float),
    )
    op.create_table(
        "partes",
        sa.Column(
            "documento_id",
            sa.Uuid,
            sa.ForeignKey("documentos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("orden", sa.Integer, primary_key=True),
        sa.Column("etiqueta", sa.Text, nullable=False),
        sa.Column("desde", sa.Integer, nullable=False),
        sa.Column("hasta", sa.Integer, nullable=False),
        sa.Column("confianza", sa.Float, nullable=False),
    )


def downgrade() -> None:
    op.drop_table("partes")
    op.drop_table("paginas")
    op.drop_table("documentos")
