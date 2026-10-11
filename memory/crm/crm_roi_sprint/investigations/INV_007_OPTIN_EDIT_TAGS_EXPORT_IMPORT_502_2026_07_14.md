# INV-007 — Owner-Reported Multi-Issue Investigation (2026-07-14)

**Role:** INVESTIGATION (read-only, no code edits)
**Tenant under test:** `owner@jehsnest.com` (Jeh's Nest — 348 customers, 109 tagged, 4 opted-out)
**Steps used:** 10/10
**Scope:** 4 owner-reported issues — (1) opt-in in customer edit, (2) tags missing in Excel export, (3) bulk import Cloudflare 5xx, (4) opt-in not reflected in Excel download / ignored on upload
**Owner confirmations received:** Issue 1 = Detail-page gap confirmed · Issue 2 = resolved via row-ordering explanation · Issue 3 fix = parked (no code edit) · Issue 4 = investigated, decisions pending
**Registration (2026-07-14 INTAKE):** Issue 1 → CR-063 · Issue 3 → BUG-013 · Issue 4B → BUG-014 · Issue 5 → CR-064 · Issue 6 → CR-065 · Issues 2/4A closed NOT-A-BUG. See `discovery/SESSION_2026_07_14_BATCH_INTAKE.md`.

---

## Issue 1 — "WhatsApp Opt-in option in customer edit"

### Evidence
1. **Customers LIST page edit modal** (`CustomersPage.jsx` line 2457-2467, BUG-011): WhatsApp Opt-In toggle EXISTS, is visible (verified via live UI automation — switch rendered, `aria-checked=true`).
2. **Backend persistence** (`routers/customers.py` PUT `/{customer_id}` line 1590): verified live —
   - `PUT {whatsapp_opt_in: false}` → HTTP 200 → re-read returns `False` ✅
   - `PUT {whatsapp_opt_in: true}` → HTTP 200 → re-read returns `True` ✅ (value reverted, no data left dirty)
3. **Customer DETAIL page** (`CustomerDetailPage.jsx`): `openEditModal()` (line 201-219) does **NOT** include `whatsapp_opt_in` in editData; the detail-page edit form has **no opt-in toggle at all**, and the detail page does not even display opt-in status (zero grep hits for `whatsapp_opt_in` in the file).

### Root Cause
- **Classification: FE / PLAN_GAP** — BUG-011 added the toggle only to the Customers-list edit modal. The Customer Detail page edit modal was never given the toggle.
- Confidence: **MEDIUM** (owner's one-line report is ambiguous — needs owner confirmation whether the gap is on the Detail page, or whether list-page toggle misbehaved for a specific customer).

---

## Issue 2 — "Tags not reflecting in exported Excel"

### Evidence (live reproduction on jehsnest tenant)
- `GET /api/customers/export?format=csv` → 200, 348 rows, **109 rows have non-empty Tags column** (e.g., "Dinner, MyGenie").
- `GET /api/customers/export?format=xlsx` → 200, parsed with openpyxl: headers include `Tags` (col 17), **109 tagged rows present** with correct comma-joined values.
- Export code (`routers/customers.py` line 1209-1273) includes Tags in `EXPORT_FIELDS` and joins list → `", ".join(v)`.

### Root Cause — RESOLVED (2026-07-14, owner screenshot analyzed)
- **NOT A BUG.** Owner's Excel screenshot shows the top of the sheet (rows 2-~25) where Tags column Q is empty.
- Parsed the live export for the same tenant: **first tagged row = 241, last = 349** — 0 tagged rows in the first 100. All 109 tagged customers sit at rows 241-349 because the export writes customers in Mongo natural (insertion) order and the tagged customers are the most recently created ones.
- Owner action: scroll to row 241 or filter column Q (non-blank) — tags are present.
- Confidence: **HIGH**.
- Optional UX enhancement (backlog, owner-optional): sort export by `created_at` desc (or match UI "Recent" ordering) so recently-touched customers appear first.

---

## Issue 3 — Customer Bulk Import → Cloudflare "origin returned invalid or incomplete response"

### Evidence
1. **`import_logs` collection** (jehsnest tenant): the SAME file was imported repeatedly —
   - `testcustomer.xlsx` 03:41 → 345 updated, 3 errors
   - `user1.csv` 06:39 → 345 updated
   - `user2.csv` 06:46 **and** 06:48 → 345 updated each (2 min apart = classic retry-after-timeout)
   - Errors logged: "Phone must be 10 digits, got 9", "Missing name", "Invalid phone format: '8888cbe020'" — matches screenshot (3 Errors).
2. **The import COMPLETES server-side every time.** The failure is only the HTTP response never reaching the browser.
3. **Latency measurement**: MongoDB is remote (`52.66.232.149`). Measured round-trip: **~242 ms per query**.
4. **Code** (`routers/customers.py` `POST /import` line 1386-1490): loops over rows and awaits **one `update_one` per row sequentially**. 345 rows × ~242 ms ≈ **83–167 s** → exceeds Cloudflare/ingress ~100 s timeout → 502/520-style error page shown in toast.

### Root Cause
- **Classification: BE / CODE_ERROR (performance) + ENVIRONMENT (remote Mongo latency)** — sequential per-row writes against a ~242 ms-RTT remote MongoDB make any import ≳250 rows exceed the proxy timeout.
- Confidence: **HIGH**.
- **Side-effect risk**: because the import silently succeeds after the error, owner retries cause repeated tag-merges/field overwrites (harmless today because update is upsert-style merge, but wasteful and confusing).

### Recommended Fix (for PLANNING gate — not implemented)
- Replace the per-row loop with a single `bulk_write()` (`UpdateOne`/`InsertOne` ops) → 345 rows in 1-2 round trips (<2 s).
- Optionally cap toast text length / map 5xx to friendly message on FE.

---

## Issue 4 (added 2026-07-14) — "WhatsApp Opt-in not reflecting in Excel download, and not updated on upload"

### Part A — Export side: NOT A BUG (same ordering visibility as Issue 2)
- Live export parsed (jehsnest): WhatsApp Opt-in column contains **344 × "Yes" and 4 × "No"** — exactly matching the DB (4 opted-out customers on this tenant).
- The 4 "No" rows sit at Excel rows **326, 345, 348, 349** (Siddhi Malani ×2, Saurav, MyGenie) — bottom of the sheet, same as the tags. The top rows the owner inspects are genuinely all opted-in, hence all "Yes".
- Confidence: **HIGH**. Export reflects opt-in correctly.

### Part B — Import side: CONFIRMED GAP — opt-in column is silently ignored on upload
- `_parse_import_file` reads all columns (header lowercased → `whatsapp opt-in`), but `_validate_and_classify_row` (`routers/customers.py` lines 89-123) extracts **only**: name, phone, email, dob, city, address, tags. The opt-in value is **discarded**.
- The import write path (lines 1423-1426, 1438) therefore never touches `whatsapp_opt_in` on existing customers — uploads can never update opt-in.
- **Additional finding**: for NEW customers created via import, `whatsapp_opt_in` is **hardcoded to `False`** (line 1456) — inconsistent with the schema default (`True`) and with the Add-Customer form default (opt-in ON).
- The official import template (line 1285) advertises only 7 columns (`name, phone, email, dob, city, address, tags`) — opt-in was never in CR-035's import scope.
- **Root cause classification: PLAN_GAP** — CR-035 export emits 22 columns but import consumes only 7. The natural user workflow (export → edit "WhatsApp Opt-in" in Excel → re-upload) silently ignores the change with no warning.
- Confidence: **HIGH**.

### Recommended Fix (for PLANNING gate — not implemented)
1. Parse `whatsapp opt-in` column in `_validate_and_classify_row` (accept Yes/No, True/False, 1/0; blank = leave unchanged).
2. Include it in the update payload only when explicitly provided (avoid mass opt-out from blank cells).
3. Decide owner policy for NEW imported customers: keep hardcoded `False` (conservative, compliance-safe) or honour column/default `True`. → **Owner decision required.**
4. Optionally surface "columns ignored" notice in the import preview so users know which columns will/won't be applied.
- Risk: **HIGH** (opt-in gates all WhatsApp campaign sends — wrong parsing could mass-opt-out or mass-opt-in customers). Full gate flow + owner approval mandatory per addendum §14.

---

## Issue 5 (added 2026-07-14) — "Customer deletion option missing in Customers section"

### Evidence
- **Backend EXISTS**: `DELETE /api/customers/{customer_id}` (`routers/customers.py` line 1671-1678) — deletes the customer + cascades `points_transactions` only.
- **Frontend NEVER BUILT**: `CustomersPage.jsx` imports the `Trash2` icon but never renders a customer-delete button (only tag-remove uses delete calls). `CustomerDetailPage.jsx` and `CustomerCard.jsx` — zero delete UI. Git history: no `handleDeleteCustomer` ever existed in the frontend.

### Root Cause
- **Classification: MISSING FEATURE (FE)** — confirmed: this is not a regression; the delete UI was never implemented. Only Edit exists in the Actions column.
- Confidence: **HIGH**.

### ⚠ Cascade-policy gap flagged for planning (if owner approves the feature)
Backend delete removes only `points_transactions`. It does **NOT** clean: `orders`/`order_items` (financial records — probably must be retained), `whatsapp_message_logs`, `coupon_usage`, `feedback`, `wallet_transactions`. Customer deletion is an **irreversible customer-data action → CRITICAL risk per addendum §14**; owner must decide: hard delete vs soft delete/anonymize, and confirmation UX (type-to-confirm recommended).

---

## Issue 6 (added 2026-07-14) — "Resent message still shows original sent time"

### Evidence
- **Backend records resend time correctly** (`routers/whatsapp.py` `POST /resend` lines 2207-2232): on resend it sets `last_resend_at`, `updated_at`, increments `resend_count`, and pushes a `status_history` entry `{status, timestamp, action: "resend"}`.
- **Frontend shows only `created_at`** (`MessageStatusPage.jsx` lines 720 and 874 — table row + mobile card both render `formatRelativeTime(log.created_at)`). `last_resend_at` / `resend_count` are never surfaced on the row.
- The resend timestamp IS visible today, but only inside the expanded status-history timeline (line 779) — not on the main list.

### Root Cause
- **Classification: FE / PLAN_GAP** — data exists in DB; the Message Status list simply never displays it. CR-004's resend UI didn't include a "resent at" column/badge.
- Confidence: **HIGH**.

### Recommended Fix (for PLANNING gate — not implemented)
- Show `last_resend_at` on the row when `resend_count > 0` (e.g., time cell shows "Resent <relative time>" + a small "Resent ×N" badge; original time remains in expanded history). FE-only change, LOW risk.

---

## Recommendation
| Issue | Next role | Severity | Risk |
|---|---|---|---|
| 1 Opt-in on Detail page edit | Owner confirmed scope → PLANNING (small FE change) | P2 | LOW |
| 2 Tags in export | RESOLVED — tags at rows 241-349; optional export-sort CR | P3 | — |
| 3 Import 502 | PLANNING → BUG FIX (`bulk_write` refactor of `/import`) | P1 | MEDIUM |
| 4A Opt-in in export | RESOLVED — 4 "No" rows at 326-349, export correct | P3 | — |
| 4B Opt-in ignored on import + hardcoded False for new | Owner decision (new-customer default) → PLANNING | P1 | HIGH (campaign gating field) |
| 5 Customer delete UI missing | MISSING FEATURE — owner decision on cascade policy (D5) → PLANNING | P2 | CRITICAL (irreversible customer data) |
| 6 Resend time not shown on row | PLANNING (FE-only: show last_resend_at + Resent ×N badge) | P2 | LOW |

---

## Evidence Appendix (raw probe results, 2026-07-14)

| Probe | Result |
|---|---|
| `GET /api/customers/export?format=csv` (jehsnest) | 200, 2.1 s, 348 rows, 22 columns |
| `GET /api/customers/export?format=xlsx` (jehsnest) | 200, 2.1 s, headers incl. Tags (Q) + WhatsApp Opt-in (R) |
| Tags column value distribution | 109 non-empty / 239 empty; first tagged row = 241, last = 349 |
| WhatsApp Opt-in column distribution | 344 "Yes" / 4 "No"; "No" rows = 326 (Siddhi Malani), 345 (Siddhi Malani), 348 (Saurav), 349 (MyGenie) — matches DB `whatsapp_opt_in: false` count = 4 |
| `PUT /api/customers/{id}` opt-in toggle round-trip | false → 200 → persisted False; true → 200 → persisted True (reverted, no dirty data) |
| UI automation: list edit modal | opt-in Switch present, visible, `aria-checked=true` (data-testid `edit-customer-whatsapp-opt-in`) |
| `CustomerDetailPage.jsx` grep `whatsapp_opt_in` | 0 hits — no toggle, no display on detail page |
| Mongo RTT (pod → 52.66.232.149) | ~242 ms per round-trip (20-probe average) |
| Import duration estimate (345 rows × sequential `update_one`) | ~83–167 s → exceeds Cloudflare/ingress ~100 s → 5xx to browser |
| `import_logs` (jehsnest) | testcustomer.xlsx 03:41 (345 upd/3 err) · user1.csv 06:39 · user2.csv 06:46 **and** 06:48 (duplicate retry) — every run **completed server-side** despite browser error |
| Import row errors logged | "Phone must be 10 digits, got 9" · "Missing name" · "Invalid phone format: '8888cbe020'" (= the 3 Errors in owner screenshot) |
| Import consumed columns (code trace L89-123) | name, phone, email, dob, city, address, tags — **whatsapp opt-in discarded** |
| Import new-customer default (L1456) | `whatsapp_opt_in: False` hardcoded (contradicts schema/Add-form default True) |

## Pending Owner Decisions — RESOLVED 2026-07-14 (see `DECISIONS_LOG.md § 2026-07-14`)

| # | Decision | Outcome |
|---|---|---|
| D1 | Import honours "WhatsApp Opt-in" column for existing customers? | ✅ YES — Yes/No accepted; BLANK = leave unchanged (extended: for ANY field) |
| D2 | Default opt-in for NEW customers created via import | ✅ TRUE (file value wins; blank → True) |
| D3 | Open PLANNING gate for combined batch | Implied by D1/D2/D6 locks — planning-ready: BUG-013, BUG-014, CR-063, CR-065; awaiting owner priority order + "start" |
| D4 | Optional export-sort CR | ❌ SKIPPED |
| D5 | Customer deletion (Issue 5 → CR-064) | ⏸ (c) PARKED |
| D6 | Resend time display (Issue 6 → CR-065) | ✅ (a) "Resent <time>" + ×N badge on row |

**Session status:** All 4 issues investigated to root cause. NO code edited (owner instruction). No fixes applied → no QA/testing performed. Next role: PLANNING (after D1-D4) or CLOSURE of resolved items 2/4A.
