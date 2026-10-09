"""CR-2026-10-03-003 — feedback moved to CRM POST /scan/feedback.

Guards that our backend no longer exposes or writes feedback:
  * POST /api/config/feedback and GET /api/config/feedback/{rid} are gone (404/405)
  * the neighbouring config route still answers (deletion did not break the router block)
  * static: server.py has no `db.feedback` / `FeedbackCreate` reference
"""
from pathlib import Path

import pytest

pytestmark = pytest.mark.smoke

SERVER_PY = Path(__file__).resolve().parents[2] / "server.py"


def test_post_config_feedback_gone(http_client):
    resp = http_client.post("/api/config/feedback", json={"restaurant_id": "478", "rating": 5, "message": "x", "name": "t"})
    assert resp.status_code in (404, 405)


def test_get_config_feedback_gone(http_client):
    resp = http_client.get("/api/config/feedback/478")
    assert resp.status_code in (404, 405)


def test_adjacent_config_route_alive(http_client):
    resp = http_client.get("/api/config/478")
    assert resp.status_code == 200


def test_no_db_feedback_reference():
    src = SERVER_PY.read_text(encoding="utf-8")
    assert "db.feedback" not in src
    assert "FeedbackCreate" not in src
