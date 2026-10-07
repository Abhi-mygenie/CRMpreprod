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


@pytest.fixture(scope="module")
def customer_token():
    """P5 — skip-otp with pre-existing password-having customer (test_restaurant/1234567890)."""
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": "1234567890", "restaurant_id": "test_restaurant"}, timeout=30)
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


def test_p5_skip_otp_second_phone():
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": "8888888888", "restaurant_id": "test_restaurant"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("data", {}).get("token"), r.json()


# ---------- P6: /auth/me returns Security Researcher, no password_hash ----------
def test_p6_me_with_token(customer_token):
    r = requests.get(f"{BASE_URL}{ME}",
                     headers={"Authorization": f"Bearer {customer_token}"}, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    data = body.get("data") or {}
    assert data.get("name") == "Security Researcher", f"unexpected name: {data.get('name')} full={body}"
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
    r = requests.post(f"{BASE_URL}{SKIP_OTP}",
                      json={"phone": "9876543210", "restaurant_id": "689"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json().get("data", {}).get("token"), r.json()
