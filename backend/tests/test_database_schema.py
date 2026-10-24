from app.database_models import Base


CORE_TABLES = {
    "source_document",
    "index_family",
    "index_definition",
    "fund_product",
    "fund_share_class",
    "fund_blacklist_entry",
    "fund_listing",
    "fee_history",
    "nav_daily",
    "market_quote",
    "benchmark_daily",
    "fund_scale",
    "sales_limit_history",
    "calculated_metric",
    "user_fund_tag",
    "limit_notification_subscription",
    "limit_notification_outbox",
    "investment_note",
    "knowledge_article",
    "content_option",
    "asset_account",
    "asset_position",
    "asset_snapshot",
    "asset_snapshot_item",
    "asset_snapshot_target",
    "asset_allocation_target",
}


def test_all_core_tables_are_declared() -> None:
    assert set(Base.metadata.tables) == CORE_TABLES


def test_blacklisted_fund_codes_can_store_names() -> None:
    table = Base.metadata.tables["fund_blacklist_entry"]
    assert "fund_name" in table.columns
    assert "manager_name" in table.columns
    identity = next(
        constraint for constraint in table.constraints
        if constraint.name == "uq_fund_blacklist_entry_identity"
    )
    assert {column.name for column in identity.columns} == {
        "user_id", "entry_type", "value", "manager_name",
    }


def test_fund_entities_are_separate_and_linked() -> None:
    share_table = Base.metadata.tables["fund_share_class"]
    listing_table = Base.metadata.tables["fund_listing"]

    share_foreign_keys = {key.target_fullname for key in share_table.foreign_keys}
    listing_foreign_keys = {key.target_fullname for key in listing_table.foreign_keys}

    assert "fund_product.id" in share_foreign_keys
    assert "fund_share_class.id" in listing_foreign_keys


def test_product_scope_includes_lof_and_active_qdii() -> None:
    product_table = Base.metadata.tables["fund_product"]
    structure_constraint = next(
        constraint
        for constraint in product_table.constraints
        if constraint.name == "ck_fund_product_structure"
    )

    assert "LOF" in str(structure_constraint.sqltext)
    assert "普通开放式基金" in str(structure_constraint.sqltext)


def test_single_user_tags_are_bound_to_fund_shares() -> None:
    tag_table = Base.metadata.tables["user_fund_tag"]
    foreign_keys = {key.target_fullname for key in tag_table.foreign_keys}
    tag_constraint = next(
        constraint
        for constraint in tag_table.constraints
        if constraint.name == "ck_user_fund_tag_type"
    )

    assert "fund_share_class.id" in foreign_keys
    assert "favorite" in str(tag_constraint.sqltext)
    assert "holding" in str(tag_constraint.sqltext)
    assert "recurring" in str(tag_constraint.sqltext)
    assert "amount" in tag_table.columns
    assert "cost" in tag_table.columns
    amount_constraint = next(
        constraint
        for constraint in tag_table.constraints
        if constraint.name == "ck_user_fund_tag_amount"
    )
    assert ">= 0" in str(amount_constraint.sqltext)


def test_limit_notifications_are_unique_per_subscription_scope() -> None:
    subscription_table = Base.metadata.tables["limit_notification_subscription"]
    scope_constraint = next(
        constraint
        for constraint in subscription_table.constraints
        if constraint.name == "uq_limit_notification_subscription_scope"
    )

    assert {column.name for column in scope_constraint.columns} == {
        "user_id",
        "scope_type",
        "scope_value",
    }


def test_fee_history_accepts_comprehensive_operating_rate() -> None:
    fee_table = Base.metadata.tables["fee_history"]
    fee_constraint = next(
        constraint
        for constraint in fee_table.constraints
        if constraint.name == "ck_fee_history_type"
    )

    assert "comprehensive_operating" in str(fee_constraint.sqltext)



def test_investment_notes_are_single_user_and_structured() -> None:
    note_table = Base.metadata.tables["investment_note"]
    category_constraint = next(
        constraint
        for constraint in note_table.constraints
        if constraint.name == "ck_investment_note_category"
    )
    action_constraint = next(
        constraint
        for constraint in note_table.constraints
        if constraint.name == "ck_investment_note_action"
    )

    assert "user_id" in note_table.columns
    assert "长期" in str(category_constraint.sqltext)
    assert "实时" in str(category_constraint.sqltext)
    assert "加仓" in str(action_constraint.sqltext)
    assert "index_ids" in note_table.columns
    assert "fund_codes" in note_table.columns
    assert "source_option_id" in note_table.columns
    assert "is_pinned" in note_table.columns
    assert "content_option.id" in {
        key.target_fullname for key in note_table.foreign_keys
    }


def test_content_options_are_scoped_and_ordered() -> None:
    option_table = Base.metadata.tables["content_option"]
    constraint = next(
        item for item in option_table.constraints if item.name == "ck_content_option_type"
    )

    assert "user_id" in option_table.columns
    assert "investment_note_source" in str(constraint.sqltext)
    assert "knowledge_category" in str(constraint.sqltext)
    assert "asset_category" in str(constraint.sqltext)
    assert "ix_content_option_user_type_order" in {
        index.name for index in option_table.indexes
    }


def test_knowledge_articles_store_stable_reference_fields() -> None:
    article_table = Base.metadata.tables["knowledge_article"]

    assert "user_id" in article_table.columns
    assert "content_markdown" in article_table.columns
    assert "sources" in article_table.columns
    assert "summary" not in article_table.columns
    assert "reviewed_at" not in article_table.columns
    assert "status" not in article_table.columns
    assert "category_order" in article_table.columns
    assert "article_order" in article_table.columns
    assert "category_option_id" in article_table.columns
    assert "content_option.id" in {
        key.target_fullname for key in article_table.foreign_keys
    }
    assert "ix_knowledge_article_user_order" in {index.name for index in article_table.indexes}


def test_asset_management_uses_structured_snapshots() -> None:
    account_table = Base.metadata.tables["asset_account"]
    position_table = Base.metadata.tables["asset_position"]
    snapshot_item_table = Base.metadata.tables["asset_snapshot_item"]

    assert "target_amount" in account_table.columns
    assert "asset_category" in account_table.columns
    assert "asset_category_option_id" in account_table.columns
    assert "purpose" in position_table.columns
    assert "asset_class_option_id" in position_table.columns
    assert "purpose_option_id" in position_table.columns
    assert "risk_option_id" in position_table.columns
    assert "risk_level" in position_table.columns
    assert position_table.c.purpose.nullable
    assert position_table.c.purpose_option_id.nullable
    assert position_table.c.risk_level.nullable
    assert position_table.c.risk_option_id.nullable
    assert "is_investable" in position_table.columns
    assert {
        "position_name",
        "asset_class",
        "asset_class_option_id",
        "purpose",
        "purpose_option_id",
        "risk_level",
        "risk_option_id",
        "is_investable",
        "position_sort_order",
        "account_name",
        "account_region",
        "account_currency",
        "account_asset_category",
        "account_asset_category_option_id",
        "account_target_amount",
        "account_sort_order",
    } <= set(snapshot_item_table.columns.keys())
    assert {key.target_fullname for key in snapshot_item_table.foreign_keys} == {
        "asset_snapshot.id",
        "asset_position.id",
    }
    assert "content_option.id" in {key.target_fullname for key in account_table.foreign_keys}
    assert {key.target_fullname for key in position_table.foreign_keys} >= {
        "content_option.id",
        "asset_account.id",
    }
