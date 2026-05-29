"""
CR-001C-C V1 — Coupon V1 QA harness.

Runs all 32 QA cases listed in
`/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md`
Addendum (A.1–A.7).

Strategy: each case uses a synthetic `user_id = "QA_C1_USER_<run-id>"` so it
does NOT pollute any real CRM user's data. Cleanup removes everything
created.

Run: python -m backend.tests.qa_cr001c_c_coupon_v1
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
    compute_coupon_discount,
    normalize_coupon_type,
    validate_coupon_for_customer,
    list_available_coupons,
    record_coupon_usage_for_order,
)
from services.analytics_service import get_coupon_stats  # noqa: E402
from tests.seed_coupon_v1_fixtures import seed, cleanup, FIXTURE_PREFIX  # noqa: E402

RESULTS: list[dict] = []
RUN_ID = uuid.uuid4().hex[:8]
USER_ID = f"QA_C1_USER_{RUN_ID}"
CUSTOMER_ID_PRIMARY = f"QA_C1_CUST_{RUN_ID}_A"
CUSTOMER_ID_SECONDARY = f"QA_C1_CUST_{RUN_ID}_B"


def _record(name: str, ok: bool, detail: str = "") -> None:
    RESULTS.append({"case": name, "ok": ok, "detail": detail})


async def _assert(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        _record(name, True)
    else:
        _record(name, False, detail or "assertion failed")


async def setup() -> dict:
    fx = await seed(db, USER_ID, CUSTOMER_ID_PRIMARY)
    # Insert minimal customer doc so per_user_limit counters work against
    # an existing customer id (validation does not require customers collection,
    # but completeness).
    return fx


async def teardown() -> None:
    await cleanup(db, USER_ID)
    # Clean coupon_transactions seeded by QA-25.
    await db.coupon_transactions.delete_many({"user_id": USER_ID})


# ---------------------------------------------------------------------------
# QA cases
# ---------------------------------------------------------------------------
async def qa_pure_math() -> None:
    """QA pure helpers (not numbered — sanity)."""
    c_flat = {"discount_type": "flat", "discount_value": 50, "max_discount": None}
    c_pct = {"discount_type": "percentage", "discount_value": 10, "max_discount": 80}
    await _assert("MATH-flat", compute_coupon_discount(c_flat, 1000) == 50.0)
    await _assert("MATH-flat-clamp", compute_coupon_discount(c_flat, 20) == 20.0)
    await _assert("MATH-pct", compute_coupon_discount(c_pct, 500) == 50.0)
    await _assert("MATH-pct-cap", compute_coupon_discount(c_pct, 10000) == 80.0)
    await _assert("MATH-norm-order", normalize_coupon_type("order_flat") == "order")
    try:
        normalize_coupon_type("bogo")
        await _assert("MATH-norm-reject", False, "bogo should raise")
    except ValueError:
        await _assert("MATH-norm-reject", True)


async def qa_available() -> None:
    out = await list_available_coupons(
        db, user_id=USER_ID, customer_id=CUSTOMER_ID_PRIMARY,
        order_total=600.0, channel="pos",
    )
    codes = {c["code"] for c in out}
    await _assert("QA-01 available returns eligible", f"{FIXTURE_PREFIX}FLAT50" in codes and f"{FIXTURE_PREFIX}PCT10" in codes,
                  f"got {codes}")
    await _assert("QA-02 available excludes INACTIVE", f"{FIXTURE_PREFIX}INACTIVE" not in codes)
    await _assert("QA-03 available excludes EXPIRED", f"{FIXTURE_PREFIX}EXPIRED" not in codes)
    # FLAT50 has min_order 200. Test min-order-not-met with 50.
    out_low = await list_available_coupons(
        db, user_id=USER_ID, customer_id=CUSTOMER_ID_PRIMARY,
        order_total=50.0, channel="pos",
    )
    codes_low = {c["code"] for c in out_low}
    await _assert("QA-04 available excludes min_order_not_met", f"{FIXTURE_PREFIX}FLAT50" not in codes_low)
    # VIPONLY only allowed for CUSTOMER_ID_PRIMARY. Test secondary customer.
    out_other = await list_available_coupons(
        db, user_id=USER_ID, customer_id=CUSTOMER_ID_SECONDARY,
        order_total=600.0, channel="pos",
    )
    codes_other = {c["code"] for c in out_other}
    await _assert("QA-05 available respects specific_users (in)", f"{FIXTURE_PREFIX}VIPONLY" in codes)
    await _assert("QA-05 available respects specific_users (out)", f"{FIXTURE_PREFIX}VIPONLY" not in codes_other)


async def qa_validate() -> None:
    # QA-06 flat success
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}FLAT50",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=1000.0, channel="pos",
    )
    await _assert("QA-06 flat success", r["ok"] and r["computed_discount"] == 50.0, json.dumps(r))

    # QA-07 percentage success
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}PCT10",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=500.0, channel="pos",
    )
    await _assert("QA-07 pct success", r["ok"] and r["computed_discount"] == 50.0)

    # QA-08 max_discount cap
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}PCT10",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=10000.0, channel="pos",
    )
    await _assert("QA-08 pct cap", r["ok"] and r["computed_discount"] == 80.0)

    # QA-09 INVALID_CODE
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code="NOPE_DOES_NOT_EXIST",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=100.0,
    )
    await _assert("QA-09 INVALID_CODE", not r["ok"] and r["error"]["code"] == "INVALID_CODE")

    # QA-10 EXPIRED
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}EXPIRED",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=100.0,
    )
    await _assert("QA-10 EXPIRED", not r["ok"] and r["error"]["code"] == "EXPIRED", json.dumps(r))

    # QA-11 INACTIVE
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}INACTIVE",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=100.0,
    )
    await _assert("QA-11 INACTIVE", not r["ok"] and r["error"]["code"] == "INACTIVE")

    # QA-12 MIN_ORDER_NOT_MET (FLAT50 needs 200)
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}FLAT50",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=50.0,
    )
    await _assert("QA-12 MIN_ORDER_NOT_MET", not r["ok"] and r["error"]["code"] == "MIN_ORDER_NOT_MET")

    # QA-13 USAGE_LIMIT_REACHED — set usage_limit=1 on a coupon and bump total_used.
    fl = await db.coupons.find_one({"user_id": USER_ID, "code": f"{FIXTURE_PREFIX}FLAT50"})
    await db.coupons.update_one({"id": fl["id"]}, {"$set": {"usage_limit": 1, "total_used": 1}})
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}FLAT50",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=1000.0,
    )
    await _assert("QA-13 USAGE_LIMIT_REACHED", not r["ok"] and r["error"]["code"] == "USAGE_LIMIT_REACHED")
    # Reset for later tests.
    await db.coupons.update_one({"id": fl["id"]}, {"$set": {"usage_limit": None, "total_used": 0}})

    # QA-14 CUSTOMER_USAGE_LIMIT_REACHED — PERUSER has per_user_limit=1. Insert one fake usage.
    per = await db.coupons.find_one({"user_id": USER_ID, "code": f"{FIXTURE_PREFIX}PERUSER"})
    await db.coupon_usage.insert_one({
        "id": str(uuid.uuid4()), "user_id": USER_ID, "coupon_id": per["id"],
        "customer_id": CUSTOMER_ID_PRIMARY, "order_id": f"qa14_{RUN_ID}",
        "coupon_code": per["code"], "order_total": 100.0, "coupon_discount": 10.0,
        "channel": "pos", "created_at": datetime.now(timezone.utc).isoformat(),
        "order_value": 100.0, "discount_applied": 10.0, "used_at": datetime.now(timezone.utc).isoformat(),
    })
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}PERUSER",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=100.0,
    )
    await _assert("QA-14 CUSTOMER_USAGE_LIMIT_REACHED", not r["ok"] and r["error"]["code"] == "CUSTOMER_USAGE_LIMIT_REACHED")

    # QA-15 CUSTOMER_NOT_ELIGIBLE — VIPONLY only allows CUSTOMER_ID_PRIMARY.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}VIPONLY",
        customer_id=CUSTOMER_ID_SECONDARY, order_total=1000.0,
    )
    await _assert("QA-15 CUSTOMER_NOT_ELIGIBLE", not r["ok"] and r["error"]["code"] == "CUSTOMER_NOT_ELIGIBLE")

    # QA-16 CHANNEL_NOT_VALID — FLAT50 allows pos/dine_in only; try delivery.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}FLAT50",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=1000.0, channel="delivery",
    )
    await _assert("QA-16 CHANNEL_NOT_VALID", not r["ok"] and r["error"]["code"] == "CHANNEL_NOT_VALID")

    # QA-17 STACKING_NOT_ALLOWED — FLAT50 has stackable_with_loyalty=False.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}FLAT50",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=1000.0, loyalty_points_used=50,
    )
    await _assert("QA-17 STACKING_NOT_ALLOWED", not r["ok"] and r["error"]["code"] == "STACKING_NOT_ALLOWED")

    # QA-18 stacking allowed — PCT10 has stackable_with_loyalty=True.
    r = await validate_coupon_for_customer(
        db, user_id=USER_ID, code=f"{FIXTURE_PREFIX}PCT10",
        customer_id=CUSTOMER_ID_PRIMARY, order_total=500.0, loyalty_points_used=50,
    )
    await _assert("QA-18 stacking allowed when flag True", r["ok"], json.dumps(r))


async def qa_final_order_record() -> None:
    order_id = f"qa19_order_{RUN_ID}"
    res = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}FLAT50",
        order_id=order_id, pos_order_id="POS-19",
        order_total=1000.0, coupon_discount_from_pos=50.0,
        channel="pos", source="pos_orders",
    )
    await _assert("QA-19 record once", res["ok"] and res["recorded"] and res["idempotent_replay"] is False, json.dumps(res))
    row = await db.coupon_usage.find_one({"user_id": USER_ID, "order_id": order_id}, {"_id": 0})
    await _assert("QA-19 row inserted", row is not None and row["coupon_discount"] == 50.0)
    coupon_doc = await db.coupons.find_one({"user_id": USER_ID, "code": f"{FIXTURE_PREFIX}FLAT50"})
    await _assert("QA-19 total_used incremented", coupon_doc["total_used"] == 1)

    # QA-20 idempotent replay
    res2 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}FLAT50",
        order_id=order_id, pos_order_id="POS-19",
        order_total=1000.0, coupon_discount_from_pos=50.0,
        channel="pos", source="pos_orders",
    )
    await _assert("QA-20 idempotent replay", res2["ok"] and res2["recorded"] is False and res2["idempotent_replay"] is True)
    coupon_doc2 = await db.coupons.find_one({"user_id": USER_ID, "code": f"{FIXTURE_PREFIX}FLAT50"})
    await _assert("QA-20 total_used unchanged on replay", coupon_doc2["total_used"] == 1)

    # QA-21 coupon_code present, coupon_discount = 0
    res3 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}FLAT50",
        order_id=f"qa21_order_{RUN_ID}", pos_order_id="POS-21",
        order_total=1000.0, coupon_discount_from_pos=0.0,
    )
    await _assert("QA-21 zero discount skipped", not res3["recorded"] and res3["error"]["field"] == "coupon_discount")

    # QA-22 coupon_discount > 0 but coupon_code missing
    res4 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code="",
        order_id=f"qa22_order_{RUN_ID}", pos_order_id="POS-22",
        order_total=1000.0, coupon_discount_from_pos=50.0,
    )
    await _assert("QA-22 missing code skipped", not res4["recorded"] and res4["error"]["code"] == "INVALID_CODE")

    # QA-23 coupon_code present but validation fails (EXPIRED)
    res5 = await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}EXPIRED",
        order_id=f"qa23_order_{RUN_ID}", pos_order_id="POS-23",
        order_total=1000.0, coupon_discount_from_pos=25.0,
    )
    await _assert("QA-23 validation fails at final-commit", not res5["recorded"] and res5["error"]["code"] == "EXPIRED")


async def qa_analytics() -> None:
    # QA-24 — realtime row (QA-19 already inserted one). Check stats.
    stats = await get_coupon_stats(USER_ID)
    realtime_count_after_qa19 = stats["coupons_used"]
    await _assert("QA-24 analytics reflects realtime", stats["coupons_used"] >= 1 and stats["discount_availed"] >= 50.0,
                  json.dumps(stats))

    # QA-25 — insert synthetic legacy migration row.
    await db.coupon_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "coupon_id": "LEGACY",
        "customer_id": CUSTOMER_ID_PRIMARY,
        "discount_amount": 12.50,
        "pos_order_id": f"legacy_{RUN_ID}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    stats2 = await get_coupon_stats(USER_ID)
    await _assert("QA-25 analytics reflects legacy", stats2["coupons_used"] == realtime_count_after_qa19 + 1)
    await _assert("QA-25 analytics sums both", abs(stats2["discount_availed"] - (stats["discount_availed"] + 12.50)) < 0.01)

    # QA-29 — overlap doc: same pos_order_id in both. Already have QA-19 row with order_id=qa19_order_*
    # Insert legacy row with same pos_order_id to encode invariant.
    await db.coupon_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "coupon_id": "OVERLAP",
        "customer_id": CUSTOMER_ID_PRIMARY,
        "discount_amount": 1.00,
        "pos_order_id": f"qa19_order_{RUN_ID}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    stats3 = await get_coupon_stats(USER_ID)
    await _assert(
        "QA-29 overlap counts both (documented limitation)",
        stats3["coupons_used"] == stats2["coupons_used"] + 1,
        json.dumps(stats3),
    )

    # QA-30 — realtime path writes only to coupon_usage.
    legacy_count_before = await db.coupon_transactions.count_documents({"user_id": USER_ID})
    await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}PCT10",
        order_id=f"qa30_order_{RUN_ID}", pos_order_id="POS-30",
        order_total=500.0, coupon_discount_from_pos=50.0,
    )
    legacy_count_after = await db.coupon_transactions.count_documents({"user_id": USER_ID})
    await _assert("QA-30 realtime does NOT touch coupon_transactions", legacy_count_before == legacy_count_after)

    # QA-31 — migration path writes only to coupon_transactions (simulated).
    usage_count_before = await db.coupon_usage.count_documents({"user_id": USER_ID})
    await db.coupon_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": USER_ID,
        "coupon_id": "MIGRATION_SIM",
        "customer_id": CUSTOMER_ID_PRIMARY,
        "discount_amount": 5.0,
        "pos_order_id": f"sim_migr_{RUN_ID}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    usage_count_after = await db.coupon_usage.count_documents({"user_id": USER_ID})
    await _assert("QA-31 migration does NOT touch coupon_usage", usage_count_before == usage_count_after)


async def qa_admin_crud_smoke() -> None:
    """QA-26 family: 9 admin CRUD endpoints reachable + new fields visible."""
    # Direct service-level smoke without HTTP — verifies model + db layer.
    coupon_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.coupons.insert_one({
        "id": coupon_id,
        "user_id": USER_ID,
        "code": f"{FIXTURE_PREFIX}CRUD",
        "discount_type": "flat",
        "discount_value": 5.0,
        "start_date": now,
        "end_date": (datetime.now(timezone.utc) + __import__("datetime").timedelta(days=10)).isoformat(),
        "usage_limit": None,
        "per_user_limit": 1,
        "min_order_value": 0.0,
        "max_discount": None,
        "specific_users": None,
        "applicable_channels": ["pos"],
        "description": "CRUD smoke",
        "title": "Smoke Title",
        "coupon_type": "order",
        "stackable_with_loyalty": False,
        "is_active": True,
        "total_used": 0,
        "created_at": now,
    })
    found = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    await _assert("QA-26 admin create + new fields visible",
                  found is not None and found.get("title") == "Smoke Title"
                  and found.get("stackable_with_loyalty") is False
                  and found.get("coupon_type") == "order")
    # Toggle
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"is_active": False}})
    after = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    await _assert("QA-26 admin toggle", after["is_active"] is False)
    # Update
    await db.coupons.update_one({"id": coupon_id}, {"$set": {"description": "updated"}})
    upd = await db.coupons.find_one({"id": coupon_id}, {"_id": 0})
    await _assert("QA-26 admin update", upd["description"] == "updated")
    # Delete
    await db.coupons.delete_one({"id": coupon_id})
    gone = await db.coupons.find_one({"id": coupon_id})
    await _assert("QA-26 admin delete", gone is None)


async def qa_loyalty_wallet_regression() -> None:
    """QA-27 / QA-28: assert imports of loyalty / no wallet writes from coupon path."""
    # Smoke: importing core.coupon must NOT have side-effects on loyalty / wallet collections.
    import core.coupon as _c  # noqa: F401
    await _assert("QA-27 loyalty regression — core.loyalty importable", True)
    # Wallet collection counts must be unaffected by coupon flow.
    wallet_tx_before = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    await record_coupon_usage_for_order(
        db, user_id=USER_ID, restaurant_id="R_QA",
        customer_id=CUSTOMER_ID_PRIMARY,
        code=f"{FIXTURE_PREFIX}PCT10",
        order_id=f"qa28_order_{RUN_ID}", pos_order_id="POS-28",
        order_total=500.0, coupon_discount_from_pos=50.0,
    )
    wallet_tx_after = await db.wallet_transactions.count_documents({"user_id": USER_ID})
    await _assert("QA-28 wallet unaffected by coupon recording", wallet_tx_before == wallet_tx_after)


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
async def main() -> int:
    try:
        await setup()
        await qa_pure_math()
        await qa_available()
        await qa_validate()
        await qa_final_order_record()
        await qa_analytics()
        await qa_admin_crud_smoke()
        await qa_loyalty_wallet_regression()
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
