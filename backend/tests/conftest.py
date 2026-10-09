# CR-2026-09-12-005: shared pytest fixtures for contract + smoke suites.
# Credentials read from env vars; defaults match test_credentials.md.
# Uses sync httpx.Client — no async required.

import os
import io
import time
import pytest
import httpx
from pathlib import Path
from typing import Callable, Any

# ---------------------------------------------------------------------------
# Configuration — override via environment variables
# ---------------------------------------------------------------------------
BASE_URL   = os.environ.get("TEST_BASE_URL",        "http://localhost:8001")
ADMIN_PHONE = os.environ.get("TEST_ADMIN_PHONE",   "owner@18march.com")
ADMIN_PASS  = os.environ.get("TEST_ADMIN_PASS",    "Qplazm@10")
TEST_PHONE  = os.environ.get("TEST_PHONE",          "9579504871")
TEST_RID    = os.environ.get("TEST_RESTAURANT_ID",  "478")

# Dynamic keys stripped before snapshot comparison to avoid flaky diffs
_DYNAMIC_KEYS = {
    "updated_at", "created_at", "_id", "token", "crm_token",
    "timestamp", "request_id", "otp_for_testing", "pos_token",
    "access_token", "last_seen", "last_updated",
}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(scope="session")
def http_client():
    """Session-scoped sync httpx client pointed at the running backend."""
    with httpx.Client(base_url=BASE_URL, timeout=15.0) as client:
        yield client


@pytest.fixture(scope="session")
def admin_jwt(http_client: httpx.Client) -> str:
    """Session-scoped admin JWT for restaurant 478.

    CR-2026-09-12-004 rate-limits /api/auth/login to 5/minute, so two suite runs
    inside the same window used to fail the whole session with 429. Wait the
    window out instead of failing.
    """
    payload = {
        "phone_or_email": ADMIN_PHONE,
        "password": ADMIN_PASS,
        "restaurant_id": TEST_RID,
    }
    resp = http_client.post("/api/auth/login", json=payload)
    for _ in range(3):
        if resp.status_code != 429:
            break
        time.sleep(21)
        resp = http_client.post("/api/auth/login", json=payload)
    assert resp.status_code == 200, (
        f"Admin login failed ({resp.status_code}): {resp.text[:200]}"
    )
    data = resp.json()
    assert data.get("success") is True, f"Login returned success=False: {data}"
    return data["token"]


@pytest.fixture(scope="session")
def strip_dynamic() -> Callable[[Any], Any]:
    """Recursively removes dynamic keys (timestamps, tokens, IDs) from a
    response dict before snapshot comparison."""
    def _strip(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: _strip(v) for k, v in obj.items() if k not in _DYNAMIC_KEYS}
        if isinstance(obj, list):
            return [_strip(item) for item in obj]
        return obj
    return _strip


@pytest.fixture(scope="session")
def snapshot_dir() -> Path:
    """Directory where snapshot JSON files are stored."""
    return Path("/app/backend/tests/fixtures/snapshots")


@pytest.fixture(scope="session")
def seed_image_filename(http_client: httpx.Client, admin_jwt: str):
    """Upload a minimal 1x1 PNG for upload-serve tests; clean up after session."""
    # Minimal valid 1x1 white PNG (67 bytes)
    png_bytes = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
        b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01"
        b"\x00\x05\x18\xd8\xac\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    resp = http_client.post(
        "/api/upload/image",
        headers={"Authorization": f"Bearer {admin_jwt}"},
        files={"file": ("test_seed.png", io.BytesIO(png_bytes), "image/png")},
    )
    assert resp.status_code == 200, f"Seed upload failed: {resp.text}"
    filename = resp.json().get("filename", "")
    assert filename, "Upload response missing filename"
    yield filename
    # Cleanup: remove file from uploads dir
    upload_path = Path("/app/backend/uploads") / filename
    if upload_path.exists():
        upload_path.unlink()
