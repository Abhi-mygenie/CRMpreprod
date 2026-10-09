# CR-2026-09-12-005: API contract snapshot tests — public config + utility endpoints.
# Marks: contract
# These tests call live endpoints and compare the response shape to a saved
# JSON snapshot. Any unexpected key addition, removal, or type change fails the test.
# To regenerate after an intentional change:
#   cd /app && pytest -m contract -n 0 --snapshot-update backend/tests/

import pytest
from syrupy import SnapshotAssertion
from syrupy.extensions.json import JSONSnapshotExtension


@pytest.fixture
def snapshot(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    """Override syrupy snapshot to use JSON format."""
    return snapshot.use_extension(JSONSnapshotExtension)


@pytest.mark.contract
def test_api_root(http_client, strip_dynamic, snapshot):
    """GET /api/ — welcome message shape."""
    resp = http_client.get("/api/")
    assert resp.status_code == 200
    assert snapshot == strip_dynamic(resp.json())


@pytest.mark.contract
def test_healthz(http_client):
    """GET /api/healthz — must return ok=True and mongo=up."""
    resp = http_client.get("/api/healthz")
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("ok") is True
    assert data.get("mongo") == "up"


@pytest.mark.contract
def test_config_478(http_client, strip_dynamic, snapshot):
    """GET /api/config/478 — restaurant config shape (100+ keys)."""
    resp = http_client.get("/api/config/478")
    assert resp.status_code == 200
    data = strip_dynamic(resp.json())
    assert len(data) >= 50, f"Expected >= 50 keys, got {len(data)}"
    assert snapshot == data


@pytest.mark.contract
def test_config_716(http_client, strip_dynamic, snapshot):
    """GET /api/config/716 — multi-menu restaurant config shape."""
    resp = http_client.get("/api/config/716")
    assert resp.status_code == 200
    assert snapshot == strip_dynamic(resp.json())


@pytest.mark.contract
def test_config_nonexistent_defaults(http_client, strip_dynamic, snapshot):
    """GET /api/config/9999 — defaults-in-code fallback path.

    Snapshots this today so CR-2026-09-12-010 (DB-backed defaults, Wave 3)
    produces a visible snapshot delta when it removes the hardcoded defaults.
    """
    resp = http_client.get("/api/config/9999")
    assert resp.status_code == 200
    data = strip_dynamic(resp.json())
    assert isinstance(data, dict) and len(data) > 0, (
        "Expected non-empty defaults dict for unknown restaurant_id"
    )
    assert snapshot == data


@pytest.mark.contract
def test_loyalty_settings_478(http_client, strip_dynamic, snapshot):
    """GET /api/loyalty-settings/478."""
    resp = http_client.get("/api/loyalty-settings/478")
    assert resp.status_code == 200
    assert snapshot == strip_dynamic(resp.json())


@pytest.mark.contract
def test_customer_lookup_478(http_client, strip_dynamic, snapshot):
    """GET /api/customer-lookup/478 — check-customer response shape."""
    import os
    phone = os.environ.get("TEST_PHONE", "9579504871")
    resp = http_client.get(f"/api/customer-lookup/478", params={"phone": phone})
    assert resp.status_code == 200
    # Strip phone to avoid PII in snapshot; strip token fields
    data = strip_dynamic(resp.json())
    data.pop("phone", None)
    data.pop("name", None)
    assert snapshot == data


@pytest.mark.contract
def test_config_feedback_478(http_client, admin_jwt):
    """GET /api/config/feedback/478 — route removed by CR-2026-10-03-003 (feedback lives in CRM)."""
    resp = http_client.get(
        "/api/config/feedback/478",
        headers={"Authorization": f"Bearer {admin_jwt}"},
    )
    assert resp.status_code in (404, 405)


@pytest.mark.contract
def test_status_list(http_client, strip_dynamic, snapshot):
    """GET /api/status — returns a list."""
    resp = http_client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    # Snapshot the shape of the first item only (list grows over time)
    if data:
        assert snapshot == strip_dynamic(data[0])
    else:
        assert snapshot == []
