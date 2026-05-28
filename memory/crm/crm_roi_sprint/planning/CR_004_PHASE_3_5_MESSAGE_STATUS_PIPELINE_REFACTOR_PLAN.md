# CR-004 Phase 3.5 — Message Status Pipeline Refactor — Implementation Plan

**CR**: CR-004 WhatsApp Utility + Marketing → P3.5 Message Status Pipeline (post-P3 follow-up)
**Status**: `planning_complete_implementation_ready`
**Author**: E1
**Date opened**: 2026-05-28
**Last updated**: 2026-05-28 (B1 resolved — schema locked; all open questions closed)
**Tenant**: R689 Kunafa Mahal (live test target)
**Branch**: `28-may`
**Environment**: implement in preview pod (`/app`); owner pushes to production
**External DB**: `52.66.232.149:27017/mygenie` — **NO writes from this work** beyond normal app runtime; reads only via app code

---

## 1. Goal & Scope

### 1.1 Goal (one sentence)
Make `whatsapp_message_logs` the single, complete source of truth for the Message Status dashboard, so that (a) every send writes a fully populated row, (b) AuthKey's delivery-report webhook updates only `status` + timestamps + reason on that row, and (c) the dashboard renders directly from that row with no inference.

### 1.2 Architecture contract (locked)

```
TRIGGER → trigger_whatsapp_event() → AuthKey POST → response {LogID, Message, ...}
   ↓
A1. log_message_attempt() writes ONE complete row to whatsapp_message_logs
    {id, message_id=logid, status="pending"|"rejected", + every audit field}
   ↓
(async) AuthKey POSTs to webhook with {logid, status, time, mobile, meta_messageid, channel, ...}
   ↓
A2. webhook updates ONLY status + delivered_at/read_at/rejected_at + meta_message_id + failure_reason
    on row matched by message_id=logid; pushes raw payload to status_history
    and to whatsapp_callback_logs (audit)
   ↓
Dashboard reads whatsapp_message_logs — never reads from AuthKey live
```

### 1.3 In scope (this CR)
- **Phase 1** — Send-side row refactor: G1, G2, G3, G4, G5, G6, G7, G8, G9, G10.
- **Phase 2** — Schema unification: G11. (G12 legacy migration: **dropped**.)
- **Phase 3** — Webhook receive-side: G13, G14, G15, G16, G18 (all parser rules now locked post B1 resolution).
- **Phase 5** — Dashboard polish.

### 1.4 Out of scope (this CR)
- **G17** — HMAC verification activation (Blocker B2; env hook only, code dormant until secret lands).
- **G20** — AuthKey console URL registration (Blocker B3, owner-driven).
- **G21** — Preview/staging webhook strategy.
- **G22** — Historical backfill of `message_id=None` rows (owner declined).
- **G12** — Legacy `sent`/`failed` row migration (owner declined).

### 1.5 Locked decisions

| Decision | Value | Locked from |
|---|---|---|
| OTP idempotency | **Skipped for `reset_password`** — owner can re-request OTPs freely | Q1 reply |
| Cron idempotency window | **Daily** — `f"{customer_id}_{today_iso_date}_{event_type}"` | Q2 reply |
| `message_body_text` fallback | **None** — field left null if template body unknown | Q3 reply |
| "Show test sends" default | **OFF** — toggle in filter bar (default hides test rows from table + stats) | Q4 reply |
| Late `delivered` after `read` | **No status regression** — late event appended to `status_history` for audit, `status` stays `read` | Q5 reply |
| AuthKey webhook payload schema | **Locked** — see §3.6 | B1 reply |

---

## 2. Blockers — 1 resolved, 2 remaining (do not block any of Commits 1–7)

| # | Blocker | Status | Owner | Resolves what | Workaround in this CR |
|---|---|---|---|---|---|
| B1 | AuthKey delivery-report payload schema | ✅ **RESOLVED 2026-05-28** | Owner shared real sample | Final field-name parsing | Parser locked to exact keys; see §3.6 + §6.3 |
| B2 | AuthKey webhook signing secret | ✅ **RESOLVED 2026-05-28** (no secret needed) | n/a | G17 HMAC verification activation | **AuthKey does not sign webhooks.** Real sample headers (2026-05-28 15:48:23) carried no signature header (no `x-auth-signature`, no `authorization`, no `x-hmac`). AuthKey's only key is the outbound API key. Verifier in Commit 5 stays dormant forever (unless AuthKey adds signing later). See §13 Security Analysis for the defense-in-depth without HMAC. |
| B3 | AuthKey console URL registration (prod) | ⏳ Open | Owner (live-test time) | End-to-end verification | Code is verified via unit tests + curl probes; real Delivered/Read transitions only occur once owner registers the URL. **Architecture note**: AuthKey currently posts to `preprod.mygenie.online` (MyGenie's Laravel app) per evidence in B1 sample headers — owner needs to add a second URL pointing at our CRM, OR have Laravel forward, OR switch the URL. This is a B3 ops decision, not a code dependency. |

---

## 3. Code inspection — current state (read-only audit)

### 3.1 Backend files involved

| File | Lines | Role | Touched in this CR? |
|---|---|---|---|
| `backend/core/whatsapp.py` | 601 | All send-side logic; `send_single_message`, `send_bulk_messages`, `log_message_attempt`, `trigger_whatsapp_event`, `trigger_points_earned_event`, `build_body_values`, `resolve_variable` | **YES — primary refactor** |
| `backend/routers/whatsapp.py` | 1051 | All WhatsApp HTTP endpoints incl. `/test-template`, `/message-logs`, `/message-stats`, `/message-filters`, `/status-callback`, `/resend` | **YES — webhook + test-send rewrite** |
| `backend/models/schemas.py` | 1208 | `POS_EVENTS`, `CRM_EVENTS`, `AUTOMATION_EVENTS` | **NO** — already correct post P3 |
| `backend/core/whatsapp_variables.py` | (registry) | Variable registry | NO |
| `backend/routers/pos.py` | 2853 | 4 trigger callsites: lines 1462, 1477, 1489, 2174 | **YES — pass `idempotency_key` into event_data** |
| `backend/routers/coupons.py` | — | 2 callsites (lines 258, 271) | **YES** — pass `idempotency_key` |
| `backend/routers/wallet.py` | — | 4 callsites (lines 55, 60, 65, 70) | **YES** — pass `idempotency_key` from wallet `transaction_id` |
| `backend/routers/points.py` | — | 3 callsites (lines 133, 137, 143) | **YES** — same pattern |
| `backend/routers/auth.py` | — | 1 callsite (line 515) — `reset_password` | **YES** — NO idempotency_key (locked decision §1.5) |
| `backend/services/feedback_service.py` | — | 1 callsite (line 59) | **YES** — `idempotency_key = feedback_id` |
| `backend/core/loyalty.py` | — | 1 callsite (line 456) | **YES** — minor |
| `backend/core/loyalty_jobs.py` | — | 5 callsites (lines 105, 205, 288, 418, 457) — birthday, anniversary, points_expiring, coupon_expiring, inactive_customer | **YES** — daily idempotency keys |

### 3.2 Frontend files involved

| File | Lines | Role | Touched? |
|---|---|---|---|
| `frontend/src/pages/MessageStatusPage.jsx` | 537 | Dashboard | **YES — Phase 5 polish** |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | 1832 | Automation page; contains 3 legacy descriptions | **YES (small)** — dead-code drop (see §6.8) |
| `frontend/src/pages/DashboardPage.jsx` | — | Embeds `MessageStatusContent` | NO direct changes |
| `frontend/src/App.js` | — | Routes `/message-status` | NO |

### 3.3 Current `whatsapp_message_logs` row shapes (two writers — to be unified)

**Path A** — `core/whatsapp.py::log_message_attempt` (event triggers):
```python
{
  "id": uuid, "user_id", "customer_id", "customer_name", "customer_phone", "country_code",
  "event_type", "template_id", "template_name", "campaign_id",
  "status": "pending"|"rejected",
  "message_id": None,                # ← BUG G1: AuthKey returns logid, never extracted
  "error", "body_values",
  "resend_count": 0,
  "status_history": [{status, timestamp, action:"initial_send"}],
  "created_at", "updated_at"
}
```

**Path B** — `routers/whatsapp.py::send_test_message` (line 712):
```python
{
  "id": uuid, "user_id", "customer_id": None,
  "phone",                            # ← wrong field name (should be customer_phone)
  "event_type": "test", "template_id",
  "status": "sent"|"failed",          # ← values not in MESSAGE_STATUSES
  "message_id", "error", "body_values",
  "is_test": True,
  "created_at"
                                       # missing: customer_name, country_code, template_name,
                                       #          status_history, updated_at
}
```

### 3.4 Dead code identified

| Item | Where | Status | Action |
|---|---|---|---|
| `eventDescriptions["first_visit"]` | `WhatsAppAutomationContent.jsx:480` | Legacy — renamed to `welcome_message` in P3 | **DELETE** |
| `eventDescriptions["feedback_received"]` | `WhatsAppAutomationContent.jsx:483` | Legacy — renamed to `feedback_request` in P3 | **DELETE** |
| `eventDescriptions["inactive_reminder"]` | `WhatsAppAutomationContent.jsx:484` | Never in master list | **DELETE** |
| "Legacy descriptions" comment block | Same file, lines 475-485 | Old block boundary | Remove comment, promote still-active keys into `crmEventDescriptions` |

### 3.5 Collections involved

| Collection | Existing? | This CR action |
|---|---|---|
| `whatsapp_message_logs` | yes | new fields written; **no schema migration** |
| `whatsapp_event_template_map` | yes | unchanged |
| `whatsapp_template_variable_map` | yes | unchanged |
| `whatsapp_callback_logs` | **no** | **NEW** — created on first write, no migration |

### 3.6 AuthKey webhook payload — **LOCKED schema** (post B1)

Real sample captured 2026-05-28 15:48:23 IST (verbatim from owner-shared log):

```json
{
  "logid":          "6eec3f25a3434aad924c3ccca2009580",
  "mobile":         "919306459030",
  "status":         "delivered",
  "time":           "2026-05-28 15:48:22",
  "channel":        "wp",
  "meta_messageid": "wamid.HBgMOTE5MzA2NDU5MDMwFQIAERgSNkQzRUQ0RkI3RUEwM0M0Q0M2AA==",
  "keypress":       null,
  "button_param_value": "OTE2NTc3",
  "1": "NEW SMART 101",
  "2": "251.00",
  "3": "The Craft Restaurant",
  "4": "cash",
  "5": "May 28, 2026",
  "6": "0",
  "7": "0"
}
```

**Parser rules (locked):**

| AuthKey field | Mapping | Notes |
|---|---|---|
| `logid` | `message_id` lookup key | Lowercase, no underscore. Primary join. |
| `status` (lowercase) | Translation table below | Defensive fallback: unknown values → log, do not update |
| `time` (no TZ) | Parse as `Asia/Kolkata`, convert to UTC ISO 8601 | Single field, dispatch by `status` (see below) |
| `mobile` | Verification only: must equal `row.country_code + row.customer_phone` | If mismatch → set `mobile_mismatch=true`, still process |
| `channel` | `channel` (new field; default `"wp"` on send) | Future-proofs SMS/voice |
| `meta_messageid` | `meta_message_id` (new field, optional) | Meta WABA reconciliation aid |
| `keypress` | `keypress` (new field, optional) | Future button interactivity (CR-012) |
| `button_param_value` | `button_param_value` (new field, optional) | Future button payload (CR-012) |
| `"1"`–`"7"` | Verification only against `row.body_values` | v1: log mismatch only, no enforcement |

**Status translation (locked):**

| AuthKey `status` (lowercase) | Our `status` | Timestamp field set from `time` |
|---|---|---|
| `sent` | `pending` | (none — pending has no dedicated timestamp; `created_at` already set) |
| `delivered` | `delivered` | `delivered_at` |
| `read` | `read` | `read_at` |
| `failed` | `rejected` | `rejected_at` + `failure_reason="failed"` (overridable by payload.reason if present) |
| `undelivered` | `rejected` | `rejected_at` + `failure_reason="undelivered"` |
| `rejected` | `rejected` | `rejected_at` + `failure_reason="rejected"` |
| anything else | (no update) | Log to `whatsapp_callback_logs` with `verdict="unknown_status"` |

**Time parsing rule (locked):**

```python
# Webhook 'time' is local IST string "YYYY-MM-DD HH:MM:SS"
# Always store time_raw (verbatim) for audit
# Convert to UTC for derived timestamp fields
from zoneinfo import ZoneInfo
ist = ZoneInfo("Asia/Kolkata")
ts_local = datetime.strptime(payload["time"], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ist)
ts_utc_iso = ts_local.astimezone(timezone.utc).isoformat()
# If parsing fails: fall back to webhook-received-at (now_utc), log warning, still set time_raw
```

### 3.7 Endpoints involved

| Method | Path | Handler | Touched? |
|---|---|---|---|
| `POST` | `/api/whatsapp/status-callback` | `message_status_callback` | **REFACTOR** — locked parser, state machine, raw audit log |
| `POST` | `/api/whatsapp/test-template` | `send_test_message` | **REFACTOR** — call `log_message_attempt` (unify shape) |
| `GET` | `/api/whatsapp/message-logs` | `get_message_logs` | **EXTEND** — `is_test` filter, name search, regex escape, date range |
| `GET` | `/api/whatsapp/message-stats` | `get_message_stats` | **EXTEND** — exclude `is_test=true` by default |
| `GET` | `/api/whatsapp/message-filters` | `get_message_filters` | Minor — normalize template names for dedupe |
| `POST` | `/api/whatsapp/resend` | `resend_messages` | **HARDEN** — guard pending<30min, fix phone field |

---

## 4. Final row schema (`whatsapp_message_logs` — target after this CR)

```jsonc
{
  // Identity & ownership
  "id":              "uuid-v4",               // our PK
  "user_id":         "string",                // tenant
  "is_test":         false,                    // true only for /test-template sends

  // Reference back to triggering object
  "event_type":      "send_bill",
  "reference_type":  "order" | "coupon" | "feedback" | "wallet_tx" | "points_tx" | "customer" | null,
  "reference_id":    "869305",                // POS order_id / coupon_id / feedback_id / etc.
  "pos_order_id":    "869305",                // duplicated for fast filter on POS events
  "idempotency_key": "869305_send_bill",      // unique per (user_id, idempotency_key); null for reset_password

  // Recipient
  "customer_id":     "uuid-or-null",
  "customer_name":   "abhishek jain",
  "customer_phone":  "7505242126",            // digits only
  "country_code":    "91",                    // digits only

  // Template
  "template_id":     "26508",                 // AuthKey wid
  "template_name":   "send_bill_to_customer",
  "campaign_id":     null,                    // only for segment broadcasts

  // What was sent
  "body_values":     {"1": "...", "2": "...", ...},
  "message_body_text": "Rendered template text" | null,   // null if template body unknown (no fallback)
  "media_url":       null,
  "media_filename":  null,
  "channel":         "wp",                    // wp | sms | voice — default "wp" at send

  // AuthKey send-time response (captured fully)
  "message_id":              "6eec3f25...",   // = AuthKey logid (primary join key for webhook)
  "authkey_http_status":     200,
  "authkey_raw_response":    {"logid": "...", "Message": "Submitted Successfully"},

  // AuthKey webhook-derived fields (populated AFTER webhook arrives)
  "meta_message_id":         null,            // wamid.xxx== from webhook
  "keypress":                null,            // button click response (future)
  "button_param_value":      null,            // button payload (future)
  "time_raw":                null,            // verbatim "time" string from latest webhook (audit)
  "mobile_mismatch":         false,           // true if webhook.mobile != country_code+phone

  // Lifecycle
  "status":          "pending",                // pending | delivered | read | rejected
  "delivered_at":    null,                     // ISO UTC; from webhook (status=delivered)
  "read_at":         null,                     // ISO UTC; from webhook (status=read)
  "rejected_at":     null,                     // ISO UTC; send-time or carrier failure
  "failure_reason":  null,                     // "failed" | "undelivered" | "rejected" | initial-send error
  "error":           null,                     // send-time error string (only when initial status=rejected)
  "resend_count":    0,
  "last_resend_at":  null,

  // Audit
  "status_history": [
    {"status": "pending", "timestamp": "2026-05-28T09:00:00+00:00", "action": "initial_send"}
  ],
  "created_at":      "2026-05-28T09:00:00+00:00",
  "updated_at":      "2026-05-28T09:00:00+00:00"
}
```

### Field changes vs current

- **NEW (send-time)**: `is_test`, `reference_type`, `reference_id`, `pos_order_id`, `idempotency_key`, `message_body_text`, `media_url`, `media_filename`, `channel`, `authkey_http_status`, `authkey_raw_response`.
- **NEW (webhook-time, all post B1)**: `meta_message_id`, `keypress`, `button_param_value`, `time_raw`, `mobile_mismatch`, `delivered_at`, `read_at`, `rejected_at`, `failure_reason`, `last_resend_at`.
- **FIXED**: `message_id` actually populated from `logid`.
- **PATH B NORMALIZED**: `phone` → `customer_phone`, status values aligned, missing fields added.
- **NO MIGRATION**: existing rows keep their old shape; readers tolerate missing new fields (default `null` / `false`).

### Indexes to create (Mongo, additive, all sparse)

In `server.py` lifespan startup:

```python
await db.whatsapp_message_logs.create_index([("user_id", 1), ("created_at", -1)], name="idx_wml_user_created")
await db.whatsapp_message_logs.create_index([("user_id", 1), ("status", 1)],       name="idx_wml_user_status")
await db.whatsapp_message_logs.create_index("message_id", sparse=True,              name="idx_wml_message_id")
await db.whatsapp_message_logs.create_index(
    [("user_id", 1), ("idempotency_key", 1)], unique=True,
    partialFilterExpression={"idempotency_key": {"$exists": True, "$type": "string"}},
    name="idx_wml_user_idem",
)
# NOTE (Commit 2 lesson): sparse=True on a COMPOUND index does NOT exclude documents
# missing the secondary field; it indexes them as null and the unique constraint then
# explodes on >1 row. partialFilterExpression is the correct primitive.
await db.whatsapp_callback_logs.create_index([("received_at", -1)],                 name="idx_wcl_received")
await db.whatsapp_callback_logs.create_index("logid", sparse=True,                  name="idx_wcl_logid")
```

---

## 5. State machine (locked)

Pure function `core/whatsapp_status.next_status(current, event) -> Optional[str]`:

```
INITIAL: None
   └─ "initial_send_success" → pending
   └─ "initial_send_failure" → rejected

pending
   ├─ delivered → delivered
   ├─ read      → read
   ├─ rejected  → rejected

delivered
   ├─ read      → read
   ├─ rejected  → rejected  (rare late carrier failure)
   ├─ delivered → (no-op, dedupe)

read
   ├─ delivered → (no-op, log to history, no status change)  [Q5 decision]
   ├─ read      → (no-op, dedupe)
   ├─ <anything else> → (no-op, log warning)

rejected
   └─ <anything> → (no-op; rejected is terminal except via /resend, which writes a new attempt to history)
```

- Returns `None` for invalid transitions → caller logs warning, **still appends to `status_history`** for audit but does not `$set` the `status` field.
- Pure function, no DB, unit-testable.

---

## 6. Implementation breakdown — file-by-file

### 6.1 `backend/core/whatsapp.py` (primary refactor)

| Region | Lines | Change |
|---|---|---|
| `SendResult` dataclass | 30-37 | Add `http_status: Optional[int]`, `raw_response: Optional[Dict]` |
| `send_single_message` — id extraction | 114 | `message_id = response_data.get("logid") or response_data.get("LogID") or response_data.get("log_id") or response_data.get("message_id") or response_data.get("msgid")` — **`logid` lowercase first (matches AuthKey real response)** |
| `send_single_message` — return both branches | 109-125 | Populate `http_status=response.status_code`, `raw_response=response_data` on success AND failure paths |
| `send_bulk_messages` result packing | 184-189 | Add `http_status`, `raw_response` to each per-message dict |
| `log_message_attempt` signature | 389-402 | Add params: `reference_id`, `reference_type`, `pos_order_id`, `idempotency_key`, `is_test=False`, `media_url`, `media_filename`, `message_body_text`, `channel="wp"` |
| `log_message_attempt` body | 411-438 | Build new row shape (§4). Wrap `db.whatsapp_message_logs.insert_one` in try/except for `DuplicateKeyError` on `idempotency_key` — if duplicate, log INFO ("idempotency hit, skipping duplicate") and return existing row. |
| `trigger_whatsapp_event` | 442-576 | Wrap steps 1–4 in try/except so failure-before-send still calls `log_message_attempt` with `status="rejected"`, `error=<exception_message>`, `rejected_at=now_utc`. Compute `message_body_text` after `build_body_values`. Derive `reference_id`/`reference_type`/`pos_order_id`/`idempotency_key` from `event_data` (with sensible defaults). |
| New helper | (new, near bottom) | `render_template_body(db, user_id, template_id, body_values) -> Optional[str]` — fetches stored template body from `whatsapp_event_template_map.template_body` (if exists); substitutes `{{N}}` placeholders; returns rendered string or `None` (no fallback per §1.5 Q3) |

### 6.2 `backend/core/whatsapp_status.py` — **NEW FILE**

Pure helpers, no DB. ~40 lines.

```python
"""WhatsApp message status state machine. Pure functions, no IO."""

ALLOWED_TRANSITIONS = {
    None:        {"initial_send_success": "pending",
                  "initial_send_failure": "rejected"},
    "pending":   {"delivered": "delivered", "read": "read", "rejected": "rejected"},
    "delivered": {"read": "read", "rejected": "rejected"},
    "read":      {},   # terminal; out-of-order delivered ignored (Q5 decision)
    "rejected":  {},   # terminal
}

TERMINAL_STATUSES = {"read", "rejected"}

def next_status(current, event):
    """Return new status or None if transition not allowed (no-op signal)."""
    return ALLOWED_TRANSITIONS.get(current, {}).get(event)

def is_terminal(status):
    return status in TERMINAL_STATUSES
```

Unit tests: `backend/tests/test_whatsapp_status_machine.py` (~12 cases).

### 6.3 `backend/routers/whatsapp.py`

| Endpoint | Lines | Change |
|---|---|---|
| `send_test_message` | 656-740 | Replace inline `db.whatsapp_message_logs.insert_one` (line 726) with `log_message_attempt(... is_test=True, event_type="test", reference_type=None, channel="wp")`. Field becomes `customer_phone` not `phone`. Status `pending`/`rejected`. |
| `get_message_stats` | 747-786 | Add query param `include_test: bool = False`. When false, query adds `"is_test": {"$ne": True}`. |
| `get_message_logs` | 789-836 | Add params `include_test=False`, `date_from`, `date_to`. Search becomes `$or: [{customer_phone: {$regex: re.escape(search), $options: "i"}}, {customer_name: {$regex: re.escape(search), $options: "i"}}]`. |
| `get_message_filters` | 839-896 | Normalize template names (`.strip().lower()`) into a `seen` set; preserve original case in output. |
| `message_status_callback` | 899-956 | **FULL REWRITE** per §6.3.1 below |
| `resend_messages` | 963-1051 | Guard: if `msg.status == "pending"` and `now - msg.created_at < 30min` and `len(msg.status_history) <= 1`, skip with `{id, success: False, error: "in_flight_grace_period"}`. Continue to read `customer_phone` (now correctly populated post G11). |

#### 6.3.1 `message_status_callback` — full rewrite contract

```python
@router.post("/status-callback")
async def message_status_callback(request: Request):
    """
    AuthKey delivery-report webhook. Public endpoint.
    Locked payload schema per CR-004 P3.5 §3.6.
    """
    received_at = datetime.now(timezone.utc).isoformat()
    
    # 1. Capture raw body FIRST — always, before any parsing
    raw_bytes = await request.body()
    try:
        payload = json.loads(raw_bytes) if raw_bytes else {}
    except Exception:
        payload = {}
    
    callback_log = {
        "id": str(uuid.uuid4()),
        "received_at": received_at,
        "headers": dict(request.headers),
        "raw_body": raw_bytes.decode("utf-8", errors="replace"),
        "parsed": payload if isinstance(payload, dict) else None,
        "logid": payload.get("logid") if isinstance(payload, dict) else None,
        "verdict": "pending",   # updated below
        "verdict_reason": None,
    }
    
    # 2. HMAC verification (B2 — dormant until secret in env)
    secret = os.environ.get("AUTHKEY_WEBHOOK_SECRET")
    if secret:
        if not verify_hmac(request.headers, raw_bytes, secret):
            callback_log["verdict"] = "rejected_signature"
            await db.whatsapp_callback_logs.insert_one(callback_log)
            raise HTTPException(401, "Invalid signature")
    
    # 3. Defensive id extraction (logid is canonical; others kept for safety)
    logid = (
        payload.get("logid") or payload.get("LogID")
        or payload.get("log_id") or payload.get("message_id") or payload.get("msgId")
    )
    if not logid:
        callback_log["verdict"] = "rejected_no_logid"
        await db.whatsapp_callback_logs.insert_one(callback_log)
        return {"success": False, "error": "logid required"}
    
    # 4. Status translation
    raw_status = (payload.get("status") or "").lower()
    status_map = {
        "sent": "pending",
        "delivered": "delivered",
        "read": "read",
        "failed": "rejected",
        "undelivered": "rejected",
        "rejected": "rejected",
    }
    mapped_status = status_map.get(raw_status)
    if not mapped_status:
        callback_log["verdict"] = "unknown_status"
        callback_log["verdict_reason"] = f"status={raw_status!r}"
        await db.whatsapp_callback_logs.insert_one(callback_log)
        return {"success": False, "error": f"unknown status: {raw_status}"}
    
    # 5. Time parsing (IST → UTC)
    time_raw = payload.get("time")
    try:
        ts_local = datetime.strptime(time_raw, "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        ts_utc_iso = ts_local.astimezone(timezone.utc).isoformat()
    except Exception:
        ts_utc_iso = received_at
        logger.warning(f"webhook time parse failed: {time_raw!r}, falling back to received_at")
    
    # 6. Lookup row
    row = await db.whatsapp_message_logs.find_one({"message_id": logid}, {"_id": 0})
    if not row:
        callback_log["verdict"] = "no_matching_row"
        await db.whatsapp_callback_logs.insert_one(callback_log)
        return {"success": True, "logid": logid, "updated": False}
    
    # 7. State machine
    new_status = next_status(row.get("status"), mapped_status)
    
    # 8. Recipient sanity check
    webhook_mobile = payload.get("mobile") or ""
    expected_mobile = f"{row.get('country_code', '')}{row.get('customer_phone', '')}"
    mobile_mismatch = bool(webhook_mobile and webhook_mobile != expected_mobile)
    
    # 9. Build update
    set_fields = {"updated_at": received_at, "time_raw": time_raw}
    if payload.get("meta_messageid"):
        set_fields["meta_message_id"] = payload["meta_messageid"]
    if payload.get("keypress") is not None:
        set_fields["keypress"] = payload["keypress"]
    if payload.get("button_param_value"):
        set_fields["button_param_value"] = payload["button_param_value"]
    if payload.get("channel"):
        set_fields["channel"] = payload["channel"]
    if mobile_mismatch:
        set_fields["mobile_mismatch"] = True
    
    # Dispatch time to status-specific timestamp field
    if mapped_status == "delivered":
        set_fields["delivered_at"] = ts_utc_iso
    elif mapped_status == "read":
        set_fields["read_at"] = ts_utc_iso
    elif mapped_status == "rejected":
        set_fields["rejected_at"] = ts_utc_iso
        set_fields["failure_reason"] = payload.get("reason") or raw_status
    
    # 10. Apply status only if transition is valid
    if new_status:
        set_fields["status"] = new_status
        callback_log["verdict"] = "applied"
    else:
        callback_log["verdict"] = "transition_ignored"
        callback_log["verdict_reason"] = f"{row.get('status')!r} → {mapped_status!r} not allowed"
    
    # 11. Always push history entry (even for ignored transitions — audit)
    history_entry = {
        "status": mapped_status,
        "timestamp": ts_utc_iso,
        "received_at": received_at,
        "action": "webhook",
        "applied": bool(new_status),
        "raw_payload": payload,
    }
    
    await db.whatsapp_message_logs.update_one(
        {"id": row["id"]},
        {"$set": set_fields, "$push": {"status_history": history_entry}},
    )
    
    await db.whatsapp_callback_logs.insert_one(callback_log)
    
    return {
        "success": True,
        "logid": logid,
        "status": new_status or row.get("status"),
        "applied": bool(new_status),
    }
```

### 6.4 `backend/server.py`

Add 6 index creations to lifespan startup (§4 — Indexes block). Place after existing index creation block at lines 25-44.

### 6.5 Callsite enrichment — event-data extensions

**Pattern**: every callsite already passes `event_data` dict; we add `idempotency_key`, `reference_type`, `reference_id` inside that dict. `trigger_whatsapp_event` extracts them. **No signature change** — fully backward-compatible.

| File | Callsite | Keys added to event_data |
|---|---|---|
| `routers/pos.py:1462` (`send_bill`) | `idempotency_key=f"{order_data.order_id}_send_bill"`, `reference_type="order"`, `reference_id=order_id` |
| `routers/pos.py:1477` (`welcome_message`) | `idempotency_key=f"{customer['id']}_welcome"`, `reference_type="customer"`, `reference_id=customer['id']` |
| `routers/pos.py:1489` (`tier_upgrade`) | `idempotency_key=f"{customer['id']}_tier_{new_tier}"`, `reference_type="customer"`, `reference_id=customer['id']` |
| `routers/pos.py:2174` (POS event gateway) | `idempotency_key=f"{event_data.order_id}_{internal_event}"`, `reference_type="order"`, `reference_id=event_data.order_id` |
| `routers/coupons.py:258` (`coupon_earned`) | `idempotency_key=f"{code.upper()}_{customer['id']}_coupon_earned"`, `reference_type="coupon"`, `reference_id=coupon["id"]` |
| `routers/coupons.py:271` (`points_earned` follow-up) | `idempotency_key=f"{code.upper()}_{customer['id']}_pts"`, `reference_type="coupon"`, `reference_id=coupon["id"]` |
| `routers/wallet.py:55,65` (`wallet_credit`/`debit`) | `idempotency_key=f"{tx_doc['id']}_{event}"`, `reference_type="wallet_tx"`, `reference_id=tx_doc["id"]` |
| `routers/wallet.py:60,70` (follow-up `points_earned`) | `idempotency_key=f"{tx_doc['id']}_pts"`, `reference_type="wallet_tx"`, `reference_id=tx_doc["id"]` |
| `routers/points.py:133` (`bonus_points`) | `idempotency_key=f"{tx_doc['id']}_bonus"`, `reference_type="points_tx"`, `reference_id=tx_doc["id"]` |
| `routers/points.py:137` (follow-up `points_earned`) | `idempotency_key=f"{tx_doc['id']}_pts"`, `reference_type="points_tx"`, `reference_id=tx_doc["id"]` |
| `routers/points.py:143` (`tier_upgrade`) | `idempotency_key=f"{customer['id']}_tier_{new_tier}"`, `reference_type="customer"`, `reference_id=customer['id']` |
| `routers/auth.py:515` (`reset_password`) | **NO `idempotency_key`** (locked decision §1.5 Q1). Pass `reference_type="customer"`, `reference_id=customer.get("id")` only. |
| `services/feedback_service.py:59` (`feedback_request`) | `idempotency_key=feedback_id`, `reference_type="feedback"`, `reference_id=feedback_id` |
| `core/loyalty.py:456` | `idempotency_key=f"{customer['id']}_pts_{tx_id or 'auto'}"`, `reference_type="points_tx"`, `reference_id=tx_id` |
| `core/loyalty_jobs.py:105` (birthday cron) | `idempotency_key=f"{customer['id']}_{today_iso}_birthday"`, `reference_type="customer"`, `reference_id=customer['id']` |
| `core/loyalty_jobs.py:205` (anniversary cron) | `idempotency_key=f"{customer['id']}_{today_iso}_anniversary"`, similar |
| `core/loyalty_jobs.py:288` (points_expiring) | `idempotency_key=f"{customer['id']}_{today_iso}_points_expiring"`, similar |
| `core/loyalty_jobs.py:418` (coupon_expiring) | `idempotency_key=f"{customer['id']}_{coupon['id']}_{today_iso}_coupon_expiring"`, `reference_type="coupon"`, `reference_id=coupon['id']` |
| `core/loyalty_jobs.py:457` (inactive_customer) | `idempotency_key=f"{customer['id']}_{today_iso}_inactive"`, `reference_type="customer"`, `reference_id=customer['id']` |

> `today_iso` is computed at the top of each cron job: `today_iso = datetime.now(timezone.utc).date().isoformat()`.

### 6.6 `trigger_points_earned_event` (no change)

Thin wrapper around `trigger_whatsapp_event` — picks up event_data keys naturally. No changes needed in the wrapper itself; only its 2 callers (`wallet.py:60,70` and `points.py:137`) already updated in §6.5.

### 6.7 Frontend — `MessageStatusPage.jsx`

| Region | Change |
|---|---|
| `filters` state init (line 81) | Add `include_test: false`, `date_from: null`, `date_to: null` |
| Stats fetch (line 99) | Pass `include_test` query param |
| Logs fetch (line 119) | Append `include_test`, `date_from`, `date_to` to URLSearchParams |
| Filter bar (lines 256-325) | Add "Show test sends" Switch + date-range picker (use `react-day-picker` already in deps) |
| Table row (lines 386-425) | Add `TEST` badge when `log.is_test`; add second-line subtext under Status showing relative `delivered_at` / `read_at` when present |
| Resend button (lines 411-422) | Disable when `log.status === "pending"` AND `(Date.now() - new Date(log.created_at).getTime()) < 30*60*1000` AND `(log.status_history?.length ?? 1) <= 1`; tooltip "Waiting for delivery report" |
| Stats cards (lines 247-253) | Keep current 5 cards. Failed-split deferred (needs `failure_reason` data first; UI stays single "Failed" for v1). |

### 6.8 Frontend — `WhatsAppAutomationContent.jsx` dead-code cleanup

Lines 471-486 — refactor:

```js
// BEFORE: 11 keys including 3 dead (first_visit, feedback_received, inactive_reminder)
// AFTER: 8 active keys all promoted into crmEventDescriptions block (lines 461-469)
//        which is then spread into eventDescriptions via {...crmEventDescriptions}
```

Specifically:
- **DELETE** `"first_visit"`, `"feedback_received"`, `"inactive_reminder"` entries entirely.
- **MOVE** `"points_redeemed"`, `"bonus_points"`, `"wallet_credit"`, `"wallet_debit"`, `"tier_upgrade"`, `"coupon_earned"`, `"send_bill"` into `crmEventDescriptions` (lines 461-469).
- **DELETE** the `// Legacy descriptions` comment.
- After cleanup `eventDescriptions` collapses to `{...posEventDescriptions, ...crmEventDescriptions}` — single source.

---

## 7. Test plan

### 7.1 Unit tests (NEW)

| File | Asserts |
|---|---|
| `backend/tests/test_whatsapp_status_machine.py` | All allowed transitions; rejected→delivered returns None; out-of-order (read→delivered) returns None; initial_send_success from None → pending; initial_send_failure from None → rejected; terminals are terminal. ~12 cases. |
| `backend/tests/test_log_message_attempt.py` | Given mocked `SendResult(message_id="LOGID123")`, row has `message_id="LOGID123"`. Duplicate `idempotency_key` raises `DuplicateKeyError`, handled, no second row. `is_test=True` flag set when passed. Failed result writes `status=rejected` with `rejected_at` populated. |
| `backend/tests/test_whatsapp_callback.py` | Real-sample payload (§3.6) → row `status: pending` with `message_id=<logid>` becomes `delivered`, `delivered_at` set, `meta_message_id` captured, `keypress`/`button_param_value` populated, `time_raw` preserved. Unknown status → no row update, callback log `verdict="unknown_status"`. Missing logid → 200 with `{success: false, error: "logid required"}`, callback log `verdict="rejected_no_logid"`. Out-of-order `delivered` after `read` → status stays `read`, history entry pushed with `applied: false`. Mobile mismatch → `mobile_mismatch: true` set, update still applied. |

### 7.2 Integration probes (curl, run by main agent post-implementation; no DB writes scripted)

1. `curl POST /api/whatsapp/status-callback -d '{}'` → 200, `{success:false, error:"logid required"}`, one row in `whatsapp_callback_logs` with `verdict="rejected_no_logid"`.
2. `curl POST /api/whatsapp/status-callback -d '{"logid":"NOMATCH","status":"delivered","time":"2026-05-28 15:48:22"}'` → 200, `{success:true, logid:"NOMATCH", updated:false}`, callback log `verdict="no_matching_row"`.
3. `curl POST /api/whatsapp/test-template` (with auth + known template_id) → row written in new shape with `is_test=true`, returns success.
4. `curl GET /api/whatsapp/message-logs` → does NOT include test row from probe 3 by default; `?include_test=true` does.
5. `curl GET /api/whatsapp/message-stats` → `total` excludes test row from probe 3.

### 7.3 Frontend smoke
- `/message-status` page loads, all filters render.
- Toggle "Show test sends" → test row from probe 3 appears with `TEST` badge.
- Date range picker filters correctly.
- Resend button disabled with tooltip on a row whose `created_at < 30 min` ago AND `status_history.length <= 1`.
- Search "abhi" matches name; "750" matches phone.

### 7.4 What cannot be tested until blockers resolve
- Real AuthKey delivery callback → live status transition (needs B3).
- HMAC verification rejection (needs B2 — code path covered by mocked unit test only).

---

## 8. Risk register

| Risk | Mitigation |
|---|---|
| Unique index on `idempotency_key` blocks a legitimate retry | All deliberate retry paths go through `/resend` which uses `update_one` not `insert_one`. New attempts via direct call only happen for genuinely new events. OTP path has no idempotency key by design. |
| `message_body_text` rendering depends on stored template body | If `whatsapp_event_template_map.template_body` is not set, field is null. No fallback (Q3 locked). |
| Two writers temporarily coexist during deploy (prod still old, preview new) | New fields are additive; old reader (current dashboard) ignores them. Safe. |
| Adding `unique sparse` index on existing collection — does Mongo allow it with existing null `idempotency_key`? | Yes — `sparse=True` excludes documents missing the field from the index. Existing rows pass through unaffected. |
| AuthKey ever changes its timezone behavior | `time_raw` preserved verbatim; we can re-derive timestamps offline. |
| AuthKey sends a new status enum value we don't recognize | Callback logged with `verdict="unknown_status"`, row not modified. Ops can review `whatsapp_callback_logs` and we extend the map. |
| Out-of-order webhooks (delivered after read) | State machine returns None → no status regression. Event still appended to history for audit (Q5 locked). |
| Webhook endpoint is public until B2 | Defensive: every inbound logged to `whatsapp_callback_logs` regardless. HMAC check is dormant code-path, activates automatically when secret lands. No exploit can corrupt a row's other fields (only status + timestamp + reason can be moved, and only forward per state machine). |
| Two webhooks pointing at same URL (Laravel + our CRM) — race | Status updates are idempotent (`$set` of same status is no-op via state machine). Status_history may show two near-identical entries — acceptable audit overhead. |

---

## 9. Sequenced commits (8 commits)

**Commit 1** — Foundations (additive, no behavior change):
- `core/whatsapp_status.py` NEW + unit tests.
- This planning doc (already at this path).

**Commit 2** — Send-side row schema (Phase 1, G1–G10):
- `core/whatsapp.py`: `SendResult` fields, `logid` extraction, new `log_message_attempt` shape, wrap `trigger_whatsapp_event` always-log on exceptions, `render_template_body` helper.
- `server.py`: 6 new indexes.

**Commit 3** — Callsite enrichment (Phase 1 cont.):
- All trigger callsites in 8 files pass `idempotency_key` + `reference_*` in event_data.

**Commit 4** — Path B unification (Phase 2, G11):
- `routers/whatsapp.py::send_test_message` calls `log_message_attempt`.
- Unit test for test-send row shape.

**Commit 5** — Webhook hardening (Phase 3, locked parser):
- `routers/whatsapp.py::message_status_callback` full rewrite per §6.3.1.
- `whatsapp_callback_logs` writes.
- HMAC verifier function (dormant; gated by env var).
- Unit + integration tests.

**Commit 6** — Dashboard backend extensions:
- `message-logs` and `message-stats` extended (`include_test`, `date_from`, `date_to`, name+phone search).
- `resend` freshness guard.

**Commit 7** — Frontend polish (Phase 5):
- `MessageStatusPage.jsx` filter additions, TEST badge, resend guard.
- `WhatsAppAutomationContent.jsx` dead-code cleanup.

**Commit 8** — Closeouts (post blocker resolution by owner):
- B2: when owner places `AUTHKEY_WEBHOOK_SECRET` in `backend/.env`, restart backend → verification auto-activates. (Optional: tighten HMAC signature format once AuthKey shares it.)
- B3: owner registers URL in AuthKey console. End-to-end live test on production.
- (If real samples reveal any status enum we missed, add to `status_map`.)

---

## 10. Files touched — final manifest

### Backend (12 files modified, 1 new)
1. `backend/core/whatsapp.py` — major refactor (SendResult, send_single_message, log_message_attempt, trigger_whatsapp_event, render_template_body)
2. `backend/core/whatsapp_status.py` — **NEW**
3. `backend/server.py` — add 6 indexes
4. `backend/routers/whatsapp.py` — webhook refactor, send_test_message rewrite, message-logs/stats extensions, resend guard
5. `backend/routers/pos.py` — 4 callsites updated
6. `backend/routers/coupons.py` — 2 callsites
7. `backend/routers/wallet.py` — 4 callsites
8. `backend/routers/points.py` — 3 callsites
9. `backend/routers/auth.py` — 1 callsite (no idempotency_key)
10. `backend/services/feedback_service.py` — 1 callsite
11. `backend/core/loyalty.py` — 1 callsite
12. `backend/core/loyalty_jobs.py` — 5 callsites

### Backend tests (3 new files)
13. `backend/tests/test_whatsapp_status_machine.py` — **NEW**
14. `backend/tests/test_log_message_attempt.py` — **NEW**
15. `backend/tests/test_whatsapp_callback.py` — **NEW**

### Frontend (2 files modified)
16. `frontend/src/pages/MessageStatusPage.jsx` — filter additions, TEST badge, resend guard
17. `frontend/src/components/shared/WhatsAppAutomationContent.jsx` — dead-code cleanup

### Docs (1 file)
18. `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md` — **this doc**

### Env (owner-managed, not committed)
19. `backend/.env` — owner adds `AUTHKEY_WEBHOOK_SECRET` when B2 resolves

**Total: 18 files (4 NEW, 14 EDITED), 0 deletions.**

---

## 11. Definition of Done

- [ ] All 18 files updated per §10.
- [ ] All new unit tests pass: `pytest backend/tests/test_whatsapp_status_machine.py backend/tests/test_log_message_attempt.py backend/tests/test_whatsapp_callback.py`.
- [ ] `ruff check backend/` and frontend ESLint both clean.
- [ ] Backend `/api/health` green after restart.
- [ ] All 5 curl probes in §7.2 pass.
- [ ] Frontend smoke (§7.3) passes via screenshot.
- [ ] No `whatsapp_message_logs` row migrated; no historical document modified by any script.
- [ ] No DB write from any non-app-code path.
- [ ] Doc status moves to `implementation_complete_awaiting_blocker_resolution` once Commits 1–7 land.
- [ ] **Held open** until B2 + B3 close on production side, then Commit 8 closes it.

---

## 12. Decisions log (resolved before implementation)

| Q | Question | Decision | Source |
|---|---|---|---|
| Q1 | OTP idempotency strictness | Skip idempotency_key for `reset_password` entirely | owner reply |
| Q2 | Cron idempotency window | Daily — `{customer_id}_{today_iso}_{event}` | owner reply |
| Q3 | message_body_text fallback when template body unknown | None — field stays null | owner reply |
| Q4 | "Show test sends" default | Off (hide test rows from table & stats) | owner reply |
| Q5 | Late `delivered` after `read` behavior | No status regression; append to history for audit | owner reply |
| B1 | AuthKey delivery webhook payload schema | Locked — §3.6 | owner-shared real sample |
| B2 | AuthKey webhook signing secret | Resolved (no signing) | sample headers show no signature; AuthKey only has outbound API key |

**No open questions. Ready to cut Commit 1.**

---

## 13. Security Analysis — webhook endpoint without HMAC

### 13.1 What AuthKey actually provides
AuthKey has **one key**: the outbound API key (e.g. `d70e42b590e7fed7` for R689). This key authenticates **us → AuthKey** when we call `requestjson.php` to send a message. It is sent in the `Authorization: Basic <key>` header on outbound HTTPS calls.

AuthKey provides **no inbound auth concept**. The real webhook sample captured 2026-05-28 15:48:23 had these headers and only these headers:

```
connection, content-length, accept-encoding, x-forwarded-proto, cf-visitor,
cf-ipcountry, cf-connecting-ip, cdn-loop, accept, content-type, host,
cf-ray, x-forwarded-for
```

No `x-auth-signature`, no `x-signature`, no `x-hmac`, no `authorization`. AuthKey does not sign webhooks.

### 13.2 Consequence
- `AUTHKEY_WEBHOOK_SECRET` env var **must stay unset**. Setting it activates the HMAC verifier in `message_status_callback`, which would reject every real AuthKey webhook (because they carry no signature header).
- The `AUTHKEY_API_KEY` is **not needed in `.env`** — it lives in `db.users[R689].authkey_api_key` and is read from there by the send-side code.

### 13.3 Defense-in-depth without HMAC

The Commit 5 webhook design accepts this asymmetry by being deliberately permissive but tightly scoped:

1. **Audit-first**: every inbound POST is logged verbatim to `whatsapp_callback_logs` (headers + raw body + parse verdict). No data loss, no silent drops.
2. **Lookup is keyed by `logid`**: a 32-char hex string (~10³⁸ keyspace). An attacker must know a real `logid` of a recent send to affect anything. Brute-force-blind spoofing of "guess a logid and flip it" is impractical.
3. **State machine**: status can only move forward (`pending → delivered → read`, or any state → `rejected`). No regression possible. Spoofed `delivered` after real `read` is silently ignored.
4. **Limited blast radius**: the webhook can only set `status`, `delivered_at`, `read_at`, `rejected_at`, `failure_reason`, plus the optional `meta_message_id`/`keypress`/`button_param_value`/`channel`/`time_raw`. It **cannot** alter recipient, template, body_values, customer_id, user_id, or any send-time field.
5. **No PII leak via webhook**: response is always a small JSON envelope (`{success, logid, status, applied}`); no row data echoed back. Attackers can't enumerate logids via response timing or content.

### 13.4 Optional fast-follow hardening (Commit 8 backlog)

Documented for later; not in this CR's scope:

- **IP allowlist** at the reverse-proxy or app middleware level. AuthKey's outbound IP visible in the sample: `157.245.105.3` (DigitalOcean New York). Confirm full IP range with AuthKey support, then restrict `/api/whatsapp/status-callback` to that allowlist. Real defense; doesn't need any secret from AuthKey.
- **Rate limit** by source IP (e.g. 50 req/min) — bounded keyspace of legitimate webhooks per minute.
- **Replay window** check: reject callbacks whose `time` is more than 24h old (or 24h in the future). Captures cases of stolen-and-replayed payloads.
- **Per-user logid index lookup** with `user_id` constraint — currently the lookup is only by `message_id`; could constrain `{message_id, user_id}` if we ever derive `user_id` from the payload (we don't today; AuthKey doesn't echo it).

### 13.5 Decision (locked)
- `.env` carries **no** AuthKey-related secrets.
- HMAC verifier in `message_status_callback` stays present as code-path (cheap insurance) but dormant.
- IP allowlist deferred to Commit 8 as optional hardening.
- This decision is reversible: if AuthKey ever rolls out signed webhooks, set `AUTHKEY_WEBHOOK_SECRET` and the existing verifier activates automatically.
