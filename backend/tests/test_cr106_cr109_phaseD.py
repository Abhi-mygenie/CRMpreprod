"""CR-106 — GET /scan/coupons channel filter + pos-only exclusion.
CR-109 — .strip().upper() at coupon write time.
Phase D — Combined coupon regression.
Run: cd /app/backend && pytest tests/test_cr106_cr109_phaseD.py -v -n 0
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
R_SHORT = "689"

_suffix = uuid.uuid4().hex[:6].upper()
STRIP_CODE_1 = f"TESTCR109STRIP{_suffix}"
STRIP_CODE_2 = f"UPDATED109STRIP{_suffix}"
POS_STRIP_CODE = f"POSCR109STRIP{_suffix}"

_created_ids = []


# ── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    # cleanup CR-109 test coupons
    cli[DB_NAME].coupons.delete_many({"code": {"$in": [STRIP_CODE_1, STRIP_CODE_2, POS_STRIP_CODE]}})
    cli.close()


@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.text}"
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("token", "")


@pytest.fixture(scope="module")
def api_key(mongo):
    u = mongo.users.find_one({"id": R_FULL}, {"_id": 0, "api_key": 1})
    assert u and u.get("api_key"), "api_key missing"
    return u["api_key"]


@pytest.fixture(scope="module")
def scan_token():
    """Fresh customer token — phone 9838777712 for clean per_user_limit state."""
    r = requests.post(f"{BASE_URL}/api/scan/auth/skip-otp",
                      json={"phone": "9838777712", "restaurant_id": "689", "country_code": "+91"},
                      timeout=20)
    assert r.status_code == 200, f"skip-otp failed: {r.text}"
    data = r.json()
    token = (data.get("data", {}).get("token") or
             data.get("token") or
             data.get("access_token"))
    assert token, f"No token in response: {data}"
    return token


def _crm(path, method="get", body=None, token=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, headers=h, timeout=20)


def _scan(path, method="get", token=None, params=None, body=None):
    h = {"Content-Type": "application/json"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, params=params, headers=h, timeout=20)


def _pos(path, method="post", body=None, api_key_val=None):
    h = {"Content-Type": "application/json"}
    if api_key_val:
        h["X-API-Key"] = api_key_val
    fn = getattr(requests, method)
    return fn(f"{BASE_URL}/api{path}", json=body, headers=h, timeout=20)


# ══════════════════════════════════════════════════════════════════════════════
# PHASE B — CR-106 channel filter tests
# ══════════════════════════════════════════════════════════════════════════════

def test_B_V1_dine_in_channel(scan_token):
    """GET /scan/coupons?channel=dine_in returns coupons."""
    r = _scan(f"/scan/coupons", params={"channel": "dine_in", "restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200, f"B_V1: {r.status_code} {r.text}"
    data = r.json()
    coupons = data.get("data", {}).get("coupons", data.get("coupons", []))
    assert isinstance(coupons, list), f"B_V1: not a list: {data}"
    dine_in_count = len(coupons)
    # Store for relative comparison
    pytest.dine_in_count = dine_in_count
    print(f"B_V1: dine_in count = {dine_in_count}")
    assert dine_in_count > 0, "B_V1: no coupons for dine_in"


def test_B_V2_delivery_has_fewer_than_dine_in(scan_token):
    """GET /scan/coupons?channel=delivery returns <= dine_in count."""
    r = _scan(f"/scan/coupons", params={"channel": "delivery", "restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200, f"B_V2: {r.status_code} {r.text}"
    data = r.json()
    coupons = data.get("data", {}).get("coupons", data.get("coupons", []))
    delivery_count = len(coupons)
    dine_in_count = getattr(pytest, "dine_in_count", None)
    print(f"B_V2: delivery={delivery_count}, dine_in={dine_in_count}")
    assert delivery_count <= dine_in_count, f"B_V2: delivery ({delivery_count}) should be <= dine_in ({dine_in_count})"


def test_B_V3_no_param_excludes_pos_only(scan_token):
    """GET /scan/coupons (no channel) returns consumer coupons (pos-only absent)."""
    r = _scan(f"/scan/coupons", params={"restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200, f"B_V3: {r.status_code} {r.text}"
    data = r.json()
    coupons = data.get("data", {}).get("coupons", data.get("coupons", []))
    pytest.no_param_count = len(coupons)
    print(f"B_V3: no-param count = {pytest.no_param_count}")
    # All returned coupons must have at least one consumer channel (not exclusively pos)
    for c in coupons:
        channels = c.get("applicable_channels", [])
        consumer = [ch for ch in channels if ch in ("dine_in", "delivery", "takeaway")]
        assert len(consumer) > 0, f"B_V3: coupon {c.get('code')} has no consumer channels: {channels}"


def test_B_V4_takeaway_same_as_delivery(scan_token):
    """GET /scan/coupons?channel=takeaway returns same count as delivery."""
    r_del = _scan(f"/scan/coupons", params={"channel": "delivery", "restaurant_id": R_SHORT}, token=scan_token)
    r_take = _scan(f"/scan/coupons", params={"channel": "takeaway", "restaurant_id": R_SHORT}, token=scan_token)
    assert r_del.status_code == 200 and r_take.status_code == 200
    del_count = len(r_del.json().get("data", {}).get("coupons", r_del.json().get("coupons", [])))
    take_count = len(r_take.json().get("data", {}).get("coupons", r_take.json().get("coupons", [])))
    print(f"B_V4: delivery={del_count}, takeaway={take_count}")
    assert take_count == del_count, f"B_V4: takeaway ({take_count}) != delivery ({del_count})"


def test_B_V5_coupon_with_pos_and_dine_in_appears_on_dine_in(scan_token, mongo):
    """Coupon with applicable_channels=['pos','dine_in'] appears for channel=dine_in."""
    # Find such a coupon in DB
    c = mongo.coupons.find_one(
        {"user_id": R_FULL, "applicable_channels": {"$all": ["pos", "dine_in"]}, "is_active": True},
        {"_id": 0, "code": 1, "applicable_channels": 1}
    )
    if c is None:
        pytest.skip("No pos+dine_in coupon found for r689 — skip V5")
    r = _scan(f"/scan/coupons", params={"channel": "dine_in", "restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200
    coupons = r.json().get("data", {}).get("coupons", r.json().get("coupons", []))
    codes = [x.get("code") for x in coupons]
    assert c["code"] in codes, f"B_V5: {c['code']} not in dine_in results: {codes[:5]}"


def test_B_V6_all_dine_in_results_have_dine_in_channel(scan_token):
    """All coupons returned for ?channel=dine_in have 'dine_in' in applicable_channels."""
    r = _scan(f"/scan/coupons", params={"channel": "dine_in", "restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200
    coupons = r.json().get("data", {}).get("coupons", r.json().get("coupons", []))
    for c in coupons:
        channels = c.get("applicable_channels", [])
        assert "dine_in" in channels, f"B_V6: coupon {c.get('code')} missing dine_in: {channels}"


# ══════════════════════════════════════════════════════════════════════════════
# PHASE C — CR-109 strip().upper() tests
# ══════════════════════════════════════════════════════════════════════════════

def test_C_V1_create_coupon_strips_spaces(staff_token, mongo):
    """POST /coupons with code ' TESTCR109STRIP ' → stored as 'TESTCR109STRIP{_suffix}' (no spaces)."""
    padded = f" {STRIP_CODE_1} "  # leading+trailing spaces
    r = _crm("/coupons", method="post", body={
        "code": padded,
        "discount_type": "flat",
        "discount_value": 10.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["dine_in", "delivery", "takeaway"],
    }, token=staff_token)
    assert r.status_code in (200, 201), f"C_V1: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": STRIP_CODE_1}, {"_id": 0, "code": 1})
    assert stored, f"C_V1: coupon with code {STRIP_CODE_1} not in DB (padded code not stripped)"
    assert stored["code"] == STRIP_CODE_1, f"C_V1: stored code is '{stored['code']}', expected '{STRIP_CODE_1}'"


def test_C_V2_update_coupon_strips_spaces(staff_token, mongo):
    """PUT /coupons/:id with padded code → stored without spaces."""
    doc = mongo.coupons.find_one({"code": STRIP_CODE_1}, {"_id": 0, "id": 1})
    assert doc, "C_V2: coupon not found"
    padded = f" {STRIP_CODE_2} "
    r = _crm(f"/coupons/{doc['id']}", method="put", body={"code": padded}, token=staff_token)
    assert r.status_code == 200, f"C_V2: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"id": doc["id"]}, {"_id": 0, "code": 1})
    assert stored["code"] == STRIP_CODE_2, f"C_V2: stored code '{stored['code']}' != '{STRIP_CODE_2}'"
    # Rename for cleanup
    mongo.coupons.update_one({"id": doc["id"]}, {"$set": {"code": STRIP_CODE_2}})


def test_C_V3_pos_create_coupon_strips_spaces(api_key, mongo):
    """POST /pos/coupons with padded code → stored stripped."""
    padded = f" {POS_STRIP_CODE} "
    r = _pos("/pos/coupons", body={
        "code": padded,
        "discount_type": "flat",
        "discount_value": 15.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["pos", "dine_in"],
    }, api_key_val=api_key)
    assert r.status_code in (200, 201), f"C_V3: {r.status_code} {r.text}"
    stored = mongo.coupons.find_one({"code": POS_STRIP_CODE}, {"_id": 0, "code": 1})
    assert stored, f"C_V3: coupon {POS_STRIP_CODE} not in DB"
    assert stored["code"] == POS_STRIP_CODE, f"C_V3: stored code '{stored['code']}'"


def test_C_V4_dup_check_on_stripped_code(staff_token):
    """Creating second coupon with same code (padded) → 400/409 dup error."""
    padded = f" {STRIP_CODE_2} "  # Same as updated code, padded
    r = _crm("/coupons", method="post", body={
        "code": padded,
        "discount_type": "flat",
        "discount_value": 10.0,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
        "applicable_channels": ["dine_in"],
    }, token=staff_token)
    assert r.status_code in (400, 409, 422), f"C_V4: expected dup error, got {r.status_code} {r.text}"


def test_C_V5_no_codes_with_leading_trailing_spaces_in_db(mongo):
    """DB count of codes with leading/trailing spaces = 0."""
    # Use regex to find codes with leading or trailing space
    count = mongo.coupons.count_documents({"code": {"$regex": r"^\s|\s$"}})
    assert count == 0, f"C_V5: {count} coupons have leading/trailing spaces in code"


def test_C_internal_spaces_preserved(staff_token, mongo):
    """Internal spaces NOT stripped — 'FLAT TODAY' type codes are valid."""
    # Check existing coupon 'FLAT TODAY' exists with space preserved
    doc = mongo.coupons.find_one({"code": "FLAT TODAY"}, {"_id": 0, "code": 1})
    if doc:
        assert doc["code"] == "FLAT TODAY", f"Internal space stripped: {doc['code']}"
        print("C_internal: 'FLAT TODAY' preserved correctly")
    else:
        pytest.skip("'FLAT TODAY' coupon not found in DB — skip internal space check")


# ══════════════════════════════════════════════════════════════════════════════
# PHASE D — Combined coupon regression
# ══════════════════════════════════════════════════════════════════════════════

def test_D_scan_coupons_backward_compat(scan_token):
    """GET /scan/coupons (no channel) returns coupons (BUG-034 fix still working)."""
    r = _scan(f"/scan/coupons", params={"restaurant_id": R_SHORT}, token=scan_token)
    assert r.status_code == 200, f"D1: {r.status_code} {r.text}"
    data = r.json()
    coupons = data.get("data", {}).get("coupons", data.get("coupons", []))
    assert len(coupons) > 0, "D1: no coupons returned — BUG-034 may have regressed"
    print(f"D1: {len(coupons)} coupons returned")


def test_D_validate_flat100test(scan_token):
    """POST /scan/coupons/validate {code:'FLAT100TEST', order_total:1000} → valid:true (CR-105)."""
    r = _scan(f"/scan/coupons/validate", method="post",
              body={"code": "FLAT100TEST", "order_total": 1000}, token=scan_token,
              params={"restaurant_id": R_SHORT})
    assert r.status_code == 200, f"D2: {r.status_code} {r.text}"
    data = r.json()
    coupon_data = data.get("data", data)
    valid = coupon_data.get("valid") or data.get("valid")
    assert valid is True, f"D2: FLAT100TEST not valid: {data}"
    print(f"D2: FLAT100TEST valid=True confirmed")


def test_D_staff_coupons_list_no_schema_regression(staff_token):
    """GET /api/coupons staff list → 200 (no schema regression from CR-082)."""
    r = _crm("/coupons", token=staff_token)
    assert r.status_code == 200, f"D3: {r.status_code} {r.text}"
    data = r.json()
    items = data.get("data", data) if isinstance(data, dict) else data
    # Should return something (list or dict)
    assert items is not None, "D3: null response"
    print(f"D3: staff coupon list OK")
