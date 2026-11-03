from datetime import date
import json
from decimal import Decimal

import httpx

import app.sync.szse_details as szse_details


def test_eid_nav_query_and_parser_use_exact_etf_code() -> None:
    query = json.loads(
        szse_details.eid_nav_query_data(
            "159513", date(2025, 8, 21), date(2026, 8, 21)
        )
    )
    assert {item["name"]: item["value"] for item in query}["fundCode"] == "159513"

    records = szse_details.parse_eid_nav_report(
        {
            "aaData": [
                {
                    "code": "159513",
                    "valuationDate": "2026-08-20",
                    "shareNetValue": "1.6496",
                },
                {
                    "code": "159999",
                    "valuationDate": "2026-08-20",
                    "shareNetValue": "1.0000",
                },
            ]
        },
        "159513",
    )
    assert [(record.nav_date, record.unit_nav) for record in records] == [
        (date(2026, 8, 20), Decimal("1.6496"))
    ]


def test_eid_nav_retries_busy_response() -> None:
    requests: list[httpx.Request] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if len(requests) == 1:
            return httpx.Response(200, json={"success": False, "message": "请求繁忙"})
        return httpx.Response(200, json={
            "success": True,
            "aaData": [{
                "code": "159513",
                "valuationDate": "2026-08-20",
                "shareNetValue": "1.6496",
            }],
        })

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        records, source_url = szse_details.fetch_eid_nav_records(
            client, "159513", date(2026, 8, 21)
        )

    assert len(requests) == 2
    assert all(str(request.url).startswith(szse_details.EID_NAV_URL) for request in requests)
    query = {
        item["name"]: item["value"]
        for item in json.loads(requests[0].url.params["aoData"])
    }
    assert query["startDate"] == "2026-08-06"
    assert query["endDate"] == "2026-08-21"
    assert source_url == szse_details.EID_NAV_URL
    assert [(record.nav_date, record.unit_nav) for record in records] == [
        (date(2026, 8, 20), Decimal("1.6496"))
    ]
    assert szse_details.latest_nav_on_or_before(
        records, date(2026, 8, 21)
    ) == Decimal("1.6496")


def test_estimated_scale_uses_official_share_count_and_same_day_nav() -> None:
    assert szse_details.estimated_scale_cny(
        Decimal("273867.67"), Decimal("3.1922")
    ) == Decimal("8742403761.740000")


def test_select_quote_row_supports_latest_and_explicit_dates() -> None:
    history = [
        {"jyrq": "2026-08-20", "ss": "3.1", "cjje": "1"},
        {"jyrq": "2026-08-19", "ss": "3.0", "cjje": "2"},
    ]

    latest_date, latest = szse_details.select_quote_row(history, None)
    requested_date, requested = szse_details.select_quote_row(
        history, date(2026, 8, 19)
    )

    assert latest_date == date(2026, 8, 20)
    assert latest["ss"] == "3.1"
    assert requested_date == date(2026, 8, 19)
    assert requested["ss"] == "3.0"

    assert [item[0] for item in szse_details.select_quote_rows(history, None)] == [
        date(2026, 8, 20),
        date(2026, 8, 19),
    ]
