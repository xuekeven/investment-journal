"""Add exchange deviation reminder settings.

Revision ID: e4f506172839
Revises: d3e4f5061728
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e4f506172839"
down_revision: Union[str, None] = "d3e4f5061728"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "limit_notification_subscription",
        sa.Column("deviation_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "limit_notification_subscription",
        sa.Column("deviation_threshold", sa.Numeric(8, 2), nullable=False, server_default=sa.text("0")),
    )


def downgrade() -> None:
    op.drop_column("limit_notification_subscription", "deviation_threshold")
    op.drop_column("limit_notification_subscription", "deviation_enabled")
