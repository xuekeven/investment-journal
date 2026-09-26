"""add configurable asset class values

Revision ID: c7d8e9f0a123
Revises: b6c7d8e9f012
Create Date: 2026-09-20 16:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "c7d8e9f0a123"
down_revision: Union[str, None] = "b6c7d8e9f012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category', 'asset_purpose', 'asset_risk', 'asset_region', 'asset_class')",
    )
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT 'default', 'asset_class', value, sort_order
        FROM (
            VALUES
                ('货币基金', 0), ('黄金与红利', 1), ('股票基金', 2),
                ('债券基金', 3), ('基金组合', 4), ('存款', 5),
                ('公积金', 6), ('应收款', 7), ('负债', 8), ('股票', 9),
                ('债券与现金', 10), ('现金', 11), ('其他', 12)
        ) AS defaults(value, sort_order)
        ON CONFLICT (user_id, option_type, value) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT p.user_id, 'asset_class', p.asset_class, 100
        FROM asset_position AS p
        WHERE p.asset_class <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute("DELETE FROM content_option WHERE option_type = 'asset_class'")
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category', 'asset_purpose', 'asset_risk', 'asset_region')",
    )
