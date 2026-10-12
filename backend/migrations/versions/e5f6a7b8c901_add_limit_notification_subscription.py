"""add limit notification subscription

Revision ID: e5f6a7b8c901
Revises: d4e5f6071829
Create Date: 2026-10-12 20:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e5f6a7b8c901"
down_revision: Union[str, None] = "d4e5f6071829"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "limit_notification_subscription",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("enabled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("scope_type", sa.String(length=16), nullable=False),
        sa.Column("scope_value", sa.String(length=64), nullable=False),
        sa.Column("fund_type", sa.String(length=16), nullable=False),
        sa.Column("notify_limit_decrease", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_limit_increase", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_suspended", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_resumed", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("notify_first_seen", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("wework_user_id", sa.String(length=256), nullable=False),
        sa.Column("wework_app", sa.String(length=64), server_default=sa.text("'message'"), nullable=False),
        sa.Column("last_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("scope_type IN ('index', 'tag')", name="ck_limit_notification_scope_type"),
        sa.CheckConstraint("fund_type IN ('on_exchange', 'off_exchange', 'all')", name="ck_limit_notification_fund_type"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_table(
        "limit_notification_outbox",
        sa.Column("id", sa.BigInteger(), sa.Identity(), nullable=False),
        sa.Column("subscription_id", sa.BigInteger(), nullable=False),
        sa.Column("fund_share_class_id", sa.BigInteger(), nullable=False),
        sa.Column("event_key", sa.String(length=64), nullable=False),
        sa.Column("delivery_key", sa.String(length=64), nullable=True),
        sa.Column("event_type", sa.String(length=32), nullable=False),
        sa.Column("fund_code", sa.String(length=32), nullable=False),
        sa.Column("fund_name", sa.String(length=200), nullable=False),
        sa.Column("previous_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("current_state", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("effective_from", sa.DateTime(timezone=True), nullable=True),
        sa.Column("detected_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=24), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.CheckConstraint("status IN ('pending', 'sending', 'sent', 'failed')", name="ck_limit_notification_outbox_status"),
        sa.ForeignKeyConstraint(["fund_share_class_id"], ["fund_share_class.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["subscription_id"], ["limit_notification_subscription.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_key"),
    )
    op.create_index("ix_limit_notification_outbox_pending", "limit_notification_outbox", ["status", "detected_at"])
    op.create_index("ix_limit_notification_outbox_delivery", "limit_notification_outbox", ["delivery_key"])


def downgrade() -> None:
    op.drop_index("ix_limit_notification_outbox_delivery", table_name="limit_notification_outbox")
    op.drop_index("ix_limit_notification_outbox_pending", table_name="limit_notification_outbox")
    op.drop_table("limit_notification_outbox")
    op.drop_table("limit_notification_subscription")
