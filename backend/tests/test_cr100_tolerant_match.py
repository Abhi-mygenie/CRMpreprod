"""CR-100 — tolerant phone_match for legacy country_code null/empty (+91 only).

Inserts a synthetic null-cc customer in r689, verifies all identity channels
find it (no duplicate created), cleans up at the end.

Run: cd /app/backend && pytest tests/test_cr100_tolerant_match.py -v -n 0
"""
import os
import uuid
import pytest
import requests
from pymongo import MongoClient
from dotenv import dotenv_values
from datetime import datetime, timezone

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@kunafamahal.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME   = _env["DB_NAME"]

R_SHORT = "689"
R_FULL  = "pos_0001_restaurant_689"

# Test phone — verified absent from r689; 10-digit, valid pattern, unique to this suite
TEST_PHONE = "8700000001"
TEST_CC    = "+91"
TEST_CUST_ID = f"test_cr100_{uuid.uuid4().hex[:12]}"

# IP range not used by any other rate-limit suite (10.100.x.x)
_ip_ctr = {"n": 0}
def _ip():
    _ip_ctr["n"] += 1
    return f"10.100.{(_ip_ctr['n'] // 250) + 1}.{_ip_ctr['n'] % 250 + 1}"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="module")
def null_cc_customer(mongo):
    """Insert a synthetic customer with country_code: None (legacy gap). Clean up after."""
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "id": TEST_CUST_ID,
        "user_id": R_FULL,
        "phone": TEST_PHONE,
        "country_code": None,          # <-- the legacy gap CR-100 fixes
        "name": "CR100 Test Diner",
        "tier": "Bronze",
        "total_points": 0,
        "wallet_balance": 0.0,
        "total_visits": 0,
        "total_spent": 0.0,
        "allergies": [],
        "favorites": [],
        "is_blocked": False,
        "phone_invalid": False,
        "created_at": now,
        "updated_at": now,
    }
    mongo.customers.insert_one(doc)
    yield doc
    # Cleanup: delete the test doc and any accidental duplicate created during tests
    mongo.customers.delete_many({"user_id": R_FULL, "phone": TEST_PHONE})


@pytest.fixture(scope="module")
def api_key(mongo):
    u = mongo.users.find_one({"id": R_FULL}, {"_id": 0, "api_key": 1})
    assert u and u.get("api_key"), "r689 api_key missing"
    return u["api_key"]


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
        timeout=20,
    )
    assert r.status_code == 200, f"staff login failed: {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("token", "")


def _get(path, token=None, ip=None):
    h = {"X-Forwarded-For": ip or _ip()}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return requests.get(f"{BASE_URL}{path}", headers=h, timeout=20)


def _post(path, body, token=None, api_key=None, ip=None):
    h = {"Content-Type": "application/json", "X-Forwarded-For": ip or _ip()}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if api_key:
        h["X-API-Key"] = api_key
    return requests.post(f"{BASE_URL}{path}", json=body, headers=h, timeout=20)


# ── V1: skip-otp finds the null-cc customer; no new customer created ─────────

def test_V1_skip_otp_finds_null_cc_customer(null_cc_customer, mongo):
    before = mongo.customers.count_documents({"user_id": R_FULL})
    r = _post("/api/scan/auth/skip-otp", {
        "phone": TEST_PHONE,
        "restaurant_id": R_SHORT,
        "country_code": TEST_CC,
    }, ip=_ip())
    assert r.status_code == 200, f"V1 skip-otp: {r.status_code} {r.text}"
    d = r.json()
    assert d["success"] is True
    assert d["data"]["is_new_customer"] is False, "V1: null-cc customer was not found — duplicate would be created"
    after = mongo.customers.count_documents({"user_id": R_FULL})
    assert after == before, f"V1: customers count changed {before} → {after}"


# ── V2: POS customer-lookup returns registered:true ────────────────────────

def test_V2_pos_lookup_registered(null_cc_customer, api_key):
    r = _post("/api/pos/customer-lookup", {
        "phone": TEST_PHONE,
        "country_code": TEST_CC,
        "restaurant_id": R_FULL,
    }, api_key=api_key, ip=_ip())
    assert r.status_code == 200, f"V2 POS lookup: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("registered") is True or d.get("data", {}).get("registered") is True, \
        f"V2: null-cc customer not found by POS lookup: {d}"


# ── V3: Tolerant DB query directly finds the null-cc doc ────────────────────

def test_V3_direct_tolerant_query(null_cc_customer, mongo):
    """Proxy for POS order linkage — confirms the $in query matches the null-cc doc."""
    doc = mongo.customers.find_one(
        {"user_id": R_FULL, "phone": TEST_PHONE, "country_code": {"$in": ["+91", None, ""]}}
    )
    assert doc is not None, "V3: tolerant query did not find the null-cc customer"
    assert doc["id"] == TEST_CUST_ID, f"V3: wrong doc returned: {doc['id']}"
    # Confirm exact query would miss it
    exact = mongo.customers.find_one(
        {"user_id": R_FULL, "phone": TEST_PHONE, "country_code": "+91"}
    )
    assert exact is None, "V3: exact +91 query unexpectedly found the null-cc doc (country_code was set?)"


# ── V4: CRM add-customer with same phone rejected (no duplicate) ────────────

def test_V4_crm_add_customer_no_duplicate(null_cc_customer, staff_token, mongo):
    before = mongo.customers.count_documents({"user_id": R_FULL, "phone": TEST_PHONE})
    r = _post("/api/customers", {
        "name": "CR100 Dup Attempt",
        "phone": TEST_PHONE,
        "country_code": TEST_CC,
    }, token=staff_token, ip=_ip())
    # Should be 400/409 (duplicate) or at most create 0 new docs
    after = mongo.customers.count_documents({"user_id": R_FULL, "phone": TEST_PHONE})
    assert after == before, f"V4: duplicate created — count {before} → {after} (status={r.status_code})"


# ── V5: scan lookup returns exists:true ────────────────────────────────────

def test_V5_scan_lookup_exists(null_cc_customer):
    r = _post("/api/scan/auth/lookup", {
        "phone": TEST_PHONE,
        "country_code": TEST_CC,
        "restaurant_id": R_SHORT,
    }, ip=_ip())
    assert r.status_code == 200, f"V5 lookup: {r.status_code} {r.text}"
    d = r.json()
    assert d["success"] is True
    assert d["data"]["exists"] is True, f"V5: null-cc customer not found by lookup: {d}"


# ── V6: foreign cc (+61) does NOT match the null-cc doc ────────────────────

def test_V6_foreign_cc_no_false_match(null_cc_customer):
    r = _post("/api/scan/auth/lookup", {
        "phone": "404668073",        # valid 9-digit AU number
        "country_code": "+61",
        "restaurant_id": R_SHORT,
    }, ip=_ip())
    assert r.status_code == 200, f"V6: {r.status_code} {r.text}"
    assert r.json()["data"]["exists"] is False, "V6: foreign-cc phone matched a null-cc doc (should be exact)"


# ── V7: tolerant query still uses IXSCAN ────────────────────────────────────

def test_V7_ixscan(mongo):
    exp = mongo.command("explain", {
        "find": "customers",
        "filter": {
            "user_id": R_FULL,
            "phone": TEST_PHONE,
            "country_code": {"$in": ["+91", None, ""]},
        },
    }, verbosity="queryPlanner")
    plan = exp["queryPlanner"]["winningPlan"]
    found = []
    def walk(node):
        if isinstance(node, dict):
            if node.get("stage") == "IXSCAN":
                found.append(node.get("indexName", ""))
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(plan)
    assert any("user_phone" in n or "user_id" in n for n in found), \
        f"V7: no IXSCAN on user_phone index — found: {found}; plan: {plan}"


# ── VZZ: cleanup and baseline check ────────────────────────────────────────

def test_VZZ_cleanup(null_cc_customer, mongo):
    # Explicit cleanup (fixture teardown runs after all module tests; do it here directly).
    mongo.customers.delete_many({"user_id": R_FULL, "phone": TEST_PHONE})
    remaining = mongo.customers.count_documents({"id": TEST_CUST_ID})
    assert remaining == 0, f"VZZ: test customer {TEST_CUST_ID} not cleaned up"
    # Pre-existing null-cc count in r689 must be unchanged (no accidental writes)
    total_null_cc = mongo.customers.count_documents(
        {"user_id": R_FULL, "country_code": None}
    )
    assert total_null_cc == 4, f"VZZ: r689 null-cc count changed (expected 4, got {total_null_cc})"
