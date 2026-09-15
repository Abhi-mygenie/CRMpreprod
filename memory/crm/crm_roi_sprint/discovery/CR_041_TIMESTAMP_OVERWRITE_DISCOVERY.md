# CR-041 — Discovery: WhatsApp Webhook Timestamp Overwrite on transition_ignored

> **Type**: Discovery — pre-existing HIGH-severity bug surfaced by CR-039 QA regression
> **Date**: 2026-07-03
> **Source**: QA agent finding in `/app/test_reports/iteration_1.json` (Test 11 FAIL)
> **Status**: 📋 Registered — Discovery + Impact + Planning complete, awaits owner approval
> **Severity**: **P1 HIGH** (silent data corruption on delivery-time analytics; pre-dates CR-039)
> **Risk**: MEDIUM–HIGH (silent, affects reporting accuracy, not user-visible crash)

---

## Problem Statement

In `backend/routers/whatsapp.py::message_status_callback` the status-specific timestamp
fields (`delivered_at`, `read_at`, `rejected_at`, `failure_reason`) are assigned to
`set_fields` **before** the state-machine gate that decides whether the incoming
transition is valid. Consequently, when a webhook is state-machine-rejected as
`transition_ignored` (e.g. duplicate delivered, late delivered on a row already `read`,
delivered after rejected, etc.), the DB row's timestamp field is **still overwritten**
even though the status remains unchanged.

Effect: the original delivery / read / rejection instant is lost, replaced with the
retry timestamp. All downstream consumers of these timestamps (frontend display,
analytics, SLA measurement) see wrong values.

---

## Buggy Code (routers/whatsapp.py lines 1450-1499)

```python
# Line 1453-1469: timestamp assignment happens FIRST, unconditionally
if mapped_status == "delivered":
    set_fields["delivered_at"] = ts_utc_iso           # ← always assigned
elif mapped_status == "read":
    set_fields["read_at"] = ts_utc_iso
elif mapped_status == "rejected":
    set_fields["rejected_at"] = ts_utc_iso
    set_fields["failure_reason"] = ...

# Line 1471-1476: state machine check happens SECOND
if new_status:
    set_fields["status"] = new_status
    applied = True
else:
    applied = False    # ← too late — timestamp already added to set_fields

# Line 1489: unconditional DB update includes the timestamp
await db.whatsapp_message_logs.update_one({...}, {"$set": set_fields, ...})
```

## Root Cause Analysis (QA-Provided, Verified in Prod DB)

Reproduction (from `iteration_1.json` → `rca_of_the_issue`):

1. Row exists: `status=delivered`, `delivered_at=T1`.
2. AuthKey retries: `POST /api/whatsapp/status-callback` with same logid, mobile, status=`delivered`, `time=T2` (T2 > T1).
3. Handler response: `{"success": true, "applied": false}` — CORRECT (state machine blocked delivered→delivered).
4. Callback log records `verdict=transition_ignored` with reason `"'delivered'->'delivered' not allowed"` — CORRECT.
5. **BUT**: DB row now has `delivered_at=T2`. `T1` is lost forever.

---

## Blast-Radius Evidence (Live Prod DB Query 2026-07-03)

| Metric | Value |
|---|---|
| Total `whatsapp_message_logs` rows | 565 |
| Rows with `status=rejected` AND `delivered_at != null` (impossible under correct semantics) | **1** — corruption fingerprint |
| Sample of 10 rows with both `delivered_at` and `rejected_at`: temporal impossibility (`delivered_at > rejected_at`) | **2** |

Confirmed corrupted row (evidence of the bug in the wild):
```
phone=7505242126, created=2026-07-03T08:47:59
delivered_at=2026-07-03T15:12:30    ← set AFTER
rejected_at =2026-07-03T08:50:30    ← was set 6h EARLIER
status=rejected                     ← current state
status_history: 5 webhook events (2 applied + 3 transition_ignored)
```

Older corruption from before CR-039 investigation (June 2026):
```
phone=9035133228, status=delivered
delivered_at=2026-06-17T20:20:32
rejected_at =2026-06-17T19:49:11
(rejected_at persists from earlier failure; delivered_at came later on retry)
```

Note: only the most extreme corruptions (`delivered_at > rejected_at`) surface as
detectable by this query. Corruption where `delivered_at` is simply overwritten with a
later `delivered_at` retry timestamp is invisible to this query — actual blast radius
is likely much larger than 1 row.

---

## Complete Behaviour Model (Impact Analysis Reference)

### All WRITE paths to `delivered_at` / `read_at` / `rejected_at`

| Path | File / Line | Behaviour | Buggy? |
|---|---|---|---|
| Send-time initial row insert | `core/whatsapp.py:649-654` | `delivered_at=None`, `read_at=None`, `rejected_at=now if status=='rejected' else None` | ✅ Correct |
| Webhook update | `routers/whatsapp.py:1454-1469` | Sets timestamp BEFORE state-machine gate | ❌ **THIS BUG** |
| Any other path | — | None found | — |

Search confirmed: **only ONE code path writes these fields via webhook**, and it is
the buggy path.

### All READ paths (who consumes the timestamps)

| Consumer | File / Line | Purpose | Bug impact |
|---|---|---|---|
| Frontend Message Status page | `frontend/src/pages/MessageStatusPage.jsx:608-612` | Shows `Read {formatRelativeTime(read_at)}` or `Delivered {formatRelativeTime(delivered_at)}` under each message row | Owner sees wrong relative delivery time (e.g., "5m ago" when it was actually delivered 6h ago) |
| Backend `GET /api/whatsapp/message-logs` | `routers/whatsapp.py:1116-1177` | Returns full row projection to frontend | Pass-through of corrupted values |
| Backend `GET /api/whatsapp/message-stats` | `routers/whatsapp.py:1095` | Aggregates by `status` field only, does NOT read timestamps | Safe |
| Any analytics/scheduled reports | grep across `/app/backend` | **None found** — no backend job currently computes averages/aggregates over these timestamps | Safe today, will break future analytics |
| CR-024 scheduled campaigns | `core/campaign_jobs.py` | Uses `next_run_at` on campaigns, unrelated to message timestamps | Safe |
| Loyalty engine | `core/loyalty.py:330,505` | Sets `status=rejected` on failed loyalty award messages but does NOT touch delivered_at/read_at | Safe |

### Trigger scenarios in production

Every scenario below triggers the bug:

1. **AuthKey retry**: AuthKey retries a webhook if our first response fails/timeouts. Both webhooks carry same logid + status; second triggers `transition_ignored` but overwrites timestamp.
2. **Late `delivered` after `read`**: WhatsApp/Meta sometimes forwards events out-of-order. `read` arrives first, then `delivered` arrives — state machine blocks (`read→delivered not allowed`) but `delivered_at` still assigned.
3. **Late `delivered` after `rejected`**: rare, but possible when a message initially fails then re-attempts and gets through — CRM sees rejected first then delivered.
4. **Multi-recipient duplicate LogID pre-CR-039**: before CR-039, the wrong-row updates *also* corrupted timestamps on unrelated recipients. CR-039 fixed the wrong-row problem but did not touch the timestamp bug.
5. **Ambiguous_row post-CR-039**: safe — CR-039's `ambiguous_row` return happens BEFORE line 1454, so this path bypasses the bug.

---

## Options (Sized)

| # | Option | Effort | Impact | Risk |
|---|---|---|---|---|
| **A** ✅ | **Move timestamp block AFTER state-machine gate, gate by `applied`** | ~10 LOC in 1 file | Fully fixes the bug. No side effects on happy path. | **LOW** — pure re-ordering, no logic change |
| B | Add an `if applied:` guard around each timestamp assignment, keep block position | ~5 LOC | Same behaviour as A | LOW — but slightly less readable |
| C | Skip the entire `update_one` when `applied=False` and no side-channel fields to update | ~15 LOC | Also skips writes of `meta_message_id`, `keypress`, `button_param_value`, `channel`, `mobile_mismatch` on ignored transitions — arguable regression | MEDIUM — some webhook metadata legitimately arrives on ignored events (e.g. late `meta_messageid` from WhatsApp for an already-read message) |
| D | Store all timestamps as ordered arrays (append-only) instead of scalar fields | ~40 LOC + schema migration + frontend change | Preserves full timeline, but overkill and invasive | HIGH — big surface area |
| E | Do nothing / defer | 0 LOC | Data continues to corrupt silently | Accepts risk |

**Recommendation**: Option **A**. Smallest surface, no schema change, purely re-orders
existing statements, minimal risk. Ready-made pytest test already exists to verify
(the currently-failing Test 11 in `test_cr039_webhook.py`).

---

## Non-Goals

- ❌ Do NOT retroactively repair already-corrupted rows in this CR. Repair is a separate
  concern (goes to CR-041-B follow-up, optional).
- ❌ Do NOT change the state machine (`core/whatsapp_status.py`).
- ❌ Do NOT modify frontend display logic — the fix is entirely backend.
- ❌ Do NOT touch send-time initialization (`core/whatsapp.py:649-654`) — that path is correct.
- ❌ Do NOT change the audit `status_history` push at line 1479 — it correctly records every webhook whether applied or not.

---

## Open Questions for Owner

| # | Question | Why It Matters |
|---|---|---|
| Q1 | Approve Option A (re-order timestamp block after state-machine gate)? | Blocks implementation |
| Q2 | Should we also gate `meta_message_id`, `keypress`, `button_param_value`, `channel` behind `applied`? | These are AuthKey-supplied metadata that legitimately arrives *anytime* — leaving them ungated is safe. Recommend: only gate the temporal + failure_reason fields. |
| Q3 | Should we repair the 1 currently-corrupt row (phone 7505242126) as part of this CR, or defer to a one-off script? | Straightforward but is a data mutation. Recommend: separate one-off. |
| Q4 | Include `test_cr039_webhook.py` re-run in CI (post-fix Test 11 must pass)? | Ensures no future regression. |

---

## Verification Matrix (When Implemented)

| Test | Expected Post-Fix |
|---|---|
| Duplicate `delivered` webhook on already-delivered row | `delivered_at` UNCHANGED (was: overwritten). Verdict `transition_ignored`. `status_history` gets 1 additional audit entry. |
| Late `delivered` on already-`read` row | `delivered_at` UNCHANGED (was: overwritten). Verdict `transition_ignored`. |
| Late `delivered` on already-`rejected` row | `delivered_at` UNCHANGED and remains `null`. Verdict `transition_ignored`. |
| First-time `delivered` on `pending` row (happy path) | `delivered_at` SET to `ts_utc_iso`. Verdict `applied`. Regression test — must still pass. |
| First-time `read` after `delivered` (happy path) | `read_at` SET, `delivered_at` PRESERVED. Verdict `applied`. |
| First-time `rejected` on `pending` row | `rejected_at` SET, `failure_reason` SET. Verdict `applied`. |
| `mobile_mismatch` flag toggling on transition_ignored | Should NOT get set on ignored transitions post-fix (was: set on any mismatch) |
| Ambiguous_row (CR-039 path) | Unchanged — CR-039 exits before reaching timestamp block, no regression |
| Existing pytest `/app/backend/tests/test_cr039_webhook.py::TestDuplicateDelivered` | Currently FAILING. Must PASS after this fix. |
| All other CR-039 tests | Continue to PASS. |

---

## Related Docs

- Source QA report: `/app/test_reports/iteration_1.json`
- Related CR: `discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md` (implemented; this bug orthogonal)
- Impact analysis (this session): `planning/CR_041_TIMESTAMP_OVERWRITE_IMPACT_ANALYSIS.md`
- Implementation plan: `planning/CR_041_TIMESTAMP_OVERWRITE_PLAN.md`
- Existing test: `/app/backend/tests/test_cr039_webhook.py::TestDuplicateDelivered`

---

*Discovery doc — CR-041 P1 HIGH. Awaits owner Q1-Q4 answers. Implementation blocked until planning doc §11 is signed off.*
