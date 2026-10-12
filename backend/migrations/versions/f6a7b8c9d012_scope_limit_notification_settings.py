"""scope limit notification settings

Revision ID: f6a7b8c9d012
Revises: e5f6a7b8c901
Create Date: 2026-10-12 21:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f6a7b8c9d012"
down_revision: Union[str, None] = "e5f6a7b8c901"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint(
        "limit_notification_subscription_user_id_key",
        "limit_notification_subscription",
        type_="unique",
    )
    op.create_unique_constraint(
        "uq_limit_notification_subscription_scope",
        "limit_notification_subscription",
        ["user_id", "scope_type", "scope_value"],
    )
    op.alter_column(
        "limit_notification_subscription",
        "wework_app",
        existing_type=sa.String(length=64),
        server_default=sa.text("'main'"),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.execute("""
        DELETE FROM limit_notification_subscription AS candidate
        USING limit_notification_subscription AS keeper
        WHERE candidate.user_id = keeper.user_id
          AND candidate.id > keeper.id
    """)
    op.drop_constraint(
        "uq_limit_notification_subscription_scope",
        "limit_notification_subscription",
        type_="unique",
    )
    op.create_unique_constraint(
        "limit_notification_subscription_user_id_key",
        "limit_notification_subscription",
        ["user_id"],
    )
    op.alter_column(
        "limit_notification_subscription",
        "wework_app",
        existing_type=sa.String(length=64),
        server_default=sa.text("'message'"),
        existing_nullable=False,
    )
