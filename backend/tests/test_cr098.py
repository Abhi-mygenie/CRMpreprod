"""QA regression tests for CR-098: customer password register/login routes removed.

Independent verification per /app/memory/crm/crm_roi_sprint/qa/CR_098_QA_HANDOVER.md.
Backend only. Reads owner password from env (SEC-P2-08) — never hardcode.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@thegoankitchen.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]

REG_PATH = "/api/scan/auth/register"
LOGIN_PATH = "/api/scan/auth/login"
SKIP_OTP = "/api/scan/auth/skip-otp"
ME = "/api/scan/auth/me"
PROFILE = "/api/scan/profile"


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def staff_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"staff login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "access_token" in data, data
    return data["access_token"]


@pytest.fixture(scope="module")
def staff_headers(staff_token):
    return {"Authorization": f"Bearer {staff_token}"}


from pymongo import MongoClient
from dotenv import dotenv_values

_env = dotenv_values("/app/backend/.env")
# BUG-026: the two test_restaurant password-holders (1234567890 / 8888888888) are unreachable by design
# (invalid phones under CR-085-A). Use an existing r689 customer that has country_code set.
SKIP_PHONE = "9838777712"
SKIP_RID = "689"


@pytest.fixture(scope="module")
def mongo():
    cli = MongoClient(_env["MONGO_URL"])
    yield cli[_env["DB_NAME"]]
    cli.close()


@pytest.fixture(scope="module")
def baseline(mongo):
    return mongo.customers.count_documents({})


@pytest.fixture(scope="module")
def customer_token(baseline):
    """P5 — skip-otp is the sole identity path; must match the existing doc, never create."""
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": SKIP_PHONE, "restaurant_id": SKIP_RID}, timeout=30)
    assert r.status_code == 200, f"skip-otp P5 failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    tok = data.get("data", {}).get("token")
    assert tok, f"no token in P5 skip-otp response: {data}"
    return tok


# ---------- P3: register & login routes return 404 ----------
@pytest.mark.parametrize("path", [REG_PATH, LOGIN_PATH])
@pytest.mark.parametrize("body", [
    {},
    {"phone": "1234567890", "password": "whatever", "restaurant_id": "test_restaurant"},
])
def test_p3_register_login_404(path, body):
    r = requests.post(f"{BASE_URL}{path}", json=body, timeout=30)
    assert r.status_code == 404, f"{path} with {body} -> {r.status_code} {r.text[:200]}"
    # P10 partial: body is standard Not Found
    try:
        j = r.json()
        assert j == {"detail": "Not Found"}, f"unexpected 404 body: {j}"
    except ValueError:
        pytest.fail(f"non-JSON 404 body: {r.text[:200]}")


# ---------- P4: skip-otp empty body = 422 (route alive) ----------
def test_p4_skip_otp_empty_422():
    r = requests.post(f"{BASE_URL}{SKIP_OTP}", json={}, timeout=30)
    assert r.status_code == 422, f"got {r.status_code} {r.text[:200]}"


# ---------- P5: skip-otp with existing password-having customer (no lock-out) ----------
def test_p5_skip_otp_existing_password_customer(customer_token):
    assert customer_token  # fixture asserts shape


def test_p5_skip_otp_second_phone(mongo):
    before = mongo.customers.count_documents({"user_id": f"pos_0001_restaurant_{SKIP_RID}"})
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": "7505242126", "restaurant_id": SKIP_RID}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("data", {}).get("token"), r.json()
    assert mongo.customers.count_documents({"user_id": f"pos_0001_restaurant_{SKIP_RID}"}) == before


def test_p5b_password_holders_unreachable_by_design():
    """BUG-026 / owner Q3: legacy password-holder test phones are invalid → 400, never 500."""
    for ph in ("1234567890", "8888888888"):
        r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                          json={"phone": ph, "restaurant_id": "test_restaurant"}, timeout=30)
        assert r.status_code == 400, f"{ph}: {r.status_code} {r.text[:200]}"


# ---------- P6: /auth/me returns Security Researcher, no password_hash ----------
def test_p6_me_with_token(customer_token):
    r = requests.get(f"{BASE_URL}{ME}",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    data = body.get("data") or {}
    assert data.get("id") and data.get("phone") == SKIP_PHONE, f"unexpected profile: {body}"
    # No password_hash anywhere in response body
    assert "password_hash" not in r.text, f"password_hash leaked in /auth/me: {r.text[:400]}"


# ---------- P6b: /auth/me without token -> 401 or 403 ----------
def test_p6b_me_no_token():
    r = requests.get(f"{BASE_URL}{ME}", timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code} {r.text[:200]}"


# ---------- P7: staff login unaffected (core/auth.py untouched) ----------
def test_p7_staff_login(staff_token):
    assert staff_token


# ---------- P9: scan/profile with customer token + customers list with staff JWT ----------
def test_p9_scan_profile(customer_token):
    r = requests.get(f"{BASE_URL}{PROFILE}",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
    assert r.status_code == 200, r.text


def test_p9_customers_list(staff_headers):
    r = requests.get(f"{BASE_URL}/api/customers?limit=1", headers=staff_headers, timeout=30)
    assert r.status_code == 200, r.text


# ---------- P9b: skip-otp with restaurant_id "689" also 200 ----------
def test_p9b_skip_otp_689():
    # BUG-027: 9876543210@r689 is a legacy doc without country_code → would create a duplicate each run.
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": SKIP_PHONE, "restaurant_id": SKIP_RID}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("data", {}).get("token"), r.json()


def test_zz_customers_count_unchanged(mongo, baseline):
    assert mongo.customers.count_documents({}) == baseline
