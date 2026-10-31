from datetime import UTC, date, datetime
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock

from sqlalchemy.dialects import postgresql

from app.sync.daily_deviation import sync_daily_deviations


def _session(quotes, navs):
    session = Mock()
    session.execute.side_effect = [
        Mock(all=lambda: quotes),
        Mock(all=lambda: navs),
        *([None] * (len(quotes) + 1)),
    ]
    return session


def _quote(day: int, close: str):
    return SimpleNamespace(
        trade_date=date(2026, 10, day), close_price=Decimal(close), source_url="quote"
    )


def _nav(day: int, value: str):
    return SimpleNamespace(
        nav_date=date(2026, 10, day), unit_nav=Decimal(value), source_url="nav"
    )


def test_daily_deviation_saves_same_day_nav_and_removes_unmatched_value() -> None:
    session = _session([_quote(21, "1.02"), _quote(22, "1.03")], [_nav(21, "1.00")])

    saved = sync_daily_deviations(
        session,
        listing_id=1,
        share_id=2,
        index_definition_id="test-index",
        allow_lagged_nav=False,
        collected_at=datetime(2026, 10, 23, tzinfo=UTC),
    )

    assert saved == 1
    statement = session.execute.call_args_list[2].args[0]
    params = statement.compile(dialect=postgresql.dialect()).params
    assert params["period_end"] == date(2026, 10, 21)
    assert params["value"] == Decimal("2.0")
    assert params["calculation_inputs"]["nav_date"] == "2026-10-21"
    assert len(session.execute.call_args_list) == 5  # invalid 22nd and legacy values are cleared


def test_daily_deviation_allows_recent_qdii_nav_but_not_stale_nav() -> None:
    session = _session([_quote(22, "1.03"), _quote(30, "1.05")], [_nav(21, "1.00")])

    saved = sync_daily_deviations(
        session,
        listing_id=1,
        share_id=2,
        index_definition_id="test-index",
        allow_lagged_nav=True,
        collected_at=datetime(2026, 10, 31, tzinfo=UTC),
    )

    assert saved == 1
    statement = session.execute.call_args_list[2].args[0]
    params = statement.compile(dialect=postgresql.dialect()).params
    assert params["period_end"] == date(2026, 10, 22)
    assert params["value"] == Decimal("3.0")
    assert params["calculation_inputs"]["nav_date"] == "2026-10-21"
    assert len(session.execute.call_args_list) == 5  # stale NAV and legacy values are cleared


def test_qdii_deviation_uses_prior_nav_even_if_same_day_nav_exists() -> None:
    session = _session(
        [_quote(26, "1.969")],
        [_nav(23, "1.8513"), _nav(26, "1.8632")],
    )

    saved = sync_daily_deviations(
        session,
        listing_id=1,
        share_id=2,
        index_definition_id="test-index",
        allow_lagged_nav=True,
        collected_at=datetime(2026, 10, 27, tzinfo=UTC),
    )

    assert saved == 1
    statement = session.execute.call_args_list[2].args[0]
    params = statement.compile(dialect=postgresql.dialect()).params
    assert params["calculation_inputs"]["nav_date"] == "2026-10-23"
    assert params["value"] == Decimal("6.3577")
