from datetime import date

import pytest

from app.exchange_rates import ExchangeRateUnavailableError, parse_cfets_usd_cny_rate


def test_parse_cfets_usd_cny_rate_uses_usd_cny_midpoint() -> None:
    rate = parse_cfets_usd_cny_rate({
        "data": {"lastDate": "2026-11-10 9:15"},
        "records": [
            {"vrtEName": "EUR/CNY", "price": "7.5071"},
            {"vrtEName": "USD/CNY", "price": "6.7167"},
        ],
    })
    assert rate.rate == 6.7167
    assert rate.rate_date == date(2026, 11, 10)
    assert rate.source == "CFETS"


@pytest.mark.parametrize("price", ["0", "NaN", "bad"])
def test_parse_cfets_usd_cny_rate_rejects_invalid_price(price: str) -> None:
    with pytest.raises(ExchangeRateUnavailableError):
        parse_cfets_usd_cny_rate({
            "data": {"lastDate": "2026-11-10 9:15"},
            "records": [{"vrtEName": "USD/CNY", "price": price}],
        })
