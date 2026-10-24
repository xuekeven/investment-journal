import pytest

from app.blacklist import _normalize_items
from app.models import FundBlacklistItem


def test_blacklist_entries_are_trimmed_and_keep_order() -> None:
    items = _normalize_items([
        FundBlacklistItem(value=" 公司乙 ", manager_name=" 经理乙 ", reason=" 原因乙 "),
        FundBlacklistItem(value="公司甲", manager_name="经理甲", reason="原因甲"),
    ], "基金经理")

    assert [(item.manager_name, item.value, item.reason) for item in items] == [
        ("经理乙", "公司乙", "原因乙"),
        ("经理甲", "公司甲", "原因甲"),
    ]


def test_blacklisted_code_keeps_fund_name() -> None:
    items = _normalize_items([
        FundBlacklistItem(value="000834", fund_name=" 大成纳斯达克100ETF联接A ", reason=" 暂停关注 "),
    ], "基金代码")

    assert [(item.value, item.fund_name, item.reason) for item in items] == [
        ("000834", "大成纳斯达克100ETF联接A", "暂停关注"),
    ]


def test_blacklist_rejects_blank_and_duplicate_keys() -> None:
    with pytest.raises(ValueError, match="基金代码不能为空"):
        _normalize_items([FundBlacklistItem(value=" ")], "基金代码")
    with pytest.raises(ValueError, match="基金经理不能为空"):
        _normalize_items([
            FundBlacklistItem(value="公司甲"),
        ], "基金经理")
    with pytest.raises(ValueError, match="基金经理与基金公司组合不能重复"):
        _normalize_items([
            FundBlacklistItem(value="公司甲", manager_name="经理甲"),
            FundBlacklistItem(value=" 公司甲 ", manager_name=" 经理甲 "),
        ], "基金经理")


def test_same_company_can_have_multiple_managers() -> None:
    items = _normalize_items([
        FundBlacklistItem(value="公司甲", manager_name="经理甲"),
        FundBlacklistItem(value="公司甲", manager_name="经理乙"),
    ], "基金经理")

    assert [item.manager_name for item in items] == ["经理甲", "经理乙"]
