"""
BUG-011 read-time aggregation of campaign run stats.

Verifies _augment_run_stats():
  1. Aggregates delivered/read/sent/failed from whatsapp_message_logs by run id
     (using $or on reference_id and campaign_id for BUG-006 legacy compat).
  2. Zero-log runs preserve stored total_sent/total_failed and default
     total_delivered/total_read to 0.
  3. total_delivered subsumes read; total_read is only status==read.
  4. total_sent = sent + delivered + read (all successful provider handoffs).
  5. total_failed = failed + rejected.

The helper is exercised via a mocked db so no live data is needed.
"""
import asyncio
import sys
import types
from unittest.mock import AsyncMock, MagicMock

import pytest


def _install_db_stub():
    """Install a minimal core.database.db stub before routers.campaigns imports it."""
    mod = types.ModuleType("core.database")
    stub_db = MagicMock()
    stub_db.whatsapp_message_logs = MagicMock()
    mod.db = stub_db
    sys.modules["core.database"] = mod
    return stub_db


@pytest.fixture(scope="module")
def helper_and_db():
    stub_db = _install_db_stub()
    # Import the target function AFTER db stub is in place.
    # If routers.campaigns is already imported by another test, the module-level
    # `from core.database import db` binding is fixed — reload to pick up stub.
    if "routers.campaigns" in sys.modules:
        del sys.modules["routers.campaigns"]
    # Also stub deps that routers.campaigns imports at module level.
    if "core.auth" not in sys.modules:
        auth_mod = types.ModuleType("core.auth")
        auth_mod.get_current_user = lambda: None
        sys.modules["core.auth"] = auth_mod
    if "core.helpers" not in sys.modules:
        helpers_mod = types.ModuleType("core.helpers")
        helpers_mod.build_customer_query = lambda *a, **kw: {}
        sys.modules["core.helpers"] = helpers_mod
    if "core.whatsapp" not in sys.modules:
        wa_mod = types.ModuleType("core.whatsapp")
        wa_mod.WhatsAppMessage = type("WhatsAppMessage", (), {})
        wa_mod.send_bulk_messages = AsyncMock(return_value={"results": []})
        wa_mod.build_body_values = lambda *a, **kw: {}
        wa_mod.log_message_attempt = AsyncMock()
        wa_mod.get_user_authkey = AsyncMock(return_value=None)
        wa_mod.SendResult = type("SendResult", (), {})
        sys.modules["core.whatsapp"] = wa_mod

    from routers import campaigns as camp  # noqa: E402
    return camp._augment_run_stats, stub_db


class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def __aiter__(self):
        self._it = iter(self._rows)
        return self

    async def __anext__(self):
        try:
            return next(self._it)
        except StopIteration:
            raise StopAsyncIteration


def test_augment_run_stats_computes_counts(helper_and_db):
    augment, stub_db = helper_and_db
    runs = [
        {"id": "run-A", "total_sent": 99, "total_failed": 99},  # will be overwritten
        {"id": "run-B", "total_sent": 5,  "total_failed": 1},   # no logs — preserved
    ]
    # Simulate: run-A has 2 read, 3 delivered, 1 sent, 2 failed, 1 rejected
    stub_db.whatsapp_message_logs.aggregate = MagicMock(return_value=_FakeCursor([
        {"_id": {"run_key": "run-A", "status": "read"},      "count": 2},
        {"_id": {"run_key": "run-A", "status": "delivered"}, "count": 3},
        {"_id": {"run_key": "run-A", "status": "sent"},      "count": 1},
        {"_id": {"run_key": "run-A", "status": "failed"},    "count": 2},
        {"_id": {"run_key": "run-A", "status": "rejected"},  "count": 1},
    ]))

    out = asyncio.run(augment(runs, "user-1"))

    a = next(r for r in out if r["id"] == "run-A")
    assert a["total_read"] == 2
    assert a["total_delivered"] == 5          # delivered(3) + read(2)
    assert a["total_sent"] == 6               # sent(1) + delivered(3) + read(2)
    assert a["total_failed"] == 3             # failed(2) + rejected(1)

    b = next(r for r in out if r["id"] == "run-B")
    # Fallback: stored values preserved; delivered/read default to 0.
    assert b["total_sent"] == 5
    assert b["total_failed"] == 1
    assert b["total_delivered"] == 0
    assert b["total_read"] == 0


def test_augment_run_stats_legacy_campaign_id_field(helper_and_db):
    """CR-055-scan: legacy logs stored run id in campaign_id (pre-BUG-006).
    Aggregation must $or match on both reference_id and campaign_id."""
    augment, stub_db = helper_and_db
    runs = [{"id": "legacy-run", "total_sent": 0, "total_failed": 0}]
    # The $ifNull projection collapses either field into run_key — we just
    # confirm the helper trusts whatever run_key comes back from the pipeline.
    stub_db.whatsapp_message_logs.aggregate = MagicMock(return_value=_FakeCursor([
        {"_id": {"run_key": "legacy-run", "status": "delivered"}, "count": 4},
        {"_id": {"run_key": "legacy-run", "status": "read"},      "count": 1},
    ]))
    out = asyncio.run(augment(runs, "user-1"))
    assert out[0]["total_delivered"] == 5
    assert out[0]["total_read"] == 1
    assert out[0]["total_sent"] == 5
    assert out[0]["total_failed"] == 0

    # Sanity: pipeline actually used $or on both fields.
    call_args = stub_db.whatsapp_message_logs.aggregate.call_args
    pipeline = call_args[0][0]
    match_stage = pipeline[0]["$match"]
    or_clauses = match_stage["$or"]
    fields = {list(c.keys())[0] for c in or_clauses}
    assert fields == {"reference_id", "campaign_id"}


def test_augment_run_stats_empty_runs(helper_and_db):
    augment, _ = helper_and_db
    assert asyncio.run(augment([], "user-1")) == []
