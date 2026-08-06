# CR-077 — QA Handover

**Date**: 2026-08-05  
**Role**: Implementation Agent → QA Agent  
**Status**: Code complete, self-tests PASS  
**Files changed**: 9  

---

## Implementation Summary

All 9 edits executed per plan. All defaults = previous hardcoded values — zero behavior change for tenants unless they actively update settings.

| Edit | File | Status |
|---|---|---|
| E-A | `models/schemas.py` | ✅ 11 new fields on LoyaltySettings + LoyaltySettingsUpdate |
| E-B | `routers/analytics.py` | ✅ `get_stage_cutoffs(settings)` + classify + 2 endpoints fetch settings |
| E-C | `routers/campaigns.py` | ✅ Removed `DAILY_LIMIT=1000`, per-tenant lookup at 2 sites |
| E-D | `core/customer_intelligence.py` | ✅ Configurable bands + hidden dependency fix (`90.0` → `dormant_days_end`) |
| E-E | `routers/suggestions.py` | ✅ Fetches settings + passes to `compute_customer_value()` |
| E-F | `core/loyalty_jobs.py` | ✅ New `run_vip_auto_promote()` |
| E-G | `core/scheduler.py` | ✅ VIP job in daily cron loop |
| E-H | `routers/cron.py` | ✅ VIP job in manual trigger |
| E-I | `LoyaltySettingsPage.jsx` | ✅ "Lifecycle & Engagement" section |

---

## Self-Test Results

| V# | Test | Result |
|---|---|---|
| V1 | `GET /loyalty/settings` → all 11 new fields with defaults | ✅ PASS |
| V2 | `GET /analytics/customer-lifecycle` → stage counts working | ✅ PASS (new:19, active:4, at_risk:4, dormant:224, churned:2021) |
| V3 | `GET /campaigns/daily-limit` → returns 1000 (default) | ✅ PASS |
| V4 | Change `dormant_days_end=60` → churned increases (224→2245 shift) | ✅ PASS |
| V5 | Change `campaign_daily_limit=500` → `/daily-limit` returns 500 | ✅ PASS |
| V6 | `vip_auto_promote_enabled=False` → `{promoted:0, skipped_toggle_off:True}` | ✅ PASS |
| V7 | `vip_auto_promote_enabled=True` → 2 customers promoted, 264 evaluated | ✅ PASS |

---

## Test Credentials

| Account | Password | Tenant |
|---|---|---|
| owner@kunafamahal.com | Qplazm@10 | Kunafa Mahal (primary test) |
| owner@hungry.com | Qplazm@10 | Hungry Keya |
| owner@palmhouse.com | Qplazm@10 | Palm House (hotel) |

---

## QA Checklist

### Backend (all via API)

| # | Test | How | Expected |
|---|---|---|---|
| T1 | All 11 new fields return with correct defaults | `GET /api/loyalty/settings` | at_risk_days_start=31, at_risk_days_end=60, dormant_days_end=90, new_customer_max_visits=1, campaign_daily_limit=1000, vip_score_min=80, high_score_min=60, medium_score_min=35, vip_auto_promote_enabled=false, vip_auto_score_threshold=80, high_spender_threshold=5000 |
| T2 | Settings round-trip save | `PUT /api/loyalty/settings {"at_risk_days_start":40}` → `GET` | Returns `at_risk_days_start=40` |
| T3 | Lifecycle boundary change | Set `dormant_days_end=60` → `GET /analytics/customer-lifecycle` | Dormant count drops, churned increases vs default |
| T4 | Stage boundary restored | Restore `dormant_days_end=90` → counts match original | Stage counts identical to pre-change |
| T5 | Per-tenant daily limit | Set `campaign_daily_limit=500` → `GET /campaigns/daily-limit` | `{"limit": 500, ...}` |
| T6 | Daily limit restored | Restore `campaign_daily_limit=1000` | `{"limit": 1000, ...}` |
| T7 | VIP toggle OFF | `POST /api/cron/trigger` with toggle=false | `vip_auto_promote: {promoted:0, skipped_toggle_off:true}` |
| T8 | VIP toggle ON | Enable toggle → `POST /api/cron/trigger` | `vip_auto_promote: {evaluated:N, promoted:M}` where M >= 0 |
| T9 | VIP toggle OFF restored | Disable toggle → `PUT /api/loyalty/settings {"vip_auto_promote_enabled":false}` | Toggle saved as False |
| T10 | lifecycle_customers API | `GET /analytics/customer-lifecycle/customers?stage=churned` | Returns customers with >90 days inactive |
| T11 | Suggestions API unaffected | POS: `POST /api/suggestions/customer-intelligence` (if POS available) | `customer_value.band` still returns valid band |

### Frontend

| # | Test | How | Expected |
|---|---|---|---|
| T12 | LoyaltySettingsPage loads without error | Open Settings → Loyalty | No console error, all sections visible |
| T13 | "Lifecycle & Engagement" section visible | Scroll to Loyalty Settings | New section below "Tier Thresholds" |
| T14 | At Risk starts field present | Check `data-testid="at-risk-days-start-input"` | Input shows 31 |
| T15 | Dormant starts field present | Check `data-testid="at-risk-days-end-input"` | Input shows 60 |
| T16 | Churned starts field present | Check `data-testid="dormant-days-end-input"` | Input shows 90 |
| T17 | Campaign daily limit field | Check `data-testid="campaign-daily-limit-input"` | Input shows 1000 |
| T18 | High spender threshold field | Check `data-testid="high-spender-threshold-input"` | Input shows 5000 |
| T19 | VIP auto-promote toggle | Check `data-testid="vip-auto-promote-toggle"` | Toggle shows OFF |
| T20 | VIP score threshold hidden when OFF | Toggle is OFF | Score threshold input NOT visible |
| T21 | VIP score threshold shows when ON | Enable toggle | Score threshold input appears |
| T22 | Save settings | Change At Risk=40 → Save | Toast success; `GET /loyalty/settings` returns 40 |

---

## Regression Checks

- All existing loyalty cron jobs (birthday, anniversary, expiry, inactive) must still run without error
- Campaign daily limit check still blocks sends exceeding limit
- Lifecycle page stage counts same as before with default settings
- VIP flag manual set/unset via customer edit still works
- `GET /campaigns/daily-limit` still returns correct shape `{limit, used, remaining}`

---

## Files Changed

```
backend/models/schemas.py
backend/routers/analytics.py
backend/routers/campaigns.py
backend/core/customer_intelligence.py
backend/routers/suggestions.py
backend/core/loyalty_jobs.py
backend/core/scheduler.py
backend/routers/cron.py
frontend/src/pages/LoyaltySettingsPage.jsx
```

## Files NOT Changed

`core/coupon.py` · `core/loyalty.py` · `routers/pos.py` · `routers/auth.py` ·  
`core/whatsapp.py` · `routers/whatsapp.py` · `routers/customers.py` · `core/campaign_jobs.py`
