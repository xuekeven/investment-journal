"""Persist exchange ETF deviations from saved closing prices and official NAVs."""

from __future__ import annotations

import argparse
from bisect import bisect_left, bisect_right
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.database import get_session_factory
from app.database_models import (
    CalculatedMetric,
    FundListing,
    FundProduct,
    FundShareClass,
    MarketQuote,
    NavDaily,
)
from app.repository import (
    DAILY_DEVIATION_CALCULATION_VERSION,
    DAILY_DEVIATION_METRIC_CODE,
    calculate_estimated_deviation,
)


LEGACY_CALCULATION_VERSION = "close-official-nav-v1"


def is_qdii(scopes: list[str]) -> bool:
    return any("QDII" in str(scope).upper() for scope in scopes)


def sync_daily_deviations(
    session: Session,
    *,
    listing_id: int,
    share_id: int,
    index_definition_id: str | None,
    allow_lagged_nav: bool,
    collected_at: datetime,
) -> int:
    """Recalculate saved quote dates, including NAVs disclosed after the first sync."""
    quotes = session.execute(
        select(MarketQuote.trade_date, MarketQuote.close_price, MarketQuote.source_url)
        .where(MarketQuote.fund_listing_id == listing_id)
        .order_by(MarketQuote.trade_date)
    ).all()
    navs = session.execute(
        select(NavDaily.nav_date, NavDaily.unit_nav, NavDaily.source_url)
        .where(NavDaily.fund_share_class_id == share_id)
        .order_by(NavDaily.nav_date)
    ).all()
    nav_dates = [nav.nav_date for nav in navs]
    unmatched_dates: list[date] = []
    saved = 0

    for quote in quotes:
        nav_index = (
            bisect_left(nav_dates, quote.trade_date)
            if allow_lagged_nav else bisect_right(nav_dates, quote.trade_date)
        ) - 1
        if nav_index < 0:
            unmatched_dates.append(quote.trade_date)
            continue
        nav = navs[nav_index]
        value = calculate_estimated_deviation(
            float(quote.close_price),
            quote.trade_date,
            float(nav.unit_nav),
            nav.nav_date,
            allow_lagged_nav=allow_lagged_nav,
        )
        if value is None:
            unmatched_dates.append(quote.trade_date)
            continue

        values = {
            "index_definition_id": index_definition_id,
            "value": Decimal(str(value)),
            "value_unit": "percent",
            "calculation_inputs": {
                "method": "close_over_official_nav_minus_one",
                "listing_id": listing_id,
                "close_price": str(quote.close_price),
                "quote_date": quote.trade_date.isoformat(),
                "unit_nav": str(nav.unit_nav),
                "nav_date": nav.nav_date.isoformat(),
                "nav_source_url": nav.source_url,
            },
            "source_url": quote.source_url,
            "source_time": collected_at,
            "effective_from": collected_at,
            "collected_at": collected_at,
            "quality_status": "estimated",
        }
        statement = insert(CalculatedMetric).values(
            fund_share_class_id=share_id,
            metric_code=DAILY_DEVIATION_METRIC_CODE,
            period_start=quote.trade_date,
            period_end=quote.trade_date,
            calculation_version=DAILY_DEVIATION_CALCULATION_VERSION,
            **values,
        )
        session.execute(statement.on_conflict_do_update(
            constraint="uq_calculated_metric_identity",
            set_=values,
        ))
        saved += 1

    if unmatched_dates:
        session.execute(
            delete(CalculatedMetric).where(
                CalculatedMetric.fund_share_class_id == share_id,
                CalculatedMetric.metric_code == DAILY_DEVIATION_METRIC_CODE,
                CalculatedMetric.calculation_version == DAILY_DEVIATION_CALCULATION_VERSION,
                CalculatedMetric.period_end.in_(unmatched_dates),
            )
        )
    session.execute(
        delete(CalculatedMetric).where(
            CalculatedMetric.fund_share_class_id == share_id,
            CalculatedMetric.metric_code == DAILY_DEVIATION_METRIC_CODE,
            CalculatedMetric.calculation_version == LEGACY_CALCULATION_VERSION,
        )
    )
    return saved


def backfill_daily_deviations(*, dry_run: bool = False) -> tuple[int, int]:
    """Populate existing history without fetching market or NAV data again."""
    with get_session_factory()() as session:
        listings = session.execute(
            select(
                FundListing.id,
                FundListing.fund_share_class_id,
                FundProduct.exact_benchmark_id,
                FundProduct.investment_scopes,
            )
            .join(FundShareClass, FundShareClass.id == FundListing.fund_share_class_id)
            .join(FundProduct, FundProduct.id == FundShareClass.fund_product_id)
            .where(FundListing.status == "listed")
        ).all()
        collected_at = datetime.now(UTC)
        count = sum(
            sync_daily_deviations(
                session,
                listing_id=listing.id,
                share_id=listing.fund_share_class_id,
                index_definition_id=listing.exact_benchmark_id,
                allow_lagged_nav=is_qdii(listing.investment_scopes),
                collected_at=collected_at,
            )
            for listing in listings
        )
        if dry_run:
            session.rollback()
        else:
            session.commit()
    return len(listings), count


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill saved daily exchange deviations")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    listings, values = backfill_daily_deviations(dry_run=args.dry_run)
    action = "validated" if args.dry_run else "saved"
    print(f"Daily deviations {action}: {values} trading days across {listings} listings")


if __name__ == "__main__":
    main()
