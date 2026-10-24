"""Add direction to deviation reminders.

Revision ID: f5a6b7c8d901
Revises: e4f506172839
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f5a6b7c8d901"
down_revision: Union[str, None] = "e4f506172839"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "limit_notification_subscription",
        sa.Column("deviation_direction", sa.String(length=8), nullable=False, server_default=sa.text("'above'")),
    )
    op.execute("""
        UPDATE limit_notification_subscription
        SET deviation_direction = 'below'
        WHERE deviation_threshold < 0
    """)
    op.create_check_constraint(
        "ck_limit_notification_deviation_direction",
        "limit_notification_subscription",
        "deviation_direction IN ('above', 'below')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_limit_notification_deviation_direction",
        "limit_notification_subscription",
        type_="check",
    )
    op.drop_column("limit_notification_subscription", "deviation_direction")
