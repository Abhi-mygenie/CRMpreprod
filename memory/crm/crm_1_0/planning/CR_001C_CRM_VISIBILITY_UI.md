# CR-001C — CRM Visibility / UI Mapping

> **Status:** `cr001c_phase1_locked_phase2_open`
> **Sprint:** CRM 1.0
> **Priority:** P1
> **Parent:** CR-001 (see `CR_001_INDEX.md`)
> **Date:** 2026-05-21
> **Code surface:** `/app/backend/routers/points.py`, `/app/backend/routers/wallet.py`, `/app/backend/services/analytics_service.py`, `/app/frontend/src/pages/CustomerDetailPage.jsx`, Dashboard components

---

## 1. Objective

Ensure CRM read paths (manual admin actions, dashboard analytics, customer detail UI) stay consistent with the realtime ingestion path being fixed in CR-001A, and add the customer-detail "Orders" tab that was deferred in CR-001 round 1.

---

## 2. Scope

In scope:
- Running-total `$inc` on the **CRM manual** points and wallet endpoints (mirror of CR-001A A2 on the realtime side).
- Dashboard coupon stats: query the correct collection (`coupon_usage`) and field (`discount_applied`).
- Order history endpoint + Orders tab in `CustomerDetailPage.jsx` (Phase 2; deferred from CR-001 Round 1 via Q6=D).
- Any UI-side handling needed for the `item_data_lost` marker introduced by CR-001B (filter items out of item-level revenue mix charts).

Out of scope:
- Realtime POS webhook handler → **CR-001A**.
- Migration code audit / data cleanup → **CR-001B**.

---

## 3. Phase 1 — Locked items

| # | Item | Issue | File | Status |
|---|---|---|---|---|
| C1 | On CRM manual award/redeem points endpoints: `$inc customers.total_points_earned` by the awarded amount (and decrement on revoke). Pairs with CR-001A A2 to keep running totals reconciled. | ISSUE-03 | `routers/points.py` (manual award/revoke handlers) | LOCKED IN |
| C2 | On CRM manual wallet add/use endpoints: `$inc customers.total_wallet_used` on use; do NOT increment on top-up. | ISSUE-03 | `routers/wallet.py` (manual use handler) | LOCKED IN |
| C3 | Fix dashboard coupon stats: query `db.coupon_usage` (NOT `db.coupon_transactions`), use field `discount_applied` (NOT `discount_amount`), scope by joining `coupons.id` for `user_id`. | ISSUE-05 | `services/analytics_service.py` L217–233 | LOCKED IN |

### 3.1 Cross-CR dependency

C1 + C2 must ship **in the same release** as CR-001A A2. If either side ships alone, running totals will drift by source for any orders ingested in the interim.

---

## 4. Phase 2 — Backlog

| # | Item | Trigger | Notes |
|---|---|---|---|
| C-P1 | New endpoint `GET /api/customers/{id}/orders` — returns paginated list of `orders` scoped to `user_id`, newest first, with per-order item summary. | Q6=D from CR-001 Round 1 | Spec needed: pagination shape (`limit`/`cursor` vs `page`), filter params (date range, order_type), field set returned. See **Q16**. |
| C-P2 | Orders tab in `CustomerDetailPage.jsx` consuming C-P1. Shows order count, total spend, last order date in tab header; list rows show date, type, amount, item count, status. Tapping a row opens an order-detail drawer. | depends on C-P1 | Use existing tab pattern from CustomerDetailPage. |
| C-P3 | Honor `items[].item_data_lost` flag (CR-001B output) in any dashboard chart that breaks down revenue by item. Either: (a) exclude flagged items from item-level chart denominators; (b) show a "data lost — X% of items affected" badge. | CR-001B Q15=A | Affects ≤17 orders today; cosmetic but important. |
| C-P4 | Add customer's `last_synced_at`, `mygenie_synced`, and (proposed) `ingestion_source` to the customer detail debug panel (admin-only). | CR-001B AUDIT-O4 | Helps support distinguish migrated vs realtime customers when debugging. |

---

## 5. Open questions (CR-001C scope)

| Q# | Topic | Options | Recommended |
|---|---|---|---|
| **Q16** | Phase 2 order-history endpoint design | A) cursor-based pagination, lean projection (date, type, amount, item count); B) page-based, full order doc; C) cursor + full order doc | **A** (smallest payload, scales) |
| **Q16.1** | Order-detail drawer fields | A) full order doc; B) curated subset (totals, items table, payment summary, address if present) | **B** |
| **Q16.2** | Dashboard treatment for `item_data_lost` items | A) silently exclude from item-level charts; B) show a one-time banner with affected count | **B** (transparency) |

---

## 6. Test plan

### 6.1 Backend
- POST `/api/customers/{id}/points` (manual award) → `customers.total_points_earned` increases by `points`; revoke decreases.
- POST `/api/customers/{id}/wallet/use` → `customers.total_wallet_used` increases; top-up does NOT increase it.
- Dashboard coupon stats endpoint returns counts/amounts matching a direct `db.coupon_usage` aggregate scoped by `user_id` join.

### 6.2 Frontend (Phase 2)
- Customer detail page → Orders tab loads, paginates, opens drawer, handles empty state.
- Dashboard renders the `item_data_lost` banner only when ≥1 such order exists in the visible date range.

### 6.3 Cross-CR
- Place one realtime order (CR-001A A2 path) AND make one manual points award (CR-001C C1 path) on the same customer → `customers.total_points_earned` equals the sum of both, no double counting.

---

## 7. Status

```
cr001c_phase1_locked_phase2_open
```

Phase 1 (C1, C2, C3): locked; ship in the same release window as CR-001A A2.
Phase 2 (C-P1..C-P4): awaits Q16, Q16.1, Q16.2 + CR-001B Q15 outcome.
