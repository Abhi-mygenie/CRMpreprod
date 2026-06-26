"""
CR-030 Freshmarketer Webhook v2 Tests
Tests that the endpoint accepts raw Freshmarketer format (no Body wrapper).
All tests use the new unwrapped payload format after the fix.
"""
import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API_KEY = "dp_live_8ZfL5L5earF4lX8fMWZ_THMDRHxNHzERaHb7Q_zfGks"

HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": API_KEY,
}

# The exact payload from the user's bug report
USER_EXACT_PAYLOAD = {
    "event_type": "List",
    "event": "list.add_contact",
    "id": "812db6e0-test-exact-user-payload",
    "data": {
        "contact": {
            "mobile": "7602832329",
            "first_name": "Parth",
        },
        "event_details": {
            "list_id": 100,
            "contact_id": 200,
        },
        "custom_data": {
            "country_code": 91,
            "mobile": 7602832329,
            "name": "Parth",
            "template_id": "64da2a07-7a73-49a9-8e0c-7b7545623215",
        },
    },
    "event_time": 1782486954495,
    "event_category": "List",
}


class TestWebhookRawFormat:
    """POST /api/pos/webhook — must accept raw Freshmarketer format (no Body wrapper)"""

    def test_exact_user_payload_returns_200(self):
        """The exact payload the user showed MUST return 200 (was 422 before fix).
        TEMPLATE_NOT_FOUND is expected (template doesn't exist for this user) — not a bug.
        Key assertion: status code is 200, not 422.
        """
        payload = {**USER_EXACT_PAYLOAD, "id": f"812db6e0-exact-{uuid.uuid4().hex[:8]}"}
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"Expected 200 (not 422), got {resp.status_code}: {resp.text}"
        data = resp.json()
        # TEMPLATE_NOT_FOUND is correct — template doesn't exist for this test user
        assert "TEMPLATE_NOT_FOUND" in str(data) or "template" in str(data).lower()
        print(f"PASS: exact user payload returned 200 (TEMPLATE_NOT_FOUND as expected). Response: {data}")

    def test_template_not_found_for_user_payload_template(self):
        """Template 64da2a07-... does NOT exist for this user — TEMPLATE_NOT_FOUND is expected."""
        payload = {**USER_EXACT_PAYLOAD, "id": f"812db6e0-tmpl-{uuid.uuid4().hex[:8]}"}
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"Expected 200 (not 422), got {resp.status_code}: {resp.text}"
        data = resp.json()
        # Either TEMPLATE_NOT_FOUND in data or success=False with message
        resp_str = str(resp.text).lower()
        assert "template" in resp_str or "not_found" in resp_str.lower() or not data.get("success")
        print(f"PASS: template not found handled correctly. Response: {data}")

    def test_no_422_on_integer_event_time(self):
        """event_time as integer must not cause 422."""
        payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"test-int-evttime-{uuid.uuid4().hex[:8]}",
            "data": {
                "custom_data": {
                    "mobile": "9999999999",
                    "country_code": 91,
                    "template_id": "nonexistent-template-id",
                }
            },
            "event_time": 1782486954495,
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"422 still happening: {resp.text}"
        print(f"PASS: integer event_time accepted. Status: {resp.status_code}")

    def test_no_422_on_string_event_time(self):
        """event_time as ISO string must not cause 422."""
        payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"test-str-evttime-{uuid.uuid4().hex[:8]}",
            "data": {
                "custom_data": {
                    "mobile": "9999999999",
                    "country_code": "91",
                    "template_id": "nonexistent-template-id",
                }
            },
            "event_time": "2025-01-01T00:00:00Z",
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"422 still happening: {resp.text}"
        print(f"PASS: string event_time accepted. Status: {resp.status_code}")

    def test_no_422_on_integer_list_id_contact_id(self):
        """event_details.list_id and contact_id as integers must not cause 422."""
        payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"test-int-ids-{uuid.uuid4().hex[:8]}",
            "data": {
                "event_details": {"list_id": 100, "contact_id": 200},
                "custom_data": {
                    "mobile": "9999999999",
                    "country_code": 91,
                    "template_id": "nonexistent-template-id",
                },
            },
            "event_time": 1782486954495,
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"422 still happening: {resp.text}"
        print(f"PASS: integer list_id/contact_id accepted. Status: {resp.status_code}")

    def test_body_wrapper_removed_not_needed(self):
        """Old wrapped format {Headers, Body} must NOT be required — sending raw payload must work."""
        raw_payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"raw-format-test-{uuid.uuid4().hex[:8]}",
            "data": {
                "custom_data": {
                    "mobile": "9876543210",
                    "country_code": 91,
                    "template_id": "nonexistent-id",
                }
            },
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=raw_payload, headers=HEADERS)
        # Must not 422 — the model no longer needs a Body wrapper
        assert resp.status_code != 422, f"422 Unprocessable Entity — Body wrapper still required: {resp.text}"
        assert resp.status_code == 200, f"Unexpected status: {resp.status_code}: {resp.text}"
        print(f"PASS: raw payload accepted (no Body wrapper needed). Status: {resp.status_code}")


class TestWebhookIdempotency:
    """POST /api/pos/webhook — idempotency still works after fix"""

    def test_idempotency_same_id_returns_replayed(self):
        """Second call with same webhook id must return status:replayed.
        Using an unsupported event which always logs to webhook_logs regardless of template.
        """
        webhook_id = f"idem-ignored-{uuid.uuid4().hex}"
        payload = {
            "event_type": "Contact",
            "event": "contact.updated",  # unsupported — always logged
            "id": webhook_id,
            "data": {},
        }
        # First call — logged as ignored
        r1 = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert r1.status_code == 200, f"First call failed: {r1.text}"
        d1 = r1.json()
        assert (d1.get("data") or {}).get("status") == "ignored", f"First call: {d1}"
        # Second call — must be replayed (idempotency on webhook_id)
        r2 = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert r2.status_code == 200, f"Second call failed: {r2.text}"
        data2 = r2.json()
        inner = data2.get("data") or {}
        assert inner.get("status") == "replayed", f"Expected status:replayed, got: {data2}"
        print(f"PASS: idempotency works — second call returned status:replayed")


class TestWebhookEventFiltering:
    """POST /api/pos/webhook — unsupported events still return status:ignored"""

    def test_unsupported_event_returns_ignored(self):
        """Unsupported event type must return status:ignored."""
        payload = {
            "event_type": "Contact",
            "event": "contact.updated",
            "id": f"unsupported-evt-{uuid.uuid4().hex[:8]}",
            "data": {},
            "event_time": 1782486954495,
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        inner = data.get("data") or {}
        assert inner.get("status") == "ignored", f"Expected status:ignored, got: {data}"
        print(f"PASS: unsupported event returned status:ignored")


class TestWebhookValidationErrors:
    """POST /api/pos/webhook — required field validation"""

    def test_missing_template_id_returns_template_id_required(self):
        """custom_data without template_id must return TEMPLATE_ID_REQUIRED."""
        payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"no-tmpl-{uuid.uuid4().hex[:8]}",
            "data": {
                "custom_data": {
                    "mobile": "9000000002",
                    "country_code": 91,
                    # No template_id
                }
            },
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "TEMPLATE_ID_REQUIRED" in str(data) or "template" in str(data).lower(), \
            f"Expected TEMPLATE_ID_REQUIRED, got: {data}"
        print(f"PASS: missing template_id → TEMPLATE_ID_REQUIRED. Response: {data}")

    def test_missing_mobile_returns_mobile_required(self):
        """custom_data without mobile must return MOBILE_REQUIRED."""
        payload = {
            "event_type": "List",
            "event": "list.add_contact",
            "id": f"no-mobile-{uuid.uuid4().hex[:8]}",
            "data": {
                "custom_data": {
                    "country_code": 91,
                    "template_id": "some-template-id",
                    # No mobile
                }
            },
        }
        resp = requests.post(f"{BASE_URL}/api/pos/webhook", json=payload, headers=HEADERS)
        assert resp.status_code == 200
        data = resp.json()
        assert "MOBILE_REQUIRED" in str(data) or "mobile" in str(data).lower(), \
            f"Expected MOBILE_REQUIRED, got: {data}"
        print(f"PASS: missing mobile → MOBILE_REQUIRED. Response: {data}")


class TestRegressionChecks:
    """Regression: other POS endpoints still work after model change"""

    def test_get_templates_still_works(self):
        """GET /api/pos/templates must still return 200."""
        resp = requests.get(f"{BASE_URL}/api/pos/templates", headers=HEADERS)
        assert resp.status_code == 200, f"Regression in GET /api/pos/templates: {resp.text}"
        data = resp.json()
        assert data.get("success") is True
        print(f"PASS: GET /api/pos/templates still works")

    def test_direct_send_missing_template_returns_not_found(self):
        """POST /api/pos/send with unknown template returns 200 with TEMPLATE_NOT_FOUND."""
        payload = {
            "mobile": "9999999999",
            "country_code": "91",
            "template_id": "nonexistent-template-regression",
        }
        resp = requests.post(f"{BASE_URL}/api/pos/send", json=payload, headers=HEADERS)
        assert resp.status_code == 200, f"Regression in POST /api/pos/send: {resp.text}"
        data = resp.json()
        assert "TEMPLATE_NOT_FOUND" in str(data) or not data.get("success")
        print(f"PASS: POST /api/pos/send regression check passed")
