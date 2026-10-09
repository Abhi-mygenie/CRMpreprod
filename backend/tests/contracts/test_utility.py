# CR-2026-09-12-005: utility + negative contract snapshots.
import pytest
from syrupy import SnapshotAssertion
from syrupy.extensions.json import JSONSnapshotExtension


@pytest.fixture
def snapshot(snapshot: SnapshotAssertion) -> SnapshotAssertion:
    return snapshot.use_extension(JSONSnapshotExtension)


@pytest.mark.contract
def test_table_config_requires_auth(http_client, snapshot):
    """GET /api/table-config without X-POS-Token header → 401.

    Snapshots the error response shape so we catch any change to the
    error envelope format.
    """
    resp = http_client.get("/api/table-config")
    assert resp.status_code == 401, (
        f"Expected 401 for unauthenticated table-config, got {resp.status_code}"
    )
    assert snapshot == resp.json()


@pytest.mark.contract
def test_docs_bug_tracker(http_client, snapshot):
    """GET /api/docs/bug-tracker — snapshots current response shape.

    Returns 200 when the doc file exists, or a JSON error when absent on this pod.
    CR-2026-09-12-006 (Wave 2 backend split) will remove these legacy
    doc endpoints — that will be a visible snapshot delta.
    """
    resp = http_client.get("/api/docs/bug-tracker")
    # Accept 200 (file present on pod) or 404 (file absent — valid on some pods)
    assert resp.status_code in (200, 404), (
        f"Expected 200 or 404, got {resp.status_code}"
    )
    assert snapshot == resp.json()
