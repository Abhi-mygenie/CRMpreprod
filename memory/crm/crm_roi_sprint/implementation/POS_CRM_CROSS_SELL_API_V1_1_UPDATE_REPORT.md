# POS-CRM Customer Order Suggestions API — Phase 1 v1.1 Update Report

**Date:** 2026-05-26
**Status:** `pos_crm_cross_sell_phase_1_v1_1_shipped`
**Sprint:** ROI Measurement for CRM
**Trigger:** POS team feedback — 5 blockers answered + 5 items shipped in-phase

---

## 1. Changes Shipped (Phase 1 v1.1)

| # | Item | Source | Change | Impact |
|---|---|---|---|---|
| **P-01** | `meta.request_id` (UUID) | POS nice-to-have | Added `uuid.uuid4()` to every response in `meta.request_id` | Cross-team debugging without relying on Cloudflare cf-ray |
| **P-03** | `currency` field | POS nice-to-have | Added `"currency": "INR"` to `customer_summary` | POS doesn't hardcode currency; ready for multi-currency |
| **P-04** | `cross_sell_items[].title` → `name` | POS nice-to-have | Renamed field in `compute_cross_sell` return | Consistent naming: `top_items[].name`, `cross_sell[].name` — one field name |
| **Q-02** | `available_coupons_count` per-customer | POS blocker | Rewrote coupon counting: now checks `per_user_limit` + `max_applications` against `coupon_usage`. Bulk prefetch pattern (3 queries). | Badge count now matches what customer can actually use (excludes exhausted coupons) |
| **Q-04** | `item_notes_by_id` batch map | POS non-blocking | New function `compute_item_notes_batch` + new response field `item_notes_by_id: {item_id: [notes]}` | Saves POS 5-6 re-calls per order. All cart item notes in one response. |

---

## 2. Files Changed

| File | Change | Lines |
|---|---|---|
| `backend/core/customer_intelligence.py` | **Q-02**: Rewrote `compute_customer_summary` coupon count (bulk prefetch per-customer filter). **P-03**: Added `currency` field. **P-04**: `title` → `name` in cross-sell. **Q-04**: New `compute_item_notes_batch` function. | +50 net |
| `backend/routers/suggestions.py` | **P-01**: Added `uuid` import + `request_id` in meta. **Q-04**: Added `compute_item_notes_batch` to imports + parallel tasks + `item_notes_by_id` in response. | +15 net |

**Files NOT modified:** `server.py`, `pos.py`, `models/schemas.py`, `core/auth.py`, all frontend files.

---

## 3. Response Shape Changes (v1.0 → v1.1)

| Field | v1.0 | v1.1 | Breaking? |
|---|---|---|---|
| `customer_summary.currency` | absent | `"INR"` | **No** — additive |
| `customer_summary.available_coupons_count` | All active restaurant coupons | Per-customer (excludes exhausted) | **No** — same type, more accurate value |
| `cross_sell_items[].title` | `"Kunafa Luxe Mini Bar"` | **removed** | **YES — renamed to `name`** |
| `cross_sell_items[].name` | absent | `"Kunafa Luxe Mini Bar"` | **YES — replaces `title`** |
| `item_notes_by_id` | absent | `{"182040": [...], "146588": [...]}` | **No** — additive |
| `meta.request_id` | absent | `"250e62e5-60c1-..."` | **No** — additive |

**One breaking change:** `cross_sell_items[].title` → `.name`. POS team requested this (P-04) and is aware.

---

## 4. Test Results (v1.1)

| # | Test | Result |
|---|---|---|
| T1 | `meta.request_id` present (UUID format) | **PASS** — `250e62e5-60c1-4db0-bd47-200d18482ace` |
| T2 | `customer_summary.currency` = `"INR"` | **PASS** |
| T3 | `available_coupons_count` per-customer (Prvesh, 58 visits) | **PASS** — 24 (this customer hasn't exhausted any) |
| T4 | `cross_sell_items[].name` (not `.title`) | **PASS** — `name=True, title=False` |
| T5 | `item_notes_by_id` with 3 cart items | **PASS** — keys `['182040', '146588', '146576']`, 146576 has 3 notes |
| T6 | `item_notes_by_id` actual data | **PASS** — `"Pack Hai" (2x), "Packing Hai" (1x), "Pack Hai" (1x)` |
| T7 | First-time customer: `item_notes_by_id = {}`, `currency = "INR"`, `request_id` present, no `customer_value` | **PASS** |
| T8 | Backend restart clean, no import errors | **PASS** |
| T9 | `item_notes` (legacy, selected_item) still works | **PASS** |
| T10 | Unique `request_id` per call | **PASS** — two calls produced different UUIDs |

---

## 5. Q-02 Implementation Detail

**Before (v1.0):** Single `count_documents` with `is_active + end_date` filter → counted ALL active restaurant coupons.

**After (v1.1):** 3-query bulk prefetch pattern:
1. `coupons.find(active + not expired)` → all candidate coupons
2. `coupon_usage.aggregate(group by coupon_id, match customer_id)` → this customer's usage per coupon
3. `coupon_usage.aggregate(group by coupon_id, match coupons with max_applications)` → total usage per capped coupon

Then filter in Python: exclude coupons where `per_user_limit` reached OR `max_applications` reached.

**Performance:** +2 lightweight aggregate queries. On external DB: ~400ms extra. Net: still within 3.5s total (external DB). In production co-located: <50ms extra.

---

## 6. Status

```
pos_crm_cross_sell_phase_1_v1_1_shipped
```
