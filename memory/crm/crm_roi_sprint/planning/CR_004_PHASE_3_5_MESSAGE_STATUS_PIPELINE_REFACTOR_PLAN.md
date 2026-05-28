# CR-004 Phase 3.5 — Message Status Pipeline Refactor — Implementation Plan

**CR**: CR-004 WhatsApp Utility + Marketing → P3.5 Message Status Pipeline (post-P3 follow-up)
**Status**: `planning_complete_awaiting_implementation`
**Author**: E1
**Date opened**: 2026-05-28
**Tenant**: R689 Kunafa Mahal (live test target)
**Branch**: `28-may`
**Environment**: implement in preview pod (`/app`); owner pushes to production
**External DB**: `52.66.232.149:27017/mygenie` — **NO writes from this work**; reads only via app code

---

## 1. Goal & Scope

### 1.1 Goal (one sentence)
Make `whatsapp_message_logs` the single, complete source of truth for the Message Status dashboard, so that (a) every send writes a fully populated row, (b) AuthKey's delivery-report webhook updates only `status` + timestamps + reason on that row, and (c) the dashboard renders directly from that row with no inference.

### 1.2 Architecture contract (locked)

```
TRIGGER → trigger_whatsapp_event() → AuthKey POST → response {LogID, Message, ...}
   ↓
A1. log_message_attempt() writes ONE complete row to whatsapp_message_logs
    {id, message_id=LogID, status="pending"|"rejected", + every audit field}
   ↓
(async) AuthKey POSTs /api/whatsapp/status-callback {LogID, status, ...}
   ↓
A2. webhook updates ONLY status + delivered_at/read_at/failure_reason
    on row matched by message_id=LogID; pushes raw payload to status_history
    and to whatsapp_callback_logs (audit)
   ↓
Dashboard reads whatsapp_message_logs — never reads from AuthKey live
```

### 1.3 In scope (this CR)
- **Phase 1** — Send-side row refactor: G1, G2, G3, G4, G5, G6, G7, G8, G9, G10.
- **Phase 2** — Schema unification: G11. (G12 legacy migration: **dropped**.)
- **Phase 3 (skeleton)** — Webhook receive-side: G16 (state machine), G18 (callback log collection), defensive multi-key parser. **Final field-name mapping deferred** (Blocker 1).
- **Phase 5** — Dashboard polish.

### 1.4 Out of scope (this CR)
- **G19** — AuthKey payload schema confirmation (Blocker 1, owner-driven).
- **G17** — HMAC verification (Blocker 2; env hook only; activation deferred).
- **G20** — AuthKey console URL registration (Blocker 3, owner-driven).
- **G21** — Preview/staging webhook strategy.
- **G22** — Historical backfill of `message_id=None` rows (owner declined).
- **G12** — Legacy `sent`/`failed` row migration (owner declined).

### 1.5 Strict rules adhered to
- No DB writes from this task (the running app will write to remote Mongo during normal operation; no migration scripts run).
- No production code push (owner pushes from this repo).
- No "AI slop" guesses on AuthKey payload — placeholder skeleton only, real parser waits for G19.
- Clean refactor (allowed by owner) — not patches.
- Do NOT modify `memory/crm/crm_1_0/handoff/CRM_1_0_BASELINE_CLOSE_2026_05_26.md`.

---

## 2. Blockers (3) — recorded, work proceeds around them

| # | Blocker | Owner | Resolves what | Workaround in this CR |
|---|---|---|---|---|
| B1 | AuthKey delivery-report payload schema | Owner (Abhishek) → AuthKey support | Final field-name parsing (LogID vs message_id, status enum, timestamp keys) | Webhook handler logs raw body to `whatsapp_callback_logs` and accepts a defensive union of likely keys. Parser finalization deferred to a follow-up commit. |
| B2 | AuthKey webhook signing secret | Owner | G17 HMAC verification | Env var `AUTHKEY_WEBHOOK_SECRET` hook in code; verification module written but gated by `if AUTHKEY_WEBHOOK_SECRET:` — activates automatically when value lands. |
| B3 | AuthKey console URL registration (prod) | Owner | End-to-end verification | Code is verified via unit tests + curl probe; real Delivered/Read transitions only occur once owner registers `https://crm.mygenie.online/api/whatsapp/status-callback` and pushes this code to prod. |

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
| `backend/routers/coupons.py` | — | 2 callsites (lines 258, 271) | **YES** — pass `idempotency_key` where natural (e.g. `f"{coupon_code}_{customer_id}_coupon_earned"`) |
| `backend/routers/wallet.py` | — | 4 callsites (lines 55, 60, 65, 70) | **YES** — pass `idempotency_key` from wallet `transaction_id` |
| `backend/routers/points.py` | — | 3 callsites (lines 133, 137, 143) | **YES** — same pattern |
| `backend/routers/auth.py` | — | 1 callsite (line 515) — `reset_password` | **YES** — idempotency optional (OTP regen is fine) |
| `backend/services/feedback_service.py` | — | 1 callsite (line 59) | **YES** — `idempotency_key = feedback_id` |
| `backend/core/loyalty.py` | — | 1 callsite (line 456) | **YES** — minor |
| `backend/core/loyalty_jobs.py` | — | 5 callsites (lines 105, 205, 288, 418, 457) — birthday, anniversary, points_expiring, coupon_expiring, inactive_customer | **YES** — daily cron jobs need idempotency (`{customer_id}_{date}_{event}`) to avoid double-fires |

### 3.2 Frontend files involved

| File | Lines | Role | Touched? |
|---|---|---|---|
| `frontend/src/pages/MessageStatusPage.jsx` | 537 | Dashboard | **YES — Phase 5 polish** |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | 1832 | Automation event mapping page; contains legacy descriptions (`first_visit`, `feedback_received`, `inactive_reminder`) | **YES (small)** — drop dead description entries (see §6) |
| `frontend/src/pages/DashboardPage.jsx` | — | Embeds MessageStatusContent on main dashboard | NO direct changes; benefits indirectly |
| `frontend/src/App.js` | — | Routes `/message-status` | NO |

### 3.3 Current `whatsapp_message_logs` row shapes (two writers)

**Path A** — `core/whatsapp.py::log_message_attempt` (event triggers):
```python
{
  "id": uuid,
  "user_id", "customer_id", "customer_name", "customer_phone", "country_code",
  "event_type", "template_id", "template_name", "campaign_id",
  "status": "pending"|"rejected",
  "message_id": None,                # ← BUG: AuthKey returns LogID, never extracted
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
  "status": "sent"|"failed",          # ← wrong values (should be pending|rejected)
  "message_id", "error", "body_values",
  "is_test": True,
  "created_at"
                                       # ← missing: customer_name, country_code, template_name,
                                       #            status_history, updated_at
}
```

### 3.4 Dead code identified

| Item | Where | Status | Action |
|---|---|---|---|
| `eventDescriptions["first_visit"]` | `WhatsAppAutomationContent.jsx:480` | Legacy — renamed to `welcome_message` in P3 | **DELETE** |
| `eventDescriptions["feedback_received"]` | `WhatsAppAutomationContent.jsx:483` | Legacy — renamed to `feedback_request` in P3 | **DELETE** |
| `eventDescriptions["inactive_reminder"]` | `WhatsAppAutomationContent.jsx:484` | Never existed in master list; closest match is new `inactive_customer` | **DELETE** |
| Legacy descriptions block (lines 475-485) "Legacy descriptions" comment | Same file | Comment + dead keys | **REMOVE comment + dead keys** |
| `send_bulk_messages` `message_id` packing (line 187) | `core/whatsapp.py` | Returns None because of G1; no live caller relies on it (no callsite invokes `send_bulk_messages` from production paths today — segment broadcast not built yet) | **Fix via G1 fix; no API change** |

### 3.5 Collections involved

| Collection | Existing? | This CR adds? |
|---|---|---|
| `whatsapp_message_logs` | yes | new fields written; **no schema migration** |
| `whatsapp_event_template_map` | yes | unchanged |
| `whatsapp_template_variable_map` | yes | unchanged |
| `whatsapp_callback_logs` | **no** | **NEW** — created on first write, no migration needed |

### 3.6 Endpoints involved

| Method | Path | Handler | Touched? |
|---|---|---|---|
| `POST` | `/api/whatsapp/status-callback` | `message_status_callback` | **REFACTOR** — raw log + state machine; field-name parser stubbed pending B1 |
| `POST` | `/api/whatsapp/test-template` | `send_test_message` | **REFACTOR** — call `log_message_attempt` (unify shape) |
| `GET` | `/api/whatsapp/message-logs` | `get_message_logs` | **EXTEND** — `is_test` filter, name search, regex escape |
| `GET` | `/api/whatsapp/message-stats` | `get_message_stats` | **EXTEND** — exclude `is_test=true` by default |
| `GET` | `/api/whatsapp/message-filters` | `get_message_filters` | minor — dedupe templates by normalized key |
| `POST` | `/api/whatsapp/resend` | `resend_messages` | **HARDEN** — guard pending<30min, fix phone field |

---

## 4. Final row schema (`whatsapp_message_logs` — target after this CR)

```jsonc
{
  // Identity & ownership
  "id": "uuid-v4",                       // our PK
  "user_id": "string",                   // tenant
  "is_test": false,                       // true only for /test-template sends

  // Reference back to triggering object (NEW)
  "event_type": "send_bill",
  "reference_type": "order" | "coupon" | "feedback" | "wallet_tx" | "points_tx" | "customer" | null,
  "reference_id": "869305",              // e.g. POS order_id, coupon_id, feedback_id
  "pos_order_id": "869305",              // duplicated for fast filter when event is POS-driven; null otherwise
  "idempotency_key": "869305_send_bill", // unique per (user_id, idempotency_key); prevents double-fires

  // Recipient
  "customer_id": "uuid-or-null",
  "customer_name": "abhishek jain",
  "customer_phone": "7505242126",        // digits only, no spaces/dashes
  "country_code": "91",                  // digits only, no +

  // Template
  "template_id": "26508",                // AuthKey wid
  "template_name": "send_bill_to_customer",
  "campaign_id": null,                   // populated only for segment broadcasts

  // What was sent
  "body_values": {"1": "abhishek jain", "2": "Rs.775", "3": "your order", "4": "counter", "5": "Kunafa Mahal"},
  "message_body_text": "Hi abhishek jain, your order at Kunafa Mahal is ready ...", // rendered from template + body_values
  "media_url": null,
  "media_filename": null,

  // AuthKey send-time response (NEW — full capture)
  "message_id": "28bf7375bb54540ba03a4eb873d4da44",  // ← AuthKey LogID; primary join key for webhook
  "authkey_http_status": 200,
  "authkey_raw_response": {"LogID": "...", "Message": "Submitted Successfully"},

  // Lifecycle
  "status": "pending",                    // pending | delivered | read | rejected
  "delivered_at": null,                   // ISO; promoted from webhook
  "read_at": null,                        // ISO; promoted from webhook
  "rejected_at": null,                    // ISO; on failure (either at send time or carrier rejection)
  "failure_reason": null,                 // human-readable; promoted from webhook
  "error": null,                          // initial send error (only for status=rejected pre-webhook)
  "resend_count": 0,
  "last_resend_at": null,

  // Audit
  "status_history": [
    {"status": "pending", "timestamp": "2026-05-28T09:00:00+00:00", "action": "initial_send"}
  ],
  "created_at": "2026-05-28T09:00:00+00:00",
  "updated_at": "2026-05-28T09:00:00+00:00"
}
```

### Field changes vs current
- **NEW**: `is_test`, `reference_type`, `reference_id`, `pos_order_id`, `idempotency_key`, `message_body_text`, `media_url`, `media_filename`, `authkey_http_status`, `authkey_raw_response`, `delivered_at`, `read_at`, `rejected_at`, `failure_reason`, `last_resend_at`.
- **FIXED**: `message_id` actually populated (from `LogID`).
- **PATH B NORMALIZED**: `phone` → `customer_phone`, `status` values aligned, missing fields added.
- **NO MIGRATION**: existing rows keep their old shape — readers must tolerate missing new fields.

### Indexes to create (Mongo) — additive only
```python
await db.whatsapp_message_logs.create_index([("user_id", 1), ("created_at", -1)], name="idx_user_created")
await db.whatsapp_message_logs.create_index([("user_id", 1), ("status", 1)], name="idx_user_status")
await db.whatsapp_message_logs.create_index("message_id", sparse=True, name="idx_message_id")  # webhook lookup
await db.whatsapp_message_logs.create_index([("user_id", 1), ("idempotency_key", 1)], unique=True, sparse=True, name="idx_user_idem")
await db.whatsapp_callback_logs.create_index([("received_at", -1)], name="idx_cb_received")
await db.whatsapp_callback_logs.create_index([("log_id", 1)], sparse=True, name="idx_cb_logid")
```
- All `sparse=True` so existing rows without the field don't violate `unique`.
- Created in `server.py` lifespan `startup`, similar to existing index creation pattern (see `server.py:25-44`).

---

## 5. State machine (Phase 3 skeleton)

```
INITIAL: (none)
   └─ initial_send →
        success      → pending
        failure      → rejected (terminal)

pending
   ├─ delivered  → delivered
   ├─ read       → read (terminal)
   └─ rejected   → rejected (terminal)

delivered
   ├─ read       → read (terminal)
   └─ rejected   → rejected (terminal — late carrier failure rare)

read       → terminal (no transitions)
rejected   → terminal (only via resend, which creates a new attempt entry; status not reverted)
```

Implementation: pure function `next_status(current, event) -> Optional[str]` in `core/whatsapp_status.py` (new file). Returns `None` for invalid transitions; webhook drops invalid events with a warning log. Unit-testable in isolation.

---

## 6. Implementation breakdown — file-by-file

### 6.1 `backend/core/whatsapp.py` (primary refactor)

**Edits:**

| Region | Lines (current) | Change |
|---|---|---|
| `SendResult` dataclass | 30-37 | Add fields: `http_status: Optional[int]`, `raw_response: Optional[Dict]` |
| `send_single_message` — message_id extraction | 114 | Accept `LogID` and `log_id` in addition to `message_id`/`msgid` |
| `send_single_message` — return both branches | 109-125 | Populate `http_status=response.status_code`, `raw_response=response_data` on both success and failure |
| `send_bulk_messages` result packing | 184-189 | Add `http_status`, `raw_response` to each per-message dict (now possible) |
| `log_message_attempt` signature | 389-402 | Add params: `reference_id`, `reference_type`, `pos_order_id`, `idempotency_key`, `is_test=False`, `media_url`, `media_filename`, `message_body_text` |
| `log_message_attempt` body | 411-438 | Build new row shape (§4). Use `db.whatsapp_message_logs.insert_one` with try/except for duplicate key on `idempotency_key` — if duplicate, log warning and skip (POS retry case). Return None or the existing row. |
| `trigger_whatsapp_event` | 442-576 | Wrap whole function so a try/except around steps 1–4 still calls `log_message_attempt` with `status="rejected"` and `error=<exception>`. Compute `message_body_text` after `build_body_values`. Derive `reference_id`/`reference_type`/`pos_order_id`/`idempotency_key` from `event_data`. |
| New helper | (new) | `render_template_body(template_text, body_values) -> str` — fetches stored template body from `whatsapp_event_template_map` (or AuthKey template cache) and substitutes `{{1}}, {{2}}...`. If template body unknown, fall back to JSON of body_values. |

**Dead code dropped:** none (all current helpers reused).

### 6.2 `backend/core/whatsapp_status.py` — NEW FILE

Pure state-machine helpers, no DB:
```python
ALLOWED = {
    None:        {"initial_send_success": "pending",
                  "initial_send_failure": "rejected"},
    "pending":   {"delivered": "delivered", "read": "read", "rejected": "rejected"},
    "delivered": {"read": "read", "rejected": "rejected"},
    "read":      {},
    "rejected":  {},
}
def next_status(current, event): ...
def is_terminal(status): ...
```
Unit test file: `backend/tests/test_whatsapp_status_machine.py`.

### 6.3 `backend/routers/whatsapp.py`

**Edits:**

| Endpoint | Lines (current) | Change |
|---|---|---|
| `MESSAGE_STATUSES` | 17 | Unchanged. |
| `send_test_message` | 656-740 | Replace inline `db.whatsapp_message_logs.insert_one` (line 726) with call to `log_message_attempt(... is_test=True, event_type="test", reference_type=None)`. Phone field becomes `customer_phone`. Status values now `pending`/`rejected`. |
| `get_message_stats` | 747-786 | Add default `exclude_test=True` query param; query filters `is_test: {"$ne": True}` unless explicitly set false. |
| `get_message_logs` | 789-836 | Add `is_test` filter param (default exclude); extend search to `$or: [{customer_phone: regex}, {customer_name: regex}]` with `re.escape`; document field via docstring. |
| `get_message_filters` | 839-896 | Normalize template names (`.strip().lower()`) before adding to set to dedupe casing variants. |
| `message_status_callback` | 899-956 | **REFACTOR**:<br>1. Read raw body, insert into `whatsapp_callback_logs` (always, before parsing).<br>2. Defensive key extraction: `log_id = payload.get("LogID") or payload.get("log_id") or payload.get("message_id") or payload.get("msgId")`.<br>3. Defensive status extraction: `raw_status = (payload.get("status") or payload.get("Status") or "").lower()`.<br>4. Map via existing `status_map` (extended with any future enums).<br>5. Lookup current row by `message_id=log_id` AND `user_id` unconstrained (webhook is unauth).<br>6. Use `next_status(current, mapped)` — if `None` (invalid transition), log warn, no update.<br>7. `$set` `status`, `updated_at`, AND dedicated timestamp field (`delivered_at`, `read_at`, `rejected_at`) parsed from payload if present (placeholder fields: `delivered_at`/`deliveredAt`/`delivery_time`, etc. — to be finalized post B1).<br>8. `$set` `failure_reason` if applicable.<br>9. `$push` to `status_history` with raw payload.<br>10. HMAC verification stub: `if AUTHKEY_WEBHOOK_SECRET: verify(request, secret)` — falls through if env var unset. |
| `resend_messages` | 963-1051 | Guard: skip rows where `status="pending"` AND `created_at > now - 30min` AND `len(status_history) == 1` (in-flight). Return `{skipped: [...]}` for those. Continue to use `customer_phone` (now correctly populated post G11). |

### 6.4 `backend/server.py`

Add new index creations to lifespan startup (§4). One block, ~6 lines.

### 6.5 Callsite updates (event triggers — pass new context)

**Pattern**: every callsite already passes `event_data` dict; we add `idempotency_key` (and `reference_type`, `reference_id` where useful) inside that dict. `trigger_whatsapp_event` extracts them. **No signature change to `trigger_whatsapp_event`** — backward compatible.

| File | Callsite | event_data key added |
|---|---|---|
| `routers/pos.py:1462` `send_bill` | `idempotency_key=f"{pos_order_id}_send_bill"`, `reference_type="order"`, `reference_id=order_id` (already has `pos_order_id`) |
| `routers/pos.py:1477` `welcome_message` | `idempotency_key=f"{customer_id}_welcome"`, `reference_type="customer"`, `reference_id=customer_id` |
| `routers/pos.py:1489` `tier_upgrade` | `idempotency_key=f"{customer_id}_tier_{new_tier}"` |
| `routers/pos.py:2174` POS event gateway | `idempotency_key=f"{event_data.order_id}_{internal_event}"`, `reference_type="order"`, `reference_id=event_data.order_id` |
| `routers/coupons.py:258` `coupon_earned` | `idempotency_key=f"{coupon_code}_{customer_id}_coupon_earned"`, `reference_type="coupon"`, `reference_id=coupon["id"]` |
| `routers/wallet.py:55,65` `wallet_credit/debit` | `idempotency_key=f"{transaction_id}_{event}"`, `reference_type="wallet_tx"`, `reference_id=tx_doc.id` |
| `routers/points.py:133,143` `bonus_points`, `tier_upgrade` | `idempotency_key=f"{tx_doc.id}_bonus_points"` / `f"{customer_id}_tier_{new_tier}"` |
| `routers/auth.py:515` `reset_password` | `idempotency_key=f"{customer_phone}_otp_{otp}"` (OTP is unique per request) |
| `services/feedback_service.py:59` `feedback_request` | `idempotency_key=feedback_id`, `reference_type="feedback"`, `reference_id=feedback_id` |
| `core/loyalty.py:456` | `idempotency_key=f"{customer_id}_points_earned_{points}"` |
| `core/loyalty_jobs.py` (5 cron sites) | `idempotency_key=f"{customer_id}_{today_iso_date}_{event_type}"` — **prevents double-fire if cron runs twice on the same day** |

All changes are additive (extra keys in dict). If `idempotency_key` is absent, the unique index allows the row through (sparse).

### 6.6 `backend/routers/whatsapp.py` — `trigger_points_earned_event` callsites

`trigger_points_earned_event` is a thin wrapper around `trigger_whatsapp_event` — no signature change needed; downstream `trigger_whatsapp_event` already picks up the event_data dict.

### 6.7 Frontend — `MessageStatusPage.jsx`

| Region | Change |
|---|---|
| `filters` state init | Add `is_test: false` (default off), `date_from: null`, `date_to: null` |
| Stats fetch | Pass `exclude_test=true` unless toggle on |
| Logs fetch | Append `is_test`, `date_from`, `date_to` to URLSearchParams |
| Filter bar | Add "Show test sends" toggle (Switch component); add a date-range picker (use existing `react-day-picker` already in deps) |
| Search | Already wired; backend now searches name + phone — no FE change |
| Table row | Add a small grey badge `TEST` when `log.is_test`; add second line under Status showing `delivered_at` and `read_at` (formatted relative) when present |
| Resend button | If `log.status === "pending"` AND `Date.now() - new Date(log.created_at) < 30*60*1000` AND `log.status_history.length <= 1`, disable with tooltip "Waiting for delivery report (auto-updates)" |
| Stats cards | Split Failed into two: "Rejected" (AuthKey refused) vs "Undelivered" (handset failed). Backend distinguishes via `failure_reason` presence; until B1 confirms, both show under "Failed" unified card — UI is ready for the split. |

### 6.8 Frontend — `WhatsAppAutomationContent.jsx` dead-code cleanup

Lines 475-485 — delete:
```js
// Legacy descriptions
"points_redeemed": ..., // KEEP — still active, just move into crmEventDescriptions
"bonus_points": ..., // KEEP — move into crmEventDescriptions
"wallet_credit": ..., // KEEP — move into crmEventDescriptions
"wallet_debit": ..., // KEEP — move into crmEventDescriptions
"first_visit": ..., // DELETE
"tier_upgrade": ..., // KEEP — move into crmEventDescriptions
"coupon_earned": ..., // KEEP — move into crmEventDescriptions
"feedback_received": ..., // DELETE
"inactive_reminder": ..., // DELETE
"send_bill": ... // KEEP — move into crmEventDescriptions
```
Net result: 3 dead keys deleted, others promoted to `crmEventDescriptions` (where they belong), single source of descriptions.

---

## 7. Test plan (per phase)

### 7.1 Unit tests (new)

| File | What it asserts |
|---|---|
| `backend/tests/test_whatsapp_status_machine.py` | `next_status(None, "initial_send_success") == "pending"`; pending→read direct allowed; rejected→delivered returns None; etc. ~12 cases. |
| `backend/tests/test_log_message_attempt.py` | Given a mocked SendResult with `LogID`, the row written has `message_id=<LogID>`; idempotency duplicate raises `DuplicateKeyError` and is handled. |
| `backend/tests/test_whatsapp_callback.py` | Raw body is always written to `whatsapp_callback_logs`; defensive key parser handles `{"LogID":"..."}`, `{"message_id":"..."}`, missing keys; invalid transition does not update. |

### 7.2 Integration probes (curl, no DB writes from script)

1. Hit `/api/whatsapp/status-callback` with empty body → 200 with raw log appended (not 400).
2. Hit with `{"LogID":"FAKE","status":"delivered"}` → 200, `updated:false` (no matching row).
3. Hit `/test-template` with a known `template_id` → row written in new shape.
4. Hit `/message-logs?is_test=false` → does not return test row from probe 3.

### 7.3 Frontend smoke
- `MessageStatusPage` loads, all filters render, toggle test sends works, date picker filters correctly, resend disabled correctly for fresh pending.

### 7.4 What we CANNOT test until blockers resolve
- Real AuthKey delivery callback → Delivered transition (needs B1 + B3).
- HMAC verification (needs B2).

---

## 8. Risk register (this CR specifically)

| Risk | Mitigation |
|---|---|
| Unique index on `idempotency_key` blocks legitimate retries (e.g. owner intentionally resending the same OTP) | OTP path uses OTP value in key → each OTP is unique; resend endpoint bypasses idempotency by writing through `update_one` with `$inc resend_count`, not `insert_one`. |
| `message_body_text` rendering depends on knowing template body, which we don't always have stored | Best-effort: try `event_template_map`, else AuthKey `getAllTemplate.php` cache, else fall back to `json.dumps(body_values)`. Never blocks send. |
| Defensive key parser in webhook accepts a slightly-wrong payload during B1 wait | All accepted keys are logged to `whatsapp_callback_logs` — full audit; parser is replaced once B1 confirms. |
| Adding `unique sparse` index on existing collection — does Mongo allow it with existing nulls? | Yes — sparse means nulls are not indexed; existing rows pass through unaffected. |
| `next_status` rejects an out-of-order webhook (e.g. `delivered` arrives after `read`) → row stays at `read` | Correct behavior. Logged for diagnostics. |
| Resend "freshness guard" (30 min) might frustrate owner if AuthKey is genuinely slow | Surface tooltip explaining; allow manual override via a second-confirm dialog (out of this CR's scope — fast-follow). |
| Two writers temporarily coexist during deploy (old prod + new preview) | Both write to same collection; new fields are additive, old reader (current dashboard) ignores new fields. Safe. |

---

## 9. Sequenced implementation order (commits)

**Commit 1** — Foundations (no behavior change yet):
- New file `core/whatsapp_status.py` + unit tests.
- New file: this planning doc (already present at this path).

**Commit 2** — Send-side row schema (Phase 1, G1-G10):
- `core/whatsapp.py`: SendResult fields, LogID extraction, `log_message_attempt` new shape, `trigger_whatsapp_event` wrap-with-rejected-row, `render_template_body` helper.
- `server.py`: new indexes.

**Commit 3** — Callsite enrichment (Phase 1 cont.):
- All trigger callsites pass `idempotency_key` + `reference_*` in event_data.
- 11 files (pos, coupons, wallet, points, auth, feedback_service, loyalty, loyalty_jobs).

**Commit 4** — Path B unification (Phase 2, G11):
- `routers/whatsapp.py::send_test_message` calls `log_message_attempt`.
- Unit test for test-send row shape.

**Commit 5** — Webhook hardening (Phase 3 skeleton):
- `whatsapp_callback_logs` collection writes.
- Defensive parser + state machine integration.
- HMAC stub.
- Unit + integration tests.

**Commit 6** — Dashboard backend extensions:
- `message-logs` and `message-stats` extended with `is_test`, `date_from`, `date_to`, name-search.
- `resend` freshness guard.

**Commit 7** — Frontend polish (Phase 5):
- `MessageStatusPage.jsx` filter additions, badge, resend guard.
- `WhatsAppAutomationContent.jsx` dead-code cleanup.

**Commit 8** — Final-mile (post-blocker):
- Parser locked to real AuthKey payload (after B1).
- HMAC activation flip (after B2).
- Owner registers URL (B3).

---

## 10. Files touched — final manifest

### Backend (12 files)
1. `backend/core/whatsapp.py` — major refactor (SendResult, send_single_message, log_message_attempt, trigger_whatsapp_event)
2. `backend/core/whatsapp_status.py` — **NEW**
3. `backend/server.py` — add 6 indexes
4. `backend/routers/whatsapp.py` — webhook refactor, send_test_message rewrite, message-logs/stats extensions, resend guard
5. `backend/routers/pos.py` — 4 callsites updated
6. `backend/routers/coupons.py` — 2 callsites
7. `backend/routers/wallet.py` — 4 callsites
8. `backend/routers/points.py` — 3 callsites
9. `backend/routers/auth.py` — 1 callsite
10. `backend/services/feedback_service.py` — 1 callsite
11. `backend/core/loyalty.py` — 1 callsite
12. `backend/core/loyalty_jobs.py` — 5 callsites

### Backend tests (3 new files)
13. `backend/tests/test_whatsapp_status_machine.py` — **NEW**
14. `backend/tests/test_log_message_attempt.py` — **NEW**
15. `backend/tests/test_whatsapp_callback.py` — **NEW**

### Frontend (2 files)
16. `frontend/src/pages/MessageStatusPage.jsx` — filter additions, badge, resend guard
17. `frontend/src/components/shared/WhatsAppAutomationContent.jsx` — dead-code cleanup

### Docs (this file)
18. `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md` — **this doc**

### Env (owner sets later)
19. `backend/.env` — owner adds `AUTHKEY_WEBHOOK_SECRET=<value>` when B2 resolves (not committed)

**Total: 18 files (1 NEW core, 3 NEW tests, 14 EDITED, 1 NEW doc). 0 deletions.**

---

## 11. Definition of Done (this CR)

- [ ] All 18 files updated per §10.
- [ ] All new unit tests pass (`pytest backend/tests/test_whatsapp_status_machine.py backend/tests/test_log_message_attempt.py backend/tests/test_whatsapp_callback.py`).
- [ ] Linter clean (`ruff backend/`, ESLint frontend).
- [ ] Preview pod restarts cleanly, `/api/health` green.
- [ ] Curl probes (§7.2 items 1–4) all pass.
- [ ] Frontend smoke (§7.3) passes via screenshot.
- [ ] No `whatsapp_message_logs` migration ran; no historical row touched.
- [ ] No write to remote Mongo from any script (only via app endpoints during testing).
- [ ] Doc updated to `status: implementation_complete_awaiting_blocker_resolution` once commits 1–7 merge.
- [ ] **Held open** until B1, B2, B3 resolve, then Commit 8 closes it.

---

## 12. Open questions to confirm before I cut Commit 1

1. **Idempotency on OTP**: do you want `reset_password` to be **strictly idempotent** (one OTP per customer per minute)? Or allow repeat OTPs (current behavior — owner can request new OTP freely)? My plan uses the OTP value itself as part of the key → repeats with same OTP are blocked, but a new OTP always goes through. Confirm?

2. **Cron idempotency window**: for daily cron jobs (birthday, anniversary, etc.), I'm using `f"{customer_id}_{today_iso_date}_{event}"` — this means if cron is re-run on the same day, no duplicate. If you want stricter (per-year) for birthday, say so.

3. **`message_body_text` rendering fallback**: if template body is not in `event_template_map`, I'll fall back to `json.dumps(body_values)` in the field. Acceptable, or skip the field entirely on fallback?

4. **Frontend "Show test sends" toggle default**: off (hide tests) — confirm?

5. **State machine — late `delivered` after `read`**: my plan ignores it. Some teams prefer to record it in `status_history` even if `status` stays at `read`. I'm doing the latter. OK?

Reply with any of these and I'll cut Commit 1 (foundations + this planning doc finalization).
