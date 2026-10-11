"""QA regression tests for CR-084 (scan OTP removal) and CR-097 (staff password mgmt removal)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://preprod-crm-app-1.preview.emergentagent.com").rstrip("/")
OWNER_EMAIL = os.environ.get("CRM_TEST_OWNER_EMAIL", "owner@thegoankitchen.com")
OWNER_PASSWORD = os.environ["CRM_TEST_OWNER_PASSWORD"]  # SEC-P2-08: never hardcode; see /app/memory/test_credentials.md


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    assert "access_token" in data, data
    assert "mygenie_token" in data, data
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# V1 covered by fixture
def test_v1_login(token):
    assert token


# V2: /api/auth/me
def test_v2_me(auth_headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("email") == OWNER_EMAIL, data


# V3: scan OTP routes must be 404
@pytest.mark.parametrize("path", ["/api/scan/auth/request-otp", "/api/scan/auth/verify-otp"])
def test_v3_scan_otp_removed(path):
    r = requests.post(f"{BASE_URL}{path}", json={"phone": "9876543210"}, timeout=30)
    assert r.status_code == 404, f"{path} returned {r.status_code} {r.text[:200]}"


# V4: staff password mgmt removed
@pytest.mark.parametrize("method,path,needs_auth", [
    ("POST", "/api/auth/forgot-password/request-otp", False),
    ("POST", "/api/auth/forgot-password/verify-otp", False),
    ("POST", "/api/auth/forgot-password/reset", False),
    ("PUT", "/api/auth/reset-password", True),
    ("POST", "/api/auth/register", False),
])
def test_v4_staff_pw_removed(method, path, needs_auth, auth_headers):
    headers = auth_headers if needs_auth else {}
    r = requests.request(method, f"{BASE_URL}{path}", json={}, headers=headers, timeout=30)
    assert r.status_code in (404, 405), f"{method} {path} -> {r.status_code} {r.text[:200]}"


# V5: skip-otp still works
def test_v5a_skip_otp_valid():
    # BUG-027: use an r689 doc that has country_code (9876543210 legacy doc lacks it → duplicate per run)
    r = requests.post(f"{BASE_URL}/api/scan/auth/skip-otp",
                      json={"phone": "9838777712", "restaurant_id": "689"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("data", {}).get("token"), data


def test_v5b_skip_otp_empty_body():
    r = requests.post(f"{BASE_URL}/api/scan/auth/skip-otp", json={}, timeout=30)
    assert r.status_code == 422, f"got {r.status_code} {r.text[:200]}"


# V6: WhatsApp automation events — no reset_password
def test_v6_whatsapp_automation_events(auth_headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/automation/events", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    crm_events = data.get("crm_events") or data.get("data", {}).get("crm_events")
    crm_desc = data.get("crm_descriptions") or data.get("data", {}).get("crm_descriptions")
    assert crm_events is not None, f"missing crm_events: {data}"
    assert len(crm_events) == 15, f"expected 15 got {len(crm_events)}: {crm_events}"
    assert "reset_password" not in crm_events, crm_events
    if crm_desc:
        assert "reset_password" not in crm_desc, crm_desc


def test_v6_whatsapp_message_filters(auth_headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/message-filters", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    assert "reset_password" not in r.text, "reset_password still present in message-filters"


# V12: regression
def test_v12_customers(auth_headers):
    r = requests.get(f"{BASE_URL}/api/customers?limit=1", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text


def test_v12_coupons(auth_headers):
    r = requests.get(f"{BASE_URL}/api/coupons", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
