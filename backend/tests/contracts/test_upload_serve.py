# CR-2026-09-12-005: upload serving contract test.
# Verifies the static-file serve endpoint returns correct Content-Type + non-empty body.
# Seed image is uploaded in conftest.py seed_image_filename fixture and cleaned up after.
import pytest


@pytest.mark.contract
def test_upload_serve_content_type(http_client, seed_image_filename: str):
    """GET /api/upload/image/<filename> — must return image/* Content-Type."""
    resp = http_client.get(f"/api/upload/image/{seed_image_filename}")
    assert resp.status_code == 200, (
        f"Expected 200 for uploaded image, got {resp.status_code}"
    )
    ct = resp.headers.get("content-type", "")
    assert ct.startswith("image/"), (
        f"Expected image/* Content-Type, got '{ct}'"
    )
    assert len(resp.content) > 0, "Upload serve returned empty body"
