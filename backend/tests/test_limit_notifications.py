from decimal import Decimal
from datetime import UTC, datetime
from types import SimpleNamespace

from app import limit_notifications
from app.limit_notifications import _event_type, _new_state, format_limit_message
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


def test_suspension_message_displays_zero_limit() -> None:
    event = SimpleNamespace(
        event_type="suspended",
        fund_code="006479",
        fund_name="广发纳指100ETF联接（QDII）人民币C",
        previous_state=_new_state("limited", Decimal("10"), "人民币"),
        current_state=_new_state("suspended", None, "人民币"),
        effective_from=datetime(2026, 10, 15, tzinfo=UTC),
    )

    message = format_limit_message([event])

    assert "限额：10 人民币 → 0 人民币" in message
    assert "状态：限额申购 → 暂停申购" in message
    assert "无固定限额" not in message


def test_reparsing_same_announcement_does_not_enqueue_change() -> None:
    class NoNotificationSession:
        def scalars(self, _query: object) -> None:
            raise AssertionError("same-source correction must not query subscriptions")

        def scalar(self, _query: object) -> None:
            raise AssertionError("same-source correction must not query outbox")

    limit_notifications.enqueue_limit_change(
        NoNotificationSession(),
        share_id=1,
        previous_record=SimpleNamespace(source_url="https://example.test/notice.pdf"),
        status="limited",
        amount=Decimal("100"),
        currency="人民币",
        source_url="https://example.test/notice.pdf",
        effective_from=datetime(2026, 6, 4, tzinfo=UTC),
        detected_at=datetime(2026, 10, 13, tzinfo=UTC),
    )


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
