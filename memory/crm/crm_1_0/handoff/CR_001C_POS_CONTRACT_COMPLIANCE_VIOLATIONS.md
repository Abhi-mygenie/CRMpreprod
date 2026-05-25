# CR-001C-C — POS Contract Compliance Report

**Date:** 2026-05-25
**Status:** `cr001c_pos_contract_compliance_violations_reported_waiting_pos_fix`

---

## POS Contract Violations Found

Based on live order 868999 (R689, Kunafa Mahal) vs the agreed contract for `POST /api/pos/orders`:

### VIOLATION 1 — BLOCKER: `pos_food_id` missing from items
| | Contract | POS Sends Today |
|---|---|---|
| Field | `pos_food_id: "182048"` (stable product.id) | **MISSING** — sends `item_id: "2248782"` (order-line ID, changes every order) |
| Impact | **Item/category coupons will silently fail to match** |

### VIOLATION 2: `item_category` missing from items
| | Contract | POS Sends Today |
|---|---|---|
| Field | `item_category: "Dubai Laban"` | **MISSING** |
| Impact | Category coupons cannot match by name |

### VIOLATION 3: `item_qty` sent as `qty`
| | Contract | POS Sends Today |
|---|---|---|
| Field | `item_qty: 1` | `qty: 1` |
| Impact | Low — CRM alias handles this (CR-001A) |

### VIOLATION 4: `item_price` sent as `price`
| | Contract | POS Sends Today |
|---|---|---|
| Field | `item_price: 379` | `price: 379` |
| Impact | Low — CRM alias handles this (CR-001A) |

### VIOLATION 5: `loyalty_info` wrapper not in contract
| | Contract | POS Sends Today |
|---|---|---|
| Field | `loyalty_points_used: 200` (top-level) | `loyalty_info: { loyalty_points_used: 0 }` (nested) |
| Impact | **CRM reads top-level `loyalty_points_used` — nested wrapper is ignored. Loyalty redemption will not trigger.** |

### VIOLATION 6: `coupon_info` wrapper not in contract
| | Contract | POS Sends Today |
|---|---|---|
| Field | `coupon_code: "BOGO_PIZZA"` (top-level) | `coupon_info: {}` (nested, empty) |
| Impact | **CRM reads top-level `coupon_code` — nested wrapper is ignored. Coupon commit will not trigger.** |

### VIOLATION 7: `wallet_info` wrapper not in contract
| | Contract | POS Sends Today |
|---|---|---|
| Field | `wallet_used: 0.0` (top-level) | `wallet_info: { amount: 0, applied: false }` (nested) |
| Impact | CRM reads top-level `wallet_used` — nested ignored. Wallet deduction won't trigger. |

---

## Summary

| # | Violation | Severity | CRM Workaround? |
|---|---|---|---|
| 1 | `pos_food_id` missing | **BLOCKER** | No — order-line IDs are useless for matching |
| 2 | `item_category` missing | High | Partial — can match by `category_id` if sent |
| 3 | `qty` instead of `item_qty` | Low | Yes — CRM alias (CR-001A) |
| 4 | `price` instead of `item_price` | Low | Yes — CRM alias (CR-001A) |
| 5 | `loyalty_info` nested wrapper | **High** | No — CRM reads top-level fields only |
| 6 | `coupon_info` nested wrapper | **High** | No — CRM reads top-level fields only |
| 7 | `wallet_info` nested wrapper | Medium | No — CRM reads top-level fields only |

---

## POS Team Action Required

**Priority 1 (Blockers):**
1. Add `pos_food_id` (product.id from menu catalog) to each item in the items array
2. Send `loyalty_points_used`, `loyalty_discount`, `loyalty_idempotency_key` as **top-level fields** — not inside a `loyalty_info` wrapper
3. Send `coupon_code`, `coupon_discount`, `coupon_title`, `coupon_type` as **top-level fields** — not inside a `coupon_info` wrapper

**Priority 2:**
4. Add `item_category` (category name string) to each item
5. Send `wallet_used` as top-level — not inside `wallet_info` wrapper

**Priority 3 (nice to have, CRM aliases handle today):**
6. Rename `qty` → `item_qty`, `price` → `item_price` per contract

---

## CRM Planning Continues As Per Contract

CRM implementation proceeds assuming POS will correct to the agreed contract. No CRM code changes needed — the contract is already fully implemented in CRM.
