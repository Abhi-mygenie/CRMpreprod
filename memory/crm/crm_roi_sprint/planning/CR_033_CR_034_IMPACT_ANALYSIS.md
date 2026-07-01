# CR-033 + CR-034 — Combined Impact Analysis

> **Role**: PLANNING AGENT (Role 2)
> **Date**: 2026-07-01
> **Items**: CR-033 (Additional Audience Filters) + CR-034 (Customer Tag System)
> **Stage**: Impact Analysis
> **Branch**: 1-july

---

## SESSION START

```
Project: MyGenie CRM
Role selected: PLANNING (Role 2)
Reason: CR-033 is Discovery Complete, CR-034 is Intake Complete — both await impact analysis + implementation plan
Risk level: LOW (additive only; zero hotspot files touched)
Docs read:
  - MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md (full)
  - CR_033_ADDITIONAL_AUDIENCE_FILTERS_DISCOVERY.md
  - CR_034_CUSTOMER_TAG_SYSTEM_INTAKE.md
  - INV_003_AUDIENCE_FILTERS_AND_TAGS.md
  - CR_STATUS_DASHBOARD.md
  - core/helpers.py (build_customer_query: lines 220-316)
  - routers/customers.py (list_customers: lines 795-995; count_customers_by_filters: 1341-1343)
  - models/schemas.py (CustomerBase: 218-320; UserResponse: 187-216)
  - pages/AudiencesPage.jsx (DEFAULT_FILTERS: line 30; filter UI: lines 336-420)
  - pages/CustomersPage.jsx (filter params: lines 84-228)
  - routers/campaigns.py (_resolve_audience_customers: lines 46-58)
Blocked by unknowns: NONE (all required for LOW-risk implementation is available)
Next action: Produce combined impact analysis; flag inter-CR conflict; list implementation plan
```

---

## PART 1 — CODE REALITY CHECK

### 1.1 Critical Discovery: `list_customers` vs `build_customer_query` Split

**This is the most important finding in this impact analysis.**

The codebase has TWO separate customer query-building paths:

| Path | File | Used by | Lines | Handles P0 flags? |
|---|---|---|---|---|
| **A** `list_customers()` query builder | `routers/customers.py` | CustomersPage direct filter | 832-960 | ✅ YES — already handles vip_flag, is_blocked, blacklist_flag, complaint_flag, whatsapp_opt_in, has_birthday_this_month, gender, lead_source, etc. |
| **B** `build_customer_query()` | `core/helpers.py` | AudiencesPage segment builder, campaign audience resolver, segment count | 220-316 | ❌ NO — only 14 dimensions; silently ignores vip_flag, has_birthday_this_month, whatsapp_opt_in |

**Consequence (live DB, BUG-A):**
- Segment "Birthday This Month" (`{has_birthday_this_month: true}`) → `build_customer_query` drops the key → query runs as ALL customers → **count is 5,907 instead of 205**
- Segment "VIP High Spenders" (`{vip_flag:"true", total_spent:"10000+"}`) → `build_customer_query` drops vip_flag → returns 4 customers but ignores VIP criterion (BUG-D)
- **Campaign sends using these audiences are blasting wrong customers today.**

**The fix for CR-033 Phase 1 is entirely in `core/helpers.py::build_customer_query()` — bring it to parity with the existing `list_customers` logic. The fix code already EXISTS in `routers/customers.py:867-936` — it just needs to be mirrored into `build_customer_query()`.**

### 1.2 `build_customer_query` Downstream Consumers (CRITICAL — determines blast radius)

Every improvement to `build_customer_query()` automatically propagates to ALL of:

| Consumer | File | Line | What improves |
|---|---|---|---|
| `count_customers_by_filters()` | `routers/customers.py` | 1341 | Segment counts on AudiencesPage become accurate |
| `refresh_segment_count` endpoint | `routers/customers.py` | 1378 | Manual recount now uses correct filter |
| `preview-count` endpoint | `routers/customers.py` | 1392 | Preview count on audience builder now accurate |
| `get_segment_customers()` | `routers/customers.py` | 1420 | Customer list for a segment now correct |
| `resolve_audience()` in helpers | `core/helpers.py` | 320 | Campaign audience query is correct |
| `_resolve_audience_customers()` | `routers/campaigns.py` | 46 | Campaign send audience is correct |
| `process_due_campaigns()` scheduler | `core/campaign_jobs.py` | (imports campaigns.py) | Scheduled campaign sends are correct |

**Single file edit → 7 downstream consumers fixed. No code change needed in campaign files.**

### 1.3 CR-034 Schema Reality Check

| Field | In `CustomerBase`? | In `CustomerUpdate`? | In live DB? | Notes |
|---|---|---|---|---|
| `tags: List[str]` | ❌ Missing | ❌ Missing | ❌ Missing | Must be added |
| `segment_tags: Optional[List[str]]` | ✅ Exists (line 230) | ✅ Exists | ❌ 0 docs | **This is "segment IDs", not user-defined tags** — do NOT repurpose this field |
| `vip_flag: bool = False` | ✅ Exists (line 304) | ✅ Exists | 46 docs = True | Backfill: auto-tag these 46 with "VIP" |

| User field | In `UserBase`/`UserResponse`? | In live DB? | Notes |
|---|---|---|---|
| `available_tags: List[str]` | ❌ Missing from Pydantic models | ❌ Missing | Must be stored directly in `users` collection (schema-less); read via `db.users.find_one({"id":user_id}, {"available_tags":1})` |

**`UserResponse` Pydantic model does NOT need to change** — `available_tags` is a separate fetch via `GET /api/customers/tags`. No change to auth flow or JWT.

### 1.4 Conflict Risk Between CR-033 and CR-034

Both CRs touch `core/helpers.py::build_customer_query()`. If implemented in the same session:
- **CR-033 adds**: 6 P0 flag blocks + P1 blocks
- **CR-034 adds**: 1 `tags` block
- **Risk**: merge conflict if not done in sequence within one session

**Recommendation**: implement both in a single session in sequence — CR-033 changes to `build_customer_query` first, then CR-034 appends the `tags` block. One final version of the function, no conflict.

---

## PART 2 — CR-033 IMPACT ANALYSIS

### 2.1 Scope (per Discovery doc + code reality)

**Phase 1 — P0 (BUG-A fix + new flags, ~1 hour)**

| Filter key | `build_customer_query` logic to add | Code reference to mirror |
|---|---|---|
| `vip_flag` | `query["vip_flag"] = (value == "true")` if not "all" | `customers.py:871-872` |
| `has_birthday_this_month` | Regex on `dob`: `{"$regex": f"-{month:02d}-"}` | `customers.py:892-898` |
| `whatsapp_opt_in` | `query["whatsapp_opt_in"] = (value == "true")` | `customers.py:868-869` |
| `is_blocked` | `query["is_blocked"] = (value == "true")` | `customers.py:935-936` |
| `blacklist_flag` | `query["blacklist_flag"] = (value == "true")` | `customers.py:886-887` |
| `complaint_flag` | `query["complaint_flag"] = (value == "true")` | `customers.py:889-890` |

All 6 filter keys' semantics already exist in `list_customers`. Zero new logic invented.

**Phase 2 — P1 quick wins (~4 hours, same files)**

| Filter key | Logic | Data note |
|---|---|---|
| `has_anniversary_this_month` | Regex on `anniversary` field | 73 docs populated |
| `birthday_month` | Regex on `dob` for specific month (1-12) | 205 docs |
| `age_bracket` | Derive age from `dob`, match bracket 18-25 / 26-35 / 36-50 / 50+ | 205 docs |
| `gender` | `query["gender"] = value` | 6 docs (low but zero cost) |
| `created_at_days` | `created_at >= (now - N days)` | All docs have `created_at` |
| `lead_source` | `query["lead_source"] = value` OR `{"$in": [...]}` for multi-select | 40 docs |
| `has_gst` | `query["gst_number"] = {"$exists": True, "$ne": ""}` or negation | 35 docs |
| `has_notes` | `query["notes"] = {"$exists": True, "$ne": ""}` | 41 docs |
| `wallet_balance_range` | `query["wallet_balance"] = {"$gte": N, "$lte": M}` | denormalised |
| `total_coupon_used_range` | Bucket on `total_coupon_used` | denormalised |
| `total_points_earned` | `query["total_points_earned"] = {"$gte": N}` | denormalised |

> Note: `gender` and `lead_source` are already handled in `list_customers` (lines 877-878, 920-921). Mirror pattern directly.

**Phase 3 — Cheap P2 (~2 hours)**

| Filter key | Logic | Collections touched |
|---|---|---|
| `received_campaign_id` | `whatsapp_message_logs.campaign_id` match → return customer_ids → `customer_id: {"$in": [...]}` | `whatsapp_message_logs` |
| `whatsapp_status_failed` | `whatsapp_message_logs` where `status="failed"` → customer_ids | `whatsapp_message_logs` |
| `never_messaged` | Customer_id NOT IN `whatsapp_message_logs.customer_id` | `whatsapp_message_logs` |

These three require a pre-query aggregation step. Implementation: pre-compute customer_id set, then filter. Not a `$lookup` join in the main query (Motor doesn't support inline `$lookup` in `find()` easily — use `aggregate()` or pre-compute).

**Phase 4 — Expensive P2 (separate future CR — NOT in this CR)**
- `last_order_date`, `avg_order_value`, `order_type`, `payment_method` — require cached fields on customer doc or aggregation pipelines. Deferred to separate CR as noted in discovery.

### 2.2 AudiencesPage UI Grouping

Current `AudiencesPage.jsx`: 7 flat filter controls (lines ~336-420).

**Proposed new structure** (per §5 of CR-033 discovery):
```
Section 1: Basic           — tier, customer_type, gender
Section 2: Loyalty & Spend — total_visits, total_spent, total_points, wallet_balance, coupons
Section 3: Dates           — last_visit, birthday_month, anniversary, signed_up_recently
Section 4: Engagement      — whatsapp_opt_in, campaign_received, message_failed, never_messaged
Section 5: Flags           — vip_flag, is_blocked, blacklist_flag, complaint_flag, has_gst
```
Use shadcn `Collapsible` for section collapse. "Basic" and "Loyalty & Spend" open by default; others collapsed.

**And/OR combinator decision**: per discovery recommendation (b) — dimension-level multi-select uses OR, cross-dimension stays AND. This is already how MongoDB `$in` works. No combinator UI widget needed for Phase 1+2.

### 2.3 Files CR-033 WILL Change

| File | Change | Blast radius |
|---|---|---|
| `backend/core/helpers.py` | Add 6 P0 blocks + 11 P1 blocks + 3 P2 blocks to `build_customer_query()` | MEDIUM — single function; 7 downstream consumers |
| `frontend/src/pages/AudiencesPage.jsx` | Add filter controls for new dimensions + grouping via Collapsible | LOW — UI only |
| `backend/routers/customers.py` | Optionally add `GET /api/customers/distinct/lead-sources` endpoint for lead_source multi-select | SMALL |

### 2.4 Files CR-033 WILL NOT Touch

- `core/coupon.py` ❌
- `routers/pos.py` ❌
- `core/whatsapp.py` ❌
- `core/loyalty.py` ❌
- `routers/campaigns.py` ❌ (auto-benefits from helpers.py fix)
- `core/campaign_jobs.py` ❌
- `models/schemas.py` ❌ (no schema change — all fields already exist)
- `services/invoice_generator.py` ❌
- `frontend/src/pages/CustomersPage.jsx` ❌ (already handles these flags correctly)

---

## PART 3 — CR-034 IMPACT ANALYSIS

### 3.1 Schema Changes

**`models/schemas.py` — CustomerBase (line ~320)**
```python
# CR-034: free-form user-defined tags
tags: List[str] = []
```
Same field added to `CustomerUpdate` and the `Customer` response model.

**User document** (NOT a Pydantic model change — direct DB reads):
- `available_tags` stored as `List[str]` on the `users` collection document
- Read: `db.users.find_one({"id": user_id}, {"available_tags": 1})`
- Update: `db.users.update_one({"id": user_id}, {"$addToSet": {"available_tags": {"$each": new_tags}}})`
- No change to `UserResponse` Pydantic model (separate endpoint `GET /api/customers/tags`)

### 3.2 New Backend Endpoints

All 5 endpoints go into `routers/customers.py`:

| Method | Path | Logic | AC |
|---|---|---|---|
| `GET` | `/api/customers/tags` | `db.users.find_one → available_tags` sorted alphabetically | AC4, AC7 |
| `POST` | `/api/customers/{id}/tags` | `$addToSet` on customer doc + `$addToSet` on user's `available_tags` | AC1, AC9 |
| `DELETE` | `/api/customers/{id}/tags/{tag}` | `$pull` on customer doc; optionally audit if last user of tag (Q3 decision = keep) | AC2 |
| `POST` | `/api/customers/bulk-tag` | `$addToSet` on all N customer docs (bulk_write) + update `available_tags` | AC3 |
| `POST` | `/api/customers/bulk-untag` | `$pull` on all N customer docs (bulk_write) | symmetric with bulk-tag |

**Routing conflict to watch**: `GET /api/customers/tags` must be declared **before** `GET /api/customers/{customer_id}` in `customers.py` — otherwise FastAPI will interpret `tags` as a `customer_id`. Current route order has `/{customer_id}` at line 1060. Place the new tags endpoint above it (ideally near the `sample-data` endpoint at line 723 or the `segments/stats` at line 995).

### 3.3 `build_customer_query()` Tags Block

```python
# CR-034: user-defined tag filter
if filters.get("tags") and isinstance(filters["tags"], list) and len(filters["tags"]) > 0:
    mode = filters.get("tags_mode", "any")  # "any" (OR) or "all" (AND)
    if mode == "all":
        query["tags"] = {"$all": filters["tags"]}
    else:  # default: OR
        query["tags"] = {"$in": filters["tags"]}
```

This is additive (no existing key named "tags"). Safe to append at end of function.

### 3.4 Migration / Backfill Script

Per CR-034 §8 D1/D2 and Q6 recommendation = auto-tag 46 `vip_flag=true` customers:

```python
# backend/migrations/cr034_vip_flag_to_tag.py
# One-time: find all customers with vip_flag=True and ensure "VIP" in their tags array
await db.customers.update_many(
    {"vip_flag": True, "tags": {"$nin": ["VIP"]}},
    {"$addToSet": {"tags": "VIP"}}
)
# Also update each affected user's available_tags catalog
for user_id in affected_user_ids:
    await db.users.update_one({"id": user_id}, {"$addToSet": {"available_tags": "VIP"}})
```

Run once on deploy. Idempotent (uses `$addToSet`). Can be called from lifespan or as standalone script.

### 3.5 Frontend Changes

**`CustomersPage.jsx`** (~2257 lines — careful edits only):
- Add tag chip section on each customer row card (after tier/type badges)
- Inline chip input with autocomplete from tenant's `available_tags` catalog (use shadcn `Command` inside `Popover`)
- Bulk-tag action on multi-select checkbox toolbar: "Tag selected…" button → choose tag → call `POST /bulk-tag`

**`AudiencesPage.jsx`** (~457 lines):
- Add "Tag" filter section (multi-select chip group from tenant catalog, fetched from `GET /api/customers/tags`)
- Optional AND/OR toggle (defaults to OR per Q2 recommendation)

**`components/TagChip.jsx`** (new, ~50 lines):
- Reusable: colored pill with `×` remove button, `onClick` callback
- Used by both CustomersPage rows and AudiencesPage filter display

### 3.6 Tenant Isolation Verification

All tag operations are scoped by `user_id`:
- Tag catalog: `users.available_tags` — per-user document
- Customer tags: `customers.tags` — all customer documents already have `user_id`
- `build_customer_query()` always starts with `query = {"user_id": user_id}`

AC7 (tenant isolation) is guaranteed by the existing architecture. No extra work needed.

### 3.7 Files CR-034 WILL Change

| File | Change |
|---|---|
| `backend/models/schemas.py` | Add `tags: List[str] = []` to `CustomerBase`, `CustomerUpdate`, `Customer` |
| `backend/routers/customers.py` | 5 new endpoints; routing order fix for `/tags` before `/{customer_id}` |
| `backend/core/helpers.py` | Add `tags` filter block to `build_customer_query()` |
| `backend/migrations/cr034_vip_flag_to_tag.py` | New migration script (one-time backfill) |
| `frontend/src/pages/CustomersPage.jsx` | Tag chip UI per row + bulk tag action |
| `frontend/src/pages/AudiencesPage.jsx` | Tag filter chip with autocomplete + optional AND/OR toggle |
| `frontend/src/components/TagChip.jsx` | New reusable component (~50 lines) |

### 3.8 Files CR-034 WILL NOT Touch

- All hotspot files (§PART C): `core/coupon.py`, `routers/pos.py`, `core/whatsapp.py`, `core/loyalty.py`, `core/campaign_jobs.py`, `services/invoice_generator.py` — **ALL UNTOUCHED**
- `routers/campaigns.py` — untouched; campaign send path uses `build_customer_query` which automatically gains `tags` support
- `routers/auth.py` — untouched; `UserResponse` Pydantic model unchanged

---

## PART 4 — COMBINED RISK + REGRESSION MATRIX

### Risk Assessment

| Item | Phase | Risk | Reason |
|---|---|---|---|
| CR-033 Phase 1 (P0 BUG-A fix) | P0 | LOW | Mirror existing code from `list_customers`; additive to `build_customer_query` |
| CR-033 Phase 2 (P1 new filters) | P1 | LOW | Additive; no schema change; all fields already on Customer doc |
| CR-033 Phase 3 (cheap P2 joins) | P2 | LOW-MEDIUM | Pre-query aggregation; no live customer-facing path |
| CR-034 schema change (tags field) | — | LOW | Additive field; Mongo is schema-less; default is `[]` so all existing docs get empty array on read |
| CR-034 new endpoints | — | LOW | New routes; no modification of existing endpoints |
| CR-034 bulk-tag | — | LOW | Uses `bulk_write` with `UpdateMany`; not POS-facing |
| CR-034 migration script | — | LOW | `$addToSet` is idempotent; can re-run safely |
| `build_customer_query` changes (both CRs) | — | LOW-MEDIUM | Most-called function for audience logic; must be tested after each addition |

**No item reaches MEDIUM or above because: zero hotspot files, zero financial flows, zero WhatsApp sends, additive-only changes.**

### Regression Checklist (post-implementation)

| Check | Why |
|---|---|
| R1 — All existing segments still compute correct counts | `build_customer_query` additions must not break existing 14 dimensions |
| R2 — Campaign "Send Now" still reaches correct audience | `_resolve_audience_customers` path unchanged; test with a simple tier=Gold audience |
| R3 — `POST /api/pos/orders` flow unaffected | No change to POS router |
| R4 — Coupon `validate` + `apply` unaffected | No change to coupon files |
| R5 — Customer create/update still works | `schemas.py` additive change only; existing fields untouched |
| R6 — Tag endpoints return 401 for unauthenticated requests | Standard `Depends(get_current_user)` |
| R7 — Bulk-tag with 0 IDs returns 400 (not 500) | Input validation |
| R8 — Tag filter on audience with `tags=[]` returns full set (no-op) | Guard `len > 0` in `build_customer_query` |
| R9 — `GET /customers/tags` returns only current tenant's tags | `user_id` scoped |
| R10 — Backfill script: 46 `vip_flag=True` customers get `tags=["VIP"]` | Check count after migration |

---

## PART 5 — OPEN OWNER QUESTIONS (blocking implementation)

**CR-033:**

| # | Question | Options | Recommendation | Status |
|---|---|---|---|---|
| Q1 | Which phases to ship? | P0 only / P0+P1 / P0+P1+cheap-P2 | Ship P0+P1+cheap-P2 (~1.5 days, best ROI) | **OPEN** |
| Q2 | AND/OR combinator | (a) AND-only · (b) dim-level multi-select = OR, cross-dim = AND · (c) full tree | (b) — already implicit via `$in`; no extra UI needed | **OPEN** |
| Q3 | UI grouping | Flat list (current) vs Collapsible sections | Collapsible sections (§5 proposal) | **OPEN** |
| Q4 | Cached fields for expensive P2 (last_order_date, avg_order_value)? | Live aggregate / Cached on order webhook | Cached (add field on POS order webhook) — but P4 is out of this CR | Deferred |
| Q5 | Any must-have filter not listed? | — | — | **OPEN** |
| Q6 | Priority bump (any P1→P0 or P2→P1)? | — | — | **OPEN** |

**CR-034:**

| # | Question | Options | Recommendation | Status |
|---|---|---|---|---|
| Q1 | Where is "add tag" UI? | (a) CustomersPage only · (b) Also on Customer Detail modal · (c) Also on OrdersPage | (b) — list row + detail modal | **OPEN** |
| Q2 | Multi-tag filter semantics | (a) OR default · (b) AND default · (c) User toggle | (a) OR default with optional toggle | **OPEN** |
| Q3 | When last customer untagged, remove from catalog? | (a) Auto-remove · (b) Keep · (c) Show unused | (b) Keep | **OPEN** |
| Q4 | Tag name constraints | (a) Free-form · (b) Max 30 chars, alphanum+space · (c) Case-normalised | (b) case-preserving, dedup case-insensitive | **OPEN** |
| Q5 | Should tier become a tag? | (a) Keep separate · (b) Also as read-only tags | (a) Keep separate | **OPEN** |
| Q6 | Backfill vip_flag→VIP tag? | (a) Auto-tag on deploy · (b) Leave vip_flag separate · (c) Migrate + deprecate boolean | (a) Auto-tag; keep boolean | **OPEN** |

**Recommended path**: Owner accepts all 12 recommended defaults verbatim → skip to IMPLEMENTATION immediately (no second planning round needed). Implementation plan below is pre-built for that case.

---

## PART 6 — IMPLEMENTATION PLAN (ready to execute if owner accepts defaults)

### Phase sequence

```
Session A (~2.5 hours):
  1. CR-033 Phase 1+2+3 (backend core/helpers.py + routers/customers.py)
  2. CR-034 backend (models/schemas.py + routers/customers.py + core/helpers.py + migration script)

Session B (~3 hours):
  3. CR-033 frontend (AudiencesPage.jsx — grouped filter UI)
  4. CR-034 frontend (CustomersPage.jsx tag chips + AudiencesPage.jsx tag filter + TagChip.jsx)

Session C (~30 min):
  5. Smoke test all R1-R10 regression checks
  6. Update CR_STATUS_DASHBOARD.md
```

### Edit sequence (Session A, backend)

**Step 1 — `core/helpers.py::build_customer_query`** (append after line 316):

Add blocks (in order): `vip_flag`, `whatsapp_opt_in`, `has_birthday_this_month`, `is_blocked`, `blacklist_flag`, `complaint_flag` (P0), then P1 blocks (`anniversary_this_month`, `birthday_month`, `age_bracket`, `gender`, `created_at_days`, `lead_source`, `has_gst`, `has_notes`, `wallet_balance`, `total_coupon_used`, `total_points_earned`), then cheap P2 (`received_campaign_id`, `whatsapp_failed`, `never_messaged`), then CR-034 `tags` block.

**Step 2 — `models/schemas.py`** (CustomerBase line 320, CustomerUpdate line 334, Customer line ~444):

Add `tags: List[str] = []` to all three.

**Step 3 — `routers/customers.py`** (insert before line 1060 `/{customer_id}` route):

Add 5 tag endpoints. Ensure routing order: `/tags` before `/{customer_id}`.

**Step 4 — `migrations/cr034_vip_flag_to_tag.py`** (new script):

Backfill 46 vip_flag=True customers.

---

## PART 7 — INTER-CR DEPENDENCY MAP

```
CR-033 P0    ──────┐
CR-033 P1    ──────┼──→ core/helpers.py::build_customer_query() ──→ 7 downstream consumers (auto-fixed)
CR-034 tags  ──────┘

CR-034 schema ────→ models/schemas.py (additive)
CR-034 routes ────→ routers/customers.py (5 new endpoints + routing order fix)
CR-034 FE     ────→ CustomersPage.jsx + AudiencesPage.jsx + TagChip.jsx (new)
```

No dependency between the two CRs. They share `build_customer_query()` only — sequence within one session eliminates any conflict.

---

## PART 8 — PLANNING OUTPUT BLOCK

```
Planning complete: CR-033 + CR-034
Stage: Impact Analysis + Implementation Plan (both)
Code reality:
  CR-033: PARTIAL — list_customers already has P0 filters; build_customer_query does NOT
  CR-034: NONE — no tags field, no endpoints, no catalog
Risk: LOW (both CRs)
Files WILL change:
  backend/core/helpers.py            (both CRs — build_customer_query additions)
  backend/models/schemas.py          (CR-034 — tags field)
  backend/routers/customers.py       (CR-034 — 5 new endpoints; both CRs — no conflict)
  backend/migrations/cr034_vip_flag_to_tag.py  (CR-034 — new backfill script)
  frontend/src/pages/AudiencesPage.jsx         (CR-033 — grouped filter UI; CR-034 — tag filter)
  frontend/src/pages/CustomersPage.jsx         (CR-034 — tag chips + bulk action)
  frontend/src/components/TagChip.jsx          (CR-034 — new component)
Files WILL NOT touch:
  core/coupon.py, routers/pos.py, core/whatsapp.py, core/loyalty.py,
  routers/campaigns.py, core/campaign_jobs.py, routers/auth.py,
  services/invoice_generator.py, services/analytics_service.py
Owner decisions open: CR-033 Q1-Q6, CR-034 Q1-Q6 (12 total — all have recommended defaults)
Docs: memory/crm/crm_roi_sprint/planning/CR_033_CR_034_IMPACT_ANALYSIS.md
Next: Owner reviews open questions → accepts defaults → IMPLEMENTATION
```

---

*End of CR-033 + CR-034 Combined Impact Analysis*
