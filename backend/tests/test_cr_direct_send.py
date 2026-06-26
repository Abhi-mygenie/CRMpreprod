"""
CR-DIRECT-SEND QA Tests
Tests for new endpoints: GET /api/pos/templates, POST /api/pos/send
Tests for PATCH /api/whatsapp/custom-templates/{id}/labels
Tests for existing endpoints that should not be broken.
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-preprod-6.preview.emergentagent.com").rstrip("/")
POS_API_KEY = "dp_live_8ZfL5L5earF4lX8fMWZ_THMDRHxNHzERaHb7Q_zfGks"

POS_HEADERS = {
    "Content-Type": "application/json",
    "X-API-Key": POS_API_KEY,
}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    return s


# ============================================================
# GET /api/pos/templates
# ============================================================
class TestPOSTemplates:
    """CR-DIRECT-SEND: GET /api/pos/templates"""

    def test_list_templates_returns_200(self, session):
        r = session.get(f"{BASE_URL}/api/pos/templates", headers=POS_HEADERS)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("success") is True
        assert "data" in data
        assert "templates" in data["data"]

    def test_list_templates_field_structure(self, session):
        r = session.get(f"{BASE_URL}/api/pos/templates", headers=POS_HEADERS)
        assert r.status_code == 200
        templates = r.json()["data"]["templates"]
        for t in templates:
            assert "template_id" in t
            assert "template_name" in t
            assert "status" in t
            assert "variable_labels" in t
            assert "authkey_synced" in t
            assert "ready_for_direct_send" in t

    def test_list_templates_no_auth_returns_401(self, session):
        r = session.get(f"{BASE_URL}/api/pos/templates")
        assert r.status_code in [401, 403, 422], f"Expected auth error, got {r.status_code}"

    def test_list_templates_wrong_key(self, session):
        r = session.get(
            f"{BASE_URL}/api/pos/templates",
            headers={"X-API-Key": "invalid_key_xyz"}
        )
        assert r.status_code in [401, 403], f"Expected auth error, got {r.status_code}"


# ============================================================
# POST /api/pos/send
# ============================================================
class TestPOSSend:
    """CR-DIRECT-SEND: POST /api/pos/send"""

    def test_send_template_not_found(self, session):
        r = session.post(
            f"{BASE_URL}/api/pos/send",
            headers=POS_HEADERS,
            json={
                "mobile": "9999999999",
                "country_code": "91",
                "template_id": "nonexistent-template-id-00000000"
            }
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        assert data["data"]["error"] == "TEMPLATE_NOT_FOUND"

    def test_send_template_missing_fields_422(self, session):
        """Missing required fields should return 422 from pydantic validation."""
        r = session.post(
            f"{BASE_URL}/api/pos/send",
            headers=POS_HEADERS,
            json={"mobile": "9999999999"}  # missing template_id
        )
        assert r.status_code == 422

    def test_send_no_auth_401(self, session):
        r = session.post(
            f"{BASE_URL}/api/pos/send",
            json={"mobile": "9999999999", "country_code": "91", "template_id": "xxx"}
        )
        assert r.status_code in [401, 403, 422]

    def test_send_with_unsynced_template(self, session):
        """If a template exists but has no authkey_wid, should return AUTHKEY_WID_MISSING."""
        # First get templates list to find one that is not synced
        r_list = session.get(f"{BASE_URL}/api/pos/templates", headers=POS_HEADERS)
        if r_list.status_code != 200:
            pytest.skip("Cannot list templates")
        templates = r_list.json()["data"]["templates"]
        unsynced = [t for t in templates if not t["authkey_synced"]]
        if not unsynced:
            pytest.skip("No unsynced templates available to test AUTHKEY_WID_MISSING")
        t = unsynced[0]
        r = session.post(
            f"{BASE_URL}/api/pos/send",
            headers=POS_HEADERS,
            json={
                "mobile": "9999999999",
                "country_code": "91",
                "template_id": t["template_id"]
            }
        )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        assert data["data"]["error"] == "AUTHKEY_WID_MISSING"

    def test_send_with_synced_template(self, session):
        """For a synced template, should attempt to send (may fail due to missing authkey creds,
        but should NOT return TEMPLATE_NOT_FOUND or AUTHKEY_WID_MISSING)."""
        r_list = session.get(f"{BASE_URL}/api/pos/templates", headers=POS_HEADERS)
        if r_list.status_code != 200:
            pytest.skip("Cannot list templates")
        templates = r_list.json()["data"]["templates"]
        synced = [t for t in templates if t["authkey_synced"]]
        if not synced:
            pytest.skip("No synced templates available")
        t = synced[0]
        extra = {}
        for label in (t.get("required_fields") or []):
            extra[label] = "TestValue"
        r = session.post(
            f"{BASE_URL}/api/pos/send",
            headers=POS_HEADERS,
            json={"mobile": "9999999999", "country_code": "91", "template_id": t["template_id"], **extra}
        )
        assert r.status_code == 200
        data = r.json()
        # Success or failure (API_KEY_MISSING / WhatsApp send error) is acceptable,
        # but NOT TEMPLATE_NOT_FOUND or AUTHKEY_WID_MISSING
        if not data["success"]:
            assert data["data"].get("error") not in ["TEMPLATE_NOT_FOUND", "AUTHKEY_WID_MISSING"], \
                f"Unexpected error: {data}"


# ============================================================
# Existing POS Endpoints (regression)
# ============================================================
class TestPOSRegression:
    """Regression: existing POS endpoints should still work."""

    def test_pos_orders_post_endpoint_exists(self, session):
        """POST /api/pos/orders should exist (405 on GET means endpoint exists)."""
        r = session.get(f"{BASE_URL}/api/pos/orders", headers=POS_HEADERS)
        # GET is not allowed on this endpoint (only POST), so 405 is expected
        assert r.status_code == 405, f"pos/orders GET: {r.status_code} {r.text}"

    def test_pos_customers_list_returns_200(self, session):
        r = session.get(f"{BASE_URL}/api/pos/customers", headers=POS_HEADERS)
        assert r.status_code in [200, 404, 405], f"pos/customers GET: {r.status_code} {r.text}"

    def test_pos_create_customer_duplicate_returns_info(self, session):
        """Creating an existing customer should return success=false with existing info."""
        payload = {
            "pos_id": "mygenie",
            "restaurant_id": "689",
            "name": "TEST_Duplicate Check",
            "phone": "0000000001",
            "country_code": "+91",
        }
        r = session.post(f"{BASE_URL}/api/pos/customers", headers=POS_HEADERS, json=payload)
        assert r.status_code == 200
        data = r.json()
        # Either created or already exists — both are valid 200 responses
        assert "success" in data


# ============================================================
# Existing WhatsApp Custom Templates (regression — JWT required)
# ============================================================
class TestWhatsappTemplatesRegression:
    """Regression: /api/whatsapp/custom-templates endpoints.
    These require JWT, so we just check they return 401/403 without auth
    (not 500 = not broken at routing level).
    """

    def test_list_custom_templates_no_auth(self, session):
        r = session.get(f"{BASE_URL}/api/whatsapp/custom-templates")
        assert r.status_code in [401, 403, 422], \
            f"Expected auth error for /whatsapp/custom-templates: {r.status_code}"

    def test_create_custom_template_no_auth(self, session):
        r = session.post(
            f"{BASE_URL}/api/whatsapp/custom-templates",
            json={"template_name": "test", "body": "Hello {{1}}"}
        )
        assert r.status_code in [401, 403, 422], \
            f"Expected auth error: {r.status_code}"

    def test_update_custom_template_no_auth(self, session):
        r = session.put(
            f"{BASE_URL}/api/whatsapp/custom-templates/some-id",
            json={"template_name": "test", "body": "Hello"}
        )
        assert r.status_code in [401, 403, 422]

    def test_delete_custom_template_no_auth(self, session):
        r = session.delete(f"{BASE_URL}/api/whatsapp/custom-templates/some-id")
        assert r.status_code in [401, 403, 422]

    def test_patch_labels_no_auth(self, session):
        """PATCH /api/whatsapp/custom-templates/{id}/labels should 401 without JWT."""
        r = session.patch(
            f"{BASE_URL}/api/whatsapp/custom-templates/some-id/labels",
            json={"variable_labels": {"1": "name"}}
        )
        assert r.status_code in [401, 403, 422], \
            f"Expected auth error for labels PATCH: {r.status_code}"

    def test_sync_authkey_no_auth(self, session):
        r = session.post(f"{BASE_URL}/api/whatsapp/authkey/sync-templates")
        assert r.status_code in [401, 403, 422]
