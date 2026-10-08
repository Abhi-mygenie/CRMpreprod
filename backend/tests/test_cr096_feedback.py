"""CR-096 QA — POST /api/scan/feedback hybrid intake.

Pattern: test_cr093_lookup.py (sync requests + pymongo).
Fixture tenant: r689 Kunafa Mahal (loyalty on, known phone 7505242126 = Abhishek Jain).
Cleanup: F-ZZ deletes all feedback docs created here; asserts customers count unchanged.
Run: cd /app/backend && pytest tests/test_cr096_feedback.py -v -n 0
"""
import os
import time
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values
from datetime import datetime, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@kunafamahal.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]
FEEDBACK = "/api/scan/feedback"

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME   = _env["DB_NAME"]

R_SHORT  = "689"
R_FULL   = "pos_0001_restaurant_689"
R_NULL   = "99999"          # unknown restaurant

# Known customer in r689 (L4 confirmed: Abhishek Jain / 7505242126)
KNOWN_PHONE = "7505242126"
KNOWN_CC    = "+91"

# Bucket for feedback IDs created during the test run → deleted by F-ZZ
_created = []


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


def _staff_token() -> str:
    """Return staff JWT for r689 owner (login returns access_token at top level)."""
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"staff login failed: {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("token", "")


def _customer_token(phone: str = KNOWN_PHONE, rid: str = R_SHORT) -> str:
    """Customer JWT via skip-otp."""
    r = requests.post(
        f"{BASE_URL}/api/scan/auth/skip-otp",
        json={"phone": phone, "restaurant_id": rid, "country_code": KNOWN_CC},
        timeout=30,
    )
    assert r.status_code == 200, f"skip-otp failed: {r.text}"
    return r.json()["data"]["token"]


def _post(body, token=None, ip=None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if ip:
        headers["X-Forwarded-For"] = ip
    return requests.post(f"{BASE_URL}{FEEDBACK}", json=body, headers=headers, timeout=30)


# ── F-A: token path — linked, feedback_count +1 ─────────────────────────────

def test_FA_token_path_linked(mongo):
    tok = _customer_token()
    cust = mongo.customers.find_one(
        {"user_id": R_FULL, "phone": KNOWN_PHONE, "country_code": KNOWN_CC}, {"_id": 0, "id": 1, "feedback_count": 1}
    )
    assert cust, "F-A: known customer not found in DB"
    before = cust.get("feedback_count") or 0

    r = _post({"rating": 4, "message": "CR-096 F-A"}, token=tok, ip="10.96.1.1")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert "feedback_id" in d["data"]
    assert d["data"]["linked"] is True
    _created.append(d["data"]["feedback_id"])

    after = (mongo.customers.find_one({"id": cust["id"]}, {"_id": 0, "feedback_count": 1}) or {}).get("feedback_count") or 0
    assert after == before + 1, f"F-A: feedback_count {before} → {after}, expected {before+1}"


# ── F-B: expired/garbage token → 401 ────────────────────────────────────────

def test_FB_bad_token_401():
    r = _post({"rating": 3}, token="garbage.token.here", ip="10.96.1.2")
    assert r.status_code == 401, f"F-B expected 401, got {r.status_code}: {r.text}"


# ── F-C: no token + known phone → linked, no customer created ───────────────

def test_FC_no_token_known_phone_linked(mongo):
    before = mongo.customers.count_documents({})
    r = _post({"rating": 5, "message": "CR-096 F-C", "phone": KNOWN_PHONE, "country_code": KNOWN_CC, "restaurant_id": R_SHORT}, ip="10.96.1.3")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert d["data"]["linked"] is True
    _created.append(d["data"]["feedback_id"])
    assert mongo.customers.count_documents({}) == before, "F-C: customer count changed"


# ── F-D: no token + valid unknown phone → unlinked, phone stored, no create ──

def test_FD_no_token_unknown_phone_unlinked(mongo):
    before = mongo.customers.count_documents({})
    r = _post({"rating": 3, "message": "CR-096 F-D", "phone": "9000000001", "country_code": KNOWN_CC, "restaurant_id": R_SHORT}, ip="10.96.1.4")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert d["data"]["linked"] is False
    _created.append(d["data"]["feedback_id"])
    assert mongo.customers.count_documents({}) == before, "F-D: a new customer was created — must not be"

    # Verify phone stored in the doc
    doc = mongo.feedback.find_one({"id": d["data"]["feedback_id"]})
    assert doc is not None
    assert doc.get("customer_phone") is not None, "F-D: customer_phone missing"
    assert doc.get("customer_id") is None, "F-D: customer_id should be null"


# ── F-E: no token, no phone → anonymous unlinked, identity_source 'none' ────

def test_FE_anonymous_unlinked(mongo):
    r = _post({"rating": 2, "message": "CR-096 F-E", "restaurant_id": R_SHORT}, ip="10.96.1.5")
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["success"] is True
    assert d["data"]["linked"] is False
    _created.append(d["data"]["feedback_id"])

    doc = mongo.feedback.find_one({"id": d["data"]["feedback_id"]})
    assert doc is not None
    assert doc.get("identity_source") == "none", f"F-E: identity_source={doc.get('identity_source')}"
    assert doc.get("customer_phone") is None


# ── F-F: invalid phone → 400, nothing stored ─────────────────────────────────

def test_FF_invalid_phone_400(mongo):
    before = mongo.feedback.count_documents({"user_id": R_FULL})
    r = _post({"rating": 4, "phone": "0000000000", "country_code": KNOWN_CC, "restaurant_id": R_SHORT}, ip="10.96.1.6")
    assert r.status_code == 400, f"F-F expected 400, got {r.status_code}: {r.text}"
    assert mongo.feedback.count_documents({"user_id": R_FULL}) == before, "F-F: doc was stored despite invalid phone"


# ── F-G: blocked customer → stored unlinked ──────────────────────────────────

def test_FG_blocked_customer_unlinked(mongo):
    blocked_phone = "9100000099"
    cust_id = f"test_cr096_blocked_{uuid.uuid4().hex[:8]}"
    now = datetime.now(timezone.utc).isoformat()
    mongo.customers.insert_one({
        "id": cust_id, "user_id": R_FULL,
        "phone": blocked_phone, "country_code": KNOWN_CC,
        "is_blocked": True, "name": "Blocked CR096 Test",
        "tier": "Bronze", "total_points": 0, "wallet_balance": 0.0,
        "total_visits": 0, "total_spent": 0.0,
        "allergies": [], "favorites": [],
        "created_at": now, "updated_at": now,
    })
    try:
        r = _post({"rating": 3, "phone": blocked_phone, "country_code": KNOWN_CC, "restaurant_id": R_SHORT}, ip="10.96.1.7")
        assert r.status_code == 200, f"F-G status {r.status_code}: {r.text}"
        d = r.json()
        assert d["success"] is True
        assert d["data"]["linked"] is False, "F-G: blocked customer must not be linked"
        _created.append(d["data"]["feedback_id"])
    finally:
        mongo.customers.delete_one({"id": cust_id})


# ── F-H: unknown order_id → order_id:null, order_id_raw kept ─────────────────

def test_FH_order_id_not_found(mongo):
    r = _post({"rating": 4, "order_id": "nope_cr096_xyz", "restaurant_id": R_SHORT}, ip="10.96.1.8")
    assert r.status_code == 200, r.text
    fid = r.json()["data"]["feedback_id"]
    _created.append(fid)

    doc = mongo.feedback.find_one({"id": fid})
    assert doc is not None
    assert doc["order_id"] is None,          f"F-H: order_id={doc['order_id']} (expected null)"
    assert doc.get("order_id_raw") == "nope_cr096_xyz", f"F-H: order_id_raw={doc.get('order_id_raw')}"


# ── F-I: no token, no restaurant_id → 422 ────────────────────────────────────

def test_FI_no_restaurant_id_422():
    r = _post({"rating": 3}, ip="10.96.1.9")
    assert r.status_code == 422, f"F-I expected 422, got {r.status_code}"


# ── F-J: unknown restaurant_id → 404 ─────────────────────────────────────────

def test_FJ_unknown_rid_404():
    r = _post({"rating": 3, "restaurant_id": R_NULL}, ip="10.96.1.10")
    assert r.status_code == 404, f"F-J expected 404, got {r.status_code}: {r.text}"


# ── F-K: IP rate limit (10/min) ───────────────────────────────────────────────

def test_FK_ip_rate_limit():
    # Fresh unique IP so we don't collide with other tests
    import random
    ip = f"10.96.{random.randint(10, 254)}.{random.randint(2, 254)}"

    codes = []
    for i in range(11):
        r = _post({"rating": 1, "restaurant_id": R_SHORT}, ip=ip)
        codes.append(r.status_code)
        if r.status_code == 200:
            fid = r.json().get("data", {}).get("feedback_id")
            if fid:
                _created.append(fid)

    assert codes.count(429) >= 1, f"F-K IP limit: no 429 in {codes}"
    assert codes[0] == 200, f"F-K: first call should be 200, got {codes[0]}"

    # Verify Retry-After is present on the 429
    r_extra = _post({"rating": 1, "restaurant_id": R_SHORT}, ip=ip)
    assert r_extra.status_code == 429
    ra = r_extra.headers.get("Retry-After")
    assert ra and ra.isdigit() and int(ra) > 0, f"F-K: Retry-After={ra}"


# ── F-K2: phone rate limit (3/10 min) ────────────────────────────────────────

def test_FK2_phone_rate_limit(mongo):
    # Use a phone that does NOT exist in customers (to avoid side effects on F-C/F-D)
    limit_phone = "9500000096"
    # Drain any leftover bucket from previous runs (direct mongo delete of limiter docs)
    mongo.scan_lookup_attempts.delete_many({"key": {"$regex": f"^fb-ph:{R_FULL}:{KNOWN_CC}{limit_phone}"}})

    codes = []
    for i in range(4):
        r = _post({"rating": 2, "phone": limit_phone, "country_code": KNOWN_CC, "restaurant_id": R_SHORT},
                  ip=f"10.96.7.{i+1}")
        codes.append(r.status_code)
        if r.status_code == 200:
            fid = r.json().get("data", {}).get("feedback_id")
            if fid:
                _created.append(fid)

    assert codes[:3] == [200, 200, 200], f"F-K2: first 3 should be 200, got {codes}"
    assert codes[3] == 429, f"F-K2: 4th call should be 429, got {codes[3]}"


# ── F-L: rating out of range → 400 ───────────────────────────────────────────

def test_FL_rating_out_of_range():
    r0 = _post({"rating": 0, "restaurant_id": R_SHORT}, ip="10.96.1.11")
    r6 = _post({"rating": 6, "restaurant_id": R_SHORT}, ip="10.96.1.12")
    assert r0.status_code in (400, 422), f"F-L rating=0: {r0.status_code}"
    assert r6.status_code in (400, 422), f"F-L rating=6: {r6.status_code}"


# ── F-M: staff GET /feedback lists anonymous row without crash ────────────────

def test_FM_staff_feedback_list_200(mongo):
    # Insert a guaranteed anonymous row
    r = _post({"rating": 3, "message": "F-M staff list test", "restaurant_id": R_SHORT}, ip="10.96.1.13")
    assert r.status_code == 200, f"F-M insert failed: {r.status_code} {r.text}"
    fid = r.json()["data"]["feedback_id"]
    _created.append(fid)

    tok = _staff_token()
    list_r = requests.get(f"{BASE_URL}/api/feedback", headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert list_r.status_code == 200, f"F-M staff list crashed: {list_r.status_code} {list_r.text}"

    rows = list_r.json()
    assert isinstance(rows, list), f"F-M: expected list, got {type(rows)}"
    ids = [row.get("id") for row in rows]
    assert fid in ids, f"F-M: feedback_id {fid} not in staff list (got {len(rows)} rows)"


# ── F-ZZ: cleanup — delete all test feedback, assert customers count unchanged ─

def test_FZZ_cleanup(mongo):
    if not _created:
        pytest.skip("no feedback docs to clean up")

    before = mongo.customers.count_documents({})
    result = mongo.feedback.delete_many({"id": {"$in": _created}})
    remaining = mongo.feedback.count_documents({"id": {"$in": _created}})
    assert remaining == 0, f"F-ZZ: {remaining} docs not cleaned up"

    after = mongo.customers.count_documents({})
    assert before == after, f"F-ZZ: customers count changed {before}→{after}"
