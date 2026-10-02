# INV-014 — Hardcoded Business Thresholds Investigation

**Date**: 2026-08-05  
**Role**: Investigation Agent  
**Reporter**: Owner (verbal)  
**Assigned ID**: INV-014  
**Step budget used**: 9/10  
**Confidence**: HIGH — all findings are code-confirmed with exact file + line

---

## Owner Report

> "For one particular restaurant, the VIP customer or high-spend customer is ₹5,000; for someone else it may be ₹10,000. So all these variables are hardcoded right now. Can you do a deep investigation and see what all values are hardcoded and if we can move to configuration?"

---

## Investigation Scope

Searched across:
- `/app/backend/routers/analytics.py`
- `/app/backend/routers/campaigns.py`
- `/app/backend/core/helpers.py`
- `/app/backend/core/customer_intelligence.py`
- `/app/backend/models/schemas.py`
- `/app/frontend/src/pages/` (AudiencesPage, CustomersPage, SegmentsPage, CustomerLifecyclePage)

---

## Findings

### FINDING 1 — Lifecycle Stage Day Boundaries (CRITICAL, affects every restaurant)

**File**: `backend/routers/analytics.py` lines 483–516  
**Type**: PLAN_GAP — no per-tenant config exists

```python
def get_stage_cutoffs():
    now = datetime.now(timezone.utc)
    return {
        "thirty_days_ago":  (now - timedelta(days=30)).isoformat(),   # HARDCODED
        "sixty_days_ago":   (now - timedelta(days=60)).isoformat(),   # HARDCODED
        "ninety_days_ago":  (now - timedelta(days=90)).isoformat(),   # HARDCODED
    }

def classify_customer_stage(customer, cutoffs):
    if last_visit >= cutoffs["thirty_days_ago"]:
        return "new" if total_visits <= 1 else "active"   # 1 visit threshold: HARDCODED
    elif last_visit >= cutoffs["sixty_days_ago"]:
        return "at_risk"    # 31–60 days: HARDCODED
    elif last_visit >= cutoffs["ninety_days_ago"]:
        return "dormant"    # 61–90 days: HARDCODED
    else:
        return "churned"    # 90+ days:   HARDCODED
```

**Impact**: A QSR café (daily visits) has different churn patterns than a fine-dining restaurant (weekly visits). 
- Café: 30 days inactive = churned. Fine-dining: 45 days inactive = still loyal.
- These 4 boundaries drive the entire Lifecycle page, bulk Re-engage logic, AND campaign audience filtering.

---

### FINDING 2 — Campaign WhatsApp Daily Send Limit (HIGH)

**File**: `backend/routers/campaigns.py` line 29  
**Type**: PLAN_GAP

```python
DAILY_LIMIT = 1000   # HARDCODED module-level constant
```

**Used at**: lines 271, 610–614. Single global constant for ALL tenants.  
**Impact**: A restaurant with 200 customers hits 0% of this limit. A chain with 50,000 customers is severely throttled.

---

### FINDING 3 — Customer Value Band Thresholds (HIGH)

**File**: `backend/core/customer_intelligence.py` line 185  
**Type**: PLAN_GAP

```python
band = (
    "vip"    if composite >= 80 else    # HARDCODED
    "high"   if composite >= 60 else    # HARDCODED
    "medium" if composite >= 35 else    # HARDCODED
    "low"                               # HARDCODED
)
```

**Scoring weights also hardcoded** (lines 179–182):
```python
composite = (
    0.30 * spend_score   +   # 30% weight: HARDCODED
    0.25 * freq_score    +   # 25% weight: HARDCODED
    0.20 * recency_score +   # 20% weight: HARDCODED
    0.15 * aov_score     +   # 15% weight: HARDCODED
    0.10 * consistency_score # 10% weight: HARDCODED
)
```

**Impact**: For a hotel restaurant where one banquet booking = ₹2 lakh, spend weight 30% is too low.

---

### FINDING 4 — VIP Flag: Manual-Only, No Auto-Promotion (HIGH)

**Files**: `models/schemas.py` line 318, `customer_intelligence.py` line 185  
**Type**: PLAN_GAP — two parallel VIP systems that don't talk to each other

**System A** — `customers.vip_flag` (boolean):
- Set ONLY manually by staff via Edit Customer modal
- Used in all segment filters, audience chips, exports
- Never updated automatically

**System B** — `customer_intelligence.band = "vip"` (computed):
- Computed dynamically in `compute_customer_value()` when POS queries `customer-lookup`
- Returns `band="vip"` when composite score >= 80
- **This result is never written back to `customers.vip_flag`**
- Owner has no way to auto-promote high-scoring customers to VIP

**Reality**: `vip_flag=True` exists on exactly the customers a staff member manually clicked "Mark as VIP". Computed intelligence scores are silently discarded.

---

### FINDING 5 — Churn Risk Score Thresholds (MEDIUM)

**File**: `backend/core/customer_intelligence.py` lines 236–238  
**Type**: PLAN_GAP

```python
absolute_factor = min(days_since_last / 90.0, 1.0)   # 90-day max: HARDCODED
# ...
churn_risk = (
    "high"   if churn_score > 0.7 else    # HARDCODED
    "medium" if churn_score >= 0.4 else   # HARDCODED
    "low"
)
```

**Impact**: Churn risk thresholds affect `win_back_recommendation`. Shown to POS via customer-lookup API.

---

### FINDING 6 — Spend Filter Buckets in Audience/Segment/Customer Pages (MEDIUM)

**Files**: `frontend/src/pages/AudiencesPage.jsx` lines 476–480, `SegmentsPage.jsx` lines 1396–1399, `CustomersPage.jsx` lines 1136–1139  
**Also**: `backend/core/helpers.py` lines 282–291  
**Type**: PLAN_GAP — frontend labels + backend range logic both hardcoded

```python
# backend/core/helpers.py
if total_spent_filter == "0-500":     query["total_spent"] = {"$lt": 500}       # HARDCODED
elif total_spent_filter == "500-2000": query["total_spent"] = {"$gte": 500, "$lte": 2000}  # HARDCODED
elif total_spent_filter == "2000-5000"                                           # HARDCODED
elif total_spent_filter == "5000-10000"                                          # HARDCODED
elif total_spent_filter == "10000+"                                              # HARDCODED
```

```jsx
// AudiencesPage.jsx
<SelectItem value="0-500">Under ₹500</SelectItem>        {/* HARDCODED */}
<SelectItem value="500-2000">₹500 – 2,000</SelectItem>   {/* HARDCODED */}
<SelectItem value="2000-5000">₹2,000 – 5,000</SelectItem>{/* HARDCODED */}
<SelectItem value="5000-10000">₹5,000 – 10,000</SelectItem>{/* HARDCODED */}
<SelectItem value="10000+">₹10,000+</SelectItem>          {/* HARDCODED */}
```

**Impact**: For a hotel restaurant average spend ₹8,000 — "₹500 – 2,000" is an almost-useless bucket covering only budget diners.

---

### FINDING 7 — Visit Count / Points / Wallet Filter Buckets (LOW-MEDIUM)

**File**: `backend/core/helpers.py` lines 270–278, 432–452  
**Also**: `AudiencesPage.jsx`, `CustomersPage.jsx`, `SegmentsPage.jsx`

| Filter | Buckets | Hardcoded |
|---|---|---|
| Visit count | 0, 1-5, 6-10, 10+ | YES |
| Total points earned | low (≤100), mid (101–500), high (501–2000), very_high (2000+) | YES |
| Wallet balance | zero, low (₹1–500), mid (₹500–2000), high (>₹2000) | YES |
| Coupon used | 0, 1-5, 6+ | YES |

**Impact**: Moderate. Owners have numeric range fields as an escape hatch (e.g., `points_min` / `points_max`), but bucket labels are misleading for high-volume restaurants.

---

## What IS Configurable Today (for completeness)

| Config | Where | Notes |
|---|---|---|
| Tier thresholds (Silver/Gold/Platinum points) | `loyalty_settings.tier_silver_min/gold_min/platinum_min` | Fully configurable + exposed in LoyaltySettingsPage UI ✅ |
| Tier earn percentages | `loyalty_settings.bronze/silver/gold/platinum_earn_percent` | Configurable ✅ |
| Birthday/anniversary bonus points | `loyalty_settings.*_bonus_points` | Configurable ✅ |
| Points expiry months | `loyalty_settings.points_expiry_months` | Configurable ✅ |
| Min order value for points | `loyalty_settings.min_order_value` | Configurable ✅ |
| Off-peak hours + bonus | `loyalty_settings.off_peak_*` | Configurable ✅ |

---

## Root Cause

**Classification**: PLAN_GAP × 2 layers:

1. **No "Lifecycle & Intelligence Settings" config model** — the `loyalty_settings` collection captures loyalty economics well but has zero fields for lifecycle stage boundaries, VIP thresholds, or daily campaign limits.

2. **`customer_intelligence.py` computes per-restaurant relative scores** but applies globally hardcoded band thresholds — the relative scoring (spend vs max_spend in that restaurant) is smart, but the band cutoffs (80/60/35) are not.

---

## Proposed Configuration Model

New fields to add to `loyalty_settings` (all with sensible defaults = current hardcoded values):

```python
# ── Lifecycle Stage Boundaries ──────────────────────────────────
at_risk_days_start: int = 31      # days inactive → At Risk begins
at_risk_days_end: int = 60        # days inactive → At Risk ends / Dormant begins
dormant_days_end: int = 90        # days inactive → Dormant ends / Churned begins
new_customer_max_visits: int = 1  # visits ≤ this = "New" (not "Active")

# ── Audience / Segment Thresholds ───────────────────────────────
high_spender_threshold: int = 5000       # ₹ total_spent for "High Spender" quick audience
vip_auto_score_threshold: Optional[int] = None  # if set, auto-flag customers as VIP when intelligence score ≥ this
campaign_daily_limit: int = 1000         # max WhatsApp sends per day

# ── Customer Value Band Thresholds ──────────────────────────────
vip_score_min: int = 80     # composite intelligence score ≥ this = VIP band
high_score_min: int = 60    # composite ≥ this = High band
medium_score_min: int = 35  # composite ≥ this = Medium band
```

---

## Impact Summary

| Finding | Files affected | Tenant impact | Fix complexity |
|---|---|---|---|
| F1 — Lifecycle day boundaries | `analytics.py` (backend) | ALL tenants | LOW — read from settings |
| F2 — Campaign daily limit | `campaigns.py` (backend) | ALL tenants | LOW — read from settings |
| F3 — Value band thresholds | `customer_intelligence.py` | ALL POS tenants | LOW — pass thresholds |
| F4 — VIP no auto-promotion | `customer_intelligence.py` + daily cron | ALL tenants | MEDIUM — needs daily job |
| F5 — Churn risk thresholds | `customer_intelligence.py` | ALL POS tenants | LOW — read from settings |
| F6 — Spend buckets | `helpers.py` + 3 FE pages | Cosmetic but confusing | MEDIUM — dynamic labels |
| F7 — Visit/points/wallet buckets | `helpers.py` + 3 FE pages | Low priority | MEDIUM — dynamic labels |

---

## Recommendation

**Priority order for Planning Agent:**

| Order | Item | Why first |
|---|---|---|
| 1 | **F1 + F2** (lifecycle days + daily limit) | Highest owner impact, lowest risk, 1 new settings section |
| 2 | **F4** (VIP auto-promotion) | Directly addresses owner's "VIP threshold" complaint |
| 3 | **F3 + F5** (intelligence band thresholds) | POS-side impact, configurable per restaurant type |
| 4 | **F6** (spend buckets) | Medium complexity — dynamic labels need FE + BE sync |
| 5 | **F7** (visit/points/wallet buckets) | Low priority — numeric range inputs exist as workaround |

---

## Output

```
Investigation complete: INV-014
Root cause: PLAN_GAP — no "Lifecycle & Intelligence Settings" model; 
            loyalty_settings covers economics but not engagement thresholds.
            customer_intelligence.py uses per-restaurant relative scoring 
            but hardcodes band boundaries.
Classification: BE/FE — business configuration gap
Confidence: HIGH
Steps used: 9/10
Evidence:
  - analytics.py:483-516 (lifecycle boundaries hardcoded)
  - campaigns.py:29 (DAILY_LIMIT = 1000)
  - customer_intelligence.py:179-185 (band thresholds hardcoded, never written to vip_flag)
  - helpers.py:282-452 (spend/visit/points bucket ranges hardcoded)
  - AudiencesPage.jsx:476-480 + SegmentsPage.jsx:1396-1399 (FE labels hardcoded)
  - models/schemas.py:998-1056 (LoyaltySettings confirmed — no lifecycle fields)
Recommendation: Register as CR-077 "Configurable Lifecycle & Intelligence Thresholds"
                Planning Agent → extend loyalty_settings schema + migrate call sites
Report: memory/crm/crm_roi_sprint/discovery/INV_014_HARDCODED_THRESHOLDS.md
```
