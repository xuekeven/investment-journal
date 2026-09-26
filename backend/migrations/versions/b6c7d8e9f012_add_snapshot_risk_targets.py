"""add snapshot risk targets

Revision ID: b6c7d8e9f012
Revises: a5b6c7d8e901
Create Date: 2026-09-20 13:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b6c7d8e9f012"
down_revision: Union[str, None] = "a5b6c7d8e901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "asset_snapshot_target",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("asset_snapshot_id", sa.BigInteger(), nullable=False),
        sa.Column("risk_level", sa.String(length=16), nullable=False),
        sa.Column("target_percent", sa.Numeric(8, 4), nullable=False),
        sa.Column("warning_threshold", sa.Numeric(8, 4), server_default="5", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("risk_level IN ('低', '中', '高')", name="ck_asset_snapshot_target_risk"),
        sa.CheckConstraint("target_percent >= 0 AND target_percent <= 100", name="ck_asset_snapshot_target_percent"),
        sa.CheckConstraint("warning_threshold >= 0", name="ck_asset_snapshot_target_threshold"),
        sa.ForeignKeyConstraint(["asset_snapshot_id"], ["asset_snapshot.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_snapshot_id", "risk_level", name="uq_asset_snapshot_target_risk"),
    )
    op.create_index("ix_asset_snapshot_target_snapshot", "asset_snapshot_target", ["asset_snapshot_id"])
    op.execute(
        """
        INSERT INTO asset_snapshot_target
            (asset_snapshot_id, risk_level, target_percent, warning_threshold)
        SELECT s.id, t.risk_level, t.target_percent, t.warning_threshold
        FROM asset_snapshot AS s
        CROSS JOIN asset_allocation_target AS t
        WHERE s.user_id = t.user_id
        """
    )


def downgrade() -> None:
    op.drop_index("ix_asset_snapshot_target_snapshot", table_name="asset_snapshot_target")
    op.drop_table("asset_snapshot_target")
