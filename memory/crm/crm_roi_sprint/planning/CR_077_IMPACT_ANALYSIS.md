# CR-077 — Impact Analysis
## Configurable Lifecycle & Intelligence Thresholds (Per-Tenant)

**Date**: 2026-08-05  
**Role**: Planning Agent — Impact Analysis  
**Source**: INV-014 · CR-077 Intake (Q1–Q5 owner-locked)  
**Code reality**: FULL — all target files inspected with exact line numbers  

---

## Owner Decisions (Locked)

| Q | Answer |
|---|---|
| Q1 | LoyaltySettingsPage — new section |
| Q2 | Per-tenant daily limit, default = 1000 |
| Q3 | YES — VIP auto-promotion toggle (defaults OFF) |
| Q4 | Simple — one `high_spender_threshold` field only |
| Q5 | Single phase, all defaults = current hardcoded values |

---

## Finding-by-Finding Impact

---

### F1 — Lifecycle Stage Day Boundaries

**Hardcoded location**: `backend/routers/analytics.py` lines 483–516

**Data flow (before)**:
```
GET /api/analytics/customer-lifecycle
  └─ get_stage_cutoffs()          ← returns {thirty_days_ago, sixty_days_ago, ninety_days_ago}
       └─ hardcoded 30 / 60 / 90 days
  └─ MongoDB aggregation pipeline ← uses cutoff dates + hardcoded "total_visits <= 1"

GET /api/analytics/customer-lifecycle/customers
  └─ get_stage_cutoffs()          ← same hardcoded function
  └─ query builder                ← uses cutoff dates for stage ranges

classify_customer_stage(customer, cutoffs)
  └─ total_visits <= 1 hardcoded  ← "new" threshold
```

**Data flow (after)**:
```
GET /api/analytics/customer-lifecycle
  └─ fetch loyalty_settings for user_id (1 DB query)
  └─ get_stage_cutoffs(settings)  ← reads at_risk_days_start/end, dormant_days_end,
                                     new_customer_max_visits from settings
  └─ MongoDB aggregation pipeline ← uses configurable cutoffs + configurable max_visits

GET /api/analytics/customer-lifecycle/customers
  └─ fetch loyalty_settings for user_id (1 DB query)
  └─ get_stage_cutoffs(settings)
  └─ query builder uses configurable day ranges

classify_customer_stage(customer, cutoffs)
  └─ cutoffs["new_max_visits"] replaces hardcoded 1
```

**Downstream consumers affected**:
- `CustomerLifecyclePage.jsx` — stage summary cards, distribution bar, customer table
- `export_lifecycle_customers()` (calls `get_lifecycle_customers()` internally — inherits fix)
- **CR-076 dependency**: CR-076 will add a `lifecycle_stage` filter to `build_customer_query`. That filter must use the same configurable cutoffs. **CR-077 F1 must land before or with CR-076 lifecycle filter.**

**Files touched**: `analytics.py` only  
**Files NOT touched**: POS, coupon, loyalty, auth, WhatsApp, campaigns, customers  
**Risk**: LOW — pure date computation, no DB writes, 1 additional `loyalty_settings` read per request

**Edge case**: If owner sets `at_risk_days_start > at_risk_days_end` (e.g., start=90, end=30), classification gaps occur. Need input validation: `at_risk_days_start < at_risk_days_end < dormant_days_end`.

---

### F2 — Campaign Daily WhatsApp Send Limit

**Hardcoded location**: `backend/routers/campaigns.py` line 29

**Data flow (before)**:
```
GET /api/campaigns/daily-limit
  └─ DAILY_LIMIT = 1000 (module constant)
  └─ returns {limit: 1000, used: N, remaining: 1000-N}

POST /api/campaigns/{id}/send  (sch_type == "now")
  └─ used_today = _get_daily_send_count(user_id)
  └─ if used_today + target > DAILY_LIMIT → 429
  └─ error message: "1000 remaining today"

campaign_jobs.py::process_due_campaigns()
  └─ DAILY_LIMIT NOT checked ← scheduled/recurring campaigns bypass daily limit
     (confirmed: line 668 comment "Does NOT count toward DAILY_LIMIT")
```

**Data flow (after)**:
```
GET /api/campaigns/daily-limit
  └─ fetch loyalty_settings.campaign_daily_limit for user_id (1 DB query)
  └─ limit = settings.get("campaign_daily_limit", 1000)
  └─ returns {limit: per_tenant_limit, used: N, remaining: limit-N}

POST /api/campaigns/{id}/send  (sch_type == "now")
  └─ fetch loyalty_settings.campaign_daily_limit for user_id
  └─ if used_today + target > per_tenant_limit → 429
  └─ error message: "{per_tenant_limit} remaining today"

campaign_jobs.py::process_due_campaigns()
  └─ UNCHANGED — scheduled campaigns still bypass daily limit (by design)
```

**Important finding**: `campaign_jobs.py` has NO daily limit check. The daily limit is ONLY enforced for manual "Send Now" campaigns. Scheduled/recurring campaigns are not subject to this limit. This is existing intended behavior — **not changing**.

**Downstream consumers affected**:
- `CampaignWizardPage.jsx` — calls `GET /api/campaigns/daily-limit` to show "X of Y remaining" indicator
- `send_campaign()` in campaigns.py — uses limit for 429 gate

**Files touched**: `campaigns.py` only  
**Files NOT touched**: `campaign_jobs.py`, `scheduler.py`, `whatsapp.py`, frontend pages  
**Risk**: LOW — default 1000 unchanged, 1 additional `loyalty_settings` read per send

---

### F3 — Customer Value Band Thresholds

**Hardcoded location**: `backend/core/customer_intelligence.py` line 185

**Data flow (before)**:
```
POST /api/suggestions/customer-intelligence (POS-facing endpoint)
  └─ suggestions.py:122 → compute_customer_value(db, user_id, customer_id, customer)
       └─ composite score computed (0-100)
       └─ band = "vip" if score >= 80 else "high" >= 60 else "medium" >= 35 else "low"
       └─ churn_risk = "high" if score > 0.7 ... (F5 — same function)
  └─ returned in response as customer_value.band
```

**Data flow (after)**:
```
POST /api/suggestions/customer-intelligence
  └─ suggestions.py fetches loyalty_settings for user_id (1 DB query)
  └─ passes settings to compute_customer_value(db, user_id, customer_id, customer, settings)
       └─ vip_min   = settings.get("vip_score_min", 80)
       └─ high_min  = settings.get("high_score_min", 60)
       └─ med_min   = settings.get("medium_score_min", 35)
       └─ band = "vip" if score >= vip_min else ...
  └─ returned in response as customer_value.band (same shape, different threshold)
```

**Downstream consumers affected**:
- POS team consumes `customer_value.band` in the cross-sell API response
- **POS contract impact**: If a restaurant changes `vip_score_min` from 80 → 70, previously "high" customers become "vip". POS UI that color-codes by band would show a different color. **This is intended behavior — the point of the CR.**
- No other internal CRM code reads `customer_value.band`

**Files touched**: `customer_intelligence.py`, `suggestions.py` (to pass settings)  
**Files NOT touched**: `routers/pos.py`, `core/whatsapp.py`, `routers/customers.py`  
**Risk**: LOW — pure computation change, no DB writes, POS contract shape unchanged

---

### F4 — VIP Auto-Promotion (Daily Cron)

**Hardcoded location**: Missing feature — `compute_customer_value()` computes "vip" band but never writes `customers.vip_flag`

**Data flow (new)**:
```
core/scheduler.py::daily_loyalty_jobs()  ← runs once daily at 00:00 UTC
  └─ for user_id, settings in all_users_with_settings:
       └─ [existing] run_birthday_bonus, run_anniversary_bonus, run_expiry_reminders ...
       └─ [NEW] run_vip_auto_promote(user_id, settings)
            └─ gate: if not settings.get("vip_auto_promote_enabled", False): return {promoted: 0}
            └─ threshold = settings.get("vip_auto_score_threshold", 80)
            └─ fetch all customers with total_visits >= 2 (stored fields only)
            └─ compute simplified 2-factor score per customer (spend + recency, no DB queries per customer)
            └─ customers with score >= threshold AND currently vip_flag=False → mark vip_flag=True
            └─ bulk_write UpdateMany (single DB call)
            └─ returns {promoted: N, evaluated: M}
```

**Why simplified score for daily batch (not full compute_customer_value)**:
- `compute_customer_value()` makes 2–3 DB queries per customer (orders collection for consistency + churn)
- For a restaurant with 5000 customers, that's 10,000–15,000 DB round-trips per daily cron
- Simplified score uses only stored `total_spent` + `last_visit` (no per-customer DB reads)
- Trade-off: less accurate score, but acceptable for a batch auto-promote job
- Full score available on-demand via POS suggestions endpoint

**vip_flag read surfaces (all existing — no change)**:
| File | Line | How it reads vip_flag |
|---|---|---|
| `core/helpers.py:324-326` | Segment filter `build_customer_query()` — "VIP: Yes" filter |
| `routers/customers.py:62` | Customer sort/tag option |
| `routers/customers.py:1016-1017` | Customer list filter query |
| `routers/pos.py:806, 1851` | Customer create defaults (always False for new POS customers) |

**vip_flag write surfaces (existing + new)**:
| File | How | Risk |
|---|---|---|
| `routers/customers.py:823, 1879` | Manual CRM edit (existing) | N/A |
| `routers/pos.py:806, 1851` | Customer create default False (existing) | N/A |
| **`core/loyalty_jobs.py` (NEW)** | Daily batch auto-promote | **MEDIUM — writes to customers** |

**Key risk**: If `vip_auto_promote_enabled=True`, the daily job will set `vip_flag=True` on customers the owner has NOT manually reviewed. This is the intended feature. Guard: defaulting to False means **zero impact** unless the owner explicitly flips the toggle.

**Also needed**: `cron.py::trigger_all_jobs()` (manual trigger endpoint) should also call `run_vip_auto_promote()` for consistency with the daily scheduler.

**Files touched**: `loyalty_jobs.py` (new function), `scheduler.py` (new call), `cron.py` (new call)  
**Files NOT touched**: `customers.py` CRUD, `pos.py`, `coupon.py`, `loyalty.py`, `auth.py`  
**Risk**: **MEDIUM** — only change that writes to `customers` collection. Gated by toggle, default OFF.

---

### F5 — Churn Risk Thresholds

**Hardcoded location**: `backend/core/customer_intelligence.py` lines 236–238

**Data flow**: Same pipeline as F3 — same function `compute_customer_value()`, same caller `suggestions.py`, same POS response. Handled by the same E-D edit as F3.

```
# Before
churn_risk = "high" if churn_score > 0.7 else "medium" if churn_score >= 0.4 else "low"
absolute_factor = min(days_since_last / 90.0, 1.0)   ← 90-day normalization hardcoded

# After
high_churn_min  = settings.get("churn_risk_high_min", 0.7)   ← optional per-tenant
med_churn_min   = settings.get("churn_risk_med_min", 0.4)    ← optional per-tenant
churn_risk = "high" if churn_score > high_churn_min else "medium" if churn_score >= med_churn_min else "low"
```

**Note**: The `90.0` in `absolute_factor = days_since_last / 90.0` should map to `dormant_days_end` from Block A. This is a hidden dependency across F1 and F5 — the churn absolute factor uses the same "90 days = churn" concept.

**Files touched**: `customer_intelligence.py` only (same edit as F3)  
**Risk**: LOW — pure computation, no DB writes, same file as F3

---

### F6 — High Spender Threshold

**Hardcoded location**: `backend/core/helpers.py` lines 282–291, frontend pages

**Q4 decision**: SIMPLE — add one `high_spender_threshold` field.  
**Scope**: This field powers the "High Spenders" Quick Audience chip in CR-076 Campaign Wizard. It does NOT change the existing ₹500/₹2K/₹5K/₹10K dropdown buckets (those remain for existing segment/filter UI).

**Data flow (new)**:
```
New endpoint or enrichment:
GET /api/loyalty/settings (existing)
  └─ returns high_spender_threshold (new field, default 5000)

CR-076 Campaign Wizard "High Spenders" chip:
  └─ reads settings.high_spender_threshold from loyalty_settings API
  └─ builds filter: {total_spent: {$gte: threshold}}
  └─ passes to build_customer_query as spent_min = threshold
```

**Existing bucket strings (NOT changing)**:
```
"0-500", "500-2000", "2000-5000", "5000-10000", "10000+"
→ AudiencesPage.jsx, CustomersPage.jsx, SegmentsPage.jsx
→ helpers.py build_customer_query spend bucket logic
All remain unchanged
```

**Files touched**: `models/schemas.py` (add field), `LoyaltySettingsPage.jsx` (show input)  
**Files NOT touched**: `helpers.py` existing spend bucket logic, `AudiencesPage.jsx`, `CustomersPage.jsx`, `SegmentsPage.jsx`  
**Risk**: LOW — new field only, existing filters unchanged

---

## Affected File Map — Full Picture

### Files WILL change

| File | Findings | What changes | Risk |
|---|---|---|---|
| `backend/models/schemas.py` | F1,F2,F3,F4,F5,F6 | Add 11 fields to LoyaltySettings + LoyaltySettingsUpdate | LOW |
| `backend/routers/analytics.py` | F1 | `get_stage_cutoffs(settings)` + `classify_customer_stage()` + 2 endpoint functions fetch settings | LOW |
| `backend/routers/campaigns.py` | F2 | Remove `DAILY_LIMIT=1000`, per-tenant lookup at 2 call sites | LOW |
| `backend/core/customer_intelligence.py` | F3, F5 | `compute_customer_value()` gets settings param; band + churn thresholds configurable | LOW |
| `backend/routers/suggestions.py` | F3, F5 | Fetch loyalty_settings; pass to `compute_customer_value()` | LOW |
| `backend/core/loyalty_jobs.py` | F4 | New `run_vip_auto_promote()` function | MEDIUM |
| `backend/core/scheduler.py` | F4 | Add `run_vip_auto_promote()` call in daily loop | MEDIUM |
| `backend/routers/cron.py` | F4 | Add `run_vip_auto_promote()` call in manual trigger | LOW |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | F1,F2,F3,F4,F5,F6 | New "Lifecycle & Engagement" section; new int/bool fields in save handler | LOW |

### Files WILL NOT change

| File | Why safe |
|---|---|
| `core/coupon.py` | No lifecycle/intelligence/VIP dependency |
| `core/loyalty.py` | Loyalty tier thresholds already configurable |
| `routers/pos.py` | `vip_flag` defaulting to False on create is correct — new customers should not auto-VIP |
| `routers/auth.py` | No dependency |
| `core/whatsapp.py` | No dependency |
| `routers/whatsapp.py` | No dependency |
| `routers/customers.py` | vip_flag CRUD is manual — unchanged |
| `core/campaign_jobs.py` | Scheduled campaigns bypass daily limit by design — unchanged |
| `core/helpers.py` | Existing bucket logic untouched; `high_spender_threshold` used only by new CR-076 chip |
| `AudiencesPage.jsx`, `CustomersPage.jsx`, `SegmentsPage.jsx` | Existing spend dropdowns unchanged |
| `models/schemas.py` customer models | No new customer fields — vip_flag already exists |

---

## Conflict Check — Open CRs

| CR | Status | Conflict with CR-077? |
|---|---|---|
| **CR-069** (campaigns.py) | IMPLEMENTED, QA pending | Touches WhatsApp send path, NOT DAILY_LIMIT area. **No conflict** |
| **CR-076** (lifecycle re-engage) | Registered, Q1-Q5 pending | **DEPENDENCY**: CR-076 needs `lifecycle_stage` filter in `build_customer_query`. That filter must use the configurable cutoffs from CR-077. CR-077 F1 should land FIRST or simultaneously. |
| **BUG-011** (campaigns.py) | Gate open | Touches campaign stats counters, NOT DAILY_LIMIT. **No conflict** |
| **CR-038** (campaign_jobs.py) | Parked | Touches `campaign_jobs.py` scheduler loop, NOT `campaigns.py::DAILY_LIMIT`. **No conflict** |
| **BUG-012** (frontend MessageStatus) | Gate open | Frontend only, unrelated. **No conflict** |

---

## Risk Summary

| Area | Risk | Key concern |
|---|---|---|
| Schema extension | LOW | Additive only — Pydantic defaults = current hardcoded values |
| F1 Lifecycle boundaries | LOW | + 1 DB read per analytics request; input validation needed |
| F2 Campaign daily limit | LOW | + 1 DB read per send; scheduled campaigns unaffected by design |
| F3 Customer value bands | LOW | POS band values change only if owner changes thresholds |
| **F4 VIP auto-promote** | **MEDIUM** | Only change that writes to `customers`; gated by `vip_auto_promote_enabled=False` |
| F5 Churn risk thresholds | LOW | Same file as F3, same risk profile |
| F6 High spender threshold | LOW | New field only; existing segment buckets unchanged |

**Overall CR risk: MEDIUM** — driven entirely by F4 (VIP write path). All other findings are LOW.

---

## One Non-Obvious Finding — F1/F5 Hidden Dependency

`_compute_churn_risk()` in `customer_intelligence.py` line 236:
```python
absolute_factor = min(days_since_last / 90.0, 1.0)
```

The `90.0` is the same "churned threshold" concept as `dormant_days_end` in F1. If a restaurant sets `dormant_days_end=60` (more aggressive churn definition), the `absolute_factor` normalization still uses 90. This means churn risk scores will be internally inconsistent.

**Recommendation**: Replace hardcoded `90.0` with `settings.get("dormant_days_end", 90)`.  
This is a **hidden dependency** not called out in INV-014 — discovered during data flow tracing.

---

## Verification Scope (for QA, not implementation plan)

9 verification items needed:
- V1: Default behavior unchanged (no settings update → identical stage counts)
- V2: Lifecycle boundary change flows correctly to stage counts + customer table
- V3: campaign_daily_limit change reflected in `GET /daily-limit` response
- V4: Daily limit gate uses per-tenant limit (not global 1000)
- V5: `compute_customer_value()` band changes with custom `vip_score_min`
- V6: `vip_auto_promote_enabled=False` → daily cron does nothing
- V7: `vip_auto_promote_enabled=True` → qualifying customers get `vip_flag=True`
- V8: LoyaltySettingsPage round-trip save/fetch works for all new fields
- V9: All existing loyalty/campaign tests pass (no regression)

---

## Planning Output

```
Planning complete: CR-077
Stage: Impact Analysis (Impact Analysis only — no implementation plan)
Code reality: FULL — all 9 affected files inspected with exact line numbers
Risk: MEDIUM (F4 VIP write path; all others LOW)
Files WILL change:  9 files (schemas, analytics, campaigns, customer_intelligence,
                    suggestions, loyalty_jobs, scheduler, cron, LoyaltySettingsPage)
Files WILL NOT touch: coupon, loyalty, pos, auth, whatsapp, customers CRUD,
                      campaign_jobs, helpers (existing buckets), 3 FE filter pages
Owner decisions: Q1–Q5 ALL LOCKED
Hidden dependency found: F5 absolute_factor uses hardcoded 90.0 — should map to dormant_days_end
CR dependency found: CR-076 lifecycle filter must consume CR-077 configurable cutoffs
Docs: planning/CR_077_IMPACT_ANALYSIS.md
Next: Owner approves → Implementation Plan → Owner approves plan → Implementation
```
