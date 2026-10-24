from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database_models import FundBlacklistEntry
from app.models import FundBlacklist, FundBlacklistItem


USER_ID = "default"


def get_fund_blacklist(session: Session) -> FundBlacklist:
    rows = session.scalars(
        select(FundBlacklistEntry)
        .where(FundBlacklistEntry.user_id == USER_ID)
        .order_by(FundBlacklistEntry.entry_type, FundBlacklistEntry.sort_order)
    )
    result = FundBlacklist()
    for row in rows:
        item = FundBlacklistItem(
            id=row.id, value=row.value, manager_name=row.manager_name,
            fund_name=row.fund_name, reason=row.reason,
        )
        if row.entry_type == "company":
            result.companies.append(item)
        else:
            result.codes.append(item)
    return result


def _normalize_items(
    items: list[FundBlacklistItem], label: str
) -> list[FundBlacklistItem]:
    values = [
        (
            item.value.strip(), item.manager_name.strip(),
            item.fund_name.strip(), item.reason.strip(),
        )
        for item in items
    ]
    if any(not value for value, _, _, _ in values):
        raise ValueError("基金公司不能为空" if label == "基金经理" else f"{label}不能为空")
    if label == "基金经理":
        if any(not manager_name for _, manager_name, _, _ in values):
            raise ValueError("基金经理不能为空")
        keys = [(manager_name, value) for value, manager_name, _, _ in values]
    else:
        keys = [value for value, _, _, _ in values]
    if len(set(keys)) != len(keys):
        raise ValueError(
            "基金经理与基金公司组合不能重复" if label == "基金经理" else f"{label}不能重复"
        )
    return [
        FundBlacklistItem(
            value=value,
            manager_name=manager_name if label == "基金经理" else "",
            fund_name=fund_name if label == "基金代码" else "",
            reason=reason,
        )
        for value, manager_name, fund_name, reason in values
    ]


def save_fund_blacklist(session: Session, payload: FundBlacklist) -> FundBlacklist:
    companies = _normalize_items(payload.companies, "基金经理")
    codes = _normalize_items(payload.codes, "基金代码")
    session.execute(delete(FundBlacklistEntry).where(FundBlacklistEntry.user_id == USER_ID))
    for entry_type, items in (("company", companies), ("code", codes)):
        for sort_order, item in enumerate(items):
            session.add(FundBlacklistEntry(
                user_id=USER_ID,
                entry_type=entry_type,
                value=item.value,
                manager_name=item.manager_name,
                fund_name=item.fund_name,
                reason=item.reason,
                sort_order=sort_order,
            ))
    session.commit()
    return get_fund_blacklist(session)
