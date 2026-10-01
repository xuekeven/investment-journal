"""remove unused asset purpose and risk options

Revision ID: a1b2c3d4e5f6
Revises: f0a1b2c3d456
Create Date: 2026-10-01 16:30:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f0a1b2c3d456"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE asset_position AS position
        SET purpose_option_id = replacement.id,
            purpose = replacement.value
        FROM content_option AS removed,
             content_option AS replacement
        WHERE position.purpose_option_id = removed.id
          AND removed.user_id = position.user_id
          AND removed.option_type = 'asset_purpose'
          AND removed.value = '不参与配置'
          AND replacement.user_id = position.user_id
          AND replacement.option_type = 'asset_purpose'
          AND replacement.value = '短期日用';

        UPDATE asset_position AS position
        SET risk_option_id = replacement.id,
            risk_level = replacement.value
        FROM content_option AS removed,
             content_option AS replacement
        WHERE position.risk_option_id = removed.id
          AND removed.user_id = position.user_id
          AND removed.option_type = 'asset_risk'
          AND removed.value = '未分类'
          AND replacement.user_id = position.user_id
          AND replacement.option_type = 'asset_risk'
          AND replacement.value = '低';

        DELETE FROM content_option
        WHERE option_type = 'asset_purpose' AND value = '不参与配置';

        DELETE FROM content_option
        WHERE option_type = 'asset_risk' AND value = '未分类';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        VALUES
            ('default', 'asset_purpose', '不参与配置', 3),
            ('default', 'asset_risk', '未分类', 3)
        ON CONFLICT (user_id, option_type, value) DO NOTHING;
        """
    )
