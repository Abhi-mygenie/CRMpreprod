"""CR-021 — Distribute-first benefit selection + POS-zero universal recording.

Run:
    cd /app/backend && python -m tests.qa_cr021_distribute_and_pos_zero

Self-contained — seeds + cleans up a synthetic test tenant `pos_cr021_test`.
No live POS traffic; all calls direct against `record_coupon_usage_for_order`
and the V3-B / V3-C compute helpers.
"""

import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app/backend")
os.environ.setdefault(
    "MONGO_URL",
    "mongodb://mygenie_admin:QplazmMzalpq@52.66.232.149:27017/mygenie?authSource=mygenie",
)
os.environ.setdefault("DB_NAME", "mygenie")

from core.database import db
from core.coupon import (
    _v3b_compute_discount,
    _v3c_compute_discount,
    record_coupon_usage_for_order,
)

TEST_USER_ID = "pos_cr021_test"
RESULTS = {"pass": 0, "fail": 0, "rows": []}


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        RESULTS["pass"] += 1
        RESULTS["rows"].append((name, "PASS", ""))
        print(f"  [OK ] {name}")
    else:
        RESULTS["fail"] += 1
        RESULTS["rows"].append((name, "FAIL", detail))
        print(f"  [FAIL] {name} — {detail}")


def _cart(items):
    """items: [(food_id, name, qty, unit_price), ...]"""
    return [
        {"item_id": fid, "food_id": fid, "name": nm, "quantity": q, "unit_price": float(p)}
        for fid, nm, q, p in items
    ]


async def _seed():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
    await db.customers.delete_many({"user_id": TEST_USER_ID})
    await db.customers.insert_one({
        "id": "cust_cr021", "user_id": TEST_USER_ID,
        "phone": "+919999999999", "name": "CR021 Test",
        "country_code": "+91", "total_coupon_used": 0,
        "created_at": _iso(),
    })

    now = datetime.now(timezone.utc).isoformat()
    far_future = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
    far_past_start = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()

    # V3-B BXG: buy A, get X/Y at percentage 50%
    await db.coupons.insert_one({
        "id": "cr021_v3b_bogo", "user_id": TEST_USER_ID,
        "code": "CR021_BOGO", "title": "CR-021 V3-B test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos", "dine_in", "takeaway", "delivery"],
        "offer_type": "bxg", "discount_scope": "item", "coupon_type": "item",
        "buy_food_ids": ["A"], "buy_quantity": 1,
        "get_food_ids": ["X", "Y"], "get_quantity": 1,
        "get_discount_type": "percentage", "get_discount_value": 50.0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "percentage", "discount_value": 50.0,
    })

    # V3-B BXG: buy A, get X/Y at FREE (for distribute tests with cleaner math)
    await db.coupons.insert_one({
        "id": "cr021_v3b_bogo_free", "user_id": TEST_USER_ID,
        "code": "CR021_BOGO_FREE", "title": "CR-021 V3-B free test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "bxg", "discount_scope": "item", "coupon_type": "item",
        "buy_food_ids": ["A"], "buy_quantity": 1,
        "get_food_ids": ["X", "Y"], "get_quantity": 1,
        "get_discount_type": "free", "get_discount_value": None,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "free", "discount_value": 0,
    })

    # V3-C Nth: every 2nd item free, eligible [A, B, C]
    await db.coupons.insert_one({
        "id": "cr021_v3c_nth", "user_id": TEST_USER_ID,
        "code": "CR021_NTH", "title": "CR-021 V3-C test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "nth_item", "discount_scope": "item", "coupon_type": "item",
        "eligible_food_ids": ["A", "B", "C"],
        "nth_item_number": 2, "nth_discount_type": "free",
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "free", "discount_value": 0,
    })

    # V1 simple — 10% off, no min order
    await db.coupons.insert_one({
        "id": "cr021_v1_simple", "user_id": TEST_USER_ID,
        "code": "CR021_PCT10", "title": "CR-021 V1 simple test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "order", "coupon_type": "order",
        "discount_type": "percentage", "discount_value": 10.0,
        "min_order_value": 0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })

    # V1 simple — 10% off but min_order=500 (for D12: CRM also yields 0)
    await db.coupons.insert_one({
        "id": "cr021_v1_minorder", "user_id": TEST_USER_ID,
        "code": "CR021_MIN500", "title": "CR-021 V1 min-order test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "order", "coupon_type": "order",
        "discount_type": "percentage", "discount_value": 10.0,
        "min_order_value": 500,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })

    # V2 item-scope — 20% off eligible [A, B]
    await db.coupons.insert_one({
        "id": "cr021_v2_item", "user_id": TEST_USER_ID,
        "code": "CR021_ITEM20", "title": "CR-021 V2 item test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "simple", "discount_scope": "item", "coupon_type": "item",
        "discount_type": "percentage", "discount_value": 20.0,
        "eligible_food_ids": ["A", "B"],
        "min_order_value": 0,
        "usage_limit": 100, "per_user_limit": 100, "total_used": 0,
    })

    # Usage-limit dedicated coupon for D6 (limit=1, isolated)
    await db.coupons.insert_one({
        "id": "cr021_v3b_limit1", "user_id": TEST_USER_ID,
        "code": "CR021_LIMIT1", "title": "CR-021 usage-limit test", "is_active": True,
        "start_date": far_past_start, "end_date": far_future,
        "applicable_channels": ["pos"],
        "offer_type": "bxg", "discount_scope": "item", "coupon_type": "item",
        "buy_food_ids": ["A"], "buy_quantity": 1,
        "get_food_ids": ["X"], "get_quantity": 1,
        "get_discount_type": "free", "get_discount_value": None,
        "usage_limit": 1, "per_user_limit": 1, "total_used": 0,
        "allow_repeat": True,
        "discount_type": "free", "discount_value": 0,
    })


def _iso():
    return datetime.now(timezone.utc).isoformat()


async def _cleanup():
    await db.coupons.delete_many({"user_id": TEST_USER_ID})
    await db.coupon_usage.delete_many({"user_id": TEST_USER_ID})
    await db.customers.delete_many({"user_id": TEST_USER_ID})


# ─── Cases ──────────────────────────────────────────────────────────────

async def case_d1_bogo_distribute_cheapest():
    """D1: BOGO mixed cart with 2 distinct get-lines × 2 apps → distribute 1 per line."""
    print("\n--- D1: BOGO distribute (default cheapest) ---")
    coupon = await db.coupons.find_one({"id": "cr021_v3b_bogo_free"})
    # 2 buys of A → apps=2; gets [X=50×2, Y=250×2]; need 2 free units.
    # Distribute-first: 1 from cheapest distinct line (X), then 1 from next (Y) → discount=50+250=300
    cart = _cart([("A", "A", 2, 100), ("X", "X", 2, 50), ("Y", "Y", 2, 250)])
    r = _v3b_compute_discount(coupon, "bxg", cart)
    await _assert("D1.1 ok=True", r["ok"], str(r))
    if r["ok"]:
        await _assert("D1.2 apps=2", r["applied_applications"] == 2, f"got {r['applied_applications']}")
        await _assert("D1.3 discount=300", r["computed_discount"] == 300.0, f"got {r['computed_discount']}")
        names = sorted([b["name"] for b in r["benefit_items"]])
        await _assert("D1.4 distributes 1 X + 1 Y", names == ["X", "Y"], f"got {names}")


async def case_d2_bogo_distribute_highest():
    """D2: BOGO with apply_to_highest_item=True distributes from highest first."""
    print("\n--- D2: BOGO distribute (highest first) ---")
    # Mutate the coupon flag in-place for this test
    coupon = await db.coupons.find_one({"id": "cr021_v3b_bogo_free"})
    coupon = {**coupon, "apply_to_highest_item": True}
    cart = _cart([("A", "A", 2, 100), ("X", "X", 2, 50), ("Y", "Y", 2, 250)])
    r = _v3b_compute_discount(coupon, "bxg", cart)
    await _assert("D2.1 ok=True", r["ok"], str(r))
    if r["ok"]:
        await _assert("D2.2 apps=2", r["applied_applications"] == 2, f"got {r['applied_applications']}")
        # Highest first → 1 Y + 1 X (250+50=300, same total)
        names = sorted([b["name"] for b in r["benefit_items"]])
        await _assert("D2.3 distributes 1 Y + 1 X", names == ["X", "Y"], f"got {names}")
        # Y comes first in selection — its line_discount must be present
        y_disc = next((b["line_discount"] for b in r["benefit_items"] if b["name"] == "Y"), 0)
        await _assert("D2.4 Y line_discount=250", y_disc == 250.0, f"got {y_disc}")


async def case_d3_nth_distribute_mixed():
    """D3: Nth cart with 3 distinct eligible lines distributes."""
    print("\n--- D3: Nth distribute mixed ---")
    coupon = await db.coupons.find_one({"id": "cr021_v3c_nth"})
    # 4 eligible units across 3 lines: A=250, B=250, C=50×2; n=2 → apps=2 → 2 free
    # Distribute-first cheapest: C is cheapest → take 1 C, then next cheapest tie-break by insertion = A → take 1 A
    # discount = 50 (C) + 250 (A) = 300
    cart = _cart([("A", "A", 1, 250), ("B", "B", 1, 250), ("C", "C", 2, 50)])
    r = _v3c_compute_discount(coupon, cart)
    await _assert("D3.1 ok=True", r["ok"], str(r))
    if r["ok"]:
        await _assert("D3.2 apps=2", r["applied_applications"] == 2, f"got {r['applied_applications']}")
        await _assert("D3.3 discount=300", r["computed_discount"] == 300.0, f"got {r['computed_discount']}")
        names = sorted([b["name"] for b in r["benefit_items"]])
        await _assert("D3.4 NOT 2× cheapest, distributes", names == ["A", "C"], f"got {names}")


async def case_d4_nth_single_line():
    """D4: Nth single-line cart unchanged from legacy behavior."""
    print("\n--- D4: Nth single-line (back-compat) ---")
    coupon = await db.coupons.find_one({"id": "cr021_v3c_nth"})
    cart = _cart([("A", "A", 4, 250)])  # 4 units, n=2 → 2 free
    r = _v3c_compute_discount(coupon, cart)
    await _assert("D4.1 ok=True", r["ok"], str(r))
    if r["ok"]:
        await _assert("D4.2 apps=2", r["applied_applications"] == 2, f"got {r['applied_applications']}")
        await _assert("D4.3 discount=500", r["computed_discount"] == 500.0, f"got {r['computed_discount']}")
        bi = r["benefit_items"]
        await _assert("D4.4 only A in benefit_items", all(b["name"] == "A" for b in bi), str(bi))


async def case_d5_pos_zero_v3b_record():
    """D5: V3-B BOGO POS sends 0 → CRM records using crm_computed."""
    print("\n--- D5: POS=0 V3-B BOGO records via CRM safety net ---")
    cart = _cart([("A", "A", 1, 100), ("X", "X", 1, 50)])
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_BOGO_FREE",
        order_id="cr021_d5_order_1", pos_order_id="POS-D5-1",
        order_total=150.0, coupon_discount_from_pos=0.0,
        channel="pos", items=cart,
    )
    await _assert("D5.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D5.2 recorded=True", r.get("recorded") is True, str(r))
    await _assert("D5.3 discount_mismatch=True", r.get("discount_mismatch") is True, str(r))
    await _assert("D5.4 coupon_discount = crm_computed", r.get("coupon_discount") == r.get("crm_computed_discount"), str(r))
    await _assert("D5.5 coupon_discount=50.0 (X free)", r.get("coupon_discount") == 50.0, str(r))
    # Confirm DB row
    row = await db.coupon_usage.find_one({"user_id": TEST_USER_ID, "order_id": "cr021_d5_order_1"})
    await _assert("D5.6 DB row created", row is not None)
    if row:
        await _assert("D5.7 DB.coupon_discount=50", row.get("coupon_discount") == 50.0, str(row.get("coupon_discount")))
        await _assert("D5.8 DB.discount_mismatch=True", row.get("discount_mismatch") is True, str(row.get("discount_mismatch")))


async def case_d6_usage_limit_blocks_second():
    """D6: Second redemption of CR021_LIMIT1 (usage_limit=1) blocked."""
    print("\n--- D6: usage_limit=1 blocks 2nd order ---")
    cart = _cart([("A", "A", 1, 100), ("X", "X", 1, 50)])
    # First call — should record
    r1 = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_LIMIT1",
        order_id="cr021_d6_order_1", pos_order_id="POS-D6-1",
        order_total=150.0, coupon_discount_from_pos=0.0,
        channel="pos", items=cart,
    )
    await _assert("D6.1 first ok=True recorded=True", r1.get("ok") and r1.get("recorded"), str(r1))
    # Second call — different order_id → should fail with USAGE_LIMIT_REACHED
    r2 = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_LIMIT1",
        order_id="cr021_d6_order_2", pos_order_id="POS-D6-2",
        order_total=150.0, coupon_discount_from_pos=0.0,
        channel="pos", items=cart,
    )
    await _assert("D6.2 second ok=False", r2.get("ok") is False, str(r2))
    err_code = (r2.get("error") or {}).get("code")
    await _assert("D6.3 error code USAGE_LIMIT_REACHED or CUSTOMER_USAGE_LIMIT_REACHED",
                  err_code in {"USAGE_LIMIT_REACHED", "CUSTOMER_USAGE_LIMIT_REACHED"}, f"got {err_code}")


async def case_d7_idempotency_replay():
    """D7: Replay same order_id from D5 → idempotent, no double-record."""
    print("\n--- D7: idempotent replay of D5 ---")
    cart = _cart([("A", "A", 1, 100), ("X", "X", 1, 50)])
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_BOGO_FREE",
        order_id="cr021_d5_order_1",  # SAME as D5
        pos_order_id="POS-D5-1",
        order_total=150.0, coupon_discount_from_pos=0.0,
        channel="pos", items=cart,
    )
    await _assert("D7.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D7.2 recorded=False (replay)", r.get("recorded") is False, str(r))
    await _assert("D7.3 idempotent_replay=True", r.get("idempotent_replay") is True, str(r))
    count = await db.coupon_usage.count_documents({"user_id": TEST_USER_ID, "order_id": "cr021_d5_order_1"})
    await _assert("D7.4 DB has exactly 1 row for that order_id", count == 1, f"got {count}")
    # Confirm coupon total_used not double-incremented
    cp = await db.coupons.find_one({"id": "cr021_v3b_bogo_free"})
    await _assert("D7.5 cr021_v3b_bogo_free.total_used == 1", cp.get("total_used") == 1, f"got {cp.get('total_used')}")


async def case_d8_pos_zero_v1_record():
    """D8 (D3 all-in): V1 simple POS=0 → NOW RECORDS via CRM safety net."""
    print("\n--- D8: POS=0 V1 simple records via CRM (D3 all-in) ---")
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_PCT10",
        order_id="cr021_d8_order_1", pos_order_id="POS-D8-1",
        order_total=1000.0, coupon_discount_from_pos=0.0,
        channel="pos", items=None,
    )
    await _assert("D8.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D8.2 recorded=True", r.get("recorded") is True, str(r))
    await _assert("D8.3 coupon_discount=100 (10% of 1000)", r.get("coupon_discount") == 100.0, str(r))
    await _assert("D8.4 discount_mismatch=True", r.get("discount_mismatch") is True, str(r))


async def case_d9_pos_zero_v2_record():
    """D9: V2 item-scope POS=0 → records using CRM."""
    print("\n--- D9: POS=0 V2 item-scope records via CRM ---")
    cart = _cart([("A", "A", 1, 500), ("B", "B", 1, 500)])
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_ITEM20",
        order_id="cr021_d9_order_1", pos_order_id="POS-D9-1",
        order_total=1000.0, coupon_discount_from_pos=0.0,
        channel="pos", items=cart,
    )
    await _assert("D9.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D9.2 recorded=True", r.get("recorded") is True, str(r))
    await _assert("D9.3 coupon_discount=200 (20% of A+B = 200)", r.get("coupon_discount") == 200.0, str(r))
    await _assert("D9.4 discount_mismatch=True", r.get("discount_mismatch") is True, str(r))


async def case_d10_pos_nonzero_mismatch():
    """D10: POS>0 differs from CRM → record POS, flag mismatch (existing)."""
    print("\n--- D10: POS>0 mismatch unchanged ---")
    cart = _cart([("A", "A", 1, 100), ("X", "X", 1, 50)])
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_BOGO_FREE",
        order_id="cr021_d10_order_1", pos_order_id="POS-D10-1",
        order_total=150.0, coupon_discount_from_pos=25.0,  # POS sent 25, CRM=50
        channel="pos", items=cart,
    )
    await _assert("D10.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D10.2 recorded=True", r.get("recorded") is True, str(r))
    await _assert("D10.3 coupon_discount=25 (POS-sent wins)", r.get("coupon_discount") == 25.0, str(r))
    await _assert("D10.4 crm_computed=50", r.get("crm_computed_discount") == 50.0, str(r))
    await _assert("D10.5 discount_mismatch=True", r.get("discount_mismatch") is True, str(r))


async def case_d11_pos_matches_crm():
    """D11: POS>0 matches CRM → no mismatch flag."""
    print("\n--- D11: POS>0 matches CRM ---")
    cart = _cart([("A", "A", 1, 100), ("X", "X", 1, 50)])
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_BOGO_FREE",
        order_id="cr021_d11_order_1", pos_order_id="POS-D11-1",
        order_total=150.0, coupon_discount_from_pos=50.0,
        channel="pos", items=cart,
    )
    await _assert("D11.1 ok=True", r.get("ok") is True, str(r))
    await _assert("D11.2 recorded=True", r.get("recorded") is True, str(r))
    await _assert("D11.3 coupon_discount=50", r.get("coupon_discount") == 50.0, str(r))
    await _assert("D11.4 discount_mismatch=False", r.get("discount_mismatch") is False, str(r))


async def case_d12_pos_zero_crm_zero_skip():
    """D12: POS=0 AND CRM=0 (min_order not met) → still SKIP."""
    print("\n--- D12: POS=0 AND CRM=0 → skip ---")
    r = await record_coupon_usage_for_order(
        db,
        user_id=TEST_USER_ID, restaurant_id=None, customer_id="cust_cr021",
        code="CR021_MIN500",
        order_id="cr021_d12_order_1", pos_order_id="POS-D12-1",
        order_total=100.0,  # below min_order_value=500
        coupon_discount_from_pos=0.0,
        channel="pos", items=None,
    )
    await _assert("D12.1 ok=False", r.get("ok") is False, str(r))
    # Validation will fail with MIN_ORDER_NOT_MET BEFORE the late-skip block runs.
    # That's the correct behavior — no row written either way.
    err_code = (r.get("error") or {}).get("code")
    await _assert("D12.2 error MIN_ORDER_NOT_MET or INACTIVE",
                  err_code in {"MIN_ORDER_NOT_MET", "INACTIVE"}, f"got {err_code}")
    count = await db.coupon_usage.count_documents({"user_id": TEST_USER_ID, "order_id": "cr021_d12_order_1"})
    await _assert("D12.3 no DB row written", count == 0, f"got {count}")


async def main():
    print("=" * 70)
    print("CR-021 QA — Distribute-first + POS-zero universal recording")
    print("=" * 70)
    await _seed()
    try:
        await case_d1_bogo_distribute_cheapest()
        await case_d2_bogo_distribute_highest()
        await case_d3_nth_distribute_mixed()
        await case_d4_nth_single_line()
        await case_d5_pos_zero_v3b_record()
        await case_d6_usage_limit_blocks_second()
        await case_d7_idempotency_replay()
        await case_d8_pos_zero_v1_record()
        await case_d9_pos_zero_v2_record()
        await case_d10_pos_nonzero_mismatch()
        await case_d11_pos_matches_crm()
        await case_d12_pos_zero_crm_zero_skip()
    finally:
        await _cleanup()

    print("\n" + "=" * 70)
    total = RESULTS["pass"] + RESULTS["fail"]
    print(f"TOTAL: {RESULTS['pass']}/{total} PASS")
    print("=" * 70)
    if RESULTS["fail"]:
        print("\nFAILURES:")
        for n, s, d in RESULTS["rows"]:
            if s == "FAIL":
                print(f"  {n} — {d}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
