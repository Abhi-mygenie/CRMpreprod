# CR-001C-LR — POS Loyalty Redeem API — Implementation Report

**Module:** CR-001C-LR (Loyalty Redeem — mini-phase)
**Date:** 2026-05-23
**Status:** `cr001c_lr_pos_loyalty_redeem_api_qa_passed`

---

## 1. Recovery Classification

**Classification: B — implementation_partial (recovered + completed).**

On entry:

- `git status` clean against `origin/23-may`; no unstaged WIP from the previous (dead) agent.
- `routers/pos.py` already contained a `POST /api/pos/loyalty/redeem` endpoint matching the bulk of the approved plan (settings load, kill-switch, customer load, min-redemption, auto-cap, tier-aware ratio, customer counter mutation with `$inc total_points_redeemed`, PT row insert, basic idempotency replay).
- No LR implementation or QA report existed under `/app/memory/crm/crm_1_0/`.

Gaps vs. owner-approved scope:

1. **Missing explicit `ORDER_ID_REQUIRED` error code** for empty `order_id` (Pydantic only catches missing/null, not empty string).
2. **Missing explicit `IDEMPOTENCY_KEY_REQUIRED` error code** for empty `idempotency_key`.
3. **Missing `IDEMPOTENCY_CONFLICT` handling** — code previously returned an idempotent replay regardless of whether the existing transaction matched the incoming `customer_id` / `order_id` / `points_to_redeem`.
4. **Idempotency lookup placement** — was after business validations, so a conflicting replay against a customer that no longer satisfied min-redemption was masked by `BELOW_MIN_REDEMPTION` instead of returning `IDEMPOTENCY_CONFLICT`.

This report covers the completion of those gaps and the regression QA over the entire endpoint.

---

## 2. Files Touched

| File | Change | Lines |
|---|---|---|
| `backend/routers/pos.py` | Added `ORDER_ID_REQUIRED`, `IDEMPOTENCY_KEY_REQUIRED` guards; added `IDEMPOTENCY_CONFLICT`; moved idempotency lookup to run before business validations | ~+60 / −45 net (LR block ≈ 220 lines total) |
| `backend/tests/qa_cr001c_lr_redeem.py` | New controlled QA harness (synthetic, isolated, self-cleaning) | new file, +395 lines |

No changes to:

- `backend/routers/points.py` (admin redeem path — out of LR scope; deferred to L4)
- `backend/core/loyalty.py` (LX-A blob untouched)
- `backend/core/helpers.py` (existing `get_redemption_value_for_tier` reused as-is)
- `backend/models/schemas.py` (`POSResponse` already adequate; request model defined inline in `pos.py` per established `POSMaxRedeemableRequest` pattern)
- `core/loyalty_jobs.py`, frontend, migration code.

---

## 3. Endpoint

```
POST /api/pos/loyalty/redeem
```

Registered via `api_router.include_router(pos.router)` in `server.py`; effective path includes the `/api` prefix.

---

## 4. Auth

`Depends(verify_pos_auth)` — same auth used by all other `/api/pos/...` endpoints. Accepts:

- `X-API-Key` header (primary, matches `users.api_key`), **or**
- `Authorization: Bearer <jwt>` (fallback; rejects `type=customer` tokens).

`user_id = user["id"]` is resolved from the authenticated record and used as the restaurant context for every read/write.

---

## 5. Request / Response Contract

### Request

```json
{
  "customer_id": "cust_abc123",
  "points_to_redeem": 100,
  "order_id": "868999",
  "order_total": 850,
  "idempotency_key": "pos_order_868999_loyalty_100"
}
```

Pydantic model `POSLoyaltyRedeemRequest`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `customer_id` | str | ✅ | Resolved against `customers.id` scoped by `user_id` |
| `points_to_redeem` | int | ✅ | Positive integer (validated explicitly: non-int → 422, ≤0 → `INVALID_POINTS`) |
| `order_id` | str | ✅ | Empty / whitespace → `ORDER_ID_REQUIRED` |
| `order_total` | float | ✅ | Used for `max_redemption_percent` cap |
| `idempotency_key` | str | ✅ | Empty / whitespace → `IDEMPOTENCY_KEY_REQUIRED` |

### Success response (HTTP 200, `success=true`)

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
    "total_points_redeemed": 100,
    "transaction_id": "53e3faef-be5c-4e53-94dc-5396b92156c7"
  }
}
```

Idempotent replays additionally carry `"idempotent": true` in `data`.

### Failure response (HTTP 200, `success=false`)

```json
{
  "success": false,
  "message": "Loyalty program is disabled.",
  "data": {
    "error": {
      "code": "LOYALTY_DISABLED",
      "message": "Loyalty program is currently disabled."
    }
  }
}
```

### Error code catalog

| Code | Cause |
|---|---|
| `ORDER_ID_REQUIRED` | `order_id` empty / whitespace-only |
| `IDEMPOTENCY_KEY_REQUIRED` | `idempotency_key` empty / whitespace-only |
| `INVALID_POINTS` | `points_to_redeem ≤ 0` (Pydantic rejects non-int with HTTP 422) |
| `IDEMPOTENCY_CONFLICT` | Same `idempotency_key` previously used with different `customer_id`, `order_id`, or `points` |
| `SETTINGS_MISSING` | No `loyalty_settings` document for the restaurant |
| `LOYALTY_DISABLED` | `loyalty_settings.loyalty_enabled = false` (owner Q-LR4) |
| `CUSTOMER_NOT_FOUND` | Customer id not present under the authenticated `user_id` |
| `BELOW_MIN_REDEMPTION` | Customer balance < `min_redemption_points`, or requested points < `min_redemption_points` |
| `INSUFFICIENT_POINTS` | After auto-cap, no redeemable points remain |

---

## 6. Business Rules Implemented (Mapped to Owner-Approved Answers)

| Rule | Owner | Implementation |
|---|---|---|
| No tier downgrade on redeem | **Q-LR1: No** | Customer update is `$set total_points + $inc total_points_redeemed` only; `tier` is never touched. |
| Points sign in PT row | **Q-LR2: Positive** | `tx_doc["points"] = points_to_redeem` (positive); `transaction_type="redeem"` distinguishes direction. |
| `idempotency_key` mandatory | **Q-LR3: Required** | Explicit empty-string guard → `IDEMPOTENCY_KEY_REQUIRED`. |
| Block when `loyalty_enabled=false` | **Q-LR4: Yes** | Returns `LOYALTY_DISABLED`; no mutation, no PT row (proven by QA-4). |
| `order_id` mandatory | **Q-LR5: Required** | Explicit empty-string guard → `ORDER_ID_REQUIRED`. |
| Exceed-max behavior | **Q-LR6: Auto-cap** | `points_to_redeem = min(requested, max_redeemable_points)` (silent cap); response carries the capped amount. |

Additional rules:

- **Tier-aware redemption** via `get_redemption_value_for_tier(customer.tier, settings)` (LX-A helper).
- **Max guardrails** computed as `min(order_total × max_redemption_percent / 100, max_redemption_amount, total_points × ratio)`.
- **`min_redemption_points`** enforced on both customer balance and requested amount.
- **`points_expired = false`** stamped on every redeem PT row.
- **Best-effort WhatsApp trigger** `"points_redeemed"` fired non-blocking via `asyncio.create_task`.

---

## 7. Idempotency Behavior

Lookup runs **before** business validations (settings/customer/min/max) to guarantee deterministic conflict/replay reporting regardless of evolving customer state.

```
key found in points_transactions (user_id, key, type="redeem")?
 ├── (customer_id, order_id, points) MATCH → return original result with idempotent=true (no mutation)
 └── any of (customer_id, order_id, points) DIFFERS → IDEMPOTENCY_CONFLICT with diagnostic "existing" block
```

PT lookup query:

```python
await db.points_transactions.find_one({
  "user_id": user_id,
  "idempotency_key": request.idempotency_key,
  "transaction_type": "redeem",
})
```

Replay returns the original `transaction_id`, `points_redeemed`, `redeemed_value`, `ratio_per_point`, and the current `tier` / `total_points_redeemed` of the customer.

---

## 8. Data Writes

### 8.1 `customers` collection

```python
await db.customers.update_one(
  {"id": request.customer_id},
  {
    "$set": {"total_points": new_balance},
    "$inc": {"total_points_redeemed": points_to_redeem},
  }
)
```

| Field | Op | Note |
|---|---|---|
| `total_points` | `$set` to `current - points_to_redeem` | Spendable balance ↓ |
| `total_points_redeemed` | `$inc` by `points_to_redeem` | Lifetime counter ↑ |
| `tier` | NOT touched | Owner Q-LR1 |
| `total_points_earned` | NOT touched | Earn-only field |

### 8.2 `points_transactions` collection

```python
{
  "id": str(uuid.uuid4()),
  "user_id": user_id,
  "customer_id": request.customer_id,
  "order_id": request.order_id,
  "points": points_to_redeem,            # POSITIVE
  "transaction_type": "redeem",
  "description": "Redeemed N pts (Rs.X) on order Y",
  "bill_amount": request.order_total,
  "balance_after": new_balance,
  "redeemed_value": points_to_redeem * ratio_per_point,
  "ratio_per_point": ratio_per_point,    # snapshot for audit/reversal
  "idempotency_key": request.idempotency_key,
  "points_expired": False,
  "created_at": datetime.now(timezone.utc).isoformat(),
}
```

No other collections are written.

---

## 9. Out-of-Scope Confirmations

The following were **NOT** implemented, modified, or touched:

- Coupon redeem / coupon validate / coupon list / coupon reverse
- Wallet debit / wallet credit / wallet reverse
- Loyalty reverse endpoint
- POS frontend changes
- CRM admin UI changes
- Migration changes / re-runs
- L4 birthday/anniversary counter fixes
- L4 admin-path `total_points_redeemed` defect (`routers/points.py`)
- L4 order-webhook `total_points_redeemed` defect (`routers/pos.py:1543-1598`)
- L5 cleanup
- `POST /api/pos/max-redeemable` upgrade to tier-aware
- `/app/memory/final/`
- Production deployment

The LX-A POS read contract (`build_pos_loyalty_blob` strict 6-key) is untouched and re-verified by QA-14.

---

## 10. Rollback Note

To roll back LR completely:

1. `git diff` is limited to `backend/routers/pos.py` (the `/loyalty/redeem` block) and the new `backend/tests/qa_cr001c_lr_redeem.py` harness.
2. Revert by `git checkout HEAD -- backend/routers/pos.py` and `rm backend/tests/qa_cr001c_lr_redeem.py`.
3. No schema migration. No index addition. No env change. No collection rename. No production data writes.
4. Existing PT rows produced by LR can be left in place (`transaction_type="redeem"`); they are forward-compatible with the future reverse endpoint (carry `order_id`, `idempotency_key`, `ratio_per_point`, `redeemed_value`).

A hot reload restart picks up the rollback; supervisor `restart backend` finalizes.

---

## 11. Final Status

`cr001c_lr_pos_loyalty_redeem_api_qa_passed`

See `CR_001C_LR_POS_LOYALTY_REDEEM_API_QA_REPORT.md` for the 36 / 36 assertion run.
