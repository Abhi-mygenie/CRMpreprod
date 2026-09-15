"""
CR-061 gate removal verification.

Owner requirement: ALL tenants must be able to author WhatsApp templates.
The allowlist (CRM_TEMPLATES_ALLOWED_RESTAURANT_IDS=510) now only controls
the CRM Templates drafts *visibility* on the frontend, gated via the
`crm_templates_enabled` flag returned from GET /api/whatsapp/api-key.

We authenticate as a NON-allowlisted tenant (owner@jehsnest.com, restaurant_id=635)
and confirm every authoring endpoint returns a non-403 status.
"""
import os
import io
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-preprod-preview-4.preview.emergentagent.com").rstrip("/")

EMAIL = "owner@jehsnest.com"
PASSWORD = "Qplazm@10"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    assert tok, f"No access_token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- GET /api-key must still expose crm_templates_enabled flag (frontend gate) ---
def test_api_key_returns_crm_templates_enabled_flag(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/api-key", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "crm_templates_enabled" in body, f"Missing crm_templates_enabled: {body}"
    # jehsnest is NOT in allowlist -> should be False
    assert body["crm_templates_enabled"] is False, f"Expected False for non-allowlisted tenant, got {body['crm_templates_enabled']}"


# --- All authoring endpoints: verify NOT 403 (may be 422/400/404 based on payload) ---
def test_upload_media_header_no_403(headers):
    # No file attached -> expect 422 (validation) not 403 (gate)
    r = requests.post(f"{BASE_URL}/api/whatsapp/upload-media-header", headers=headers, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"
    assert r.status_code == 422, f"Expected 422, got {r.status_code}: {r.text}"


def test_upload_media_header_init_no_403(headers):
    r = requests.post(f"{BASE_URL}/api/whatsapp/upload-media-header/init", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_upload_media_header_chunk_no_403(headers):
    r = requests.post(f"{BASE_URL}/api/whatsapp/upload-media-header/chunk/fake-upload-id", headers=headers, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_upload_media_header_complete_no_403(headers):
    r = requests.post(f"{BASE_URL}/api/whatsapp/upload-media-header/complete/fake-upload-id", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_post_custom_templates_no_403(headers):
    # Send minimal invalid payload; expect 422/400, NOT 403
    r = requests.post(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_put_custom_templates_no_403(headers):
    r = requests.put(f"{BASE_URL}/api/whatsapp/custom-templates/nonexistent-id-TEST", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_delete_custom_templates_no_403(headers):
    r = requests.delete(f"{BASE_URL}/api/whatsapp/custom-templates/nonexistent-id-TEST", headers=headers, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_patch_custom_templates_labels_no_403(headers):
    r = requests.patch(f"{BASE_URL}/api/whatsapp/custom-templates/nonexistent-id-TEST/labels", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_submit_custom_template_no_403(headers):
    r = requests.put(f"{BASE_URL}/api/whatsapp/custom-templates/nonexistent-id-TEST/submit", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


def test_meta_create_template_no_403(headers):
    r = requests.post(f"{BASE_URL}/api/whatsapp/meta/create-template", headers=headers, json={}, timeout=30)
    assert r.status_code != 403, f"Gate still active: {r.status_code} {r.text}"


# --- Regression: GET endpoints still work (read-only, tenant-scoped) ---
def test_get_custom_templates_no_403(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, timeout=30)
    assert r.status_code == 200, f"GET custom-templates broken: {r.status_code} {r.text}"


def test_health_check():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200, r.text
