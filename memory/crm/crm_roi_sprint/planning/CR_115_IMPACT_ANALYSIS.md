# CR-115 — Impact Analysis: Sync resilience — 401 flag + banner · resume · ordering guard · re-link on customer arrival (fixes BUG-037)
**Date**: 2026-10-10 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` §1 · **Group**: Wave A / Group 3 (CR-115 + BUG-037), planned as two implementation slices **115-A** (a, b, c) and **115-B** (d) · **Status**: 🟡 IA complete — **all 4 owner questions ruled 2026-10-10** (Q1 → 409 · Q2 → yes · Q3 → both · Q4 → pid only) · **No code changed.**

**Owner ruling applied (2026-10-10):** Q3 → (d) forward-only re-link **in scope now**, link-only, no `total_visits/total_spent/points` recompute.

---

## 1. Code reality (confirmed 2026-10-10)

### 1.1 (a) 401 handling — two sync loops, identical shape
```python
# routers/migration.py:154-166  (order_sync)            # routers/customers.py:308-320  (customer_sync)
if resp.status_code != 200:
    sync_status[user_id]["status"] = "failed"
    sync_status[user_id]["error"]  = f"API error on page {page}: {resp.status_code}"
    await _log_sync_progress(log_id, {"status":"failed", "error": ..., "completed_at": ..., counts...})
    return
```
- Status code is **not inspected**; 401 is treated like any non-200. Nothing written to `users`. The error string is the only persisted evidence (`"API error on page N: 401"` — this is what BUG-035 / CR-110-amend will grep).
- Token source: `X-MyGenie-Token` header first, `users.mygenie_token` fallback (CR-008; `customers.py:751-754`, `migration.py:817-820`).
- Login refresh: `auth.py:365-371` `$set {password_hash, mygenie_token, last_login}` on every login — the natural place to **clear** a `mygenie_token_invalid` flag.
- `UserResponse` (`schemas.py:195-230`) has `mygenie_token` but **no `mygenie_token_invalid`**; `/auth/me` (`auth.py:114-140`) maps fields explicitly → the banner needs +1 schema field and +1 line in `get_me`.
- Frontend: `AuthContext` loads `/auth/me` into `user` (`AuthContext.jsx:45-46, 81-82`); `DashboardPage.jsx:26` already destructures `{ user, api }`. Banner = conditional block at the top of Dashboard, no new fetch.

### 1.2 (b) resume — progress is already persisted per page
- `_log_sync_progress(log_id, {"current_page": page, ...})` runs **after every page** (`migration.py:523-530`; `customers.py:575-582`). So `current_page` on a `failed` row **is** the last completed page — a separate `last_completed_page` field is redundant; only the *semantics* must be documented (page N persisted ⇒ pages 1..N fully processed).
- `POST /migration/sync-orders` (`:799-842`) has no query params; `background_order_sync(user_id, mygenie_token)` always starts at `page = 1` (`:139`).
- `POST /customers/sync-mygenie` (`:734-770`) same shape.
- **POS pagination is not stable**: `/customer-order-migration?page=N` is ordered by the POS; new orders since the failure shift page boundaries → a resume from N+1 can **skip** rows that moved into pages ≤ N or **re-process** rows that moved forward. Re-processing is safe (upsert by `pos_order_id`); skips are silent. Risk accepted only if a later full sync is still possible (it is — full sync remains the default).

### 1.3 (c) ordering guard — **ALREADY EXISTS (PARTIAL)**
```python
# migration.py:828-833  CR-001B-fix F1
if not user_record.get("last_customer_sync_at"):
    return {"success": False, "message": "Customer sync must complete before order sync. Please sync customers first."}
```
- `last_customer_sync_at` is set only on **completed** customer sync (`customers.py:587-590`) → the guard is semantically correct. Returns **HTTP 200 with `success:false`**, not 409. `MigrationPage.jsx:95` shows `res.data.message` as a toast → **the UI already blocks the flow with the right message**. Intake G-4 ("UI allows order_sync before customer_sync") is **stale** — code is ahead of the docs (R1: code is truth).
- Remaining delta for (c): status code only (200→409). Cosmetic for the CRM UI (axios path changes from `res.data.message` to `err.response.data.detail`). **Recommend: no change** (Q1).

### 1.4 (d) re-link on customer arrival — nothing exists (BUG-037 confirmed)
- `order_sync` links by `pos_customer_id` (`$in` str/int variants, `migration.py:211-216`) then `phone_match` (`:218-220`); `customer_id` is re-evaluated **only when the same order is re-processed** (`:289-292` `$set` whole `order_doc`). No code path updates `orders` when a **customer** is inserted (`customers.py:528`).
- Orders store `cust_mobile` **raw** (`:230`, as sent by POS) and `pos_customer_id` as **str** (legacy rows may be int). `order_items.customer_id` is also set at write (`:303`) — a re-link must update both collections.
- Indexes: `orders {user_id, customer_id}` exists → `{user_id, customer_id:null}` scans are indexed; `pos_customer_id` is **not indexed** → per-customer `update_many` on a large tenant (CAFE 103 ~16k orders) does a partial scan of the null-customer subset each time. For a first-ever customer sync of 5k customers that is 5k × (null-subset scan). Acceptable on preprod; on prod the null subset is 219k rows across all tenants but per-tenant ≤ ~16k → still fine, but a **set-based post-step** is cheaper (see §2.4).
- Brew (r699) today: 391/391 customers already exist → a per-newly-inserted-customer step will **not** fix Brew's 1,128 orders (nothing is newly inserted). Brew is historical → **CR-087 O-A** (approved data write), as intake states.

### 1.5 BUG-035 dependency
- `scripts/push_and_refresh_tokens.py:29-31` will read `users.mygenie_token_invalid` after CR-110-amend → **115-A must ship before Group 4 is useful**; the error-string fallback (`error ~ /401/`) works even without 115-A.

**Code reality: (a) NONE · (b) PARTIAL (progress persisted, no resume entry point) · (c) FULL-minus-status-code · (d) NONE.**

---

## 2. Proposed design

### 2.1 (a) 401 flag + banner
- In both loops: `if resp.status_code == 401:` → `db.users.update_one({"id": user_id}, {"$set": {"mygenie_token_invalid": True, "mygenie_token_invalid_at": now}})` + `logger.warning("sync_401 user_id=%s sync_type=%s page=%s")` **before** the existing failure handling (keeps the error string for CR-110).
- `auth.py:365-371` `$set` += `"mygenie_token_invalid": False, "mygenie_token_invalid_at": None`.
- Optional (Q2): `sync-orders` / `sync-mygenie` endpoints return early `{"success": False, "message": "POS connection expired — log in again"}` when the flag is set **and no `X-MyGenie-Token` header was supplied** (a fresh header token should always be allowed to try).
- `UserResponse` += `mygenie_token_invalid: Optional[bool] = None`; `get_me` maps it.
- `DashboardPage.jsx`: `{user?.mygenie_token_invalid && <Alert data-testid="pos-token-expired-banner">POS connection expired — log in again to refresh</Alert>}`; "Log in again" = `logout()` (already destructured).

### 2.2 (b) resume
- `POST /migration/sync-orders?resume=true` (and `POST /customers/sync-mygenie?resume=true`, Q3): read latest `migration_sync_logs` row for the tenant+type with `status:"failed"` and `current_page ≥ 1`; start at `current_page + 1`; new log row gets `resumed_from_log_id`, `start_page`. If no failed row → fall back to full sync with a `message`. The `page == 1` side effects (`total_*_in_pos` write, `:179-183`) run only when actually on page 1.
- Migration page: when latest status is `failed` and `current_page > 0`, show a second button "Resume from page N" (`data-testid="resume-order-sync-btn"`).

### 2.3 (c) ordering guard
- ~~No change recommended~~ **Owner ruled 2026-10-10: change to HTTP 409.** `migration.py:828-833` → `raise HTTPException(status_code=409, detail="Customer sync must complete before order sync. Please sync customers first.")`; `MigrationPage.jsx:95` toast reads `err.response?.data?.detail` (already in the catch branch at `:96`); +1 test. Docs G-4 corrected to "guard existed since CR-001B-fix F1; status code upgraded by CR-115". If owner wants 409: raise `HTTPException(409, detail=...)` and change `MigrationPage.jsx:95` toast source. Docs (`BATCH_FIX_RECURRENCE_VALIDATION §1.4 G-4`, intake G-4) to be corrected: guard exists since CR-001B-fix F1.

### 2.4 (d) forward-only re-link (115-B)
- **Set-based post-step at the end of a completed `customer_sync`** (preferred) rather than per-insert: collect `newly_inserted = [(customer_id, pos_customer_id, phone, cc)]` during the loop (bounded list; 5k tuples is trivial), then after the page loop:
  1. `orders.update_many({user_id, customer_id: None, guest_order: {$ne: true}, pos_customer_id: {$in: variants}}, {$set: {customer_id, link_status: "linked_late", linked_late_at: now}})` per newly inserted customer with a pid;
  2. phone fallback for orders with no pid: `cust_mobile ∈ {digits, "+91"+digits, "91"+digits, "0"+digits}` (raw stored forms) — Q4 asks whether to include this fallback at all;
  3. `order_items.update_many({order_id ∈ touched}, {$set: {customer_id}})`;
  4. counters `relinked_orders` on the `customer_sync` log row + `logger.info`.
- **Only newly inserted** customers are considered (intake wording; existing customers' unlinked orders are CR-087 territory, approval-gated).
- **Link only**: no `total_visits/total_spent/avg_order_value/last_visit`, no `points_transactions` — stats for late-linked orders stay as they were (0 for the customer). Analytics for that customer will under-report until CR-087's separate "recompute" approval. Documented trade-off (owner Q5 of gate plan).
- **Excluded**: `guest_order:true` (realtime guests are by design), orders of other tenants (`user_id` scoped), orders already linked.
- **P-15 caveat**: linking by `pos_customer_id` assumes `order.user_id` == `/customer/list.id`. `order_sync` already makes this assumption at `:211-216`, so (d) adds **no new** mis-link risk; if POS answers P-15 "different id spaces", both sites must be revisited together (reserve `link_status:"linked_late"` so such rows are findable/reversible).
- Idempotent: second run finds no `customer_id:null` rows for those pids.

---

## 3. Owner questions

| # | Item | Question | Recommendation |
|---|---|---|---|
| **Q1** | (c) | Keep 200/`success:false` or change to 409? | **RULED: 409** (owner 2026-10-10) |
| **Q2** | (a) | Refuse sync start when flag set and no header token? | **RULED: yes** |
| **Q3** | (b) | Resume for order sync only or both? | **RULED: both** |
| **Q4** | (d) | Phone fallback in re-link? | **RULED: `pos_customer_id` only**; exclude placeholder ids `"0"`, `"9223372036854775807"` (BUG-039); phone-only rows → CR-087 report. Sept-2026 probe: 0 "phone but no id" orders in order_sync. |

---

## 4. Risk

| Slice | Label | Why |
|---|---|---|
| 115-A (a) | **LOW** | Additive flag + banner; login clears it. Touches `auth.py` (CRITICAL file) by **2 keys inside an existing `$set`** — no auth-flow logic change. Touches `schemas.py` `UserResponse` +1 optional field. |
| 115-A (b) | **MEDIUM** | Changes loop entry (`page = start_page`); pagination-drift skip risk (documented); new query param on two endpoints. |
| 115-A (c) | **LOW / none** | No change recommended. |
| 115-B (d) | **MEDIUM** | **First data write to `orders` from the customer-sync path.** Set-based, idempotent, link-only, forward-only, tenant-scoped, excludes guests. Mis-link risk inherited from existing pid matching (P-15), not new. |
| Overall | **MEDIUM** (intake) — confirmed. Regression on 3 tenants (addendum: Kunafa Mahal, Palm House, mygeniedev) + full sync + resume + re-link fixtures. |

---

## 5. Blast radius

- **Files WILL change**
  - `routers/migration.py` — 401 branch (+6), `background_order_sync(user_id, token, start_page=1, resumed_from=None)` (+10), `sync_orders_from_mygenie` `resume` param + flag check (+15)
  - `routers/customers.py` — 401 branch (+6), `background_customer_sync` start_page (+10), `sync_customers_from_mygenie` `resume` + flag check (+15), **post-loop re-link step (+35)**, `newly_inserted` collection at `:528-530` (+2)
  - `routers/auth.py` — `$set` +2 keys (`:367-371`); `get_me` +1 line
  - `models/schemas.py` — `UserResponse` +1 optional field
  - `frontend/src/pages/DashboardPage.jsx` — banner block (+10)
  - `frontend/src/pages/MigrationPage.jsx` — "Resume from page N" buttons (+20)
  - tests: `tests/test_cr115_sync_resilience.py` (+5: 401 flag set · login clears · resume start page · guard · re-link pid)
- **Files WILL NOT touch**: `core/phone.py` · `core/loyalty.py` (no points on re-link) · `core/helpers.py` (`_pos_id_query_variants` reused as-is) · realtime `pos.py` · `analytics_service.py` · `scripts/push_and_refresh_tokens.py` (Group 4) · matching logic in either loop (`:209-220`, `:449-473`) · `order_sync` customer-stats block (`:316-500`).

---

## 6. Conflict check

| With | Overlap | Resolution |
|---|---|---|
| **CR-113 (Group 2)** | Same two loops; (d) writes `link_status:"linked_late"` which 113 defines; 113's per-page `_log_sync_progress` payload is where `relinked_orders` joins. | **113 first**, then 115; one agent for both or rebase. |
| CR-110 amend (Group 4) | Reads `mygenie_token_invalid` (set by 115-A) | 115-A before Group 4 run |
| CR-086 Part C (deferred) | Would create stub customers in `order_sync` — different direction (order→customer). 115(d) is customer→order. No code overlap; if Part C is ever approved, (d) makes it redundant for the pid case. | note in CR-086 row |
| CR-087 O-A (Wave C) | Historical backfill for **existing** customers; (d) covers **newly inserted** only. Both set `customer_id`; 087 uses `link_status:"linked_backfill"`. | reserve value; no overlap in rows touched |
| CR-112 (Wave D) | none | — |
| BUG-022 (name preservation on re-sync) | untouched | — |

---

## 7. Downstream consumers

| Consumer | Impact |
|---|---|
| `/auth/me` consumers (all pages via `AuthContext`) | +1 optional key; ignored elsewhere. ✅ |
| CR-110 script | gains a reliable selector field. ✅ |
| Analytics (`orders.customer_id`-based joins) | late-linked orders now appear under the customer; customer `total_*` **not** updated → per-customer stats and order lists disagree until CR-087 recompute (documented). ⚠️ |
| Customer detail "Orders" tab | shows late-linked orders (reads `orders` by `customer_id`). ✅ |
| Loyalty | untouched — no points for late-linked orders (ruling). ✅ |
| WhatsApp / campaigns | segments based on `total_visits/total_spent` unchanged. ✅ |
| PROC-001 / CR-114 | `orphan_orders` KPI drops as (d) links; `link_status:"linked_late"` counted separately. ✅ |

---

## 8. Verification matrix

| # | Case | Expected |
|---|---|---|
| V1 | mock POS returns 401 on page 2 of order sync | `users.mygenie_token_invalid:true`, `_at` set; log row `failed`, `current_page:1`, error contains `401` |
| V2 | login after V1 | flag `false`, `_at` null; `/auth/me` reflects it; banner disappears |
| V3 | Dashboard with flag true | banner visible (`pos-token-expired-banner`), "Log in again" logs out |
| V4 | `POST /migration/sync-orders?resume=true` after V1 | first POS call is `?page=2`; log row has `resumed_from_log_id`, `start_page:2`; `total_orders_in_pos` not rewritten |
| V5 | `resume=true` with no failed row | full sync from page 1 + message |
| V6 | `sync-orders` before any customer sync | `success:false` message (existing) — regression |
| V7 | tenant with 3 unlinked orders (pid 123 str, 123 int, pid 999) + guest order; customer sync inserts customer pid 123 | 2 orders → `customer_id` set, `link_status:"linked_late"`; pid-999 and guest untouched; `order_items.customer_id` updated; customer `total_visits` **unchanged**; log `relinked_orders:2` |
| V8 | run V7 customer sync again | `relinked_orders:0`, no changes (idempotent) |
| V9 | 3-tenant full regression (Kunafa / Palm House / mygeniedev): customer sync → order sync → status | counts equal to pre-change baseline ± 0 |

---

```text
Planning complete: CR-115 (+BUG-037)
Stage: Impact Analysis
Code reality: (a) NONE · (b) PARTIAL — per-page progress already persisted, no resume entry · (c) FULL minus status code — guard exists since CR-001B-fix F1, docs stale · (d) NONE
Risk: MEDIUM (115-B data write to orders from customer_sync; 115-A resume loop entry) · LOW (401 flag, banner, auth $set +2 keys)
Files WILL change: routers/migration.py · routers/customers.py · routers/auth.py ($set +2, get_me +1) · models/schemas.py (UserResponse +1) · DashboardPage.jsx · MigrationPage.jsx · tests/test_cr115_sync_resilience.py (new)
Files WILL NOT touch: core/phone.py · core/loyalty.py · core/helpers.py · realtime pos.py · analytics · matching logic · order_sync stats block · scripts/
Owner decisions: ALL RULED 2026-10-10 — Q1 409 · Q2 refuse start when flag set · Q3 resume both · Q4 pid-only (exclude placeholder ids)
Docs: planning/CR_115_IMPACT_ANALYSIS.md
Next: Implementation Plan gate for Group 3 — opens on "choose planning role for implementation planning of Group 3" (after Group 2)
```
