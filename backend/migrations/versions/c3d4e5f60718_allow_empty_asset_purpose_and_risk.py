"""allow empty asset purpose and risk

Revision ID: c3d4e5f60718
Revises: b2c3d4e5f607
Create Date: 2026-10-12 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c3d4e5f60718"
down_revision: Union[str, None] = "b2c3d4e5f607"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("asset_position", "purpose", existing_type=sa.String(length=24), nullable=True)
    op.alter_column("asset_position", "purpose_option_id", existing_type=sa.BigInteger(), nullable=True)
    op.alter_column("asset_position", "risk_level", existing_type=sa.String(length=16), nullable=True)
    op.alter_column("asset_position", "risk_option_id", existing_type=sa.BigInteger(), nullable=True)


def downgrade() -> None:
    op.execute("""
        UPDATE asset_position
        SET purpose_option_id = (
                SELECT id FROM content_option
                WHERE user_id = asset_position.user_id AND option_type = 'asset_purpose'
                ORDER BY sort_order, id LIMIT 1
            ),
            purpose = (
                SELECT value FROM content_option
                WHERE user_id = asset_position.user_id AND option_type = 'asset_purpose'
                ORDER BY sort_order, id LIMIT 1
            )
        WHERE purpose_option_id IS NULL
    """)
    op.execute("""
        UPDATE asset_position
        SET risk_option_id = (
                SELECT id FROM content_option
                WHERE user_id = asset_position.user_id AND option_type = 'asset_risk'
                ORDER BY sort_order, id LIMIT 1
            ),
            risk_level = (
                SELECT value FROM content_option
                WHERE user_id = asset_position.user_id AND option_type = 'asset_risk'
                ORDER BY sort_order, id LIMIT 1
            )
        WHERE risk_option_id IS NULL
    """)
    op.alter_column("asset_position", "risk_option_id", existing_type=sa.BigInteger(), nullable=False)
    op.alter_column("asset_position", "risk_level", existing_type=sa.String(length=16), nullable=False)
    op.alter_column("asset_position", "purpose_option_id", existing_type=sa.BigInteger(), nullable=False)
    op.alter_column("asset_position", "purpose", existing_type=sa.String(length=24), nullable=False)
