# CR-077 — Configurable Lifecycle & Intelligence Thresholds (Per-Tenant)

**Type**: Feature Enhancement — Configuration  
**ID**: CR-077  
**Date**: 2026-08-05  
**Reporter**: Owner (verbal, 2026-08-05 session)  
**Intake Agent**: E1 — Emergent Labs  
**Source Investigation**: INV-014 (2026-08-05) · cross-references INV-003 (2026-07-01)  
**Severity**: P2 — Important business value gap; workaround exists (app functions with global defaults)  
**Risk**: MEDIUM — Additive schema extension; no financial/POS/coupon/auth logic touched  
**Duplicate check**: DISTINCT — CR-027 (CLOSED) moved hardcoded URLs to `.env`; this CR moves hardcoded business thresholds to per-tenant DB config  
**Blast radius**: MEDIUM — 6 backend files + 3 frontend pages; no CRITICAL hotspot files touched

---

## 1. Owner Request (verbatim)

> "For one particular restaurant, the VIP customer or high-spend customer is ₹5,000; for someone else it may be ₹10,000. So all these variables are hardcoded right now. Can you do a deep investigation and see what all values are hardcoded and if we can move to configuration?"

---

## 2. Findings Summary (from INV-014)

7 confirmed hardcoded areas, all code-verified:

| # | Finding | Hardcoded Value | File | Impact |
|---|---|---|---|---|
| F1 | Lifecycle stage boundaries | At Risk=31-60d, Dormant=61-90d, Churned=90+d, New=≤1 visit | `analytics.py:483` | ALL tenants — drives entire Lifecycle page + campaign audience |
| F2 | Campaign daily WhatsApp limit | `DAILY_LIMIT = 1000` | `campaigns.py:29` | ALL tenants — single global constant |
| F3 | Customer value band thresholds | VIP≥80, High≥60, Medium≥35 (composite score) | `customer_intelligence.py:185` | All POS tenants |
| F4 | VIP never auto-promoted | Intelligence score `band="vip"` computed but **never written to `customers.vip_flag`** | `customer_intelligence.py:185` | ALL tenants — "VIP Customers" audience chip shows only manually-flagged customers |
| F5 | Churn risk thresholds | High>0.7, Medium≥0.4 | `customer_intelligence.py:238` | All POS tenants |
| F6 | Spend filter bucket labels | ₹0-500, ₹500-2K, ₹2K-5K, ₹5K-10K, ₹10K+ | `helpers.py:282` + 3 FE pages | ALL tenants — misleading for high-AOV restaurants |
| F7 | Visit/points/wallet buckets | 1-5, 6-10, 10+ · low/mid/high | `helpers.py:270-452` + 3 FE pages | Medium priority |

---

## 3. What Is Already Configurable (no change needed)

| Config | Storage | UI | Status |
|---|---|---|---|
| Loyalty tier point thresholds (Silver/Gold/Platinum min points) | `loyalty_settings.tier_silver/gold/platinum_min` | LoyaltySettingsPage | ✅ Done |
| Tier earn percentages | `loyalty_settings.*_earn_percent` | LoyaltySettingsPage | ✅ Done |
| Birthday / anniversary bonus points | `loyalty_settings.*_bonus_points/days` | LoyaltySettingsPage | ✅ Done |
| Points expiry months | `loyalty_settings.points_expiry_months` | LoyaltySettingsPage | ✅ Done |
| Min order value for points | `loyalty_settings.min_order_value` | LoyaltySettingsPage | ✅ Done |

The same pattern (`loyalty_settings` document per tenant) is the right place to extend.

---

## 4. Proposed New Configuration Fields

All stored in `loyalty_settings` collection (one document per tenant). Defaults = current hardcoded values so existing behavior is preserved on upgrade.

### Block A — Lifecycle Stage Boundaries

```python
# Days-inactive boundaries for lifecycle classification
at_risk_days_start: int = 31    # last_visit > this = At Risk begins
at_risk_days_end: int = 60      # last_visit > this = Dormant begins
dormant_days_end: int = 90      # last_visit > this = Churned begins
new_customer_max_visits: int = 1  # visits ≤ this = "New" (not "Active")
```

**Reads at**: `analytics.py::get_stage_cutoffs()` — pass `settings` into function; use `settings.at_risk_days_start` etc. instead of hardcoded 30/60/90.

### Block B — Campaign Daily Limit

```python
campaign_daily_limit: int = 1000   # max WhatsApp sends per day (per tenant)
```

**Reads at**: `campaigns.py:29` — replace `DAILY_LIMIT = 1000` with per-user lookup from `loyalty_settings`.

### Block C — Customer Value Band Thresholds

```python
vip_score_min: int = 80     # intelligence composite score ≥ this = VIP band
high_score_min: int = 60    # composite ≥ this = High band
medium_score_min: int = 35  # composite ≥ this = Medium band
```

**Reads at**: `customer_intelligence.py:185` — pass settings into `compute_customer_value()`.

### Block D — VIP Auto-Promotion

```python
vip_auto_promote_enabled: bool = False  # if True, daily job sets vip_flag=True on qualifying customers
vip_auto_score_threshold: int = 80      # intelligence score ≥ this triggers auto-promotion
vip_auto_demote_enabled: bool = False   # if True, also removes vip_flag when score drops below threshold
```

**Reads at**: `core/loyalty_jobs.py` daily cron — new job block after birthday/anniversary loop.

### Block E — Audience Quick-Access Threshold

```python
high_spender_threshold: int = 5000   # ₹ total_spent for "High Spenders" audience chip in Campaign Wizard
```

**Reads at**: `/api/analytics/customer-lifecycle` response (included in settings for frontend) + `build_customer_query()` when `filters["audience_type"] == "high_spender"`.

---

## 5. Files WILL Change

| File | Change | Risk |
|---|---|---|
| `models/schemas.py` | Add 10 new fields to `LoyaltySettings` + `LoyaltySettingsUpdate` | LOW — additive only |
| `routers/analytics.py` | `get_stage_cutoffs()` accepts optional `settings` dict; reads Block A fields | LOW |
| `routers/campaigns.py` | Replace `DAILY_LIMIT = 1000` with per-tenant lookup from `loyalty_settings` | LOW |
| `core/customer_intelligence.py` | `compute_customer_value()` accepts `settings` dict; reads Block C fields | LOW |
| `core/loyalty_jobs.py` | Add daily VIP auto-promotion loop (if `vip_auto_promote_enabled=True`) | MEDIUM — writes to customers |
| `core/helpers.py` | `build_customer_query()` reads `high_spender_threshold` from settings for `audience_type` chip | LOW |
| `frontend/src/pages/LoyaltySettingsPage.jsx` | New "Lifecycle & Engagement" section with Block A–E inputs | LOW |
| `frontend/src/pages/AudiencesPage.jsx` *(optional — Phase 2)* | Dynamic spend bucket labels using `high_spender_threshold` | LOW |

## 5. Files WILL NOT Change

`core/coupon.py`, `core/loyalty.py`, `routers/pos.py`, `routers/auth.py`, `routers/whatsapp.py`, `routers/customers.py` (main CRUD), `models/schemas.py` (customer fields unchanged — only loyalty_settings), any POS/invoice/payment logic.

---

## 6. Risk Assessment Per Change

| Change | Risk level | Why |
|---|---|---|
| Schema extension (loyalty_settings) | LOW | Additive only — existing docs get default values via Pydantic fallbacks |
| Lifecycle boundary reads | LOW | Pure computation change — no DB writes, no API contract change |
| Campaign daily limit per tenant | LOW — MEDIUM | Requires DB lookup on every campaign send; caching recommended |
| Value band thresholds | LOW | `compute_customer_value` is read-only against DB |
| VIP auto-promotion daily job | MEDIUM | Writes `vip_flag=True/False` on customers — financial/CRM impact; requires owner approval + "never-downgrade guard" option |
| Spend bucket dynamic labels | LOW | Frontend-only display change |

**No CRITICAL risk** — no coupon math, no loyalty points calculation, no auth, no POS order ingestion touched.

---

## 7. Owner Decisions Required (Q1–Q5)

**These must be answered before Planning Agent can start. Defaults shown in brackets.**

| Q | Question | Options | Default if no answer |
|---|---|---|---|
| **Q1** | Lifecycle boundaries: where to configure them? | (a) New "Lifecycle Settings" card in LoyaltySettingsPage · (b) New standalone "CRM Settings" page · (c) As part of SettingsPage (WhatsApp/POS card area) | (a) LoyaltySettingsPage |
| **Q2** | Campaign daily limit: per-tenant or raise global cap? | (a) Per-tenant via settings (restaurant A = 1000, restaurant B = 5000) · (b) Raise global cap to e.g. 5000 for all | (a) Per-tenant |
| **Q3** | VIP auto-promotion from intelligence score | (a) Yes — enable auto-promote toggle; if score ≥ threshold, vip_flag = true (daily cron) · (b) Yes auto-promote AND auto-demote when score drops · (c) No — keep manual-only (current behavior) | Owner must answer — this writes customer data |
| **Q4** | Spend filter bucket labels | (a) Add a single "High Spender threshold" setting that adjusts the top bucket label (₹X,000+) · (b) Fully dynamic buckets — owner sets all 5 breakpoints (complex) · (c) Leave display labels hardcoded (simple) | (a) Single threshold only |
| **Q5** | Phase priority — what to ship in Phase 1? | (a) F1+F2 only (lifecycle days + daily limit) — 2 hrs · (b) F1+F2+F4 VIP auto-promote — 4 hrs · (c) All F1-F6 together — 8 hrs | (a) F1+F2 first |

---

## 8. Phased Implementation Plan (Recommended)

### Phase 1 — Core (F1 + F2 + F3 + Block E): ~3 hrs, LOW risk
- Add 7 fields to LoyaltySettings schema (Block A + B + C + E)
- Migrate `analytics.py::get_stage_cutoffs()` to read from settings
- Migrate `campaigns.py::DAILY_LIMIT` to per-tenant
- Migrate `customer_intelligence.py` band thresholds to read from settings
- Add "Lifecycle & Engagement" card on LoyaltySettingsPage

### Phase 2 — VIP Auto-Promotion (F4): ~2 hrs, MEDIUM risk
- Add Block D fields to schema
- Add daily cron job in `loyalty_jobs.py` for auto-VIP-promotion
- Requires separate owner approval gate (writes to customer records)

### Phase 3 — Spend Bucket Labels (F6 + F7): ~1.5 hrs, LOW risk
- Dynamic spend bucket labels in AudiencesPage/CustomersPage/SegmentsPage
- Driven by `high_spender_threshold` from settings

---

## 9. Evidence

| Evidence | Source |
|---|---|
| `analytics.py:483-516` — lifecycle boundaries hardcoded | INV-014 Step 1 |
| `campaigns.py:29` — `DAILY_LIMIT = 1000` | INV-014 Step 1 |
| `customer_intelligence.py:179-185` — band thresholds hardcoded | INV-014 Step 3 |
| `customer_intelligence.py` — `vip_flag` never written | INV-014 Step 4 |
| `helpers.py:282-452` — spend/visit/points bucket ranges | INV-014 Step 2 |
| `AudiencesPage.jsx:476-480` — FE labels hardcoded | INV-014 Step 2 |
| `models/schemas.py:998-1056` — LoyaltySettings confirmed, no lifecycle fields | INV-014 Step 4 |
| INV-003 (2026-07-01) — "VIP phantom feature" previously reported | Cross-reference |

---

## 10. Intake Output

```
Intake complete: CR-077
Classification: FEATURE ENHANCEMENT — per-tenant business threshold configuration
Severity: P2 — important value gap; app works with global defaults as workaround
Risk: MEDIUM (additive schema extension; VIP auto-promote is MEDIUM risk write path)
Duplicate check: DISTINCT
  - CR-027 (CLOSED): moved hardcoded URLs to .env — different problem
  - INV-003 (2026-07-01): surfaced VIP phantom — subsumed into this CR
Evidence: INV-014 report (7 findings, all code-confirmed with file + line)
Blast radius: MEDIUM — 6 backend files + 3 FE pages; 0 CRITICAL hotspot files
Docs updated:
  - discovery/CR_077_CONFIGURABLE_THRESHOLDS_INTAKE.md  (this file)
  - Referenced: investigations/INV_014_HARDCODED_THRESHOLDS.md
Next: Owner answers Q1–Q5 → Planning Agent → Implementation (Phase 1 → Phase 2 → Phase 3)
```
