"""Ad-hoc checks for CR-094 and CR-096 per QA asks."""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@kunafamahal.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME   = _env["DB_NAME"]

R_FULL = "pos_0001_restaurant_689"
R_SHORT = "689"
KNOWN_PHONE = "7505242126"
KNOWN_CC = "+91"

WHITELIST = {
    "loyalty_enabled", "wallet_enabled", "coupon_enabled",
    "bronze_earn_percent", "silver_earn_percent", "gold_earn_percent", "platinum_earn_percent",
    "tier_silver_min", "tier_gold_min", "tier_platinum_min",
    "redemption_value", "bronze_redemption_value", "silver_redemption_value", "gold_redemption_value", "platinum_redemption_value",
    "min_redemption_points", "max_redemption_percent", "max_redemption_amount", "min_order_value",
    "first_visit_bonus_enabled", "first_visit_bonus_points",
    "birthday_bonus_enabled", "birthday_bonus_points",
    "anniversary_bonus_enabled", "anniversary_bonus_points",
    "feedback_bonus_enabled", "feedback_bonus_points",
    "off_peak_bonus_enabled", "off_peak_bonus_type", "off_peak_bonus_value", "off_peak_start_time", "off_peak_end_time",
    "points_expiry_months",
}


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("token", "")


# ── CR-094 Ad-hoc A: loyalty_enabled:false tenant still returns 33 keys ─────

def test_adhoc_094A_loyalty_disabled_tenant_returns_33_keys(mongo):
    """Find a tenant with loyalty_enabled=false, confirm all 33 keys returned."""
    doc = mongo.loyalty_settings.find_one(
        {"loyalty_enabled": False, "user_id": {"$regex": "^pos_0001_restaurant_"}},
        {"_id": 0, "user_id": 1}
    )
    if not doc:
        pytest.skip("no loyalty_enabled:false tenant in DB")
    uid = doc["user_id"]
    if not mongo.users.find_one({"id": uid}, {"_id": 1}):
        pytest.skip("loyalty_disabled tenant has no users doc")
    r = requests.get(f"{BASE_URL}/api/scan/loyalty-rules/{uid}",
                     headers={"X-Forwarded-For": "10.94.99.1"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert set(data) == WHITELIST, f"missing/extra keys: {set(data) ^ WHITELIST}"
    assert data["loyalty_enabled"] is False


# ── CR-094 Ad-hoc B: off_peak_bonus_type='flat' tenant ───────────────────────

def test_adhoc_094B_flat_off_peak_type(mongo):
    """Find a tenant with off_peak_bonus_type='flat', verify value returned."""
    doc = mongo.loyalty_settings.find_one(
        {"off_peak_bonus_type": "flat", "user_id": {"$regex": "^pos_0001_restaurant_"}},
        {"_id": 0, "user_id": 1}
    )
    if not doc:
        pytest.skip("no off_peak_bonus_type=flat tenant in DB")
    uid = doc["user_id"]
    if not mongo.users.find_one({"id": uid}, {"_id": 1}):
        pytest.skip("flat-tenant has no users doc")
    r = requests.get(f"{BASE_URL}/api/scan/loyalty-rules/{uid}",
                     headers={"X-Forwarded-For": "10.94.99.2"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json()["data"]["off_peak_bonus_type"] == "flat"


# ── CR-094 Ad-hoc C: XFF with two IPs — bucket on first IP only ──────────────

def test_adhoc_094C_xff_two_ips_bucket_on_first(mongo):
    """'1.2.3.4, 5.6.7.8' → buckets on 1.2.3.4 only; 10.x should NOT get hit."""
    import random
    first_ip = f"10.94.{random.randint(100,200)}.{random.randint(2,250)}"
    other_ip = f"10.95.{random.randint(100,200)}.{random.randint(2,250)}"
    xff = f"{first_ip}, {other_ip}"

    # Make 1 call with combined XFF
    r = requests.get(f"{BASE_URL}/api/scan/loyalty-rules/689",
                     headers={"X-Forwarded-For": xff}, timeout=30)
    assert r.status_code in (200, 429), r.text

    # Verify scan_lookup_attempts has a bucket for first_ip not other_ip
    bucket_first = mongo.scan_lookup_attempts.find_one({"key": f"lr-ip:{first_ip}"})
    bucket_other = mongo.scan_lookup_attempts.find_one({"key": f"lr-ip:{other_ip}"})
    assert bucket_first is not None, f"lr-ip:{first_ip} bucket not found in scan_lookup_attempts"
    assert bucket_other is None, f"lr-ip:{other_ip} should NOT have a bucket (got {bucket_other})"
    print(f"PASS: XFF bucket correctly on first IP {first_ip}, not {other_ip}")


# ── CR-094 Ad-hoc D: collection counts unchanged after run ───────────────────

def test_adhoc_094D_counts_unchanged(mongo):
    """customers, loyalty_settings, points_transactions counts stable after CR-094 tests."""
    cust = mongo.customers.count_documents({})
    ls   = mongo.loyalty_settings.count_documents({})
    pt   = mongo.points_transactions.count_documents({})
    # Make a few calls
    requests.get(f"{BASE_URL}/api/scan/loyalty-rules/689",
                 headers={"X-Forwarded-For": "10.94.99.10"}, timeout=30)
    requests.get(f"{BASE_URL}/api/scan/loyalty-rules/999999",
                 headers={"X-Forwarded-For": "10.94.99.11"}, timeout=30)
    assert mongo.customers.count_documents({}) == cust
    assert mongo.loyalty_settings.count_documents({}) == ls
    assert mongo.points_transactions.count_documents({}) == pt
    print(f"PASS: counts stable — customers={cust}, loyalty_settings={ls}, points_transactions={pt}")


# ── CR-096 Ad-hoc A: message > 500 chars → stored exactly 500 ────────────────

def test_adhoc_096A_message_truncated_to_500(mongo):
    """Submit message of 600 chars; stored doc must have exactly 500 chars."""
    long_msg = "X" * 600
    r = requests.post(f"{BASE_URL}/api/scan/feedback",
                      json={"rating": 3, "message": long_msg, "restaurant_id": R_SHORT},
                      headers={"X-Forwarded-For": "10.96.99.1"}, timeout=30)
    assert r.status_code == 200, r.text
    fid = r.json()["data"]["feedback_id"]
    doc = mongo.feedback.find_one({"id": fid})
    assert doc is not None
    stored_len = len(doc.get("message") or "")
    # cleanup
    mongo.feedback.delete_one({"id": fid})
    assert stored_len == 500, f"expected 500 chars, got {stored_len}"


# ── CR-096 Ad-hoc B: staff GET /feedback for tenant with scan-sourced null rows ─

def test_adhoc_096B_staff_list_no_crash_with_null_names(mongo):
    """GET /api/feedback for r689 owner must be 200 even with null customer_name rows."""
    tok = _staff_token()
    r = requests.get(f"{BASE_URL}/api/feedback",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    rows = r.json()
    assert isinstance(rows, list)
    print(f"PASS: staff feedback list returned {len(rows)} rows, no crash")


# ── CR-096 Ad-hoc C: identity_source present on every feedback doc type ──────

def test_adhoc_096C_identity_source_present(mongo):
    """Every doc submitted via scan/feedback must have identity_source field."""
    # token path
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    docs = list(mongo.feedback.find(
        {"user_id": R_FULL, "created_at": {"$gte": now.isoformat()[:10]}},
        {"_id": 0, "id": 1, "identity_source": 1}
    ).limit(20))
    # Submit one of each type and check
    created = []

    # anonymous
    r = requests.post(f"{BASE_URL}/api/scan/feedback",
                      json={"rating": 3, "restaurant_id": R_SHORT},
                      headers={"X-Forwarded-For": "10.96.98.1"}, timeout=30)
    assert r.status_code == 200
    fid = r.json()["data"]["feedback_id"]
    created.append(fid)
    doc = mongo.feedback.find_one({"id": fid})
    assert doc.get("identity_source") is not None, f"anonymous: identity_source missing in {doc}"
    assert doc["identity_source"] == "none"

    # phone path (unknown)
    r = requests.post(f"{BASE_URL}/api/scan/feedback",
                      json={"rating": 4, "restaurant_id": R_SHORT, "phone": "9200000088", "country_code": KNOWN_CC},
                      headers={"X-Forwarded-For": "10.96.98.2"}, timeout=30)
    assert r.status_code == 200
    fid = r.json()["data"]["feedback_id"]
    created.append(fid)
    doc = mongo.feedback.find_one({"id": fid})
    assert doc.get("identity_source") is not None, f"phone: identity_source missing in {doc}"
    assert doc["identity_source"] == "phone"

    mongo.feedback.delete_many({"id": {"$in": created}})
    print("PASS: identity_source present on all doc types")


# ── CR-096 Ad-hoc D: 'linked' field in every 200 response ────────────────────

def test_adhoc_096D_linked_in_every_200(mongo):
    """Every 200 response must contain data.linked field."""
    created = []
    cases = [
        {"rating": 3, "restaurant_id": R_SHORT},  # anon
        {"rating": 4, "restaurant_id": R_SHORT, "phone": "9200000077", "country_code": KNOWN_CC},  # unknown phone
        {"rating": 5, "restaurant_id": R_SHORT, "phone": KNOWN_PHONE, "country_code": KNOWN_CC},  # known phone
    ]
    for i, body in enumerate(cases):
        r = requests.post(f"{BASE_URL}/api/scan/feedback",
                          json=body, headers={"X-Forwarded-For": f"10.96.97.{i+1}"}, timeout=30)
        assert r.status_code == 200, f"case {i}: {r.status_code} {r.text}"
        d = r.json()
        assert "linked" in d["data"], f"case {i}: 'linked' missing from response: {d}"
        if d.get("data", {}).get("feedback_id"):
            created.append(d["data"]["feedback_id"])
    mongo.feedback.delete_many({"id": {"$in": created}})
    print("PASS: 'linked' present in all 200 responses")


# ── Baseline customer count check ─────────────────────────────────────────────

def test_baseline_customer_count(mongo):
    """customers count should be ~7705 (±10 drift)."""
    count = mongo.customers.count_documents({})
    print(f"customers count = {count}")
    assert 7695 <= count <= 7715, f"customers count {count} outside expected range 7695-7715"
