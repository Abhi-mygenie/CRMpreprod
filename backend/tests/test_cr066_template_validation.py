"""
CR-066 Template Builder Meta Compliance Validation V11-V23 Backend Tests
Tests hard-block validations on POST /api/whatsapp/create-and-sync-template.
BUG-015: V19/V21/V22 were moved to soft warnings and are NOT tested at backend
(they were never in backend safety-net anyway).
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://crm-deployment-test-1.preview.emergentagent.com").rstrip("/")
LOGIN = {"email": "owner@hungry.com", "password": "Qplazm@10"}
ENDPOINT = f"{BASE_URL}/api/whatsapp/create-and-sync-template"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"})
    return s


def _post(client, **overrides):
    body = {
        "template_name": overrides.pop("template_name", "qa_test_default"),
        "body": overrides.pop("body", "Hello world"),
        "category": overrides.pop("category", "utility"),
        "language": overrides.pop("language", "en"),
        "footer": overrides.pop("footer", ""),
        "header_type": overrides.pop("header_type", "none"),
        "header_content": overrides.pop("header_content", ""),
        "buttons": overrides.pop("buttons", []),
        "body_examples": overrides.pop("body_examples", []),
        "header_examples": overrides.pop("header_examples", []),
    }
    body.update(overrides)
    return client.post(ENDPOINT, json=body, timeout=30)


# ---------- V11: Unmatched formatting markers ----------

def test_T1_orphan_underscore(client):
    r = _post(client, template_name="qa_test_v11_orphan_underscore", body="Hello _italic without close")
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
    detail = r.json().get("detail", "").lower()
    assert "unmatched _" in detail or "italic marker" in detail, f"Expected 'unmatched _' msg, got: {detail}"


def test_T2_orphan_star(client):
    # Odd number of non-bullet '*' (single bold marker)
    r = _post(client, template_name="qa_test_v11_orphan_star", body="Hello *bold with no close")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "unmatched *" in detail or "bold marker" in detail, f"Got: {detail}"


def test_T3_orphan_tilde(client):
    r = _post(client, template_name="qa_test_v11_orphan_tilde", body="Hello ~strike no close")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "unmatched ~" in detail or "strikethrough" in detail, f"Got: {detail}"


# ---------- V12: Variable at start/end ----------

def test_T6_variable_at_start(client):
    r = _post(client, template_name="qa_test_v12_var_start", body="{{1}} hello there")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "cannot start with a variable" in detail, f"Got: {detail}"


def test_T7_variable_at_end(client):
    r = _post(client, template_name="qa_test_v12_var_end", body="Hello there {{1}}")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "cannot end with a variable" in detail, f"Got: {detail}"


# ---------- V13: Adjacent variables ----------

def test_T8_adjacent_variables(client):
    r = _post(client, template_name="qa_test_v13_adjacent", body="Hi {{1}}{{2}} welcome")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "adjacent variables" in detail, f"Got: {detail}"


# ---------- V14: Formatting wrapping variables ----------

def test_T9_wrapping_variables(client):
    # *{{1}}* - even star count, no orphan; must trigger V14 wrapping error
    r = _post(client, template_name="qa_test_v14_wrap", body="Hi *{{1}}* welcome friend")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "wrapping variables" in detail or "*{{1}}*" in detail, f"Got: {detail}"


# ---------- V15: Body > 1024 chars ----------

def test_T10_body_over_1024(client):
    long_body = "A" * 1100
    r = _post(client, template_name="qa_test_v15_long", body=long_body)
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "1024" in detail, f"Got: {detail}"


# ---------- V16: Emoji count > 10 ----------

def test_T11_too_many_emojis(client):
    body = "Hello " + ("😀" * 11) + " world"
    r = _post(client, template_name="qa_test_v16_emoji", body=body)
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "emoji" in detail, f"Got: {detail}"


# ---------- V20: Formatting in footer ----------

def test_T16_footer_formatting(client):
    r = _post(client, template_name="qa_test_v20_footer_fmt",
              body="Hello world normal message",
              footer="Thanks *team*")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "footer" in detail and ("formatting" in detail or "markers" in detail), f"Got: {detail}"


# ---------- T20: Clean valid body should pass validation gate ----------

def test_T20_clean_body_passes_validation(client):
    """Clean body should not fail with a 400 for validation reasons.
    May still 400 with other errors (Meta creds, etc.) but not validation."""
    r = _post(client, template_name="qa_test_v20_clean_valid",
              body="Hello, thanks for your order. Your bill is ready to view.")
    # Expected: NOT a validation error. Meta creds/API may still fail.
    # Accept anything except a 400 that mentions our validation keywords.
    if r.status_code == 400:
        detail = r.json().get("detail", "").lower()
        forbidden = ["unmatched", "cannot start with a variable", "cannot end with a variable",
                     "adjacent variables", "wrapping variables", "1024 character", "emojis",
                     "single-brace", "not sequential", "must start at {{1}}"]
        for kw in forbidden:
            assert kw not in detail, f"Clean body wrongly failed validation with '{kw}': {detail}"
    # else 2xx -> definitely passed validation


# ---------- T5: Bullet-point '* item' with even bold count should NOT trigger unmatched * ----------

def test_T5_bullet_points_no_false_positive(client):
    # Two bullet lines; no bold markers = 0 non-bullet stars -> even -> valid
    body = "Choose one:\n* item one\n* item two"
    r = _post(client, template_name="qa_test_v11_bullets",
              body=body)
    if r.status_code == 400:
        detail = r.json().get("detail", "").lower()
        assert "unmatched *" not in detail, f"False positive: {detail}"


# ---------- T23: Backend safety-net for orphan _ (bypass frontend) ----------

def test_T23_backend_safety_net_orphan_underscore(client):
    # Same as T1 but explicitly stated as safety-net test
    r = _post(client, template_name="qa_test_v23_safety_net",
              body="Bypass frontend: _stray underscore here")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "unmatched _" in detail, f"Backend safety-net failed: {detail}"


# ---------- REGRESSION: V1 single-brace still works ----------

def test_regression_V1_single_brace(client):
    r = _post(client, template_name="qa_test_regression_v1",
              body="Hi {1}, your order is ready")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "single-brace" in detail or "{1}" in detail or "double braces" in detail, f"Got: {detail}"
