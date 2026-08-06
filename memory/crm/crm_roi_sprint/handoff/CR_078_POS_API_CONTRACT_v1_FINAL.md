# POS ↔ CRM: API Contract — CR-078 Customer Intelligence Report API

**Version**: 1.0 FINAL
**Date**: 2026-08-06
**From**: CRM Team
**To**: POS Team (Frontend + Backend)
**Status**: ✅ LIVE — CRM implemented + self-test verified. POS may integrate.
**Auth**: Same `X-API-Key` as all existing `/api/pos/*` endpoints. Zero new keys needed.
**CRM Base URL**: `https://crm.mygenie.online`
**Preview URL**: `https://vendor-crm-preview-1.preview.emergentagent.com`

---

## Summary

Three new read-only aggregated endpoints for POS report screens.
All endpoints are **GET**, require no request body, and use the same `X-API-Key` auth as all other POS endpoints.

| # | Endpoint | What | DB calls | Use case |
|---|---|---|---|---|
| 1 | `GET /api/pos/reports/summary` | Restaurant-wide intelligence snapshot | 3 | Report home screen, manager dashboard |
| 2 | `GET /api/pos/reports/top-customers` | Ranked customer list | 1 | VIP list, staff briefing |
| 3 | `GET /api/pos/reports/churn-risk` | Win-back target list by band | 3 | Campaign targeting, daily action list |

**Backward compatibility**: Purely additive. Zero existing endpoints modified. POS may adopt incrementally.

**Phase 2 (not in scope now)**: `/revenue-intelligence`, `/customer-intelligence/{id}`, `sort_by=value_score`. See §7.

---

## Authentication

All three endpoints use `X-API-Key` header — same key as `POST /api/pos/orders`, `POST /api/pos/max-redeemable`, etc.

```
X-API-Key: <restaurant_api_key>
```

Missing or invalid key → `HTTP 401` (FastAPI default, not wrapped in `POSResponse`).

---

## 1. GET /api/pos/reports/summary

### 1.1 Request

```
GET /api/pos/reports/summary
X-API-Key: <api_key>
```

No query parameters. No request body.

### 1.2 Success Response (200)

```json
{
    "success": true,
    "message": "Summary retrieved",
    "data": {
        "as_of": "2026-08-06T23:11:22.721641+00:00",
        "customers": {
            "total": 2272,
            "active_30d": 23,
            "new_7d": 26
        },
        "lifecycle": {
            "new": 19,
            "active": 4,
            "at_risk": 4,
            "dormant": 224,
            "churned": 2021
        },
        "tiers": {
            "bronze": 2271,
            "silver": 1,
            "gold": 0,
            "platinum": 0
        },
        "revenue": {
            "total": 3834547.0,
            "total_orders": 9309,
            "avg_order_value": 411.92,
            "revenue_30d": 8610.0,
            "avg_order_value_30d": 232.7
        },
        "loyalty": {
            "orders_with_redemption_pct": 0.2,
            "points_outstanding": 2760
        }
    }
}
```

### 1.3 Response Field Reference

**`data.customers`**

| Field | Type | Description |
|---|---|---|
| `total` | int | Total customers registered under this restaurant |
| `active_30d` | int | Customers with a visit in the last 30 days |
| `new_7d` | int | Customers created in the last 7 days |

**`data.lifecycle`**

Lifecycle stage counts. Thresholds are configurable per-tenant (see §6 CR-077 note).

| Field | Type | Stage definition |
|---|---|---|
| `new` | int | ≤1 visit AND last visit within 30 days |
| `active` | int | 2+ visits AND last visit within 30 days |
| `at_risk` | int | Last visit 31–60 days ago |
| `dormant` | int | Last visit 61–90 days ago |
| `churned` | int | Last visit >90 days ago OR never visited |

> **Note**: `new + active + at_risk + dormant + churned` ≈ `customers.total`. A small delta is expected for customers with no `last_visit` recorded — they fall into `churned`.

**`data.tiers`**

| Field | Type | Description |
|---|---|---|
| `bronze` | int | Bronze-tier customer count |
| `silver` | int | Silver-tier customer count |
| `gold` | int | Gold-tier customer count |
| `platinum` | int | Platinum-tier customer count |

> `bronze + silver + gold + platinum` = `customers.total` exactly.

**`data.revenue`**

| Field | Type | Description |
|---|---|---|
| `total` | float | All-time total revenue (sum of `order_amount`) |
| `total_orders` | int | All-time total order count |
| `avg_order_value` | float | All-time average order value (INR) |
| `revenue_30d` | float | Revenue in the last 30 days |
| `avg_order_value_30d` | float | Average order value in the last 30 days |

**`data.loyalty`**

| Field | Type | Description |
|---|---|---|
| `orders_with_redemption_pct` | float | % of all orders where the customer redeemed loyalty points |
| `points_outstanding` | int | Total loyalty points balance across all customers (restaurant liability) |

### 1.4 cURL

```bash
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/summary" \
  -H "X-API-Key: <api_key>"
```

---

## 2. GET /api/pos/reports/top-customers

### 2.1 Request

```
GET /api/pos/reports/top-customers?limit=20&sort_by=total_spent
X-API-Key: <api_key>
```

**Query parameters**

| Parameter | Type | Required | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `limit` | int | No | `20` | 1–100 | Max 100 records per call |
| `sort_by` | string | No | `total_spent` | `total_spent`, `total_visits`, `total_points` | Invalid value silently falls back to `total_spent` — no error |

> **Phase 2 note**: `sort_by=value_score` is NOT supported in Phase 1. It requires a pre-computed field to be stored on the customer document (scheduled for Phase 2). Passing `value_score` now will silently return `total_spent` sort.

### 2.2 Success Response (200)

```json
{
    "success": true,
    "message": "Top 2 customers by total_spent",
    "data": {
        "customers": [
            {
                "customer_id": "1779d4fc-7161-4407-ac8c-cce30beb3e53",
                "name": "Abhishek Jain",
                "phone": "7505242126",
                "tier": "Bronze",
                "total_visits": 75,
                "total_spent": 74840.0,
                "avg_order_value": 997.87,
                "last_visit_days_ago": 2
            },
            {
                "customer_id": "7b697c5c-f014-4509-abdf-b678ade5b370",
                "name": "Priya Sharma",
                "phone": "9876543210",
                "tier": "Silver",
                "total_visits": 101,
                "total_spent": 55142.0,
                "avg_order_value": 545.96,
                "last_visit_days_ago": 2
            }
        ],
        "total": 2,
        "sort_by": "total_spent"
    }
}
```

### 2.3 Response Field Reference

**`data`**

| Field | Type | Description |
|---|---|---|
| `customers` | array | Ranked customer list, length = min(limit, actual count) |
| `total` | int | Actual count returned (same as `customers` array length) |
| `sort_by` | string | Effective sort field used (reflects fallback if invalid value was passed) |

**`data.customers[]`**

| Field | Type | Nullable | Description |
|---|---|---|---|
| `customer_id` | string | No | CRM customer UUID |
| `name` | string | No | Customer name (may be empty string for POS-auto-created customers) |
| `phone` | string | No | Phone number |
| `tier` | string | No | `Bronze` / `Silver` / `Gold` / `Platinum` |
| `total_visits` | int | No | Total order count |
| `total_spent` | float | No | Cumulative spend in INR |
| `avg_order_value` | float | No | Average per-order spend in INR |
| `last_visit_days_ago` | int | **Yes** | Days since last visit. `null` if customer has never ordered. |

### 2.4 cURL

```bash
# Top 20 by spend (default)
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/top-customers" \
  -H "X-API-Key: <api_key>"

# Top 10 by visit count
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/top-customers?limit=10&sort_by=total_visits" \
  -H "X-API-Key: <api_key>"

# Top 50 by loyalty points
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/top-customers?limit=50&sort_by=total_points" \
  -H "X-API-Key: <api_key>"
```

---

## 3. GET /api/pos/reports/churn-risk

### 3.1 Request

```
GET /api/pos/reports/churn-risk?band=high&limit=50
X-API-Key: <api_key>
```

**Query parameters**

| Parameter | Type | Required | Default | Allowed values | Notes |
|---|---|---|---|---|---|
| `band` | string | No | `high` | `high`, `medium` | See stage definition below |
| `limit` | int | No | `50` | 1–200 | Max 200 records per call |

**Band definition**

| Band | Stage | Last visit range | Business meaning |
|---|---|---|---|
| `high` | at_risk | 31–60 days ago | Customers who left recently — highest win-back success rate |
| `medium` | dormant | 61–90 days ago | Customers going cold — act before they churn permanently |

> Thresholds (31/60/90 days) are configurable per-tenant via CRM Loyalty Settings (CR-077). The API always uses the live per-tenant values — POS should not hardcode the day numbers.

**Invalid band**: passing any value other than `high` or `medium` returns `success: false` with an error message (HTTP 200 status).

### 3.2 Success Response (200) — band=high

```json
{
    "success": true,
    "message": "Churn risk high — 4 customers",
    "data": {
        "band": "high",
        "count": 4,
        "customers": [
            {
                "customer_id": "672c09fa-cbd9-43bd-8826-a3f19bf223af",
                "name": "Mayur",
                "phone": "9456456736",
                "tier": "Bronze",
                "last_visit_days_ago": 48,
                "total_spent": 642.0,
                "total_visits": 1
            },
            {
                "customer_id": "cb8603b5-1e02-4562-94a3-1ef84b36b7dd",
                "name": "Vishal",
                "phone": "7635634253",
                "tier": "Bronze",
                "last_visit_days_ago": 48,
                "total_spent": 0.0,
                "total_visits": 1
            }
        ]
    }
}
```

### 3.3 Error Response — invalid band (200)

```json
{
    "success": false,
    "message": "band must be 'high' or 'medium'",
    "data": null
}
```

### 3.4 Response Field Reference

**`data`**

| Field | Type | Description |
|---|---|---|
| `band` | string | The band queried: `high` or `medium` |
| `count` | int | **Total** customers in this band for the restaurant (not limited by `limit` param) |
| `customers` | array | Up to `limit` customers, sorted oldest-visit-first (most urgent win-back first) |

> `data.count` is the full count before the `limit` is applied. If `count=224` and `limit=50`, you receive 50 records but the full at-risk pool is 224.

**`data.customers[]`**

| Field | Type | Nullable | Description |
|---|---|---|---|
| `customer_id` | string | No | CRM customer UUID |
| `name` | string | No | Customer name |
| `phone` | string | No | Phone number — use this to send WhatsApp / SMS |
| `tier` | string | No | `Bronze` / `Silver` / `Gold` / `Platinum` |
| `last_visit_days_ago` | int | **Yes** | Days since last visit. Null only if data integrity issue. |
| `total_spent` | float | No | Cumulative spend in INR |
| `total_visits` | int | No | Total order count |

### 3.5 cURL

```bash
# High-risk (at-risk) customers — default 50
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/churn-risk?band=high" \
  -H "X-API-Key: <api_key>"

# Medium-risk (dormant) customers — up to 200
curl -X GET \
  "https://crm.mygenie.online/api/pos/reports/churn-risk?band=medium&limit=200" \
  -H "X-API-Key: <api_key>"
```

---

## 4. Error Reference

| Scenario | HTTP status | Response body | POS action |
|---|---|---|---|
| Missing `X-API-Key` header | 401 | `{"detail": "Authentication required. Provide X-API-Key header or Bearer token."}` | Check API key configuration |
| Invalid `X-API-Key` | 401 | `{"detail": "Authentication required..."}` | Verify key in CRM Settings → POS Integration |
| `band` not `high`/`medium` | 200 | `{"success": false, "message": "band must be 'high' or 'medium'", "data": null}` | Fix query param |
| Invalid `limit` (<1 or >100/200) | 422 | FastAPI validation error | Fix query param |
| CRM backend down | 5xx | FastAPI 500 | Retry with backoff; do not show raw error to cashier |

---

## 5. Common Patterns & Rules

### 5.1 Pagination
None of the three endpoints are paginated. They return all matching records up to `limit`.
`/summary` has no limit (returns aggregated numbers, not lists).
`/top-customers` limit: 1–100. `/churn-risk` limit: 1–200.

### 5.2 Freshness
All endpoints are **always-fresh** — every call queries MongoDB directly. No server-side caching.
POS-side caching recommendation: cache for a maximum of **5 minutes** for `/summary`. Do not cache `/churn-risk` (stale win-back lists cause missed opportunities).

### 5.3 Currency
All monetary values are in **INR (₹)**. No currency field is returned — it is always INR.

### 5.4 ISO 8601 timestamps
`as_of` in `/summary` is ISO 8601 UTC. POS should display in IST (`UTC+5:30`).

### 5.5 Empty restaurant (no data)
All endpoints handle empty state cleanly:
- `/summary` → all counts `0`, revenue `0.0`
- `/top-customers` → `{"customers": [], "total": 0}`
- `/churn-risk` → `{"band": "high", "count": 0, "customers": []}`

---

## 6. Lifecycle Threshold Reference (CR-077)

The `/summary` lifecycle breakdown and `/churn-risk` bands use **per-tenant configurable thresholds** set in CRM Loyalty Settings. Defaults:

| Stage | Default window | Configurable field |
|---|---|---|
| Active / New | last visit ≤ 30 days | `at_risk_days_start - 1` |
| At Risk (`high`) | 31–60 days | `at_risk_days_start` to `at_risk_days_end` |
| Dormant (`medium`) | 61–90 days | `at_risk_days_end` to `dormant_days_end` |
| Churned | > 90 days | > `dormant_days_end` |

POS **must not hardcode** the 30/60/90 day numbers. The API always applies the live tenant config.

---

## 7. Existing Endpoints — NOT Changed

This contract is purely additive. No existing POS endpoints were modified:

| Endpoint | Status |
|---|---|
| `POST /api/pos/orders` | UNTOUCHED |
| `POST /api/pos/customer-lookup` | UNTOUCHED |
| `POST /api/pos/customers` | UNTOUCHED |
| `PUT /api/pos/customers/{id}` | UNTOUCHED |
| `POST /api/pos/customers/order-suggestions` | UNTOUCHED |
| `POST /api/pos/max-redeemable` | UNTOUCHED |
| `POST /api/pos/loyalty/redeem` | UNTOUCHED |
| `GET /api/pos/customers/{id}/documents` | UNTOUCHED |
| `POST /api/pos/customers/{id}/documents` | UNTOUCHED |

---

## 8. Phase 2 — Deferred (not in this contract)

| Feature | Why deferred | Trigger |
|---|---|---|
| `GET /api/pos/reports/revenue-intelligence` | Q1=b (Phase 1 scope limited) | Owner approval for Phase 2 |
| `GET /api/pos/reports/customer-intelligence/{id}` | Q1=b (Phase 1 scope limited) | Owner approval for Phase 2 |
| `sort_by=value_score` on `/top-customers` | Q3=a — requires nightly pre-computation job to store `crm_value_score` on each customer document | Phase 2 nightly job |
| Customer churn score per-individual | Per-customer `compute_customer_value()` is expensive at bulk scale | Phase 2 nightly pre-computation |

---

## 9. POS Integration Checklist

| Step | Owner | Status |
|---|---|---|
| CRM implementation | CRM | ✅ Done |
| CRM self-test (7/7 PASS, live preprod) | CRM | ✅ Done |
| POS contract review | POS | ⬜ Ready |
| POS: `/summary` integrated on report home | POS FE | ⬜ Ready |
| POS: `/top-customers` integrated (VIP list / staff briefing) | POS FE | ⬜ Ready |
| POS: `/churn-risk` integrated (win-back action list) | POS FE | ⬜ Ready |
| E2E test on preprod with real tenant | Both | ⬜ Pending |

---

## 10. Recommended POS Report Screen Layout

```
REPORT SCREEN HOME
├── Summary card (calls GET /summary once on page load)
│   ├── Customers: total=2272 / active today=23 / new this week=26
│   ├── Lifecycle funnel: New 19 → Active 4 → At Risk 4 → Dormant 224 → Churned 2021
│   ├── Tiers: Bronze 2271 | Silver 1 | Gold 0 | Platinum 0
│   ├── Revenue: ₹38.3L total | ₹8.6K last 30 days | AOV ₹411
│   └── Loyalty: 0.2% orders with redemption | 2,760 pts outstanding
│
├── Top Customers tab (calls GET /top-customers?sort_by=total_spent)
│   └── Table: Rank | Name | Phone | Tier | Visits | Spent | Avg Order | Last Visit
│       [Sort toggle: By Spend / By Visits / By Points]
│
└── Win-back tab (calls GET /churn-risk?band=high, then ?band=medium)
    ├── HIGH risk (at-risk): 4 customers — last visit 31-60 days ago
    │   └── List: Name | Phone | Tier | Days since visit | Total spent
    │       [Action: Send WhatsApp / Create Campaign]
    └── MEDIUM risk (dormant): 224 customers — last visit 61-90 days ago
        └── List: same format
```

---

## 11. Things POS Must NOT Do

| Anti-pattern | Correct approach |
|---|---|
| Hardcode `31`/`60`/`90` day thresholds in display labels | Read from `/summary` lifecycle keys; labels are "At Risk", "Dormant", "Churned" regardless of threshold |
| Cache `/churn-risk` for >5 min | Call fresh when win-back tab is opened |
| Assume `last_visit_days_ago` is always an integer | Check for `null` (customer never ordered) |
| Show the full 2,272-item top-customers list | Use `limit` param; default 20 is sufficient for "VIP today" widget |
| Show monetary values without `₹` prefix | All values are INR |

---

## 12. QA Evidence

| Check | Result |
|---|---|
| Auth guard (no key) | ✅ 401 returned |
| E1 `/summary` live call | ✅ `success=true`, 5 top-level keys, `customers.total=2272` |
| E2 `/top-customers` live call | ✅ `success=true`, correct sort, `sort_by` reflected in response |
| E2 `sort_by=value_score` fallback | ✅ returns `sort_by=total_spent` silently |
| E3 `/churn-risk?band=high` | ✅ `count=4`, correct lifecycle window |
| E3 `/churn-risk?band=medium` | ✅ `count=224`, correct lifecycle window |
| E3 `band=critical` invalid | ✅ `success=false`, clear error message |
| Existing `POST /api/pos/orders` unaffected | ✅ regression clean |

---

*Contract v1.0 FINAL — 2026-08-06 | CRM: implemented + verified | POS: ready to integrate*
