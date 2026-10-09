"""CR-2026-10-03-001 extras — items from the review request not already covered
by test_cr_2026_10_03_001.py:

  * deleted routes return 404/405 even WITHOUT auth (not 401/403)
  * admin login includes a `token` key (string, non-empty)
  * admin login with wrong password → 401
  * admin login with unknown email → 404 and body says 'Account not found'
  * public routes still live: /api/healthz, /api/config/478, /api/dietary-tags/478
  * admin config round-trip: GET /api/config/689 → PUT → GET → restore
  * backend log has no Traceback / NameError since last restart

NOTE: /api/auth/login is rate-limited 5/min. We only hit it twice here
(wrong-password + unknown-email). The admin_jwt fixture is reused for authed
calls so we do not burn extra login quota.
"""
import re
import time
from pathlib import Path

import pytest

pytestmark = pytest.mark.smoke

from tests.conftest import ADMIN_PASS, ADMIN_PHONE, TEST_RID

DELETED_ROUTES = [
    ("POST", "/api/auth/set-password"),
    ("POST", "/api/auth/verify-password"),
    ("GET",  "/api/customer/profile"),
    ("PUT",  "/api/customer/profile"),
    ("GET",  "/api/customer/orders"),
    ("GET",  "/api/customer/points"),
    ("GET",  "/api/customer/wallet"),
    ("GET",  "/api/customer/coupons"),
]


@pytest.mark.parametrize("method,path", DELETED_ROUTES)
def test_deleted_routes_no_auth(http_client, method, path):
    resp = http_client.request(method, path, json={} if method in ("POST", "PUT") else None)
    assert resp.status_code in (404, 405), (
        f"{method} {path} no-auth → {resp.status_code} (should be 404/405, NEVER 401/403)"
    )


def test_admin_login_has_token_key(http_client, admin_jwt):
    # admin_jwt fixture already asserts success + returns the token string
    assert isinstance(admin_jwt, str) and len(admin_jwt) > 20


def test_login_wrong_password_returns_401(http_client):
    resp = http_client.post("/api/auth/login", json={
        "phone_or_email": ADMIN_PHONE,
        "password": "definitely-wrong-" + str(int(time.time())),
    })
    if resp.status_code == 429:
        pytest.skip("rate-limited (5/min)")
    assert resp.status_code == 401, f"wrong-password → {resp.status_code}: {resp.text[:200]}"


def test_login_unknown_email_returns_404(http_client):
    resp = http_client.post("/api/auth/login", json={
        "phone_or_email": f"ghost-{int(time.time())}@nowhere.invalid",
        "password": "whatever",
    })
    if resp.status_code == 429:
        pytest.skip("rate-limited (5/min)")
    assert resp.status_code == 404, f"unknown-email → {resp.status_code}: {resp.text[:200]}"
    assert "Account not found" in resp.text


def test_public_healthz(http_client):
    assert http_client.get("/api/healthz").status_code == 200


def test_public_config_478(http_client):
    assert http_client.get("/api/config/478").status_code == 200


def test_public_dietary_tags_478(http_client):
    assert http_client.get("/api/dietary-tags/478").status_code == 200


def test_admin_config_roundtrip(http_client, admin_jwt):
    """PUT /api/config/ writes to the restaurant_id baked into the JWT (478),
    not to a body-supplied one. So the round-trip must be against /api/config/478."""
    headers = {"Authorization": f"Bearer {admin_jwt}"}
    # Prove the public GET /api/config/689 route itself still returns 200
    r_689 = http_client.get("/api/config/689")
    assert r_689.status_code == 200, r_689.text[:200]

    # GET original for admin's restaurant (478)
    r1 = http_client.get("/api/config/478")
    assert r1.status_code == 200, r1.text[:200]
    original = r1.json()

    candidate_fields = ["welcomeMessage", "poweredByText", "payOnlineLabel", "payAtCounterLabel"]
    field = next((f for f in candidate_fields if isinstance(original.get(f), str)), None)
    if not field:
        pytest.skip(f"no safe string field to toggle on config/478; keys={list(original)[:10]}")

    original_value = original[field]
    marker = f"__CR20261003001_TEST_{int(time.time())}"
    new_value = (original_value or "") + " " + marker

    r2 = http_client.put("/api/config/", headers=headers, json={field: new_value})
    assert r2.status_code == 200, f"PUT /api/config/ → {r2.status_code}: {r2.text[:300]}"

    r3 = http_client.get("/api/config/478")
    assert r3.status_code == 200
    assert marker in str(r3.json().get(field, "")), (
        f"PUT not reflected on GET; field={field}, got={r3.json().get(field)!r}"
    )

    restore = http_client.put(
        "/api/config/", headers=headers,
        json={field: original_value},
    )
    assert restore.status_code == 200, f"restore failed: {restore.text[:200]}"


def test_backend_log_clean_since_last_startup():
    """Only look at log lines emitted since the most recent
    'Application startup complete.' — the file accumulates history across
    unrelated reloads/installs that pre-date this CR."""
    log = Path("/var/log/supervisor/backend.err.log")
    if not log.exists():
        pytest.skip("backend.err.log not present")
    text = log.read_text(errors="ignore")
    marker = "Application startup complete."
    idx = text.rfind(marker)
    tail = text[idx:] if idx != -1 else text[-20000:]
    assert "Traceback" not in tail, f"Traceback since last startup:\n{tail[-2000:]}"
    assert "NameError" not in tail, f"NameError since last startup:\n{tail[-2000:]}"
