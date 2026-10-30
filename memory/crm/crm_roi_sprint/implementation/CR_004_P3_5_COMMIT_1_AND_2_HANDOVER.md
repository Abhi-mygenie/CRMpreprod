# CR-004 P3.5 — Commit 1 + Commit 2 Implementation Handover

**Parent plan**: `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md`
**This doc covers**: Commits 1 & 2 only. Commits 3–8 follow in separate handovers.
**Status**: `implementation_ready`
**Audience**: implementation agent (or main agent in implementation mode)
**Date**: 2026-05-28
**Branch**: `28-may`
**Environment**: preview pod `/app`; owner pushes to prod

---

## 0. Pre-flight checklist (implementation agent runs FIRST)

Run these in parallel before writing a single line:

```bash
# 0.1 Confirm working tree is the right repo + branch
cd /app && git rev-parse --abbrev-ref HEAD          # expect: 28-may (or detached HEAD on 28-may)
cd /app && git log --oneline -1                      # baseline commit before changes

# 0.2 Confirm services are running
sudo supervisorctl status                            # backend + frontend RUNNING
curl -s http://localhost:8001/api/health             # {"status":"healthy",...}

# 0.3 Confirm test infra is reachable
python -c "import pytest, motor; print(pytest.__version__, motor.__version__)"

# 0.4 Sanity: the file we're about to edit exists and has the expected size
wc -l /app/backend/core/whatsapp.py                  # expect: 601
wc -l /app/backend/server.py                          # expect: 123

# 0.5 Confirm baseline state of fields we will edit (no surprises)
grep -n "message_id=response_data.get" /app/backend/core/whatsapp.py
# expect ONE line: 114:            message_id=response_data.get("message_id") or response_data.get("msgid"),
```

If any of these fail or surprise you, **STOP** and escalate to main agent. Do not proceed.

---

## 1. COMMIT 1 — Foundations (state machine + tests, no behavior change)

### 1.1 What Commit 1 ships

**Two NEW files. ZERO edits to existing files.**

| File | Type | LoC | Imports |
|---|---|---|---|
| `backend/core/whatsapp_status.py` | NEW module (pure functions) | ~40 | none |
| `backend/tests/test_whatsapp_status_machine.py` | NEW pytest tests | ~80 | `pytest`, our new module |

### 1.2 What Commit 1 does NOT ship

- ❌ No edits to `core/whatsapp.py`, `routers/whatsapp.py`, `server.py`, any callsite, any frontend file.
- ❌ No `.env` change.
- ❌ No DB index creation.
- ❌ No row-schema change.
- ❌ No supervisor restart needed (no behavior change).

### 1.3 File 1 — `backend/core/whatsapp_status.py` (CREATE NEW)

**Full content** (drop in verbatim):

```python
"""
WhatsApp message status state machine.

Pure functions, no I/O. Used by:
  - core.whatsapp.log_message_attempt          (initial send → pending/rejected)
  - routers.whatsapp.message_status_callback   (webhook → delivered/read/rejected)

States:
  None        — pre-send (no row yet)
  pending     — successfully submitted to AuthKey, awaiting delivery report
  delivered   — AuthKey reported delivered to handset
  read        — recipient opened the message (terminal)
  rejected    — send failed OR carrier rejected/undelivered (terminal)

Events:
  initial_send_success   — emitted by send-side after AuthKey accepts
  initial_send_failure   — emitted by send-side on send error
  delivered              — emitted by webhook on AuthKey delivery report
  read                   — emitted by webhook on AuthKey read report
  rejected               — emitted by webhook on failed/undelivered/rejected

Transition rules (locked, CR-004 P3.5 §5):
  - Only forward transitions are allowed.
  - Out-of-order events (e.g. delivered AFTER read) return None — caller MUST
    still append to status_history for audit but MUST NOT $set the status.
  - Duplicate transitions to the same state return None (idempotent webhook
    replays are silently dropped from status_history by the caller).
"""

from typing import Optional


ALLOWED_TRANSITIONS = {
    None: {
        "initial_send_success": "pending",
        "initial_send_failure": "rejected",
    },
    "pending": {
        "delivered": "delivered",
        "read": "read",
        "rejected": "rejected",
    },
    "delivered": {
        "read": "read",
        "rejected": "rejected",
    },
    "read": {
        # terminal — no forward transitions
    },
    "rejected": {
        # terminal — no forward transitions; /resend writes a new attempt row
    },
}

TERMINAL_STATUSES = frozenset({"read", "rejected"})


def next_status(current: Optional[str], event: str) -> Optional[str]:
    """
    Compute the next status given the current state and a transition event.

    Returns the new status if the transition is allowed, else None.
    Callers MUST treat None as "do not $set status" — but they MAY still
    record the event in status_history for audit.

    Examples:
        next_status(None, "initial_send_success") -> "pending"
        next_status("pending", "delivered")        -> "delivered"
        next_status("delivered", "read")           -> "read"
        next_status("read", "delivered")           -> None       # out-of-order
        next_status("rejected", "delivered")       -> None       # terminal
        next_status("pending", "unknown_event")    -> None
    """
    return ALLOWED_TRANSITIONS.get(current, {}).get(event)


def is_terminal(status: Optional[str]) -> bool:
    """True if status is a terminal state (no further transitions allowed)."""
    return status in TERMINAL_STATUSES
```

### 1.4 File 2 — `backend/tests/test_whatsapp_status_machine.py` (CREATE NEW)

**Full content** (drop in verbatim):

```python
"""
Unit tests for core.whatsapp_status state machine.

Pure tests — no DB, no network, no fixtures. Run with:
    cd /app/backend && python -m pytest tests/test_whatsapp_status_machine.py -v
"""

import pytest
from core.whatsapp_status import (
    next_status,
    is_terminal,
    TERMINAL_STATUSES,
    ALLOWED_TRANSITIONS,
)


class TestInitialTransitions:
    def test_none_to_pending_on_success(self):
        assert next_status(None, "initial_send_success") == "pending"

    def test_none_to_rejected_on_failure(self):
        assert next_status(None, "initial_send_failure") == "rejected"

    def test_none_with_unknown_event_returns_none(self):
        assert next_status(None, "delivered") is None
        assert next_status(None, "random_event") is None


class TestPendingTransitions:
    def test_pending_to_delivered(self):
        assert next_status("pending", "delivered") == "delivered"

    def test_pending_to_read_direct(self):
        # AuthKey may skip 'delivered' and go straight to 'read' for fast reads
        assert next_status("pending", "read") == "read"

    def test_pending_to_rejected(self):
        assert next_status("pending", "rejected") == "rejected"

    def test_pending_duplicate_no_op(self):
        # Replayed 'sent → pending' webhook
        assert next_status("pending", "initial_send_success") is None


class TestDeliveredTransitions:
    def test_delivered_to_read(self):
        assert next_status("delivered", "read") == "read"

    def test_delivered_to_rejected_late_carrier_failure(self):
        assert next_status("delivered", "rejected") == "rejected"

    def test_delivered_duplicate_no_op(self):
        assert next_status("delivered", "delivered") is None


class TestTerminalStates:
    def test_read_is_terminal(self):
        assert is_terminal("read") is True
        assert next_status("read", "delivered") is None  # out-of-order
        assert next_status("read", "read") is None
        assert next_status("read", "rejected") is None

    def test_rejected_is_terminal(self):
        assert is_terminal("rejected") is True
        assert next_status("rejected", "delivered") is None
        assert next_status("rejected", "read") is None
        assert next_status("rejected", "rejected") is None

    def test_non_terminal_states(self):
        assert is_terminal("pending") is False
        assert is_terminal("delivered") is False
        assert is_terminal(None) is False


class TestInvariants:
    def test_terminal_set_matches_table(self):
        """Every state in TERMINAL_STATUSES has no outgoing transitions."""
        for terminal in TERMINAL_STATUSES:
            assert ALLOWED_TRANSITIONS.get(terminal, {}) == {}

    def test_all_target_states_are_known(self):
        """Every transition target must itself be a known state in the table."""
        known_states = set(ALLOWED_TRANSITIONS.keys())
        for source, transitions in ALLOWED_TRANSITIONS.items():
            for event, target in transitions.items():
                assert target in known_states, (
                    f"Transition {source!r}--{event}-->{target!r} targets unknown state"
                )
```

### 1.5 Verification — Commit 1

```bash
# 1.5.1 Files exist and have expected size
ls -la /app/backend/core/whatsapp_status.py /app/backend/tests/test_whatsapp_status_machine.py
wc -l /app/backend/core/whatsapp_status.py                # ~95 lines (incl. docstring)
wc -l /app/backend/tests/test_whatsapp_status_machine.py  # ~80 lines

# 1.5.2 Lint clean
ruff check /app/backend/core/whatsapp_status.py /app/backend/tests/test_whatsapp_status_machine.py

# 1.5.3 Unit tests pass
cd /app/backend && python -m pytest tests/test_whatsapp_status_machine.py -v
# expect: all tests PASSED

# 1.5.4 Module is importable from inside the app
cd /app/backend && python -c "from core.whatsapp_status import next_status, is_terminal; print(next_status(None, 'initial_send_success'))"
# expect: pending

# 1.5.5 Confirm NO other file was touched
cd /app && git status --porcelain
# expect: only 2 lines, both starting with '??' (untracked new files):
#   ?? backend/core/whatsapp_status.py
#   ?? backend/tests/test_whatsapp_status_machine.py

# 1.5.6 Backend still running (no restart needed)
curl -s http://localhost:8001/api/health
# expect: {"status":"healthy",...}
```

### 1.6 Acceptance — Commit 1

- [ ] `backend/core/whatsapp_status.py` exists with content matching §1.3.
- [ ] `backend/tests/test_whatsapp_status_machine.py` exists with content matching §1.4.
- [ ] `ruff check` is clean for both files.
- [ ] `pytest tests/test_whatsapp_status_machine.py -v` shows **all tests pass** (12+ test methods across 5 test classes).
- [ ] `git status --porcelain` shows exactly 2 untracked files, no modified files.
- [ ] Backend `/api/health` still responds (no restart performed, none needed).
- [ ] No log lines in `/var/log/supervisor/backend.err.log` newer than the start of Commit 1.

**STOP point**: do not proceed to Commit 2 until all 6 checkboxes pass.

---

## 2. COMMIT 2 — Send-side row schema (Phase 1; G1, G2, G3, G4, G5, G6, G7, G8, G9, G10)

### 2.1 What Commit 2 ships

**One MODIFIED file + one MODIFIED file. Zero new files.**

| File | Change | LoC delta |
|---|---|---|
| `backend/core/whatsapp.py` | 5 search/replace edits in §2.4 | ~+90 / -25 |
| `backend/server.py` | 1 insertion of 4 new index lines | ~+5 |

### 2.2 What Commit 2 does NOT ship

- ❌ Does not touch `routers/whatsapp.py` (webhook still uses old field name; that's Commit 5).
- ❌ Does not touch `send_test_message` (that's Commit 4).
- ❌ Does not modify ANY callsite of `trigger_whatsapp_event` (callsite enrichment is Commit 3).
- ❌ Does not render `message_body_text` — field is always written as `None` in Commit 2; rendering helper deferred to a future commit (template bodies are not in our DB; rendering would need a cache layer — out of scope).
- ❌ Does not touch the frontend.

### 2.3 Current-state inspection (verbatim — sanity baseline)

Before editing, the implementation agent MUST confirm these line ranges look exactly like below in the live file. If any line is different, **STOP** and escalate.

#### 2.3.1 `backend/core/whatsapp.py` lines 30-37 — `SendResult` dataclass (BEFORE)
```python
@dataclass
class SendResult:
    """Result of a send operation"""
    success: bool
    phone: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    response_data: Optional[Dict] = None
```

#### 2.3.2 `backend/core/whatsapp.py` lines 109-125 — success/failure return (BEFORE)
```python
            if is_success:
                logger.info(f"WhatsApp sent successfully to {message.phone}")
                return SendResult(
                    success=True,
                    phone=message.phone,
                    message_id=response_data.get("message_id") or response_data.get("msgid"),
                    response_data=response_data
                )
            else:
                error_msg = response_data.get("message") or response_data.get("error") or str(response_data)
                logger.error(f"WhatsApp send failed for {message.phone}: {error_msg}")
                return SendResult(
                    success=False,
                    phone=message.phone,
                    error=error_msg,
                    response_data=response_data
                )
```

#### 2.3.3 `backend/core/whatsapp.py` lines 183-189 — bulk result packing (BEFORE)
```python
        for result in batch_results:
            results["results"].append({
                "phone": result.phone,
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error
            })
```

#### 2.3.4 `backend/core/whatsapp.py` lines 389-439 — `log_message_attempt` (BEFORE)
```python
async def log_message_attempt(
    db,
    user_id: str,
    customer_id: str,
    phone: str,
    event_type: str,
    template_id: str,
    result: SendResult,
    template_name: str = None,
    campaign_id: str = None,
    country_code: str = "91",
    body_values: Dict = None,
    customer_name: str = None
):
    """Log a WhatsApp message attempt to database for status tracking"""
    import uuid
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Map result to status
    status = "pending" if result.success else "rejected"
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "customer_id": customer_id,
        "customer_name": customer_name or "",
        "customer_phone": phone,
        "country_code": country_code,
        "event_type": event_type,
        "template_id": template_id,
        "template_name": template_name or "",
        "campaign_id": campaign_id,
        "status": status,
        "message_id": result.message_id,
        "error": result.error,
        "body_values": body_values or {},
        "resend_count": 0,
        "status_history": [
            {
                "status": status,
                "timestamp": now,
                "action": "initial_send"
            }
        ],
        "created_at": now,
        "updated_at": now
    }
    
    await db.whatsapp_message_logs.insert_one(log_entry)
    return log_entry
```

#### 2.3.5 `backend/core/whatsapp.py` lines 556-572 — log_message_attempt call inside trigger (BEFORE)
```python
        # 6. Send message
        logger.info(f"Triggering WhatsApp for event {event_type} to {phone}")
        result = await send_single_message(api_key, message)
        
        # 7. Log the attempt with full details
        await log_message_attempt(
            db, user_id, customer.get("id"), phone,
            event_type, template_id, result,
            template_name=config.get("template_name"),
            campaign_id=event_data.get("campaign_id") if event_data else None,
            country_code=country_code,
            body_values=body_values,
            customer_name=customer.get("name")
        )
        
        return result
```

#### 2.3.6 `backend/server.py` lines 25-44 — startup indexes (BEFORE)
```python
    # Startup
    start_scheduler()
    # Create indexes for order_items collection (AI query performance)
    await db.order_items.create_index("customer_id")
    await db.order_items.create_index("item_name")
    await db.order_items.create_index("order_id")
    # POS-CRM Cross-Sell: compound indexes for order suggestions performance
    await db.orders.create_index([("user_id", 1), ("customer_id", 1)], name="idx_user_customer")
    await db.orders.create_index([("user_id", 1), ("created_at", -1)], name="idx_user_created")
    await db.order_items.create_index([("user_id", 1), ("customer_id", 1)], name="idx_oi_user_customer")
    # CR-001B-fix Phase 2A F9: persistent migration_sync_logs collection
    # Composite index for "latest log per user per sync_type" lookups (status endpoint fallback)
    await db.migration_sync_logs.create_index(
        [("user_id", 1), ("sync_type", 1), ("started_at", -1)],
        name="user_synctype_started_idx",
    )
    # CR-001C-C V1: ensure coupon_usage idempotency + scan indexes exist.
    await ensure_coupon_indexes(db)
```

### 2.4 Edits — exact search/replace blocks

> Implementation agent: apply these via `mcp_search_replace`. Each `old_str` is unique in the file; verify with `grep -c` if uncertain. Apply in the order listed.

#### EDIT 2.4.1 — Expand `SendResult` dataclass (G5)

**Tool**: `mcp_search_replace`
**File**: `/app/backend/core/whatsapp.py`

**old_str**:
```python
@dataclass
class SendResult:
    """Result of a send operation"""
    success: bool
    phone: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    response_data: Optional[Dict] = None
```

**new_str**:
```python
@dataclass
class SendResult:
    """Result of a send operation"""
    success: bool
    phone: str
    message_id: Optional[str] = None
    error: Optional[str] = None
    response_data: Optional[Dict] = None
    http_status: Optional[int] = None           # CR-004 P3.5: AuthKey HTTP status (200/4xx/5xx)
    raw_response: Optional[Dict] = None         # CR-004 P3.5: alias of response_data, kept for clarity in logs
```

**Why**: row at send time must capture the AuthKey raw response and HTTP status for audit (G5).

---

#### EDIT 2.4.2 — Extract `logid` from AuthKey response, capture http_status + raw (G1, G2, G5)

**Tool**: `mcp_search_replace`
**File**: `/app/backend/core/whatsapp.py`

**old_str**:
```python
            if is_success:
                logger.info(f"WhatsApp sent successfully to {message.phone}")
                return SendResult(
                    success=True,
                    phone=message.phone,
                    message_id=response_data.get("message_id") or response_data.get("msgid"),
                    response_data=response_data
                )
            else:
                error_msg = response_data.get("message") or response_data.get("error") or str(response_data)
                logger.error(f"WhatsApp send failed for {message.phone}: {error_msg}")
                return SendResult(
                    success=False,
                    phone=message.phone,
                    error=error_msg,
                    response_data=response_data
                )
```

**new_str**:
```python
            # CR-004 P3.5 G1: AuthKey's canonical id field is `logid` (lowercase,
            # confirmed from real webhook sample 2026-05-28). Keep camelCase/snake_case
            # variants as defensive fallbacks but lowercase is authoritative.
            extracted_logid = (
                response_data.get("logid")
                or response_data.get("LogID")
                or response_data.get("log_id")
                or response_data.get("message_id")
                or response_data.get("msgid")
            )

            if is_success:
                logger.info(f"WhatsApp sent successfully to {message.phone} (logid={extracted_logid})")
                return SendResult(
                    success=True,
                    phone=message.phone,
                    message_id=extracted_logid,
                    response_data=response_data,
                    http_status=response.status_code,
                    raw_response=response_data,
                )
            else:
                error_msg = response_data.get("message") or response_data.get("error") or str(response_data)
                logger.error(f"WhatsApp send failed for {message.phone}: {error_msg}")
                return SendResult(
                    success=False,
                    phone=message.phone,
                    error=error_msg,
                    response_data=response_data,
                    http_status=response.status_code,
                    raw_response=response_data,
                )
```

**Why**: G1 — `message_id` was previously always `None` because we read the wrong keys. G5 — capture `http_status` and `raw_response` on both branches so the row at send time has the full AuthKey response.

**Note**: `http_status` is **not** set on the `httpx.TimeoutException` or generic `except Exception` branches (lines 127-140) — those paths never received a response. Leaving them unchanged is intentional (`http_status=None` signals "no response").

---

#### EDIT 2.4.3 — Carry `http_status` + `raw_response` through bulk packing (G2)

**Tool**: `mcp_search_replace`
**File**: `/app/backend/core/whatsapp.py`

**old_str**:
```python
        for result in batch_results:
            results["results"].append({
                "phone": result.phone,
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error
            })
```

**new_str**:
```python
        for result in batch_results:
            results["results"].append({
                "phone": result.phone,
                "success": result.success,
                "message_id": result.message_id,
                "error": result.error,
                "http_status": result.http_status,         # CR-004 P3.5 G2
                "raw_response": result.raw_response,       # CR-004 P3.5 G2
            })
```

**Why**: G2 — once G1 fixes single send, bulk inherits the fix; we just propagate the new fields through the result list. No live caller depends on this shape today (segment broadcast not built yet), so this is forward-compatible only.

---

#### EDIT 2.4.4 — Replace `log_message_attempt` (G3, G4, G5, G6, G7, G9, G10)

**Tool**: `mcp_search_replace`
**File**: `/app/backend/core/whatsapp.py`

**old_str**:
```python
async def log_message_attempt(
    db,
    user_id: str,
    customer_id: str,
    phone: str,
    event_type: str,
    template_id: str,
    result: SendResult,
    template_name: str = None,
    campaign_id: str = None,
    country_code: str = "91",
    body_values: Dict = None,
    customer_name: str = None
):
    """Log a WhatsApp message attempt to database for status tracking"""
    import uuid
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Map result to status
    status = "pending" if result.success else "rejected"
    
    log_entry = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "customer_id": customer_id,
        "customer_name": customer_name or "",
        "customer_phone": phone,
        "country_code": country_code,
        "event_type": event_type,
        "template_id": template_id,
        "template_name": template_name or "",
        "campaign_id": campaign_id,
        "status": status,
        "message_id": result.message_id,
        "error": result.error,
        "body_values": body_values or {},
        "resend_count": 0,
        "status_history": [
            {
                "status": status,
                "timestamp": now,
                "action": "initial_send"
            }
        ],
        "created_at": now,
        "updated_at": now
    }
    
    await db.whatsapp_message_logs.insert_one(log_entry)
    return log_entry
```

**new_str**:
```python
async def log_message_attempt(
    db,
    user_id: str,
    customer_id: Optional[str],
    phone: str,
    event_type: str,
    template_id: str,
    result: SendResult,
    template_name: Optional[str] = None,
    campaign_id: Optional[str] = None,
    country_code: str = "91",
    body_values: Optional[Dict] = None,
    customer_name: Optional[str] = None,
    # CR-004 P3.5 — new fields
    reference_type: Optional[str] = None,       # G3: "order" | "coupon" | "feedback" | "wallet_tx" | "points_tx" | "customer"
    reference_id: Optional[str] = None,         # G3
    pos_order_id: Optional[str] = None,         # G3 (denormalized for filtering)
    idempotency_key: Optional[str] = None,      # G6: unique-per-user prevents double-fires
    is_test: bool = False,                       # G7
    media_url: Optional[str] = None,             # G10
    media_filename: Optional[str] = None,        # G10
    message_body_text: Optional[str] = None,     # G4 (always None in Commit 2; rendering deferred)
    channel: str = "wp",                         # webhook field, default at send
):
    """
    Log a WhatsApp message attempt to whatsapp_message_logs.

    CR-004 P3.5: writes the complete row schema (§4 of plan) at send time so
    the webhook only has to update status + timestamps + reason later.

    Idempotency: if (user_id, idempotency_key) already exists, this call is a
    no-op (logs INFO, returns the existing row). Prevents duplicate WhatsApps
    on POS retries or cron re-runs.

    Returns: the inserted row (or existing row on idempotency hit).
    """
    import uuid

    now = datetime.now(timezone.utc).isoformat()
    status = "pending" if result.success else "rejected"

    # CR-004 P3.5 G9: normalize country_code to digits-only ("91", not "+91")
    cc_normalized = (country_code or "91").replace("+", "").strip() or "91"

    log_entry = {
        # Identity & ownership
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "is_test": is_test,

        # Reference back to triggering object
        "event_type": event_type,
        "reference_type": reference_type,
        "reference_id": reference_id,
        "pos_order_id": pos_order_id,
        "idempotency_key": idempotency_key,

        # Recipient
        "customer_id": customer_id,
        "customer_name": customer_name or "",
        "customer_phone": phone,
        "country_code": cc_normalized,

        # Template
        "template_id": template_id,
        "template_name": template_name or "",
        "campaign_id": campaign_id,

        # What was sent
        "body_values": body_values or {},
        "message_body_text": message_body_text,    # G4: always None in Commit 2
        "media_url": media_url,
        "media_filename": media_filename,
        "channel": channel,

        # AuthKey send-time response (G5)
        "message_id": result.message_id,
        "authkey_http_status": result.http_status,
        "authkey_raw_response": result.raw_response,

        # AuthKey webhook-derived fields (populated later by webhook)
        "meta_message_id": None,
        "keypress": None,
        "button_param_value": None,
        "time_raw": None,
        "mobile_mismatch": False,

        # Lifecycle
        "status": status,
        "delivered_at": None,
        "read_at": None,
        "rejected_at": now if status == "rejected" else None,
        "failure_reason": result.error if status == "rejected" else None,
        "error": result.error,
        "resend_count": 0,
        "last_resend_at": None,

        # Audit
        "status_history": [
            {
                "status": status,
                "timestamp": now,
                "action": "initial_send",
            }
        ],
        "created_at": now,
        "updated_at": now,
    }

    # CR-004 P3.5 G6: idempotency. Unique sparse index on (user_id, idempotency_key)
    # rejects duplicates. We catch and treat as no-op.
    try:
        await db.whatsapp_message_logs.insert_one(log_entry)
    except Exception as exc:
        # DuplicateKeyError surfaces as Exception from motor; check by name to
        # avoid importing pymongo errors here.
        if exc.__class__.__name__ == "DuplicateKeyError" and idempotency_key:
            logger.info(
                f"Idempotency hit on {event_type} for user={user_id} "
                f"key={idempotency_key!r}; skipping duplicate send-log."
            )
            existing = await db.whatsapp_message_logs.find_one(
                {"user_id": user_id, "idempotency_key": idempotency_key},
                {"_id": 0},
            )
            return existing
        # Any other exception: re-raise so trigger_whatsapp_event's outer try/except
        # records it and we don't silently drop messages.
        raise

    return log_entry
```

**Why**: G3 + G4 + G5 + G6 + G7 + G9 + G10 — full new row schema per plan §4.

**Note on signature**: all new parameters have defaults, so existing callers (Commit 3 enriches them but doesn't have to atomically) continue to work. Backward-compatible.

---

#### EDIT 2.4.5 — Pass new params through `trigger_whatsapp_event` + always-log on failure (G3, G6, G8)

**Tool**: `mcp_search_replace`
**File**: `/app/backend/core/whatsapp.py`

**old_str**:
```python
        # 6. Send message
        logger.info(f"Triggering WhatsApp for event {event_type} to {phone}")
        result = await send_single_message(api_key, message)
        
        # 7. Log the attempt with full details
        await log_message_attempt(
            db, user_id, customer.get("id"), phone,
            event_type, template_id, result,
            template_name=config.get("template_name"),
            campaign_id=event_data.get("campaign_id") if event_data else None,
            country_code=country_code,
            body_values=body_values,
            customer_name=customer.get("name")
        )
        
        return result
        
    except Exception as e:
        logger.error(f"WhatsApp trigger error for {event_type}: {str(e)}")
        return None
```

**new_str**:
```python
        # 6. Send message
        logger.info(f"Triggering WhatsApp for event {event_type} to {phone}")
        result = await send_single_message(api_key, message)

        # 7. Log the attempt with full details (CR-004 P3.5: complete row schema)
        ed = event_data or {}
        await log_message_attempt(
            db, user_id, customer.get("id"), phone,
            event_type, template_id, result,
            template_name=config.get("template_name"),
            campaign_id=ed.get("campaign_id"),
            country_code=country_code,
            body_values=body_values,
            customer_name=customer.get("name"),
            # CR-004 P3.5 — extract enrichment fields from event_data (callsites add these in Commit 3)
            reference_type=ed.get("reference_type"),
            reference_id=ed.get("reference_id"),
            pos_order_id=ed.get("pos_order_id"),
            idempotency_key=ed.get("idempotency_key"),
            is_test=False,
            media_url=ed.get("media_url"),
            media_filename=ed.get("media_filename"),
            message_body_text=None,   # G4: deferred (template body not in our DB)
            channel="wp",
        )

        return result

    except Exception as e:
        # CR-004 P3.5 G8: failures BEFORE send still produce a visible row. No silent black holes.
        logger.error(f"WhatsApp trigger error for {event_type} (user={user_id}, customer={customer.get('id')}): {str(e)}")
        try:
            ed = event_data or {}
            failed_result = SendResult(
                success=False,
                phone=(customer.get("phone") or "").replace(" ", "").replace("-", ""),
                error=f"trigger_error: {str(e)}",
            )
            await log_message_attempt(
                db,
                user_id,
                customer.get("id"),
                failed_result.phone,
                event_type,
                "",  # template_id unknown at this point
                failed_result,
                template_name=None,
                campaign_id=ed.get("campaign_id"),
                country_code=(customer.get("country_code", "+91") or "+91").replace("+", ""),
                body_values=None,
                customer_name=customer.get("name"),
                reference_type=ed.get("reference_type"),
                reference_id=ed.get("reference_id"),
                pos_order_id=ed.get("pos_order_id"),
                idempotency_key=ed.get("idempotency_key"),
                is_test=False,
                channel="wp",
            )
        except Exception as inner_exc:
            # Last-resort: log to file so a missing row is at least discoverable in supervisor logs
            logger.exception(
                f"FATAL: failed to log trigger_error row for event={event_type} "
                f"user={user_id} customer={customer.get('id')} inner_exc={inner_exc}"
            )
        return None
```

**Why**:
- G3 — `reference_type`, `reference_id`, `pos_order_id`, `idempotency_key` are read from `event_data` (callsites populate these in Commit 3; until then, all are None and the row writes cleanly).
- G6 — `idempotency_key` flows from event_data through to the unique sparse index.
- G8 — the new outer except now produces a `rejected` row instead of silently returning None. If even that fails, a FATAL is logged to supervisor.

---

#### EDIT 2.4.6 — `server.py` — add 4 new indexes for `whatsapp_message_logs` + `whatsapp_callback_logs`

**Tool**: `mcp_search_replace`
**File**: `/app/backend/server.py`

**old_str**:
```python
    # CR-001C-C V1: ensure coupon_usage idempotency + scan indexes exist.
    await ensure_coupon_indexes(db)
```

**new_str**:
```python
    # CR-001C-C V1: ensure coupon_usage idempotency + scan indexes exist.
    await ensure_coupon_indexes(db)

    # CR-004 P3.5: WhatsApp message logs + callback logs indexes (additive, sparse-safe).
    await db.whatsapp_message_logs.create_index(
        [("user_id", 1), ("created_at", -1)], name="idx_wml_user_created"
    )
    await db.whatsapp_message_logs.create_index(
        [("user_id", 1), ("status", 1)], name="idx_wml_user_status"
    )
    await db.whatsapp_message_logs.create_index(
        "message_id", sparse=True, name="idx_wml_message_id"
    )
    await db.whatsapp_message_logs.create_index(
        [("user_id", 1), ("idempotency_key", 1)],
        unique=True, sparse=True, name="idx_wml_user_idem",
    )
    await db.whatsapp_callback_logs.create_index(
        [("received_at", -1)], name="idx_wcl_received"
    )
    await db.whatsapp_callback_logs.create_index(
        "logid", sparse=True, name="idx_wcl_logid"
    )
```

**Why**: per plan §4. All sparse — won't fail on existing rows without these fields. The unique-sparse on `(user_id, idempotency_key)` is what enforces G6.

**Note**: `whatsapp_callback_logs` collection doesn't exist yet — Mongo creates it on first insert in Commit 5. Index creation against a non-existent collection is a no-op in Motor; no error.

### 2.5 Verification — Commit 2

```bash
# 2.5.1 Lint
ruff check /app/backend/core/whatsapp.py /app/backend/server.py
# expect: no issues

# 2.5.2 Existing Phase-1/Phase-2 tests still pass (regression guard)
cd /app/backend && python -m pytest tests/test_whatsapp_resolver.py tests/test_whatsapp_p2_5_expansion.py tests/test_whatsapp_text_mode.py tests/test_whatsapp_variables_endpoint.py -v
# expect: all PASSED (no regression from refactor)

# 2.5.3 Restart backend to apply new indexes
sudo supervisorctl restart backend
sleep 3
curl -s http://localhost:8001/api/health
# expect: {"status":"healthy",...}

# 2.5.4 Confirm new indexes were created on remote Mongo (read-only check)
python3 -c "
from pymongo import MongoClient
import os, dotenv
dotenv.load_dotenv('/app/backend/.env')
c = MongoClient(os.environ['MONGO_URL'])
db = c[os.environ['DB_NAME']]
for name in ['whatsapp_message_logs', 'whatsapp_callback_logs']:
    print(f'--- {name} indexes ---')
    for idx in db[name].list_indexes():
        print(' ', idx['name'], idx.get('key'), 'sparse=', idx.get('sparse', False), 'unique=', idx.get('unique', False))
"
# expect to see: idx_wml_user_created, idx_wml_user_status, idx_wml_message_id (sparse),
#                idx_wml_user_idem (sparse + unique), idx_wcl_received, idx_wcl_logid (sparse)

# 2.5.5 Sanity: no row written during this step (we are NOT writing any test data)
# The indexes are additive; no rows touched.

# 2.5.6 Inspect supervisor logs for any new errors
tail -n 50 /var/log/supervisor/backend.err.log
# expect: clean — uvicorn startup complete, no tracebacks
```

### 2.6 Acceptance — Commit 2

- [ ] All 5 edits in §2.4 applied successfully via `mcp_search_replace`.
- [ ] `ruff check` is clean for `core/whatsapp.py` and `server.py`.
- [ ] All 4 existing WhatsApp test files in §2.5.2 pass without modification.
- [ ] Backend restarted cleanly, `/api/health` green.
- [ ] All 6 new indexes visible on `whatsapp_message_logs` + `whatsapp_callback_logs` (§2.5.4).
- [ ] No new tracebacks in `backend.err.log` (§2.5.6).
- [ ] `git status --porcelain` shows exactly 2 modified files (`backend/core/whatsapp.py`, `backend/server.py`).
- [ ] Manually verified by `grep -n "logid" /app/backend/core/whatsapp.py` — extraction now mentions `logid` (lowercase, was absent before).

### 2.7 Behavioral expectations after Commit 2

After Commit 2 alone (without Commit 3), here's what changes in production behavior:

| Behavior | Before Commit 2 | After Commit 2 |
|---|---|---|
| `message_id` on new rows | always `None` | populated from AuthKey `logid` |
| `authkey_raw_response` on new rows | absent | populated with full AuthKey response body |
| `authkey_http_status` on new rows | absent | populated with 200/4xx/5xx |
| `rejected_at` / `failure_reason` | absent | populated on initial-send failures |
| Trigger exception (template missing, var resolution error) | silent `None` return, no row | `rejected` row written with `error="trigger_error: ..."` |
| `idempotency_key` field on rows | absent | present but `null` until Commit 3 enriches callsites |
| `is_test` field on rows | absent | present, always `false` (Commit 4 enables `true` for `/test-template`) |
| Webhook behavior | unchanged | unchanged (still broken — fixed in Commit 5) |
| Dashboard | unchanged | unchanged (still shows Pending forever — fixed once Commits 5+7 land) |
| Idempotency enforcement | none | unique sparse index exists but no key is being written yet (Commit 3) |

**Net**: Commit 2 fixes the data being recorded going forward, but the **dashboard does not visibly change yet** until Commit 5 (webhook) + Commit 7 (frontend) land. This is expected and correct — clean refactor in slices.

---

## 3. Rollback procedure (per commit)

### 3.1 Rolling back Commit 1
```bash
rm /app/backend/core/whatsapp_status.py
rm /app/backend/tests/test_whatsapp_status_machine.py
# No restart needed — nothing imports them yet.
```

### 3.2 Rolling back Commit 2
```bash
# Best: git revert / git checkout the two files at the pre-commit SHA.
cd /app && git checkout HEAD~1 -- backend/core/whatsapp.py backend/server.py
sudo supervisorctl restart backend
# The new indexes on Mongo are harmless if left (sparse, additive). To remove them:
python3 -c "
from pymongo import MongoClient
import os, dotenv
dotenv.load_dotenv('/app/backend/.env')
c = MongoClient(os.environ['MONGO_URL'])
db = c[os.environ['DB_NAME']]
for n in ['idx_wml_user_created','idx_wml_user_status','idx_wml_message_id','idx_wml_user_idem']:
    try: db.whatsapp_message_logs.drop_index(n)
    except Exception: pass
for n in ['idx_wcl_received','idx_wcl_logid']:
    try: db.whatsapp_callback_logs.drop_index(n)
    except Exception: pass
print('indexes dropped')
"
```
(But owner has approved leaving indexes — they are harmless and additive.)

---

## 4. Handoff to Commit 3 (not in this doc)

Once Commit 2 acceptance passes, the next handover doc will cover:

- Commit 3 — Callsite enrichment (8 backend files, ~22 callsites) injecting `idempotency_key`, `reference_type`, `reference_id`, `pos_order_id` into each `event_data` dict.
- After Commit 3, the unique-sparse `idempotency_key` index actually starts enforcing: POS retries of the same `send_bill` event no longer double-send WhatsApps.

Commit 3 has no DB-schema change, no row schema change, no new files. Pure callsite updates.

---

## 5. Notes for the implementation agent

1. **Do not run the testing subagent** as part of Commits 1 or 2. The user has been explicit (see PRD §1.5: "Per instructions: did NOT run the testing agent"). Use only:
   - `ruff check` for lint.
   - `pytest` on the new unit-test file + existing regression files for self-verification.
   - `curl /api/health` for service-up check.
   - One read-only Mongo probe for index verification.
2. **Do not write to the remote Mongo** outside of what the running app does naturally. The Mongo probe in §2.5.4 is **read-only** (`list_indexes`); never insert/update/delete from a script.
3. **Do not modify any file outside §2.4's manifest.** Specifically: do not touch `routers/whatsapp.py`, any callsite, the frontend, or `.env`.
4. **Do not skip the pre-flight (§0).** A wrong branch / different file state will silently invalidate the search/replace strings.
5. **Apply edits in §2.4 in order.** Each `old_str` is unique in the current file state; reordering may break uniqueness if an earlier edit changes context.
6. **Each edit is independently revertable** — if any single edit fails verification (§2.5), revert just that file with `git checkout` and re-investigate.
7. **No emoji in code or docs.** Keep with existing convention.
8. **Run lint AFTER all edits in §2.4 are applied**, not after each individual edit.

End of handover.
