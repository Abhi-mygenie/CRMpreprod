# CR-019 — `send_bill` Event-Key Mismatch — Implementation Plan

**CR**: CR-019 (quick-fix)
**Status**: `plan_drafted_awaiting_signoff`
**Author**: E1
**Date opened**: 2026-06-05
**Discovery**: `../discovery/CR_019_SEND_BILL_EVENT_KEY_MISMATCH_DISCOVERY.md`
**Branch target**: current working branch (`main`)
**Environment**: implement in preview pod (`/app`); owner promotes to production
**External DB**: `52.66.232.149:27017/mygenie` — **migration writes here exactly once** (after dry-run review)

---

## 1. Goal (one sentence)

Make `send_bill` the single canonical event key — UI, backend, DB — so every POS order fires exactly one `send_bill` WhatsApp for every tenant, including the 3 currently-broken ones, with no configuration drift left behind.

---

## 2. Locked decisions

| # | Decision | Value | Source |
|---|---|---|---|
| D1 | Canonical event key | `send_bill` | Discovery §8 |
| D2 | Event category | POS (`POS_EVENTS`) — POS is the trigger | Discovery §5 |
| D3 | Delete legacy rows after migration | **Yes**, but in a separate second pass after first POS order verified on a fixed tenant | Q1 default — needs owner ✔ |
| D4 | Backward compat for old POS clients calling `/pos/events` with `send_bill_manual`/`auto` | **Silent rewrite** to `send_bill` for 1 release + `logger.warning("DEPRECATED ...")` | Q2 default — needs owner ✔ |
| D5 | Migration dry-run first | **Mandatory** — print plan, owner reviews, then re-run with `--commit` | Q3 default — needs owner ✔ |
| D6 | Loud-log silent-skip | **Yes**, in this CR — single-line change | Discovery §8 §6 |

Owner: please confirm D3/D4/D5 (or override). Defaults assumed unless overridden.

---

## 3. Exact file changes

> All line numbers from `main` HEAD `18e879d` (2026-05-29). Verified 2026-06-05.

### 3.1 `backend/models/schemas.py`

**File-level role**: defines `POS_EVENTS`, `CRM_EVENTS`, `AUTOMATION_EVENTS`.

| Action | Line(s) | Change |
|---|---|---|
| Delete | **1181** | `    "send_bill_manual",        # Send Bill - Manual` |
| Delete | **1182** | `    "send_bill_auto",          # Send Bill - Auto` |
| Insert | **after line 1182** (now line 1181 after deletes) | `    "send_bill",               # Bill sent to customer (every POS order)` |
| Delete | **1194** | `    "send_bill",               # Bill sent to customer (every order)` |

Net diff: 1 line moves from CRM_EVENTS → POS_EVENTS; the two duplicates are removed. `AUTOMATION_EVENTS = POS_EVENTS + CRM_EVENTS` (line 1206) needs no edit.

### 3.2 `backend/routers/pos.py`

**File-level role**: POS order webhook + POS events webhook.

| Action | Line(s) | Change |
|---|---|---|
| **Modify** (`/pos/events` collapse) | **2106-2107** (docstring) | Replace bullets `- send_bill_manual` and `- send_bill_auto` with single bullet `- send_bill: Send bill to customer after order` |
| **Modify** (`/pos/events` collapse) | **2130-2134** | Replace the 3-line block with **D4 backward-compat** wrapper:<br>`internal_event = event_data.event_type`<br>`if event_data.event_type in ("send_bill_manual", "send_bill_auto"):`<br>`    logger.warning(f"DEPRECATED event_type={event_data.event_type!r}; rewriting to 'send_bill'. Update POS client.")`<br>`    internal_event = "send_bill"` |
| **No change** | 1511 | Already fires `"send_bill"` (this is correct — the line was never broken on its own). Keep verbatim. |
| **No change** | 1516 | idempotency_key already `{order_id}_send_bill` (matches D1). |

No other call-sites touched.

### 3.3 `backend/core/whatsapp.py`

**File-level role**: trigger orchestration + send + log.

| Action | Line(s) | Change |
|---|---|---|
| **Modify** (loud-log skip, D6) | **725** | `logger.debug(f"No AuthKey API key for user {user_id}, skipping WhatsApp trigger")` → `logger.info(...)` |
| **Modify** (loud-log skip, D6) | **738** | `logger.debug(f"No template configured for event {event_type}, skipping")` → `logger.info(...)` |
| **Modify** (loud-log skip, D6) | **742** | `logger.debug(f"Event {event_type} is disabled, skipping")` → `logger.info(...)` |

Three single-token edits (`debug` → `info`). No behavioural change beyond log verbosity.

### 3.4 `backend/routers/whatsapp.py`

**File-level role**: `/api/whatsapp/automation/events` description endpoint (line 49-98).

| Action | Line(s) | Change |
|---|---|---|
| Delete from `pos_event_descriptions` | **65** | `"send_bill_manual": "Manually send bill/receipt to customer",` |
| Delete from `pos_event_descriptions` | **66** | `"send_bill_auto": "Automatically send bill after order completion",` |
| Insert into `pos_event_descriptions` (replace lines 65-66 block) | after line 64 | `"send_bill": "Send bill/receipt to customer after every POS order",` |
| Delete from `crm_event_descriptions` | **77** | `"send_bill": "Send bill/receipt to customer after order",` |

After edit: `send_bill` appears exactly once, in `pos_event_descriptions`. The endpoint already merges both for backward compatibility (line 89), so no consumer breaks.

### 3.5 `frontend/src/components/shared/WhatsAppAutomationContent.jsx`

**File-level role**: Renders the event-mapping list with 2-tab POS/CRM split. Uses local hardcoded dicts (verified at lines 799-801).

| Action | Line(s) | Change |
|---|---|---|
| Delete from `posEventLabels` | **338** | `"send_bill_manual": "Send Bill (Manual)",` |
| Delete from `posEventLabels` | **339** | `"send_bill_auto": "Send Bill (Auto)",` |
| Insert into `posEventLabels` (replace 338-339 block) | new line | `"send_bill": "Send Bill",` |
| Delete from `crmEventLabels` | **351** | `"send_bill": "Send Bill",` |
| Delete from `posEventDescriptions` | **379** | `"send_bill_manual": "Manually send bill/receipt to customer",` |
| Delete from `posEventDescriptions` | **380** | `"send_bill_auto": "Automatically send bill after order completion",` |
| Insert into `posEventDescriptions` | new line in same block | `"send_bill": "Send bill/receipt to customer after every POS order",` |
| Delete from `crmEventDescriptions` | **392** | `"send_bill": "Send bill/receipt after a new order",` |

No other JSX or render-logic edit needed — lines 799-801 enumerate via `Object.keys(posEventLabels)` so the moved key flows through automatically.

### 3.6 New file — migration script (one-off, idempotent)

**Path**: `/app/scripts/cr019_migrate_send_bill_event_key.py` (new file; outside `backend/` because it's an admin one-shot).

Behavior:
1. Connect to remote Mongo using `MONGO_URL` from `backend/.env`.
2. Find every `user_id` that has at least one row with `event_key ∈ {"send_bill_manual","send_bill_auto"}` AND zero rows with `event_key="send_bill"`.
3. For each such user: pick the **source row** — preference order: (a) most-recently-updated `is_enabled=true` row in `{auto, manual}`; tiebreak (b) most-recently-updated row regardless of enabled.
4. `upsert` `whatsapp_event_template_map` with `{user_id, event_key:"send_bill", template_id:<str of source>, template_name, is_enabled:true, created_at:now, updated_at:now}`.
5. Verify the upserted row reads back correctly.
6. **Only if `--commit-delete-legacy`**: delete the source's `send_bill_manual` + `send_bill_auto` rows for that user.
7. Print a per-tenant table: before/after, counts, action taken.

CLI surface:
```
python3 scripts/cr019_migrate_send_bill_event_key.py --dry-run        # default
python3 scripts/cr019_migrate_send_bill_event_key.py --commit         # creates send_bill rows; leaves legacy
python3 scripts/cr019_migrate_send_bill_event_key.py --commit \
                                  --commit-delete-legacy              # second pass; deletes legacy
```

Outputs go to stdout AND `/app/test_reports/cr019_migration_<ISO_TS>.log`.

Idempotency: re-running `--commit` is a no-op on already-migrated tenants because the source-row finder excludes them.

---

## 4. Order of operations (rollout plan)

| Step | Action | Where | Reversible? |
|---|---|---|---|
| S1 | Land code changes §3.1–§3.5 in one commit | preview pod `/app` | yes (`git revert`) |
| S2 | `sudo supervisorctl restart backend frontend` | preview pod | yes |
| S3 | Smoke-check `/api/whatsapp/automation/events` returns `send_bill` in `pos_descriptions`, not in `crm_descriptions`, and no `send_bill_manual`/`send_bill_auto` keys | curl from preview pod | n/a |
| S4 | Open the WhatsApp Automation page in browser → POS tab shows ONE "Send Bill" card; CRM tab shows none | preview pod URL | n/a |
| S5 | Run migration in **dry-run** mode | shell | yes (no writes) |
| S6 | Owner reviews dry-run output | — | — |
| S7 | Run migration with `--commit` (creates `send_bill` rows; legacy rows still present, dormant) | shell | reversible — delete the new rows |
| S8 | Verify in Mygenie Dev: place a single test POS order → row appears in `whatsapp_message_logs` with `event_type="send_bill"`, customer receives the WhatsApp | shell + WhatsApp on test phone | n/a |
| S9 | Owner promotes commit + migration to **production** (per project's standard promote process) | prod | reversible — revert + delete new rows |
| S10 | (After 1 release / 1 week soak) Run migration with `--commit-delete-legacy` to clean up dormant rows | shell | reversible — restore from Mongo backup |

---

## 5. Acceptance criteria

| # | Check | How |
|---|---|---|
| AC-1 | `models/schemas.py:POS_EVENTS` contains `send_bill`; does NOT contain `send_bill_manual` or `send_bill_auto` | `grep "send_bill" backend/models/schemas.py` |
| AC-2 | `models/schemas.py:CRM_EVENTS` does NOT contain `send_bill` | same grep |
| AC-3 | `GET /api/whatsapp/automation/events` returns `send_bill` in `pos_descriptions`, not in `crm_descriptions`; `send_bill_manual`/`send_bill_auto` absent | curl |
| AC-4 | Frontend POS tab shows exactly 1 "Send Bill" card; CRM tab shows 0 | manual UI inspection on preview pod |
| AC-5 | `POST /api/pos/events` with `event_type="send_bill_manual"` still works → fires `send_bill` event AND emits a deprecation warning log line | curl `/pos/events`, tail backend logs |
| AC-6 | Affected tenants (Mygenie Dev / Mayur's Kitchen / Jeh's Nest) all have `send_bill` row in `whatsapp_event_template_map` post-migration | mongo query |
| AC-7 | Place one POS order on Mygenie Dev → new row in `whatsapp_message_logs` with `event_type="send_bill"`, `status` ∈ {pending, delivered, read} | DB query + customer WhatsApp |
| AC-8 | Kunafa Mahal `send_bill` flow still works (regression check — they should be unchanged) | place test order on Kunafa OR verify existing message_logs continue accumulating |
| AC-9 | `logger.info` line emitted on a skip scenario when a tenant has no `send_bill` config (test by removing the row temporarily on a sandbox user) | tail backend logs |

---

## 6. Test plan

### 6.1 Static / unit
- `ruff check backend/` clean for the touched files.
- Frontend lint clean (`mcp_lint_javascript`).
- `grep -rn "send_bill_manual\|send_bill_auto" /app/backend /app/frontend` returns **only**: (a) the deprecation rewrite in `routers/pos.py`, (b) the migration script. Anywhere else is a miss.

### 6.2 Integration (manual, scripted via curl)
- `curl /api/pos/orders` synthetic POST with Mygenie Dev's `X-API-Key` and a test customer phone → assert response `success=true`, assert new `whatsapp_message_logs` row with `event_type="send_bill"` appears within 5 seconds, assert `customer_phone` matches.
- `curl /api/pos/events` with `event_type="send_bill_manual"` (legacy POS simulation) → assert response `success=true`, assert backend log contains `DEPRECATED event_type='send_bill_manual'`.
- `curl /api/pos/events` with `event_type="send_bill"` (new POS) → assert response `success=true`, assert new message_logs row.

### 6.3 Regression (read-only)
- Existing Kunafa `send_bill` message_logs continue to be written after the change (verify by counting before/after a short window).
- `/api/whatsapp/message-logs?event_type=send_bill` continues to return correct rows.

---

## 7. Out of scope (explicit non-goals)

| # | Item | Why deferred |
|---|---|---|
| OOS-1 | Separate templates for auto vs. manual bill | Would be Option 3 from suggestion; a future product feature, not a bug |
| OOS-2 | AuthKey delivery-webhook pod-URL pointing issue (cause of `status=pending` forever) | Different problem; needs owner coordination with AuthKey console |
| OOS-3 | Onboarding seed for newly-created tenants (so they start with a sensible default `send_bill` row) | Worth doing, but separate CR |
| OOS-4 | Dynamic event registry (CR-016) | Already parked to next sprint |
| OOS-5 | Backfill the 2,388 missed bills | Bills don't make sense retroactively (orders are stale, customer may not care). Owner declined backfill in CR-004 P3.5 — same principle applies. |

---

## 8. Risk table (final)

| Risk | Severity | Mitigation |
|---|---|---|
| Migration mis-targets a working tenant | High | Selector excludes any user that already has `send_bill` row; dry-run mandatory |
| New code shipped before migration → broken tenants stay broken (no regression, but no fix either) | Low | S1 → S7 ordered; restart between |
| Old POS still posts `send_bill_auto` → silent rewrite logs spam INFO/WARN | Negligible | Expected rate: <1/hr per tenant. Acceptable. |
| Loud-log creates noise in normal operation | None | Only on the silent-skip code path, which should never fire for healthy tenants |
| Mongo `template_id` type drift (int vs str) breaks variable_map lookup | Already mitigated | CR-015 T1 fallback (`core/whatsapp.py:538-543`) handles both; migration writes str |

**Rollback recipe**: 
1. `git revert <commit>` 
2. `sudo supervisorctl restart backend frontend`
3. (Only if migration ran) drop the newly-inserted `send_bill` rows for the 3 affected tenants — preserves the still-present `send_bill_manual`/`send_bill_auto` rows. Tenants return to pre-fix broken state, no data loss.

---

## 9. Implementation checklist (what the implementing agent does, in order)

```
☐ 1. Verify clean working tree on /app (no uncommitted dev work).
☐ 2. Edit backend/models/schemas.py per §3.1.
☐ 3. Edit backend/routers/pos.py per §3.2 (docstring + collapse block).
☐ 4. Edit backend/core/whatsapp.py per §3.3 (3 log-level changes).
☐ 5. Edit backend/routers/whatsapp.py per §3.4.
☐ 6. Edit frontend/src/components/shared/WhatsAppAutomationContent.jsx per §3.5.
☐ 7. Create /app/scripts/cr019_migrate_send_bill_event_key.py per §3.6.
☐ 8. Lint: ruff backend/, eslint frontend/.
☐ 9. sudo supervisorctl restart backend frontend.
☐ 10. AC-1 / AC-2 grep checks.
☐ 11. AC-3 curl check.
☐ 12. AC-4 manual UI check (browser screenshot).
☐ 13. AC-5 curl check + log tail.
☐ 14. Run migration --dry-run, save output, surface to owner.
☐ 15. (After owner ✔) run migration --commit.
☐ 16. AC-6 mongo verify.
☐ 17. AC-7 test order on Mygenie Dev, watch DB + WhatsApp.
☐ 18. AC-8 Kunafa regression check.
☐ 19. AC-9 loud-log verify (optional sandbox).
☐ 20. Write closeout doc at ../implementation/CR_019_SEND_BILL_EVENT_KEY_MISMATCH_CLOSEOUT.md.
☐ 21. Update CR_STATUS_DASHBOARD.md row + transitions.
☐ 22. Update ROI_MEASUREMENT_CR_REGISTER.md (add CR-019 row).
☐ 23. (Wait ≥1 release) run migration --commit-delete-legacy.
```

---

## 10. Resume signal

Status: `plan_drafted_awaiting_signoff`. Next agent reads this doc, confirms D3/D4/D5 with owner (or accepts defaults), then walks §9 in order. No code touched yet.
