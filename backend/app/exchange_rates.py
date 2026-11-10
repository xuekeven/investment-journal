from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal, InvalidOperation
from threading import Lock

import httpx

from app.models import UsdCnyRate


# 中国人民银行授权中国外汇交易中心在中国货币网公布人民币汇率中间价。
CFETS_DAILY_RATES_URL = "https://www.chinamoney.com.cn/r/cms/www/chinamoney/data/fx/ccpr.json"
CACHE_DURATION = timedelta(hours=1)
MAX_RATE_AGE = timedelta(days=7)


class ExchangeRateUnavailableError(RuntimeError):
    pass


_cache_lock = Lock()
_cached_rate: UsdCnyRate | None = None
_cached_at: datetime | None = None


def parse_cfets_usd_cny_rate(payload: dict) -> UsdCnyRate:
    try:
        rate_date = date.fromisoformat(payload["data"]["lastDate"].split()[0])
        record = next(row for row in payload["records"] if row["vrtEName"] == "USD/CNY")
        rate = Decimal(record["price"])
        if not rate.is_finite() or rate <= 0:
            raise ValueError("Invalid USD/CNY central parity")
        return UsdCnyRate(rate=float(rate), rate_date=rate_date, source="CFETS")
    except (KeyError, TypeError, IndexError, StopIteration, InvalidOperation, ValueError) as exc:
        raise ExchangeRateUnavailableError("中国货币网汇率数据不可用") from exc


def get_usd_cny_rate() -> UsdCnyRate:
    global _cached_at, _cached_rate

    with _cache_lock:
        now = datetime.now(UTC)
        if _cached_rate is not None and _cached_at is not None:
            if now - _cached_at < CACHE_DURATION:
                return _cached_rate

        try:
            response = httpx.get(
                CFETS_DAILY_RATES_URL,
                timeout=10,
                follow_redirects=True,
                trust_env=False,
            )
            response.raise_for_status()
            rate = parse_cfets_usd_cny_rate(response.json())
            if now.date() - rate.rate_date > MAX_RATE_AGE:
                raise ExchangeRateUnavailableError("中国货币网汇率日期过旧")
        except (httpx.HTTPError, ValueError, ExchangeRateUnavailableError) as exc:
            if _cached_rate is not None and now.date() - _cached_rate.rate_date <= MAX_RATE_AGE:
                return _cached_rate
            raise ExchangeRateUnavailableError("暂时无法获取美元兑人民币中间价") from exc

        _cached_rate = rate
        _cached_at = now
        return rate
