"""
BUG-QA-01/02/04 + regression tests for CR-066 Bug Fix Agent session.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ENDPOINT = f"{BASE_URL}/api/whatsapp/create-and-sync-template"


@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "owner@jehsnest.com", "password": "Qplazm@10"}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text[:200]}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def client(auth_token):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {auth_token}"})
    return s


def _post(client, **overrides):
    body = {
        "template_name": overrides.pop("template_name", "qa_bugfix_default"),
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


def test_login_works():
    """Login flow for owner@jehsnest.com"""
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "owner@jehsnest.com", "password": "Qplazm@10"}, timeout=30)
    assert r.status_code == 200
    assert "access_token" in r.json()


def test_BUG_QA_02_star_emoji_11(client):
    """BUG-QA-02: 11 ⭐ (U+2B50) emojis must trigger 400 with 'emoji' in detail"""
    body = "Check this out " + ("⭐" * 11)
    r = _post(client, template_name="qa_bugqa02_star_emoji", body=body)
    assert r.status_code == 400, f"Expected 400, got {r.status_code}: {r.text[:200]}"
    detail = r.json().get("detail", "").lower()
    assert "emoji" in detail, f"Expected 'emoji' in detail, got: {detail}"


def test_BUG_QA_04_orphan_underscore_no_waba(client):
    """BUG-QA-04: invalid body 'Hello _world' must return 400 'unmatched _'
    even when user has no Meta WABA configured (owner@jehsnest.com has none)"""
    r = _post(client, template_name="qa_bugqa04_no_waba", body="Hello _world")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "unmatched _" in detail or "italic marker" in detail, \
        f"Expected 'unmatched _', got: {detail}"


def test_BUG_QA_04_regression_valid_body_no_waba(client):
    """BUG-QA-04 regression: valid body with no WABA must return 400 'Meta WABA' error"""
    r = _post(client, template_name="qa_bugqa04_regression_waba",
              body="Hello, your order confirmation is ready.")
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "Meta WABA" in detail or "Access Token" in detail, \
        f"Expected WABA credential error, got: {detail}"


def test_BUG_QA_regression_variable_at_start(client):
    """Regression: body starting with variable must return 400 'cannot start with a variable'"""
    r = _post(client, template_name="qa_bugqa_reg_var_start", body="{{1}} starts with variable")
    assert r.status_code == 400
    detail = r.json().get("detail", "").lower()
    assert "cannot start with a variable" in detail, f"Got: {detail}"


def test_BUG_QA_regression_body_over_1024(client):
    """Regression: body over 1024 chars must return 400 with '1024' in detail"""
    r = _post(client, template_name="qa_bugqa_reg_long", body="A" * 1100)
    assert r.status_code == 400
    detail = r.json().get("detail", "")
    assert "1024" in detail, f"Got: {detail}"
