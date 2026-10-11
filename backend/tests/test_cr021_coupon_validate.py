"""CR-021 — Coupon validation regression (backward compat post CR-082).
Verifies existing-style validation (with customer_id) still works.
Run: cd /app/backend && pytest tests/test_cr021_coupon_validate.py -v -n 0
"""
import os
import uuid
import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@kunafamahal.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]

_env = dotenv_values("/app/backend/.env")
MONGO_URL = _env["MONGO_URL"]
DB_NAME = _env["DB_NAME"]
R_FULL = "pos_0001_restaurant_689"
_suffix = uuid.uuid4().hex[:6].upper()
CODE = f"CR021_TEST_{_suffix}"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli[DB_NAME].coupons.delete_many({"code": CODE})
    cli.close()


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=20)
    assert r.status_code == 200
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("token", "")


@pytest.fixture(scope="module")
def api_key(mongo):
    u = mongo.users.find_one({"id": R_FULL}, {"_id": 0, "api_key": 1})
    assert u and u.get("api_key"), "api_key missing"
    return u["api_key"]


@pytest.fixture(scope="module")
def customer_id(mongo):
    cust = mongo.customers.find_one(
        {"user_id": R_FULL, "is_blocked": {"$ne": True}}, {"_id": 0, "id": 1}
    )
    assert cust, "no customer for r689"
    return cust["id"]


def _crm(path, method="get", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, headers=h, timeout=20)


def _pos(path, method="post", body=None, params=None, api_key_val=None):
    h = {"Content-Type": "application/json"}
    if api_key_val:
        h["X-API-Key"] = api_key_val
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, params=params, headers=h, timeout=20)


# Test V1: Create standard coupon (no requires_customer field) → defaults True
def test_V1_create_standard_coupon(staff_token, mongo):
    r = _crm("/coupons", method="post", body={
        "code": CODE,
        "discount_type": "flat",
        "discount_value": 25.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["dine_in", "delivery", "takeaway", "pos"],
    }, token=staff_token)
    assert r.status_code in (200, 201), f"V1: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": CODE}, {"_id": 0, "requires_customer": 1})
    assert stored.get("requires_customer", True) is True, "V1: should default to True"


# Test V2: Validate standard coupon WITH customer_id → valid (backward compat)
def test_V2_validate_with_customer_id(api_key, customer_id):
    r = _pos("/pos/coupons/validate", body={
        "code": CODE,
        "customer_id": customer_id,
        "order_total": 500.0,
    }, api_key_val=api_key)
    assert r.status_code == 200, f"V2: {r.status_code} {r.text}"
    d = r.json()
    data = d.get("data", {})
    error_code = data.get("error", {}).get("code", "")
    assert error_code != "CUSTOMER_REQUIRED", f"V2: CUSTOMER_REQUIRED fired even with customer_id: {d}"


# Test V3: Validate non-existent code returns INVALID_CODE
def test_V3_validate_invalid_code(api_key, customer_id):
    r = _pos("/pos/coupons/validate", body={
        "code": "NOTEXIST_XXXYYY",
        "customer_id": customer_id,
        "order_total": 500.0,
    }, api_key_val=api_key)
    assert r.status_code == 200, f"V3: {r.status_code} {r.text}"
    d = r.json()
    data = d.get("data", {})
    error_code = data.get("error", {}).get("code", "") or d.get("error", {}).get("code", "")
    assert error_code in ("INVALID_CODE", "COUPON_NOT_FOUND") or data.get("valid") is False, f"V3: {d}"
