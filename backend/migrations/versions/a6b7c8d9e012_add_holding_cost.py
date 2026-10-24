"""Add optional cost to holding fund tags.

Revision ID: a6b7c8d9e012
Revises: f5a6b7c8d901
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a6b7c8d9e012"
down_revision: Union[str, None] = "f5a6b7c8d901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_fund_tag",
        sa.Column("cost", sa.Numeric(precision=24, scale=6), nullable=True),
    )
    op.create_check_constraint(
        "ck_user_fund_tag_cost",
        "user_fund_tag",
        "cost IS NULL OR cost >= 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_fund_tag_cost", "user_fund_tag", type_="check")
    op.drop_column("user_fund_tag", "cost")
