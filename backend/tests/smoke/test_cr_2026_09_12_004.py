"""CR-2026-09-12-004 — security headers + auth rate limit.

The CR shipped and was marked IMPLEMENTED but was never QA'd and had no test.
QA (session after 2026-10-03) verified both behaviours by hand; these lock them in.

Also covers CR-2026-09-14-001: POST /api/auth/send-otp must be gone, not 500.
"""
import pytest

pytestmark = pytest.mark.smoke

REQUIRED_SECURITY_HEADERS = [
    "x-frame-options",
    "x-content-type-options",
    "strict-transport-security",
    "referrer-policy",
    "permissions-policy",
]


def test_security_headers_present(http_client):
    resp = http_client.get("/api/healthz")
    assert resp.status_code == 200
    headers = {k.lower() for k in resp.headers}
    missing = [h for h in REQUIRED_SECURITY_HEADERS if h not in headers]
    assert not missing, f"CR-2026-09-12-004 security headers missing: {missing}"


def test_send_otp_endpoint_removed(http_client):
    """CR-2026-09-14-001 — route deleted. 404/405 is correct; 500 would mean a half-removal."""
    resp = http_client.post("/api/auth/send-otp", json={"phone": "9579504871"})
    assert resp.status_code in (404, 405), (
        f"send-otp should be gone, got {resp.status_code}: {resp.text[:200]}"
    )
