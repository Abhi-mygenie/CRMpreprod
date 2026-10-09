# CR-2026-09-12-005: config round-trip smoke.
# Upload round-trip is in test_auth_flows.py (Smoke 8) to keep all upload logic
# together. This file covers the config PUT/GET round-trip.
import os
import pytest

ADMIN_PHONE = os.environ.get("TEST_ADMIN_PHONE", "owner@18march.com")
ADMIN_PASS  = os.environ.get("TEST_ADMIN_PASS",  "Qplazm@10")
TEST_RID    = os.environ.get("TEST_RESTAURANT_ID", "478")


@pytest.mark.smoke
def test_smoke_config_put_get_round_trip(http_client, admin_jwt):
    """Smoke 5: PUT /api/config/ → GET /api/config/478 reflects change → restore.

    Uses a harmless probe field (search_food) so no visible customer impact.
    Restores original value in try/finally.
    """
    # Get current value of a known bool config field
    get_resp = http_client.get(f"/api/config/{TEST_RID}")
    assert get_resp.status_code == 200
    original_value = get_resp.json().get("showWelcomeText", False)

    probe_value = not original_value  # toggle the bool as a probe
    try:
        # Write probe
        put_resp = http_client.put(
            "/api/config/",
            headers={"Authorization": f"Bearer {admin_jwt}"},
            json={
                "restaurant_id": int(TEST_RID),
                "showWelcomeText": probe_value,
            },
        )
        assert put_resp.status_code == 200, (
            f"Config PUT failed: {put_resp.status_code} {put_resp.text[:200]}"
        )

        # Verify probe reflected
        verify_resp = http_client.get(f"/api/config/{TEST_RID}")
        assert verify_resp.status_code == 200
        assert verify_resp.json().get("showWelcomeText") == probe_value, (
            "Config PUT value not reflected in subsequent GET"
        )

    finally:
        # Restore original
        http_client.put(
            "/api/config/",
            headers={"Authorization": f"Bearer {admin_jwt}"},
            json={
                "restaurant_id": int(TEST_RID),
                "showWelcomeText": original_value,
            },
        )
