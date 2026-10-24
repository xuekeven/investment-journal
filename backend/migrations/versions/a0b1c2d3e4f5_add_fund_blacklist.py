"""add fund blacklist entries

Revision ID: a0b1c2d3e4f5
Revises: f6a7b8c9d012
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a0b1c2d3e4f5"
down_revision: Union[str, None] = "f6a7b8c9d012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fund_blacklist_entry",
        sa.Column("id", sa.BigInteger(), sa.Identity(), primary_key=True),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("entry_type", sa.String(length=16), nullable=False),
        sa.Column("value", sa.String(length=200), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.CheckConstraint("entry_type IN ('company', 'code')", name="ck_fund_blacklist_entry_type"),
        sa.UniqueConstraint("user_id", "entry_type", "value", name="uq_fund_blacklist_entry_value"),
    )
    op.create_index(
        "ix_fund_blacklist_entry_order",
        "fund_blacklist_entry",
        ["user_id", "entry_type", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index("ix_fund_blacklist_entry_order", table_name="fund_blacklist_entry")
    op.drop_table("fund_blacklist_entry")
