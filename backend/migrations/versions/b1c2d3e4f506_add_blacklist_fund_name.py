"""add fund name to blacklisted fund codes

Revision ID: b1c2d3e4f506
Revises: a0b1c2d3e4f5
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b1c2d3e4f506"
down_revision: Union[str, None] = "a0b1c2d3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fund_blacklist_entry",
        sa.Column("fund_name", sa.String(length=200), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_column("fund_blacklist_entry", "fund_name")
