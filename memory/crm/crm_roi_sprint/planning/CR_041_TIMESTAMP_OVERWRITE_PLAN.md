# CR-041 — Implementation Plan: Fix Timestamp Overwrite on transition_ignored

> **CR**: CR-041
> **Priority**: **P1 HIGH** — silent data corruption on analytics-relevant fields
> **Type**: Bug fix (pure statement re-ordering)
> **Owner approval status**: ⏳ Awaits Q1-Q4 from discovery doc
> **Effort**: ~15 min (~10 LOC in 1 file + re-run existing pytest)
> **Files touched**: `backend/routers/whatsapp.py` only
> **Migration required**: No
> **Schema changes**: No
> **New tests**: 0 (existing failing pytest becomes passing)
> **Discovery**: `discovery/CR_041_TIMESTAMP_OVERWRITE_DISCOVERY.md`
> **Impact analysis**: `planning/CR_041_TIMESTAMP_OVERWRITE_IMPACT_ANALYSIS.md`

---

## 1. Objective

Stop `delivered_at`, `read_at`, `rejected_at`, and `failure_reason` from being
overwritten when a webhook is state-machine-rejected as `transition_ignored`.

## 2. Scope

- ✅ In-scope: one code block in `backend/routers/whatsapp.py::message_status_callback`
- ❌ Out-of-scope: state machine, CR-039 composite lookup, send-side init, frontend, analytics, backfill of already-corrupted rows

## 3. Design (Option A from discovery)

Move the timestamp block from BEFORE the state-machine gate to AFTER, gated by `applied`.

### 3.1 Current Code (routers/whatsapp.py lines 1453-1476)

```python
    # ---- Dispatch time -> status-specific timestamp field ----
    if mapped_status == "delivered":
        set_fields["delivered_at"] = ts_utc_iso
    elif mapped_status == "read":
        set_fields["read_at"] = ts_utc_iso
    elif mapped_status == "rejected":
        set_fields["rejected_at"] = ts_utc_iso
        set_fields["failure_reason"] = (
            payload.get("reason")
            or payload.get("Reason")
            or payload.get("error")
            or payload.get("Error")
            or payload.get("description")
            or payload.get("Message")
            or payload.get("message")
            or raw_status
        )

    # ---- 10. Apply status only if transition is valid ----
    if new_status:
        set_fields["status"] = new_status
        applied = True
    else:
        applied = False
```

### 3.2 New Code

```python
    # ---- 10. Apply status only if transition is valid ----
    if new_status:
        set_fields["status"] = new_status
        applied = True
    else:
        applied = False

    # ---- 10b. Dispatch time -> status-specific timestamp field (CR-041) ----
    # Timestamps and failure_reason are the AUTHORITATIVE record of when the
    # transition ACTUALLY happened. On a state-machine-rejected duplicate/late
    # webhook (transition_ignored), leave them untouched to preserve the
    # original event time. Only apply when the state machine allowed the
    # transition.
    if applied:
        if mapped_status == "delivered":
            set_fields["delivered_at"] = ts_utc_iso
        elif mapped_status == "read":
            set_fields["read_at"] = ts_utc_iso
        elif mapped_status == "rejected":
            set_fields["rejected_at"] = ts_utc_iso
            set_fields["failure_reason"] = (
                payload.get("reason")
                or payload.get("Reason")
                or payload.get("error")
                or payload.get("Error")
                or payload.get("description")
                or payload.get("Message")
                or payload.get("message")
                or raw_status
            )
```

### 3.3 Fields NOT Being Gated (Deliberate)

The following remain in `set_fields` regardless of `applied` because they are
AuthKey-supplied metadata that may legitimately arrive on any webhook including late
ones for already-terminal rows:

- `updated_at` — reflects last-touched timestamp on the row itself; correct to bump
- `time_raw` — literal AuthKey time string for the current event
- `meta_message_id` (from `payload.meta_messageid`)
- `keypress` (from `payload.keypress`)
- `button_param_value` (from `payload.button_param_value`)
- `channel` (from `payload.channel`)
- `mobile_mismatch` — reserved (CR-039 fix returns early on mismatch, so this field is now dead-code but harmless)

**Rationale**: these are informational fields; they enrich the row on any webhook.
They are not analytics-critical timestamps.

---

## 4. Files Changed

| File | Lines Affected | Nature |
|---|---|---|
| `backend/routers/whatsapp.py` | ~30 LOC re-ordered (net +1 comment block, no logic added or removed) | Statement re-ordering |

No other files. No test additions (existing `tests/test_cr039_webhook.py::TestDuplicateDelivered` becomes passing).

---

## 5. Non-Regression Guarantees

| Scenario | Before Fix | After Fix | Verdict |
|---|---|---|---|
| First-time delivered on pending row | `delivered_at` SET ✅ | `delivered_at` SET ✅ | No regression |
| First-time read on delivered row | `read_at` SET, `delivered_at` PRESERVED ✅ | Same ✅ | No regression |
| First-time rejected on pending row | `rejected_at` SET, `failure_reason` SET ✅ | Same ✅ | No regression |
| Duplicate delivered webhook (retry) | `delivered_at` OVERWRITTEN ❌ | `delivered_at` PRESERVED ✅ | **BUG FIXED** |
| Late delivered on read row | `delivered_at` SET, `read_at` PRESERVED — but delivered_at value is now WRONG | `delivered_at` NOT SET (stays null) ✅ | **BUG FIXED** |
| Late delivered on rejected row | `delivered_at` SET, `rejected_at` PRESERVED — impossible state | `delivered_at` NOT SET (stays null) ✅ | **BUG FIXED** |
| Ambiguous_row (CR-039 path) | N/A — returns before line 1454 | N/A — same early return | No interaction |
| `updated_at` bumped on every webhook (audit) | ✅ Bumped | ✅ Bumped | No regression |
| `status_history` push (audit) | ✅ Appended | ✅ Appended | No regression |
| Callback log row inserted | ✅ Inserted | ✅ Inserted | No regression |

---

## 6. Test Plan

### 6.1 Automated (pytest)

Existing test file already covers all cases:
```
/app/backend/tests/test_cr039_webhook.py
```

Run:
```bash
cd /app/backend && python3 -m pytest tests/test_cr039_webhook.py -n 0 -v
```

Expected outcome:
- **Before CR-041**: 10/11 (Test 11 = `TestDuplicateDelivered` FAILS)
- **After CR-041**: **11/11 PASS**

### 6.2 Manual verification (post-deploy)

Send a duplicate `delivered` webhook via curl to a known-delivered row and verify `delivered_at` unchanged:

```bash
# 1. Pick a known-delivered row from prod DB
# 2. Capture its current delivered_at (T1)
# 3. curl -X POST '<BE>/api/whatsapp/status-callback' \
#      -H 'Content-Type: application/json' \
#      -d '{"logid":"<row.message_id>","mobile":"91<row.customer_phone>","status":"delivered","time":"2026-07-04 10:00:00"}'
# 4. Response: {"success":true,"applied":false,...}
# 5. Callback log: verdict='transition_ignored'
# 6. DB row: delivered_at STILL == T1  (was: T2 before the fix)
```

### 6.3 Post-deploy production monitoring (24-hour window)

```javascript
// MongoDB shell
db.whatsapp_message_logs.countDocuments({
  status: "rejected",
  delivered_at: { $ne: null }
})
// Baseline: 1 (existing corrupt row for phone 7505242126)
// Expected after 24h: still 1 (no new corruption)
// Regression signal: count increases
```

---

## 7. Rollout & Rollback

- **Rollout**: hot-reload triggers automatically on file save. Zero downtime.
- **Rollback**: single-file git revert. No data mutation to undo.
- **Compatibility**: no API contract change; no schema change; no client update needed.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Move accidentally drops a case (e.g., forgetting to gate `failure_reason` with rejected) | LOW | MEDIUM | Test 11 exercises exactly this path; manual review of the diff |
| Fix affects legitimate metadata write on ignored events | LOW | LOW | Only temporal + failure_reason gated; other metadata (`meta_message_id`, `channel`, etc.) intentionally NOT gated |
| Unknown consumer of `delivered_at` breaks on `null` where it expected a value | LOW | LOW | Grep confirmed only frontend MessageStatusPage reads these — already handles null gracefully via `(log.delivered_at \|\| log.read_at) && ...` |
| Test 11 flakes on prod DB state changes between test runs | LOW | LOW | QA agent's iteration report confirms test is robust; uses `-n 0` to serialise |

**Overall risk grade: LOW.**

---

## 9. Success Criteria

- ✅ `tests/test_cr039_webhook.py` returns **11/11 PASS**
- ✅ Manual curl duplicate-delivered test preserves original `delivered_at`
- ✅ 24-hour prod DB monitor: `count({status:"rejected", delivered_at:{$ne:null}})` does not increase
- ✅ Zero new WARNING/ERROR log lines related to `webhook`, `mismatch`, or `state machine` post-deploy
- ✅ Message Status page in frontend continues to render "Delivered X ago" / "Read X ago" correctly for happy-path rows

---

## 10. Timeline

| Step | Owner | Est. duration |
|---|---|---|
| Owner approves Q1-Q4 from discovery doc | Owner | -- |
| Switch to Implementation Agent role | Main agent | -- |
| Apply the ~30-line re-ordering | Main agent | 5 min |
| Lint | Main agent | 1 min |
| Run pytest `test_cr039_webhook.py` | Main agent | 3 min |
| Manual curl verification | Main agent | 2 min |
| Update CR_STATUS_DASHBOARD.md | Main agent | 2 min |
| **Total** | | **~15 min** |

---

## 11. Open Questions Requiring Owner Answer Before Implementation

Repeat from discovery doc:

- **Q1**: Approve Option A (re-order timestamp block after state-machine gate)? [YES / NO]
- **Q2**: Confirm only temporal + failure_reason are gated; leave `meta_message_id`, `keypress`, `button_param_value`, `channel` ungated? [YES / NO / DIFFERENT]
- **Q3**: Repair the 1 known corrupt row (phone 7505242126) in this CR, or separate one-off script? [IN-CR / SEPARATE / SKIP]
- **Q4**: Add `test_cr039_webhook.py` to CI pipeline post-fix? [YES / NO / LATER]

---

## 12. Post-Implementation Follow-Ups (Not in this CR)

- **CR-041-B** — Retroactive backfill audit script: walk every `whatsapp_message_logs` row, compare `delivered_at` to first-applied webhook in `status_history.raw_payload.time`, correct mismatched rows. ~30 LOC. Owner approval + data-integrity review required.
- **CR-041-F1** — Split `whatsapp.py` (currently 1631 lines) into `routers/whatsapp_webhook.py` + `routers/whatsapp_resend.py`. Non-functional refactor.
- **CR-041-F2** — Add MongoDB compound unique index `(user_id, message_id, customer_phone)` on `whatsapp_message_logs` for hard uniqueness at DB layer.
- **CR-041-F3** — Enable AuthKey HMAC verification: set `AUTHKEY_WEBHOOK_SECRET` env var, activate signature check at `routers/whatsapp.py:1332-1346` (currently dormant).

Split into separate CRs post-CR-041 landing if owner approves.

---

*Planning doc — CR-041 v1.0. Awaits owner Q1-Q4 approval. Implementation must not
begin until this doc is signed off.*
