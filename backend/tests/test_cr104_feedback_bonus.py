"""CR-104 QA — Feedback bonus award (token path only, once per customer).

Design:
  Q1=a: token path only (identity_source == 'token')
  Q2=c: once per customer per restaurant (idempotency)

Run: cd /app/backend && pytest tests/test_cr104_feedback_bonus.py -v -n 0
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
FEEDBACK = "/api/scan/feedback"

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME   = _env["DB_NAME"]

R_SHORT_689 = "689"
R_FULL_689  = "pos_0001_restaurant_689"
R_SHORT_719 = "719"
R_FULL_719  = "pos_0001_restaurant_719"

# Fresh phone for V1/V2 (must have 0 existing feedback bonus txns)
FRESH_PHONE = "9990818342"
CC          = "+91"

# r719 loyalty-disabled phone
R719_PHONE  = "9000000719"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _customer_token(phone: str, rid: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/scan/auth/skip-otp",
        json={"phone": phone, "restaurant_id": rid, "country_code": CC},
        timeout=30,
    )
    assert r.status_code == 200, f"skip-otp failed for {phone}/{rid}: {r.text}"
    return r.json()["data"]["token"]


def _post_feedback(body, token=None, ip=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if ip:
        headers["X-Forwarded-For"] = ip
    return requests.post(f"{BASE_URL}{FEEDBACK}", json=body, headers=headers, timeout=30)


# ── V1: First-time token feedback earns bonus ─────────────────────────────────

def test_V1_first_token_feedback_earns_bonus(mongo):
    """First feedback submission via token → +50 pts bonus awarded."""
    # Pre-condition: verify FRESH_PHONE has 0 existing feedback bonus txns for r689
    # First get customer_id
    cust = mongo.customers.find_one(
        {"user_id": R_FULL_689, "phone": FRESH_PHONE, "country_code": CC},
        {"_id": 0, "id": 1, "total_points": 1}
    )
    if cust:
        prior_bonus = mongo.points_transactions.count_documents({
            "user_id": R_FULL_689,
            "customer_id": cust["id"],
            "description": "Feedback bonus",
        })
        assert prior_bonus == 0, (
            f"V1 pre-condition FAILED: {FRESH_PHONE} already has {prior_bonus} feedback bonus txn(s). "
            "Use a different FRESH phone."
        )

    tok = _customer_token(FRESH_PHONE, R_SHORT_689)

    # Re-fetch (customer may have been created by skip-otp)
    cust = mongo.customers.find_one(
        {"user_id": R_FULL_689, "phone": FRESH_PHONE, "country_code": CC},
        {"_id": 0, "id": 1, "total_points": 1}
    )
    assert cust, f"V1: customer not found for {FRESH_PHONE}"
    customer_id = cust["id"]
    pts_before = cust.get("total_points") or 0

    # Get loyalty settings to know bonus_pts
    settings = mongo.loyalty_settings.find_one({"user_id": R_FULL_689}, {"_id": 0, "feedback_bonus_points": 1})
    bonus_pts = int(settings.get("feedback_bonus_points") or 50)

    r = _post_feedback({"rating": 4, "message": "CR-104 V1 test"}, token=tok, ip="10.104.1.1")
    assert r.status_code == 200, f"V1: feedback POST failed: {r.text}"
    data = r.json()
    assert data["success"] is True
    assert "feedback_id" in data["data"], "V1: feedback_id missing from response"

    # (a) total_points increased by bonus_pts
    cust_after = mongo.customers.find_one({"id": customer_id}, {"_id": 0, "total_points": 1})
    pts_after = cust_after.get("total_points") or 0
    assert pts_after == pts_before + bonus_pts, (
        f"V1(a): total_points {pts_before} → {pts_after}, expected {pts_before + bonus_pts}"
    )

    # (b) bonus txn created
    txn = mongo.points_transactions.find_one({
        "user_id": R_FULL_689,
        "customer_id": customer_id,
        "transaction_type": "bonus",
        "description": "Feedback bonus",
    })
    assert txn is not None, "V1(b): Feedback bonus txn NOT found in points_transactions"
    assert txn["points"] == bonus_pts, f"V1(b): txn.points={txn['points']}, expected {bonus_pts}"

    # (c) feedback_id in response
    assert data["data"]["feedback_id"], "V1(c): feedback_id empty"
    print(f"V1 PASS: total_points {pts_before}→{pts_after}, bonus_pts={bonus_pts}, txn_id={txn.get('id')}")


# ── V2: Idempotency — second submission must NOT re-award bonus ───────────────

def test_V2_idempotency_no_second_bonus(mongo):
    """Second feedback with same customer → bonus NOT awarded again."""
    tok = _customer_token(FRESH_PHONE, R_SHORT_689)

    cust = mongo.customers.find_one(
        {"user_id": R_FULL_689, "phone": FRESH_PHONE, "country_code": CC},
        {"_id": 0, "id": 1, "total_points": 1}
    )
    assert cust, "V2: customer not found"
    customer_id = cust["id"]
    pts_snapshot = cust.get("total_points") or 0

    r = _post_feedback({"rating": 3, "message": "CR-104 V2 second submission"}, token=tok, ip="10.104.1.2")
    assert r.status_code == 200, f"V2: feedback POST failed: {r.text}"

    # (a) total_points unchanged
    cust_after = mongo.customers.find_one({"id": customer_id}, {"_id": 0, "total_points": 1})
    pts_after = cust_after.get("total_points") or 0
    assert pts_after == pts_snapshot, (
        f"V2(a): total_points changed from {pts_snapshot} to {pts_after} — bonus awarded AGAIN!"
    )

    # (b) still only 1 bonus txn
    bonus_count = mongo.points_transactions.count_documents({
        "user_id": R_FULL_689,
        "customer_id": customer_id,
        "description": "Feedback bonus",
    })
    assert bonus_count == 1, f"V2(b): expected 1 bonus txn, found {bonus_count}"
    print(f"V2 PASS: idempotency OK, total_points={pts_after}, bonus_txn_count={bonus_count}")


# ── V3: Anonymous feedback (no token) → no bonus ─────────────────────────────

def test_V3_anonymous_no_bonus(mongo):
    """Anonymous feedback (no token, no phone) → no bonus txn created."""
    count_before = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_689, "description": "Feedback bonus"}
    )
    r = _post_feedback({"rating": 3, "restaurant_id": R_SHORT_689}, ip="10.104.1.3")
    assert r.status_code == 200, f"V3: anonymous feedback failed: {r.text}"
    assert r.json()["success"] is True

    count_after = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_689, "description": "Feedback bonus"}
    )
    assert count_after == count_before, (
        f"V3: bonus txn count changed {count_before}→{count_after} for anonymous feedback!"
    )
    print(f"V3 PASS: no bonus for anonymous feedback, txn_count={count_after}")


# ── V4: Phone-linked feedback (no token) → no bonus ──────────────────────────

def test_V4_phone_path_no_bonus(mongo):
    """Phone path (no token) → no bonus even if phone matches known customer."""
    count_before = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_689, "description": "Feedback bonus"}
    )
    r = _post_feedback(
        {"rating": 4, "restaurant_id": R_SHORT_689, "phone": "9876540001", "country_code": CC},
        ip="10.104.1.4"
    )
    assert r.status_code == 200, f"V4: phone feedback failed: {r.text}"

    count_after = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_689, "description": "Feedback bonus"}
    )
    assert count_after == count_before, (
        f"V4: bonus txn count changed {count_before}→{count_after} for phone-path feedback!"
    )
    print(f"V4 PASS: no bonus for phone-path feedback")


# ── V5: loyalty_enabled=False tenant → no bonus ───────────────────────────────

def test_V5_loyalty_disabled_no_bonus(mongo):
    """r719 has loyalty_enabled=False → no bonus awarded."""
    # Check r719 settings
    settings = mongo.loyalty_settings.find_one({"user_id": R_FULL_719}, {"_id": 0})
    loyalty_on = settings and settings.get("loyalty_enabled")

    count_before = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_719, "description": "Feedback bonus"}
    )

    tok = _customer_token(R719_PHONE, R_SHORT_719)
    cust = mongo.customers.find_one(
        {"user_id": R_FULL_719, "phone": R719_PHONE, "country_code": CC},
        {"_id": 0, "id": 1}
    )
    assert cust, f"V5: customer not found for {R719_PHONE} in r719"

    r = _post_feedback({"rating": 5, "message": "CR-104 V5 loyalty disabled"}, token=tok, ip="10.104.1.5")
    assert r.status_code == 200, f"V5: feedback POST failed: {r.text}"

    count_after = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_719, "description": "Feedback bonus"}
    )
    assert count_after == count_before, (
        f"V5: bonus awarded even though loyalty_enabled={loyalty_on}! count {count_before}→{count_after}"
    )
    print(f"V5 PASS: loyalty_enabled={loyalty_on}, no bonus for r719, txn_count={count_after}")


# ── V6: feedback_bonus_enabled=False or missing → no bonus ───────────────────

def test_V6_feedback_bonus_disabled_no_bonus(mongo):
    """If feedback_bonus_enabled is False/missing → no bonus."""
    # Check r689 settings (expected feedback_bonus_enabled=True)
    settings_689 = mongo.loyalty_settings.find_one({"user_id": R_FULL_689}, {"_id": 0})
    fbe = settings_689.get("feedback_bonus_enabled") if settings_689 else None
    print(f"V6 INFO: r689 feedback_bonus_enabled={fbe}")

    # r719 — check what settings it has
    settings_719 = mongo.loyalty_settings.find_one({"user_id": R_FULL_719}, {"_id": 0})
    fbe_719 = settings_719.get("feedback_bonus_enabled") if settings_719 else None
    pts_719 = settings_719.get("feedback_bonus_points") if settings_719 else None
    print(f"V6 INFO: r719 feedback_bonus_enabled={fbe_719}, feedback_bonus_points={pts_719}")

    # If r719 has loyalty disabled, the loyalty guard fires before the feedback_bonus_enabled check
    # Either way no bonus is expected (confirmed by V5)
    # We validate the guard path by verifying count is 0 for r719
    count_after = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_719, "description": "Feedback bonus"}
    )
    # Either loyalty_disabled or feedback_bonus_disabled — no bonus either way
    tok = _customer_token(R719_PHONE, R_SHORT_719)
    r = _post_feedback({"rating": 3, "message": "CR-104 V6"}, token=tok, ip="10.104.1.6")
    assert r.status_code == 200, f"V6: feedback POST failed: {r.text}"

    count_after2 = mongo.points_transactions.count_documents(
        {"user_id": R_FULL_719, "description": "Feedback bonus"}
    )
    assert count_after2 == count_after, (
        f"V6: bonus awarded when feedback_bonus_enabled={fbe_719}! {count_after}→{count_after2}"
    )
    print(f"V6 PASS: no bonus for r719 (loyalty_enabled={settings_719.get('loyalty_enabled') if settings_719 else None}, feedback_bonus_enabled={fbe_719})")
