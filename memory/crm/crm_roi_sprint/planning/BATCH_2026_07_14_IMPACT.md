# BATCH 2026-07-14 — IMPACT ANALYSIS
## Items: BUG-013 · BUG-014 · CR-063 · CR-065 (CR-064 PARKED — excluded)

**Role:** PLANNING (zero code changes)
**Registration verified:** all 4 in `BUG_REGISTRY_CAMPAIGNS.md` / `CR_STATUS_DASHBOARD.md` (2026-07-14 intake)
**Owner locks already in force:** D1, D2, D6 (`DECISIONS_LOG.md § 2026-07-14`)
**Root causes:** pre-confirmed by INV-007 (same day) — no re-investigation needed.

---

## 1. BUG-013 — Import proxy timeout (bulk_write refactor)

### Code reality: FULL (root cause confirmed)
`routers/customers.py::import_customers` (L1386-1490): per-row `await update_one` / `await insert_one` inside the loop. Remote Mongo RTT ≈ 242 ms → 345 rows ≈ 83-167 s > ~100 s proxy limit.

### Data flow
FE `handleConfirmImport` (CustomersPage ~L452) → `POST /api/customers/import` (multipart) → `_parse_import_file` → per-row `_validate_and_classify_row` → per-row DB write → tag catalog `$addToSet` → `import_logs` insert → JSON summary → FE step 3.

### Proposed change shape
- Build `ops = [UpdateOne(filter, {"$set": payload}), InsertOne(doc), ...]` in the loop; execute ONE `await db.customers.bulk_write(ops, ordered=False)` after the loop. Requires `from pymongo import UpdateOne, InsertOne` (pymongo already a Motor dependency — no new package).
- Counters (`imported/updated/failed`) derived from classification (same as today — today's counters also assume write success).
- Everything else (validation, tag merge, catalog update, import_logs, response shape) unchanged → FE contract identical.

### ⚠ Latent bug surfaced (needs owner decision Q-A)
Current loop never adds newly-inserted phones to `phone_to_doc` → **two NEW rows with the same phone in one file create two duplicate customers** (violates the `(user_id, phone)` uniqueness rule, addendum §6.6). The refactor must decide behaviour explicitly (see Q-A).

### Risk: MEDIUM
Not a §14 hotspot file, but writes customer data. `bulk_write(ordered=False)` semantics equal per-row semantics for independent rows.

### Downstream consumers
None change: import_logs shape same, customers docs same fields.

---

## 2. BUG-014 — Import honours "WhatsApp Opt-in" column (D1/D2 locked)

### Code reality: FULL
- `_validate_and_classify_row` (L89-123) consumes only 7 keys; opt-in discarded.
- New-customer doc hardcodes `whatsapp_opt_in: False` (L1456).
- Existing-customer path already satisfies D1's "blank = leave unchanged for ANY field": `update_payload` filter drops `None`/`""` (L1439) — verified, no change needed for other fields.
- Header normalization: export emits `WhatsApp Opt-in` → parser lowercases to `whatsapp opt-in`; template style would be `whatsapp_opt_in`.

### Proposed change shape (per D1/D2)
- In `_validate_and_classify_row`: read opt-in cell (header variants per Q-B), parse case-insensitively: `yes/true/1 → True`, `no/false/0 → False`, blank/unrecognized → `None` (= unchanged).
- Update path: include `whatsapp_opt_in` in payload ONLY when parsed value is not `None`. **Exception to the generic blank-filter**: `False` must survive the `v != ""` filter — it does (False is not "" / not None) — verified.
- Insert path: `whatsapp_opt_in = parsed if parsed is not None else True` (D2).
- Also set `whatsapp_opt_in_date` when value flips? — NOT in scope unless owner asks (schema field exists but list-edit toggle doesn't set it either; consistency preserved by omitting).

### Risk: HIGH (campaign-gating field)
Wrong parsing could mass-opt-out. Mitigation: strict whitelist parsing (only exact tokens), `None` on anything else; pytest matrix covers all tokens + blank + junk.

### Interaction with BUG-013
Same function/loop — MUST be implemented in the same batch/commit to avoid double-touching a just-refactored loop.

---

## 3. CR-063 — Opt-in toggle on Customer Detail edit modal

### Code reality: FULL
- `CustomerDetailPage.jsx`: `openEditModal` (L201-219) lacks `whatsapp_opt_in`; edit modal JSX (L962-1010+) has Name → Phone → …; `Switch` NOT imported (imports at L6-15).
- `handleUpdateCustomer` cleanData filter passes `false` (verified: `false !== ""`), backend PUT persists both values (live-verified in INV-007 §1).

### Proposed change shape
- Add `Switch` import; add `whatsapp_opt_in: customer.whatsapp_opt_in !== false` to `openEditModal`; insert the same toggle block used in CustomersPage (L2457-2467) after the Phone block (~L1010), with `data-testid="detail-edit-whatsapp-opt-in"`.
- Mirrors the proven CustomersPage pattern 1:1.

### Risk: LOW (FE-only, one page)
Regression check: detail-page save must not clobber other fields (cleanData filter unchanged).

---

## 4. CR-065 — Resend time on Message Status rows (D6=a locked)

### Code reality: FULL
- Backend already returns `last_resend_at` + `resend_count` — `GET /whatsapp/message-logs` uses full-doc projection `{"_id": 0}` (whatsapp.py L1605-1607). **Zero backend change needed.**
- Desktop time cell: `MessageStatusPage.jsx` L719-721; mobile card time: L874.

### Proposed change shape (D6=a)
- Both spots: if `log.resend_count > 0` → render `Resent {formatRelativeTime(log.last_resend_at)}` + badge `×{resend_count}` (amber, `data-testid="resent-badge-{id}"`); else current `created_at` rendering. Original time remains in expanded status-history (already rendered L779).

### Risk: LOW (FE-only)
Same file as freshly-shipped BUG-012 fix (lazy filter init) — edits are in render cells, no overlap; regression check filter behaviour anyway.

---

## Conflict matrix

| Item | Files touched | Conflicts with open items? |
|---|---|---|
| BUG-013 + BUG-014 | `routers/customers.py` (import section only) | CR-060 (import modal FE, shipped 07-12) — backend response shape unchanged → NO conflict. CR-035 shipped. |
| CR-063 | `CustomerDetailPage.jsx` | none open on this file |
| CR-065 | `MessageStatusPage.jsx` | BUG-012 fix shipped on same file — different regions, regression test required |

## Files WILL change (4 total)
1. `/app/backend/routers/customers.py` — import section only (BUG-013 + BUG-014)
2. `/app/frontend/src/pages/CustomerDetailPage.jsx` (CR-063)
3. `/app/frontend/src/pages/MessageStatusPage.jsx` (CR-065)
4. `/app/backend/tests/test_bug013_014_import.py` (NEW — pytest suite)
(+ conditional: sample-import-template block in customers.py if Q-C = yes; ImportPreviewRow schema + FE preview column if Q-D = yes)

## Files WILL NOT touch
`core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `core/whatsapp.py` · `routers/whatsapp.py` (CR-065 needs no backend) · `models/schemas.py` (unless Q-D=yes) · `CustomersPage.jsx` (list edit modal untouched) · campaign/send logic · `.env`

## Owner decisions (locked 2026-07-14 except Q-C — see DECISIONS_LOG § QA-QF)
| # | Question | Outcome |
|---|---|---|
| Q-A | In-file duplicate phones | ✅ (c) REJECT file — HTTP 400 listing duplicate rows (preview + commit parity) |
| Q-B | Accepted opt-in header names | ✅ (a) both `WhatsApp Opt-in` and `whatsapp_opt_in` |
| Q-C | Add opt-in column to sample import template? | ✅ (a) YES — 8th column `whatsapp_opt_in` + sample values (locked 2026-07-14; owner's "already has all columns" premise corrected — template had 7 cols) |
| Q-D | Opt-in column in import preview table? | ✅ (b) NO — apply silently |
| Q-E | CR-063 scope | ✅ (b) toggle in edit modal AND status badge on Detail page |
| Q-F | Resend columns in report download? | ✅ (a) YES — add "Resend Count" + "Last Resend At" |
| GATE | Implementation | ⛔ WITHHELD — owner: "no execution till I approve all decisions" |

## Verification matrix (V1-V12, executed at QA — includes testing_agent run; NO live WhatsApp sends; synthetic data on test tenant, cleaned after)
| V | Item | Check |
|---|---|---|
| V1 | BUG-013 | 350-row synthetic import completes < 10 s, HTTP 200 reaches client |
| V2 | BUG-013 | counters (new/updated/failed) match file composition; import_logs row written |
| V3 | BUG-013 | re-import same file → idempotent (updates, no duplicates) |
| V4 | BUG-013/Q-A | in-file duplicate phone behaves per Q-A lock |
| V5 | BUG-014 | existing customer + "No" → opt_in False; + "Yes" → True; blank → unchanged |
| V6 | BUG-014 | new customer, no column/blank → opt_in True (D2); explicit "No" → False |
| V7 | BUG-014 | junk value ("maybe") → unchanged + no crash |
| V8 | BUG-014 | opted-out customer still excluded from campaign audience (regression, no send) |
| V9 | CR-063 | detail edit shows toggle w/ current value; off→save→reload persists; other fields intact |
| V10 | CR-065 | resent row (resend_count>0, synthetic) shows "Resent <time>" + ×N on desktop + mobile |
| V11 | CR-065 | non-resent rows unchanged; BUG-012 deep-link filter still works (regression) |
| V12 | ALL | export/preview endpoints regression: /export, /import-preview shape unchanged |

## Recommended execution order
BUG-013 + BUG-014 (single combined edit set, same function) → CR-063 → CR-065.

```text
Planning complete: BUG-013, BUG-014, CR-063, CR-065
Stage: Impact Analysis (impl plan in BATCH_2026_07_14_IMPL_PLAN.md — edits conditional on Q-A…Q-F)
Code reality: FULL (all 4 root causes confirmed by INV-007)
Risk: BUG-013 MEDIUM · BUG-014 HIGH · CR-063 LOW · CR-065 LOW
Owner decisions: Q-A … Q-F pending
Next: owner answers → lock impl plan → Implementation gate approval
```
