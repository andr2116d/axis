"""procesos de selección con sus postores y antecedentes públicos de proveedores

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0007"
down_revision = "0006"


def upgrade() -> None:
    op.create_table(
        "procesos_seleccion",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("nomenclatura", sa.Text, nullable=False),
        sa.Column("entidad", sa.Text, nullable=False),
        sa.Column("descripcion", sa.Text, nullable=False),
        sa.Column("monto_referencial", sa.Numeric),
        sa.Column("cui", sa.Text),
        sa.Column("convocatoria", sa.Date),
        sa.Column("postores", JSONB, nullable=False),
    )
    op.create_table(
        "antecedentes_proveedor",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("ruc", sa.Text, nullable=False),
        sa.Column("tipo", sa.Text, nullable=False),
        sa.Column("motivo", sa.Text, nullable=False),
        sa.Column("inicio", sa.Date),
        sa.Column("fin", sa.Date),
        sa.Column("resolucion", sa.Text),
        sa.Column("monto", sa.Numeric),
        sa.Column("entidad", sa.Text),
        sa.Column("objeto", sa.Text),
    )
    # La revisión de un proceso consulta todos sus postores por RUC de una vez.
    op.create_index("ix_antecedentes_ruc", "antecedentes_proveedor", ["ruc"])
    op.create_table(
        "fuentes_antecedentes",
        sa.Column("nombre", sa.Text, primary_key=True),
        sa.Column("corte", sa.Date),
    )


def downgrade() -> None:
    op.drop_table("fuentes_antecedentes")
    op.drop_table("antecedentes_proveedor")
    op.drop_table("procesos_seleccion")
