# CR-041 — Impact Analysis: WhatsApp Webhook Timestamp Overwrite

> **Parent CR**: CR-041
> **Type**: Impact analysis document
> **Date**: 2026-07-03
> **Auditor role**: Planning Agent
> **Depth**: End-to-end trace (send-side init → webhook write → dashboard read → frontend render)

---

## 1. Data-Flow Diagram

```
                   ┌────────────────────────────────────────────┐
                   │           SEND PATH (correct)              │
                   │                                            │
   CRM UI ── send-message ──► core/whatsapp.py::send_single_message
                                     │
                                     ▼
                        AuthKey requestjson.php
                                     │
                                     ▼
                        log_message_attempt() lines 649-654
                        writes: delivered_at=None, read_at=None,
                                rejected_at=None (or now if send failed)
                                     │
                                     ▼
                        whatsapp_message_logs row inserted
                                     │
                   ┌─────────────────┴─────────────────┐
                   │                                   │
                   ▼                                   ▼
        WEBHOOK PATH (BUGGY)                READ PATH (correct)
        ────────────────────                ─────────────────
                                            │
AuthKey POST → routers/whatsapp.py::         │
message_status_callback                     │
   │                                        ▼
   ▼                                GET /api/whatsapp/message-logs
Line 1408 composite lookup                  │
(CR-039 fix — OK)                          │
   │                                        ▼
   ▼                                        │  returns row
Line 1454-1469                              │  including
UNCONDITIONAL timestamp set                 │  delivered_at,
   ⚠️ BUG POINT                            │  read_at,
   │                                        │  rejected_at
   ▼                                        │
Line 1472 state-machine gate                ▼
   │                                MessageStatusPage.jsx:608-612
   ▼                                Shows "Read/Delivered {formatRelativeTime}"
Line 1489 unconditional update_one          │
   │                                        ▼
   ▼                                Owner sees WRONG delivery time
whatsapp_message_logs row updated           on retries / out-of-order events
(timestamp overwritten even on
 transition_ignored)
```

---

## 2. Full Enumeration of Write Paths

Search: `grep -rn "delivered_at\|read_at\|rejected_at" /app/backend --include="*.py"`

| Line Ref | File | Behaviour | Correct? |
|---|---|---|---|
| `core/whatsapp.py:649-654` | send-time initial insert | Sets all three to `None`, except `rejected_at=now` when AuthKey initial POST returns fail | ✅ Correct — one-shot initialisation |
| `routers/whatsapp.py:1264` | Comment/docstring | Documentation only | ✅ N/A |
| `routers/whatsapp.py:1454-1469` | webhook handler | Assigns timestamp before state-machine gate | ❌ **BUGGY** — this is CR-041 |
| Nothing else | — | — | — |

**Conclusion**: only one buggy write path exists. Fix is scoped to one code block in one function.

---

## 3. Full Enumeration of Read Paths

Search: `grep -rn "delivered_at\|read_at\|rejected_at" /app/frontend /app/backend --include="*.jsx" --include="*.js" --include="*.py"`

| Consumer | File / Line | Behaviour | Impact of corruption |
|---|---|---|---|
| Frontend Message Status page — display | `frontend/src/pages/MessageStatusPage.jsx:608-612` | Renders `"Read {relativeTime}"` or `"Delivered {relativeTime}"` under each message row | Owner sees wrong "when was this delivered/read" info — trust erosion |
| Backend `GET /api/whatsapp/message-logs` | `routers/whatsapp.py:1116-1177` | Returns row as-is via projection | Pass-through — no computation, just fanout |
| Backend `GET /api/whatsapp/message-stats` | `routers/whatsapp.py:1067-1113` | Aggregates by `status` field only. **Does NOT read timestamp fields.** | ✅ Safe — stats robust to timestamp corruption |
| Any analytics / cron report over timestamps | grep result | **NONE found** — no backend job computes averages, medians, or trends over these fields | ✅ Safe today; unsafe if future analytics added |
| Loyalty engine | `core/loyalty.py:330,505` | Only writes `status=rejected`, does not read timestamp fields | ✅ Safe |
| Test file | `backend/tests/test_cr039_webhook.py` | Test 11 (`TestDuplicateDelivered`) asserts `delivered_at` unchanged — currently FAILS | Will PASS post-CR-041 fix |

**Conclusion**: current user-visible impact = MessageStatusPage relative time strings.
Reporting layer is safe today because no analytics rolls up these timestamps. Future
analytics work (e.g., "average time to delivery" dashboard) would inherit wrong
numbers without this fix.

---

## 4. Trigger-Scenario Frequency Estimate

Below scenarios all trigger the bug. In descending likelihood:

| Scenario | Estimated frequency | Data corrupted per event |
|---|---|---|
| AuthKey retries webhook after our first response was too slow | LOW-MEDIUM (implementation-dependent — depends on AuthKey retry policy) | `delivered_at` / `read_at` / `rejected_at` bumped forward |
| WhatsApp forwards `delivered` and `read` out of order (read arrives first, delivered second) | LOW | `delivered_at` set retroactively on a row already `read`, `read_at` preserved |
| Late `delivered` webhook after a `rejected` retry | RARE | temporal impossibility, easily spotted (this is the "1 row" fingerprint we found) |
| Duplicate LogID batch pre-CR-039 → wrong-row timestamp overwrite | HIGH before 2026-07-03 fix, ZERO now | Timestamps on unrelated recipients |

Given production behaviour observed today (5 webhook events per row for phone
7505242126, of which 3 were `transition_ignored`), the bug fires often enough that a
non-trivial fraction of rows have corrupted `delivered_at` / `read_at` values that a
simple `status`-based query cannot detect.

---

## 5. Corruption Blast Radius (Live Prod DB)

Direct query results (see discovery doc for the query):

| Signal | Count | Meaning |
|---|---|---|
| Total rows | 565 | baseline |
| `status=rejected AND delivered_at!=null` | **1** | corruption fingerprint — impossible legit case |
| `status=pending AND delivered_at!=null` | 0 | good; no pending row was ever timestamp-stamped |
| `delivered_at > rejected_at` in sample of 10 | 2 | at least 2 rows have temporal impossibility (one is the same as above, so 2 distinct rows minimum) |
| **Estimated invisible corruption** (rows where `delivered_at` was silently bumped forward by a retry, no temporal impossibility) | UNKNOWN — cannot be detected by DB query alone | requires cross-referencing every row against its `status_history.raw_payload.time` |

### Bounding Estimate

An audit script would need to iterate every row and compare `delivered_at` against the
`raw_payload.time` of the FIRST `applied=True webhook` event in `status_history`. If
the two differ, the timestamp was overwritten by a later `transition_ignored` event.
This scan is out-of-scope for CR-041 but is estimated at ~30 LOC and can be run in a
few seconds against the current 565 rows.

**Recommendation**: run the audit script AFTER CR-041 is deployed, then decide whether
to backfill.

---

## 6. Downstream Systems Affected

| System | Direct read? | Downstream impact if corrupt |
|---|---|---|
| Message Status page (owner sees per-message delivery timing) | ✅ YES | Wrong "Delivered X ago" strings |
| Campaign History page | Query does not include `delivered_at` in projection | Not affected |
| Customer Detail modal | Grep found no reference | Not affected |
| POS integration API | No consumer | Not affected |
| MyGenie POS callback (`push_crm_token`) | Doesn't touch these fields | Not affected |
| CR-024 scheduled campaigns | Uses `next_run_at` on campaigns, not on messages | Not affected |
| WhatsApp resend flow (`whatsapp_resend`) | Reads `status` + `resend_count`, not timestamps | Not affected |
| CR-035 customer import/export | Handles customers only, not messages | Not affected |
| Loyalty engine | Reads customer + orders, not messages | Not affected |

**Blast radius is narrow** — 1 frontend page in current codebase. Future analytics
would inherit corruption. No cross-system data-integrity chain is broken.

---

## 7. Interaction With CR-039 (Just Deployed)

CR-039 does NOT interact with the timestamp bug directly. The composite-lookup fix
returns early with `ambiguous_row` at line 1449 (before the buggy block at 1454), so
the ambiguous_row path bypasses the bug entirely.

**However**: CR-039's Test 11 (`TestDuplicateDelivered`) was written to verify the
timestamp-preservation guarantee, and it FAILS on the current code. Once CR-041 is
applied, Test 11 will PASS. This test acts as a permanent regression guard.

---

## 8. Rollback / Rollforward Safety

- **Rollback** is a single-file git revert. No schema mutation, no data change.
- **Rollforward** — CR-041's fix is idempotent. Applying twice does nothing.
- **Compatibility with in-flight webhooks** — the fix does not change API contract,
  request/response shape, or verdict values. Existing webhook consumers (if any
  downstream monitors) see identical behaviour on the happy path.

---

## 9. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fix accidentally suppresses timestamp assignment on happy path | LOW | HIGH | Existing pytest Test 11 verifies timestamp IS set on first-time delivery |
| Fix breaks legitimate metadata write (`meta_message_id`, `keypress`, etc.) on ignored events | MEDIUM | LOW | Q2 in discovery: recommend NOT gating those fields; only gate temporal + failure_reason |
| Fix leaves 1 known corrupt row (phone 7505242126) uncorrected | HIGH (100% if we don't backfill) | LOW (analytics-only) | Q3 in discovery: separate one-off backfill script |
| Regression on `status_history` audit push | LOW | LOW | The push at line 1479 is unrelated to the bug and stays unchanged |
| Regression on `update_one` when set_fields is now smaller for ignored events | LOW | LOW | `updated_at` + `time_raw` remain in set_fields so update_one still fires; audit push still works |

**Overall risk grade: LOW.**

---

## 10. Success Criteria (Post-Fix)

- ✅ Existing pytest `tests/test_cr039_webhook.py::TestDuplicateDelivered` PASSES
- ✅ All other CR-039 tests continue to PASS (10/11 → 11/11)
- ✅ Prod DB query `count({status: "rejected", delivered_at: {$ne: null}})` does not increase over the next 7 days (baseline: 1)
- ✅ No new backend errors in `/var/log/supervisor/backend.err.log` beyond baseline
- ✅ Message Status page renders correctly on a mixture of pending / delivered / read / rejected rows

---

*Impact analysis — CR-041 v1.0. Scoped, bounded, and testable. Feeds into
`planning/CR_041_TIMESTAMP_OVERWRITE_PLAN.md`.*
