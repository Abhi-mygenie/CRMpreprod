"""
CR-001C-C V3-B — BOGO / Buy-X-Get-Y QA harness (Path Alpha).

Frozen owner decisions applied (Addendum D, 2026-02):
  Q1=D full BOGO + BXGY with free/%/flat get benefit.
  Q2=A get item must already be in cart.
  Q3=A free cheapest eligible unit (apply_to_highest_item overrides).
  Q4=A include different-item BXGY now.
  Q5=C benefit types free / percentage / flat.
  Q6=C allow_repeat field, default True.
  Q7=A support max_applications cap.
  Q8=B total + benefit_items summary.
  Q9=A final-order failure non-blocking.
  Q10=A allow time-window + BOGO composition.
  Q11=B pos_instruction on missing-requirement failures only.

Synthetic `user_id = "QA_C3B_USER_<run-id>"` so it does NOT pollute real CRM
users. Cleanup removes seeded coupons + usage on teardown.

Run: python -m tests.qa_cr001c_c_coupon_v3_b_bogo_bxgy
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from unittest.mock import patch

sys.path.insert(0, "/app/backend")

from core.database import db  # noqa: E402
from core import coupon as coupon_module  # noqa: E402
from core.coupon import (  # noqa: E402
    validate_coupon_for_customer,
    list_available_coupons,
    record_coupon_usage_for_order,
)
from services.analytics_service import get_coupon_stats  # noqa: E402
from tests.seed_coupon_v1_fixtures import seed, cleanup  # noqa: E402

RESULTS: list[dict] = []
RUN_ID = uuid.uuid4().hex[:8]
USER_ID = f"QA_C3B_USER_{RUN_ID}"
CUSTOMER_ID = f"QA_C3B_CUST_{RUN_ID}"


def _record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"case": name, "ok": ok, "detail": detail})


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    _record(name, bool(cond), detail if not cond else "")


# ---------------------------------------------------------------------------
# Time-freezing helper (re-used from V3-A pattern).
# ---------------------------------------------------------------------------
class _FrozenDatetime(datetime):
    _frozen_utc: datetime = datetime.now(timezone.utc)

    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        v = cls._frozen_utc
        if tz is None:
            return v.replace(tzinfo=None)
        return v.astimezone(tz)


def _freeze(utc_dt: datetime):
    _FrozenDatetime._frozen_utc = utc_dt.astimezone(timezone.utc)
    return patch.object(coupon_module, "datetime", _FrozenDatetime)


# ---------------------------------------------------------------------------
# Cart-line helpers.
# ---------------------------------------------------------------------------
def _line(food_id: str, qty: int, unit_price: float, name: str = "") -> dict:
    return {
        "food_id": food_id, "item_id": food_id,
        "name": name or food_id, "quantity": qty,
        "unit_price": unit_price,
        "line_total": round(unit_price * qty, 2),
    }


async def setup() -> None:
    await seed(db, USER_ID, CUSTOMER_ID)


async def teardown() -> None:
    await cleanup(db, USER_ID)
    await db.coupon_transactions.delete_many({"user_id": USER_ID})
    await db.users.delete_one({"id": USER_ID})


# ---------------------------------------------------------------------------
# Available API
# ---------------------------------------------------------------------------
async def qa_available_api() -> None:
    out = await list_available_coupons(
        db, user_id=USER_ID, customer_id=CUSTOMER_ID,
        order_total=500.0, channel="pos",
    )
    by_code = {c["code"]: c for c in out}
    bogo = by_code.get("QA_C3B_BOGO_COFFEE")
    await _assert(
        "V3B-A1 Available returns BOGO with requires_cart_validation=true",
        bogo is not None and bogo.get("requires_cart_validation") is True,
        json.dumps(bogo or {}),
    )
    await _assert(
        "V3B-A2 Available returns offer_type=bogo",
        bogo is not None and bogo.get("offer_type") == "bogo",
    )
    await _assert(
        "V3B-A3 Available expected_discount=None for BOGO (no cart)",
        bogo is not None and bogo.get("expected_discount") is None,
    )
    await _assert(
        "V3B-A4 Available eligible_match_hint carries buy/get blocks",
        bogo is not None
        and isinstance(bogo.get("eligible_match_hint"), dict)
        and bogo["eligible_match_hint"].get("kind") == "bogo"
        and bogo["eligible_match_hint"].get("buy_quantity") == 1,
        json.dumps((bogo or {}).get("eligible_match_hint") or {}),
    )


# ---------------------------------------------------------------------------
# Missing items
# ---------------------------------------------------------------------------
async def qa_missing_items() -> None:
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=None,
    )
    await _assert(
        "V3B-M1 Missing items returns MISSING_ITEMS_FOR_BXGY_COUPON",
        (not r["ok"]) and r["error"]["code"] == "MISSING_ITEMS_FOR_BXGY_COUPON",
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Same-item BOGO
# ---------------------------------------------------------------------------
async def qa_bogo_same_item() -> None:
    # qty 1 → not eligible
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=100.0, channel="pos",
        items=[_line("182039", 1, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-S1 BOGO qty 1 not eligible (BUY_REQUIREMENT_NOT_MET)",
        (not r["ok"]) and r["error"]["code"] == "BUY_REQUIREMENT_NOT_MET",
        json.dumps(r),
    )

    # qty 2 → 1 free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
        items=[_line("182039", 2, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-S2 BOGO qty 2 gives 1 free (discount = unit_price)",
        r["ok"] and r["computed_discount"] == 100.0
        and r["applied_applications"] == 1
        and len(r["benefit_items"]) == 1
        and r["benefit_items"][0]["quantity"] == 1
        and r["benefit_items"][0]["line_discount"] == 100.0,
        json.dumps(r),
    )

    # qty 3 → 1 free (odd qty)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=300.0, channel="pos",
        items=[_line("182039", 3, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-S3 BOGO qty 3 gives 1 free",
        r["ok"] and r["computed_discount"] == 100.0 and r["applied_applications"] == 1,
        json.dumps(r),
    )

    # qty 4 → 2 free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=400.0, channel="pos",
        items=[_line("182039", 4, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-S4 BOGO qty 4 gives 2 free",
        r["ok"] and r["computed_discount"] == 200.0 and r["applied_applications"] == 2,
        json.dumps(r),
    )

    # Mixed-eligible lines, cheapest selected
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=300.0, channel="pos",
        items=[
            _line("182039", 1, 150.0, "Coffee Large"),
            _line("182039", 1, 80.0, "Coffee Small"),
        ],
    )
    await _assert(
        "V3B-S5 BOGO with mixed prices selects cheapest (₹80 free)",
        r["ok"] and r["computed_discount"] == 80.0 and r["applied_applications"] == 1,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# BXG same-item buy-2-get-1
# ---------------------------------------------------------------------------
async def qa_bxg_same_item() -> None:
    # qty 2 → not eligible (need 3)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_BUY2GET1_SAME",
        customer_id=CUSTOMER_ID, order_total=400.0, channel="pos",
        items=[_line("B_001", 2, 200.0, "Burger")],
    )
    await _assert(
        "V3B-B1 BXG buy-2-get-1 qty 2 not eligible",
        (not r["ok"]) and r["error"]["code"] == "BUY_REQUIREMENT_NOT_MET",
        json.dumps(r),
    )

    # qty 3 → 1 free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_BUY2GET1_SAME",
        customer_id=CUSTOMER_ID, order_total=600.0, channel="pos",
        items=[_line("B_001", 3, 200.0, "Burger")],
    )
    await _assert(
        "V3B-B2 BXG buy-2-get-1 qty 3 gives 1 free",
        r["ok"] and r["computed_discount"] == 200.0 and r["applied_applications"] == 1,
        json.dumps(r),
    )

    # qty 6 → 2 free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_BUY2GET1_SAME",
        customer_id=CUSTOMER_ID, order_total=1200.0, channel="pos",
        items=[_line("B_001", 6, 200.0, "Burger")],
    )
    await _assert(
        "V3B-B3 BXG buy-2-get-1 qty 6 gives 2 free",
        r["ok"] and r["computed_discount"] == 400.0 and r["applied_applications"] == 2,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# BXG different-item
# ---------------------------------------------------------------------------
async def qa_bxg_different_item() -> None:
    # success: 2 pizzas + 1 garlic bread → 1 free garlic
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos",
        items=[
            _line("P_001", 2, 400.0, "Pizza"),
            _line("G_001", 1, 100.0, "Garlic Bread"),
        ],
    )
    await _assert(
        "V3B-D1 BXG different-item 2 pizza + 1 garlic → 1 free garlic",
        r["ok"] and r["computed_discount"] == 100.0
        and r["applied_applications"] == 1
        and len(r["benefit_items"]) == 1
        and r["benefit_items"][0]["name"] == "Garlic Bread",
        json.dumps(r),
    )

    # buy missing (only pizza qty 1)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[
            _line("P_001", 1, 400.0, "Pizza"),
            _line("G_001", 1, 100.0, "Garlic Bread"),
        ],
    )
    await _assert(
        "V3B-D2 BXG buy missing → BUY_REQUIREMENT_NOT_MET",
        (not r["ok"]) and r["error"]["code"] == "BUY_REQUIREMENT_NOT_MET",
        json.dumps(r),
    )

    # get missing (2 pizzas, 0 garlic)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=800.0, channel="pos",
        items=[_line("P_001", 2, 400.0, "Pizza")],
    )
    await _assert(
        "V3B-D3 BXG get missing → NO_ELIGIBLE_GET_ITEMS_IN_CART",
        (not r["ok"]) and r["error"]["code"] == "NO_ELIGIBLE_GET_ITEMS_IN_CART",
        json.dumps(r),
    )

    # cart capped by get qty (4 pizzas + 1 garlic → 1 app, not 2)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=1700.0, channel="pos",
        items=[
            _line("P_001", 4, 400.0, "Pizza"),
            _line("G_001", 1, 100.0, "Garlic Bread"),
        ],
    )
    await _assert(
        "V3B-D4 BXG 4 pizza + 1 garlic → 1 app capped by get qty",
        r["ok"] and r["applied_applications"] == 1 and r["computed_discount"] == 100.0,
        json.dumps(r),
    )

    # 4 pizza + 2 garlic → 2 applications
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=1800.0, channel="pos",
        items=[
            _line("P_001", 4, 400.0, "Pizza"),
            _line("G_001", 2, 100.0, "Garlic Bread"),
        ],
    )
    await _assert(
        "V3B-D5 BXG 4 pizza + 2 garlic → 2 applications",
        r["ok"] and r["applied_applications"] == 2 and r["computed_discount"] == 200.0,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Benefit types
# ---------------------------------------------------------------------------
async def qa_benefit_types() -> None:
    items = [
        _line("P_001", 2, 400.0, "Pizza"),
        _line("G_001", 1, 100.0, "Garlic Bread"),
    ]
    # free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos", items=items,
    )
    await _assert(
        "V3B-T1 Benefit free → discount = unit_price",
        r["ok"] and r["computed_discount"] == 100.0,
        json.dumps(r),
    )
    # percentage 50%
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_PCT",
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos", items=items,
    )
    await _assert(
        "V3B-T2 Benefit percentage 50% on ₹100 → ₹50",
        r["ok"] and r["computed_discount"] == 50.0,
        json.dumps(r),
    )
    # flat ₹150 capped to unit_price ₹100
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FLAT",
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos", items=items,
    )
    await _assert(
        "V3B-T3 Benefit flat ₹150 capped by unit_price ₹100",
        r["ok"] and r["computed_discount"] == 100.0,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Caps: max_applications and allow_repeat
# ---------------------------------------------------------------------------
async def qa_caps() -> None:
    # max_applications=2; qty 8 should give 2 free (instead of 4)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_MAX_APPS",
        customer_id=CUSTOMER_ID, order_total=800.0, channel="pos",
        items=[_line("182039", 8, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-C1 max_applications=2 caps free units to 2 (out of natural 4)",
        r["ok"] and r["applied_applications"] == 2 and r["computed_discount"] == 200.0,
        json.dumps(r),
    )

    # allow_repeat=False; qty 8 should give 1 free
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_NOREPEAT",
        customer_id=CUSTOMER_ID, order_total=800.0, channel="pos",
        items=[_line("182039", 8, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-C2 allow_repeat=False caps at 1 application",
        r["ok"] and r["applied_applications"] == 1 and r["computed_discount"] == 100.0,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Selection (cheapest default, highest override)
# ---------------------------------------------------------------------------
async def qa_selection() -> None:
    # Default cheapest (QA_C3B_BOGO_COFFEE has no apply_to_highest_item)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=300.0, channel="pos",
        items=[
            _line("182039", 1, 150.0, "Coffee Large"),
            _line("182039", 1, 80.0, "Coffee Small"),
        ],
    )
    await _assert(
        "V3B-Sel1 Default cheapest picks ₹80 unit",
        r["ok"] and r["computed_discount"] == 80.0,
        json.dumps(r),
    )

    # apply_to_highest_item=True picks ₹500 from 2 units
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_HIGHEST",
        customer_id=CUSTOMER_ID, order_total=800.0, channel="pos",
        items=[
            _line("P_001", 1, 500.0, "Pizza Large"),
            _line("P_001", 1, 300.0, "Pizza Small"),
        ],
    )
    await _assert(
        "V3B-Sel2 apply_to_highest_item picks ₹500 unit",
        r["ok"] and r["computed_discount"] == 500.0,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Edge cases: line_total fallback + invalid lines
# ---------------------------------------------------------------------------
async def qa_edge_cases() -> None:
    # line_total fallback (unit_price missing)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
        items=[{
            "food_id": "182039", "item_id": "182039", "name": "Coffee",
            "quantity": 2, "line_total": 200.0,  # no unit_price
        }],
    )
    await _assert(
        "V3B-E1 line_total fallback computes unit_price = lt/qty",
        r["ok"] and r["computed_discount"] == 100.0,
        json.dumps(r),
    )

    # Invalid (negative) unit_price line silently dropped
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=300.0, channel="pos",
        items=[
            _line("182039", 2, 100.0, "Coffee"),
            {"food_id": "182039", "item_id": "182039", "name": "Bad",
             "quantity": 1, "unit_price": -10.0},
        ],
    )
    await _assert(
        "V3B-E2 invalid (negative) price line ignored; still computes 1 free at ₹100",
        r["ok"] and r["computed_discount"] == 100.0,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Response shape: benefit_items, applied_applications, pos_instruction
# ---------------------------------------------------------------------------
async def qa_response_shape() -> None:
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
        items=[_line("182039", 2, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-R1 Success response carries benefit_items + applied_applications",
        r["ok"]
        and r.get("applied_applications") == 1
        and isinstance(r.get("benefit_items"), list)
        and len(r["benefit_items"]) >= 1,
    )
    # pos_instruction only on missing-requirement failures (Q11=B)
    r2 = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BOGO_COFFEE",
        customer_id=CUSTOMER_ID, order_total=100.0, channel="pos",
        items=[_line("182039", 1, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-R2 pos_instruction surfaced on missing-requirement failure (Q11=B)",
        (not r2["ok"])
        and r2.get("pos_instruction") == "Add a 2nd coffee to qualify for BOGO.",
        json.dumps(r2),
    )
    await _assert(
        "V3B-R3 pos_instruction NOT surfaced on success (happy path)",
        r.get("pos_instruction") is None,
    )


# ---------------------------------------------------------------------------
# Time-window + BOGO composition (V3-A composes)
# ---------------------------------------------------------------------------
async def qa_time_window_composition() -> None:
    ist = ZoneInfo("Asia/Kolkata")
    items = [_line("182039", 2, 100.0, "Coffee")]

    # Outside window → OUTSIDE_TIME_WINDOW (V3-A fires before V3-B compute)
    wed_out = datetime(2026, 2, 11, 12, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_out):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3B_BOGO_HAPPYHOUR",
            customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
            items=items,
        )
    await _assert(
        "V3B-W1 Outside time-window + BOGO returns V3-A error (composes)",
        (not r["ok"]) and r["error"]["code"] == "OUTSIDE_TIME_WINDOW",
        json.dumps(r),
    )

    # Inside window → BOGO computes
    wed_in = datetime(2026, 2, 11, 16, 0, tzinfo=ist).astimezone(timezone.utc)
    with _freeze(wed_in):
        r = await validate_coupon_for_customer(
            db, user_id=USER_ID, code="QA_C3B_BOGO_HAPPYHOUR",
            customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
            items=items,
        )
    await _assert(
        "V3B-W2 Inside time-window + BOGO computes V3-B discount",
        r["ok"] and r["computed_discount"] == 100.0
        and r["time_window_status"]["within_window"] is True
        and r["offer_type"] == "bogo",
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Loyalty stacking rule preserved
# ---------------------------------------------------------------------------
async def qa_loyalty_stacking() -> None:
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_STACK_LOY",
        customer_id=CUSTOMER_ID, order_total=200.0, channel="pos",
        loyalty_points_used=10.0,
        items=[_line("182039", 2, 100.0, "Coffee")],
    )
    await _assert(
        "V3B-L1 Loyalty stacking rule preserved (STACKING_NOT_ALLOWED on BOGO)",
        (not r["ok"]) and r["error"]["code"] == "STACKING_NOT_ALLOWED",
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# max_discount ceiling
# ---------------------------------------------------------------------------
async def qa_max_discount_ceiling() -> None:
    # Buy 4 P_001 @ 200 → 2 free × 200 = 400. Ceiling 75 caps.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C3B_BXG_MAX_DISCOUNT",
        customer_id=CUSTOMER_ID, order_total=800.0, channel="pos",
        items=[_line("P_001", 4, 200.0, "Pizza")],
    )
    await _assert(
        "V3B-Cap max_discount ceiling caps total at ₹75",
        r["ok"] and r["computed_discount"] == 75.0
        and r["applied_applications"] == 2,
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Final order recording + idempotency
# ---------------------------------------------------------------------------
async def qa_final_order() -> None:
    items = [
        {"item_id": "182039", "food_id": "182039", "name": "Coffee",
         "quantity": 2, "unit_price": 100.0, "line_total": 200.0},
    ]
    order_id = f"v3b_order_ok_{RUN_ID}"
    res = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA_V3B",
        customer_id=CUSTOMER_ID, code="QA_C3B_BOGO_COFFEE",
        order_id=order_id, pos_order_id="POS-V3B-1",
        order_total=200.0, coupon_discount_from_pos=100.0,
        items=items,
    )
    await _assert(
        "V3B-F1 Final-order success records coupon_usage with V3-B snapshot",
        res["ok"] and res["recorded"] is True
        and res.get("applied_applications") == 1
        and res.get("offer_type") == "bogo"
        and len(res.get("benefit_items") or []) == 1,
        json.dumps(res),
    )

    # Persisted row
    row = await db.coupon_usage.find_one(
        {"user_id": USER_ID, "order_id": order_id}, {"_id": 0}
    )
    await _assert(
        "V3B-F1b Persisted coupon_usage row carries offer_type=bogo + benefit_items",
        row is not None and row.get("offer_type") == "bogo"
        and row.get("applied_applications") == 1
        and isinstance(row.get("benefit_items"), list)
        and len(row["benefit_items"]) == 1,
    )

    # Idempotent replay
    res2 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA_V3B",
        customer_id=CUSTOMER_ID, code="QA_C3B_BOGO_COFFEE",
        order_id=order_id, pos_order_id="POS-V3B-1",
        order_total=200.0, coupon_discount_from_pos=100.0,
        items=items,
    )
    await _assert(
        "V3B-F2 Idempotent replay returns recorded=false + idempotent_replay=true",
        res2["ok"] and res2["recorded"] is False
        and res2["idempotent_replay"] is True,
        json.dumps(res2),
    )

    # Failure path: missing get item, order should persist, usage not recorded
    order_id_fail = f"v3b_order_fail_{RUN_ID}"
    res3 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA_V3B",
        customer_id=CUSTOMER_ID, code="QA_C3B_BXG_PIZZA_GARLIC_FREE",
        order_id=order_id_fail, pos_order_id="POS-V3B-FAIL",
        order_total=800.0, coupon_discount_from_pos=100.0,
        items=[{"item_id": "P_001", "food_id": "P_001", "name": "Pizza",
                "quantity": 2, "unit_price": 400.0, "line_total": 800.0}],
    )
    await _assert(
        "V3B-F3 Final-order failure non-blocking; recorded=false; error code present",
        res3["ok"] is False and res3["recorded"] is False
        and res3["error"]["code"] == "NO_ELIGIBLE_GET_ITEMS_IN_CART",
        json.dumps(res3),
    )
    cnt = await db.coupon_usage.count_documents({"user_id": USER_ID, "order_id": order_id_fail})
    await _assert(
        "V3B-F3b Failure path inserts no coupon_usage row",
        cnt == 0,
    )


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------
async def qa_analytics() -> None:
    stats = await get_coupon_stats(USER_ID)
    bot = stats.get("breakdown_by_offer_type") or {}
    bxgy = stats.get("bxgy_usage") or {}
    await _assert(
        "V3B-AN1 breakdown_by_offer_type.bogo populated by V3-B row",
        isinstance(bot, dict)
        and bot.get("bogo", {}).get("used", 0) >= 1
        and bot.get("bogo", {}).get("discount", 0) >= 100.0,
        json.dumps(bot),
    )
    await _assert(
        "V3B-AN2 bxgy_usage block populated (total_applications>=1, free_units>=1)",
        isinstance(bxgy, dict)
        and bxgy.get("total_applications", 0) >= 1
        and bxgy.get("free_units_given", 0) >= 1
        and bxgy.get("bogo_orders", 0) >= 1,
        json.dumps(bxgy),
    )


# ---------------------------------------------------------------------------
# Admin Pydantic validators (BXGY_CONFIG_INVALID / UNSUPPORTED_BENEFIT_TYPE)
# ---------------------------------------------------------------------------
async def qa_admin_validators() -> None:
    from models.schemas import CouponCreate
    # Valid V3-B coupon round-trips
    try:
        ok = CouponCreate(
            code="V3B_VALID", discount_type="flat", discount_value=0.0,
            start_date="2026-01-01T00:00:00+00:00",
            end_date="2099-01-01T00:00:00+00:00",
            offer_type="bogo", buy_quantity=1, get_quantity=1,
            buy_food_ids=["F1"], get_discount_type="free",
            allow_repeat=True,
        )
        await _assert("V3B-V1 Valid V3-B CouponCreate round-trips", ok.offer_type == "bogo")
    except Exception as exc:
        await _assert("V3B-V1 Valid V3-B CouponCreate round-trips", False, str(exc))

    # offer_type buy_x_get_y normalizes to bxg
    try:
        ok = CouponCreate(
            code="V3B_ALIAS", discount_type="flat", discount_value=0.0,
            start_date="2026-01-01T00:00:00+00:00",
            end_date="2099-01-01T00:00:00+00:00",
            offer_type="buy_x_get_y", buy_quantity=2, get_quantity=1,
            buy_food_ids=["F1"], get_food_ids=["F2"], get_discount_type="free",
        )
        await _assert(
            "V3B-V2 offer_type=buy_x_get_y normalizes to bxg",
            ok.offer_type == "bxg",
        )
    except Exception as exc:
        await _assert("V3B-V2 offer_type=buy_x_get_y normalizes to bxg", False, str(exc))

    # Invalid get_discount_type raises
    try:
        CouponCreate(
            code="V3B_BADBENEFIT", discount_type="flat", discount_value=0.0,
            start_date="2026-01-01T00:00:00+00:00",
            end_date="2099-01-01T00:00:00+00:00",
            offer_type="bogo", buy_quantity=1, get_quantity=1,
            buy_food_ids=["F1"], get_discount_type="cashback",
        )
        await _assert("V3B-V3 Invalid get_discount_type raises", False)
    except Exception:
        await _assert("V3B-V3 Invalid get_discount_type raises", True)

    # buy_quantity < 1 raises
    try:
        CouponCreate(
            code="V3B_BADQTY", discount_type="flat", discount_value=0.0,
            start_date="2026-01-01T00:00:00+00:00",
            end_date="2099-01-01T00:00:00+00:00",
            offer_type="bogo", buy_quantity=0, get_quantity=1,
            buy_food_ids=["F1"], get_discount_type="free",
        )
        await _assert("V3B-V4 buy_quantity<1 raises", False)
    except Exception:
        await _assert("V3B-V4 buy_quantity<1 raises", True)


# ---------------------------------------------------------------------------
# Runtime config error codes (BXGY_CONFIG_INVALID / UNSUPPORTED_BENEFIT_TYPE)
# ---------------------------------------------------------------------------
async def qa_runtime_config_errors() -> None:
    # Insert a bypassing-validator coupon directly for runtime check.
    code_inv = f"QA_C3B_CFGINV_{RUN_ID}".upper()
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one({
        "id": str(uuid.uuid4()), "user_id": USER_ID, "code": code_inv,
        "discount_type": "flat", "discount_value": 0.0,
        "start_date": "2020-01-01T00:00:00+00:00",
        "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0,
        "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "is_active": True, "total_used": 0, "created_at": now_iso,
        "coupon_type": "item", "stackable_with_loyalty": False,
        "offer_type": "bxg",
        "buy_quantity": 2, "get_quantity": 1,
        "buy_food_ids": ["P_001"],
        "get_food_ids": ["G_001"],
        "get_discount_type": "percentage",
        # get_discount_value missing → BXGY_CONFIG_INVALID
        "per_user_limit": 5,
    })
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=code_inv,
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos",
        items=[_line("P_001", 2, 400.0), _line("G_001", 1, 100.0)],
    )
    await _assert(
        "V3B-RT1 BXGY_CONFIG_INVALID raised when get_discount_value missing for percentage",
        (not r["ok"]) and r["error"]["code"] == "BXGY_CONFIG_INVALID",
        json.dumps(r),
    )

    # UNSUPPORTED_BENEFIT_TYPE
    code_ben = f"QA_C3B_BADBEN_{RUN_ID}".upper()
    await db.coupons.insert_one({
        "id": str(uuid.uuid4()), "user_id": USER_ID, "code": code_ben,
        "discount_type": "flat", "discount_value": 0.0,
        "start_date": "2020-01-01T00:00:00+00:00",
        "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0,
        "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "is_active": True, "total_used": 0, "created_at": now_iso,
        "coupon_type": "item", "stackable_with_loyalty": False,
        "offer_type": "bxg",
        "buy_quantity": 2, "get_quantity": 1,
        "buy_food_ids": ["P_001"], "get_food_ids": ["G_001"],
        "get_discount_type": "cashback", "get_discount_value": 10.0,
        "per_user_limit": 5,
    })
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=code_ben,
        customer_id=CUSTOMER_ID, order_total=900.0, channel="pos",
        items=[_line("P_001", 2, 400.0), _line("G_001", 1, 100.0)],
    )
    await _assert(
        "V3B-RT2 UNSUPPORTED_BENEFIT_TYPE raised when get_discount_type unsupported",
        (not r["ok"]) and r["error"]["code"] == "UNSUPPORTED_BENEFIT_TYPE",
        json.dumps(r),
    )


# ---------------------------------------------------------------------------
# Wallet + Loyalty untouched
# ---------------------------------------------------------------------------
async def qa_loyalty_wallet_untouched() -> None:
    wallet_before = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    # Trigger one more recording
    items = [{"item_id": "182039", "food_id": "182039", "name": "Coffee",
              "quantity": 2, "unit_price": 100.0, "line_total": 200.0}]
    await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID, code="QA_C3B_BOGO_COFFEE",
        order_id=f"v3b_wallet_check_{RUN_ID}", pos_order_id="POS-V3B-WC",
        order_total=200.0, coupon_discount_from_pos=100.0,
        items=items,
    )
    wallet_after = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    await _assert(
        "V3B-LW1 wallet collection untouched after V3-B flow",
        wallet_before == wallet_after,
    )
    import core.loyalty as _l  # noqa: F401
    await _assert("V3B-LW2 core.loyalty importable (regression smoke)", True)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def main() -> int:
    try:
        await setup()
        await qa_available_api()
        await qa_missing_items()
        await qa_bogo_same_item()
        await qa_bxg_same_item()
        await qa_bxg_different_item()
        await qa_benefit_types()
        await qa_caps()
        await qa_selection()
        await qa_edge_cases()
        await qa_response_shape()
        await qa_time_window_composition()
        await qa_loyalty_stacking()
        await qa_max_discount_ceiling()
        await qa_final_order()
        await qa_analytics()
        await qa_admin_validators()
        await qa_runtime_config_errors()
        await qa_loyalty_wallet_untouched()
    finally:
        # Clean any ad-hoc V3-B inserts.
        await db.coupons.delete_many({"user_id": USER_ID, "code": {"$regex": "^QA_C3B_"}})
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
