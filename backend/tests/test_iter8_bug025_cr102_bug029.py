"""Iteration 8 QA — BUG-025, BUG-029, CR-102 independent verification.

Covers Q1..Q8, Q10 from the review request. Q9 is executed separately as
whole-suite runs. Does not modify application code or seeded customer rows.

Rate-limiter buckets are shared with other tests — Q1/Q3/Q6 clear
scan_lookup_attempts before they run and we use fresh X-Forwarded-For
ranges 10.66.x.x not seen in previous iterations.
"""
import os
import re
import time
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SKIP_OTP = f"{BASE_URL}/api/scan/auth/skip-otp"
LOOKUP = f"{BASE_URL}/api/scan/auth/lookup"
ME = f"{BASE_URL}/api/scan/auth/me"
ORDERS = f"{BASE_URL}/api/scan/orders"

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME = _env["DB_NAME"]

R689 = "pos_0001_restaurant_689"
EXPECTED_BASELINE = 7705

EXISTING_PHONES = [
    "7505242126","9990818342","9035133228","8957823844","9415307319",
    "9519015006","9151555198","8577851657","8726401145","7706001175",
    "9818060975","8317096835","7897180051","7906029250","9649999320",
    "7905104334","7860323685","8951572921","9918609001","9071441516",
    "8207264050","7905614247","8787006565","9005551490","9005998822",
    "9236135157","7845707354","9340405962","9044111800","8826385535",
]


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _clear_buckets(mongo):
    mongo.scan_lookup_attempts.delete_many({})


def _clear_phone_bucket(mongo, phone_cc_digits):
    """Clear specific so-ph rows for a canonical bucket."""
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": f"so-ph:.*{re.escape(phone_cc_digits)}$"}})


def _post(url, body, ip=None):
    h = {"X-Forwarded-For": ip} if ip else {}
    return requests.post(url, json=body, headers=h, timeout=30)


# ---------- Baseline snapshot ----------
@pytest.fixture(scope="module", autouse=True)
def _baseline_cleanup(mongo):
    # Pre-cleanup: ensure no residual +61 412345678 doc from prior failed runs
    mongo.customers.delete_many({"user_id": R689, "phone": "412345678", "country_code": "+61"})
    mongo.customers.delete_many({"user_id": R689, "phone": "412345678", "country_code": "abc"})
    yield
    # Post-cleanup: delete any created +61/foreign test docs, clear buckets
    mongo.customers.delete_many({"user_id": R689, "phone": "412345678", "country_code": "+61"})
    mongo.scan_lookup_attempts.delete_many({})


# =============================================================================
# Q10 (first half) — baseline snapshot
# =============================================================================
def test_Q10a_baseline_customers_count(mongo):
    cnt = mongo.customers.count_documents({})
    print(f"\n[Q10a] customers.count_documents({{}}) = {cnt} (expected {EXPECTED_BASELINE})")
    pytest.baseline_count = cnt
    assert cnt == EXPECTED_BASELINE, f"baseline drift: {cnt} vs expected {EXPECTED_BASELINE}"


# =============================================================================
# Q1 — BUG-025 canonical bucket for phone 7897180051 variants
# =============================================================================
def test_Q1_bug025_canonical_bucket(mongo):
    # Clear scan_lookup_attempts rows for this phone's so-ph bucket
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r"^so-ph:.*7897180051$"}})
    before = mongo.customers.count_documents({"user_id": R689})

    # 5x from distinct IPs → all 200
    results = []
    for i in range(1, 6):
        r = _post(SKIP_OTP, {"phone": "7897180051", "restaurant_id": "689"}, f"10.66.1.{i}")
        results.append(r.status_code)
        assert r.status_code == 200, f"call {i} expected 200, got {r.status_code}: {r.text}"

    # 6th: '+91 7897180051' → 429
    r6 = _post(SKIP_OTP, {"phone": "+91 7897180051", "restaurant_id": "689"}, "10.66.1.6")
    assert r6.status_code == 429, f"6th call expected 429, got {r6.status_code}: {r6.text}"
    assert "Retry-After" in r6.headers, "missing Retry-After"
    assert "Too many login attempts" in r6.json().get("detail", ""), r6.text

    # 7th: '07897180051' → 429
    r7 = _post(SKIP_OTP, {"phone": "07897180051", "restaurant_id": "689"}, "10.66.1.7")
    assert r7.status_code == 429, f"7th: {r7.status_code} {r7.text}"

    # 8th: '78971 80051' → 429
    r8 = _post(SKIP_OTP, {"phone": "78971 80051", "restaurant_id": "689"}, "10.66.1.8")
    assert r8.status_code == 429, f"8th: {r8.status_code} {r8.text}"

    # customers count unchanged for r689
    after = mongo.customers.count_documents({"user_id": R689})
    assert before == after, f"r689 customers drifted {before} -> {after}"

    # Mongo: exactly 'so-ph:pos_0001_restaurant_689:+917897180051' with 5 rows
    canonical_key = "so-ph:pos_0001_restaurant_689:+917897180051"
    n_canonical = mongo.scan_lookup_attempts.count_documents({"key": canonical_key})
    print(f"[Q1] canonical rows ({canonical_key}) = {n_canonical}")
    assert n_canonical == 5, f"canonical rows expected 5, got {n_canonical}"

    # NO key matching so-ph:*:917897180051 (12-digit, no plus) or so-ph:*:07897180051
    bad1 = mongo.scan_lookup_attempts.count_documents({"key": {"$regex": r"^so-ph:[^+]*:917897180051$"}})
    bad2 = mongo.scan_lookup_attempts.count_documents({"key": {"$regex": r":07897180051$"}})
    assert bad1 == 0, f"found non-canonical 917897180051 rows: {bad1}"
    assert bad2 == 0, f"found non-canonical 07897180051 rows: {bad2}"


# =============================================================================
# Q2 — BUG-025 IP-first: invalid phone still consumes IP quota
# =============================================================================
def test_Q2_bug025_ip_first_invalid(mongo):
    ip = "10.66.2.9"
    mongo.scan_lookup_attempts.delete_many({"key": f"so-ip:{ip}"})

    r = _post(SKIP_OTP, {"phone": "0000000000", "restaurant_id": "689"}, ip)
    assert r.status_code == 400, f"{r.status_code} {r.text}"
    assert "Enter a valid mobile number" in r.json().get("detail", "")

    n_ip = mongo.scan_lookup_attempts.count_documents({"key": f"so-ip:{ip}"})
    assert n_ip == 1, f"expected 1 so-ip row, got {n_ip}"
    n_ph = mongo.scan_lookup_attempts.count_documents({"key": {"$regex": r"^so-ph:.*0000000000$"}})
    assert n_ph == 0, f"expected 0 so-ph rows for 0000000000, got {n_ph}"


# =============================================================================
# Q3 — BUG-025 IP limiter precedes validation (30 valid, 31st invalid → 429)
# =============================================================================
def test_Q3_bug025_ip_before_validation(mongo):
    ip = "10.66.3.3"
    # Clear so-ph rows for all 30 phones AND the so-ip bucket
    mongo.scan_lookup_attempts.delete_many({"key": f"so-ip:{ip}"})
    for p in EXISTING_PHONES:
        mongo.scan_lookup_attempts.delete_many({"key": {"$regex": f"^so-ph:.*{p}$"}})

    before = mongo.customers.count_documents({"user_id": R689})

    for i, phone in enumerate(EXISTING_PHONES, 1):
        r = _post(SKIP_OTP, {"phone": phone, "restaurant_id": "689"}, ip)
        assert r.status_code == 200, f"call {i}/{phone}: {r.status_code} {r.text}"

    # 31st: invalid phone 'abc' same IP → should be 429 (IP bucket) not 400
    r31 = _post(SKIP_OTP, {"phone": "abc", "restaurant_id": "689"}, ip)
    assert r31.status_code == 429, f"31st (abc) expected 429, got {r31.status_code}: {r31.text}"

    after = mongo.customers.count_documents({"user_id": R689})
    assert before == after, f"r689 customers drifted {before} -> {after}"


# =============================================================================
# Q4 — CR-102 default country_code=+91
# =============================================================================
def test_Q4_cr102_default_cc(mongo):
    # Clear bucket for 9838777712 to avoid 429 from previous suite runs
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r"^so-ph:.*9838777712$"}})
    before = mongo.customers.count_documents({"user_id": R689})

    r1 = _post(SKIP_OTP, {"phone": "9838777712", "restaurant_id": "689"}, "10.66.4.1")
    assert r1.status_code == 200, r1.text
    cid1 = r1.json()["data"]["customer_id"]
    assert r1.json()["data"]["token"]

    r2 = _post(SKIP_OTP, {"phone": "9838777712", "restaurant_id": "689", "country_code": "+91"}, "10.66.4.2")
    assert r2.status_code == 200, r2.text
    cid2 = r2.json()["data"]["customer_id"]
    assert cid1 == cid2, f"customer_id mismatch: {cid1} vs {cid2}"

    after = mongo.customers.count_documents({"user_id": R689})
    assert before == after, f"r689 customers drifted {before} -> {after}"


# =============================================================================
# Q5 — CR-102 foreign country_code
# =============================================================================
def test_Q5_cr102_foreign_cc(mongo):
    # Pre-clean any prior doc
    mongo.customers.delete_many({"user_id": R689, "phone": "412345678", "country_code": "+61"})
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r".*412345678$"}})
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r"^so-ph:.*9838777712$"}})
    r689_before = mongo.customers.count_documents({"user_id": R689})

    body_au = {"phone": "412345678", "country_code": "+61", "restaurant_id": "689"}
    r1 = _post(SKIP_OTP, body_au, "10.66.5.1")
    assert r1.status_code == 200, r1.text
    data1 = r1.json()["data"]
    assert data1["is_new_customer"] is True
    au_token = data1["token"]

    docs = list(mongo.customers.find({"user_id": R689, "phone": "412345678", "country_code": "+61"}))
    assert len(docs) == 1, f"expected 1 +61 doc, got {len(docs)}"

    # Repeat → not new
    r2 = _post(SKIP_OTP, body_au, "10.66.5.2")
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["is_new_customer"] is False
    assert mongo.customers.count_documents({"user_id": R689, "phone": "412345678", "country_code": "+61"}) == 1

    # +91 cc with 9-digit → 400 (proves cc honoured)
    r3 = _post(SKIP_OTP, {"phone": "412345678", "country_code": "+91", "restaurant_id": "689"}, "10.66.5.3")
    assert r3.status_code == 400, f"+91/9-digit expected 400, got {r3.status_code}: {r3.text}"

    # bad cc 'abc' → 400
    r4 = _post(SKIP_OTP, {"phone": "9838777712", "country_code": "abc", "restaurant_id": "689"}, "10.66.5.4")
    assert r4.status_code == 400, f"abc cc expected 400, got {r4.status_code}: {r4.text}"

    # /scan/auth/me with +61 token
    me = requests.get(ME, headers={"Authorization": f"Bearer {au_token}"}, timeout=30)
    assert me.status_code == 200, me.text
    me_data = me.json()["data"]
    assert me_data["phone"] == "412345678"
    assert "password_hash" not in me_data

    # Cleanup
    res = mongo.customers.delete_many({"user_id": R689, "phone": "412345678", "country_code": "+61"})
    assert res.deleted_count == 1
    assert mongo.customers.count_documents({"user_id": R689, "phone": "412345678", "country_code": "+61"}) == 0

    r689_after = mongo.customers.count_documents({"user_id": R689})
    assert r689_before == r689_after, f"r689 drifted {r689_before} -> {r689_after}"


# =============================================================================
# Q6 — BUG-029 lookup IP-first
# =============================================================================
def test_Q6_bug029_lookup_ip_first(mongo):
    ip1 = "10.66.6.1"
    mongo.scan_lookup_attempts.delete_many({"key": f"ip:{ip1}"})
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r"^ph:.*abc.*$"}})

    r = _post(LOOKUP, {"phone": "abc", "restaurant_id": "689"}, ip1)
    assert r.status_code == 400, r.text
    assert "Invalid phone or country_code" in r.json().get("detail", "")
    assert mongo.scan_lookup_attempts.count_documents({"key": f"ip:{ip1}"}) == 1
    assert mongo.scan_lookup_attempts.count_documents({"key": {"$regex": r"^ph:.*abc.*$"}}) == 0

    ip2 = "10.66.6.2"
    mongo.scan_lookup_attempts.delete_many({"key": f"ip:{ip2}"})
    # 10 valid-unknown lookups
    for i in range(10):
        phone = f"90000010{i:02d}"[:10]  # 10-digit starting with 9 → valid
        r = _post(LOOKUP, {"phone": phone, "restaurant_id": "689"}, ip2)
        assert r.status_code == 200, f"lookup {i}/{phone}: {r.status_code} {r.text}"
        assert r.json()["data"]["exists"] is False

    r11 = _post(LOOKUP, {"phone": "abc", "restaurant_id": "689"}, ip2)
    assert r11.status_code == 429, f"11th expected 429, got {r11.status_code}: {r11.text}"
    assert "Retry-After" in r11.headers


# =============================================================================
# Q7 — lookup regression
# =============================================================================
def test_Q7_lookup_regression(mongo):
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r".*9579504871$"}})
    before = mongo.customers.count_documents({"user_id": R689})

    r1 = _post(LOOKUP, {"phone": "9579504871", "restaurant_id": "689", "country_code": "+91"}, "10.66.7.1")
    assert r1.status_code == 200, r1.text
    d1 = r1.json()["data"]
    assert d1["exists"] is True
    assert d1["name"] == "MYGENieT", f"name mismatch: {d1}"

    r2 = _post(LOOKUP, {"phone": "+91 9579504871", "restaurant_id": "689"}, "10.66.7.2")
    assert r2.status_code == 200, r2.text
    assert r2.json()["data"]["exists"] is True
    assert r2.json()["data"]["name"] == "MYGENieT"

    assert mongo.customers.count_documents({"user_id": R689}) == before

    # 5/300s phone bucket — 6th call distinct IPs → 429
    # we've already made 2 calls, make 3 more then 6th
    for i in range(3, 6):
        r = _post(LOOKUP, {"phone": "9579504871", "restaurant_id": "689"}, f"10.66.7.{i}")
        assert r.status_code == 200, f"{i}: {r.status_code} {r.text}"
    r6 = _post(LOOKUP, {"phone": "9579504871", "restaurant_id": "689"}, "10.66.7.6")
    assert r6.status_code == 429, f"6th lookup expected 429, got {r6.status_code}: {r6.text}"


# =============================================================================
# Q8 — skip-otp regression
# =============================================================================
def test_Q8_skip_otp_regression(mongo):
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": r"^so-ph:.*9838777712$"}})
    before = mongo.customers.count_documents({"user_id": R689, "phone": "9838777712"})

    r1 = _post(SKIP_OTP, {"phone": "98387 77712", "restaurant_id": "689"}, "10.66.8.1")
    assert r1.status_code == 200, r1.text
    tok = r1.json()["data"]["token"]
    after = mongo.customers.count_documents({"user_id": R689, "phone": "9838777712"})
    assert after == before, f"docs for 9838777712 changed: {before}->{after}"

    me = requests.get(ME, headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert me.status_code == 200, me.text

    orders = requests.get(ORDERS, headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert orders.status_code == 200, orders.text

    r_empty = requests.post(SKIP_OTP, json={}, timeout=30)
    assert r_empty.status_code == 422, r_empty.text

    for path in ("/api/scan/auth/register", "/api/scan/auth/login", "/api/scan/auth/request-otp", "/api/scan/auth/verify-otp"):
        rr = requests.post(f"{BASE_URL}{path}", json={}, timeout=30)
        assert rr.status_code == 404, f"{path} expected 404, got {rr.status_code}"


# =============================================================================
# Q10 (final) — count unchanged, no +61 doc leftover, clear buckets
# =============================================================================
def test_Q10b_final_integrity(mongo):
    final_cnt = mongo.customers.count_documents({})
    print(f"\n[Q10b] final customers count = {final_cnt} (expected {EXPECTED_BASELINE})")
    assert final_cnt == EXPECTED_BASELINE, f"customers drifted: {final_cnt} vs {EXPECTED_BASELINE}"
    assert mongo.customers.count_documents({"user_id": R689, "phone": "412345678"}) == 0

    mongo.scan_lookup_attempts.delete_many({})
