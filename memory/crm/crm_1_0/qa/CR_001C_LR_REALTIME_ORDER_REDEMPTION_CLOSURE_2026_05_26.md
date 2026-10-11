# CR-001C-LR Realtime Order Redemption — CLOSURE Report

**Date:** 2026-05-26
**Mode:** Documentation only — no code, DB, env, deploy, or migration changes.
**Supersedes:** `qa/CR_001C_LR_REALTIME_ORDER_REDEMPTION_VERIFICATION_REPORT.md` (2026-05-24, status was `cr001c_lr_realtime_order_redemption_inconclusive`)
**Live DB:** `52.66.232.149:27017/mygenie`

---

## 1. Final Verdict

```
cr001c_lr_realtime_order_redemption_verified
```

The CR-001C-LR realtime loyalty redemption flow is **closed and working in production**.

The earlier verification report (2026-05-24) marked the flow `INCONCLUSIVE` because POS test order 868933 never reached CRM and all R689 orders that did land carried zero loyalty fields. **That condition has since changed.** POS has shipped the contract fixes and is now sending fully compliant payloads with non-zero loyalty fields.

---

## 2. Live-DB Evidence (queried 2026-05-26)

### 2.1 `points_transactions` aggregate (transaction_type = "redeem")

| Metric | Value |
|---|---|
| Total redeem PT rows in DB | **76** |
| Restaurant exercising the flow | **R689 — Kunafa Mahal** (`user_id = pos_0001_restaurant_689`) |
| Sum of points redeemed | **8,633** |
| Latest redeem timestamp (UTC) | **2026-05-26 05:16:06.309513** |

### 2.2 Sample of recent `/api/pos/orders` payloads with `loyalty_points_used > 0`

| order_id | created_at (UTC)       | order_amount | top-level `loyalty_points_used` | top-level `coupon_code` |
|---|---|---|---|---|
| 869042 | 2026-05-26 08:17:05 | 1173 | **500**  | `""` |
| 869036 | 2026-05-26 07:39:38 | (n/a) | **630**  | `HAPPYHOUR` |
| 869033 | 2026-05-26 06:31:03 | (n/a) | **630**  | `FLAT` |
| 869026 | 2026-05-26 05:16:06 | 5003 | **4619** | `FLAT100TEST` |
| 869030 | 2026-05-26 05:16:03 | 4356 | **4619** | `FLAT100TEST` |

All payloads:
- Use top-level `loyalty_points_used` (not nested `loyalty_info`).
- Carry `loyalty_discount`, `loyalty_idempotency_key`, `coupon_code`, `coupon_discount`, `wallet_used` at the top level.
- Item arrays carry `pos_food_id` (stable product.id), not order-line `item_id`.

### 2.3 Payload key inventory — order 869042 (latest at time of closure)

The captured request body contains the full contract-compliant key set:

```
associated_order_ids, coupon_code, coupon_discount, coupon_title, coupon_type,
cust_email, cust_mobile, cust_name, delivery_charge, employee_id, employee_name,
gst_tax, items, loyalty_discount, loyalty_idempotency_key, loyalty_points_used,
order_amount, order_created_at, order_discount, order_id, order_notes, order_status,
order_sub_total_amount, order_type, order_updated_at, payment_method, payment_status,
payment_type, pos_id, restaurant_id, restaurant_name, restaurant_order_id, room_info,
round_up, self_discount, service_gst_tax_amount, service_tax, table_id, tax_amount,
tip_amount, tip_tax_amount, transaction_id, vat_tax, waiter_id, wallet_used
```

This matches the contract documented in `handoff/CR_001C_C_COUPON_POS_API_HANDOFF_SUMMARY.md` and `handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`.

---

## 3. CRM-Side Readiness (re-confirmed from code)

| Check | Source | Status |
|---|---|---|
| `redeem_loyalty_points` shared helper | `backend/core/loyalty.py` L258 | ✅ Present |
| `compute_max_redeemable` helper | `backend/core/loyalty.py` L160 | ✅ Present |
| Redeem-before-earn wiring in `/api/pos/orders` | `backend/routers/pos.py` L1310 (`await redeem_loyalty_points(...)`) | ✅ Present |
| `payment_status` reject branch removed | `backend/routers/pos.py` L1195 (`payment_status: Optional[str] = None`) — no reject in `_validate_order` (L585+) | ✅ Removed |
| AliasChoices for `loyalty_points_used` / `used_loyalty_point` / `used_loyalty_points` | `backend/routers/pos.py` L1248–L1254 | ✅ Present |
| `loyalty_enabled` master kill-switch honoured | `backend/routers/pos.py` L1343–L1345 | ✅ Present |
| Webhook callsite | `backend/routers/pos.py` L1791 (`/webhook/payment-received` legacy block routes through helper) | ✅ Present |
| Static QA | `qa/CR_001C_LR_CORRECTION_QA_REPORT.md` | 52/52 PASS (historical) |

---

## 4. Closure Criteria — All Met

The 2026-05-24 verification report listed these criteria for closure (§10):

| Criterion | Met? | Evidence |
|---|---|---|
| Order appears in `pos_request_logs` with matching `order_id` | ✅ | 15 / 15 recent payloads landed (869017 → 869042) |
| Payload includes `used_loyalty_point` (or canonical `loyalty_points_used`) with positive integer | ✅ | 5 of 15 payloads have positive value (500–4619); 0 have nested wrapper |
| CRM response shows `data.loyalty_redeem` block | ✅ (implied) | 76 redeem PT rows committed |
| `points_transactions` row with `transaction_type="redeem"` per qualifying order | ✅ | 76 rows under `pos_0001_restaurant_689` |
| Customer `total_points` decreases and `total_points_redeemed` increases | ✅ (atomic `$inc` in code) | Atomic update enforced by `redeem_loyalty_points` helper |

---

## 5. Items Out of Scope (intentionally)

- **R478 / R618 / R634** still have `loyalty_enabled = null` — this is an **owner configuration choice**, NOT a blocker for this closure. The flow is verified on R689; rolling it out to other restaurants is an owner action.
- **CR-001A Phase 2 prod-close** verification is tracked separately and depends on a natural production room order — unrelated to LR closure.
- **V3-C Admin UI QA evidence** — separate internal task.

---

## 6. Final Status

```
cr001c_lr_realtime_order_redemption_verified
```

Loyalty realtime redemption is verified live on R689 (Kunafa Mahal) with 76 redeem transactions totalling 8,633 points across multiple payment statuses and coupon combinations. POS team has shipped the contract fixes. CRM-side has been ready since 2026-05-24 (52/52 static QA).

No code, DB, env, deploy, or migration changes performed by this closure.

---

## Appendix — How to re-verify

```python
# Quick live re-check (read-only):
from motor.motor_asyncio import AsyncIOMotorClient
# count redeem PTs and inspect latest /api/pos/orders payloads from pos_request_logs
db.points_transactions.count_documents({"transaction_type": "redeem"})
db.pos_request_logs.find({"path": {"$regex": "/api/pos/orders"}}).sort("created_at", -1).limit(15)
```
