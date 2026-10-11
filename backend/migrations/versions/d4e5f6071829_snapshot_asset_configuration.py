"""snapshot asset configuration

Revision ID: d4e5f6071829
Revises: c3d4e5f60718
Create Date: 2026-10-12 13:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e5f6071829"
down_revision: Union[str, None] = "c3d4e5f60718"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = (
        sa.Column("position_name", sa.String(length=160), nullable=True),
        sa.Column("asset_class", sa.String(length=64), nullable=True),
        sa.Column("asset_class_option_id", sa.BigInteger(), nullable=True),
        sa.Column("purpose", sa.String(length=24), nullable=True),
        sa.Column("purpose_option_id", sa.BigInteger(), nullable=True),
        sa.Column("risk_level", sa.String(length=16), nullable=True),
        sa.Column("risk_option_id", sa.BigInteger(), nullable=True),
        sa.Column("is_investable", sa.Boolean(), nullable=True),
        sa.Column("position_sort_order", sa.Integer(), nullable=True),
        sa.Column("account_name", sa.String(length=120), nullable=True),
        sa.Column("account_region", sa.String(length=16), nullable=True),
        sa.Column("account_currency", sa.String(length=16), nullable=True),
        sa.Column("account_asset_category", sa.String(length=64), nullable=True),
        sa.Column("account_asset_category_option_id", sa.BigInteger(), nullable=True),
        sa.Column("account_target_amount", sa.Numeric(20, 4), nullable=True),
        sa.Column("account_sort_order", sa.Integer(), nullable=True),
    )
    for column in columns:
        op.add_column("asset_snapshot_item", column)

    op.execute("""
        UPDATE asset_snapshot_item AS item
        SET position_name = position.name,
            asset_class = position.asset_class,
            asset_class_option_id = position.asset_class_option_id,
            purpose = position.purpose,
            purpose_option_id = position.purpose_option_id,
            risk_level = position.risk_level,
            risk_option_id = position.risk_option_id,
            is_investable = position.is_investable,
            position_sort_order = position.sort_order,
            account_name = account.name,
            account_region = account.region,
            account_currency = account.currency,
            account_asset_category = account.asset_category,
            account_asset_category_option_id = account.asset_category_option_id,
            account_target_amount = account.target_amount,
            account_sort_order = account.sort_order
        FROM asset_position AS position
        JOIN asset_account AS account ON account.id = position.asset_account_id
        WHERE item.asset_position_id = position.id
    """)

    required = (
        ("position_name", sa.String(length=160)),
        ("asset_class", sa.String(length=64)),
        ("asset_class_option_id", sa.BigInteger()),
        ("is_investable", sa.Boolean()),
        ("position_sort_order", sa.Integer()),
        ("account_name", sa.String(length=120)),
        ("account_region", sa.String(length=16)),
        ("account_currency", sa.String(length=16)),
        ("account_asset_category", sa.String(length=64)),
        ("account_asset_category_option_id", sa.BigInteger()),
        ("account_sort_order", sa.Integer()),
    )
    for name, column_type in required:
        op.alter_column("asset_snapshot_item", name, existing_type=column_type, nullable=False)


def downgrade() -> None:
    for name in (
        "account_sort_order",
        "account_target_amount",
        "account_asset_category_option_id",
        "account_asset_category",
        "account_currency",
        "account_region",
        "account_name",
        "position_sort_order",
        "is_investable",
        "risk_option_id",
        "risk_level",
        "purpose_option_id",
        "purpose",
        "asset_class_option_id",
        "asset_class",
        "position_name",
    ):
        op.drop_column("asset_snapshot_item", name)
