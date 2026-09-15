"""
BUG-008 verification tests: WhatsApp template with image header should have
has_send_media == true so the Campaign Wizard does NOT hard-block sends.

Scope: read-only verification on LIVE preprod tenant (owner@jehsnest.com).
No POST/PUT/DELETE writes are made against Meta/AuthKey.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-preprod-preview-3.preview.emergentagent.com").rstrip("/")
LOGIN_EMAIL = "owner@jehsnest.com"
LOGIN_PASSWORD = "Qplazm@10"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"No token in login response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(auth_token):
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ---- Health check ----
def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=15)
    assert r.status_code == 200


# ---- BUG-008 primary verification ----
def test_authkey_templates_returns_200(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "templates" in body
    assert isinstance(body["templates"], list)
    assert len(body["templates"]) > 0, "Expected non-empty template list"


def test_sampletestlogo_wid_40529_has_send_media(headers):
    """wid 40529 (sampletestlogo, APPROVED, image header) must have has_send_media True."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    assert r.status_code == 200
    templates = r.json().get("templates", [])
    match = next((t for t in templates if str(t.get("wid")) == "40529"), None)
    assert match is not None, "Template wid 40529 (sampletestlogo) not found"
    assert match.get("header_type") == "image", f"header_type expected 'image' got {match.get('header_type')}"
    assert match.get("has_send_media") is True, f"has_send_media expected True, got {match.get('has_send_media')} | full: {match}"
    assert match.get("needs_media_reupload") is False, f"needs_media_reupload expected False got {match.get('needs_media_reupload')}"


def test_sampletestlogo2_wid_40534_has_send_media(headers):
    """wid 40534 (sampletestlogo2, pending on Meta) must also expose has_send_media True."""
    r = requests.get(f"{BASE_URL}/api/whatsapp/authkey-templates", headers=headers, timeout=30)
    templates = r.json().get("templates", [])
    match = next((t for t in templates if str(t.get("wid")) == "40534"), None)
    if match is None:
        pytest.skip("wid 40534 not present on AuthKey yet (pending) — skip")
    assert match.get("has_send_media") is True, f"has_send_media expected True, got {match.get('has_send_media')} | full: {match}"


# ---- Regression: custom-templates lists local copy with send_media_url ----
def test_custom_templates_returns_sampletestlogo_with_send_media_url(headers):
    r = requests.get(f"{BASE_URL}/api/whatsapp/custom-templates", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    templates = body.get("templates") if isinstance(body, dict) else body
    assert templates, f"No custom templates: {body}"
    match = next((t for t in templates if t.get("template_name") == "sampletestlogo"), None)
    assert match is not None, "custom_templates 'sampletestlogo' not found"
    smu = match.get("send_media_url")
    assert smu and smu.startswith("http"), f"send_media_url missing/invalid: {smu}"
    # S3 URL public reachability sanity check (HEAD may 403 on S3 without signing; do GET)
    head = requests.get(smu, timeout=15, stream=True)
    assert head.status_code == 200, f"S3 media URL not reachable: {head.status_code} {smu}"


def test_no_mongo_object_id_leaked(headers):
    """Ensure _id is not present in JSON responses."""
    for path in ["/api/whatsapp/authkey-templates", "/api/whatsapp/custom-templates"]:
        r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=30)
        assert r.status_code == 200
        assert '"_id"' not in r.text, f"_id leaked in {path}"
