"""link notes and knowledge configuration values to stable content option ids

Revision ID: f0a1b2c3d456
Revises: e9f0a1b2c345
Create Date: 2026-09-29 12:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f0a1b2c3d456"
down_revision: Union[str, None] = "e9f0a1b2c345"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'investment_note_source', source_name, 100
        FROM investment_note
        WHERE source_name IS NOT NULL AND source_name <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;

        INSERT INTO content_option (user_id, option_type, value, sort_order)
        SELECT DISTINCT user_id, 'knowledge_category', category, 100
        FROM knowledge_article
        WHERE category <> ''
        ON CONFLICT (user_id, option_type, value) DO NOTHING;
        """
    )
    op.add_column("investment_note", sa.Column("source_option_id", sa.BigInteger(), nullable=True))
    op.add_column("knowledge_article", sa.Column("category_option_id", sa.BigInteger(), nullable=True))
    op.execute(
        """
        UPDATE investment_note AS note
        SET source_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = note.user_id
          AND option.option_type = 'investment_note_source'
          AND option.value = note.source_name;

        UPDATE knowledge_article AS article
        SET category_option_id = option.id
        FROM content_option AS option
        WHERE option.user_id = article.user_id
          AND option.option_type = 'knowledge_category'
          AND option.value = article.category;
        """
    )
    op.alter_column("knowledge_article", "category_option_id", nullable=False)
    op.create_foreign_key("fk_investment_note_source_option", "investment_note", "content_option", ["source_option_id"], ["id"], ondelete="RESTRICT")
    op.create_foreign_key("fk_knowledge_article_category_option", "knowledge_article", "content_option", ["category_option_id"], ["id"], ondelete="RESTRICT")


def downgrade() -> None:
    op.drop_constraint("fk_knowledge_article_category_option", "knowledge_article", type_="foreignkey")
    op.drop_constraint("fk_investment_note_source_option", "investment_note", type_="foreignkey")
    op.drop_column("knowledge_article", "category_option_id")
    op.drop_column("investment_note", "source_option_id")
