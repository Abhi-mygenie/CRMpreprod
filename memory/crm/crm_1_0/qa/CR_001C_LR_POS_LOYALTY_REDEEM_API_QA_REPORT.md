# CR-001C-LR — POS Loyalty Redeem API — QA Report

**Module:** CR-001C-LR
**Endpoint:** `POST /api/pos/loyalty/redeem`
**Date:** 2026-05-23
**Status:** `cr001c_lr_pos_loyalty_redeem_api_qa_passed`

---

## 1. QA Setup

- **Harness:** `backend/tests/qa_cr001c_lr_redeem.py` (controlled, synthetic, self-cleaning).
- **Transport:** live local server `http://localhost:8001` via `requests` (FastAPI `TestClient` was rejected by Motor's event loop binding; switching to the live, supervisor-managed server avoids the issue while exercising the same code path and Mongo target).
- **DB:** the production-bound remote Mongo (`52.66.232.149:27017/mygenie`) is in use. **All fixtures are namespaced under `qa_cr001c_lr_*` and deleted by `teardown_fixtures()` at the end of the run.**
- **Teardown proof:** see "teardown removed" line below — every fixture user, settings, customer, and PT row inserted by the harness was deleted.
- **Run artifact:** `/app/test_reports/cr_001c_lr_qa_results.json`.

```
Teardown removed: {'users': 3, 'settings': 2, 'customers': 5, 'points_tx': 4}
```

No production records were mutated.

### Fixtures created

| Fixture id | Tier | Points | Settings |
|---|---|---|---|
| `qa_cr001c_lr_user_001` (`apikey=qa_cr001c_lr_apikey_001`) | — | — | `loyalty_enabled=true`, `redemption_value=1.0`, `gold_redemption_value=1.5`, `min_redemption_points=50`, `max_redemption_percent=100`, `max_redemption_amount=999999` |
| `qa_cr001c_lr_cust_basic` | Bronze | 500 / earned 1000 / redeemed 200 | — |
| `qa_cr001c_lr_cust_gold` | Gold | 400 / earned 5000 / redeemed 0 | — |
| `qa_cr001c_lr_cust_lowpoints` | Bronze | 10 / earned 10 | — |
| `qa_cr001c_lr_user_nosettings` (+ `cust_nosettings`) | — | — | NO `loyalty_settings` doc |
| `qa_cr001c_lr_user_disabled` (+ `cust_disabled`) | — | 500 | `loyalty_enabled=false` |

---

## 2. Results Summary

| Block | Pass | Fail |
|---|---:|---:|
| QA-1 successful redeem (10 assertions) | 10 | 0 |
| QA-2 auto-cap | 1 | 0 |
| QA-3 below min redemption | 2 | 0 |
| QA-4 loyalty disabled | 3 | 0 |
| QA-5 missing settings | 1 | 0 |
| QA-6 customer not found | 1 | 0 |
| QA-7 invalid points (0 / negative / float) | 3 | 0 |
| QA-8 missing order_id | 1 | 0 |
| QA-9 missing idempotency_key | 1 | 0 |
| QA-10 idempotent retry | 5 | 0 |
| QA-11 idempotency conflict (points + customer) | 2 | 0 |
| QA-12 no tier downgrade | 1 | 0 |
| QA-13 tier-aware redemption (Gold 1.5) | 3 | 0 |
| QA-14 LX-A regression (strict 6-key blob) | 1 | 0 |
| QA-15 health regression | 1 | 0 |
| **TOTAL** | **36** | **0** |

**36 / 36 PASSED.**

---

## 3. Sample Responses

### 3.1 Sample success response (QA-1)

```json
{
  "success": true,
  "message": "Points redeemed successfully",
  "data": {
    "customer_id": "qa_cr001c_lr_cust_basic",
    "points_redeemed": 100,
    "ratio_per_point": 1.0,
    "redeemed_value": 100.0,
    "remaining_points": 400,
    "remaining_points_value": 400.0,
    "tier": "Bronze",
    "total_points_redeemed": 300,
    "transaction_id": "53e3faef-be5c-4e53-94dc-5396b92156c7"
  }
}
```

### 3.2 Sample failure response (QA-5)

```json
{
  "success": false,
  "message": "Loyalty settings not configured for this restaurant.",
  "data": {
    "error": {
      "code": "SETTINGS_MISSING",
      "message": "Loyalty settings not configured."
    }
  }
}
```

### 3.3 Sample failure response (QA-11 — idempotency conflict)

```json
{
  "success": false,
  "message": "Idempotency key conflict.",
  "data": {
    "error": {
      "code": "IDEMPOTENCY_CONFLICT",
      "message": "idempotency_key was previously used with different parameters.",
      "existing": {
        "customer_id": "qa_cr001c_lr_cust_gold",
        "order_id": "QA_ORDER_GOLD_1",
        "points": 100
      }
    }
  }
}
```

---

## 4. Detailed Case Log

| # | Case | Result | Evidence |
|---|---|---|---|
| QA-1 | Successful redeem returns `HTTP 200 success=true` | PASS | resp.data.points_redeemed=100, redeemed_value=100.0 |
| QA-1.a | `total_points` decremented by 100 | PASS | before=500 → after=400 |
| QA-1.b | `total_points_redeemed` incremented by 100 | PASS | before=200 → after=300 |
| QA-1.c | PT row created | PASS | tx_id=53e3faef-… |
| QA-1.d | `transaction_type="redeem"` | PASS | |
| QA-1.e | `points` stored POSITIVE (=100) | PASS | per Q-LR2 |
| QA-1.f | `redeemed_value = points × ratio` (Bronze 1.0) | PASS | 100.0 |
| QA-1.g | PT carries `order_id` | PASS | "QA_ORDER_001" |
| QA-1.h | PT carries `idempotency_key` | PASS | |
| QA-1.i | `tier` UNCHANGED after redeem | PASS | Bronze→Bronze (Q-LR1) |
| QA-2 | Auto-cap (requested 9999, available 400) | PASS | resp.points_redeemed=400, remaining=0; no `INSUFFICIENT_POINTS` (Q-LR6) |
| QA-3 | Requested < min_redemption_points (25 < 50) | PASS | `BELOW_MIN_REDEMPTION` |
| QA-3.a | Customer untouched on min-fail | PASS | total_points unchanged |
| QA-4 | `loyalty_enabled=false` → `LOYALTY_DISABLED` | PASS | (Q-LR4) |
| QA-4.a | No customer mutation on disabled | PASS | balance=500 unchanged |
| QA-4.b | No PT row inserted on disabled | PASS | `find_one == None` |
| QA-5 | No `loyalty_settings` doc → `SETTINGS_MISSING` | PASS | |
| QA-6 | Unknown customer → `CUSTOMER_NOT_FOUND` | PASS | |
| QA-7 (0) | `points_to_redeem=0` → `INVALID_POINTS` | PASS | |
| QA-7 (−10) | `points_to_redeem=−10` → `INVALID_POINTS` | PASS | |
| QA-7.c | `points_to_redeem=12.5` → HTTP 422 (Pydantic) | PASS | int_from_float error |
| QA-8 | `order_id=""` → `ORDER_ID_REQUIRED` | PASS | (Q-LR5) |
| QA-9 | `idempotency_key="   "` → `IDEMPOTENCY_KEY_REQUIRED` | PASS | (Q-LR3) |
| QA-10 | First call success (Gold) | PASS | points_redeemed=100, ratio=1.5, redeemed_value=150.0 |
| QA-10.a | Replay returns `success=true` with `idempotent=true` | PASS | same tx_id |
| QA-10.b | `total_points` decremented EXACTLY ONCE | PASS | before=400 → after=300 (not 200) |
| QA-10.c | `total_points_redeemed` incremented EXACTLY ONCE | PASS | before=0 → after=100 (not 200) |
| QA-10.d | Only ONE PT row stored for the idempotency_key | PASS | count=1 |
| QA-11 | Same key, different `points` (100→250) → `IDEMPOTENCY_CONFLICT` | PASS | existing block returned |
| QA-11.a | Same key, different `customer_id` → `IDEMPOTENCY_CONFLICT` | PASS | |
| QA-12 | Tier unchanged after redeem (still Gold) | PASS | |
| QA-13 | Gold `ratio_per_point = 1.5` (per-tier override applied) | PASS | LX-A `get_redemption_value_for_tier` used |
| QA-13.a | Gold redeemed_value `60 × 1.5 = 90.0` | PASS | |
| QA-13.b | PT row carries `ratio_per_point=1.5` snapshot | PASS | forward-compatible audit |
| QA-14 | LX-A blob strict 6-key contract unchanged | PASS | keys = {loyalty_enabled, tier, tier_label, total_points, ratio_per_point, points_value} |
| QA-15 | `/api/health` returns 200 | PASS | |

---

## 5. Mutation / Counter Proof (QA-1)

| Field | Before | After | Delta | Rule |
|---|---:|---:|---:|---|
| `customers.total_points` | 500 | 400 | −100 | `$set` |
| `customers.total_points_redeemed` | 200 | 300 | +100 | `$inc` |
| `customers.tier` | Bronze | Bronze | — | NOT touched (Q-LR1) |
| `customers.total_points_earned` | 1000 | 1000 | — | NOT touched (earn-only) |
| `points_transactions` rows for tx_id | 0 | 1 | +1 | insert with `transaction_type="redeem"`, `points=100`, `redeemed_value=100.0`, `balance_after=400`, `idempotency_key`, `order_id` |

---

## 6. Idempotency Proof (QA-10)

| Step | Action | `total_points` | `total_points_redeemed` | PT rows w/ key |
|---|---|---:|---:|---:|
| Initial | (setup) | 400 | 0 | 0 |
| Call 1 | first redeem(100, key=K) | 300 | 100 | 1 |
| Call 2 | replay redeem(100, key=K) | **300** ✓ | **100** ✓ | **1** ✓ |

Replay returned `success=true`, `data.idempotent=true`, and the original `transaction_id`. **No double-decrement, no duplicate PT row.**

Conflict path (QA-11):

```
key=K, points=100 already persisted
→ second call with key=K, points=250
→ HTTP 200, success=false, error.code=IDEMPOTENCY_CONFLICT
→ existing = {customer_id, order_id, points=100} returned for diagnostics
→ no customer mutation, no new PT row
```

---

## 7. Regression Proof

| Check | Result |
|---|---|
| LX-A `build_pos_loyalty_blob` strict 6-key contract | PASS (QA-14) — keys identical to LX-A QA report. |
| `/api/health` | PASS (QA-15) — 200. |
| Backend supervisor status | RUNNING (no restart loops; hot reload clean). |
| Lint (`ruff` on `backend/routers/pos.py`) | All checks passed. |
| `core/loyalty.py`, `core/helpers.py`, `routers/points.py` diff | Unchanged from `origin/23-may`. |
| L3 migration artifacts | Untouched; collection-level isolation verified by QA fixture namespacing. |

The remote Mongo's existing production-shaped collections were used **read-only outside the QA namespace**. All QA writes occur on `qa_cr001c_lr_*`-prefixed records and are deleted before exit.

---

## 8. Limitations / Notes

1. **Reverse endpoint not built** (out of scope by strict stop rule). PT row schema (`order_id`, `idempotency_key`, `ratio_per_point`, `redeemed_value`) is forward-compatible.
2. **Existing defects in admin path (`routers/points.py`) and order-webhook embedded redeem (`routers/pos.py:1543-1598`)** — both omit `$inc total_points_redeemed` — are explicitly deferred to L4 per scope lock.
3. **No new Mongo index added** (`{user_id:1, idempotency_key:1}` was recommended in the plan but is deferred to L5 cleanup as agreed in the plan §7.4).
4. **Live-server transport** in the QA harness exercises the same FastAPI app the supervisor runs; this is intentional. The harness does not require a separate test runner.

---

## 9. Final Status

`cr001c_lr_pos_loyalty_redeem_api_qa_passed`
