"""partidas extraídas de las tablas

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003"
down_revision = "0002"


def upgrade() -> None:
    op.create_table(
        "partidas",
        sa.Column(
            "documento_id",
            sa.Uuid,
            sa.ForeignKey("documentos.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("orden", sa.Integer, primary_key=True),
        sa.Column("pagina", sa.Integer, nullable=False),
        sa.Column("item", sa.Text, nullable=False),
        sa.Column("descripcion", sa.Text, nullable=False),
        sa.Column("unidad", sa.Text),
        # Los montos van como numeric: un precio en soles nunca pasa por float.
        sa.Column("numeros", JSONB, nullable=False),
        sa.Column("cantidad", sa.Numeric),
        sa.Column("precio_unitario", sa.Numeric),
        sa.Column("parcial", sa.Numeric),
        sa.Column("cuadra", sa.Boolean),
    )


def downgrade() -> None:
    op.drop_table("partidas")
