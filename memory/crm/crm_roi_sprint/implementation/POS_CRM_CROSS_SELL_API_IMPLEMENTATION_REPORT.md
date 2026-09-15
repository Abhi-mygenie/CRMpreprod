# POS-CRM Customer Cross-Sell / Order Suggestions API — Implementation Report

**Date:** 2026-05-26
**Status:** `pos_crm_cross_sell_implementation_complete`
**Sprint:** ROI Measurement for CRM
**Sprint folder:** `/app/memory/crm/crm_roi_sprint/`
**Planning doc:** `../planning/POS_CRM_CROSS_SELL_API_PHASE_1_PLAN.md`

---

## 1. What Was Implemented

| # | Deliverable | File | Lines |
|---|---|---|---|
| 1 | Customer intelligence module (value scoring, churn risk, order patterns, notes, cross-sell) | `backend/core/customer_intelligence.py` | ~280 |
| 2 | Order suggestions endpoint | `backend/routers/suggestions.py` | ~115 |
| 3 | Router wiring + index creation | `backend/server.py` | +5 lines (2 import/wire + 3 index) |

**Total new code:** ~400 lines across 2 new files + 5-line edit to `server.py`.

---

## 2. Files Changed

| File | Action | Change |
|---|---|---|
| `backend/core/customer_intelligence.py` | **NEW** | 7 functions: `compute_customer_summary`, `compute_customer_value`, `_compute_churn_risk`, `compute_order_patterns`, `compute_customer_notes`, `compute_item_notes`, `compute_cross_sell` + `_get_restaurant_stats` helper + `_parse_datetime` utility |
| `backend/routers/suggestions.py` | **NEW** | `POST /api/pos/customers/order-suggestions` endpoint with `OrderSuggestionsRequest` schema, auth via `verify_pos_auth`, parallel computation via `asyncio.gather` |
| `backend/server.py` | **EDIT** | L16: added `suggestions` to import. L77: added `api_router.include_router(suggestions.router)`. L30-32: added 3 compound indexes on `orders` and `order_items` for query performance |

**Files NOT modified (verified):**
- `routers/pos.py` — untouched
- `models/schemas.py` — untouched (new schemas co-located in `suggestions.py`)
- `core/auth.py` — untouched (uses existing `verify_pos_auth`)
- `core/database.py` — untouched
- All other routers — untouched
- All frontend files — untouched

---

## 3. Indexes Created

| Collection | Index | Name |
|---|---|---|
| `orders` | `{user_id: 1, customer_id: 1}` | `idx_user_customer` |
| `orders` | `{user_id: 1, created_at: -1}` | `idx_user_created` |
| `order_items` | `{user_id: 1, customer_id: 1}` | `idx_oi_user_customer` |

All additive — no existing indexes modified.

---

## 4. Test Results (Manual QA)

| # | Test | Result | Detail |
|---|---|---|---|
| T1 | Auth: no key | PASS | 401 "Authentication required" |
| T2 | Auth: valid API key | PASS | 200 + full response |
| T3 | Customer not found | PASS | `success: false`, `CUSTOMER_NOT_FOUND` |
| T4 | First-time customer (0 visits) | PASS | No `customer_value` block, empty notes/patterns |
| T5 | R689 customer with 19 visits | PASS | Full response: summary + value (score 63.7, band "high") + patterns (top 5 items) + cross-sell (3 items) |
| T6 | With `selected_item` | PASS | `item_notes` populated (or empty if no notes for that item) |
| T7 | With `current_cart` | PASS | Cross-sell excludes cart items |
| T8 | Invalid request (no customer ID) | PASS | `INVALID_REQUEST` error |
| T9 | Value scoring sanity | PASS | Score 63.7/100, band "high", churn "low", win_back=false |
| T10 | Existing endpoints unaffected | PASS | `/api/health` returns healthy; backend starts cleanly |

---

## 5. Performance

| Metric | Value | Notes |
|---|---|---|
| End-to-end (external MongoDB) | ~3.3s | External DB at 52.66.232.149 — ~200ms per query network overhead |
| Parallel computation | 6 tasks via `asyncio.gather` | Down from ~4.7s sequential |
| Expected in co-located production | <500ms | When CRM and DB are on same network |

**Bottleneck:** External MongoDB network latency. Each of the 6-8 queries adds ~200ms overhead. The `$lookup`-free cross-sell and single-collection restaurant stats bring individual query times down, but network is the floor.

---

## 6. Known Limitations (v1)

| Limitation | Why | Mitigation |
|---|---|---|
| No upsell | Owner decision: skip v1 (Q5=c) | Phase 2 |
| `net_spend` = `gross_spend` | CRM doesn't track net spend separately yet | Phase 2: compute from `order_amount - coupon_discount - wallet_used` |
| Categories returned as numeric IDs | POS menu uses numeric category IDs | POS can map to names via menu API |
| Performance on external DB | Network latency to remote MongoDB | In production co-located setup, target <500ms achievable |

---

## 7. Status

```
pos_crm_cross_sell_implementation_complete
```

Ready for QA. Next step: `../qa/POS_CRM_CROSS_SELL_API_QA_REPORT.md` after formal testing.
