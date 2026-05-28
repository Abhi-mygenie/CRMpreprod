# CR-004 Phase 3.5 — Implementation Closeout (Commits 1–7)

**Parent plan**: `../planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md`
**Status**: `cr_004_p3_5_parked_awaiting_option_a_send_side_live_test` (2026-05-28 evening)
**Previous status**: `implementation_complete_awaiting_blocker_resolution` (2026-05-28 morning)
**Date completed**: 2026-05-28 (Commits 1–7 + receive-side hotfix)
**Tenant**: R689 Kunafa Mahal
**Branch**: `28-may` (preview pod `/app`)
**Owner action remaining**: Choose Option A (route POS to preview for one synthetic end-to-end order) OR Option B (push branch to prod). See partial live test report: `../qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md`

---

## 1. Executive summary

CR-004 P3.5 — the WhatsApp message-status pipeline refactor — is **functionally complete on the preview pod**. The dashboard data integrity issue (rows stuck Pending forever due to `message_id=None`) is fixed for all new sends. The webhook endpoint is fully rebuilt, audit-first, state-machine-guarded, and ready to receive AuthKey delivery reports. The frontend dashboard now hides test sends by default, supports name+phone search, date range filtering, and in-flight resend protection.

**22 gaps planned. 17 resolved. 5 deferred (G12, G17 activation, G19 owner-supplied, G20 owner ops, G22 owner declined).**

---

## 2. Commits delivered

| # | Title | Files | LoC delta | Behavior change |
|---|---|---|---|---|
| 1 | Foundations — state machine | 2 NEW (`core/whatsapp_status.py`, `tests/test_whatsapp_status_machine.py`) | +166 | None (pure module + tests; no imports yet) |
| 2 | Send-side row refactor (G1, G2, G3, G4, G5, G6, G7, G8, G9, G10) | `core/whatsapp.py`, `server.py` | ~+90/-25 | All new sends write 30+ field row with real `logid`, raw AuthKey response, idempotency-key-ready, trigger exceptions visible as `rejected` rows. 6 new indexes including unique partial on `(user_id, idempotency_key)`. |
| 3 | Callsite enrichment (G3, G6, G8) | 9 files (8 callsite owners + `trigger_points_earned_event` signature) | ~+200/-30 | ~22 callsites populate `idempotency_key` + `reference_type` + `reference_id` in `event_data`. POS retries / cron re-runs no longer double-send. |
| 4 | Path B unification (G11) | `routers/whatsapp.py` | +35/-15 | `/test-template` writes via `log_message_attempt` — one row shape across the codebase. |
| 5 | Webhook full rewrite (G13, G14, G15, G16, G18, G19) | `routers/whatsapp.py` (~180 lines) | +180/-50 | Audit-first; `logid` lookup; locked status map; IST→UTC time parsing; dedicated `delivered_at`/`read_at`/`rejected_at` fields; `failure_reason`; state machine guards out-of-order; HMAC verifier dormant; `meta_message_id`/`keypress`/`button_param_value` captured. |
| 6 | Dashboard backend extensions | `routers/whatsapp.py` | +60/-15 | `include_test` filter (default off); name+phone regex-escaped search; template dedup; resend 30-min in-flight grace period. |
| 7 | Frontend polish | `MessageStatusPage.jsx`, `WhatsAppAutomationContent.jsx` | ~+90/-25 | Date range pickers; "Show test sends" toggle; TEST badge; delivered_at/read_at subtext; resend in-flight tooltip; dead-code (3 legacy event descriptions) removed. |

**Total files changed**: 15 edited + 2 new = **17 files** (vs. 18 planned — `core/loyalty.py` was already touched in Commit 3 inline, no separate handover doc needed for it).

**Total LoC delta**: roughly **+820 / -160**, net +660.

---

## 3. Decisions log (final, locked)

| ID | Decision | Source |
|---|---|---|
| Q1 | OTP `reset_password` has NO `idempotency_key` — owner can re-request OTPs freely | owner reply |
| Q2 | Cron idempotency window: daily, `{customer_id}_{YYYY-MM-DD}_{event}` | owner reply |
| Q3 | `message_body_text` has no fallback — field null when template body unknown | owner reply |
| Q4 | "Show test sends" toggle defaults OFF | owner reply |
| Q5 | Late `delivered` after `read` does NOT regress status; recorded in `status_history` with `applied: false` | owner reply |
| B1 | AuthKey delivery webhook payload schema | owner-shared real sample 2026-05-28 |
| B2 | **No webhook signing** — AuthKey does not sign webhooks; HMAC verifier stays dormant | sample headers carry no signature; owner confirmed only one key concept exists |
| B3 | Owner registers webhook URL in AuthKey console and pushes branch to prod | owner ops, not in code scope |
| — | NO database backfill (G22) | owner declined |
| — | NO legacy `sent`/`failed` row migration (G12) | owner declined |
| — | NO `.env` AuthKey-related secrets needed | follows from B2 |

---

## 4. Target row schema — landed

`whatsapp_message_logs` rows written after Commits 1–7 contain (30 fields):

```
id, user_id, is_test,
event_type, reference_type, reference_id, pos_order_id, idempotency_key,
customer_id, customer_name, customer_phone, country_code,
template_id, template_name, campaign_id,
body_values, message_body_text, media_url, media_filename, channel,
message_id, authkey_http_status, authkey_raw_response,
meta_message_id, keypress, button_param_value, time_raw, mobile_mismatch,
status, delivered_at, read_at, rejected_at, failure_reason, error,
resend_count, last_resend_at,
status_history, created_at, updated_at
```

`message_id` is now reliably populated with AuthKey's `logid` (the join key for webhook updates).

---

## 5. New MongoDB indexes (all sparse / partial, additive)

```
whatsapp_message_logs:
  idx_wml_user_created        (user_id, created_at DESC)
  idx_wml_user_status         (user_id, status)
  idx_wml_message_id          (message_id)            sparse
  idx_wml_user_idem           (user_id, idempotency_key) unique + partial filter on string-only idempotency_key

whatsapp_callback_logs (new collection):
  idx_wcl_received            (received_at DESC)
  idx_wcl_logid               (logid)                 sparse
```

**Important learning (Commit 2 mid-flight fix)**: MongoDB compound `sparse=True` indexes do NOT exclude documents missing the secondary field — they index them as null. For unique compound indexes with optional secondary fields, **must use `partialFilterExpression`**. The planning doc was updated with this lesson.

---

## 6. Webhook contract (locked, ready for AuthKey)

**Endpoint**: `POST /api/whatsapp/status-callback` (public, no auth).

**Expected payload** (from real AuthKey sample 2026-05-28 15:48:23):
```json
{
  "logid": "6eec3f25a3434aad924c3ccca2009580",
  "mobile": "919306459030",
  "status": "delivered",
  "time": "2026-05-28 15:48:22",
  "channel": "wp",
  "meta_messageid": "wamid.HBgM...",
  "keypress": null,
  "button_param_value": "OTE2NTc3"
}
```

**Status mapping** (locked):
| AuthKey `status` | Our `status` | Timestamp set |
|---|---|---|
| `sent` | `pending` | (none) |
| `delivered` | `delivered` | `delivered_at` |
| `read` | `read` | `read_at` |
| `failed` / `undelivered` / `rejected` | `rejected` | `rejected_at` + `failure_reason` |
| anything else | (no change) | logged as `unknown_status` in `whatsapp_callback_logs` |

**Audit collection** `whatsapp_callback_logs` captures every inbound POST regardless of parse success, with `verdict` ∈ `{applied, transition_ignored, no_matching_row, rejected_no_logid, unknown_status, rejected_signature, db_update_failed}`.

---

## 7. Security posture (defense without HMAC)

AuthKey doesn't sign webhooks. The endpoint is permissive but tightly scoped:
- **Audit-first**: every inbound POST persisted before parsing.
- **Lookup by `logid`** (32-char hex, ~10³⁸ keyspace) — spoofing requires guessing real logids.
- **State machine**: forward transitions only; no status regression.
- **Limited blast radius**: webhook can only set status + timestamps + `meta_message_id`/`channel`/`keypress`/`button_param_value`; cannot alter recipient, template, body, customer_id.

**Fast-follow hardening (Commit 8 backlog, optional)**:
- IP allowlist for AuthKey's origin (`157.245.105.3` observed).
- Rate limit by source IP.
- Replay window check (reject `time` > 24h drift).

---

## 8. Behavioral matrix — before vs after

| Behavior | Before P3.5 | After Commits 1–7 |
|---|---|---|
| `message_id` on new rows | always `None` | populated from `logid` |
| Trigger exception (template missing, var error) | silent black hole, no row | `rejected` row with `error="trigger_error: ..."` |
| POS double-fires `send_bill` on same order | 2 WhatsApps to customer | **1** — second blocked by unique partial index, INFO logged |
| Cron birthday fires twice same day | 2 messages | **1** — `{cust}_{YYYY-MM-DD}_birthday` idempotency |
| AuthKey delivery callback (after B3 done) | dropped (`message_id required`) | row flips Pending → Delivered with `delivered_at` (UTC) |
| Late `delivered` after `read` | status would regress to Delivered | status stays Read; history entry pushed with `applied: false` |
| Path B (test send via `/test-template`) | wrong field name, wrong status values, missing audit fields | identical shape to Path A, `is_test: true` |
| Dashboard stats include owner's test pokes | yes (inflated) | excluded by default; toggle to include |
| Search "Abhi" | no match (phone-only) | matches name + phone |
| Search `*` or `(` | 500 error | safe (regex-escaped) |
| Resend a Pending row aged 2 minutes | re-sends → duplicate WhatsApp | skipped with `in_flight_grace_period` (30 min window) |
| Filter "Templates" dropdown duplicates | yes (casing variants) | deduped (normalized key) |
| Legacy event keys in automation page (`first_visit`, `feedback_received`, `inactive_reminder`) | shown | removed (dead-code cleanup) |

---

## 9. Remaining work (out of this CR's preview scope)

| Item | Owner | Effort | Notes |
|---|---|---|---|
| Push `28-may` to production CRM | Owner | git ops | Code is production-ready |
| Register webhook URL in AuthKey console | Owner | console click | Recommend `https://crm.mygenie.online/api/whatsapp/status-callback` for prod |
| OR: Have Laravel preprod forward to CRM | Owner | Laravel config | Alternative if AuthKey allows only one URL |
| Optional: IP allowlist for `/api/whatsapp/status-callback` | Owner | nginx/middleware | After confirming AuthKey IP range with their support |
| Optional: rate limit + replay window | Future CR | small | Belt-and-braces hardening |
| Live end-to-end verification on prod | Owner | 5 min | Place a POS order → watch dashboard flip to Delivered/Read |
| AuthKey support: confirm full IP egress range | Owner | email | For IP allowlist accuracy |

---

## 10. Files manifest (final)

### New files
- `backend/core/whatsapp_status.py` — pure state machine
- `backend/tests/test_whatsapp_status_machine.py` — 15 unit tests
- `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_COMMIT_1_AND_2_HANDOVER.md` — Commits 1+2 implementation handover (for the implementation agent or reviewer)
- `memory/crm/crm_roi_sprint/implementation/CR_004_P3_5_IMPLEMENTATION_CLOSEOUT.md` — **this doc**

### Modified files
- `backend/core/whatsapp.py` — `SendResult`, `send_single_message`, `send_bulk_messages`, `log_message_attempt`, `trigger_whatsapp_event`, `trigger_points_earned_event` (signature extended)
- `backend/server.py` — 6 new indexes in lifespan startup
- `backend/routers/whatsapp.py` — imports + `send_test_message` rewrite + `message_status_callback` full rewrite + `message-stats`/`message-logs`/`message-filters` extensions + `resend` in-flight guard
- `backend/routers/auth.py` — 1 callsite (`reset_password`, no idempotency_key)
- `backend/routers/pos.py` — 4 callsites (send_bill, welcome_message, tier_upgrade, POS event gateway)
- `backend/routers/points.py` — 3 callsites (bonus_points, points_earned follow-up, tier_upgrade)
- `backend/routers/wallet.py` — 4 callsites (credit, debit, 2× points_earned follow-up)
- `backend/routers/coupons.py` — 2 callsites (coupon_earned, points_earned follow-up)
- `backend/services/feedback_service.py` — 1 callsite (feedback_request)
- `backend/core/loyalty.py` — 1 callsite (points_redeemed)
- `backend/core/loyalty_jobs.py` — 5 callsites (birthday, anniversary, points_expiring, coupon_expiring, inactive_customer)
- `frontend/src/pages/MessageStatusPage.jsx` — filter state + UI additions + TEST badge + status subtext + in-flight resend guard
- `frontend/src/components/shared/WhatsAppAutomationContent.jsx` — dead-code cleanup
- `memory/crm/crm_roi_sprint/planning/CR_004_PHASE_3_5_MESSAGE_STATUS_PIPELINE_REFACTOR_PLAN.md` — kept updated through implementation (B2 resolution, security section, partial index lesson)

---

## 11. Verification log (preview pod)

All commits verified independently with the same gates:

- ✅ `ruff check` clean on all modified Python files.
- ✅ `eslint` clean on both modified JS files.
- ✅ `pytest tests/test_whatsapp_*.py` — **65/65 passing** including 15 new state-machine tests.
- ✅ Backend `/api/health` green after each restart.
- ✅ Remote MongoDB indexes verified via read-only `list_indexes()` probe.
- ✅ Webhook integration probes (empty body, unknown logid, unknown status) returned correct responses and produced `whatsapp_callback_logs` entries with correct verdicts.
- ✅ Authenticated curl probes against `/message-stats` and `/message-logs` showed `include_test` filter working: total = 2 default vs total = 4 with `include_test=true` (confirming 2 test rows exist and are correctly excluded).
- ✅ Playwright screenshot of `/message-status` confirmed all new UI elements render (filter-search, filter-include-test, filter-date-from, filter-date-to). Stats + table render correctly.

---

## 12. Outstanding risk acknowledged

| Risk | Mitigation in place |
|---|---|
| AuthKey changes payload shape after we lock parser | `whatsapp_callback_logs` captures raw body verbatim — we can re-parse offline if needed |
| Production CRM at `crm.mygenie.online` has older code path | Owner pushes this branch; new sends and new webhook handler both deploy atomically |
| Unique partial index on idempotency_key blocks an intended retry | Resend endpoint uses `update_one` not `insert_one`; idempotency only applies to *initial* fires |
| Legacy rows still have `message_id: null` and never flip to Delivered | Owner declined backfill; these rows are read-only museum pieces and will age out |
| Cron rerun on same day after manual fix is blocked | Intentional; manual reset requires deleting/updating that row's `idempotency_key` — acceptable trade-off |
| Webhook unauthenticated | Audit-first design + state machine + limited blast radius; IP allowlist available as Commit 8 hardening if owner requests |

---

## 13. Status snapshot for next session

- **Phase 1 (send-side row schema)**: ✅ Complete (in code); ⏳ NOT YET LIVE-TESTED (prod still on old code, writes `message_id=null`)
- **Phase 2 (schema unification)**: ✅ Complete
- **Phase 3 (webhook hardening)**: ✅ Complete on preview + **2026-05-28 hotfix for form-urlencoded wire format** + real-traffic verified against 5 live AuthKey callbacks
- **Phase 5 (frontend polish)**: ✅ Complete
- **Phase 6 (backfill)**: ⏭️ Skipped per owner decision
- **Phase 4 + Commit 8 (closeouts)**: ⏳ Owner ops — Option A (route POS to preview for one synthetic E2E order) OR Option B (push to prod)

---

## 14. Park status — 2026-05-28 evening

**Current status code**: `cr_004_p3_5_parked_awaiting_option_a_send_side_live_test`

**What's been live-verified**:
- ✅ AuthKey webhook URL registration (egress IP `157.245.105.3`)
- ✅ Webhook reachability + form-urlencoded parsing (after hotfix)
- ✅ logid extraction, status mapping, IST→UTC time parse, meta_messageid + wamid capture, body_values echo capture
- ✅ Audit log persistence in `whatsapp_callback_logs`

**What's NOT yet live-verified**:
- ❌ Send-side row written with `message_id=logid` (blocked — prod still on old code)
- ❌ End-to-end `pending → delivered → read` transition on a real row
- ❌ Dashboard reflecting `delivered_at` + `read_at` + `status_history` for a real send

**Post-Commit-7 hotfix applied**: `routers/whatsapp.py` parser now handles `application/x-www-form-urlencoded` (real AuthKey wire format) in addition to JSON. See partial QA report: `../qa/CR_004_PHASE_3_5_PARTIAL_LIVE_TEST_REPORT_2026_05_28.md`.

**Resume playbook (Option A — recommended)**:
1. Owner routes POS terminal to preview's `/api/pos/orders` for one test, OR agent (with explicit owner approval) fires synthetic POST to preview's `/api/pos/orders` using POS API key
2. Watch all 5 trace stages — preview should now write the row WITH logid and link callbacks automatically
3. Confirm dashboard shows `status: read`, `delivered_at`, `read_at`, full `status_history`
4. Write closure doc `../qa/CR_004_PHASE_3_5_LIVE_TEST_REPORT.md`
5. Move CR status: `parked` → `closed_live_test_passed`

When you're back: pick Option A or B, then one test send → full validation → close CR.
