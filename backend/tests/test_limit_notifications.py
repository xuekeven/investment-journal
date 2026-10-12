from decimal import Decimal

from app import limit_notifications
from app.limit_notifications import _event_type, _new_state
from app.models import LimitNotificationConfigUpdate


def test_limit_change_classification() -> None:
    previous = _new_state("limited", Decimal("10000"), "人民币")

    assert _event_type(previous, _new_state("limited", Decimal("1000"), "人民币")) == "limit_decrease"
    assert _event_type(previous, _new_state("limited", Decimal("20000"), "人民币")) == "limit_increase"
    assert _event_type(previous, _new_state("suspended", None, "人民币")) == "suspended"
    assert _event_type(_new_state("suspended", None, "人民币"), previous) == "resumed"


def test_same_limit_is_not_a_change_and_first_seen_is_explicit() -> None:
    current = _new_state("limited", Decimal("1000"), "人民币")

    assert _event_type(current, current) is None
    assert _event_type(None, current) == "first_seen"


def test_test_message_uses_selected_scope_label(monkeypatch) -> None:
    sent: dict[str, str] = {}

    def capture_send(**values: str) -> None:
        sent.update(values)

    monkeypatch.setattr(limit_notifications, "_send_text", capture_send)

    limit_notifications.send_test_limit_notification(
        LimitNotificationConfigUpdate(
            scope="sp-500",
            wework_user_id="XueKai",
            wework_app="main",
        )
    )

    assert sent["content"] == (
        "📣 投资札记限额变动提醒\n"
        "测试订阅【标普500】消息发送成功。"
    )
