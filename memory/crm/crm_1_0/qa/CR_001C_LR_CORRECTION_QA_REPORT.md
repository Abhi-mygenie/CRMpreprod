# CR-001C-LR Correction — QA Report

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Status:** `cr001c_lr_correction_qa_passed`
**Harness:** `backend/tests/qa_cr001c_lr_redeem.py`
**Artifact:** `/app/test_reports/cr_001c_lr_qa_results.json`

---

## 1. Setup

- Controlled, synthetic fixtures namespaced `qa_cr001c_lr_*`.
- Transport: live local server `http://localhost:8001` via `requests`.
- DB: remote Mongo `52.66.232.149:27017/mygenie`.
- All fixtures wiped at teardown.

### Teardown audit

```
Teardown removed: {'users': 3, 'settings': 2, 'customers': 8, 'points_tx': 9, 'orders': 2}
```

No production records mutated.

## 2. Summary

| Block | Pass | Fail |
|---|---:|---:|
| QA-1 successful redeem (10 sub-assertions) | 10 | 0 |
| QA-2 auto-cap | 1 | 0 |
| QA-3 below min | 2 | 0 |
| QA-4 loyalty disabled | 3 | 0 |
| QA-5 missing settings | 1 | 0 |
| QA-6 customer not found | 1 | 0 |
| QA-7 invalid points (3) | 3 | 0 |
| QA-8 missing order_id | 1 | 0 |
| QA-9 missing idempotency_key | 1 | 0 |
| QA-10 idempotent retry (5) | 5 | 0 |
| QA-11 idempotency conflict (2) | 2 | 0 |
| QA-12 no tier downgrade | 1 | 0 |
| QA-13 tier-aware redemption (3) | 3 | 0 |
| QA-14 LX-A 6-key blob regression | 1 | 0 |
| QA-15 `/api/health` regression | 1 | 0 |
| **QA-16 /max-redeemable alignment** (7) | **7** | **0** |
| **QA-17 calculator-cap == commit-cap parity** | **1** | **0** |
| **QA-18 /pos/orders embedded redeem** (3) | **3** | **0** |
| **QA-19 /pos/orders order_id-derived idempotency fallback** | **1** | **0** |
| **QA-20 /pos/orders hard-fail on redeem rejection** | **1** | **0** |
| **QA-21 /pos/orders accepts POS-legacy alias `used_loyalty_point`** (alias addendum, 2026-05-24) | **1** | **0** |
| **TOTAL** | **52** | **0** |

**52 / 52 PASSED.**

## 3. Correction-Specific Case Log

### 3.1 `/api/pos/max-redeemable` alignment (QA-16)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-16a | Happy: Gold customer, `customer_id`, bill ₹1000 | PASS | `ratio_per_point=1.5`, `tier="Gold"`, `available_points=240` echoed |
| QA-16a.1 | Cap math matches `compute_max_redeemable` | PASS | `max_points_redeemable=240`, `max_discount_value=360.0` |
| QA-16a.2 | Echoed `min_redemption_points=50`, `loyalty_enabled=true` | PASS | |
| QA-16b | Back-compat: lookup by `cust_mobile` (no `customer_id`) | PASS | resolves same Gold customer |
| QA-16c | Neither identifier → `INVALID_REQUEST` | PASS | `success=false`, structured error |
| QA-16d | `loyalty_enabled=false` → `LOYALTY_DISABLED` + 0 redeemable | PASS | no fake-default fallback |
| QA-16e | No `loyalty_settings` → `SETTINGS_MISSING` + 0 redeemable | PASS | no hardcoded `{0.25, 100, 50%, ₹500}` |
| QA-16f | Customer below `min_redemption_points` → `BELOW_MIN_REDEMPTION` + 0 | PASS | echoed `available=10, min=50` |
| QA-16g | Unknown `customer_id` → `CUSTOMER_NOT_FOUND` | PASS | |

### 3.2 Shared-helper parity (QA-17)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-17 | Calculator cap (`/max-redeemable`) on ₹200 bill EQUALS commit auto-cap (`/loyalty/redeem` with 99999 requested) | PASS | both = 200 pts |

**Structural guarantee:** Display cap and commit cap are produced by the same `compute_max_redeemable` function. They cannot diverge.

### 3.3 `/api/pos/orders` redeem-at-final-payload (QA-18)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-18 | Order webhook with `loyalty_points_used=100` commits redeem via shared helper | PASS | PT row created: `points=100, transaction_type="redeem", order_id, idempotency_key, redeemed_value=100.0` |
| QA-18.a | `customer.total_points_redeemed` incremented through `/pos/orders` path | PASS | 0 → 100 (counter parity preserved) |
| QA-18.b | Earn computed on NET base (order_amount − loyalty_discount) | PASS | bill=500, redeemed=100 → earn_base=400 → 400 × 5% = 20 pts earned (Q-CORR-3 Option B) |

Order webhook response carries `data.loyalty_redeem` block with helper's full result data.

### 3.4 Idempotency fallback on `/pos/orders` (QA-19)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-19 | Order webhook replayed twice with NO `loyalty_idempotency_key` (server derives `order_<id>`) | PASS | PT row count = 1, `total_points_redeemed` = 80 (not 160), key used = `order_qa_cr001c_lr_ORDER_002_IDEMFB` |

This validates Q-CORR-4 Option A: POS retries of the order webhook (which already replay the same `order_id`) are automatically idempotent on the loyalty side with zero POS code change.

### 3.5 Hard-fail semantics on `/pos/orders` (QA-20)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-20 | Order with `loyalty_points_used=100` for customer with only 10 pts (< min=50) → `BELOW_MIN_REDEMPTION` | PASS | order_response.success=false, **no order persisted**, **no PT row persisted** |

This validates Q-CORR-2 Option C: redemption errors hard-fail the entire order webhook so the bill total never silently diverges from CRM truth.

### 3.6 Alias addendum on `/pos/orders` (QA-21, 2026-05-24)

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-21 | Order webhook posted with **POS-legacy alias** `"used_loyalty_point": 100` (instead of canonical `"loyalty_points_used"`) → CRM accepts and commits redeem identically | PASS | `data.loyalty_redeem.points_redeemed=100`, `data.loyalty_redeem.redeemed_value=100.0`, `data.loyalty_redeem.transaction_id` populated, `points_earned=20` (earn-on-net 5% of ₹400 = 20 — same as canonical QA-18.b), `customer.total_points_redeemed` = 0 → 100, PT row stamped with `transaction_type="redeem"`, `points=100`, `order_id`, `idempotency_key`, `redeemed_value`, `ratio_per_point` |

Structurally proves the canonical and alias paths run through the **same** `core/loyalty.redeem_loyalty_points` helper — Pydantic `validation_alias` resolves both incoming names to the same internal field before the handler executes. No double-application possible. Plural alias `used_loyalty_points` also accepted by the same `AliasChoices` (smoke-verified via schema). Aliases retire in L5 cleanup.

## 4. Sample Responses

### 4.1 `/api/pos/max-redeemable` happy path (Gold)

```json
{
  "success": true,
  "message": "Max redeemable calculated",
  "data": {
    "max_points_redeemable": 240,
    "max_discount_value": 360.0,
    "ratio_per_point": 1.5,
    "tier": "Gold",
    "available_points": 240,
    "min_redemption_points": 50,
    "loyalty_enabled": true
  }
}
```

### 4.2 `/api/pos/max-redeemable` LOYALTY_DISABLED

```json
{
  "success": true,
  "message": "Loyalty program is currently disabled.",
  "data": {
    "max_points_redeemable": 0,
    "max_discount_value": 0.0,
    "ratio_per_point": 0.0,
    "tier": "Bronze",
    "available_points": 500,
    "min_redemption_points": 0,
    "loyalty_enabled": false,
    "error": {
      "code": "LOYALTY_DISABLED",
      "message": "Loyalty program is currently disabled."
    }
  }
}
```

### 4.3 `/api/pos/orders` redeem-on-final-payload success

```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "...",
    "pos_order_id": "qa_cr001c_lr_ORDER_001",
    "customer_id": "qa_cr001c_lr_cust_order",
    "order_amount": 500.0,
    "points_earned": 20,
    "total_points": 220,
    "tier": "Bronze",
    "loyalty_redeem": {
      "customer_id": "qa_cr001c_lr_cust_order",
      "points_redeemed": 100,
      "ratio_per_point": 1.0,
      "redeemed_value": 100.0,
      "remaining_points": 200,
      "remaining_points_value": 200.0,
      "tier": "Bronze",
      "total_points_redeemed": 100,
      "transaction_id": "05bffd14-fe2e-4bbe-9892-17ccbcd8c1e6"
    }
  }
}
```

### 4.4 `/api/pos/orders` hard-fail on redeem rejection

```json
{
  "success": false,
  "message": "Loyalty redemption failed: Minimum 50 points required. Customer has 10.",
  "data": {
    "error": {
      "code": "BELOW_MIN_REDEMPTION",
      "message": "Minimum 50 points required. Customer has 10.",
      "min_redemption_points": 50,
      "available_points": 10
    }
  }
}
```

## 5. Regression Proof

| Check | Result |
|---|---|
| All 36 original LR assertions still pass after helper refactor | ✅ |
| LX-A `build_pos_loyalty_blob` strict 6-key contract unchanged | ✅ (QA-14) |
| `/api/health` 200 | ✅ (QA-15) |
| Lint (`ruff` on `core/loyalty.py` + `routers/pos.py`) | ✅ all checks passed |
| Backend supervisor status | RUNNING (clean hot reload) |
| `routers/points.py`, `core/helpers.py`, `core/whatsapp.py` | Unchanged from `origin/23-may` |

## 6. Final Status

`cr001c_lr_correction_qa_passed`

---

## 7. Current Blocker Before Final Realtime Redemption QA

**Overall loyalty status:** `cr001c_loyalty_waiting_pos_loyalty_points_key_for_final_realtime_redemption_qa`

Controlled QA: **52/52 PASS** (this report). Final live POS order redemption QA is pending — POS must send `used_loyalty_point` / `loyalty_points_used` + actual `order_amount` in the final `/api/pos/orders` payload. Without this key, CRM cannot trigger redemption. Once POS sends it, run CR-001C-LR Realtime Order Redemption Verification. Target: `cr001c_lr_realtime_order_redemption_verified`.
