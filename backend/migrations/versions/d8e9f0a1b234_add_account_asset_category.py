"""add configurable account asset category

Revision ID: d8e9f0a1b234
Revises: c7d8e9f0a123
Create Date: 2026-09-20 23:30:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8e9f0a1b234"
down_revision: Union[str, None] = "c7d8e9f0a123"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "asset_account",
        sa.Column("asset_category", sa.String(length=64), server_default="基金", nullable=False),
    )
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category', 'asset_purpose', 'asset_risk', 'asset_region', 'asset_class', 'asset_category')",
    )
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT 'default', 'asset_category', value, sort_order
        FROM (
            VALUES
                ('股票', 0), ('基金', 1), ('货币', 2),
                ('债券', 3), ('存款', 4), ('信用', 5)
        ) AS defaults(value, sort_order)
        ON CONFLICT (user_id, option_type, value) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM content_option WHERE option_type = 'asset_category'")
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category', 'asset_purpose', 'asset_risk', 'asset_region', 'asset_class')",
    )
    op.drop_column("asset_account", "asset_category")
