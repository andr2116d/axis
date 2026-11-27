"""expedientes, sus documentos y sus evaluaciones

Revision ID: 0004
Revises: 0003
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004"
down_revision = "0003"


def upgrade() -> None:
    op.create_table(
        "expedientes",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("nombre_obra", sa.Text, nullable=False),
        sa.Column("cui", sa.Text),
        sa.Column("entidad", sa.Text),
        sa.Column("tipologia", sa.Text),
        sa.Column("creado_en", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "expediente_documentos",
        sa.Column(
            "expediente_id",
            sa.Uuid,
            sa.ForeignKey("expedientes.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("id_documento", sa.Text, primary_key=True),
        sa.Column("nombre", sa.Text, nullable=False),
        sa.Column("tipo", sa.Text, nullable=False),
        sa.Column("partes", JSONB, nullable=False),
        sa.Column("adjuntado_en", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "evaluaciones_expediente",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column(
            "expediente_id",
            sa.Uuid,
            sa.ForeignKey("expedientes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("numero", sa.Integer, nullable=False),
        sa.Column("creada_en", sa.DateTime(timezone=True), nullable=False),
        # Resultado de cada motor con su firma y sus hallazgos: es lo que permite reutilizarlo.
        sa.Column("resultados", JSONB, nullable=False),
        sa.Column("omitidos", JSONB, nullable=False),
        sa.Column("fallas", JSONB, nullable=False),
        sa.Column("secciones_revisadas", JSONB, nullable=False),
        sa.Column("duracion_ms", sa.Integer, nullable=False),
    )
    # La consulta de siempre: la última evaluación de un expediente.
    op.create_index(
        "ux_evaluaciones_expediente_numero",
        "evaluaciones_expediente",
        ["expediente_id", "numero"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_table("evaluaciones_expediente")
    op.drop_table("expediente_documentos")
    op.drop_table("expedientes")
