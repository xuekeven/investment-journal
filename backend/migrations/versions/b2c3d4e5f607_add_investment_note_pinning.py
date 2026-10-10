"""add investment note pinning

Revision ID: b2c3d4e5f607
Revises: a1b2c3d4e5f6
Create Date: 2026-10-08 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b2c3d4e5f607"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "investment_note",
        sa.Column(
            "is_pinned",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("investment_note", "is_pinned")
