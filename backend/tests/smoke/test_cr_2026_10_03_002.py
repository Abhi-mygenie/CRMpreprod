"""CR-2026-10-03-002 — `users` read projection (P0 security).

Guards the three assertions the fix exists for:
  * /api/auth/login user payload shape is unchanged (exactly 7 keys)
  * /api/auth/me no longer returns api_key / authkey_api_key / password_hash /
    pos_crm_token_response
  * mygenie_token IS still returned — by design, it feeds the /api/table-config
    fallback. Tracked for removal as CR-2026-10-04-001.

Reuses the shared fixtures in conftest.py (httpx client + session-scoped admin JWT)
so there is one login per run and one place where the base URL and credentials live.
"""
import pytest

pytestmark = pytest.mark.smoke

EXPECTED_LOGIN_USER_KEYS = {
    "id", "restaurant_id", "email", "restaurant_name",
    "phone", "pos_id", "pos_name",
}
FORBIDDEN_ME_KEYS = {
    "api_key", "authkey_api_key", "password_hash", "pos_crm_token_response",
}
EXPECTED_ME_KEYS = {
    "id", "email", "phone", "restaurant_id", "pos_id",
    "pos_name", "restaurant_name", "mygenie_token", "user_type",
}


def test_login_payload_shape_unchanged(http_client, admin_jwt):
    """admin_jwt already asserts 200 + success; re-read the payload for its shape."""
    from tests.conftest import ADMIN_PHONE, ADMIN_PASS, TEST_RID

    resp = http_client.post("/api/auth/login", json={
        "phone_or_email": ADMIN_PHONE,
        "password": ADMIN_PASS,
        "restaurant_id": TEST_RID,
    })
    if resp.status_code == 429:
        pytest.skip("login rate-limited (5/min, CR-2026-09-12-004) — shape covered by admin_jwt")
    assert resp.status_code == 200, resp.text[:300]
    data = resp.json()
    assert data["success"] is True
    assert data["user_type"] == "restaurant"
    assert data.get("pos_token"), "pos_token must be non-null after admin login"
    assert set(data["user"].keys()) == EXPECTED_LOGIN_USER_KEYS, (
        f"login user keys drifted: {sorted(data['user'].keys())}"
    )


def test_me_does_not_leak_crm_secrets(http_client, admin_jwt):
    resp = http_client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_jwt}"})
    assert resp.status_code == 200, resp.text[:300]
    body = resp.json()
    assert body["user_type"] == "restaurant"
    user = body["user"]

    leaked = FORBIDDEN_ME_KEYS & set(user.keys())
    assert not leaked, f"P0 LEAK — /api/auth/me returns {sorted(leaked)}"

    assert set(user.keys()) == EXPECTED_ME_KEYS, (
        f"/api/auth/me keys drifted: {sorted(user.keys())}"
    )
    assert user.get("mygenie_token"), (
        "mygenie_token must remain — /api/table-config falls back to it (CR-2026-10-04-001)"
    )
