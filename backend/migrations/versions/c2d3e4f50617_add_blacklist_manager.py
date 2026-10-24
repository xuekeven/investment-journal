"""add manager names to blacklist entries

Revision ID: c2d3e4f50617
Revises: b1c2d3e4f506
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c2d3e4f50617"
down_revision: Union[str, None] = "b1c2d3e4f506"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fund_blacklist_entry",
        sa.Column("manager_name", sa.String(length=200), nullable=False, server_default=""),
    )
    op.drop_constraint(
        "uq_fund_blacklist_entry_value", "fund_blacklist_entry", type_="unique"
    )
    op.create_unique_constraint(
        "uq_fund_blacklist_entry_identity",
        "fund_blacklist_entry",
        ["user_id", "entry_type", "value", "manager_name"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_fund_blacklist_entry_identity", "fund_blacklist_entry", type_="unique"
    )
    op.create_unique_constraint(
        "uq_fund_blacklist_entry_value",
        "fund_blacklist_entry",
        ["user_id", "entry_type", "value"],
    )
    op.drop_column("fund_blacklist_entry", "manager_name")
