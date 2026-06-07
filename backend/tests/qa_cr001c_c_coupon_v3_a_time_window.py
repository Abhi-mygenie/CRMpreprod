"""
CR-001C-C V3-A — Time-window / Happy-hour QA harness.

Covers ~25 V3-A assertions per the implementation plan. V1 + V2 regression
must be re-run separately (`qa_cr001c_c_coupon_v1.py`,
`qa_cr001c_c_coupon_v2_item_category.py`) and remain at 45/45 each.

Strategy: synthetic `user_id = "QA_C3A_USER_<run-id>"` so it does NOT pollute
real CRM users. Cleanup removes seeded coupons + usage on teardown.

Run: python -m backend.tests.qa_cr001c_c_coupon_v3_a_time_window
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from unittest.mock import patch

sys.path.insert(0, "/app/backend")

from core.database import db  # noqa: E402
from core import coupon as coupon_module  # noqa: E402
from core.coupon import (  # noqa: E402
    validate_coupon_for_customer,
    list_available_coupons,
    record_coupon_usage_for_order,
    _v3a_is_within_time_window,
    _v3a_has_window,
    _v3a_resolve_effective_tz,
    _v3a_compute_next_window_start,
    _v3a_parse_hhmm,
)
from services.analytics_service import get_coupon_stats  # noqa: E402
from tests.seed_coupon_v1_fixtures import seed, cleanup  # noqa: E402

RESULTS: list[dict] = []
RUN_ID = uuid.uuid4().hex[:8]
USER_ID = f"QA_C3A_USER_{RUN_ID}"
CUSTOMER_ID = f"QA_C3A_CUST_{RUN_ID}"


def _record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"case": name, "ok": ok, "detail": detail})


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    _record(name, bool(cond), detail if not cond else "")


# ---------------------------------------------------------------------------
# Time freezing helpers
# ---------------------------------------------------------------------------
class _FrozenDatetime(datetime):
    """A datetime subclass that returns a frozen UTC time from `.now(tz)`."""
    _frozen_utc: datetime = datetime.now(timezone.utc)

    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        v = cls._frozen_utc
        if tz is None:
            return v.replace(tzinfo=None)
        return v.astimezone(tz)


def _freeze(utc_dt: datetime):
    """Returns a patcher that freezes `core.coupon.datetime.now` to `utc_dt`."""
    _FrozenDatetime._frozen_utc = utc_dt.astimezone(timezone.utc)
    return patch.object(coupon_module, "datetime", _FrozenDatetime)


async def setup() -> None:
    await seed(db, USER_ID, CUSTOMER_ID)


async def teardown() -> None:
    await cleanup(db, USER_ID)
    await db.coupon_transactions.delete_many({"user_id": USER_ID})


# ---------------------------------------------------------------------------
# Test cases
# ---------------------------------------------------------------------------
async def qa_window_evaluation() -> None:
    """V3A-01..06 — core window evaluation."""
    ist = ZoneInfo("Asia/Kolkata")

    # V3A-01: Wed 16:00 IST — within window
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-01 within window Wed 16:00 IST",
        r["ok"] and r["computed_discount"] == 100.0 and r["time_window_status"]["within_window"] is True,
        json.dumps(r.get("error") or {}),
    )

    # V3A-02: Wed 12:00 IST — before window
    wed_before = datetime(2026, 2, 11, 12, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_before):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-02 before window Wed 12:00 IST → OUTSIDE_TIME_WINDOW",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW"
        and r.get("time_window_status", {}).get("next_window_start") is not None,
        json.dumps(r),
    )

    # V3A-03: Wed 18:00 IST — boundary (exclusive end) → outside
    wed_boundary = datetime(2026, 2, 11, 18, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_boundary):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-03 boundary end_time 18:00 is OUTSIDE (exclusive end)",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW",
    )

    # V3A-04: Saturday 16:00 IST — not in valid_days
    sat = datetime(2026, 2, 14, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(sat):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-04 Saturday not in valid_days → OUTSIDE_TIME_WINDOW",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW",
    )

    # V3A-05: Zero-width window — start==end → treated as overnight wrap (never within ... within both)
    # Defensive: admin CRUD validator rejects in normal path; runtime should handle gracefully.
    # We synthesize the coupon doc and call the helper directly.
    bad_coupon = {"valid_days": [0,1,2,3,4], "start_time": "09:00", "end_time": "09:00"}
    tz_obj = ist
    now_utc = datetime(2026, 2, 11, 10, 0, tzinfo=ist).astimezone(timezone.utc)
    within, status = _v3a_is_within_time_window(bad_coupon, now_utc, tz_obj, "Asia/Kolkata", None)
    # When start == end, overnight branch sets within_today = (now >= start) OR (now < end)
    # That covers all 24h → "always within". This is the documented defensive behavior.
    await _assert(
        "V3A-05 zero-width window defensive behavior (always within in fallback)",
        within is True,
    )

    # V3A-06: No window configured → control path
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3A_NOWINDOW",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
    )
    await _assert(
        "V3A-06 no window → status emitted with configured=False",
        r["ok"] and r["time_window_status"]["configured"] is False
        and r["time_window_status"]["within_window"] is True,
        json.dumps(r.get("time_window_status") or {}),
    )


async def qa_overnight_wrap() -> None:
    """V3A-07..08 — overnight window wrap."""
    ist = ZoneInfo("Asia/Kolkata")

    # V3A-07: Friday 22:00 → Saturday 02:00 window. Saturday 01:00 IST → within.
    sat_early = datetime(2026, 2, 14, 1, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(sat_early):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_OVERNIGHT",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-07 overnight wrap Saturday 01:00 IST is within Friday window",
        r["ok"] and r["computed_discount"] == 50.0,
        json.dumps(r.get("error") or {}),
    )

    # V3A-08: Saturday 23:00 IST → outside (Saturday not in valid_days, window not yet started)
    sat_late = datetime(2026, 2, 14, 23, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(sat_late):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_OVERNIGHT",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-08 Saturday 23:00 IST is OUTSIDE (Saturday not in valid_days)",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW",
    )


async def qa_timezone_resolution() -> None:
    """V3A-09..11 — timezone resolution chain."""
    ist = ZoneInfo("Asia/Kolkata")

    # V3A-09: coupon.timezone="America/New_York" wins; coupon is 15:00-18:00 NY.
    # Wed 16:00 IST = ~05:30 NY → OUTSIDE NY window.
    code_ny = f"QA_C3A_NYHAPPY_{RUN_ID}".upper()
    coupon_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one({
        "id": coupon_id, "user_id": USER_ID, "code": code_ny,
        "discount_type": "percentage", "discount_value": 20.0,
        "start_date": "2020-01-01T00:00:00+00:00",
        "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0, "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "is_active": True, "total_used": 0, "created_at": now_iso,
        "coupon_type": "order", "stackable_with_loyalty": False,
        "valid_days": [0,1,2,3,4], "start_time": "15:00", "end_time": "18:00",
        "timezone": "America/New_York", "offer_type": "simple", "per_user_limit": 5,
    })
    wed_ist = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_ist):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code=code_ny,
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-09 coupon.timezone wins (NY window outside at IST 16:00)",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW"
        and r["time_window_status"]["tz"] == "America/New_York",
        json.dumps(r),
    )

    # V3A-10: coupon has no timezone, users.settings.timezone=Asia/Kolkata wins.
    # Ensure restaurant user doc exists.
    await db.users.update_one(
        {"id": USER_ID},
        {"$set": {"id": USER_ID, "settings": {"timezone": "Asia/Kolkata"}}},
        upsert=True,
    )
    code_noz = f"QA_C3A_NOTZ_{RUN_ID}".upper()
    await db.coupons.insert_one({
        "id": str(uuid.uuid4()), "user_id": USER_ID, "code": code_noz,
        "discount_type": "flat", "discount_value": 25.0,
        "start_date": "2020-01-01T00:00:00+00:00",
        "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0, "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "is_active": True, "total_used": 0, "created_at": now_iso,
        "coupon_type": "order", "stackable_with_loyalty": False,
        "valid_days": [0,1,2,3,4], "start_time": "15:00", "end_time": "18:00",
        "offer_type": "simple", "per_user_limit": 5,
    })
    with _freeze(wed_ist):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code=code_noz,
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-10 users.settings.timezone resolves Asia/Kolkata (within window)",
        r["ok"] and r["time_window_status"]["tz"] == "Asia/Kolkata"
        and r["time_window_status"]["tz_fallback"] is None,
        json.dumps(r.get("time_window_status") or {}),
    )

    # V3A-11: No coupon.timezone, no users.settings.timezone → falls to Asia/Kolkata default.
    await db.users.update_one({"id": USER_ID}, {"$set": {"settings": {}}})
    with _freeze(wed_ist):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code=code_noz,
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-11 falls back to product default Asia/Kolkata",
        r["ok"] and r["time_window_status"]["tz"] == "Asia/Kolkata"
        and r["time_window_status"]["tz_fallback"] is None,
    )


async def qa_pos_supplied_order_time() -> None:
    """V3A-12..13 — server clock wins over POS-supplied order_time."""
    ist = ZoneInfo("Asia/Kolkata")

    # V3A-12: within in server clock; POS sends out-of-window time → still within
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
            pos_supplied_order_time="2026-02-11T03:00:00+05:30",
        )
    await _assert(
        "V3A-12 POS supplied time ignored for decision (within)",
        r["ok"] and r["time_window_status"]["pos_supplied_order_time"] == "2026-02-11T03:00:00+05:30",
    )

    # V3A-13: outside in server clock; POS sends in-window time → still outside
    wed_out = datetime(2026, 2, 11, 12, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_out):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
            pos_supplied_order_time="2026-02-11T16:00:00+05:30",
        )
    await _assert(
        "V3A-13 POS time ignored when outside (still OUTSIDE)",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW",
    )


async def qa_available_endpoint() -> None:
    """V3A-14..16 — `/available` exposes time_window block; outside-window still returned."""
    ist = ZoneInfo("Asia/Kolkata")

    # V3A-14: within window
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        out = await list_available_coupons(
            db, user_id=USER_ID, customer_id=CUSTOMER_ID,
            order_total=500.0, channel="pos",
        )
    by_code = {c["code"]: c for c in out}
    happy = by_code.get("QA_C3A_HAPPYHOUR_V1")
    await _assert(
        "V3A-14 within-window coupon listed with within_window_now=true",
        happy is not None
        and happy["time_window"]["within_window_now"] is True
        and happy["time_window"]["next_window_start"] is None
        and happy["expected_discount"] == 100.0,
        json.dumps(happy or {}),
    )

    # V3A-15: outside window — still returned with within_window_now=false + next_window_start
    wed_out = datetime(2026, 2, 11, 12, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_out):
        out = await list_available_coupons(
            db, user_id=USER_ID, customer_id=CUSTOMER_ID,
            order_total=500.0, channel="pos",
        )
    by_code = {c["code"]: c for c in out}
    happy = by_code.get("QA_C3A_HAPPYHOUR_V1")
    await _assert(
        "V3A-15 outside-window coupon still returned for greyed-out UX",
        happy is not None
        and happy["time_window"]["within_window_now"] is False
        and happy["time_window"]["next_window_start"] is not None
        and happy["expected_discount"] == 100.0,  # informational
        json.dumps(happy or {}),
    )

    # V3A-16: no-window coupon has time_window.configured=false
    nw = by_code.get("QA_C3A_NOWINDOW")
    await _assert(
        "V3A-16 no-window coupon has time_window.configured=false",
        nw is not None and nw["time_window"]["configured"] is False,
    )


async def qa_v1_v2_happy_hour() -> None:
    """V3A-17..18 — V1 and V2 coupons gain window support without code changes."""
    ist = ZoneInfo("Asia/Kolkata")
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)

    # V3A-17: V1 ORDER_PERCENTAGE + window
    with _freeze(wed_in):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V1",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        )
    await _assert(
        "V3A-17 V1 ORDER_PERCENTAGE within window computes V1 discount",
        r["ok"] and r["discount_scope"] == "order"
        and r["computed_discount"] == 100.0
        and r["time_window_status"]["configured"] is True,
    )

    # V3A-18: V2 ITEM_PERCENTAGE + window with cart
    with _freeze(wed_in):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3A_HAPPYHOUR_V2_ITEM",
            customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
            items=[{"food_id": "182039", "item_id": "L_3324", "quantity": 3,
                    "unit_price": 100.0, "line_total": 300.0}],
        )
    await _assert(
        "V3A-18 V2 ITEM_PERCENTAGE within window computes V2 discount",
        r["ok"] and r["discount_scope"] == "item"
        and r["eligible_subtotal"] == 200.0  # qty cap 2 * 100
        and r["computed_discount"] == 40.0   # 20% of 200
        and r["time_window_status"]["configured"] is True,
        json.dumps(r),
    )


async def qa_final_order_nonblocking() -> None:
    """V3A-19..21 — final /pos/orders non-blocking + idempotent."""
    ist = ZoneInfo("Asia/Kolkata")

    order_id_in = f"v3a_order_in_{RUN_ID}"
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        res = await record_coupon_usage_for_order(
            db, user_id=USER_ID, restaurant_id="R_QA_V3A",
            customer_id=CUSTOMER_ID, code="QA_C3A_HAPPYHOUR_V1",
            order_id=order_id_in, pos_order_id="POS-V3A-1",
            order_total=500.0, coupon_discount_from_pos=100.0,
        )
    await _assert(
        "V3A-19 within-window final order records usage",
        res["ok"] and res["recorded"] is True
        and res["offer_type"] == "simple"
        and res.get("time_window_status", {}).get("within_window") is True,
        json.dumps(res),
    )
    # Verify the persisted row carries the snapshot.
    row = await db.coupon_usage.find_one(
        {"user_id": USER_ID, "order_id": order_id_in}, {"_id": 0}
    )
    await _assert(
        "V3A-19b persisted coupon_usage carries offer_type + time_window_status",
        row is not None and row.get("offer_type") == "simple"
        and isinstance(row.get("time_window_status"), dict)
        and row["time_window_status"]["within_window"] is True,
    )

    # V3A-20: outside-window final order → non-blocking, no record
    order_id_out = f"v3a_order_out_{RUN_ID}"
    wed_out = datetime(2026, 2, 11, 12, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_out):
        res = await record_coupon_usage_for_order(
            db, user_id=USER_ID, restaurant_id="R_QA_V3A",
            customer_id=CUSTOMER_ID, code="QA_C3A_HAPPYHOUR_V1",
            order_id=order_id_out, pos_order_id="POS-V3A-2",
            order_total=500.0, coupon_discount_from_pos=100.0,
        )
    await _assert(
        "V3A-20 outside-window final order non-blocking (not recorded)",
        res["ok"] is False and res["recorded"] is False
        and res["error"]["code"] == "OUTSIDE_TIME_WINDOW"
        and "time_window_status" in res,
        json.dumps(res),
    )
    # No row inserted.
    cnt = await db.coupon_usage.count_documents({"user_id": USER_ID, "order_id": order_id_out})
    await _assert("V3A-20b outside-window final order did not insert coupon_usage row", cnt == 0)

    # V3A-21: idempotent replay of V3A-19
    with _freeze(wed_in):
        res2 = await record_coupon_usage_for_order(
            db, user_id=USER_ID, restaurant_id="R_QA_V3A",
            customer_id=CUSTOMER_ID, code="QA_C3A_HAPPYHOUR_V1",
            order_id=order_id_in, pos_order_id="POS-V3A-1",
            order_total=500.0, coupon_discount_from_pos=100.0,
        )
    await _assert(
        "V3A-21 idempotent replay (recorded=false, idempotent_replay=true)",
        res2["ok"] and res2["recorded"] is False and res2["idempotent_replay"] is True,
    )


async def qa_analytics() -> None:
    """V3A-22..23 — analytics gains breakdown_by_offer_type + time_window_usage."""
    stats = await get_coupon_stats(USER_ID)
    await _assert(
        "V3A-22 breakdown_by_offer_type present with simple bucket counting V3-A row",
        isinstance(stats.get("breakdown_by_offer_type"), dict)
        and stats["breakdown_by_offer_type"]["simple"]["used"] >= 1,
        json.dumps(stats.get("breakdown_by_offer_type") or {}),
    )
    await _assert(
        "V3A-23 time_window_usage block populated",
        isinstance(stats.get("time_window_usage"), dict)
        and stats["time_window_usage"]["coupons_with_window"] >= 1
        and stats["time_window_usage"]["used_within_window"] >= 1
        and stats["time_window_usage"]["used_outside_window_attempts"] == 0,  # OQ-V3A-2
        json.dumps(stats.get("time_window_usage") or {}),
    )


async def qa_admin_crud_validators() -> None:
    """V3A-24 — Pydantic validators reject bad inputs; round-trip works."""
    from models.schemas import CouponCreate
    # Valid
    ok = CouponCreate(
        code="C1", discount_type="flat", discount_value=10.0,
        start_date="2026-01-01T00:00:00+00:00", end_date="2099-01-01T00:00:00+00:00",
        valid_days=[1, 0, 5, 5], start_time="09:00", end_time="17:00",
        timezone="Asia/Kolkata", offer_type="simple",
    )
    await _assert(
        "V3A-24a valid_days dedup+sort works",
        ok.valid_days == [0, 1, 5] and ok.timezone == "Asia/Kolkata",
    )
    # Invalid HH:MM
    try:
        CouponCreate(
            code="C2", discount_type="flat", discount_value=10.0,
            start_date="2026-01-01T00:00:00+00:00", end_date="2099-01-01T00:00:00+00:00",
            start_time="25:99",
        )
        await _assert("V3A-24b invalid HH:MM raises", False)
    except Exception:
        await _assert("V3A-24b invalid HH:MM raises", True)
    # Invalid timezone
    try:
        CouponCreate(
            code="C3", discount_type="flat", discount_value=10.0,
            start_date="2026-01-01T00:00:00+00:00", end_date="2099-01-01T00:00:00+00:00",
            timezone="Invalid/Zone",
        )
        await _assert("V3A-24c invalid timezone raises", False)
    except Exception:
        await _assert("V3A-24c invalid timezone raises", True)
    # Invalid valid_days range
    try:
        CouponCreate(
            code="C4", discount_type="flat", discount_value=10.0,
            start_date="2026-01-01T00:00:00+00:00", end_date="2099-01-01T00:00:00+00:00",
            valid_days=[0, 7],
        )
        await _assert("V3A-24d valid_days out of range raises", False)
    except Exception:
        await _assert("V3A-24d valid_days out of range raises", True)


async def qa_loyalty_wallet_untouched() -> None:
    """V3A-25 — Loyalty + Wallet collections untouched after V3-A operations."""
    wallet_tx_before = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    # Trigger one more V3-A recording (within window, fresh order_id)
    ist = ZoneInfo("Asia/Kolkata")
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        await record_coupon_usage_for_order(
            db, user_id=USER_ID, restaurant_id="R_QA",
            customer_id=CUSTOMER_ID, code="QA_C3A_HAPPYHOUR_V1",
            order_id=f"v3a_loyalty_check_{RUN_ID}", pos_order_id="POS-V3A-LC",
            order_total=500.0, coupon_discount_from_pos=100.0,
        )
    wallet_tx_after = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    await _assert(
        "V3A-25 wallet collection untouched after V3-A flow",
        wallet_tx_before == wallet_tx_after,
    )
    import core.loyalty as _l  # noqa: F401
    await _assert("V3A-25b core.loyalty importable (regression smoke)", True)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def main() -> int:
    try:
        await setup()
        await qa_window_evaluation()
        await qa_overnight_wrap()
        await qa_timezone_resolution()
        await qa_pos_supplied_order_time()
        await qa_available_endpoint()
        await qa_v1_v2_happy_hour()
        await qa_final_order_nonblocking()
        await qa_analytics()
        await qa_admin_crud_validators()
        await qa_loyalty_wallet_untouched()
    finally:
        # Clean ad-hoc inserted V3A coupons (the seed cleanup handles QA_C3A_*).
        await db.coupons.delete_many({"user_id": USER_ID, "code": {"$regex": "^QA_C3A_"}})
        await db.users.delete_one({"id": USER_ID})
        await teardown()

    total = len(RESULTS)
    passed = sum(1 for r in RESULTS if r["ok"])
    failed = total - passed
    print(json.dumps({"total": total, "passed": passed, "failed": failed, "run_id": RUN_ID}, indent=2))
    for r in RESULTS:
        flag = "OK " if r["ok"] else "FAIL"
        print(f"  [{flag}] {r['case']}{' — ' + r['detail'] if not r['ok'] else ''}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
