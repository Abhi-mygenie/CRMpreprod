# CR-2026-09-12-005: dietary tags contract snapshots.
import pytest
from syrupy import SnapshotAssertion
from syrupy.extensions.json import JSONSnapshotExtension


@pytest.fixture
def snapshot(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    return snapshot.use_extension(JSONSnapshotExtension)


@pytest.mark.contract
def test_dietary_tags_available(http_client, strip_dynamic, snapshot):
    """GET /api/dietary-tags/available — list of available dietary tag strings."""
    resp = http_client.get("/api/dietary-tags/available")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, dict), f"Expected dict, got {type(data)}"
    assert "tags" in data, f"Expected 'tags' key, got {list(data.keys())}"
    assert snapshot == strip_dynamic(data)


@pytest.mark.contract
def test_dietary_tags_478(http_client, strip_dynamic, snapshot):
    """GET /api/dietary-tags/478 — per-restaurant dietary tags."""
    resp = http_client.get("/api/dietary-tags/478")
    assert resp.status_code == 200
    assert snapshot == strip_dynamic(resp.json())
