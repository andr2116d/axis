"""revisiones del evaluador sobre los hallazgos

Revision ID: 0005
Revises: 0004
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"


def upgrade() -> None:
    op.create_table(
        "revisiones_hallazgo",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column(
            "expediente_id",
            sa.Uuid,
            sa.ForeignKey("expedientes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("clave", sa.Text, nullable=False),
        sa.Column("decision", sa.Text, nullable=False),
        sa.Column("motivo", sa.Text),
        sa.Column("id_motor", sa.Text, nullable=False),
        sa.Column("version_motor", sa.Text, nullable=False),
        sa.Column("numero_evaluacion", sa.Integer, nullable=False),
        sa.Column("hallazgo", JSONB, nullable=False),
        sa.Column("revisado_en", sa.DateTime(timezone=True), nullable=False),
    )
    # La vista del expediente lee su historial; el entrenamiento lee por motor.
    op.create_index(
        "ix_revisiones_expediente", "revisiones_hallazgo", ["expediente_id", "revisado_en"]
    )
    op.create_index("ix_revisiones_motor", "revisiones_hallazgo", ["id_motor", "revisado_en"])


def downgrade() -> None:
    op.drop_table("revisiones_hallazgo")
