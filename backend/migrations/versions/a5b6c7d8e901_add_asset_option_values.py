"""add configurable asset option values

Revision ID: a5b6c7d8e901
Revises: f4a5b6c7d890
Create Date: 2026-09-20 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a5b6c7d8e901"
down_revision: Union[str, None] = "f4a5b6c7d890"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category', 'asset_purpose', 'asset_risk', 'asset_region')",
    )
    op.drop_constraint("ck_asset_account_region", "asset_account", type_="check")
    op.drop_constraint("ck_asset_position_purpose", "asset_position", type_="check")
    op.drop_constraint("ck_asset_position_risk", "asset_position", type_="check")

    option_table = sa.table(
        "content_option",
        sa.column("user_id", sa.String()),
        sa.column("option_type", sa.String()),
        sa.column("value", sa.String()),
        sa.column("sort_order", sa.Integer()),
    )
    defaults = {
        "asset_purpose": ("短期日用", "中期稳健", "长期投资", "不参与配置"),
        "asset_risk": ("低", "中", "高", "未分类"),
        "asset_region": ("境内", "境外"),
    }
    op.bulk_insert(
        option_table,
        [
            {"user_id": "default", "option_type": option_type, "value": value, "sort_order": order}
            for option_type, values in defaults.items()
            for order, value in enumerate(values)
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM content_option WHERE option_type IN ('asset_purpose', 'asset_risk', 'asset_region')")
    op.create_check_constraint("ck_asset_account_region", "asset_account", "region IN ('境内', '境外')")
    op.create_check_constraint(
        "ck_asset_position_purpose",
        "asset_position",
        "purpose IN ('短期日用', '中期稳健', '长期投资', '不参与配置')",
    )
    op.create_check_constraint(
        "ck_asset_position_risk",
        "asset_position",
        "risk_level IN ('低', '中', '高', '未分类')",
    )
    op.drop_constraint("ck_content_option_type", "content_option", type_="check")
    op.create_check_constraint(
        "ck_content_option_type",
        "content_option",
        "option_type IN ('investment_note_source', 'knowledge_category')",
    )
