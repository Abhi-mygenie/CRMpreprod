# CR-078 — POS Customer Intelligence Report API — Intake Doc

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Branch**: main (Abhi-mygenie/CRMpreprod)
**DB**: Remote MongoDB 52.66.232.149:27017/mygenie (live preprod)

---

## 1. Owner Request (verbatim)

> "So basically now in the POS, we want to build a report about the customer intelligence.
> So is there any API which we can expose? Is there any endpoint which we can expose aggregated endpoint?
> 'Cause right now POS has one-to-one, right? Lookup. It doesn't have aggregated endpoint for the reports."

---

## 2. Classification

| Field | Value |
|---|---|
| **Type** | CR — new feature |
| **Subtype** | POS-facing aggregated report API |
| **Severity** | P2 — important capability gap; workaround: POS team can use CRM dashboard directly |
| **Risk** | MEDIUM |
| **Effort estimate** | ~3–4 hrs (all 5 endpoints), ~1.5 hrs (Phase 1 subset) |
| **Phase** | 📋 Registered — awaiting owner Q1–Q3 before planning |

---

## 3. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| POS-CRM Cross-Sell Upsell API (register row 3) | RELATED, DISTINCT | Cross-sell is per-customer, per-cart. CR-078 is restaurant-wide aggregated reports. Different consumers, different payload, zero overlap. |
| CR-003 Coupon Analytics Dashboard | RELATED, DISTINCT | CR-003 is CRM JWT auth, CRM frontend. CR-078 is POS X-API-Key auth, consumed by POS reporting system. |
| `routers/analytics.py` existing endpoints | RELATED, DISTINCT | Analytics router uses `get_current_user` (CRM JWT). POS cannot call it. CR-078 re-exposes equivalent data under `verify_pos_auth` (X-API-Key). |

**Result: DISTINCT — no duplicate. Proceed as CR-078.**

---

## 4. Code Reality Check

### What exists (confirmed by direct code read)

| Location | What it has | Usable for CR-078? |
|---|---|---|
| `routers/pos.py` (2929 LOC) | 15+ endpoints — all one-to-one per-order or per-customer | ❌ Zero aggregate routes |
| `core/customer_intelligence.py` | `_get_restaurant_stats()` — restaurant-wide benchmarks (max_spend, avg_spend, avg_visits, avg_AOV) | ✅ Can be reused or duplicated into pipeline |
| `core/customer_intelligence.py` | `compute_customer_value()` — composite score 0–100, band, churn_risk | ⚠️ Per-customer loop + DB calls — NOT bulk-safe |
| `core/customer_intelligence.py` | `compute_order_patterns()`, `compute_cross_sell()` | ✅ Can call directly for E5 (single-customer enriched lookup) |
| `routers/analytics.py` | `get_customer_lifecycle_summary()`, `get_stage_cutoffs()` | ✅ Logic reusable — copy `get_stage_cutoffs()` or import |
| `services/analytics_service.py` | `get_customer_health_stats()`, `get_order_stats()`, `get_revenue_split()` | ✅ Pipeline patterns reusable |

**Code reality: NONE for POS aggregated report endpoints.**

---

## 5. Severity

**P2** — No production breakage. POS report screen is a net-new feature, not a regression.
CR-067 (MEDIUM, whatsapp.py hotspot) and CR-068 (LOW, frontend-only) remain higher priority and should proceed first.

---

## 6. Risk Assessment

**MEDIUM**

| Factor | Detail |
|---|---|
| Files changed | `routers/pos_reports.py` (new, ~200–250 LOC) + `server.py` (+1 line) |
| Existing code touched | NONE |
| DB writes | NONE — read-only |
| Collections read | `customers`, `orders`, `order_items`, `loyalty_settings`, `coupon_usage` |
| Why not LOW | Large collections; aggregation pipelines without proper indexes can be slow or impact live preprod |
| Why not HIGH | No writes. No changes to coupon/loyalty/WhatsApp/auth/invoice logic. No schema changes. No hotspot files (addendum §7) touched. |
| Auth | `verify_pos_auth` (X-API-Key) — identical to all existing POS endpoints. No new auth surface. |
| Fast Lane | Not eligible — multi-endpoint new file |

---

## 7. Proposed Endpoints

Five endpoints. Owner answers Q1 to select Phase 1 scope.

### E1 — `GET /api/pos/reports/summary`
One-call restaurant intelligence dashboard.

```json
{
  "as_of": "<ISO>",
  "customers": { "total": 1240, "active_30d": 387, "new_7d": 42, "churn_risk_high": 91 },
  "lifecycle": { "new": 112, "active": 275, "at_risk": 198, "dormant": 143, "churned": 512 },
  "tiers": { "bronze": 890, "silver": 245, "gold": 87, "platinum": 18 },
  "value_bands": { "vip": 34, "high": 156, "medium": 310, "low": 740 },
  "revenue": { "total": 4820000, "avg_order_value": 687.3, "avg_order_value_30d": 712.1 },
  "loyalty": { "orders_with_redemption_pct": 18.4, "points_outstanding": 128500 }
}
```
Source: `customers`, `orders`, `loyalty_settings` — 4 pipeline calls, all indexed fields.

---

### E2 — `GET /api/pos/reports/top-customers?limit=20&sort_by=total_spent|total_visits|total_points`
Ranked customer list. **Phase 1: stored-field sort only.** `sort_by=value_score` deferred to Phase 2 (see Q3).

```json
{
  "customers": [
    { "customer_id", "name", "phone", "tier", "total_visits",
      "total_spent", "avg_order_value", "last_visit_days_ago" }
  ],
  "total": 20
}
```
Source: `customers` — single `$sort` + `$limit`. Fast.

---

### E3 — `GET /api/pos/reports/churn-risk?band=high|medium`
Win-back action list. Uses CR-077 configurable lifecycle thresholds.

```json
{
  "band": "high",
  "count": 91,
  "customers": [
    { "customer_id", "name", "phone", "tier",
      "last_visit_days_ago", "total_spent", "total_visits" }
  ]
}
```
Source: `customers`, `loyalty_settings` (for `dormant_days_end` from CR-077). Reuses `get_stage_cutoffs()` from `routers/analytics.py`.

---

### E4 — `GET /api/pos/reports/revenue-intelligence?period=7d|30d|90d`
Revenue breakdown for manager reports.

```json
{
  "period": "30d",
  "total_revenue": 1240000,
  "by_order_type": { "dine_in": 820000, "takeaway": 280000, "delivery": 140000 },
  "by_tier": { "bronze": 340000, "silver": 280000, "gold": 390000, "platinum": 230000 },
  "by_time_of_day": { "morning": 85000, "afternoon": 210000, "evening": 680000, "night": 265000 },
  "loyalty_redemption_impact": 38400,
  "repeat_vs_new": { "repeat_pct": 73.2, "new_pct": 26.8 }
}
```
Source: `orders`, `customers` — 3–4 pipeline calls. `orders.user_id` + `orders.created_at` indexed.

---

### E5 — `GET /api/pos/reports/customer-intelligence/{customer_id}`
Enriched single-customer lookup. Extends existing `/pos/customer-lookup` with intelligence layer.

```json
{
  "customer_summary": { "name", "phone", "tier", "visits", "gross_spend",
                         "loyalty_points", "wallet_balance", "available_coupons_count" },
  "value": { "score": 78.4, "band": "high", "avg_order_value": 1240.0,
              "frequency_per_month": 2.3, "recency_days": 12, "churn_risk": "low" },
  "order_patterns": { "top_items": [...], "usual_time_of_day": "evening",
                       "usual_channel": "dine_in", "avg_items_per_order": 3.2 },
  "cross_sell": [ { "item_id", "name", "reason", "confidence" } ]
}
```
Source: Calls existing `core/customer_intelligence.py` functions directly. No new computation written.
**Note**: `value` block returns `null` for customers with `total_visits <= 1` — frontend must handle.

---

## 8. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `routers/pos_reports.py` (new), `backend/server.py` (+1 line) |
| **Files WILL NOT change** | `routers/pos.py`, `core/customer_intelligence.py`, `core/coupon.py`, `core/loyalty.py`, `core/whatsapp.py`, `routers/analytics.py`, `models/schemas.py`, all frontend files |
| **DB schema** | No changes |
| **POS API contract** | Additive. New path prefix `/api/pos/reports/`. All existing POS endpoints unchanged. |
| **Blast radius** | SMALL |

---

## 9. Owner Decisions Required (Q1–Q3)

**Planning is BLOCKED until these are answered.**

### Q1 — Scope: which endpoints in Phase 1?

| Option | Endpoints | Effort | Recommendation |
|---|---|---|---|
| a) All 5 | E1 + E2 + E3 + E4 + E5 | ~3–4 hrs | — |
| b) E1 + E5 | Summary + enriched per-customer | ~1.5 hrs | — |
| c) E1 + E2 + E3 | Summary + top-customers + churn-risk | ~2 hrs | ✅ Agent recommends |
| d) E5 only | Enriched lookup (most immediate billing-screen value) | ~1 hr | — |

### Q2 — Caching on heavy aggregations?

`/reports/summary` and `/reports/revenue-intelligence` run 4–6 pipeline calls on live data.

| Option | Description |
|---|---|
| a) Always-fresh | No caching. Every call hits MongoDB directly. |
| b) In-memory 5-min TTL per user_id | Stale up to 5 min. Zero infra cost. |
| c) Skip for now | Build fresh first, add only if perf is measured as a problem. ✅ Agent recommends |

### Q3 — Value score sort on top-customers (E2)?

`sort_by=value_score` requires per-customer loop with DB calls — O(N), not bulk-safe.

| Option | Description |
|---|---|
| a) Defer to Phase 2 | Phase 1 sorts on stored fields. Phase 2 pre-computes `crm_value_score` via nightly job. ✅ Agent recommends |
| b) Accept limitation | No value_score sort, ever. Document it. |
| c) Sort by total_spent as proxy | High correlation with composite score. Simple. |

---

## 10. Evidence

| Evidence | Location | Status |
|---|---|---|
| All POS endpoints one-to-one | `routers/pos.py` — code read 2026-08-06 | ✅ confirmed |
| `_get_restaurant_stats()` not exposed to POS | `core/customer_intelligence.py:87` | ✅ confirmed |
| Lifecycle pipeline CRM-JWT only | `routers/analytics.py:525` | ✅ confirmed |
| `verify_pos_auth` reusable | `core/auth.py` — imported in `routers/pos.py:line 12` | ✅ confirmed |
| CR-077 thresholds in loyalty_settings | `models/schemas.py:LoyaltySettings` — `at_risk_days_start`, `dormant_days_end` | ✅ confirmed |
| No schema changes required | All response fields derived from existing collections | ✅ confirmed |

---

## 11. Do Not Do (CR-078 specific)

- **Do NOT** run `compute_customer_value()` in a bulk loop — O(N×DB_calls), will timeout.
- **Do NOT** duplicate `get_stage_cutoffs()` from `analytics.py` — reuse or import.
- **Do NOT** add to `routers/pos.py` — new file only (`routers/pos_reports.py`).
- **Do NOT** modify existing `/pos/customer-lookup` or `/pos/customers/{id}`.
- **Do NOT** start implementation before owner answers Q1–Q3.

---

## 12. Intake Output

```
Intake complete: CR-078
Classification: CR — new feature (POS aggregated customer intelligence report endpoints)
Severity: P2
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: confirmed by code read
Blast radius: SMALL (new file only + 1 server.py line, no existing code changed)
Docs updated:
  - /app/memory/crm/crm_roi_sprint/discovery/CR_078_POS_CUSTOMER_INTELLIGENCE_REPORT_INTAKE.md (this)
  - /app/memory/crm/crm_roi_sprint/00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 28 added)
  - /app/memory/CR_STATUS_DASHBOARD.md (board row added)
  - /app/memory/DECISIONS_LOG.md (registration entry added)
Next: Planning — BLOCKED on owner Q1 (scope), Q2 (caching), Q3 (value score sort)
```

---
*Zero production files modified during Intake. No code written.*

---

## 13. Intake Closure — Owner Decisions Locked (2026-08-06)

| Q | Question | Answer | Decision |
|---|---|---|---|
| Q1 | Which endpoints Phase 1? | **b** | E1 (`/reports/summary`) + E2 (`/reports/top-customers`) + E3 (`/reports/churn-risk`) only. E4 + E5 deferred to Phase 2. |
| Q2 | Caching on heavy aggregations? | **c** | Always-fresh. No TTL cache. Add only if perf measured as a problem post-testing. |
| Q3 | Value score sort on top-customers? | **a** | Deferred to Phase 2. Phase 1 sorts on stored fields only (`total_spent`, `total_visits`, `total_points`). `compute_customer_value()` must NOT run in a bulk loop in Phase 1. |

**Status**: 🔵 INTAKE CLOSED — Planning gate OPEN.
**Files that WILL change (Phase 1)**:
- `routers/pos_reports.py` — new file, 3 endpoints (~150 LOC)
- `backend/server.py` — +1 line (router registration)

**Files that WILL NOT change**: everything else.

**Locked scope for Phase 1 Implementation Plan**:
1. `GET /api/pos/reports/summary` — customer counts, lifecycle breakdown, tier distribution, revenue KPIs, loyalty stats
2. `GET /api/pos/reports/top-customers?limit=&sort_by=total_spent|total_visits|total_points` — ranked customer list, stored-field sort only
3. `GET /api/pos/reports/churn-risk?band=high|medium` — win-back list using CR-077 configurable thresholds (`get_stage_cutoffs()` reused from `routers/analytics.py`)

**Next**: Planning Agent writes edit-by-edit implementation plan for these 3 endpoints.
