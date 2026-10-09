# CR-2026-09-12-005: behavioural smoke flows for auth + core operations.
# Marks: smoke
# These tests assert BEHAVIOUR — not shape. No snapshot comparison.
# Smoke 1 (otp_for_testing) WILL FAIL intentionally after CR-003 removes the echo.
# That failure is the designed signal that CR-003 has been implemented.

import os
import io
import pytest
import httpx
from pathlib import Path

BASE_URL  = os.environ.get("TEST_BASE_URL",       "http://localhost:8001")
ADMIN_PHONE = os.environ.get("TEST_ADMIN_PHONE",  "owner@18march.com")
ADMIN_PASS  = os.environ.get("TEST_ADMIN_PASS",   "Qplazm@10")
TEST_PHONE  = os.environ.get("TEST_PHONE",         "9579504871")
TEST_RID    = os.environ.get("TEST_RESTAURANT_ID", "478")


# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/send-otp endpoint commented out.
# Restore and update this test when CR-003 Parts B+C are implemented.
# @pytest.mark.smoke
# def test_smoke_otp_echo_present(http_client):
#     """Smoke 1: POST /api/auth/send-otp returns otp_for_testing.
#     NOTE: Restore when CR-003 ships and backend OTP endpoint is re-enabled.
#     """
#     resp = http_client.post("/api/auth/send-otp", json={"phone": TEST_PHONE, "restaurant_id": TEST_RID})
#     assert resp.status_code == 200
#     data = resp.json()
#     assert "otp_for_testing" in data
#     assert len(str(data["otp_for_testing"])) >= 4


@pytest.mark.smoke
def test_smoke_admin_login_jwt(http_client):
    """Smoke 2: Admin login returns a valid JWT for user_type=restaurant."""
    resp = http_client.post("/api/auth/login", json={
        "phone_or_email": ADMIN_PHONE,
        "password": ADMIN_PASS,
        "restaurant_id": TEST_RID,
    })
    assert resp.status_code == 200, f"Admin login failed: {resp.text}"
    data = resp.json()
    assert data.get("success") is True
    assert data.get("user_type") == "restaurant"
    token = data.get("token", "")
    assert token.startswith("ey"), f"Token doesn't look like a JWT: {token[:20]}"


@pytest.mark.smoke
def test_smoke_auth_me(http_client, admin_jwt):
    """Smoke 3: GET /api/auth/me with valid JWT returns user profile."""
    resp = http_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {admin_jwt}"},
    )
    assert resp.status_code == 200, f"/api/auth/me failed: {resp.text}"
    data = resp.json()
    assert "user_type" in data
    assert "user" in data


@pytest.mark.smoke
def test_smoke_pos_auth_token(http_client):
    """Smoke 4: POST /api/pos/auth-token → 200 (POS up) OR 502 (POS down).

    Both outcomes PASS — avoids CI flakiness on preprod outages (D-05-9).
    """
    resp = http_client.post("/api/pos/auth-token")
    assert resp.status_code in (200, 502), (
        f"Expected 200 or 502, got {resp.status_code}: {resp.text[:200]}"
    )


@pytest.mark.smoke
def test_smoke_auth_me_no_token(http_client):
    """Smoke 6: GET /api/auth/me without Authorization header → 401."""
    resp = http_client.get("/api/auth/me")
    assert resp.status_code == 401, (
        f"Expected 401 for unauthenticated /me, got {resp.status_code}"
    )


@pytest.mark.smoke
def test_smoke_auth_me_bad_token(http_client):
    """Smoke 7: GET /api/auth/me with invalid JWT → 401."""
    resp = http_client.get(
        "/api/auth/me",
        headers={"Authorization": "Bearer invalid_token_xyz_not_a_real_jwt"},
    )
    assert resp.status_code == 401, (
        f"Expected 401 for bad JWT, got {resp.status_code}"
    )


@pytest.mark.smoke
def test_smoke_upload_round_trip(http_client, admin_jwt):
    """Smoke 8: Upload a 1x1 PNG and verify it can be served back.

    Cleans up the file after assertion (try/finally).
    """
    # Minimal valid 1x1 white PNG
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01"
        b"\x00\x05\x18\xd8\xac\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    # Upload
    up_resp = http_client.post(
        "/api/upload/image",
        headers={"Authorization": f"Bearer {admin_jwt}"},
        files={"file": ("smoke_test.png", io.BytesIO(png_bytes), "image/png")},
    )
    assert up_resp.status_code == 200, f"Upload failed: {up_resp.text}"
    filename = up_resp.json().get("filename", "")
    assert filename, "Upload response missing filename field"

    try:
        # Serve back
        serve_resp = http_client.get(f"/api/upload/image/{filename}")
        assert serve_resp.status_code == 200, (
            f"Serve failed after upload: {serve_resp.status_code}"
        )
        assert len(serve_resp.content) > 0, "Served file is empty"
    finally:
        # Cleanup
        upload_path = Path("/app/backend/uploads") / filename
        if upload_path.exists():
            upload_path.unlink()
