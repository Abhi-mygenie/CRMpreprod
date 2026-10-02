# CR-039 — Implementation Plan: Webhook Row Disambiguation

> **CR**: CR-039
> **Priority**: **P1 CRITICAL** — silent data corruption in every multi-recipient campaign
> **Type**: Bug fix (defensive, backward-compatible)
> **Owner approval status**: ⏳ Awaits Q1-Q4 from discovery doc
> **Effort**: ~1 hour (~20 LOC in 1 file, plus 15 min live-test)
> **Files touched**: `backend/routers/whatsapp.py` only
> **Migration required**: No
> **Schema changes**: No
> **Discovery**: `discovery/CR_039_WEBHOOK_ROW_DISAMBIGUATION_DISCOVERY.md`
> **Source investigation**: `investigations/INV-2026-07-03-04_CAMPAIGN_DUPLICATE_LOGID.md`

---

## 1. Objective

Make the WhatsApp status-callback webhook handler robust against duplicate `LogID`
values returned by AuthKey. Guarantee that every webhook updates the **correct**
`whatsapp_message_logs` row (matched by recipient mobile as well as logid). Never
corrupt a row by applying a status intended for a different recipient.

## 2. Scope

- ✅ In-scope: two code blocks in `backend/routers/whatsapp.py::message_status_callback`
- ❌ Out-of-scope: send-side code (`core/whatsapp.py`), state machine
  (`core/whatsapp_status.py`), audit-log schema, historic-data backfill, dashboard UI
- ❌ Out-of-scope: AuthKey-side fix for duplicate LogIDs (route to CR-040)

## 3. Design

### 3.1 Composite Row Lookup

**Current** (`routers/whatsapp.py:1399`):
```python
row = await db.whatsapp_message_logs.find_one({"message_id": logid}, {"_id": 0})
```

**New**:
```python
# CR-039: Try composite (message_id, customer_phone) first to disambiguate
# duplicate LogIDs. Falls back to message_id-only for legacy rows.
webhook_mobile = str(payload.get("mobile") or "")
row = None

if webhook_mobile and len(webhook_mobile) >= 10:
    # AuthKey sends mobile with country code prefix (e.g., 919035133228).
    # CRM stores customer_phone as last 10 digits (e.g., 9035133228).
    mobile_last_10 = webhook_mobile[-10:]
    row = await db.whatsapp_message_logs.find_one(
        {"message_id": logid, "customer_phone": mobile_last_10},
        {"_id": 0}
    )

# Fallback: message_id-only lookup (legacy rows / payloads without mobile)
if not row:
    row = await db.whatsapp_message_logs.find_one({"message_id": logid}, {"_id": 0})

if not row:
    return await _persist_callback_and_return(
        "no_matching_row",
        f"logid={logid}",
        {"success": True, "logid": logid, "updated": False},
    )
```

### 3.2 Ambiguous-Row Handling

**Current** (`routers/whatsapp.py:1426-1430`):
```python
if mobile_mismatch:
    set_fields["mobile_mismatch"] = True
    logger.warning(
        f"webhook mobile mismatch: payload={webhook_mobile!r} row={expected_mobile!r} logid={logid}"
    )
```

**New**:
```python
if mobile_mismatch:
    # CR-039: Composite lookup already attempted above. A persistent mismatch
    # means we CANNOT reliably identify the correct row. Refuse to update
    # rather than corrupt data on the wrong row.
    logger.warning(
        f"CR-039 webhook mobile mismatch after composite lookup: "
        f"payload={webhook_mobile!r} row={expected_mobile!r} logid={logid}"
    )
    return await _persist_callback_and_return(
        "ambiguous_row",
        f"mobile_mismatch payload={webhook_mobile} row={expected_mobile}",
        {"success": True, "logid": logid, "updated": False},
    )
```

Note: the `webhook_mobile` variable is now assigned earlier in section 3.1, so the
existing assignment at line 1411 (`webhook_mobile = str(payload.get("mobile") or "")`)
becomes redundant and should be removed to avoid double-assignment.

### 3.3 New Verdict Value

`whatsapp_callback_logs.verdict` gains one new value:

| Verdict | Meaning | Existing / New |
|---|---|---|
| `applied` | Status updated on the correct row | existing |
| `no_matching_row` | No row found by either composite or fallback lookup | existing |
| `transition_ignored` | State machine rejected the transition | existing |
| `unknown_status` | Payload status not in map | existing |
| `db_update_failed` | Mongo write failed | existing |
| `rejected_no_logid` | Payload had no logid | existing |
| **`ambiguous_row`** | **Composite lookup found no phone-match, fallback found a row with mismatching mobile — refused to update** | **NEW** |

No schema change needed — `verdict` is a free-form string.

---

## 4. Files Changed

| File | Lines | Nature |
|---|---|---|
| `backend/routers/whatsapp.py` | ~20 lines added/modified in one function (`message_status_callback`) | Bug fix |

No other files, no tests removed. New unit test added (see §6).

---

## 5. Non-Regression Guarantees

| Scenario | Before fix | After fix | Verdict |
|---|---|---|---|
| Single-recipient send with unique logid | ✅ Works | ✅ Works (composite matches directly) | No regression |
| Multi-recipient send with unique logids | ✅ Works | ✅ Works (composite matches directly) | No regression |
| Multi-recipient send with DUPLICATE logids (today's bug) | ❌ Rows 2..N stay pending | ✅ All N update correctly | **BUG FIXED** |
| Legacy row with no matching customer_phone (composite miss) | ✅ Works (find_one returns first) | ✅ Works (fallback returns first, verdict `applied` if mobile matches, else `ambiguous_row`) | No functional regression on legit rows |
| Webhook payload missing `mobile` field | ✅ Works | ✅ Works (fallback path) | No regression |
| Webhook for unknown logid | verdict `no_matching_row` | verdict `no_matching_row` | No regression |
| Duplicate webhook (AuthKey retry) | Idempotent via state machine | Idempotent via state machine | No regression |

---

## 6. Test Plan

### 6.1 Unit / static
- Lint `backend/routers/whatsapp.py` after edit — must pass with no new errors
- Confirm both `webhook_mobile` assignments deduplicated (single source of truth at the top of the composite-lookup block)

### 6.2 Live tests (with owner)

**Test A — 3-recipient campaign, DUPLICATE LogIDs expected**
- Fire a fresh campaign from Jeh's Nest to the same 3 phones (7505242126, 9035133228, 9811657657)
- Within 3 minutes, poll `whatsapp_message_logs` — all 3 rows must have `status=delivered` (or `rejected`, matching what AuthKey actually reports)
- Poll `whatsapp_callback_logs` — 3 entries with verdict `applied`, zero `ambiguous_row`
- Confirm no row has `mobile_mismatch=True`

**Test B — Automation single-send, UNIQUE LogID**
- Fire an automation trigger (event) for one customer
- Row updates correctly on webhook (regression test — must still work as before)

**Test C — Multi-recipient send with intentional mobile-swap in one webhook (synthetic)**
- Manually POST a callback to `/api/whatsapp/status-callback` with a `logid` known
  in the DB but a mobile that doesn't match any row for that logid
- Expect verdict `ambiguous_row` in `whatsapp_callback_logs`, no `whatsapp_message_logs` mutation
- Use curl:
```bash
curl -X POST '<BE>/api/whatsapp/status-callback' \
  -H 'Content-Type: application/json' \
  -d '{"logid":"<known-shared-logid>","mobile":"911234567890","status":"delivered","time":"2026-07-03 09:00:00"}'
```

**Test D — Regression on empty logid**
```bash
curl -X POST '<BE>/api/whatsapp/status-callback' -H 'Content-Type: application/json' -d '{}'
# Expected: HTTP 200 {"success":false,"error":"logid required"}
```

### 6.3 Post-deploy verification queries

```python
# Verdict distribution after fix
db.whatsapp_callback_logs.aggregate([
    {"$match": {"received_at": {"$gte": "<fix_deploy_time>"}}},
    {"$group": {"_id": "$verdict", "n": {"$sum": 1}}}
])
# Expectation: >99% applied, 0 ambiguous_row unless AuthKey sends payloads with
# unmatched mobile (which would be a NEW anomaly worth investigating).
```

---

## 7. Rollout & Rollback

- **Rollout**: hot-reload via supervisor after saving `routers/whatsapp.py`. Zero downtime.
- **Rollback**: single-file git revert. No data mutation to undo. Callback verdict
  string `ambiguous_row` is only additive — old code that doesn't know about it will
  ignore it as an unrecognised verdict (no downstream consumer breaks).

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Composite lookup misses because of country-code / phone format inconsistency | LOW | Falls back to `message_id`-only — same as today | Use `[-10:]` slicing which is robust to `+91`, `91`, or no-prefix |
| A legitimate CRM row exists with `message_id=logid` but wrong `customer_phone` (data-corruption edge case) | VERY LOW | Verdict `ambiguous_row`, no update. Owner-visible alarm. | Log message + `ambiguous_row` verdict in callback_log |
| `whatsapp_message_logs` index doesn't cover `(message_id, customer_phone)` → slower lookup | LOW | Extra millisecond per webhook | Existing index on `message_id` alone still helps; add compound index later if needed |
| Frontend breaks on `ambiguous_row` verdict string | VERY LOW | Frontend only reads message_logs, not callback_logs verdicts | Confirmed — no frontend consumer of that field |

**Overall risk grade: LOW.**

---

## 9. Success Criteria

- ✅ Test A: All 3 rows of a fresh multi-recipient campaign transition to their true
  final status within 3 minutes of send
- ✅ Test B: Single-recipient sends continue to work exactly as before
- ✅ Test C: `ambiguous_row` verdict is recorded when appropriate, no wrong-row updates
- ✅ Backend logs no longer show `webhook mobile mismatch:` warnings for correctly-routed
  webhooks
- ✅ `whatsapp_callback_logs` verdict distribution over the next 24 hours shows >95%
  `applied` for CRM-owned messages (excluding legitimate `no_matching_row` for other-app
  callbacks)

---

## 10. Timeline

| Step | Owner | Est. duration |
|---|---|---|
| Owner approves Q1-Q4 from discovery doc | Owner | -- |
| Switch to Implementation Agent role | Main agent | -- |
| Apply code changes | Main agent | 10 min |
| Lint + smoke test | Main agent | 5 min |
| Restart backend (auto-reload actually) | Supervisor | 5 s |
| Test A (live 3-recipient campaign) | Owner + Main agent | 5 min send + 5 min observe |
| Test B (live automation send) | Owner + Main agent | 3 min |
| Test C (synthetic curl) | Main agent | 2 min |
| Register CR-040 (AuthKey escalation) | Main agent | 5 min |
| Update `CR_STATUS_DASHBOARD.md` | Main agent | 2 min |
| **Total** | | **~1 hour** |

---

## 11. Open Questions Requiring Owner Answer Before Implementation

Repeat from discovery doc — mandatory to unblock:

- **Q1**: Approve Option A (composite lookup + skip-on-ambiguous)? [YES / NO]
- **Q2**: Include manual backfill of the 2 currently-stuck Jeh's Nest rows in this CR? [YES / NO / SEPARATE-CR]
- **Q3**: Also register CR-040 (AuthKey escalation)? [YES / NO / LATER]
- **Q4**: Confirm `verdict="ambiguous_row"` diagnostic marker for observability? [YES / NO]

---

## 12. Post-Implementation Follow-Ups (Not in this CR)

- **CR-039-F1** — Add compound index `(message_id, customer_phone)` on `whatsapp_message_logs`. Not required for correctness; slight performance improvement at high scale.
- **CR-039-F2** — Webhook health dashboard card (from earlier CR-039 recommendation) — surface verdict distribution to owner in Settings UI.
- **CR-039-F3** — Poll-based reconciler (from earlier CR-039 recommendation) — recover legacy stuck rows via AuthKey `getLogStatus.php` polling.
- **CR-040** — Escalate duplicate LogID behaviour to AuthKey support (owner action, not code).

*(F1/F2/F3 will be split into separate CRs after CR-039 baseline lands, if owner approves.)*

---

*Planning doc — CR-039 v1.0, awaits owner Q1-Q4 approval. Implementation must not begin
until this doc is signed off.*
