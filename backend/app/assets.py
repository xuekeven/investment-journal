from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.database_models import (
    AssetAccount,
    AssetAllocationTarget,
    ContentOption,
    AssetPosition,
    AssetSnapshot,
    AssetSnapshotItem,
    AssetSnapshotTarget,
)
from app.models import (
    AssetAccountConfig,
    AssetAllocationItem,
    AssetConfigPayload,
    AssetDashboard,
    AssetDashboardAccount,
    AssetDashboardPosition,
    AssetHistoryPoint,
    AssetPositionConfig,
    AssetSnapshotPayload,
    AssetSummary,
)


SINGLE_USER_ID = "default"
RISK_ORDER = ("低", "中", "高")


def _asset_options(session: Session) -> dict[int, ContentOption]:
    return {
        item.id: item for item in session.scalars(
            select(ContentOption).where(
                ContentOption.user_id == SINGLE_USER_ID,
                ContentOption.option_type.in_((
                    "asset_category", "asset_class", "asset_purpose", "asset_risk"
                )),
            )
        )
    }


def _option_value(options: dict[int, ContentOption], option_id: int, expected_type: str) -> str:
    option = options.get(option_id)
    if option is None or option.option_type != expected_type:
        raise ValueError("资产配置引用了无效选项")
    return option.value


def _accounts_and_positions(session: Session) -> tuple[list[AssetAccount], list[AssetPosition]]:
    accounts = list(
        session.scalars(
            select(AssetAccount)
            .where(AssetAccount.user_id == SINGLE_USER_ID, AssetAccount.is_active.is_(True))
            .order_by(AssetAccount.sort_order, AssetAccount.id)
        )
    )
    account_ids = [account.id for account in accounts]
    positions = list(
        session.scalars(
            select(AssetPosition)
            .where(
                AssetPosition.user_id == SINGLE_USER_ID,
                AssetPosition.is_active.is_(True),
                AssetPosition.asset_account_id.in_(account_ids),
            )
            .order_by(AssetPosition.sort_order, AssetPosition.id)
        )
    ) if account_ids else []
    return accounts, positions


def get_asset_config(session: Session) -> AssetConfigPayload:
    accounts, positions = _accounts_and_positions(session)
    options = _asset_options(session)
    positions_by_account: dict[int, list[AssetPosition]] = {}
    for position in positions:
        positions_by_account.setdefault(position.asset_account_id, []).append(position)
    targets = list(
        session.scalars(
            select(AssetAllocationTarget)
            .where(AssetAllocationTarget.user_id == SINGLE_USER_ID)
            .order_by(AssetAllocationTarget.id)
        )
    )
    return AssetConfigPayload(
        accounts=[
            AssetAccountConfig(
                id=account.id,
                name=account.name,
                region=account.region,
                currency=account.currency,
                asset_category=_option_value(options, account.asset_category_option_id, "asset_category"),
                asset_category_option_id=account.asset_category_option_id,
                target_amount=float(account.target_amount) if account.target_amount is not None else None,
                sort_order=account.sort_order,
                positions=[
                    {
                        "id": position.id,
                        "name": position.name,
                        "asset_class": _option_value(options, position.asset_class_option_id, "asset_class"),
                        "asset_class_option_id": position.asset_class_option_id,
                        "purpose": _option_value(options, position.purpose_option_id, "asset_purpose"),
                        "purpose_option_id": position.purpose_option_id,
                        "risk_level": _option_value(options, position.risk_option_id, "asset_risk"),
                        "risk_option_id": position.risk_option_id,
                        "is_investable": position.is_investable,
                        "sort_order": position.sort_order,
                    }
                    for position in positions_by_account.get(account.id, [])
                ],
            )
            for account in accounts
        ],
        targets=[
            {
                "risk_level": target.risk_level,
                "target_percent": float(target.target_percent),
                "warning_threshold": float(target.warning_threshold),
            }
            for target in sorted(targets, key=lambda item: RISK_ORDER.index(item.risk_level))
        ],
    )


def save_asset_config(
    session: Session,
    payload: AssetConfigPayload,
    *,
    preserve_missing: bool = False,
) -> AssetConfigPayload:
    if payload.targets and round(sum(item.target_percent for item in payload.targets), 4) != 100:
        raise ValueError("风险目标比例合计必须等于 100%")
    existing_accounts = {
        item.id: item for item in session.scalars(
            select(AssetAccount).where(AssetAccount.user_id == SINGLE_USER_ID)
        )
    }
    existing_positions = {
        item.id: item for item in session.scalars(
            select(AssetPosition).where(AssetPosition.user_id == SINGLE_USER_ID)
        )
    }
    account_names = [item.name.strip() for item in payload.accounts]
    if len(account_names) != len(set(account_names)):
        raise ValueError("账户名称不能重复")
    for account_value in payload.accounts:
        position_names = [item.name.strip() for item in account_value.positions]
        if len(position_names) != len(set(position_names)):
            raise ValueError(f"账户“{account_value.name.strip()}”中存在同名持仓")
    existing_accounts_by_name = {item.name: item for item in existing_accounts.values()}
    existing_positions_by_account_name = {
        (item.asset_account_id, item.name): item for item in existing_positions.values()
    }
    options = _asset_options(session)
    retained_account_ids: set[int] = set()
    retained_position_ids: set[int] = set()
    saved_accounts: list[AssetAccountConfig] = []
    for account_index, account_value in enumerate(payload.accounts):
        account_name = account_value.name.strip()
        account = existing_accounts.get(account_value.id) if account_value.id else existing_accounts_by_name.get(account_name)
        conflicting_account = existing_accounts_by_name.get(account_name)
        if conflicting_account is not None and account is not conflicting_account:
            raise ValueError(f"账户名称“{account_name}”已存在")
        account_was_active = account.is_active if account is not None else False
        if account is None:
            account = AssetAccount(user_id=SINGLE_USER_ID)
            session.add(account)
        account.name = account_name
        account.region = account_value.region
        account.currency = account_value.currency.strip()
        account.asset_category_option_id = account_value.asset_category_option_id
        account.asset_category = _option_value(options, account_value.asset_category_option_id, "asset_category")
        account.target_amount = account_value.target_amount
        account.sort_order = account_value.sort_order or account_index
        account.is_active = account_was_active if preserve_missing else True
        session.flush()
        retained_account_ids.add(account.id)
        saved_positions: list[AssetPositionConfig] = []
        for position_index, position_value in enumerate(account_value.positions):
            position_name = position_value.name.strip()
            existing_by_name = existing_positions_by_account_name.get((account.id, position_name))
            position = existing_positions.get(position_value.id) if position_value.id else existing_by_name
            if existing_by_name is not None and position is not existing_by_name:
                raise ValueError(f"账户“{account.name}”中已存在持仓“{position_name}”")
            position_was_active = position.is_active if position is not None else False
            if position is not None and position.asset_account_id != account.id:
                raise ValueError("持仓不属于指定账户")
            if position is None:
                position = AssetPosition(user_id=SINGLE_USER_ID, asset_account_id=account.id)
                session.add(position)
            position.name = position_name
            position.asset_class_option_id = position_value.asset_class_option_id
            position.asset_class = _option_value(options, position_value.asset_class_option_id, "asset_class")
            position.purpose_option_id = position_value.purpose_option_id
            position.purpose = _option_value(options, position_value.purpose_option_id, "asset_purpose")
            position.risk_option_id = position_value.risk_option_id
            position.risk_level = _option_value(options, position_value.risk_option_id, "asset_risk")
            position.is_investable = position_value.is_investable
            position.sort_order = position_value.sort_order or position_index
            position.is_active = position_was_active if preserve_missing else True
            session.flush()
            retained_position_ids.add(position.id)
            saved_positions.append(position_value.model_copy(update={"id": position.id}))
        saved_accounts.append(account_value.model_copy(update={
            "id": account.id,
            "positions": saved_positions,
        }))
    if not preserve_missing:
        for account in existing_accounts.values():
            if account.id not in retained_account_ids:
                account.is_active = False
        for position in existing_positions.values():
            if position.id not in retained_position_ids:
                position.is_active = False
    target_by_risk = {
        item.risk_level: item for item in session.scalars(
            select(AssetAllocationTarget).where(AssetAllocationTarget.user_id == SINGLE_USER_ID)
        )
    }
    for value in payload.targets:
        target = target_by_risk.get(value.risk_level)
        if target is None:
            target = AssetAllocationTarget(user_id=SINGLE_USER_ID, risk_level=value.risk_level)
            session.add(target)
        target.target_percent = value.target_percent
        target.warning_threshold = value.warning_threshold
    session.commit()
    if preserve_missing:
        return AssetConfigPayload(accounts=saved_accounts, targets=payload.targets)
    return get_asset_config(session)


def save_asset_snapshot(session: Session, payload: AssetSnapshotPayload) -> AssetDashboard:
    if round(sum(item.target_percent for item in payload.targets), 4) != 100:
        raise ValueError("风险目标比例合计必须等于 100%")
    position_ids = [item.position_id for item in payload.items]
    if len(position_ids) != len(set(position_ids)):
        raise ValueError("同一持仓不能重复添加")
    positions = {
        item.id: item for item in session.scalars(
            select(AssetPosition).where(
                AssetPosition.user_id == SINGLE_USER_ID,
            )
        )
    }
    if set(position_ids) - set(positions):
        raise ValueError("快照包含无效持仓")
    snapshot = session.scalar(
        select(AssetSnapshot).where(
            AssetSnapshot.user_id == SINGLE_USER_ID,
            AssetSnapshot.snapshot_date == payload.snapshot_date,
        )
    )
    if snapshot is None:
        snapshot = AssetSnapshot(
            user_id=SINGLE_USER_ID,
            snapshot_date=payload.snapshot_date,
            base_currency="人民币",
        )
        session.add(snapshot)
        session.flush()
    else:
        session.execute(
            delete(AssetSnapshotItem).where(AssetSnapshotItem.asset_snapshot_id == snapshot.id)
        )
        session.execute(
            delete(AssetSnapshotTarget).where(AssetSnapshotTarget.asset_snapshot_id == snapshot.id)
        )
    snapshot.note = payload.note.strip() if payload.note and payload.note.strip() else None
    snapshot.updated_at = datetime.now(UTC)
    for item in payload.items:
        session.add(
            AssetSnapshotItem(
                asset_snapshot_id=snapshot.id,
                asset_position_id=item.position_id,
                amount=item.amount,
                fx_rate=item.fx_rate,
                amount_cny=item.amount * item.fx_rate,
                expected_annual_rate=item.expected_annual_rate,
            )
        )
    session.add_all(
        AssetSnapshotTarget(
            asset_snapshot_id=snapshot.id,
            risk_level=target.risk_level,
            target_percent=target.target_percent,
            warning_threshold=target.warning_threshold,
        )
        for target in payload.targets
    )
    session.commit()
    return get_asset_dashboard(session, snapshot.id)


def _snapshot_totals(
    items: list[AssetSnapshotItem],
    positions: dict[int, AssetPosition],
) -> tuple[float, float]:
    net = sum(float(item.amount_cny) for item in items)
    investable = sum(
        float(item.amount_cny)
        for item in items
        if (position := positions.get(item.asset_position_id)) is not None
        and position.is_investable
    )
    return net, investable


def get_asset_dashboard(session: Session, snapshot_id: int | None = None) -> AssetDashboard:
    active_accounts, active_positions = _accounts_and_positions(session)
    options = _asset_options(session)
    all_accounts = list(session.scalars(
        select(AssetAccount).where(AssetAccount.user_id == SINGLE_USER_ID)
    ))
    all_positions = {
        item.id: item for item in session.scalars(
            select(AssetPosition).where(AssetPosition.user_id == SINGLE_USER_ID)
        )
    }
    snapshots = list(
        session.scalars(
            select(AssetSnapshot)
            .where(AssetSnapshot.user_id == SINGLE_USER_ID)
            .order_by(AssetSnapshot.snapshot_date.desc(), AssetSnapshot.id.desc())
        )
    )
    selected = (
        next((item for item in snapshots if item.id == snapshot_id), None)
        if snapshot_id is not None
        else snapshots[0] if snapshots else None
    )
    if snapshot_id is not None and selected is None:
        raise LookupError("资产快照不存在")
    selected_items = list(
        session.scalars(
            select(AssetSnapshotItem).where(AssetSnapshotItem.asset_snapshot_id == selected.id)
        )
    ) if selected else []
    item_by_position = {item.asset_position_id: item for item in selected_items}
    net_assets, investable_assets = _snapshot_totals(selected_items, all_positions)
    account_by_id = {account.id: account for account in all_accounts}
    domestic_assets = sum(
        float(item.amount_cny)
        for item in selected_items
        if (position := all_positions.get(item.asset_position_id)) is not None
        and (account := account_by_id.get(position.asset_account_id)) is not None
        and account.region == "境内"
    )
    overseas_assets = net_assets - domestic_assets
    previous_change = None
    if selected is not None:
        previous = next(
            (item for item in snapshots if item.snapshot_date < selected.snapshot_date), None
        )
        if previous is not None:
            previous_items = list(
                session.scalars(
                    select(AssetSnapshotItem).where(
                        AssetSnapshotItem.asset_snapshot_id == previous.id
                    )
                )
            )
            previous_net, _ = _snapshot_totals(previous_items, all_positions)
            if previous_net:
                previous_change = round((net_assets / previous_net - 1) * 100, 2)
    snapshot_targets = list(session.scalars(
        select(AssetSnapshotTarget).where(AssetSnapshotTarget.asset_snapshot_id == selected.id)
    )) if selected is not None else []
    if snapshot_targets:
        targets = {item.risk_level: item for item in snapshot_targets}
    else:
        targets = {
            item.risk_level: item for item in session.scalars(
                select(AssetAllocationTarget).where(AssetAllocationTarget.user_id == SINGLE_USER_ID)
            )
        }
    risk_amounts = {risk: 0.0 for risk in RISK_ORDER}
    for item in selected_items:
        position = all_positions.get(item.asset_position_id)
        if position and position.is_investable and position.risk_level in risk_amounts:
            risk_amounts[position.risk_level] += float(item.amount_cny)
    allocation_base = sum(risk_amounts.values())
    allocations = []
    for risk in RISK_ORDER:
        target = targets.get(risk)
        target_percent = float(target.target_percent) if target else 0
        actual_percent = round(risk_amounts[risk] / allocation_base * 100, 2) if allocation_base else 0
        allocations.append(
            AssetAllocationItem(
                risk_level=risk,
                target_percent=target_percent,
                actual_percent=actual_percent,
                amount=round(risk_amounts[risk], 4),
                deviation_percent=round(actual_percent - target_percent, 2),
                warning_threshold=float(target.warning_threshold) if target else 5,
            )
        )
    history = []
    for snapshot in reversed(snapshots):
        items = list(
            session.scalars(
                select(AssetSnapshotItem).where(AssetSnapshotItem.asset_snapshot_id == snapshot.id)
            )
        )
        history_net, history_investable = _snapshot_totals(items, all_positions)
        history.append(
            AssetHistoryPoint(
                snapshot_id=snapshot.id,
                snapshot_date=snapshot.snapshot_date,
                net_assets=round(history_net, 4),
                investable_assets=round(history_investable, 4),
            )
        )
    if selected is not None:
        displayed_positions = [
            position
            for position_id in item_by_position
            if (position := all_positions.get(position_id)) is not None
        ]
        displayed_account_ids = {position.asset_account_id for position in displayed_positions}
        displayed_accounts = [
            account for account in all_accounts if account.id in displayed_account_ids
        ]
    else:
        displayed_positions = active_positions
        displayed_accounts = active_accounts
    displayed_positions.sort(key=lambda item: (item.sort_order, item.id))
    displayed_accounts.sort(key=lambda item: (item.sort_order, item.id))
    positions_by_account: dict[int, list[AssetPosition]] = {}
    for position in displayed_positions:
        positions_by_account.setdefault(position.asset_account_id, []).append(position)
    dashboard_accounts = []
    for account in displayed_accounts:
        dashboard_positions = []
        for position in positions_by_account.get(account.id, []):
            item = item_by_position.get(position.id)
            dashboard_positions.append(
                AssetDashboardPosition(
                    id=position.id,
                    name=position.name,
                    asset_class=_option_value(options, position.asset_class_option_id, "asset_class"),
                    asset_class_option_id=position.asset_class_option_id,
                    purpose=_option_value(options, position.purpose_option_id, "asset_purpose"),
                    purpose_option_id=position.purpose_option_id,
                    risk_level=_option_value(options, position.risk_option_id, "asset_risk"),
                    risk_option_id=position.risk_option_id,
                    is_investable=position.is_investable,
                    sort_order=position.sort_order,
                    amount=float(item.amount) if item else 0,
                    fx_rate=float(item.fx_rate) if item else 1,
                    amount_cny=float(item.amount_cny) if item else 0,
                    expected_annual_rate=(
                        float(item.expected_annual_rate)
                        if item and item.expected_annual_rate is not None else None
                    ),
                )
            )
        dashboard_accounts.append(
            AssetDashboardAccount(
                id=account.id,
                name=account.name,
                region=account.region,
                currency=account.currency,
                asset_category=_option_value(options, account.asset_category_option_id, "asset_category"),
                asset_category_option_id=account.asset_category_option_id,
                target_amount=float(account.target_amount) if account.target_amount is not None else None,
                sort_order=account.sort_order,
                current_amount=round(sum(item.amount_cny for item in dashboard_positions), 4),
                positions=dashboard_positions,
            )
        )
    return AssetDashboard(
        snapshot_id=selected.id if selected else None,
        snapshot_date=selected.snapshot_date if selected else None,
        note=selected.note if selected else None,
        summary=AssetSummary(
            net_assets=round(net_assets, 4),
            investable_assets=round(investable_assets, 4),
            domestic_assets=round(domestic_assets, 4),
            overseas_assets=round(overseas_assets, 4),
            previous_net_change_percent=previous_change,
        ),
        allocations=allocations,
        history=history,
        accounts=dashboard_accounts,
    )
