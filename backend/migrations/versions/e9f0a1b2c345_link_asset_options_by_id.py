"""link asset configuration values to stable content option ids

Revision ID: e9f0a1b2c345
Revises: d8e9f0a1b234
Create Date: 2026-09-28 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e9f0a1b2c345"
down_revision: Union[str, None] = "d8e9f0a1b234"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'asset_category', asset_category, 100
        FROM asset_account
        WHERE asset_category <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;

        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'asset_class', asset_class, 100
        FROM asset_position
        WHERE asset_class <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;

        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'asset_purpose', purpose, 100
        FROM asset_position
        WHERE purpose <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;

        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'asset_risk', risk_level, 100
        FROM asset_position
        WHERE risk_level <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;
        """
    )
    op.add_column("asset_account", sa.Column("asset_category_option_id", sa.BigInteger(), nullable=True))
    op.add_column("asset_position", sa.Column("asset_class_option_id", sa.BigInteger(), nullable=True))
    op.add_column("asset_position", sa.Column("purpose_option_id", sa.BigInteger(), nullable=True))
    op.add_column("asset_position", sa.Column("risk_option_id", sa.BigInteger(), nullable=True))
    op.execute(
        """
        UPDATE asset_account AS account
        SET asset_category_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = account.user_id
          AND option.option_type = 'asset_category'
          AND option.value = account.asset_category;

        UPDATE asset_position AS position
        SET asset_class_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = position.user_id
          AND option.option_type = 'asset_class'
          AND option.value = position.asset_class;

        UPDATE asset_position AS position
        SET purpose_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = position.user_id
          AND option.option_type = 'asset_purpose'
          AND option.value = position.purpose;

        UPDATE asset_position AS position
        SET risk_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = position.user_id
          AND option.option_type = 'asset_risk'
          AND option.value = position.risk_level;
        """
    )
    op.alter_column("asset_account", "asset_category_option_id", nullable=False)
    op.alter_column("asset_position", "asset_class_option_id", nullable=False)
    op.alter_column("asset_position", "purpose_option_id", nullable=False)
    op.alter_column("asset_position", "risk_option_id", nullable=False)
    op.create_foreign_key("fk_asset_account_category_option", "asset_account", "content_option", ["asset_category_option_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_asset_position_class_option", "asset_position", "content_option", ["asset_class_option_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_asset_position_purpose_option", "asset_position", "content_option", ["purpose_option_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_asset_position_risk_option", "asset_position", "content_option", ["risk_option_id"], ["id"], ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_asset_position_risk_option", "asset_position", type_="foreignkey")
    op.drop_constraint("fk_asset_position_purpose_option", "asset_position", type_="foreignkey")
    op.drop_constraint("fk_asset_position_class_option", "asset_position", type_="foreignkey")
    op.drop_constraint("fk_asset_account_category_option", "asset_account", type_="foreignkey")
    op.drop_column("asset_position", "risk_option_id")
    op.drop_column("asset_position", "purpose_option_id")
    op.drop_column("asset_position", "asset_class_option_id")
    op.drop_column("asset_account", "asset_category_option_id")
