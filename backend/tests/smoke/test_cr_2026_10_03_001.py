"""CR-2026-10-03-001 — legacy customer API shim deleted from server.py.

Guards that:
  * POST /api/auth/set-password and /verify-password are gone
  * all six /api/customer/* routes are gone (404, not 403 — the route must not exist)
  * admin login still returns a restaurant token, with no restaurant_context key
  * /api/auth/me still answers for admins
  * the live CRM-boundary routes (customer-lookup, loyalty-settings) are untouched
  * static: server.py has exactly one db.customers read and no orphaned names
"""
import re
from pathlib import Path

import pytest

pytestmark = pytest.mark.smoke

from tests.conftest import ADMIN_PASS as ADMIN_PASSWORD, ADMIN_PHONE as ADMIN_EMAIL

SERVER_PY = Path(__file__).resolve().parents[2] / "server.py"


def test_set_password_gone(http_client):
    resp = http_client.post("/api/auth/set-password", json={"phone": "9579504871", "password": "x", "confirm_password": "x", "restaurant_id": "478"})
    assert resp.status_code in (404, 405)


def test_verify_password_gone(http_client):
    resp = http_client.post("/api/auth/verify-password", json={"phone": "9579504871", "password": "x", "restaurant_id": "478"})
    assert resp.status_code in (404, 405)


@pytest.mark.parametrize("method,path", [
    ("GET", "/api/customer/profile"),
    ("PUT", "/api/customer/profile"),
    ("GET", "/api/customer/orders"),
    ("GET", "/api/customer/points"),
    ("GET", "/api/customer/wallet"),
    ("GET", "/api/customer/coupons"),
])
def test_customer_routes_gone(http_client, admin_jwt, method, path):
    headers = {"Authorization": f"Bearer {admin_jwt}"}
    resp = http_client.request(method, path, headers=headers, json={"name": "x"} if method == "PUT" else None)
    assert resp.status_code in (404, 405), f"{method} {path} → {resp.status_code}"


def test_admin_login_still_restaurant(http_client):
    resp = http_client.post("/api/auth/login", json={"phone_or_email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    if resp.status_code == 429:
        pytest.skip("login limiter (5/min) active — admin login already proven by admin_jwt fixture")
    assert resp.status_code == 200
    body = resp.json()
    assert body["user_type"] == "restaurant"
    assert "pos_token" in body
    assert "restaurant_context" not in body


def test_me_alive(http_client, admin_jwt):
    resp = http_client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_jwt}"})
    assert resp.status_code == 200
    assert resp.json()["user_type"] == "restaurant"


def test_live_crm_boundary_routes_untouched(http_client):
    assert http_client.get("/api/customer-lookup/478", params={"phone": "9579504871"}).status_code == 200
    assert http_client.get("/api/loyalty-settings/478").status_code == 200


def test_static_no_dead_touches():
    src = SERVER_PY.read_text(encoding="utf-8")
    assert len(re.findall(r"db\.customers\b", src)) == 1
    for coll in ("orders", "points_transactions", "wallet_transactions", "coupons", "feedback"):
        assert not re.search(rf"db\.{coll}\b", src), coll
    for name in ("CustomerProfile", "OrderSummary", "PointsTransaction", "SetPasswordRequest",
                 "VerifyPasswordRequest", "ResetPasswordRequest", "customer_router", "restaurant_context"):
        assert name not in src, name
