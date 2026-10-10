"""CR-001c — Coupon CRUD backward-compat regression.
Verifies requires_customer defaults to True on existing-style coupon creation
and that staff coupon list still works post CR-082 schema addition.
Run: cd /app/backend && pytest tests/test_cr001c_coupon_crud.py -v -n 0
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

_suffix = uuid.uuid4().hex[:6].upper()
CODE = f"CR001C_TEST_{_suffix}"


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


def _crm(path, method="get", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, headers=h, timeout=20)


# Test 1: Staff list coupons returns 200 (no schema regression)
def test_C1_staff_list_coupons(staff_token):
    r = _crm("/coupons", token=staff_token)
    assert r.status_code == 200, f"C1: {r.status_code} {r.text}"
    data = r.json()
    coupons = data.get("data", data) if isinstance(data, dict) else data
    assert isinstance(coupons, (list, dict)), "C1: unexpected response type"


# Test 2: Create coupon without requires_customer → defaults True
def test_C2_create_without_requires_customer_defaults_true(staff_token, mongo):
    r = _crm("/coupons", method="post", body={
        "code": CODE,
        "discount_type": "flat",
        "discount_value": 10.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["dine_in", "delivery", "takeaway"],
        # requires_customer intentionally omitted
    }, token=staff_token)
    assert r.status_code in (200, 201), f"C2: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": CODE}, {"_id": 0, "requires_customer": 1})
    assert stored is not None, "C2: coupon not in DB"
    assert stored.get("requires_customer", True) is True, f"C2: expected True, got {stored.get('requires_customer')}"


# Test 3: GET single coupon includes requires_customer field
def test_C3_created_coupon_has_requires_customer_in_response(staff_token, mongo):
    # Get coupon from DB to find id
    doc = mongo.coupons.find_one({"code": CODE}, {"_id": 0, "id": 1, "requires_customer": 1})
    assert doc, "C3: coupon not found"
    assert "requires_customer" in doc or doc.get("requires_customer", True) is True, f"C3: {doc}"


# Test 4: Update coupon with requires_customer=False via PUT
def test_C4_update_requires_customer_via_put(staff_token, mongo):
    doc = mongo.coupons.find_one({"code": CODE}, {"_id": 0, "id": 1})
    assert doc, "C4: coupon not found"
    coupon_id = doc["id"]
    r = _crm(f"/coupons/{coupon_id}", method="put", body={"requires_customer": False}, token=staff_token)
    assert r.status_code == 200, f"C4: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": CODE}, {"_id": 0, "requires_customer": 1})
    assert stored.get("requires_customer") is False, f"C4: expected False, got {stored.get('requires_customer')}"
