"""add other QDII group and fund types

Revision ID: d3e4f5061728
Revises: c2d3e4f50617
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d3e4f5061728"
down_revision: Union[str, None] = "c2d3e4f50617"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_constraint("ck_fund_product_structure", "fund_product", type_="check")
    op.create_check_constraint(
        "ck_fund_product_structure", "fund_product",
        "product_structure IN ('ETF', '普通开放式指数基金', 'ETF联接基金', '普通开放式基金', 'LOF')",
    )
    op.drop_constraint("ck_fund_product_tracking_method", "fund_product", type_="check")
    op.create_check_constraint(
        "ck_fund_product_tracking_method", "fund_product",
        "tracking_method IN ('被动指数', '指数增强', '主动管理')",
    )
    connection = op.get_bind()
    connection.execute(sa.text("""
        INSERT INTO index_family (id, name, short_name, region, currency, quality_status)
        VALUES ('other-qdii', '其他QDII基金', '其他QDII', '境外', '多币种', 'verified')
        ON CONFLICT (id) DO NOTHING
    """))
    connection.execute(sa.text("""
        INSERT INTO index_definition
            (id, family_id, name, short_name, region, currency, benchmark_type,
             exact_benchmark, quality_status)
        VALUES
            ('other-qdii-benchmark', 'other-qdii', '其他QDII基金业绩比较基准',
             '其他QDII', '境外', '多币种', '自定义业绩基准',
             '各基金跟踪指数或业绩比较基准以基金合同为准', 'unavailable')
        ON CONFLICT (id) DO NOTHING
    """))


def downgrade() -> None:
    connection = op.get_bind()
    connection.execute(sa.text("""
        DELETE FROM index_definition WHERE id = 'other-qdii-benchmark'
    """))
    connection.execute(sa.text("""
        DELETE FROM index_family WHERE id = 'other-qdii'
    """))
    op.drop_constraint("ck_fund_product_tracking_method", "fund_product", type_="check")
    op.create_check_constraint(
        "ck_fund_product_tracking_method", "fund_product",
        "tracking_method IN ('被动指数', '指数增强')",
    )
    op.drop_constraint("ck_fund_product_structure", "fund_product", type_="check")
    op.create_check_constraint(
        "ck_fund_product_structure", "fund_product",
        "product_structure IN ('ETF', '普通开放式指数基金', 'ETF联接基金')",
    )
