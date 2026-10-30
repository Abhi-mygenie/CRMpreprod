# CR-001C-LR — POS Loyalty Redeem API Analysis & Plan

**Module:** CR-001C-LR (Loyalty Redeem — mini-phase)
**Date:** 2026-05-23
**Status:** `cr001c_lr_pos_loyalty_redeem_api_plan_waiting_owner_approval`

---

## 1. Executive Summary

A dedicated `POST /api/pos/loyalty/redeem` endpoint is needed for POS billing. Two existing code paths already handle loyalty redemption in the CRM — a generic admin transaction endpoint and an embedded block inside the POS order webhook — but neither is suitable for POS's standalone "redeem points at billing" flow. Both existing paths have the same two defects: they don't increment `total_points_redeemed` and don't use the tier-aware `get_redemption_value_for_tier(...)` from LX-A.

This plan proposes a new, focused POS endpoint with: idempotency guard, tier-aware redemption value, min/max guardrails, loyalty kill-switch check, proper counter updates (`total_points`, `total_points_redeemed`), no tier downgrade, and a clean PT row with audit fields. Estimated at ~80-100 lines in one file (`routers/pos.py`), plus ~30 QA assertions.

---

## 2. Current Loyalty State

| Phase | Status | Relevance to LR |
|---|---|---|
| L1 — shared helper | ✅ | `calculate_tier`, `get_earn_percent_for_tier` |
| L2 — POS realtime earn | ✅ | POS order webhook earn path |
| L3 — migration clean-slate | ✅ | `total_points` on migrated customers is clean |
| LX-A — POS read contract | ✅ | `ratio_per_point` + `points_value` exposed via 6-key blob |
| LF-MERGE — loyalty_enabled | ✅ | Single flag controls earning; LR must respect it for redeem too |
| BUG-L3-001 — expiry fix | ✅ | Expired points already excluded from `total_points` |
| `get_redemption_value_for_tier` | ✅ in `core/helpers.py:31` | Per-tier → restaurant-level → 0.25 fallback |

**Key LX-A asset the redeem API can reuse:** `get_redemption_value_for_tier(tier, settings)` already resolves the ₹-per-point ratio. The new endpoint just needs to call it, multiply, validate, and write.

---

## 3. Existing Redeem Code Audit

### 3.1 Admin CRM endpoint — `POST /api/points/transaction` (`routers/points.py:19-95`)

| # | Question | Finding |
|---|---|---|
| 1 | Exists? | ✅ Yes — generic transaction endpoint accepting `transaction_type="redeem"` |
| 2 | POS-facing? | ❌ No — uses `get_current_user` (JWT auth), not `verify_pos_auth` (X-API-Key) |
| 3 | Decrements `total_points`? | ✅ Yes — `new_balance = current_points - tx_data.points` (line 35) |
| 4 | Increments `total_points_redeemed`? | ❌ **NO** — only `$set total_points` (line 51). Known DEFECT-L4-R1. |
| 5 | Creates PT row? | ✅ Yes — `transaction_type="redeem"`, `points` stored positive (line 58) |
| 6 | Uses `get_redemption_value_for_tier`? | ❌ No — caller sends raw `points` count. No ₹ value computed server-side. |
| 7 | Checks `loyalty_enabled`? | ❌ No |
| 8 | Validates min/max redemption? | ❌ No — only "Insufficient points" check |
| 9 | Idempotency? | ❌ None |
| 10 | Stores `order_id`? | ❌ No `order_id` field on PT doc |

**Verdict:** Usable for admin UI redemptions. Not suitable for POS billing.

### 3.2 POS order webhook embedded redeem — `routers/pos.py:1543-1598`

| # | Question | Finding |
|---|---|---|
| 1 | Exists? | ✅ Yes — embedded in the `POST /api/pos/orders` order webhook |
| 2 | POS-facing? | ✅ Yes — `verify_pos_auth` |
| 3 | Decrements `total_points`? | ✅ Yes — `$set total_points: new_points` (line 1571) |
| 4 | Increments `total_points_redeemed`? | ❌ **NO** — same defect as 3.1 |
| 5 | Creates PT row? | ✅ Yes — `transaction_type="redeem"`, points positive (line 1578) |
| 6 | Uses `get_redemption_value_for_tier`? | ❌ No — uses flat `settings.redemption_value` (line 1550). Not tier-aware. |
| 7 | Checks `loyalty_enabled`? | ❌ Not gated on `loyalty_enabled` |
| 8 | Validates min/max? | ✅ Partially — checks `min_redemption_points`, `max_redemption_percent`, `max_redemption_amount` |
| 9 | Idempotency? | ❌ None for the redeem sub-step (order webhook has its own order-level dedup) |
| 10 | Stores `order_id`? | ❌ No `order_id` on the PT doc |

**Verdict:** Tightly coupled to order placement. Cannot be called standalone during billing.

### 3.3 POS max-redeemable — `POST /api/pos/max-redeemable` (`routers/pos.py:443-522`)

Read-only helper: given a bill amount and customer phone, calculates the max points the customer can redeem considering min/max guardrails. Does NOT redeem anything. Uses flat `settings.redemption_value` (not tier-aware).

**Verdict:** Useful reference for guardrail logic. Should be upgraded to tier-aware in a follow-up (out of LR scope unless owner asks).

---

## 4. Existing POS Endpoint Audit

| Endpoint | Auth | Redeem? | Standalone? |
|---|---|---|---|
| `POST /api/pos/orders` | `verify_pos_auth` | ✅ Embedded redeem during order placement | ❌ Cannot call for standalone redeem |
| `POST /api/pos/max-redeemable` | `verify_pos_auth` | ❌ Read-only calculator | N/A |
| `POST /api/points/transaction` | `get_current_user` (JWT) | ✅ Generic redeem | ❌ Wrong auth for POS |
| `POST /api/pos/loyalty/redeem` | — | ❌ **DOES NOT EXIST** | — |

**Conclusion:** No existing endpoint serves POS standalone loyalty redeem. A new endpoint is required.

---

## 5. Recommended API Contract

### Endpoint

```
POST /api/pos/loyalty/redeem
```

### Auth

```
X-API-Key: <crm_token>   (verify_pos_auth — same as all POS endpoints)
```

### Request Body

```json
{
  "customer_id": "cust_abc123",
  "points_to_redeem": 100,
  "order_id": "868999",
  "order_total": 850.0,
  "idempotency_key": "pos_order_868999_loyalty_100"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `customer_id` | string | ✅ | CRM customer UUID |
| `points_to_redeem` | int | ✅ | Must be > 0 |
| `order_id` | string | ✅ | POS order ID for audit trail (Q-LR5: recommended required) |
| `order_total` | float | ✅ | Bill total for max-redemption-percent guardrail |
| `idempotency_key` | string | ✅ | Unique per redeem attempt. POS retries with the same key get the original response, not a double-deduction. |

### Success Response

```json
{
  "success": true,
  "message": "Points redeemed successfully",
  "data": {
    "customer_id": "cust_abc123",
    "points_redeemed": 100,
    "ratio_per_point": 1.5,
    "redeemed_value": 150.0,
    "remaining_points": 380,
    "remaining_points_value": 570.0,
    "tier": "Gold",
    "total_points_redeemed": 200,
    "transaction_id": "pt_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

| Response Field | Description |
|---|---|
| `points_redeemed` | Actual points deducted (may be capped by guardrails) |
| `ratio_per_point` | ₹ per point used (from `get_redemption_value_for_tier`) |
| `redeemed_value` | `points_redeemed × ratio_per_point` |
| `remaining_points` | Customer `total_points` after redeem |
| `remaining_points_value` | `remaining_points × ratio_per_point` |
| `tier` | Customer tier (unchanged — no downgrade on redeem) |
| `total_points_redeemed` | Lifetime cumulative redeemed points |
| `transaction_id` | PT row UUID for receipt/audit |

### Failure Response

```json
{
  "success": false,
  "message": "Customer does not have enough points.",
  "error": {
    "code": "INSUFFICIENT_POINTS",
    "message": "Customer has 50 points but 100 requested."
  }
}
```

### Error Codes

| Code | HTTP | When |
|---|---|---|
| `LOYALTY_DISABLED` | 200 (success=false) | `loyalty_enabled=false` for the restaurant |
| `CUSTOMER_NOT_FOUND` | 200 (success=false) | `customer_id` not found for this restaurant |
| `INVALID_POINTS` | 200 (success=false) | `points_to_redeem` ≤ 0 or not integer |
| `BELOW_MIN_REDEMPTION` | 200 (success=false) | `points_to_redeem < min_redemption_points` OR customer `total_points < min_redemption_points` |
| `EXCEEDS_MAX_REDEMPTION` | 200 (success=false) | Redeemed value would exceed `max_redemption_percent` of order_total or `max_redemption_amount` |
| `INSUFFICIENT_POINTS` | 200 (success=false) | `customer.total_points < points_to_redeem` |
| `IDEMPOTENCY_HIT` | 200 (success=true) | Same `idempotency_key` already processed — return original result, no double-deduction |
| `SETTINGS_MISSING` | 200 (success=false) | No `loyalty_settings` doc for this restaurant |

**Design note:** All errors return HTTP 200 with `success=false` to match the existing `POSResponse` pattern used by every other POS endpoint. POS frontend checks `success` field, not HTTP status.

---

## 6. Business Rules

### R1: Loyalty kill-switch

If `loyalty_enabled=false` → reject with `LOYALTY_DISABLED`. No redemption while loyalty is off.

### R2: Point validation

`points_to_redeem` must be a positive integer > 0.

### R3: Minimum redemption

If `settings.min_redemption_points` exists and `points_to_redeem < min_redemption_points` → reject with `BELOW_MIN_REDEMPTION`. Also reject if customer's `total_points < min_redemption_points` (not enough to meet the threshold at all).

### R4: Maximum redemption guardrails

Compute three ceilings:
1. `max_by_percent = order_total × max_redemption_percent / 100`
2. `max_by_cap = max_redemption_amount`
3. `max_by_points = total_points × ratio_per_point`

`max_discount = min(max_by_percent, max_by_cap, max_by_points)`
`max_redeemable_points = int(max_discount / ratio_per_point)`

If `points_to_redeem > max_redeemable_points` → reject with `EXCEEDS_MAX_REDEMPTION` and include `max_redeemable_points` in the error data so POS can auto-correct.

**Alternative (auto-cap):** Instead of rejecting, silently cap `points_to_redeem` to `max_redeemable_points` and return the capped value. This matches the existing order webhook behavior (lines 1559-1565) which silently caps. **Question Q-LR6 for owner.**

### R5: Sufficient points

`customer.total_points >= points_to_redeem` (after min/max validation). Expired points are already excluded from `total_points` (per L3 + BUG-L3-001).

### R6: Tier-aware redemption value

Use `get_redemption_value_for_tier(customer.tier, settings)` from LX-A. This resolves per-tier override → restaurant-level → 0.25 fallback. Same resolution the POS read endpoints return in `ratio_per_point`.

### R7: No tier downgrade

Tier should NOT change on redeem. Tier is based on lifetime earning behavior (spend/earned), not current spendable balance. The existing admin redeem path incorrectly calls `calculate_tier(new_balance, settings)` (line 39 in `points.py`) which WOULD downgrade — this is a defect in the admin path but we will NOT replicate it in the POS redeem API.

**Implementation:** Simply do not touch the `tier` field in the customer `$set`.

---

## 7. Data Writes

### 7.1 Customer update

```python
await db.customers.update_one(
    {"id": customer_id},
    {
        "$set": {"total_points": new_balance},
        "$inc": {"total_points_redeemed": points_redeemed}
    }
)
```

| Field | Operation | Note |
|---|---|---|
| `total_points` | `$set` to `current - points_redeemed` | Spendable balance decreases |
| `total_points_redeemed` | `$inc` by `points_redeemed` | Lifetime redeemed counter grows |
| `tier` | **NOT touched** | No downgrade on redeem |
| `total_points_earned` | **NOT touched** | Earned counter is earn-only |

### 7.2 Points transaction insert

```python
tx_doc = {
    "id": str(uuid.uuid4()),
    "user_id": user_id,
    "customer_id": customer_id,
    "order_id": order_id,                     # POS order reference
    "points": points_redeemed,                 # POSITIVE (convention: §7.3)
    "transaction_type": "redeem",
    "description": f"Redeemed {points_redeemed} pts (₹{redeemed_value}) on order {order_id}",
    "bill_amount": order_total,
    "balance_after": new_balance,
    "redeemed_value": redeemed_value,          # ₹ amount (NEW field for audit)
    "ratio_per_point": ratio_per_point,        # Exchange rate snapshot (NEW field for audit)
    "idempotency_key": idempotency_key,        # For dedup (NEW field)
    "created_at": datetime.now(timezone.utc).isoformat(),
    "points_expired": False,                   # Redeem rows don't expire
}
await db.points_transactions.insert_one(tx_doc)
```

### 7.3 Points sign convention — POSITIVE

Existing DB evidence: the only redeem PT row in the database stores `points=100` (positive). The existing admin redeem code (`points.py:58`) stores `points=tx_data.points` (positive). The POS webhook redeem code (`pos.py:1578`) stores `points=points_to_redeem` (positive). The `transaction_type="redeem"` field distinguishes direction.

**Convention established:** Store points as **positive integer** for all transaction types. `transaction_type` indicates direction. This matches 100% of existing code.

### 7.4 Idempotency guard

Before any write, query:

```python
existing = await db.points_transactions.find_one({
    "user_id": user_id,
    "idempotency_key": idempotency_key,
    "transaction_type": "redeem"
})
```

If found → return the existing transaction data as a success response (HTTP 200, `success=true`) without writing anything. POS gets the same response on retry.

**Index recommended:** `{ user_id: 1, idempotency_key: 1 }` on `points_transactions` for fast lookup (can be created in lifespan or deferred to L5).

---

## 8. Idempotency / Retry Safety

| Scenario | Behavior |
|---|---|
| First call with `idempotency_key=X` | Validate → write → return success |
| POS retries with same `idempotency_key=X` | Find existing PT row → return original success (no double-deduction) |
| POS sends different `idempotency_key=Y` for same customer+order | Treated as a separate redemption (POS must not do this) |
| POS sends `idempotency_key=X` after a failed first attempt (e.g., network timeout before DB write completed) | No PT row found → validate + write → return success (correct behavior: the first attempt never persisted) |

**Recommended `idempotency_key` format from POS:** `pos_{restaurant_id}_{order_id}_loyalty_{points}` — encodes enough context to be naturally unique per redeem action.

---

## 9. Tier / Redemption Value Handling

### Tier on redeem: NO CHANGE

| Factor | Rule |
|---|---|
| Tier computed from | Lifetime `total_points_earned` or spend (not current balance) |
| Redeem effect on tier | **None** — tier stays as-is |
| Future earn pushes tier up | ✅ Normal behavior |
| Tier downgrade | Only via points expiry (if it reduces `total_points` below threshold) — per existing `run_points_expiry` logic. NOT on redeem. |

### Redemption value: TIER-AWARE

```python
from core.helpers import get_redemption_value_for_tier

ratio = get_redemption_value_for_tier(customer["tier"], settings)
redeemed_value = round(points_to_redeem * ratio, 2)
```

This is the SAME helper that `build_pos_loyalty_blob` uses for the read endpoints. The POS frontend already knows `ratio_per_point` from the loyalty blob — the redeem API uses the same source, so the ₹ value will always match what POS displayed to the cashier.

---

## 10. Out of Scope

| Item | Status |
|---|---|
| Coupon redeem (`POST /pos/coupons/redeem`) | ❌ NOT in LR — deferred to CR-001C-C |
| Coupon validate/list | ❌ NOT in LR |
| Wallet debit (`POST /pos/wallet/debit`) | ❌ NOT in LR — deferred to CR-001C-W |
| Wallet credit / reverse | ❌ NOT in LR |
| Loyalty reverse (`POST /pos/loyalty/reverse`) | ❌ NOT in LR — see §10.1 |
| POS frontend changes | ❌ NOT in LR |
| CRM admin UI changes | ❌ NOT in LR |
| Migration changes | ❌ NOT in LR |
| Upgrade of `POST /pos/max-redeemable` to tier-aware | ❌ Out of scope (follow-up) |
| L4 birthday/anniversary counter fixes | ❌ Separate phase (L4 plan exists) |

### 10.1 Future Reversal Design Note

When `POST /pos/loyalty/reverse` is eventually needed:

1. Accept `transaction_id` (the PT row UUID from the redeem response).
2. Find the original PT row by `id` + `transaction_type="redeem"`.
3. Re-add `points` to `customer.total_points`.
4. Decrement `customer.total_points_redeemed`.
5. Insert a new PT row with `transaction_type="reverse"` and reference to the original `transaction_id`.
6. Mark the original PT row `reversed=true`.

This is out of scope for LR but the schema design (storing `transaction_id` on the response, `order_id` on the PT doc) is forward-compatible.

---

## 11. Implementation Plan

### File: `backend/routers/pos.py`

**Add ~80-100 lines:**

1. Request model class `POSLoyaltyRedeemRequest` (customer_id, points_to_redeem, order_id, order_total, idempotency_key).
2. New endpoint `@router.post("/loyalty/redeem", response_model=POSResponse)` with `Depends(verify_pos_auth)`.
3. Logic flow:
   - Load settings → check `loyalty_enabled`
   - Load customer → check exists
   - Validate `points_to_redeem > 0`
   - Check `min_redemption_points`
   - Compute `ratio_per_point` via `get_redemption_value_for_tier`
   - Compute max guardrails (percent, cap, available) → validate or auto-cap
   - Check `total_points >= points_to_redeem`
   - Idempotency lookup
   - Write: customer `$set total_points` + `$inc total_points_redeemed`
   - Write: PT doc insert
   - Return success with all audit fields

**Import additions:** `get_redemption_value_for_tier` from `core.helpers`.

### Files NOT changed:

| File | Reason |
|---|---|
| `core/loyalty.py` | No new helper needed |
| `core/helpers.py` | `get_redemption_value_for_tier` already exists |
| `models/schemas.py` | `POSResponse` already sufficient; request model defined inline in `pos.py` (same pattern as `POSMaxRedeemableRequest`) |
| `routers/points.py` | Admin path untouched (L4 will fix its defects separately) |
| `core/loyalty_jobs.py` | Cron jobs untouched |
| Frontend | No changes |

**Estimated diff:** `+90 / −0` in `routers/pos.py` only.

---

## 12. QA Plan

### Static QA harness (~30 assertions)

| # | Section | Assertions | Covers |
|---|---|---|---|
| QA-1 | Endpoint exists at `POST /pos/loyalty/redeem` with `verify_pos_auth` | 2 | Route registration + auth |
| QA-2 | `loyalty_enabled=false` → `LOYALTY_DISABLED` error | 1 | Kill-switch |
| QA-3 | Customer not found → `CUSTOMER_NOT_FOUND` | 1 | |
| QA-4 | `points_to_redeem=0` or negative → `INVALID_POINTS` | 2 | Validation |
| QA-5 | Below `min_redemption_points` → `BELOW_MIN_REDEMPTION` | 2 | Min guard |
| QA-6 | Exceeds max redemption (percent, cap) → `EXCEEDS_MAX_REDEMPTION` or auto-cap | 3 | Max guard |
| QA-7 | Insufficient points → `INSUFFICIENT_POINTS` | 1 | Balance check |
| QA-8 | Successful redeem: customer `total_points` decremented | 1 | Core write |
| QA-9 | Successful redeem: customer `total_points_redeemed` incremented | 1 | Counter fix |
| QA-10 | Successful redeem: PT row created with correct fields | 4 | PT doc audit |
| QA-11 | PT row `points` is positive (convention) | 1 | Convention |
| QA-12 | PT row `redeemed_value` = points × ratio | 1 | Audit trail |
| QA-13 | `ratio_per_point` uses `get_redemption_value_for_tier` (tier-aware) | 2 | LX-A integration |
| QA-14 | Tier NOT changed after redeem | 1 | No downgrade |
| QA-15 | Idempotency: same key → returns original response, no double-deduction | 2 | Retry safety |
| QA-16 | Idempotency: different key → separate transaction | 1 | Correctness |
| QA-17 | Response `success=true` with all expected data fields | 2 | Contract |
| QA-18 | Settings missing → `SETTINGS_MISSING` | 1 | Edge case |
| QA-19 | LX-A regression: `build_pos_loyalty_blob` strict 6-key unchanged | 1 | Regression |
| **Total** | | **~30** | |

### Live DB test (if owner authorizes)

Manually call the endpoint on a test customer in preview to verify end-to-end: customer counter change + PT row written + idempotency on retry.

---

## 13. Owner Questions

### Q-LR1: Should tier downgrade on redemption?

**Recommended: No.** Tier should be based on lifetime earned/spend, not current spendable balance. Existing `run_points_expiry` already handles tier recompute when points expire (a separate, time-based event). Redemption is a voluntary action that shouldn't penalize the customer's tier status.

### Q-LR2: Points sign convention for redeem?

**Recommended: Positive.** All existing redeem PT rows in the DB store positive `points` with `transaction_type="redeem"`. Both existing code paths (`points.py` and `pos.py` webhook) use positive. Maintaining this convention.

### Q-LR3: Should POS send idempotency_key?

**Recommended: Yes, required field.** POS may retry on network failure. Without idempotency, a retry would double-deduct points. The key should be deterministic (e.g. `pos_{restaurant}_{order}_{points}`) so retries naturally produce the same key.

### Q-LR4: Should redemption be allowed if loyalty_enabled=false?

**Recommended: No.** If the restaurant has turned off the loyalty program, redemption should be blocked. The POS read endpoints already return `loyalty_enabled=false` so the POS frontend should hide the redeem UI. The server-side check is a safety net.

### Q-LR5: Should order_id be required?

**Recommended: Yes for POS billing redeem.** Every POS redemption happens in the context of a bill/order. Having `order_id` on the PT doc enables audit trail and future reversal. If there's ever a use case for "manual redeem without an order" (admin UI), the existing `POST /api/points/transaction` handles that (different endpoint, different auth).

### Q-LR6: Should exceeding max redemption reject or auto-cap?

**Option A (Reject):** Return `EXCEEDS_MAX_REDEMPTION` with `max_redeemable_points` in the error data. POS frontend corrects and retries.

**Option B (Auto-cap):** Silently cap `points_to_redeem` to the max allowed. Return the capped amount in the success response. This matches the existing order webhook behavior.

**Recommended: Option B (auto-cap)** — fewer round-trips, matches existing behavior, POS gets the capped amount in the response to display to the cashier.

---

## 14. Recommendation

**Implement LR now as its own focused mini-phase, before L4.**

| Factor | Rationale |
|---|---|
| POS is blocked | POS needs the redeem API to complete BUG-108 billing flow. |
| Scope is tight | 1 file, ~90 lines, ~30 QA assertions. Can ship in one session. |
| No dependency on L4 | LR is a new endpoint. L4 fixes existing counter defects in admin/cron paths. They are independent. |
| LR includes the counter fixes that L4 would also address | The new endpoint correctly does `$inc total_points_redeemed` from day one. L4 can then fix the two existing paths (`points.py` + `pos.py` webhook) separately. |
| Forward-compatible | PT doc includes `order_id`, `idempotency_key`, `redeemed_value`, `ratio_per_point` — all needed for future reversal CR. |

**Sequence: LR → L4 → L5.**

---

## 15. Final Status

`cr001c_lr_pos_loyalty_redeem_api_plan_waiting_owner_approval`

Awaiting owner answers on Q-LR1 through Q-LR6, then proceed to implementation.
