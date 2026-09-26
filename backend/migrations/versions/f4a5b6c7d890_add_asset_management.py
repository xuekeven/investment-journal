"""add asset management

Revision ID: f4a5b6c7d890
Revises: a3b4c5d6e789
Create Date: 2026-09-20 10:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f4a5b6c7d890"
down_revision: Union[str, None] = "a3b4c5d6e789"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def timestamps() -> tuple[sa.Column, sa.Column]:
    return (
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def upgrade() -> None:
    op.create_table(
        "asset_account",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("region", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=16), server_default="人民币", nullable=False),
        sa.Column("target_amount", sa.Numeric(20, 4), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *timestamps(),
        sa.CheckConstraint("region IN ('境内', '境外')", name="ck_asset_account_region"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name", name="uq_asset_account_user_name"),
    )
    op.create_index("ix_asset_account_user_order", "asset_account", ["user_id", "sort_order"])

    op.create_table(
        "asset_position",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("asset_account_id", sa.BigInteger(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("asset_class", sa.String(length=64), nullable=False),
        sa.Column("purpose", sa.String(length=24), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("is_investable", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        *timestamps(),
        sa.CheckConstraint(
            "purpose IN ('短期日用', '中期稳健', '长期投资', '不参与配置')",
            name="ck_asset_position_purpose",
        ),
        sa.CheckConstraint(
            "risk_level IN ('低', '中', '高', '未分类')",
            name="ck_asset_position_risk",
        ),
        sa.ForeignKeyConstraint(["asset_account_id"], ["asset_account.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_account_id", "name", name="uq_asset_position_account_name"),
    )
    op.create_index(
        "ix_asset_position_account_order", "asset_position", ["asset_account_id", "sort_order"]
    )

    op.create_table(
        "asset_snapshot",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("base_currency", sa.String(length=16), server_default="人民币", nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        *timestamps(),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "snapshot_date", name="uq_asset_snapshot_user_date"),
    )
    op.create_index("ix_asset_snapshot_user_date", "asset_snapshot", ["user_id", "snapshot_date"])

    op.create_table(
        "asset_snapshot_item",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("asset_snapshot_id", sa.BigInteger(), nullable=False),
        sa.Column("asset_position_id", sa.BigInteger(), nullable=False),
        sa.Column("amount", sa.Numeric(20, 4), nullable=False),
        sa.Column("fx_rate", sa.Numeric(20, 8), server_default="1", nullable=False),
        sa.Column("amount_cny", sa.Numeric(20, 4), nullable=False),
        sa.Column("expected_annual_rate", sa.Numeric(12, 4), nullable=True),
        *timestamps(),
        sa.CheckConstraint("fx_rate > 0", name="ck_asset_snapshot_item_fx_positive"),
        sa.ForeignKeyConstraint(["asset_position_id"], ["asset_position.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["asset_snapshot_id"], ["asset_snapshot.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "asset_snapshot_id", "asset_position_id", name="uq_asset_snapshot_position"
        ),
    )
    op.create_index(
        "ix_asset_snapshot_item_snapshot", "asset_snapshot_item", ["asset_snapshot_id"]
    )

    op.create_table(
        "asset_allocation_target",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("target_percent", sa.Numeric(8, 4), nullable=False),
        sa.Column("warning_threshold", sa.Numeric(8, 4), server_default="5", nullable=False),
        *timestamps(),
        sa.CheckConstraint("risk_level IN ('低', '中', '高')", name="ck_asset_target_risk"),
        sa.CheckConstraint(
            "target_percent >= 0 AND target_percent <= 100", name="ck_asset_target_percent"
        ),
        sa.CheckConstraint("warning_threshold >= 0", name="ck_asset_target_threshold"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "risk_level", name="uq_asset_target_user_risk"),
    )


def downgrade() -> None:
    op.drop_table("asset_allocation_target")
    op.drop_index("ix_asset_snapshot_item_snapshot", table_name="asset_snapshot_item")
    op.drop_table("asset_snapshot_item")
    op.drop_index("ix_asset_snapshot_user_date", table_name="asset_snapshot")
    op.drop_table("asset_snapshot")
    op.drop_index("ix_asset_position_account_order", table_name="asset_position")
    op.drop_table("asset_position")
    op.drop_index("ix_asset_account_user_order", table_name="asset_account")
    op.drop_table("asset_account")
