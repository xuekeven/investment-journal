from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha256
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_session_factory
from app.database_models import (
    FundProduct,
    FundShareClass,
    LimitNotificationOutbox,
    LimitNotificationSubscription,
    SalesLimitHistory,
    UserFundTag,
)
from app.models import LimitNotificationConfig, LimitNotificationConfigUpdate


SINGLE_USER_ID = "default"
INDEX_SCOPES = {"sp-500", "nasdaq-100", "csi-500"}
TAG_SCOPES = {"favorite", "holding", "recurring"}
STATUS_LABELS = {"open": "开放申购", "limited": "限额申购", "suspended": "暂停申购"}
SCOPE_LABELS = {
    "sp-500": "标普500",
    "nasdaq-100": "纳斯达克100",
    "csi-500": "中证500",
    "favorite": "收藏标签",
    "holding": "持有标签",
    "recurring": "定投标签",
}


def _config_response(
    row: LimitNotificationSubscription | None,
    scope: str = "sp-500",
) -> LimitNotificationConfig:
    settings = get_settings()
    if row is None:
        return LimitNotificationConfig(
            scope=scope,
            relay_configured=bool(settings.wework_relay_api_key),
        )
    return LimitNotificationConfig(
        enabled=row.enabled,
        scope=row.scope_value,
        fund_type=row.fund_type,
        wework_user_id=row.wework_user_id,
        wework_app=row.wework_app,
        relay_configured=bool(settings.wework_relay_api_key),
        last_sent_at=row.last_sent_at,
        last_error=row.last_error,
    )


def get_limit_notification_config(
    session: Session,
    scope: str | None = None,
) -> LimitNotificationConfig:
    if scope is not None and scope not in INDEX_SCOPES | TAG_SCOPES:
        raise ValueError("不支持的订阅范围")
    statement = select(LimitNotificationSubscription).where(
        LimitNotificationSubscription.user_id == SINGLE_USER_ID
    )
    if scope is not None:
        statement = statement.where(LimitNotificationSubscription.scope_value == scope)
    else:
        statement = statement.order_by(
            LimitNotificationSubscription.enabled.desc(),
            LimitNotificationSubscription.id,
        )
    row = session.scalar(statement.limit(1))
    return _config_response(row, scope or "sp-500")


def save_limit_notification_config(
    session: Session, payload: LimitNotificationConfigUpdate
) -> LimitNotificationConfig:
    scope_type = "index" if payload.scope in INDEX_SCOPES else "tag"
    if payload.scope not in INDEX_SCOPES | TAG_SCOPES:
        raise ValueError("不支持的订阅范围")
    if payload.enabled and not payload.wework_user_id.strip():
        raise ValueError("开启提醒时必须填写企业微信 userid")
    row = session.scalar(
        select(LimitNotificationSubscription).where(
            LimitNotificationSubscription.user_id == SINGLE_USER_ID,
            LimitNotificationSubscription.scope_type == scope_type,
            LimitNotificationSubscription.scope_value == payload.scope,
        )
    )
    values = payload.model_dump()
    values.update(
        scope_type=scope_type,
        scope_value=values.pop("scope"),
        wework_user_id=payload.wework_user_id.strip(),
        wework_app=payload.wework_app.strip() or "main",
        notify_limit_decrease=True,
        notify_limit_increase=True,
        notify_suspended=True,
        notify_resumed=True,
        notify_first_seen=True,
    )
    if row is None:
        row = LimitNotificationSubscription(user_id=SINGLE_USER_ID, **values)
        session.add(row)
    else:
        for key, value in values.items():
            setattr(row, key, value)
    session.commit()
    session.refresh(row)
    return _config_response(row)


def _state(record: SalesLimitHistory | None) -> dict[str, Any] | None:
    if record is None:
        return None
    return {
        "status": record.limit_status,
        "amount": str(record.limit_amount) if record.limit_amount is not None else None,
        "currency": record.currency,
    }


def _new_state(status: str, amount: Decimal | None, currency: str) -> dict[str, Any]:
    return {
        "status": status,
        "amount": str(amount) if amount is not None else None,
        "currency": currency,
    }


def _event_type(previous: dict[str, Any] | None, current: dict[str, Any]) -> str | None:
    if previous is None:
        return "first_seen"
    if previous == current:
        return None
    if current["status"] == "suspended" and previous["status"] != "suspended":
        return "suspended"
    if previous["status"] == "suspended" and current["status"] != "suspended":
        return "resumed"
    old_amount = Decimal(previous["amount"]) if previous.get("amount") is not None else None
    new_amount = Decimal(current["amount"]) if current.get("amount") is not None else None
    if old_amount is not None and new_amount is not None:
        if new_amount < old_amount:
            return "limit_decrease"
        if new_amount > old_amount:
            return "limit_increase"
    if current["status"] == "open":
        return "resumed"
    if current["status"] == "limited":
        return "limit_decrease"
    return None


def _subscribed(
    session: Session,
    subscription: LimitNotificationSubscription,
    share_id: int,
) -> tuple[FundShareClass, FundProduct] | None:
    row = session.execute(
        select(FundShareClass, FundProduct)
        .join(FundProduct, FundProduct.id == FundShareClass.fund_product_id)
        .where(FundShareClass.id == share_id)
    ).one_or_none()
    if row is None:
        return None
    share, product = row
    venue = "on_exchange" if product.trading_venue == "仅场内" else "off_exchange"
    if subscription.fund_type != "all" and subscription.fund_type != venue:
        return None
    if subscription.scope_type == "index":
        if product.exact_benchmark_id != f"{subscription.scope_value}-price-cny":
            return None
    else:
        tagged = session.scalar(
            select(UserFundTag.id).where(
                UserFundTag.user_id == SINGLE_USER_ID,
                UserFundTag.fund_share_class_id == share_id,
                UserFundTag.tag_type == subscription.scope_value,
            )
        )
        if tagged is None:
            return None
    return share, product


def enqueue_limit_change(
    session: Session,
    *,
    share_id: int,
    previous_record: SalesLimitHistory | None,
    status: str,
    amount: Decimal | None,
    currency: str,
    effective_from: datetime,
    detected_at: datetime,
) -> None:
    # Parser unit tests use a deliberately minimal session double. Notification
    # persistence is an integration concern and only runs with a real session.
    if not hasattr(session, "scalar"):
        return
    subscriptions = list(session.scalars(
        select(LimitNotificationSubscription).where(
            LimitNotificationSubscription.user_id == SINGLE_USER_ID,
            LimitNotificationSubscription.enabled.is_(True),
        )
    ))
    if not subscriptions:
        return
    previous = _state(previous_record)
    current = _new_state(status, amount, currency)
    event_type = _event_type(previous, current)
    if event_type is None:
        return
    for subscription in subscriptions:
        fund = _subscribed(session, subscription, share_id)
        if fund is None:
            continue
        share, _ = fund
        raw_key = f"{subscription.id}|{share_id}|{event_type}|{previous}|{current}|{effective_from.isoformat()}"
        event_key = sha256(raw_key.encode("utf-8")).hexdigest()
        if session.scalar(select(LimitNotificationOutbox.id).where(LimitNotificationOutbox.event_key == event_key)):
            continue
        session.add(
            LimitNotificationOutbox(
                subscription_id=subscription.id,
                fund_share_class_id=share_id,
                event_key=event_key,
                event_type=event_type,
                fund_code=share.code,
                fund_name=share.display_name,
                previous_state=previous,
                current_state=current,
                effective_from=effective_from,
                detected_at=detected_at,
            )
        )


def _format_amount(state: dict[str, Any] | None) -> str:
    if state is None or state.get("amount") is None:
        return "无固定限额"
    amount = Decimal(state["amount"])
    return f"{amount:,.2f}".rstrip("0").rstrip(".") + f" {state.get('currency') or '人民币'}"


def format_limit_message(events: list[LimitNotificationOutbox]) -> str:
    lines = ["📣 基金申购限额变动", f"共 {len(events)} 项", ""]
    icons = {
        "limit_decrease": "🔻",
        "limit_increase": "🔺",
        "suspended": "⛔",
        "resumed": "🔓",
        "first_seen": "ℹ️",
    }
    for event in events[:20]:
        previous = event.previous_state
        current = event.current_state
        lines.append(f"{icons[event.event_type]} {event.fund_code} {event.fund_name}")
        if previous is not None and previous.get("amount") != current.get("amount"):
            lines.append(f"限额：{_format_amount(previous)} → {_format_amount(current)}")
        old_status = STATUS_LABELS.get(previous.get("status"), previous.get("status")) if previous else "首次发现"
        new_status = STATUS_LABELS.get(current.get("status"), current.get("status"))
        lines.append(f"状态：{old_status} → {new_status}")
        if event.effective_from is not None:
            effective_date = event.effective_from.astimezone(ZoneInfo("Asia/Shanghai")).date()
            lines.append(f"生效日期：{effective_date.isoformat()}")
        lines.append("")
    if len(events) > 20:
        lines.append(f"另有 {len(events) - 20} 项，请到投资札记查看。")
    return "\n".join(lines).strip()


def _send_text(*, app: str, recipient: str, content: str, idempotency_key: str) -> None:
    settings = get_settings()
    if not settings.wework_relay_api_key:
        raise RuntimeError("未配置 IFC_WEWORK_RELAY_API_KEY")
    # The relay is a Tailnet-internal service. Bypass workstation HTTP/SOCKS
    # proxy variables so MagicDNS traffic stays direct and does not require
    # optional SOCKS dependencies.
    with httpx.Client(trust_env=False, timeout=15) as client:
        response = client.post(
            f"{settings.wework_relay_url.rstrip('/')}/wework/send/message",
            headers={
                "Authorization": f"Bearer {settings.wework_relay_api_key}",
                "Idempotency-Key": idempotency_key,
            },
            json={"app": app, "touser": recipient, "content": content},
        )
    response.raise_for_status()


def send_test_limit_notification(payload: LimitNotificationConfigUpdate) -> None:
    scope_label = SCOPE_LABELS[payload.scope]
    _send_text(
        app=payload.wework_app.strip() or "main",
        recipient=payload.wework_user_id.strip(),
        content=(
            "📣 投资札记限额变动提醒\n"
            f"测试订阅【{scope_label}】消息发送成功。"
        ),
        idempotency_key=f"investment-journal:test:{datetime.now(UTC).strftime('%Y%m%d%H%M%S%f')}",
    )


def _dispatch_subscription(
    session: Session,
    subscription: LimitNotificationSubscription,
) -> int:
    first_event = session.scalar(
        select(LimitNotificationOutbox)
        .where(
            LimitNotificationOutbox.subscription_id == subscription.id,
            LimitNotificationOutbox.status.in_(("pending", "sending", "failed")),
            LimitNotificationOutbox.attempts < 5,
        )
        .order_by(LimitNotificationOutbox.detected_at, LimitNotificationOutbox.id)
        .limit(1)
    )
    if first_event is None:
        return 0
    if first_event.delivery_key:
        events = list(
            session.scalars(
                select(LimitNotificationOutbox)
                .where(
                    LimitNotificationOutbox.subscription_id == subscription.id,
                    LimitNotificationOutbox.delivery_key == first_event.delivery_key,
                    LimitNotificationOutbox.status != "sent",
                )
                .order_by(LimitNotificationOutbox.detected_at, LimitNotificationOutbox.id)
            )
        )
        delivery_key = first_event.delivery_key
    else:
        events = list(
            session.scalars(
                select(LimitNotificationOutbox)
                .where(
                    LimitNotificationOutbox.subscription_id == subscription.id,
                    LimitNotificationOutbox.delivery_key.is_(None),
                    LimitNotificationOutbox.status.in_(("pending", "failed")),
                    LimitNotificationOutbox.attempts < 5,
                )
                .order_by(LimitNotificationOutbox.detected_at, LimitNotificationOutbox.id)
                .limit(100)
            )
        )
        event_ids = ",".join(str(event.id) for event in events)
        delivery_key = sha256(
            f"{subscription.id}|{event_ids}".encode("utf-8")
        ).hexdigest()
        for event in events:
            event.delivery_key = delivery_key
    if not events:
        return 0
    for event in events:
        event.status = "sending"
        event.attempts += 1
    session.commit()
    try:
        _send_text(
            app=subscription.wework_app,
            recipient=subscription.wework_user_id,
            content=format_limit_message(events),
            idempotency_key=f"investment-journal:fund-limit:{delivery_key}",
        )
    except Exception as exc:
        message = str(exc)[:2000]
        for event in events:
            event.status = "failed"
            event.last_error = message
        subscription.last_error = message
        session.commit()
        return 0
    sent_at = datetime.now(UTC)
    for event in events:
        event.status = "sent"
        event.sent_at = sent_at
        event.last_error = None
    subscription.last_sent_at = sent_at
    subscription.last_error = None
    session.commit()
    return len(events)


def dispatch_pending_limit_notifications() -> int:
    with get_session_factory()() as session:
        subscriptions = list(
            session.scalars(
                select(LimitNotificationSubscription)
                .where(
                    LimitNotificationSubscription.user_id == SINGLE_USER_ID,
                    LimitNotificationSubscription.enabled.is_(True),
                )
                .order_by(LimitNotificationSubscription.id)
            )
        )
        return sum(
            _dispatch_subscription(session, subscription)
            for subscription in subscriptions
        )
