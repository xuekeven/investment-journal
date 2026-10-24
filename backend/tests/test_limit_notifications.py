from decimal import Decimal
from datetime import UTC, datetime
from types import SimpleNamespace

from fastapi.testclient import TestClient

from app import limit_notifications
from app.limit_notifications import _event_type, _new_state, format_limit_message
from app.main import app
from app.models import LimitNotificationTestRequest


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


def test_deviation_test_message_uses_selected_scope_and_threshold(monkeypatch) -> None:
    sent: dict[str, str] = {}

    def capture_send(**values: str) -> None:
        sent.update(values)

    monkeypatch.setattr(limit_notifications, "_send_text", capture_send)

    limit_notifications.send_test_limit_notification(
        LimitNotificationTestRequest(
            scope="sp-500",
            kind="deviation",
            deviation_threshold=Decimal("-2.50"),
            deviation_direction="below",
            wework_user_id="XueKai",
            wework_app="main",
        )
    )

    assert sent["recipient"] == "XueKai"
    assert "测试消息｜标普500 · 场内基金" in sent["content"]
    assert "偏离率：-2.50%（低于 -2.50% 提醒）" in sent["content"]


def test_limit_test_message_matches_real_suspension_format() -> None:
    message = limit_notifications.format_test_notification(
        LimitNotificationTestRequest(scope="nasdaq-100", kind="limit", wework_user_id="XueKai"),
        now=datetime(2026, 10, 23, tzinfo=UTC),
    )

    assert message == (
        "🧪 测试消息｜纳斯达克100 · 场外基金\n"
        "📣 基金申购限额变动\n"
        "共 1 项\n\n"
        "⛔ 000000 测试基金（示例）\n"
        "限额：100 人民币 → 0 人民币\n"
        "状态：限额申购 → 暂停申购\n"
        "生效日期：2026-10-23"
    )


def test_row_test_endpoint_sends_selected_kind_without_saving(monkeypatch) -> None:
    sent: dict[str, str] = {}
    monkeypatch.setattr(limit_notifications, "_send_text", lambda **values: sent.update(values))

    response = TestClient(app).post("/api/v1/limit-notifications/test", json={
        "scope": "nasdaq-100",
        "kind": "limit",
        "weworkUserId": "XueKai",
        "weworkApp": "main",
    })

    assert response.status_code == 200
    assert response.json() == {"sent": True}
    assert "测试消息｜纳斯达克100 · 场外基金" in sent["content"]


def test_deviation_direction_is_independent_of_threshold_sign_and_includes_equal_value() -> None:
    assert limit_notifications.deviation_reached(2.0, Decimal("2.00"), "above")
    assert not limit_notifications.deviation_reached(1.99, Decimal("2.00"), "above")
    assert limit_notifications.deviation_reached(-2.0, Decimal("-2.00"), "below")
    assert not limit_notifications.deviation_reached(-1.99, Decimal("-2.00"), "below")
    assert limit_notifications.deviation_reached(-1.0, Decimal("-2.00"), "above")
    assert limit_notifications.deviation_reached(1.0, Decimal("2.00"), "below")


def test_deviation_message_shows_value_threshold_and_quote_date() -> None:
    event = SimpleNamespace(
        event_type="deviation",
        fund_code="513100",
        fund_name="纳斯达克100ETF",
        previous_state=None,
        current_state={"deviation": 2.0, "threshold": 2.0, "direction": "above", "quote_date": "2026-10-23"},
        effective_from=None,
    )

    message = format_limit_message([event])

    assert "基金偏离提醒" in message
    assert "偏离率：2.00%（高于 2.00% 提醒）" in message
    assert "行情日期：2026-10-23" in message
