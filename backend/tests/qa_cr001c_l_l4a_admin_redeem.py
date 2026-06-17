"""
CR-001C-L Phase L4-A — Admin / Manual Redeem Hardening — Controlled QA Harness
================================================================================

Synthetic, isolated QA. Creates QA-prefixed records, calls the admin redeem
endpoint via FastAPI HTTP, and tears down all QA records.

No production-data mutation. No live customer touched.

Run:
    cd /app/backend && python -m tests.qa_cr001c_l_l4a_admin_redeem
"""
import asyncio
import os
import sys
import json
import uuid
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import requests  # noqa: E402

from core.database import db  # noqa: E402
from core.auth import create_token  # noqa: E402


BASE_URL = os.environ.get("QA_BASE_URL", "http://localhost:8001")

# -------- QA fixture identifiers --------
QA_TAG = "qa_cr001c_l4a"
QA_USER_ID = f"{QA_TAG}_user_001"
QA_USER_DISABLED = f"{QA_TAG}_user_disabled"
QA_USER_NO_SETTINGS = f"{QA_TAG}_user_nosettings"

QA_CUSTOMER_GOLD = f"{QA_TAG}_cust_gold"
QA_CUSTOMER_SILVER = f"{QA_TAG}_cust_silver"
QA_CUSTOMER_LOW = f"{QA_TAG}_cust_low"
QA_CUSTOMER_DISABLED = f"{QA_TAG}_cust_disabled"
QA_CUSTOMER_NO_SETTINGS = f"{QA_TAG}_cust_nosettings"
QA_CUSTOMER_BRONZE = f"{QA_TAG}_cust_bronze"


# -------- Result tracker --------
results = []


def record(case: str, ok: bool, info: dict | None = None):
    info = info or {}
    results.append({"case": case, "pass": ok, "info": info})
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {case}: {json.dumps(info, default=str)[:300]}")


# -------- Setup / teardown --------
async def setup_fixtures():
    await teardown_fixtures(silent=True)

    now = datetime.now(timezone.utc).isoformat()

    # Primary user (loyalty enabled, settings present)
    await db.users.insert_one({
        "id": QA_USER_ID,
        "email": f"{QA_TAG}@qa.local",
        "name": "QA L4A Restaurant",
        "created_at": now,
    })
    await db.loyalty_settings.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": QA_USER_ID,
        "loyalty_enabled": True,
        "redemption_value": 0.25,               # restaurant-level fallback
        "gold_redemption_value": 0.5,           # Gold per-tier override
        "silver_redemption_value": 0.25,        # Silver per-tier
        "min_redemption_points": 50,
        "max_redemption_percent": 100.0,
        "max_redemption_amount": 999999.0,
        "tier_silver_min": 500,
        "tier_gold_min": 1500,
        "tier_platinum_min": 5000,
        "bronze_earn_percent": 5.0,
    })

    # Gold customer with 1500 pts (just at tier boundary)
    await db.customers.insert_one({
        "id": QA_CUSTOMER_GOLD,
        "user_id": QA_USER_ID,
        "name": "QA Gold",
        "phone": "+910000000010",
        "total_points": 1500,
        "total_points_earned": 5000,
        "total_points_redeemed": 0,
        "tier": "Gold",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })

    # Silver customer with 1000 pts
    await db.customers.insert_one({
        "id": QA_CUSTOMER_SILVER,
        "user_id": QA_USER_ID,
        "name": "QA Silver",
        "phone": "+910000000011",
        "total_points": 1000,
        "total_points_earned": 2000,
        "total_points_redeemed": 0,
        "tier": "Silver",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })

    # Bronze customer with 100 pts (sequential redeem case)
    await db.customers.insert_one({
        "id": QA_CUSTOMER_BRONZE,
        "user_id": QA_USER_ID,
        "name": "QA Bronze",
        "phone": "+910000000013",
        "total_points": 200,
        "total_points_earned": 200,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })

    # Low-points customer (below min_redemption_points)
    await db.customers.insert_one({
        "id": QA_CUSTOMER_LOW,
        "user_id": QA_USER_ID,
        "name": "QA Low",
        "phone": "+910000000012",
        "total_points": 30,
        "total_points_earned": 30,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })

    # Disabled-loyalty user
    await db.users.insert_one({
        "id": QA_USER_DISABLED,
        "email": f"{QA_TAG}_dis@qa.local",
        "name": "QA Disabled Restaurant",
        "created_at": now,
    })
    await db.loyalty_settings.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": QA_USER_DISABLED,
        "loyalty_enabled": False,
        "redemption_value": 0.25,
        "min_redemption_points": 0,
        "max_redemption_percent": 100.0,
        "max_redemption_amount": 999999.0,
    })
    await db.customers.insert_one({
        "id": QA_CUSTOMER_DISABLED,
        "user_id": QA_USER_DISABLED,
        "name": "QA Disabled Cust",
        "phone": "+910000000020",
        "total_points": 500,
        "tier": "Bronze",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })

    # No-settings user
    await db.users.insert_one({
        "id": QA_USER_NO_SETTINGS,
        "email": f"{QA_TAG}_ns@qa.local",
        "name": "QA NoSettings Restaurant",
        "created_at": now,
    })
    await db.customers.insert_one({
        "id": QA_CUSTOMER_NO_SETTINGS,
        "user_id": QA_USER_NO_SETTINGS,
        "name": "QA NoSettings Cust",
        "phone": "+910000000030",
        "total_points": 500,
        "tier": "Bronze",
        "last_visit": "2026-05-20T00:00:00+00:00",
        "created_at": now,
    })


async def teardown_fixtures(silent: bool = False):
    counts = {}
    counts["users"] = (await db.users.delete_many({"id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["settings"] = (await db.loyalty_settings.delete_many({"user_id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["customers"] = (await db.customers.delete_many({"id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["points_tx"] = (await db.points_transactions.delete_many({"user_id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    if not silent:
        print(f"\nTeardown removed: {counts}")


# -------- HTTP helper --------
def call_redeem(user_id: str, body: dict):
    token = create_token(user_id)
    return requests.post(
        f"{BASE_URL}/api/points/transaction",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )


def make_body(customer_id: str, points: int, **overrides):
    body = {
        "customer_id": customer_id,
        "points": points,
        "transaction_type": "redeem",
        "description": "QA admin redeem",
        "bill_amount": None,
    }
    body.update(overrides)
    return body


# ============================================================================
# QA cases
# ============================================================================
async def qa_run():

    # =========================================================================
    # G1 — Happy path (3 asserts)
    # =========================================================================
    print("\n=== G1: Happy path ===")
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_GOLD, 200,
        idempotency_key=f"{QA_TAG}_g1_k1",
        order_id=f"{QA_TAG}_g1_o1",
    ))
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    record("G1.1 happy path HTTP 200", r.status_code == 200, {"status": r.status_code, "body": r.text[:200]})
    record(
        "G1.2 total_points decreased by 200",
        cust_after["total_points"] == cust_before["total_points"] - 200,
        {"before": cust_before["total_points"], "after": cust_after["total_points"]},
    )
    record(
        "G1.3 total_points_redeemed incremented by 200",
        cust_after.get("total_points_redeemed", 0) == cust_before.get("total_points_redeemed", 0) + 200,
        {"before": cust_before.get("total_points_redeemed", 0), "after": cust_after.get("total_points_redeemed", 0)},
    )

    # =========================================================================
    # G2 — NO tier downgrade (A2) (4 asserts)
    # =========================================================================
    print("\n=== G2: No tier downgrade ===")
    # Use a Gold customer (1300 pts after G1's 200 deduction). Redeem 1200 → 100 pts (would be Bronze).
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_GOLD, 1200,
        idempotency_key=f"{QA_TAG}_g2_k1",
        order_id=f"{QA_TAG}_g2_o1",
    ))
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    record("G2.1 large redeem HTTP 200", r.status_code == 200, {"status": r.status_code, "body": r.text[:200]})
    record(
        "G2.2 total_points dropped to expected low",
        cust_after["total_points"] == cust_before["total_points"] - 1200,
        {"before": cust_before["total_points"], "after": cust_after["total_points"]},
    )
    record(
        "G2.3 customer tier STILL Gold (no downgrade)",
        cust_after.get("tier") == "Gold",
        {"tier_after": cust_after.get("tier")},
    )
    body = r.json() if r.status_code == 200 else {}
    # Response shape is PointsTransaction (no nested tier); inspect PT row
    pt_row = await db.points_transactions.find_one({"id": body.get("id")}) if body.get("id") else None
    record(
        "G2.4 helper kept ratio_per_point on PT row (Gold tier respected)",
        pt_row is not None and float(pt_row.get("ratio_per_point", 0)) == 0.5,
        {"ratio_per_point": pt_row.get("ratio_per_point") if pt_row else None},
    )

    # =========================================================================
    # G3 — total_points_redeemed parity ($inc, atomic) (3 asserts)
    # =========================================================================
    print("\n=== G3: total_points_redeemed $inc parity ===")
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_BRONZE})
    redeemed_before = cust_before.get("total_points_redeemed", 0)
    # Sequential redeems with different keys
    r1 = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_BRONZE, 60,
        idempotency_key=f"{QA_TAG}_g3_k1",
        order_id=f"{QA_TAG}_g3_o1",
    ))
    r2 = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_BRONZE, 60,
        idempotency_key=f"{QA_TAG}_g3_k2",
        order_id=f"{QA_TAG}_g3_o2",
    ))
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_BRONZE})
    record("G3.1 first redeem HTTP 200", r1.status_code == 200, {"status": r1.status_code})
    record("G3.2 second redeem HTTP 200", r2.status_code == 200, {"status": r2.status_code})
    record(
        "G3.3 total_points_redeemed accumulated (+120)",
        cust_after.get("total_points_redeemed", 0) == redeemed_before + 120,
        {"before": redeemed_before, "after": cust_after.get("total_points_redeemed", 0)},
    )

    # =========================================================================
    # G4 — Tier-aware ratio (A3) (4 asserts)
    # =========================================================================
    print("\n=== G4: Tier-aware ratio ===")
    # Silver customer with silver_redemption_value=0.25
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_SILVER, 100,
        idempotency_key=f"{QA_TAG}_g4_k1",
        order_id=f"{QA_TAG}_g4_o1",
    ))
    body = r.json() if r.status_code == 200 else {}
    pt_silver = await db.points_transactions.find_one({"id": body.get("id")}) if body.get("id") else None
    record(
        "G4.1 Silver redeem ratio=0.25",
        pt_silver is not None and float(pt_silver.get("ratio_per_point", 0)) == 0.25,
        {"ratio": pt_silver.get("ratio_per_point") if pt_silver else None},
    )
    record(
        "G4.2 Silver redeem redeemed_value = 100 * 0.25 = 25.0",
        pt_silver is not None and float(pt_silver.get("redeemed_value", 0)) == 25.0,
        {"redeemed_value": pt_silver.get("redeemed_value") if pt_silver else None},
    )
    # Gold customer (already verified ratio=0.5 in G2.4 — but assert redeemed_value math here)
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_GOLD, 50,
        idempotency_key=f"{QA_TAG}_g4_k2",
        order_id=f"{QA_TAG}_g4_o2",
    ))
    body = r.json() if r.status_code == 200 else {}
    pt_gold = await db.points_transactions.find_one({"id": body.get("id")}) if body.get("id") else None
    record(
        "G4.3 Gold redeem redeemed_value = 50 * 0.5 = 25.0",
        pt_gold is not None and float(pt_gold.get("redeemed_value", 0)) == 25.0,
        {"redeemed_value": pt_gold.get("redeemed_value") if pt_gold else None},
    )
    # Tier=Bronze with NO bronze_redemption_value → falls back to restaurant redemption_value=0.25
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_BRONZE, 50,
        idempotency_key=f"{QA_TAG}_g4_k3",
        order_id=f"{QA_TAG}_g4_o3",
    ))
    body = r.json() if r.status_code == 200 else {}
    pt_bronze = await db.points_transactions.find_one({"id": body.get("id")}) if body.get("id") else None
    record(
        "G4.4 Bronze redeem falls back to restaurant redemption_value=0.25",
        pt_bronze is not None and float(pt_bronze.get("ratio_per_point", 0)) == 0.25,
        {"ratio": pt_bronze.get("ratio_per_point") if pt_bronze else None},
    )

    # =========================================================================
    # G5 — points_expired: False on PT row (A4) (1 assert)
    # =========================================================================
    print("\n=== G5: points_expired: False on PT row ===")
    record(
        "G5.1 latest PT row has points_expired=False (explicit, not missing)",
        pt_bronze is not None and pt_bronze.get("points_expired") is False,
        {"points_expired": pt_bronze.get("points_expired") if pt_bronze else None},
    )

    # =========================================================================
    # G6 — Idempotency (A5) (5 asserts)
    # =========================================================================
    print("\n=== G6: Idempotency ===")
    # 6a — Same key replays identically
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    key_replay = f"{QA_TAG}_g6_replay_k1"
    body_replay = make_body(QA_CUSTOMER_SILVER, 50, idempotency_key=key_replay, order_id=f"{QA_TAG}_g6_o1")
    r1 = call_redeem(QA_USER_ID, body_replay)
    cust_mid = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    r2 = call_redeem(QA_USER_ID, body_replay)
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    record(
        "G6.1 same key replay HTTP 200 (idempotent, not double-deducted)",
        r1.status_code == 200 and r2.status_code == 200 and cust_after["total_points"] == cust_mid["total_points"],
        {"r1": r1.status_code, "r2": r2.status_code, "mid": cust_mid["total_points"], "after": cust_after["total_points"]},
    )

    # 6b — Different key on same customer commits twice
    r1 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 50, idempotency_key=f"{QA_TAG}_g6_diff_k1", order_id=f"{QA_TAG}_g6_o2"))
    r2 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 50, idempotency_key=f"{QA_TAG}_g6_diff_k2", order_id=f"{QA_TAG}_g6_o3"))
    cust_final = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    record(
        "G6.2 different keys commit twice",
        r1.status_code == 200 and r2.status_code == 200 and cust_final["total_points"] == cust_after["total_points"] - 100,
        {"r1": r1.status_code, "r2": r2.status_code, "before": cust_after["total_points"], "after": cust_final["total_points"]},
    )

    # 6c — Same key, different points → IDEMPOTENCY_CONFLICT (409)
    key_conflict = f"{QA_TAG}_g6_conflict_k1"
    r1 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 50, idempotency_key=key_conflict, order_id=f"{QA_TAG}_g6_co1"))
    r2 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 75, idempotency_key=key_conflict, order_id=f"{QA_TAG}_g6_co1"))
    record(
        "G6.3 same key + different points → HTTP 409 IDEMPOTENCY_CONFLICT",
        r1.status_code == 200 and r2.status_code == 409,
        {"r1": r1.status_code, "r2": r2.status_code, "r2_body": r2.text[:200]},
    )

    # 6d — Same key, different customer → conflict
    key_xc = f"{QA_TAG}_g6_xc_k1"
    r1 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 50, idempotency_key=key_xc, order_id=f"{QA_TAG}_g6_xco1"))
    r2 = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_GOLD, 50, idempotency_key=key_xc, order_id=f"{QA_TAG}_g6_xco1"))
    record(
        "G6.4 same key + different customer → HTTP 409 IDEMPOTENCY_CONFLICT",
        r1.status_code == 200 and r2.status_code == 409,
        {"r1": r1.status_code, "r2": r2.status_code},
    )

    # 6e — Backend-synthesised key works when caller omits both fields
    # Reset Silver pts to a known value to avoid cross-test pollution.
    await db.customers.update_one({"id": QA_CUSTOMER_SILVER}, {"$set": {"total_points": 1000}})
    r = call_redeem(QA_USER_ID, make_body(QA_CUSTOMER_SILVER, 50))  # no idempotency_key, no order_id
    record(
        "G6.5 backend-synthesised idempotency_key + order_id works",
        r.status_code == 200,
        {"status": r.status_code, "body": r.text[:200]},
    )

    # =========================================================================
    # G7 — last_visit NOT updated on redeem (A5 sub) (1 assert)
    # =========================================================================
    print("\n=== G7: last_visit unchanged on redeem ===")
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    last_visit_before = cust_before.get("last_visit")
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_GOLD, 10,
        idempotency_key=f"{QA_TAG}_g7_k1",
        order_id=f"{QA_TAG}_g7_o1",
    ))
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    record(
        "G7.1 last_visit unchanged after admin redeem",
        cust_after.get("last_visit") == last_visit_before,
        {"before": last_visit_before, "after": cust_after.get("last_visit"), "redeem_http": r.status_code},
    )

    # =========================================================================
    # G8 — loyalty_enabled kill-switch (A6) (2 asserts)
    # =========================================================================
    print("\n=== G8: loyalty_enabled kill-switch ===")
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_DISABLED})
    pt_count_before = await db.points_transactions.count_documents({"customer_id": QA_CUSTOMER_DISABLED})
    r = call_redeem(QA_USER_DISABLED, make_body(
        QA_CUSTOMER_DISABLED, 50,
        idempotency_key=f"{QA_TAG}_g8_k1",
        order_id=f"{QA_TAG}_g8_o1",
    ))
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_DISABLED})
    pt_count_after = await db.points_transactions.count_documents({"customer_id": QA_CUSTOMER_DISABLED})
    record(
        "G8.1 loyalty_enabled=false → HTTP 403 LOYALTY_DISABLED",
        r.status_code == 403 and "disabled" in r.text.lower(),
        {"status": r.status_code, "body": r.text[:200]},
    )
    record(
        "G8.2 customer + PT collection unchanged after reject",
        cust_after["total_points"] == cust_before["total_points"] and pt_count_after == pt_count_before,
        {"before_pts": cust_before["total_points"], "after_pts": cust_after["total_points"], "pt_count_delta": pt_count_after - pt_count_before},
    )

    # =========================================================================
    # G9 — SETTINGS_MISSING (1 assert)
    # =========================================================================
    print("\n=== G9: SETTINGS_MISSING ===")
    r = call_redeem(QA_USER_NO_SETTINGS, make_body(
        QA_CUSTOMER_NO_SETTINGS, 50,
        idempotency_key=f"{QA_TAG}_g9_k1",
        order_id=f"{QA_TAG}_g9_o1",
    ))
    record(
        "G9.1 no loyalty_settings → HTTP 400 SETTINGS_MISSING",
        r.status_code == 400 and "settings" in r.text.lower(),
        {"status": r.status_code, "body": r.text[:200]},
    )

    # =========================================================================
    # G10 — BELOW_MIN_REDEMPTION (2 asserts)
    # =========================================================================
    print("\n=== G10: BELOW_MIN_REDEMPTION ===")
    # Customer has 30 pts, min_redemption=50 → reject (customer-balance branch)
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_LOW, 30,
        idempotency_key=f"{QA_TAG}_g10_k1",
        order_id=f"{QA_TAG}_g10_o1",
    ))
    record(
        "G10.1 customer balance below min → HTTP 400 BELOW_MIN_REDEMPTION",
        r.status_code == 400 and "customer has" in r.text.lower(),
        {"status": r.status_code, "body": r.text[:200]},
    )
    # Customer has plenty (reset Silver to 1000) but requests less than min → reject (request branch)
    await db.customers.update_one({"id": QA_CUSTOMER_SILVER}, {"$set": {"total_points": 1000}})
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_SILVER, 10,
        idempotency_key=f"{QA_TAG}_g10_k2",
        order_id=f"{QA_TAG}_g10_o2",
    ))
    record(
        "G10.2 requested points below min → HTTP 400 BELOW_MIN_REDEMPTION (request branch)",
        r.status_code == 400 and "per redemption" in r.text.lower(),
        {"status": r.status_code, "body": r.text[:200]},
    )

    # =========================================================================
    # G11 — INSUFFICIENT_POINTS (1 assert)
    # =========================================================================
    print("\n=== G11: INSUFFICIENT_POINTS ===")
    # Use Silver (1000 pts after G10 reset), request huge amount; helper auto-caps to max_redeemable
    # but with bill=999999 the points cap is the binding one → max=1000, so request 5000 should INSUFFICIENT
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_SILVER, 5000,
        idempotency_key=f"{QA_TAG}_g11_k1",
        order_id=f"{QA_TAG}_g11_o1",
    ))
    # Helper auto-caps to available → if request > avail it commits at avail; but actual_points=available
    # may also INSUFFICIENT-reject. Either status==200 (auto-cap) or 400 INSUFFICIENT is acceptable behaviour.
    # Per LR Correction Q-LR6 the helper AUTO-CAPS silently. So 200 with cap is the expected outcome.
    body = r.json() if r.status_code == 200 else {}
    record(
        "G11.1 over-redeem auto-caps to available (Q-LR6 inheritance)",
        r.status_code == 200 and body.get("points") == 1000,
        {"status": r.status_code, "pt_points": body.get("points"), "body": r.text[:200]},
    )

    # =========================================================================
    # G12 — max_redemption_percent auto-cap inheritance (1 assert)
    # =========================================================================
    print("\n=== G12: max_redemption_percent auto-cap ===")
    # Temporarily flip max_redemption_percent to 50 for primary settings
    await db.loyalty_settings.update_one(
        {"user_id": QA_USER_ID},
        {"$set": {"max_redemption_percent": 50.0}},
    )
    # Silver cust, bill_amount=200, points 200 (200*0.25 = ₹50 = exactly 25% of bill so well under cap)
    # Now flip the test: redeem 400 pts (=₹100), bill=200, cap is 50%=₹100 → exactly at cap → succeeds with auto-cap
    # Reset Silver customer points to a known value
    await db.customers.update_one({"id": QA_CUSTOMER_SILVER}, {"$set": {"total_points": 1000}})
    r = call_redeem(QA_USER_ID, make_body(
        QA_CUSTOMER_SILVER, 1000,                # request way more than cap allows
        idempotency_key=f"{QA_TAG}_g12_k1",
        order_id=f"{QA_TAG}_g12_o1",
        bill_amount=200.0,
    ))
    body = r.json() if r.status_code == 200 else {}
    pt_row = await db.points_transactions.find_one({"id": body.get("id")}) if body.get("id") else None
    # 50% of 200 = ₹100 cap, ratio=0.25 → max 400 pts
    record(
        "G12.1 auto-cap to max_redemption_percent (50% of ₹200 = 400 pts max)",
        pt_row is not None and pt_row.get("points") == 400 and float(pt_row.get("redeemed_value", 0)) == 100.0,
        {"status": r.status_code, "pt_points": pt_row.get("points") if pt_row else None, "pt_redeemed_value": pt_row.get("redeemed_value") if pt_row else None},
    )
    # Restore for downstream tests
    await db.loyalty_settings.update_one(
        {"user_id": QA_USER_ID},
        {"$set": {"max_redemption_percent": 100.0}},
    )

    # =========================================================================
    # G13 — Earn/Bonus regression (2 asserts)
    # =========================================================================
    print("\n=== G13: Earn/Bonus regression ===")
    # Bonus
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    r = requests.post(
        f"{BASE_URL}/api/points/transaction",
        headers={"Authorization": f"Bearer {create_token(QA_USER_ID)}", "Content-Type": "application/json"},
        json={
            "customer_id": QA_CUSTOMER_SILVER,
            "points": 100,
            "transaction_type": "bonus",
            "description": "QA bonus regression",
            "bill_amount": None,
        },
        timeout=15,
    )
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    record(
        "G13.1 bonus still increments total_points (regression)",
        r.status_code == 200 and cust_after["total_points"] == cust_before["total_points"] + 100,
        {"status": r.status_code, "before": cust_before["total_points"], "after": cust_after["total_points"]},
    )
    # Earn with bill_amount
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    spent_before = cust_before.get("total_spent", 0)
    visits_before = cust_before.get("total_visits", 0)
    r = requests.post(
        f"{BASE_URL}/api/points/transaction",
        headers={"Authorization": f"Bearer {create_token(QA_USER_ID)}", "Content-Type": "application/json"},
        json={
            "customer_id": QA_CUSTOMER_SILVER,
            "points": 50,
            "transaction_type": "earn",
            "description": "QA earn regression",
            "bill_amount": 500.0,
        },
        timeout=15,
    )
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_SILVER})
    record(
        "G13.2 earn still updates total_spent + total_visits (regression)",
        r.status_code == 200
        and cust_after.get("total_spent", 0) == spent_before + 500.0
        and cust_after.get("total_visits", 0) == visits_before + 1,
        {"status": r.status_code, "spent_delta": cust_after.get("total_spent", 0) - spent_before, "visits_delta": cust_after.get("total_visits", 0) - visits_before},
    )

    # =========================================================================
    # G14 — LR regression (2 asserts) — proves shared helper still POS-correct
    # =========================================================================
    print("\n=== G14: LR shared helper regression ===")
    from core.loyalty import redeem_loyalty_points, compute_max_redeemable

    # Reset Bronze pts for a clean direct-helper smoke
    await db.customers.update_one({"id": QA_CUSTOMER_BRONZE}, {"$set": {"total_points": 500}})
    cust = await db.customers.find_one({"id": QA_CUSTOMER_BRONZE})
    settings = await db.loyalty_settings.find_one({"user_id": QA_USER_ID})
    cap = compute_max_redeemable(cust, settings, 1000.0)
    record(
        "G14.1 compute_max_redeemable still returns ok=True for valid input",
        cap.get("ok") is True and cap.get("ratio_per_point") == 0.25,
        {"ok": cap.get("ok"), "ratio": cap.get("ratio_per_point"), "code": cap.get("code")},
    )

    result = await redeem_loyalty_points(
        db=db,
        user_id=QA_USER_ID,
        customer=cust,
        settings=settings,
        points_to_redeem=50,
        order_id=f"{QA_TAG}_g14_direct_o1",
        order_total=1000.0,
        idempotency_key=f"{QA_TAG}_g14_direct_k1",
    )
    record(
        "G14.2 redeem_loyalty_points direct call still commits",
        result.get("ok") is True and result.get("status") == "committed",
        {"ok": result.get("ok"), "status": result.get("status"), "code": result.get("code")},
    )

    # =========================================================================
    # G15 — PT row shape (1 assert)
    # =========================================================================
    print("\n=== G15: PT row shape ===")
    # Get any committed admin redeem PT row from earlier
    pt = await db.points_transactions.find_one({"user_id": QA_USER_ID, "transaction_type": "redeem"})
    required_keys = {"id", "user_id", "customer_id", "order_id", "points", "transaction_type",
                     "description", "bill_amount", "balance_after", "redeemed_value",
                     "ratio_per_point", "idempotency_key", "points_expired", "created_at"}
    missing = required_keys - set(pt.keys()) if pt else required_keys
    record(
        "G15.1 PT row contains all 14 required fields",
        pt is not None and not missing,
        {"missing": list(missing), "sample_keys": list(pt.keys()) if pt else None},
    )


# -------- Main runner --------
async def main():
    print("=" * 75)
    print("CR-001C-L Phase L4-A — Admin / Manual Redeem QA Harness")
    print("=" * 75)
    print(f"\nBase URL: {BASE_URL}")
    print("\nSetting up QA fixtures...")
    await setup_fixtures()
    print("Fixtures ready.")

    try:
        await qa_run()
    finally:
        print("\n" + "=" * 75)
        await teardown_fixtures()
        print("=" * 75)

    passed = sum(1 for r in results if r["pass"])
    failed = sum(1 for r in results if not r["pass"])
    total = len(results)
    print(f"\nRESULT: {passed}/{total} PASS, {failed} FAIL")
    print("=" * 75)
    if failed > 0:
        print("\nFAILED CASES:")
        for r in results:
            if not r["pass"]:
                print(f"  • {r['case']}: {json.dumps(r['info'], default=str)[:300]}")
        sys.exit(1)
    sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
