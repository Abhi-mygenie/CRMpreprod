# CR-001C-C — Coupon V1 Owner Decisions

**Module:** CR-001C-C (Coupon) — V1 owner decision freeze
**Date:** 2026-05-24
**Status:** `cr001c_coupon_v1_owner_decisions_frozen_ready_for_implementation_plan`
**Author:** CRM Team
**Prerequisites:**
- Capability audit: `cr001c_coupon_existing_system_capability_audit_complete_waiting_owner_decisions`
- Architecture decision: `cr001c_coupon_scrap_vs_keep_decision_option_b_hybrid_rebuild_recommended`

---

## 1. Executive Summary

All 6 Coupon V1 owner decisions are **FROZEN**. Implementation planning may begin immediately.

- Architecture decision already locked as **Option B** (keep skeleton, rebuild POS contract and engine).
- This document freezes the 6 remaining decisions covering V1 scope, stacking, usage recording, discount basis, and advanced-type timing.
- Key owner clarification on Q5: **Coupon follows the same pattern as Loyalty** — POS reads coupon info from CRM, applies coupon locally as a discount on subtotal, then sends `coupon_code` + `coupon_discount` (actual applied amount) in the final `/api/pos/orders` payload. CRM validates and records usage at final-order time.

---

## 2. Inputs Reviewed

| # | Document | Status |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Read |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Read |
| 3 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md` | Read |
| 4 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md` | Read |
| 5 | Owner answers (2026-05-24 conversation) | Captured verbatim |

---

## 3. Current Coupon Architecture Baseline

| Item | Decision |
|---|---|
| Architecture | Option B — keep skeleton, rebuild POS contract and engine |
| Collections | Keep `coupons`, `coupon_usage`; deprecate `coupon_transactions` as migration-only |
| Admin endpoints | Keep all 9 (frontend depends on them) |
| POS endpoints | Rebuild validate (JSON body + error.code); build new available endpoint |
| V1 types | ORDER_FLAT + ORDER_PERCENTAGE |
| Advanced types | Postponed to V2+ |

---

## 4. Owner Decision Table

| # | Question | Selected | Decision | Reason | Implementation Impact |
|---|---|---|---|---|---|
| Q1 | V1 coupon types | **A** | ORDER_FLAT + ORDER_PERCENTAGE only | Fastest safe path for BUG-108. Advanced types need new engine + POS cart support. | V1 builds available + validate + final-order recording for order-level only |
| Q2 | Coupon + Loyalty stacking | **C** | Allow stacking only if coupon config allows | Most flexible. Default non-stackable unless coupon explicitly permits. | Add `stackable_with_loyalty: bool = False` field on coupon schema |
| Q3 | Coupon + Wallet stacking | **D** | Decide later — Wallet CR is separate | Wallet is CR-001C-W. Should not block Coupon V1. | V1 ignores wallet entirely. Stacking decision deferred to CR-001C-W. |
| Q4 | Usage recording timing | **B** | Only at final `/api/pos/orders` payload | Matches loyalty correction model. Apply/Validate = calculate only. Final payload = commit. Prevents phantom usage on cancelled orders. | Record `coupon_usage` in `/pos/orders` handler, not in `/pos/coupons/apply` |
| Q5 | Discount basis | **A (clarified)** | Pre-tax subtotal. POS applies coupon locally as discount, sends actual `coupon_code` + `coupon_discount` in final payload. CRM validates and records. Same pattern as Loyalty. | Owner clarification: coupon is treated as a discount in POS. POS calculates locally, CRM commits at final payload. | CRM validates coupon_code at final order, records usage, uses POS-sent discount amount. CRM can cross-check but POS is source of discount calculation. |
| Q6 | Advanced coupon timing | **B** | V1: flat/percentage. V2: item/category. V3: BOGO/happy-hour. | Incremental delivery. Each phase unlocks more POS capability. | V1 scope is tight. V2/V3 planned but not blocking. |

---

## 5. Q1 — Coupon V1 Scope

**Question:** What coupon types should V1 support?

| Option | Description |
|---|---|
| **A (Selected)** | ORDER_FLAT + ORDER_PERCENTAGE only |
| B | Above + item-level |
| C | Above + item-level + category-level |
| D | Include advanced (BOGO, Buy X Get Y, every Nth, happy hour) |

**FROZEN: Option A.** V1 supports ORDER_FLAT and ORDER_PERCENTAGE only. All existing schema fields (min_order_value, max_discount, usage_limit, per_user_limit, specific_users, applicable_channels, date range, is_active) are carried forward.

---

## 6. Q2 — Coupon + Loyalty Stacking

**Question:** Can coupon and loyalty points be used together on the same order?

| Option | Description |
|---|---|
| A | Yes, always stack |
| B | No, mutually exclusive |
| **C (Selected)** | Allow stacking only if coupon config explicitly allows it |
| D | Decide later |

**FROZEN: Option C.** Add `stackable_with_loyalty: bool = False` to coupon schema. Default: non-stackable. When `False` and POS sends both `coupon_code` + `loyalty_points_used` in the same order, CRM should reject one (recommendation: reject loyalty redemption, honor coupon — or hard-fail with `STACKING_NOT_ALLOWED` error code, letting POS decide). Exact conflict-resolution behavior to be defined in implementation plan.

---

## 7. Q3 — Coupon + Wallet Stacking

**Question:** Can coupon and wallet be used together on the same order?

| Option | Description |
|---|---|
| A | Yes, always stack |
| B | No, mutually exclusive |
| C | Allow stacking only if coupon config allows it |
| **D (Selected)** | Decide later — Wallet CR is separate |

**FROZEN: Option D.** V1 ignores wallet entirely. Coupon validation and recording does not check or interact with wallet fields. Stacking decision deferred to CR-001C-W.

---

## 8. Q4 — Coupon Usage Recording Timing

**Question:** When should coupon usage be recorded?

| Option | Description |
|---|---|
| A | At Apply/Validate click |
| **B (Selected)** | Only at final `/api/pos/orders` payload |
| C | At payment webhook only |
| D | Both Apply click and final order |

**FROZEN: Option B.** Same model as Loyalty LR Correction:

1. POS calls `GET /pos/coupons/available` → reads eligible coupons
2. POS calls `POST /pos/coupons/validate` → calculates discount (read-only, no usage recorded)
3. POS applies coupon locally, adjusts displayed bill
4. POS sends final `POST /pos/orders` payload with `coupon_code` + `coupon_discount`
5. CRM validates coupon at final-order time → records `coupon_usage` with `order_id` → increments `total_used`

`/pos/coupons/apply` is deprecated for POS use (becomes legacy/admin-only). POS should NOT call apply separately — the final order payload is the commit point.

---

## 9. Q5 — Coupon Tax/Subtotal Basis

**Question:** Coupon discount applies on which base amount?

| Option | Description |
|---|---|
| **A (Selected, clarified)** | Pre-tax subtotal. POS applies coupon as discount on subtotal, sends actual discount amount in final payload. |
| B | Post-tax total |
| C | CRM validates against POS-sent order_total |
| D | Configurable per coupon |

**FROZEN: Option A with owner clarification.**

**Owner directive (verbatim):** "Coupon will be applied and POS will send actual discount amount and coupon code etc needed to actually apply coupon — how we did in loyalty. It's treated as discount in POS."

**Interpretation:** The coupon flow mirrors the loyalty redemption flow:
- POS reads coupon eligibility from CRM (available/validate endpoints)
- POS applies coupon locally as a **discount on the pre-tax subtotal**
- POS sends `coupon_code`, `coupon_discount` (the actual Rs amount applied) in the final order payload
- CRM validates the coupon code is valid/active/not-over-limit at final-order time
- CRM records usage with the POS-sent discount amount
- CRM can cross-check the discount amount against its own calculation (and warn/flag variance) but POS is the billing source of truth for the actual applied amount

**New fields expected on `POSOrderWebhook` (forward-only, optional):**
- `coupon_code: Optional[str]` — already exists
- `coupon_discount: float = 0.0` — already exists
- CRM may add `coupon_usage_id` to response (like `loyalty_redeem.transaction_id`)

---

## 10. Q6 — Advanced Coupon Timing

**Question:** When should advanced coupon types be implemented?

| Option | Description |
|---|---|
| A | Include item/category/BOGO/happy-hour in V1 |
| **B (Selected)** | V1: flat/percentage. V2: item/category. V3: BOGO/happy-hour. |
| C | V1: flat/percentage + item/category. BOGO/happy-hour later. |
| D | Build full rule engine first |

**FROZEN: Option B.**

| Phase | Scope |
|---|---|
| V1 (CR-001C-C1) | ORDER_FLAT + ORDER_PERCENTAGE, POS contract, final-order recording |
| V2 (CR-001C-C2) | ITEM_FLAT, ITEM_PERCENTAGE, CATEGORY_FLAT, CATEGORY_PERCENTAGE |
| V3 (CR-001C-C3+) | BOGO, BUY_X_GET_Y, EVERY_NTH_ITEM_FREE, HAPPY_HOUR, FREE_ITEM |

---

## 11. Recommended Coupon V1 Implementation Scope

Based on all 6 frozen decisions:

### New POS endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/pos/coupons/available` | Fetch eligible coupons for customer + order_total. POS auth. |
| `POST /api/pos/coupons/validate` | Validate coupon code. JSON body. Structured error.code. Computed discount. Read-only — no usage recorded. |

### Central coupon service

New `core/coupon_service.py` (or `core/coupon.py`) with:
- `validate_coupon(...)` — shared validation logic, structured result
- `get_available_coupons(...)` — filtered eligible list
- `record_coupon_usage(...)` — atomic usage recording with order linkage + dedup

### Coupon types

- ORDER_FLAT (`discount_type="flat"`)
- ORDER_PERCENTAGE (`discount_type="percentage"`)

### Validation rules (V1)

- Invalid code → `INVALID_CODE`
- Expired → `EXPIRED`
- Inactive → `INACTIVE`
- Min-order not met → `MIN_ORDER_NOT_MET`
- Usage limit reached → `USAGE_LIMIT_REACHED`
- Per-customer limit reached → `CUSTOMER_USAGE_LIMIT_REACHED`
- Customer not eligible → `CUSTOMER_NOT_ELIGIBLE`
- Channel not valid → `CHANNEL_NOT_VALID`
- Stacking conflict → `STACKING_NOT_ALLOWED` (when `stackable_with_loyalty=False` and loyalty also applied)

### Schema additions (forward-only)

- `coupon_type: Optional[str] = "order"` — discriminator for future phases
- `stackable_with_loyalty: bool = False` — stacking control (Q2)
- `order_id` added to `coupon_usage` documents

### Final order integration

- `/api/pos/orders` handler: when `coupon_code` is present and non-empty, validate coupon, record usage, return coupon result in response
- Same "calculate locally, commit at final payload" pattern as loyalty
- Idempotency: same `order_id` replay does not double-record usage

### Analytics alignment

- `get_coupon_stats` reads `coupon_usage` (real-time canonical) in addition to `coupon_transactions` (migration legacy)

---

## 12. Explicitly Out of V1

| Item | Phase | Reason |
|---|---|---|
| ITEM_FLAT / ITEM_PERCENTAGE | V2 | Needs `applicable_items[]`, POS sends `items[]` |
| CATEGORY_FLAT / CATEGORY_PERCENTAGE | V2 | Needs `applicable_categories[]`, category resolution |
| FREE_ITEM | V3 | Needs POS cart integration |
| BOGO / BUY_X_GET_Y | V3 | Needs item matching, cart manipulation |
| EVERY_NTH_ITEM_FREE | V3 | Needs per-customer-per-item frequency counter |
| HAPPY_HOUR / TIME_WINDOW | V3 | Needs time-window fields + restaurant timezone |
| COMBO_FIXED_PRICE / COMBO_FREE_ITEM | V3+ | Complex cart logic |
| WALLET_CASHBACK | CR-001C-W | Wallet CR dependency |
| REFERRAL_COUPON | Future CR | Referral engine needed |
| POS cart auto-add free item | V3 | POS UI/cart work |
| Coupon reversal/refund | Future | Not in V1 |
| Wallet stacking decision | CR-001C-W | Deferred (Q3) |
| Loyalty code changes | None | Loyalty is frozen |
| `/app/memory/final/` | None | Untouched |

---

## 13. Implementation Planning Readiness

All 6 owner decisions are **FROZEN**:

| # | Decision | Status |
|---|---|---|
| Q1 | V1 = ORDER_FLAT + ORDER_PERCENTAGE | FROZEN |
| Q2 | Stacking with loyalty = config-driven (`stackable_with_loyalty`) | FROZEN |
| Q3 | Wallet stacking = deferred to CR-001C-W | FROZEN |
| Q4 | Usage recording = final order payload only | FROZEN |
| Q5 | Discount basis = pre-tax subtotal, POS sends actual amount, same pattern as loyalty | FROZEN |
| Q6 | Advanced timing = V1 flat/pct, V2 item/category, V3 BOGO/happy-hour | FROZEN |

**Status: `ready_for_coupon_v1_implementation_planning`**

---

## 14. Final Status

`cr001c_coupon_v1_owner_decisions_frozen_ready_for_implementation_plan`

All decisions locked. Coupon V1 implementation planning may begin immediately against this frozen contract.
