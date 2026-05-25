"""
CR-001C-C V2 — Item/Category Coupon QA harness.

Covers all 35 V2 cases from the plan (Addendum B + §13). V1 regression is run
separately via `python -m tests.qa_cr001c_c_coupon_v1`.

Strategy: synthetic `user_id = "QA_C2_USER_<run-id>"` so it does NOT pollute
real CRM users. Cleanup removes all seeded coupons + usage on teardown.

Run: python -m backend.tests.qa_cr001c_c_coupon_v2_item_category
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

from core.database import db  # noqa: E402
from core.coupon import (  # noqa: E402
    validate_coupon_for_customer,
    list_available_coupons,
    record_coupon_usage_for_order,
    resolve_discount_scope,
    build_eligible_match_hint,
)
from services.analytics_service import get_coupon_stats  # noqa: E402
from tests.seed_coupon_v1_fixtures import seed, cleanup  # noqa: E402

RESULTS: list[dict] = []
RUN_ID = uuid.uuid4().hex[:8]
USER_ID = f"QA_C2_USER_{RUN_ID}"
CUSTOMER_ID = f"QA_C2_CUST_{RUN_ID}"


def _record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"case": name, "ok": ok, "detail": detail})


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    _record(name, bool(cond), detail if not cond else "")


async def setup() -> None:
    await seed(db, USER_ID, CUSTOMER_ID)


async def teardown() -> None:
    await cleanup(db, USER_ID)
    await db.coupon_transactions.delete_many({"user_id": USER_ID})


# ---------------------------------------------------------------------------
# Helpers — build cart payloads
# ---------------------------------------------------------------------------
def _coffee_line(food_id="182039", item_id="L_3324", qty=2, unit_price=100.0, category_id=None, category_name=None, item_category=None) -> dict:
    return {
        "food_id": food_id,
        "item_id": item_id,
        "category_id": category_id,
        "category_name": category_name,
        "item_category": item_category,
        "name": "Coffee",
        "quantity": qty,
        "unit_price": unit_price,
        "line_total": qty * unit_price,
    }


def _burger_line(food_id="300001", item_id="L_9000", qty=1, unit_price=300.0, category_id=None, category_name=None, item_category=None) -> dict:
    return {
        "food_id": food_id,
        "item_id": item_id,
        "category_id": category_id,
        "category_name": category_name,
        "item_category": item_category,
        "name": "Burger",
        "quantity": qty,
        "unit_price": unit_price,
        "line_total": qty * unit_price,
    }


# ---------------------------------------------------------------------------
# QA cases
# ---------------------------------------------------------------------------
async def qa_v1_still_works() -> None:
    """V1 sanity — must keep working through the same code path."""
    # V1 ORDER_FLAT
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C1_FLAT50",
        customer_id=CUSTOMER_ID, order_total=1000.0, channel="pos",
    )
    await _assert("V2-V1FLAT V1 flat still validates",
                  r["ok"] and r["computed_discount"] == 50.0 and r["discount_scope"] == "order",
                  json.dumps(r))
    # V1 ORDER_PERCENTAGE
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C1_PCT10",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
    )
    await _assert("V2-V1PCT V1 percentage still validates",
                  r["ok"] and r["computed_discount"] == 50.0 and r["discount_scope"] == "order")


async def qa_available_endpoint() -> None:
    """V2-AVAIL — available endpoint returns V1 + V2 coupons with proper hints."""
    out = await list_available_coupons(
        db, user_id=USER_ID, customer_id=CUSTOMER_ID,
        order_total=1000.0, channel="pos",
    )
    by_code = {c["code"]: c for c in out}
    # Order coupons retain V1 shape (expected_discount populated).
    if "QA_C1_FLAT50" in by_code:
        c = by_code["QA_C1_FLAT50"]
        await _assert("V2-AVAIL-1 order coupon has expected_discount populated",
                      c["requires_cart_validation"] is False and c["expected_discount"] == 50.0)
    # Item-scope coupon flagged requires_cart_validation.
    if "QA_C2_ITEMFLAT" in by_code:
        c = by_code["QA_C2_ITEMFLAT"]
        await _assert("V2-AVAIL-2 item coupon flagged requires_cart_validation",
                      c["requires_cart_validation"] is True)
        await _assert("V2-AVAIL-3 item coupon has eligible_match_hint",
                      isinstance(c.get("eligible_match_hint"), dict) and c["eligible_match_hint"]["type"] == "food_ids")
        await _assert("V2-AVAIL-4 item coupon expected_discount is null",
                      c["expected_discount"] is None and c["final_amount_preview"] is None)
    # Category-scope coupon flagged.
    if "QA_C2_CATFLAT" in by_code:
        c = by_code["QA_C2_CATFLAT"]
        await _assert("V2-AVAIL-5 category coupon flagged requires_cart_validation",
                      c["requires_cart_validation"] is True)
        await _assert("V2-AVAIL-6 category coupon hint is category_names",
                      c.get("eligible_match_hint", {}).get("type") == "category_names")


async def qa_item_flat() -> None:
    # V2-IF-FOODID: ITEM_FLAT match by food_id
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(food_id="182039", qty=2, unit_price=100.0), _burger_line()],
    )
    await _assert("V2-IF-FOODID match by food_id",
                  r["ok"] and r["computed_discount"] == 50.0 and r["eligible_subtotal"] == 200.0,
                  json.dumps(r))

    # V2-IF-ITEMID: ITEM_FLAT match by item_id (uses different fixture QA_C2_ITEMPCT which has eligible_item_ids)
    # But QA_C2_ITEMPCT is percentage; use a fixture with item_id match. Override coupon to test item_id path:
    # Actually QA_C2_ITEMPCT has eligible_item_ids=["L_3324","L_3325"] — test it.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMPCT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[{"food_id": "999999", "item_id": "L_3324", "name": "Coffee",
                "quantity": 3, "unit_price": 100.0, "line_total": 300.0}],
    )
    # max_applicable_qty=2 → 2 * 100 = 200; 20% = 40; cap=50 → 40.
    await _assert("V2-IP-ITEMID match by item_id with qty cap",
                  r["ok"] and r["computed_discount"] == 40.0 and r["eligible_subtotal"] == 200.0,
                  json.dumps(r))


async def qa_item_percentage() -> None:
    # V2-IP cap: order with eligible subtotal much higher than cap.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMPCT",
        customer_id=CUSTOMER_ID, order_total=10000.0, channel="pos",
        items=[{"food_id": "999", "item_id": "L_3324", "quantity": 10, "unit_price": 100.0, "line_total": 1000.0}],
    )
    # qty cap 2, so eligible_subtotal = 200; 20% = 40; cap=50 → 40
    await _assert("V2-IP-CAP percentage capped by max_applicable_qty",
                  r["ok"] and r["computed_discount"] == 40.0)


async def qa_category() -> None:
    # V2-CF-CATID: CATEGORY_FLAT match by category_id
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[
            _coffee_line(qty=2, unit_price=80.0, category_id="12"),
            _burger_line(qty=1, unit_price=300.0, category_id="5"),
        ],
    )
    await _assert("V2-CF-CATID match by category_id",
                  r["ok"] and r["eligible_subtotal"] == 160.0 and r["computed_discount"] == 100.0,
                  json.dumps(r))

    # V2-CP-CATID: CATEGORY_PERCENTAGE
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATPCT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=4, unit_price=100.0, category_name="Beverages")],
    )
    # 25% of 400 = 100. cap 200, so 100.
    await _assert("V2-CP-CATNAME match by category_name normalized",
                  r["ok"] and r["computed_discount"] == 100.0 and r["eligible_subtotal"] == 400.0)

    # V2-CP-NAME-CASE: case-insensitive
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATPCT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=2, unit_price=100.0, category_name="BEVERAGES")],
    )
    await _assert("V2-CP-CASE category_name case-insensitive", r["ok"] and r["eligible_subtotal"] == 200.0)

    # V2-CP-FALLBACK: item_category fallback against name
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATPCT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=2, unit_price=100.0, item_category="Beverages")],
    )
    await _assert("V2-CP-FALLBACK match via item_category (name)", r["ok"] and r["eligible_subtotal"] == 200.0)

    # V2-CF-FALLBACK-ID: item_category fallback against id
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=1, unit_price=80.0, item_category="12")],
    )
    await _assert("V2-CF-FALLBACK match via item_category (id)", r["ok"] and r["eligible_subtotal"] == 80.0)


async def qa_errors() -> None:
    # MISSING_ITEMS_FOR_ITEM_COUPON
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
    )
    await _assert("V2-ERR-MISS-ITEM no items errors", not r["ok"] and r["error"]["code"] == "MISSING_ITEMS_FOR_ITEM_COUPON")

    # MISSING_ITEMS_FOR_ITEM_COUPON empty list
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos", items=[],
    )
    await _assert("V2-ERR-MISS-ITEM empty list errors", not r["ok"] and r["error"]["code"] == "MISSING_ITEMS_FOR_ITEM_COUPON")

    # MISSING_ITEMS_FOR_CATEGORY_COUPON
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
    )
    await _assert("V2-ERR-MISS-CAT errors", not r["ok"] and r["error"]["code"] == "MISSING_ITEMS_FOR_CATEGORY_COUPON")

    # NO_ELIGIBLE_ITEMS_IN_CART
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_burger_line()],
    )
    await _assert("V2-ERR-NOELIG-ITEM rejects non-matching cart",
                  not r["ok"] and r["error"]["code"] == "NO_ELIGIBLE_ITEMS_IN_CART", json.dumps(r))

    # NO_ELIGIBLE_CATEGORY_IN_CART
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_burger_line(category_id="99", category_name="Mains")],
    )
    await _assert("V2-ERR-NOELIG-CAT rejects non-matching category",
                  not r["ok"] and r["error"]["code"] == "NO_ELIGIBLE_CATEGORY_IN_CART")


async def qa_min_qty() -> None:
    # Add a coupon with min_item_qty for this case.
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one({
        "id": cid, "user_id": USER_ID, "code": "QA_C2_MINQTY",
        "discount_type": "flat", "discount_value": 30.0,
        "start_date": now, "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0, "applicable_channels": ["pos"],
        "is_active": True, "total_used": 0, "created_at": now,
        "coupon_type": "item", "stackable_with_loyalty": False,
        "discount_scope": "item", "eligible_food_ids": ["182039"],
        "min_item_qty": 3, "per_user_limit": 5,
    })
    # Only 2 eligible qty
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_MINQTY",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(food_id="182039", qty=2, unit_price=100.0)],
    )
    await _assert("V2-MINQTY-FAIL min_item_qty not met",
                  not r["ok"] and r["error"]["code"] == "MIN_ITEM_QTY_NOT_MET")
    # 3 eligible qty → ok
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_MINQTY",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(food_id="182039", qty=3, unit_price=100.0)],
    )
    await _assert("V2-MINQTY-OK min_item_qty met", r["ok"])


async def qa_subtotal_math() -> None:
    # V2-SUB qty*unit_price
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=3, unit_price=70.0)],  # 210
    )
    await _assert("V2-SUB-QUNIT eligible_subtotal = qty*unit_price",
                  r["ok"] and r["eligible_subtotal"] == 210.0)

    # V2-SUB-FALLBACK: unit_price missing → line_total fallback
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[{"food_id": "182039", "quantity": 2, "line_total": 250.0}],
    )
    await _assert("V2-SUB-LT line_total fallback",
                  r["ok"] and r["eligible_subtotal"] == 250.0, json.dumps(r))

    # V2-SUB-INVALID: both missing → dropped silently
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[{"food_id": "182039", "quantity": 2}],  # no unit_price, no line_total
    )
    await _assert("V2-SUB-INVALID invalid line dropped → no eligible",
                  not r["ok"] and r["error"]["code"] == "NO_ELIGIBLE_ITEMS_IN_CART")


async def qa_caps_and_mixed() -> None:
    # V2-CAP-FLAT: flat cap by eligible_subtotal (₹50 flat, eligible only ₹40)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[_coffee_line(qty=1, unit_price=40.0)],
    )
    # ITEMFLAT discount_value=50, eligible_subtotal=40 → discount=40
    await _assert("V2-CAP-FLAT flat cap by eligible_subtotal",
                  r["ok"] and r["computed_discount"] == 40.0)

    # V2-PCT-CAP: percentage cap by max_discount (already covered above implicitly).
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_CATPCT",
        customer_id=CUSTOMER_ID, order_total=10000.0, channel="pos",
        items=[_coffee_line(qty=10, unit_price=1000.0, category_name="Beverages")],
    )
    # 25% of 10000 = 2500; cap 200 → 200
    await _assert("V2-PCT-CAP max_discount cap binds", r["ok"] and r["computed_discount"] == 200.0)

    # V2-MIX: mixed eligible + non-eligible
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMFLAT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[
            _coffee_line(qty=2, unit_price=100.0),  # eligible (food_id=182039), 200
            _burger_line(qty=1, unit_price=300.0),  # not eligible
        ],
    )
    # discount = min(50, 200) = 50
    await _assert("V2-MIX discounts only on eligible_subtotal",
                  r["ok"] and r["eligible_subtotal"] == 200.0 and r["computed_discount"] == 50.0)

    # V2-QTY per-line cap: covered in qa_item_flat via QA_C2_ITEMPCT (max_applicable_qty=2).
    # Explicit assertion:
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="QA_C2_ITEMPCT",
        customer_id=CUSTOMER_ID, order_total=500.0, channel="pos",
        items=[{"item_id": "L_3324", "quantity": 5, "unit_price": 100.0, "line_total": 500.0}],
    )
    # qty cap 2 → eligible_subtotal=200; 20% = 40; cap=50 → 40
    await _assert("V2-QTY per-line max_applicable_qty",
                  r["ok"] and r["eligible_subtotal"] == 200.0 and r["computed_discount"] == 40.0)


async def qa_final_order_record() -> None:
    order_id = f"v2_order_{RUN_ID}"
    cart = [
        {"food_id": "182039", "item_id": "L_3324", "name": "Coffee",
         "quantity": 2, "unit_price": 100.0, "line_total": 200.0},
    ]
    res = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID,
        code="QA_C2_ITEMFLAT",
        order_id=order_id, pos_order_id="POS-V2-A",
        order_total=500.0, coupon_discount_from_pos=50.0,
        channel="pos", source="pos_orders",
        items=cart,
    )
    await _assert("V2-REC-1 item coupon final-commit recorded",
                  res["ok"] and res["recorded"] and res.get("discount_scope") == "item",
                  json.dumps(res))

    row = await db.coupon_usage.find_one({"user_id": USER_ID, "order_id": order_id}, {"_id": 0})
    await _assert("V2-REC-2 row stores discount_scope+eligible_subtotal",
                  row is not None
                  and row.get("discount_scope") == "item"
                  and row.get("eligible_subtotal") == 200.0
                  and "182039" in (row.get("eligible_food_ids") or []),
                  json.dumps(row))

    # V2-REC-3 idempotent
    res2 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID,
        code="QA_C2_ITEMFLAT",
        order_id=order_id, pos_order_id="POS-V2-A",
        order_total=500.0, coupon_discount_from_pos=50.0,
        channel="pos", source="pos_orders",
        items=cart,
    )
    await _assert("V2-REC-3 idempotent replay",
                  res2["ok"] and not res2["recorded"] and res2["idempotent_replay"] is True)

    # V2-REC-4 missing items → not recorded
    res3 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID,
        code="QA_C2_ITEMFLAT",
        order_id=f"v2_order_{RUN_ID}_noitems", pos_order_id="POS-V2-B",
        order_total=500.0, coupon_discount_from_pos=50.0,
        channel="pos", source="pos_orders",
        items=None,
    )
    await _assert("V2-REC-4 missing items skips recording with structured error",
                  not res3["recorded"] and res3["error"]["code"] == "MISSING_ITEMS_FOR_ITEM_COUPON")


async def qa_analytics() -> None:
    stats = await get_coupon_stats(USER_ID)
    await _assert("V2-AN-1 analytics returns breakdown_by_scope",
                  isinstance(stats.get("breakdown_by_scope"), dict))
    # After V2-REC-1, item bucket should have >=1 used.
    by = stats["breakdown_by_scope"]
    await _assert("V2-AN-2 item scope counted",
                  by.get("item", {}).get("used", 0) >= 1, json.dumps(by))
    await _assert("V2-AN-3 total coupons_used reflects V2 row",
                  stats["coupons_used"] >= 1)


async def qa_admin_crud_compat() -> None:
    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one({
        "id": cid, "user_id": USER_ID, "code": "QA_C2_CRUD",
        "discount_type": "percentage", "discount_value": 5.0,
        "start_date": now, "end_date": "2099-01-01T00:00:00+00:00",
        "min_order_value": 0.0, "applicable_channels": ["pos"],
        "is_active": True, "total_used": 0, "created_at": now,
        "coupon_type": "item", "stackable_with_loyalty": False,
        "discount_scope": "item", "eligible_food_ids": ["foo"],
        "per_user_limit": 1,
    })
    # Verify Pydantic model can deserialize V2 row (admin GET path).
    from models.schemas import Coupon
    raw = await db.coupons.find_one({"id": cid}, {"_id": 0})
    parsed = Coupon.model_validate(raw)
    await _assert("V2-CRUD-1 Coupon model parses V2 fields",
                  parsed.discount_scope == "item" and parsed.eligible_food_ids == ["foo"])
    # Toggle
    await db.coupons.update_one({"id": cid}, {"$set": {"is_active": False}})
    after = await db.coupons.find_one({"id": cid})
    await _assert("V2-CRUD-2 toggle works on V2 row", after["is_active"] is False)
    # Delete
    await db.coupons.delete_one({"id": cid})


async def qa_loyalty_wallet_untouched() -> None:
    # Wallet
    wallet_tx_before = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    cart = [{"food_id": "182039", "item_id": "L_3324", "quantity": 2,
             "unit_price": 100.0, "line_total": 200.0}]
    await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID, code="QA_C2_ITEMFLAT",
        order_id=f"v2_loyalty_{RUN_ID}", pos_order_id="POS-V2-C",
        order_total=500.0, coupon_discount_from_pos=50.0,
        items=cart,
    )
    wallet_tx_after = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    await _assert("V2-LOYALTY-WALLET wallet collection untouched",
                  wallet_tx_before == wallet_tx_after)
    # Loyalty import works (regression smoke).
    import core.loyalty as _l  # noqa: F401
    await _assert("V2-LOYALTY core.loyalty importable", True)


async def qa_scope_resolution() -> None:
    """Sanity — V1 rows without discount_scope resolve to 'order'."""
    await _assert("V2-SCOPE-1 empty resolves to order",
                  resolve_discount_scope({}) == "order")
    await _assert("V2-SCOPE-2 discount_scope wins",
                  resolve_discount_scope({"discount_scope": "item"}) == "item")
    await _assert("V2-SCOPE-3 coupon_type fallback",
                  resolve_discount_scope({"coupon_type": "category"}) == "category")
    await _assert("V2-SCOPE-4 hint for order is None",
                  build_eligible_match_hint({"discount_scope": "order"}) is None)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def main() -> int:
    try:
        await setup()
        await qa_scope_resolution()
        await qa_v1_still_works()
        await qa_available_endpoint()
        await qa_item_flat()
        await qa_item_percentage()
        await qa_category()
        await qa_errors()
        await qa_min_qty()
        await qa_subtotal_math()
        await qa_caps_and_mixed()
        await qa_final_order_record()
        await qa_analytics()
        await qa_admin_crud_compat()
        await qa_loyalty_wallet_untouched()
    finally:
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
