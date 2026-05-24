"""
CR-001C-LR — POS Loyalty Redeem API — Controlled QA Harness
============================================================

Synthetic, isolated QA. Creates QA-prefixed records, runs the redeem
endpoint via FastAPI TestClient, and tears down all QA records.

No production-data mutation. No live customer touched.

Run:
    cd /app/backend && python -m tests.qa_cr001c_lr_redeem
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
from core.loyalty import build_pos_loyalty_blob  # noqa: E402


BASE_URL = os.environ.get("QA_BASE_URL", "http://localhost:8001")

# -------- QA fixture identifiers --------
QA_TAG = "qa_cr001c_lr"
QA_USER_ID = f"{QA_TAG}_user_001"
QA_API_KEY = f"{QA_TAG}_apikey_001"
QA_CUSTOMER_BASIC = f"{QA_TAG}_cust_basic"
QA_CUSTOMER_GOLD = f"{QA_TAG}_cust_gold"
QA_CUSTOMER_LOWPOINTS = f"{QA_TAG}_cust_lowpoints"

# Second user fixture for "no settings" + "disabled" cases
QA_USER_NO_SETTINGS = f"{QA_TAG}_user_nosettings"
QA_API_KEY_NO_SETTINGS = f"{QA_TAG}_apikey_nosettings"
QA_CUSTOMER_NO_SETTINGS = f"{QA_TAG}_cust_nosettings"

QA_USER_DISABLED = f"{QA_TAG}_user_disabled"
QA_API_KEY_DISABLED = f"{QA_TAG}_apikey_disabled"
QA_CUSTOMER_DISABLED = f"{QA_TAG}_cust_disabled"


# -------- Result tracker --------
results = []


def record(case: str, ok: bool, info: dict | None = None):
    info = info or {}
    results.append({"case": case, "pass": ok, "info": info})
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {case}: {json.dumps(info, default=str)[:300]}")


# -------- Setup / teardown --------
async def setup_fixtures():
    # Wipe any leftover QA docs first (idempotent)
    await teardown_fixtures(silent=True)

    # Primary user (loyalty enabled, settings present)
    await db.users.insert_one({
        "id": QA_USER_ID,
        "api_key": QA_API_KEY,
        "email": f"{QA_TAG}@qa.local",
        "name": "QA Restaurant",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.loyalty_settings.insert_one({
        "user_id": QA_USER_ID,
        "loyalty_enabled": True,
        "redemption_value": 1.0,                # 1 pt = ₹1 (restaurant-level)
        "gold_redemption_value": 1.5,           # Gold override → 1 pt = ₹1.5
        "min_redemption_points": 50,
        "max_redemption_percent": 100.0,        # allow up to full bill
        "max_redemption_amount": 999999.0,
        "bronze_earn_percent": 5.0,
    })

    # Bronze customer with 500 points
    await db.customers.insert_one({
        "id": QA_CUSTOMER_BASIC,
        "user_id": QA_USER_ID,
        "name": "QA Basic",
        "phone": "+910000000001",
        "total_points": 500,
        "total_points_earned": 1000,
        "total_points_redeemed": 200,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Gold customer with 400 points
    await db.customers.insert_one({
        "id": QA_CUSTOMER_GOLD,
        "user_id": QA_USER_ID,
        "name": "QA Gold",
        "phone": "+910000000002",
        "total_points": 400,
        "total_points_earned": 5000,
        "total_points_redeemed": 0,
        "tier": "Gold",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # Low points customer (10 points, below min)
    await db.customers.insert_one({
        "id": QA_CUSTOMER_LOWPOINTS,
        "user_id": QA_USER_ID,
        "name": "QA LowPoints",
        "phone": "+910000000003",
        "total_points": 10,
        "total_points_earned": 10,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # User with NO settings doc
    await db.users.insert_one({
        "id": QA_USER_NO_SETTINGS,
        "api_key": QA_API_KEY_NO_SETTINGS,
        "email": f"{QA_TAG}_ns@qa.local",
        "name": "QA NoSettings",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.customers.insert_one({
        "id": QA_CUSTOMER_NO_SETTINGS,
        "user_id": QA_USER_NO_SETTINGS,
        "name": "QA NoSettings Cust",
        "phone": "+910000000004",
        "total_points": 100,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    # User with loyalty_enabled=false
    await db.users.insert_one({
        "id": QA_USER_DISABLED,
        "api_key": QA_API_KEY_DISABLED,
        "email": f"{QA_TAG}_dis@qa.local",
        "name": "QA Disabled",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    await db.loyalty_settings.insert_one({
        "user_id": QA_USER_DISABLED,
        "loyalty_enabled": False,
        "redemption_value": 1.0,
        "min_redemption_points": 0,
        "max_redemption_percent": 100.0,
        "max_redemption_amount": 999999.0,
    })
    await db.customers.insert_one({
        "id": QA_CUSTOMER_DISABLED,
        "user_id": QA_USER_DISABLED,
        "name": "QA Disabled Cust",
        "phone": "+910000000005",
        "total_points": 500,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def teardown_fixtures(silent: bool = False):
    counts = {}
    counts["users"] = (await db.users.delete_many({"id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["settings"] = (await db.loyalty_settings.delete_many({"user_id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["customers"] = (await db.customers.delete_many({"id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["points_tx"] = (await db.points_transactions.delete_many({"user_id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    counts["orders"] = (await db.orders.delete_many({"pos_order_id": {"$regex": f"^{QA_TAG}"}})).deleted_count
    if not silent:
        print(f"\nTeardown removed: {counts}")


# -------- HTTP helper --------
def call_redeem(api_key: str, body: dict):
    return requests.post(
        f"{BASE_URL}/api/pos/loyalty/redeem",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        json=body,
        timeout=15,
    )


# -------- QA cases --------
async def qa_run():
    sample_success_resp = None
    sample_failure_resp = None

    # ---------- QA-1: successful redeem (Bronze, ratio=1.0) ----------
    cust_before = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    body = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 100,
        "order_id": "QA_ORDER_001",
        "order_total": 850.0,
        "idempotency_key": f"{QA_TAG}_k_success_001",
    }
    r = call_redeem(QA_API_KEY, body)
    j = r.json()
    sample_success_resp = j
    cust_after = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    tx = await db.points_transactions.find_one({"idempotency_key": body["idempotency_key"]})
    record("QA-1 successful redeem (HTTP 200 + success=true)", r.status_code == 200 and j.get("success") is True, {"resp": j})
    record(
        "QA-1.a total_points decreased by 100",
        cust_after["total_points"] == cust_before["total_points"] - 100,
        {"before": cust_before["total_points"], "after": cust_after["total_points"]},
    )
    record(
        "QA-1.b total_points_redeemed incremented by 100",
        cust_after["total_points_redeemed"] == cust_before["total_points_redeemed"] + 100,
        {"before": cust_before["total_points_redeemed"], "after": cust_after["total_points_redeemed"]},
    )
    record("QA-1.c PT row created", tx is not None, {"tx_id": tx and tx.get("id")})
    record("QA-1.d PT transaction_type='redeem'", tx and tx.get("transaction_type") == "redeem", {})
    record("QA-1.e PT points stored POSITIVE", tx and tx.get("points") == 100, {"points": tx and tx.get("points")})
    record("QA-1.f PT redeemed_value = pts * ratio (Bronze 1.0)", tx and tx.get("redeemed_value") == 100.0, {"redeemed_value": tx and tx.get("redeemed_value")})
    record("QA-1.g PT carries order_id", tx and tx.get("order_id") == "QA_ORDER_001", {})
    record("QA-1.h PT carries idempotency_key", tx and tx.get("idempotency_key") == body["idempotency_key"], {})
    record("QA-1.i tier UNCHANGED after redeem", cust_after.get("tier") == cust_before.get("tier"), {"tier": cust_after.get("tier")})

    # ---------- QA-2: insufficient → auto-cap (NOT INSUFFICIENT_POINTS) ----------
    # Bronze customer has 400 points remaining. Request 9999 → should auto-cap.
    cust_before2 = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    body2 = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 9999,
        "order_id": "QA_ORDER_AUTOCAP",
        "order_total": 10000.0,
        "idempotency_key": f"{QA_TAG}_k_autocap_001",
    }
    r2 = call_redeem(QA_API_KEY, body2)
    j2 = r2.json()
    cust_after2 = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    capped = j2.get("data", {}).get("points_redeemed", 0) if j2.get("success") else 0
    record(
        "QA-2 auto-cap: success=true with capped points (no INSUFFICIENT_POINTS)",
        j2.get("success") is True and 0 < capped <= cust_before2["total_points"],
        {"requested": 9999, "actual_redeemed": capped, "remaining": j2.get("data", {}).get("remaining_points")},
    )

    # ---------- QA-3: below min redemption ----------
    cust_before3 = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    body3 = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 25,  # < min_redemption_points=50
        "order_id": "QA_ORDER_MIN",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_min_001",
    }
    r3 = call_redeem(QA_API_KEY, body3)
    j3 = r3.json()
    cust_after3 = await db.customers.find_one({"id": QA_CUSTOMER_BASIC})
    record(
        "QA-3 below min → BELOW_MIN_REDEMPTION",
        j3.get("success") is False and j3.get("data", {}).get("error", {}).get("code") == "BELOW_MIN_REDEMPTION",
        {"resp": j3},
    )
    record("QA-3.a customer untouched on min-fail", cust_after3["total_points"] == cust_before3["total_points"], {})

    # ---------- QA-4: loyalty disabled ----------
    body4 = {
        "customer_id": QA_CUSTOMER_DISABLED,
        "points_to_redeem": 100,
        "order_id": "QA_ORDER_DIS",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_disabled_001",
    }
    r4 = call_redeem(QA_API_KEY_DISABLED, body4)
    j4 = r4.json()
    cust_after4 = await db.customers.find_one({"id": QA_CUSTOMER_DISABLED})
    tx4 = await db.points_transactions.find_one({"idempotency_key": body4["idempotency_key"]})
    record(
        "QA-4 loyalty_enabled=false → LOYALTY_DISABLED",
        j4.get("success") is False and j4.get("data", {}).get("error", {}).get("code") == "LOYALTY_DISABLED",
        {"resp": j4},
    )
    record("QA-4.a no customer mutation", cust_after4["total_points"] == 500, {})
    record("QA-4.b no PT row written", tx4 is None, {})

    # ---------- QA-5: missing settings ----------
    body5 = {
        "customer_id": QA_CUSTOMER_NO_SETTINGS,
        "points_to_redeem": 50,
        "order_id": "QA_ORDER_NS",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_nosettings_001",
    }
    r5 = call_redeem(QA_API_KEY_NO_SETTINGS, body5)
    j5 = r5.json()
    sample_failure_resp = j5
    record(
        "QA-5 no settings → SETTINGS_MISSING",
        j5.get("success") is False and j5.get("data", {}).get("error", {}).get("code") == "SETTINGS_MISSING",
        {"resp": j5},
    )

    # ---------- QA-6: customer not found ----------
    body6 = {
        "customer_id": f"{QA_TAG}_NONEXISTENT",
        "points_to_redeem": 50,
        "order_id": "QA_ORDER_404",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_404_001",
    }
    r6 = call_redeem(QA_API_KEY, body6)
    j6 = r6.json()
    record(
        "QA-6 customer not found → CUSTOMER_NOT_FOUND",
        j6.get("success") is False and j6.get("data", {}).get("error", {}).get("code") == "CUSTOMER_NOT_FOUND",
        {"resp": j6},
    )

    # ---------- QA-7: invalid points ----------
    for pts in [0, -10]:
        body7 = {
            "customer_id": QA_CUSTOMER_BASIC,
            "points_to_redeem": pts,
            "order_id": "QA_ORDER_BAD",
            "order_total": 500.0,
            "idempotency_key": f"{QA_TAG}_k_invalid_{pts}",
        }
        r7 = call_redeem(QA_API_KEY, body7)
        j7 = r7.json()
        record(
            f"QA-7 invalid points {pts} → INVALID_POINTS",
            j7.get("success") is False and j7.get("data", {}).get("error", {}).get("code") == "INVALID_POINTS",
            {"resp": j7},
        )

    # Non-integer points (Pydantic-rejected → 422)
    body7b = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 12.5,
        "order_id": "QA_ORDER_BAD2",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_invalid_float",
    }
    r7b = call_redeem(QA_API_KEY, body7b)
    record(
        "QA-7.c non-integer points rejected (422 or INVALID_POINTS)",
        r7b.status_code == 422
        or (
            r7b.status_code == 200
            and r7b.json().get("data", {}).get("error", {}).get("code") == "INVALID_POINTS"
        ),
        {"status": r7b.status_code, "body": r7b.json() if r7b.headers.get("content-type", "").startswith("application/json") else None},
    )

    # ---------- QA-8: missing order_id ----------
    body8 = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 100,
        "order_id": "",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_noorder_001",
    }
    r8 = call_redeem(QA_API_KEY, body8)
    j8 = r8.json()
    record(
        "QA-8 empty order_id → ORDER_ID_REQUIRED",
        j8.get("success") is False and j8.get("data", {}).get("error", {}).get("code") == "ORDER_ID_REQUIRED",
        {"resp": j8},
    )

    # ---------- QA-9: missing idempotency_key ----------
    body9 = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 100,
        "order_id": "QA_ORDER_NOIDEM",
        "order_total": 500.0,
        "idempotency_key": "   ",
    }
    r9 = call_redeem(QA_API_KEY, body9)
    j9 = r9.json()
    record(
        "QA-9 empty idempotency_key → IDEMPOTENCY_KEY_REQUIRED",
        j9.get("success") is False and j9.get("data", {}).get("error", {}).get("code") == "IDEMPOTENCY_KEY_REQUIRED",
        {"resp": j9},
    )

    # ---------- QA-10: idempotent retry ----------
    # Use Gold customer for a fresh sequence
    cust_before10 = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    body10 = {
        "customer_id": QA_CUSTOMER_GOLD,
        "points_to_redeem": 100,
        "order_id": "QA_ORDER_GOLD_1",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_idem_gold_001",
    }
    r10a = call_redeem(QA_API_KEY, body10)
    j10a = r10a.json()
    r10b = call_redeem(QA_API_KEY, body10)  # exact replay
    j10b = r10b.json()
    cust_after10 = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    tx_count = await db.points_transactions.count_documents({"idempotency_key": body10["idempotency_key"]})
    record(
        "QA-10 first call success",
        j10a.get("success") is True and j10a.get("data", {}).get("points_redeemed") == 100,
        {"resp": j10a},
    )
    record(
        "QA-10.a replay returns success and idempotent=true marker",
        j10b.get("success") is True and j10b.get("data", {}).get("idempotent") is True,
        {"resp": j10b},
    )
    record(
        "QA-10.b customer points decremented EXACTLY ONCE (no double-decrement)",
        cust_after10["total_points"] == cust_before10["total_points"] - 100,
        {"before": cust_before10["total_points"], "after": cust_after10["total_points"]},
    )
    record(
        "QA-10.c total_points_redeemed incremented EXACTLY ONCE",
        cust_after10["total_points_redeemed"] == cust_before10["total_points_redeemed"] + 100,
        {"before": cust_before10["total_points_redeemed"], "after": cust_after10["total_points_redeemed"]},
    )
    record("QA-10.d only ONE PT row stored for the key", tx_count == 1, {"count": tx_count})

    # ---------- QA-11: idempotency conflict ----------
    # Reuse same key with different points → conflict
    body11 = {
        "customer_id": QA_CUSTOMER_GOLD,
        "points_to_redeem": 250,  # different
        "order_id": "QA_ORDER_GOLD_1",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_idem_gold_001",
    }
    r11 = call_redeem(QA_API_KEY, body11)
    j11 = r11.json()
    record(
        "QA-11 same key different points → IDEMPOTENCY_CONFLICT",
        j11.get("success") is False and j11.get("data", {}).get("error", {}).get("code") == "IDEMPOTENCY_CONFLICT",
        {"resp": j11},
    )

    # Same key different customer
    body11b = {
        "customer_id": QA_CUSTOMER_BASIC,
        "points_to_redeem": 100,
        "order_id": "QA_ORDER_GOLD_1",
        "order_total": 500.0,
        "idempotency_key": f"{QA_TAG}_k_idem_gold_001",
    }
    r11b = call_redeem(QA_API_KEY, body11b)
    j11b = r11b.json()
    record(
        "QA-11.a same key different customer → IDEMPOTENCY_CONFLICT",
        j11b.get("success") is False and j11b.get("data", {}).get("error", {}).get("code") == "IDEMPOTENCY_CONFLICT",
        {"resp": j11b},
    )

    # ---------- QA-12: no tier downgrade ----------
    # Gold customer: redeem more, ensure tier stays Gold even if balance is low
    gold_now = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    record(
        "QA-12 tier unchanged after redeem (still Gold)",
        gold_now.get("tier") == "Gold",
        {"tier": gold_now.get("tier"), "balance": gold_now.get("total_points")},
    )

    # ---------- QA-13: tier-aware redemption (Gold → 1.5 ratio) ----------
    cust_before13 = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    body13 = {
        "customer_id": QA_CUSTOMER_GOLD,
        "points_to_redeem": 60,
        "order_id": "QA_ORDER_GOLD_TIER",
        "order_total": 1000.0,
        "idempotency_key": f"{QA_TAG}_k_tier_gold_001",
    }
    r13 = call_redeem(QA_API_KEY, body13)
    j13 = r13.json()
    tx13 = await db.points_transactions.find_one({"idempotency_key": body13["idempotency_key"]})
    record(
        "QA-13 Gold ratio_per_point = 1.5",
        j13.get("success") is True and j13.get("data", {}).get("ratio_per_point") == 1.5,
        {"ratio": j13.get("data", {}).get("ratio_per_point")},
    )
    record(
        "QA-13.a Gold redeemed_value = 60 * 1.5 = 90",
        j13.get("data", {}).get("redeemed_value") == 90.0,
        {"redeemed_value": j13.get("data", {}).get("redeemed_value")},
    )
    record("QA-13.b PT row ratio snapshot stored", tx13 and tx13.get("ratio_per_point") == 1.5, {})

    # ---------- QA-14: regression - LX-A read contract still strict 6-key ----------
    settings_doc = await db.loyalty_settings.find_one({"user_id": QA_USER_ID}, {"_id": 0})
    cust_doc = await db.customers.find_one({"id": QA_CUSTOMER_GOLD}, {"_id": 0})
    blob = build_pos_loyalty_blob(cust_doc, settings_doc)
    expected_keys = {"loyalty_enabled", "tier", "tier_label", "total_points", "ratio_per_point", "points_value"}
    record(
        "QA-14 LX-A blob strict 6-key contract",
        set(blob.keys()) == expected_keys,
        {"actual_keys": sorted(blob.keys()), "expected": sorted(expected_keys)},
    )

    # ---------- QA-15: health/regression smoke ----------
    h = requests.get(f"{BASE_URL}/api/health", timeout=10)
    record("QA-15 /api/health 200", h.status_code == 200, {"status": h.status_code})

    # ====================================================================
    # CR-001C-LR CORRECTION (2026-05-23) — extension cases
    # ====================================================================

    # ---------- QA-16: /max-redeemable alignment ----------
    # Use the (Gold, tier-aware ratio=1.5) fixture customer.
    qa16_max_url = f"{BASE_URL}/api/pos/max-redeemable"

    # 16a: happy path with customer_id
    cust_gold_now = await db.customers.find_one({"id": QA_CUSTOMER_GOLD})
    bal = cust_gold_now.get("total_points", 0)
    r16a = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"customer_id": QA_CUSTOMER_GOLD, "bill_amount": 1000},
        timeout=10,
    )
    j16a = r16a.json()
    d16a = j16a.get("data", {})
    record(
        "QA-16a max-redeemable happy (Gold, customer_id) returns tier-aware ratio 1.5",
        j16a.get("success") is True and d16a.get("ratio_per_point") == 1.5 and d16a.get("tier") == "Gold" and d16a.get("available_points") == bal,
        {"resp": j16a},
    )
    # cap math: min(bill*100%, max_amount=999999, bal*1.5) → bal*1.5 (since bill 1000 < bal*1.5)
    expected_cap = min(1000.0 * 100.0 / 100.0, 999999.0, bal * 1.5)
    expected_pts = int(expected_cap / 1.5)
    record(
        "QA-16a.1 max-redeemable cap matches shared math",
        d16a.get("max_points_redeemable") == expected_pts and d16a.get("max_discount_value") == round(expected_pts * 1.5, 2),
        {"expected_pts": expected_pts, "expected_value": round(expected_pts * 1.5, 2), "got": d16a},
    )
    record(
        "QA-16a.2 max-redeemable echoes min_redemption_points + loyalty_enabled",
        d16a.get("min_redemption_points") == 50 and d16a.get("loyalty_enabled") is True,
        {"got": {"min": d16a.get("min_redemption_points"), "enabled": d16a.get("loyalty_enabled")}},
    )

    # 16b: cust_mobile fallback
    r16b = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"cust_mobile": "+910000000002", "bill_amount": 1000},
        timeout=10,
    )
    j16b = r16b.json()
    record(
        "QA-16b max-redeemable resolves customer by cust_mobile (back-compat)",
        j16b.get("success") is True and j16b.get("data", {}).get("tier") == "Gold",
        {"resp": j16b},
    )

    # 16c: neither identifier
    r16c = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"bill_amount": 1000},
        timeout=10,
    )
    j16c = r16c.json()
    record(
        "QA-16c max-redeemable INVALID_REQUEST when neither customer_id nor cust_mobile",
        j16c.get("success") is False and j16c.get("data", {}).get("error", {}).get("code") == "INVALID_REQUEST",
        {"resp": j16c},
    )

    # 16d: LOYALTY_DISABLED restaurant
    r16d = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY_DISABLED, "Content-Type": "application/json"},
        json={"customer_id": QA_CUSTOMER_DISABLED, "bill_amount": 1000},
        timeout=10,
    )
    j16d = r16d.json()
    d16d = j16d.get("data", {})
    record(
        "QA-16d max-redeemable LOYALTY_DISABLED → 0 redeemable + error.code",
        d16d.get("max_points_redeemable") == 0 and d16d.get("error", {}).get("code") == "LOYALTY_DISABLED",
        {"resp": j16d},
    )

    # 16e: SETTINGS_MISSING restaurant
    r16e = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY_NO_SETTINGS, "Content-Type": "application/json"},
        json={"customer_id": QA_CUSTOMER_NO_SETTINGS, "bill_amount": 1000},
        timeout=10,
    )
    j16e = r16e.json()
    d16e = j16e.get("data", {})
    record(
        "QA-16e max-redeemable SETTINGS_MISSING (no fake fallback) → 0 + error.code",
        d16e.get("max_points_redeemable") == 0 and d16e.get("error", {}).get("code") == "SETTINGS_MISSING",
        {"resp": j16e},
    )

    # 16f: BELOW_MIN_REDEMPTION (LowPoints customer has 10 pts; min=50)
    r16f = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"customer_id": QA_CUSTOMER_LOWPOINTS, "bill_amount": 1000},
        timeout=10,
    )
    j16f = r16f.json()
    d16f = j16f.get("data", {})
    record(
        "QA-16f max-redeemable BELOW_MIN_REDEMPTION (10 pts < 50 min) → 0 + error.code",
        d16f.get("max_points_redeemable") == 0 and d16f.get("error", {}).get("code") == "BELOW_MIN_REDEMPTION",
        {"resp": j16f},
    )

    # 16g: CUSTOMER_NOT_FOUND
    r16g = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"customer_id": f"{QA_TAG}_NOPE", "bill_amount": 1000},
        timeout=10,
    )
    j16g = r16g.json()
    record(
        "QA-16g max-redeemable CUSTOMER_NOT_FOUND",
        j16g.get("success") is False and j16g.get("data", {}).get("error", {}).get("code") == "CUSTOMER_NOT_FOUND",
        {"resp": j16g},
    )

    # ---------- QA-17: calculator-cap == commit-cap parity ----------
    # Fresh customer for clean parity check. Bronze=1.0 ratio.
    QA_CUSTOMER_PARITY = f"{QA_TAG}_cust_parity"
    await db.customers.insert_one({
        "id": QA_CUSTOMER_PARITY,
        "user_id": QA_USER_ID,
        "name": "QA Parity",
        "phone": "+910000000099",
        "total_points": 500,
        "total_points_earned": 500,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Step A: ask calculator for cap on a ₹200 bill (max_redemption_percent=100, max_amount=999999, ratio=1.0)
    rcap = requests.post(
        qa16_max_url,
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json={"customer_id": QA_CUSTOMER_PARITY, "bill_amount": 200},
        timeout=10,
    )
    cap_pts = rcap.json().get("data", {}).get("max_points_redeemable")
    # Step B: now request to redeem WAY MORE than allowed via /loyalty/redeem; helper auto-caps
    rcommit = call_redeem(QA_API_KEY, {
        "customer_id": QA_CUSTOMER_PARITY,
        "points_to_redeem": 99999,
        "order_id": "QA_PARITY_ORDER",
        "order_total": 200.0,
        "idempotency_key": f"{QA_TAG}_k_parity_001",
    })
    commit_pts = rcommit.json().get("data", {}).get("points_redeemed")
    record(
        "QA-17 calculator cap EQUALS commit auto-cap (shared helper guarantee)",
        cap_pts is not None and cap_pts == commit_pts,
        {"cap_pts": cap_pts, "commit_pts": commit_pts},
    )

    # ---------- QA-18: /api/pos/orders embedded redemption ----------
    # Fresh customer; phone lookup against (pos_0001_<user_id>) is unnecessary here
    # because we go through verify_pos_auth + post-order create flow.
    # Use the helper-driven order path with loyalty_points_used set.
    QA_CUSTOMER_ORDER = f"{QA_TAG}_cust_order"
    await db.customers.insert_one({
        "id": QA_CUSTOMER_ORDER,
        "user_id": QA_USER_ID,
        "name": "QA OrderFlow",
        "phone": "+910000000088",
        "total_points": 300,
        "total_points_earned": 300,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    order_body = {
        "pos_id": "mygenie",
        "restaurant_id": "qa689",
        "order_id": f"{QA_TAG}_ORDER_001",
        "cust_mobile": "+910000000088",
        "cust_name": "QA OrderFlow",
        "order_amount": 500.0,
        "order_sub_total_amount": 500.0,
        "items": [],
        "loyalty_points_used": 100,
        "loyalty_idempotency_key": f"{QA_TAG}_k_orderpath_001",
    }
    r18 = requests.post(
        f"{BASE_URL}/api/pos/orders",
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json=order_body,
        timeout=15,
    )
    j18 = r18.json()
    cust_after18 = await db.customers.find_one({"id": QA_CUSTOMER_ORDER})
    tx18 = await db.points_transactions.find_one({"idempotency_key": order_body["loyalty_idempotency_key"]})
    record(
        "QA-18 /pos/orders with loyalty_points_used=100 commits redeem",
        j18.get("success") is True and tx18 is not None and tx18.get("points") == 100 and tx18.get("transaction_type") == "redeem",
        {"order_resp": j18.get("data", {}).get("loyalty_redeem"), "tx": tx18 and {"id": tx18.get("id"), "points": tx18.get("points"), "order_id": tx18.get("order_id")}},
    )
    record(
        "QA-18.a customer.total_points_redeemed incremented via /pos/orders path",
        cust_after18.get("total_points_redeemed") == 100,
        {"after": cust_after18.get("total_points_redeemed")},
    )
    # Earn-on-net (Q-CORR-3 Option B): bronze_earn_percent=5%, base = 500 - 100 = 400 → earn = 20
    record(
        "QA-18.b earn computed on NET base (order_amount − loyalty_discount)",
        j18.get("data", {}).get("points_earned") == int(400 * 5 / 100),
        {"points_earned": j18.get("data", {}).get("points_earned"), "expected": int(400 * 5 / 100)},
    )

    # ---------- QA-19: /pos/orders order_id-derived idempotency fallback (Q-CORR-4) ----------
    QA_CUSTOMER_IDEMFB = f"{QA_TAG}_cust_idemfb"
    await db.customers.insert_one({
        "id": QA_CUSTOMER_IDEMFB,
        "user_id": QA_USER_ID,
        "name": "QA IdemFallback",
        "phone": "+910000000077",
        "total_points": 200,
        "tier": "Bronze",
        "total_points_earned": 200,
        "total_points_redeemed": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    order_body_19 = {
        "pos_id": "mygenie",
        "restaurant_id": "qa689",
        "order_id": f"{QA_TAG}_ORDER_002_IDEMFB",
        "cust_mobile": "+910000000077",
        "cust_name": "QA IdemFallback",
        "order_amount": 500.0,
        "order_sub_total_amount": 500.0,
        "items": [],
        "loyalty_points_used": 80,
        # NOTE: no loyalty_idempotency_key — server must derive f"order_{order_id}"
    }
    r19a = requests.post(f"{BASE_URL}/api/pos/orders", headers={"X-API-Key": QA_API_KEY}, json=order_body_19, timeout=15)
    r19b = requests.post(f"{BASE_URL}/api/pos/orders", headers={"X-API-Key": QA_API_KEY}, json=order_body_19, timeout=15)
    derived_key = f"order_{order_body_19['order_id']}"
    pt_count_19 = await db.points_transactions.count_documents({"idempotency_key": derived_key, "transaction_type": "redeem"})
    cust_after19 = await db.customers.find_one({"id": QA_CUSTOMER_IDEMFB})
    record(
        "QA-19 /pos/orders retry with no explicit key → server-derived order_<id>",
        pt_count_19 == 1 and cust_after19.get("total_points_redeemed") == 80,
        {"pt_count": pt_count_19, "redeemed_counter": cust_after19.get("total_points_redeemed"), "key_used": derived_key},
    )

    # ---------- QA-20: /pos/orders hard-fail when redeem fails (Q-CORR-2 Option C) ----------
    # Customer with only 10 points but POS asks to redeem 100. Cap floor → INSUFFICIENT/
    # or BELOW_MIN_REDEMPTION depending on min_redemption.
    order_body_20 = {
        "pos_id": "mygenie",
        "restaurant_id": "qa689",
        "order_id": f"{QA_TAG}_ORDER_003_FAIL",
        "cust_mobile": "+910000000003",   # QA_CUSTOMER_LOWPOINTS phone
        "cust_name": "QA LowPoints",
        "order_amount": 500.0,
        "order_sub_total_amount": 500.0,
        "items": [],
        "loyalty_points_used": 100,
        "loyalty_idempotency_key": f"{QA_TAG}_k_fail_001",
    }
    r20 = requests.post(f"{BASE_URL}/api/pos/orders", headers={"X-API-Key": QA_API_KEY}, json=order_body_20, timeout=15)
    j20 = r20.json()
    # Check that no order was persisted AND no redeem committed
    failed_order = await db.orders.find_one({"pos_order_id": order_body_20["order_id"]})
    failed_tx = await db.points_transactions.find_one({"idempotency_key": order_body_20["loyalty_idempotency_key"]})
    record(
        "QA-20 /pos/orders hard-fails when redeem rejects (Q-CORR-2)",
        j20.get("success") is False and failed_order is None and failed_tx is None,
        {"resp_success": j20.get("success"), "error_code": j20.get("data", {}).get("error", {}).get("code"), "order_persisted": failed_order is not None, "tx_persisted": failed_tx is not None},
    )

    # ---------- QA-21: /pos/orders accepts legacy alias `used_loyalty_point` ----------
    # Alias addendum (2026-05-24): POS-side legacy field name `used_loyalty_point`
    # must be accepted by validation_alias and produce the IDENTICAL redeem path
    # as the canonical `loyalty_points_used`.
    QA_CUSTOMER_ALIAS = f"{QA_TAG}_cust_alias"
    await db.customers.insert_one({
        "id": QA_CUSTOMER_ALIAS,
        "user_id": QA_USER_ID,
        "name": "QA AliasFlow",
        "phone": "+910000000111",
        "total_points": 300,
        "total_points_earned": 300,
        "total_points_redeemed": 0,
        "tier": "Bronze",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    order_body_21 = {
        "pos_id": "mygenie",
        "restaurant_id": "qa689",
        "order_id": f"{QA_TAG}_ORDER_004_ALIAS",
        "cust_mobile": "+910000000111",
        "cust_name": "QA AliasFlow",
        "order_amount": 500.0,
        "order_sub_total_amount": 500.0,
        "items": [],
        # NOTE: uses the LEGACY POS alias `used_loyalty_point`, NOT the canonical
        # `loyalty_points_used`. Pydantic AliasChoices must accept this.
        "used_loyalty_point": 100,
        "loyalty_idempotency_key": f"{QA_TAG}_k_alias_001",
    }
    r21 = requests.post(
        f"{BASE_URL}/api/pos/orders",
        headers={"X-API-Key": QA_API_KEY, "Content-Type": "application/json"},
        json=order_body_21,
        timeout=15,
    )
    j21 = r21.json()
    cust_after21 = await db.customers.find_one({"id": QA_CUSTOMER_ALIAS})
    tx21 = await db.points_transactions.find_one({"idempotency_key": order_body_21["loyalty_idempotency_key"]})
    record(
        "QA-21 /pos/orders accepts POS-legacy alias used_loyalty_point and commits redeem identically",
        (
            j21.get("success") is True
            and tx21 is not None
            and tx21.get("points") == 100
            and tx21.get("transaction_type") == "redeem"
            and cust_after21.get("total_points_redeemed") == 100
            and j21.get("data", {}).get("points_earned") == int(400 * 5 / 100)
        ),
        {
            "alias_used": "used_loyalty_point",
            "loyalty_redeem": j21.get("data", {}).get("loyalty_redeem"),
            "points_earned": j21.get("data", {}).get("points_earned"),
            "total_points_redeemed_after": cust_after21.get("total_points_redeemed"),
        },
    )

    return sample_success_resp, sample_failure_resp


async def main():
    print("=" * 70)
    print("CR-001C-LR QA — POS Loyalty Redeem API")
    print("=" * 70)
    print("\n[setup] creating QA fixtures...")
    await setup_fixtures()
    try:
        print("\n[run] executing QA cases...\n")
        success_resp, failure_resp = await qa_run()
    finally:
        await teardown_fixtures()

    total = len(results)
    passed = sum(1 for r in results if r["pass"])
    print("\n" + "=" * 70)
    print(f"QA SUMMARY: {passed}/{total} passed")
    print("=" * 70)

    # Persist artifacts for QA report
    out_dir = Path("/app/test_reports")
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = {
        "module": "CR-001C-LR",
        "endpoint": "POST /api/pos/loyalty/redeem",
        "total": total,
        "passed": passed,
        "failed": total - passed,
        "cases": results,
        "sample_success_response": success_resp,
        "sample_failure_response": failure_resp,
        "ran_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "cr_001c_lr_qa_results.json").write_text(json.dumps(artifact, indent=2, default=str))
    print(f"\nArtifact: {out_dir/'cr_001c_lr_qa_results.json'}")

    if passed != total:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
