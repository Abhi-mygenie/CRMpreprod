"""
CR-030: Freshmarketer Webhook endpoint tests
POST /api/pos/webhook — tests for envelope parsing, validation, idempotency,
event filtering, regression tests for DirectSend and templates.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API_KEY = "dp_live_8ZfL5L5earF4lX8fMWZ_THMDRHxNHzERaHb7Q_zfGks"

AUTH_HEADERS = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
}

# Full Freshmarketer envelope template
def build_fm_payload(
    event="list.add_contact",
    body_id=None,
    mobile=7602832329,  # int — must be coerced to str
    country_code=91,     # int — must be coerced to str
    template_id="SOME_TEMPLATE",
    mobile_in_contact=None,   # if set, remove from custom_data and put here
    remove_mobile=False,
    remove_template_id=False,
    extra_custom_data=None,
):
    body_id = body_id or str(uuid.uuid4())
    custom_data: dict = {
        "country_code": country_code,
        "name": "Test User",
    }
    if not remove_mobile:
        custom_data["mobile"] = mobile
    if not remove_template_id:
        custom_data["template_id"] = template_id
    if extra_custom_data:
        custom_data.update(extra_custom_data)

    contact = {
        "first_name": "Test",
        "last_name": "User",
        "mobile": mobile_in_contact,
    }

    return {
        "Headers": {
            "X-API-Key": API_KEY,
            "Content-Type": "application/json",
        },
        "Body": {
            "event_type": "contact_list",
            "event": event,
            "event_category": "contact",
            "event_time": "2025-01-01T00:00:00Z",
            "id": body_id,
            "data": {
                "contact": contact,
                "event_details": {
                    "list_id": 123,
                    "contact_id": 456,
                },
                "custom_data": custom_data,
            },
        },
    }


# ── Health Check ───────────────────────────────────────────────────────────────

class TestHealth:
    """Backend health check"""

    def test_health_endpoint(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200, f"Health check failed: {r.text}"
        data = r.json()
        assert data.get("status") in ("ok", "healthy", True, "running"), f"Unexpected status: {data}"
        print("PASS: /api/health OK")


# ── Authentication ─────────────────────────────────────────────────────────────

class TestAuth:
    """Auth tests for /api/pos/webhook"""

    def test_webhook_401_without_api_key(self):
        """POST /webhook without X-API-Key must return 401"""
        payload = build_fm_payload()
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, timeout=10)
        assert r.status_code == 401, f"Expected 401 without key, got {r.status_code}: {r.text}"
        print("PASS: 401 when X-API-Key missing")

    def test_webhook_401_with_wrong_key(self):
        """POST /webhook with wrong key returns 401"""
        payload = build_fm_payload()
        r = requests.post(
            f"{BASE_URL}/api/pos/webhook",
            json=payload,
            headers={"X-API-Key": "INVALID_KEY", "Content-Type": "application/json"},
            timeout=10,
        )
        assert r.status_code == 401, f"Expected 401 with wrong key, got {r.status_code}: {r.text}"
        print("PASS: 401 with wrong key")


# ── Unsupported Event Type ─────────────────────────────────────────────────────

class TestEventFiltering:
    """Unsupported events should be logged and return success:true status:ignored"""

    def test_unsupported_event_list_remove_contact(self):
        """list.remove_contact must return success:true with status:ignored"""
        unique_id = f"TEST_ignore_{uuid.uuid4().hex[:8]}"
        payload = build_fm_payload(event="list.remove_contact", body_id=unique_id)
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True, f"Expected success:true, got: {data}"
        resp_data = data.get("data", {})
        assert resp_data.get("status") == "ignored", f"Expected status:ignored, got: {resp_data}"
        print(f"PASS: list.remove_contact ignored, webhook_id={unique_id}")

    def test_unsupported_event_other(self):
        """Random event type must return success:true with status:ignored"""
        unique_id = f"TEST_ignore_{uuid.uuid4().hex[:8]}"
        payload = build_fm_payload(event="contact.update", body_id=unique_id)
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True
        assert data.get("data", {}).get("status") == "ignored"
        print("PASS: contact.update ignored")


# ── Idempotency ────────────────────────────────────────────────────────────────

class TestIdempotency:
    """Second call with same Body.id must return status:replayed"""

    def test_idempotency_replay(self):
        """First call: ignored (list.remove_contact). Second call: status:replayed."""
        unique_id = f"TEST_idem_{uuid.uuid4().hex[:8]}"
        payload = build_fm_payload(event="list.remove_contact", body_id=unique_id)

        # First call
        r1 = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r1.status_code == 200, f"First call failed: {r1.text}"
        d1 = r1.json()
        assert d1.get("success") is True
        print(f"  First call status: {d1.get('data', {}).get('status')}")

        # Second call with same Body.id
        r2 = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r2.status_code == 200, f"Second call failed: {r2.text}"
        d2 = r2.json()
        assert d2.get("success") is True, f"Expected success:true on replay, got: {d2}"
        assert d2.get("data", {}).get("status") == "replayed", (
            f"Expected status:replayed on second call, got: {d2.get('data')}"
        )
        print(f"PASS: Idempotency — second call returned status:replayed for id={unique_id}")


# ── Validation Errors ──────────────────────────────────────────────────────────

class TestValidation:
    """Validation: missing mobile, missing template_id, etc."""

    def test_mobile_required_when_both_missing(self):
        """MOBILE_REQUIRED when neither custom_data.mobile nor contact.mobile present"""
        payload = build_fm_payload(remove_mobile=True, mobile_in_contact=None)
        # Also null out contact mobile
        payload["Body"]["data"]["contact"]["mobile"] = None
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Expected 200 with error body, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is False
        assert data.get("data", {}).get("error") == "MOBILE_REQUIRED", (
            f"Expected MOBILE_REQUIRED, got: {data.get('data')}"
        )
        print("PASS: MOBILE_REQUIRED when both mobile fields missing")

    def test_template_id_required_when_missing(self):
        """TEMPLATE_ID_REQUIRED when custom_data.template_id absent"""
        payload = build_fm_payload(remove_template_id=True)
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is False
        assert data.get("data", {}).get("error") == "TEMPLATE_ID_REQUIRED", (
            f"Expected TEMPLATE_ID_REQUIRED, got: {data.get('data')}"
        )
        print("PASS: TEMPLATE_ID_REQUIRED when template_id missing")

    def test_mobile_fallback_from_contact(self):
        """When custom_data.mobile missing but contact.mobile present, use contact.mobile"""
        # We'll use remove_mobile=True and set mobile_in_contact
        # Still expect TEMPLATE_NOT_FOUND because template_id is bogus — but NOT MOBILE_REQUIRED
        payload = build_fm_payload(
            remove_mobile=True,
            mobile_in_contact="9876543210",
            template_id="BOGUS_TEMPLATE_" + uuid.uuid4().hex[:6],
        )
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        # Should NOT be MOBILE_REQUIRED — mobile came from contact
        assert data.get("data", {}).get("error") != "MOBILE_REQUIRED", (
            f"Mobile fallback failed: got MOBILE_REQUIRED but contact.mobile was set: {data}"
        )
        # Should be TEMPLATE_NOT_FOUND (because we passed bogus template)
        assert data.get("data", {}).get("error") == "TEMPLATE_NOT_FOUND", (
            f"Expected TEMPLATE_NOT_FOUND after mobile fallback, got: {data}"
        )
        print("PASS: mobile fallback from contact.mobile works")

    def test_int_mobile_coerced_to_str(self):
        """mobile sent as int (7602832329) must be accepted and coerced to str"""
        # This should reach TEMPLATE_NOT_FOUND (not a parse error)
        payload = build_fm_payload(
            mobile=7602832329,   # int
            country_code=91,     # int
            template_id="BOGUS_" + uuid.uuid4().hex[:6],
        )
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        # Should not fail with parsing/validation error, should fail with TEMPLATE_NOT_FOUND
        err = data.get("data", {}).get("error", "")
        assert err == "TEMPLATE_NOT_FOUND", (
            f"Expected TEMPLATE_NOT_FOUND (int coercion worked), got error: {err}, full: {data}"
        )
        print("PASS: int mobile/country_code coerced to str successfully")

    def test_template_not_found_for_unknown_template_id(self):
        """TEMPLATE_NOT_FOUND returned for unknown/bogus template_id"""
        payload = build_fm_payload(template_id="unknown_template_" + uuid.uuid4().hex)
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is False
        assert data.get("data", {}).get("error") == "TEMPLATE_NOT_FOUND", (
            f"Expected TEMPLATE_NOT_FOUND, got: {data}"
        )
        print("PASS: TEMPLATE_NOT_FOUND for unknown template_id")


# ── AUTHKEY_WID_MISSING ────────────────────────────────────────────────────────

class TestAuthkeyWidMissing:
    """When a valid template_id exists but authkey_wid is empty → AUTHKEY_WID_MISSING"""

    def get_valid_template_id(self):
        """Fetch a valid template from the templates endpoint"""
        r = requests.get(f"{BASE_URL}/api/pos/templates", headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Templates endpoint failed: {r.text}"
        data = r.json()
        templates = data.get("data", {}).get("templates", [])
        if not templates:
            pytest.skip("No templates found for this user — cannot test AUTHKEY_WID_MISSING")
        # Find one with authkey_synced=False (or any template)
        unsynced = [t for t in templates if not t.get("authkey_synced")]
        if unsynced:
            return unsynced[0]["template_id"]
        # All are synced — use any template for test
        return templates[0]["template_id"]

    def test_authkey_wid_missing(self):
        """Valid template_id but template not synced to AuthKey → AUTHKEY_WID_MISSING"""
        template_id = self.get_valid_template_id()
        payload = build_fm_payload(template_id=template_id)
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is False
        err_code = data.get("data", {}).get("error")
        # Either AUTHKEY_WID_MISSING (unsynced) or API_KEY_MISSING (no authkey configured)
        # Both are valid per the test spec context
        assert err_code in ("AUTHKEY_WID_MISSING", "API_KEY_MISSING"), (
            f"Expected AUTHKEY_WID_MISSING or API_KEY_MISSING, got: {data}"
        )
        print(f"PASS: AUTHKEY_WID_MISSING (or API_KEY_MISSING) for template_id={template_id}, error={err_code}")


# ── Regression Tests ───────────────────────────────────────────────────────────

class TestRegression:
    """Regression: DirectSend and Templates endpoints still work after CR-030"""

    def test_get_templates_still_works(self):
        """GET /api/pos/templates still works"""
        r = requests.get(f"{BASE_URL}/api/pos/templates", headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"Templates failed: {r.status_code} {r.text}"
        data = r.json()
        assert data.get("success") is True
        assert "templates" in data.get("data", {})
        print(f"PASS: GET /api/pos/templates — {len(data['data']['templates'])} template(s)")

    def test_post_send_direct_send_still_works(self):
        """POST /api/pos/send with flat JSON still works (regression)"""
        # Fetch a template_id first
        r_tmpl = requests.get(f"{BASE_URL}/api/pos/templates", headers=AUTH_HEADERS, timeout=10)
        templates = r_tmpl.json().get("data", {}).get("templates", [])
        if not templates:
            pytest.skip("No templates — cannot test DirectSend regression")
        template_id = templates[0]["template_id"]

        payload = {
            "mobile": "7602832329",
            "country_code": "91",
            "template_id": template_id,
            "name": "Test User",
        }
        r = requests.post(f"{BASE_URL}/api/pos/send", json=payload, headers=AUTH_HEADERS, timeout=10)
        assert r.status_code == 200, f"DirectSend failed: {r.status_code} {r.text}"
        data = r.json()
        # Any response is valid — AUTHKEY_WID_MISSING, API_KEY_MISSING, or success
        # The key is it doesn't 500 or 422
        assert "success" in data, f"Missing 'success' field in DirectSend response: {data}"
        err_code = data.get("data", {}).get("error", "")
        print(f"PASS: POST /api/pos/send regression — response error code: {err_code or 'sent'}")


# ── Full Valid Envelope Test ───────────────────────────────────────────────────

class TestFullEnvelopeAccepted:
    """POST /webhook accepts full Freshmarketer envelope (Headers + Body structure)"""

    def test_full_envelope_accepted_returns_200(self):
        """Endpoint accepts the full Freshmarketer envelope without 422 parse errors"""
        unique_id = f"TEST_full_{uuid.uuid4().hex[:8]}"
        payload = {
            "Headers": {
                "X-API-Key": API_KEY,
                "Content-Type": "application/json",
            },
            "Body": {
                "event_type": "contact_list",
                "event": "list.add_contact",
                "event_category": "contact",
                "event_time": "2025-01-01T00:00:00Z",
                "id": unique_id,
                "data": {
                    "contact": {
                        "mobile": "9876543210",
                        "first_name": "John",
                        "last_name": "Doe",
                        "email": "john@example.com",
                    },
                    "event_details": {
                        "list_id": 999,
                        "contact_id": 111,
                    },
                    "custom_data": {
                        "country_code": 91,
                        "mobile": 7602832329,
                        "template_id": "BOGUS_TMPL_" + uuid.uuid4().hex[:6],
                        "name": "John Doe",
                    },
                },
            },
        }
        r = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=AUTH_HEADERS, timeout=10)
        # Must NOT be 422 (parse error) or 500
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        # Success or known error (TEMPLATE_NOT_FOUND, AUTHKEY_WID_MISSING)
        err = data.get("data", {}).get("error", "")
        assert err not in ("", None) or data.get("success") is True, f"Unexpected blank error: {data}"
        print(f"PASS: Full envelope accepted — 200 OK, error={err or 'sent'}")
