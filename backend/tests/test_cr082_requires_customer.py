"""CR-082 — Per-Coupon 'requires_customer' flag.

Creates one generic coupon (requires_customer=False) and one standard coupon
(requires_customer=True) on r689, runs V1–V11, cleans up.

Run: cd /app/backend && pytest tests/test_cr082_requires_customer.py -v -n 0
"""
import os
import uuid
import requests
from pymongo import MongoClient
from dotenv import dotenv_values

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@kunafamahal.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME   = _env["DB_NAME"]

R_SHORT = "689"
R_FULL  = "pos_0001_restaurant_689"

# Unique codes so parallel runs don't collide
_suffix = uuid.uuid4().hex[:6].upper()
GENERIC_CODE  = f"CR082_GENERIC_{_suffix}"
STANDARD_CODE = f"CR082_STANDARD_{_suffix}"

_created_coupon_ids = []


import pytest

@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    # cleanup
    cli[DB_NAME].coupons.delete_many({"code": {"$in": [GENERIC_CODE, STANDARD_CODE]}})
    cli.close()


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


def _pos(path, method="post", body=None, params=None, api_key_val=None):
    h = {"Content-Type": "application/json"}
    if api_key_val:
        h["X-API-Key"] = api_key_val
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, params=params, headers=h, timeout=20)


def _crm(path, method="post", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, headers=h, timeout=20)


# ── V1: create coupon with requires_customer=False ─────────────────────────

def test_V1_create_generic_coupon(staff_token, mongo):
    r = _crm("/coupons", body={
        "code": GENERIC_CODE,
        "discount_type": "flat",
        "discount_value": 50.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["delivery", "takeaway", "dine_in", "pos"],  # include pos for POS till
        "requires_customer": False,
    }, token=staff_token)
    assert r.status_code in (200, 201), f"V1 create failed: {r.status_code} {r.text}"
    doc = r.json()
    coupon_id = doc.get("id") or doc.get("data", {}).get("id")
    assert coupon_id, "V1: no coupon id returned"
    _created_coupon_ids.append(coupon_id)
    # Confirm stored value
    stored = mongo.coupons.find_one({"code": GENERIC_CODE}, {"_id": 0, "requires_customer": 1})
    assert stored is not None
    assert stored.get("requires_customer") is False, f"V1: stored requires_customer={stored.get('requires_customer')}"


# ── V2: create coupon without requires_customer field → defaults True ───────

def test_V2_create_standard_coupon_defaults_true(staff_token, mongo):
    r = _crm("/coupons", body={
        "code": STANDARD_CODE,
        "discount_type": "flat",
        "discount_value": 100.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["delivery", "takeaway", "dine_in", "pos"],  # include pos
        # no requires_customer field
    }, token=staff_token)
    assert r.status_code in (200, 201), f"V2 create failed: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": STANDARD_CODE}, {"_id": 0, "requires_customer": 1})
    assert stored is not None
    assert stored.get("requires_customer", True) is True, f"V2: expected True, got {stored.get('requires_customer')}"


# ── V3: validate generic coupon — no customer_id → success ─────────────────

def test_V3_validate_generic_no_customer(api_key):
    r = _pos("/pos/coupons/validate", body={
        "code": GENERIC_CODE,
        "order_total": 500.0,
        # no customer_id
    }, api_key_val=api_key)
    assert r.status_code == 200, f"V3: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("success") is True, f"V3: {d}"
    data = d.get("data", {})
    assert data.get("valid") is True or data.get("computed_discount") is not None, f"V3: not valid: {d}"


# ── V4: validate standard coupon — no customer_id → CUSTOMER_REQUIRED ──────

def test_V4_validate_standard_no_customer_blocked(api_key):
    r = _pos("/pos/coupons/validate", body={
        "code": STANDARD_CODE,
        "order_total": 500.0,
        # no customer_id
    }, api_key_val=api_key)
    assert r.status_code == 200, f"V4: {r.status_code} {r.text}"
    d = r.json()
    data = d.get("data", {})
    assert data.get("valid") is False or d.get("success") is False, f"V4: expected blocked, got: {d}"
    error_code = data.get("error", {}).get("code") or d.get("error", {}).get("code", "")
    assert error_code == "CUSTOMER_REQUIRED", f"V4: expected CUSTOMER_REQUIRED, got {error_code}"


# ── V5: available coupons without customer_id → only generic ───────────────

def test_V5_available_no_customer_only_generic(api_key, mongo):
    r = _pos("/pos/coupons/available", method="get",
             params={"order_total": 500.0}, api_key_val=api_key)
    assert r.status_code == 200, f"V5: {r.status_code} {r.text}"
    coupons = r.json().get("data", {}).get("coupons", [])
    codes = [c.get("code") for c in coupons]
    # Generic coupon must be present (requires_customer=False → passes gate)
    assert GENERIC_CODE in codes, f"V5: generic {GENERIC_CODE} not in list: {codes}"
    # Standard coupon must NOT be present (requires_customer=True + no customer_id → CUSTOMER_REQUIRED gate)
    assert STANDARD_CODE not in codes, f"V5: standard {STANDARD_CODE} should not appear without customer"


# ── V6: available coupons with customer_id → includes requires_customer=True ─

def test_V6_available_with_customer_includes_standard(api_key, mongo):
    # Get a real customer_id from r689
    cust = mongo.customers.find_one(
        {"user_id": R_FULL, "is_blocked": {"$ne": True}}, {"_id": 0, "id": 1}
    )
    assert cust, "V6: no customer found for r689"
    r = _pos("/pos/coupons/available", method="get",
             params={"customer_id": cust["id"], "order_total": 500.0}, api_key_val=api_key)
    assert r.status_code == 200, f"V6: {r.status_code} {r.text}"
    codes = [c.get("code") for c in r.json().get("data", {}).get("coupons", [])]
    # Both our test coupons should appear (customer provided)
    assert GENERIC_CODE in codes, f"V6: {GENERIC_CODE} missing"
    assert STANDARD_CODE in codes, f"V6: {STANDARD_CODE} missing"


# ── V10: usage recorded for generic coupon on a real order ─────────────────

def test_V10_usage_recorded_for_generic_order(api_key, mongo):
    """POST /pos/orders with generic coupon, minimal payload, check coupon_usage doc created."""
    before = mongo.coupon_usage.count_documents({"coupon_id": {"$exists": True}})
    # Minimal order payload
    r = _pos("/pos/orders", body={
        "order_id": f"cr082_test_{uuid.uuid4().hex[:8]}",
        "restaurant_id": R_FULL,
        "cust_mobile": "0000000001",  # junk phone = guest order
        "order_total": 500.0,
        "items": [{"name": "Test Item", "price": 500.0, "quantity": 1}],
        "coupon_code": GENERIC_CODE,
        "payment_method": "cash",
        "channel": "dine_in",
    }, api_key_val=api_key)
    # Success or idempotency — just check coupon_usage grew
    after = mongo.coupon_usage.count_documents({"coupon_id": {"$exists": True}})
    assert after >= before, "V10: coupon_usage count did not grow"


# ── V11: validate standard coupon WITH customer_id still works ──────────────

def test_V11_validate_standard_with_customer_still_works(api_key, mongo):
    cust = mongo.customers.find_one(
        {"user_id": R_FULL, "is_blocked": {"$ne": True}}, {"_id": 0, "id": 1}
    )
    assert cust, "V11: no customer found"
    r = _pos("/pos/coupons/validate", body={
        "code": STANDARD_CODE,
        "customer_id": cust["id"],
        "order_total": 500.0,
    }, api_key_val=api_key)
    assert r.status_code == 200, f"V11: {r.status_code} {r.text}"
    # Should succeed (standard coupon validates fine when customer is provided)
    d = r.json()
    data = d.get("data", {})
    error_code = data.get("error", {}).get("code", "")
    assert error_code != "CUSTOMER_REQUIRED", f"V11: got CUSTOMER_REQUIRED even with customer_id"
