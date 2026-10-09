"""BUG-2026-10-06-001 — non-QR policy decisions recorded on the allow path too.

Guards the API contract of POST /api/diagnostics/non-qr-block after the fix:
  * legacy block-shaped body (no `decision` / `allowed`) still returns 204 (regression V4)
  * allow-path body (`allowed: true` + reason) returns 204
  * block-path body with the new fields returns 204
  * `decision` longer than 40 chars is rejected with 422

Uses a sentinel restaurant_id so no real restaurant's bucket is touched.
Bucket eviction (200 blocked / 1000 allowed) is verified at DB level in the
Role 3 self-test, not here — the suite has no DB fixture.
"""
import pytest

pytestmark = pytest.mark.smoke

SENTINEL_RID = "test-bug-2026-10-06-001"
ENDPOINT = "/api/diagnostics/non-qr-block"

LEGACY_BODY = {
    "restaurant_id": SENTINEL_RID,
    "checkpoint": "landing",
    "scanned_room_or_table": None,
    "final_table_id": "0",
    "is_edit_mode": False,
    "is_authenticated": False,
}


def test_legacy_block_shape_still_204(http_client):
    resp = http_client.post(ENDPOINT, json=LEGACY_BODY)
    assert resp.status_code == 204


def test_allow_event_204(http_client):
    body = {**LEGACY_BODY, "checkpoint": "add_to_cart", "scanned_room_or_table": "walkin",
            "decision": "valid-qr", "allowed": True}
    resp = http_client.post(ENDPOINT, json=body)
    assert resp.status_code == 204


def test_block_event_204(http_client):
    body = {**LEGACY_BODY, "checkpoint": "place_order", "decision": "non-qr-dinein", "allowed": False}
    resp = http_client.post(ENDPOINT, json=body)
    assert resp.status_code == 204


def test_decision_too_long_422(http_client):
    body = {**LEGACY_BODY, "decision": "x" * 41, "allowed": True}
    resp = http_client.post(ENDPOINT, json=body)
    assert resp.status_code == 422
