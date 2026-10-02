# CR-080 — Impact Analysis
## POS Loyalty & Wallet Management

**Date**: 2026-08-06
**Role**: Planning Agent
**Risk**: MEDIUM
**Intake doc**: `discovery/CR_080_POS_LOYALTY_WALLET_INTAKE.md`

---

## 1. Registration Verified

CR-080 registered. Status: `cr080_intake_closed_q1a_q2b_q3a_ready_for_planning`.
Q1=a (new file `pos_loyalty.py`), Q2=b (bonus cap 1,000 pts), Q3=a (`payment_method` required). No open decisions.

---

## 2. Code Reality

### What POS can do today (all `verify_pos_auth`) ✅

| Endpoint | What |
|---|---|
| `GET /pos/customers/{id}/loyalty` | `pos.py:2840` — tier, balance, earn %, redemption config |
| `POST /pos/max-redeemable` | `pos.py:467` — max redeemable + projected earn |
| `POST /pos/loyalty/redeem` | `pos.py:589` — redeem during checkout |
| `POST /pos/orders` | Auto-earn + auto-tier via order processing |

### What exists in CRM (all `get_current_user`) — needs POS wrappers

| CRM endpoint | Location | POS equivalent | Risk |
|---|---|---|---|
| `GET /loyalty/settings` | `points.py:303` | L-1 | LOW (read-only) |
| `GET /points/transactions/{id}` | `points.py:179` | L-3 | LOW (read-only) |
| `POST /points/transaction` type=bonus | `points.py:20` | L-2 | MEDIUM (financial write) |
| `GET /wallet/transactions/{id}` | `wallet.py:109` | L-5 | LOW (read-only) |
| `POST /wallet/transaction` type=credit | `wallet.py:14` | L-4 | MEDIUM (financial write) |

**L-6 (standalone wallet balance)** — already returned in `POST /pos/customer-lookup` and `GET /pos/customers/{id}`. No standalone endpoint needed.

---

## 3. Data Flow Traces

### L-1 Settings (read-only)
```
GET /api/pos/loyalty/settings
  → verify_pos_auth → user doc
  → db.loyalty_settings.find_one({user_id}) or defaults
  → return POSResponse with POS-relevant subset:
    { loyalty_enabled, wallet_enabled, coupon_enabled,
      bronze/silver/gold/platinum_earn_percent,
      tier_silver/gold/platinum_min,
      redemption_value, min_redemption_points,
      off_peak_bonus_enabled, off_peak_start_time, off_peak_end_time }
  EXCLUDE: lifecycle thresholds, campaign_daily_limit,
           vip_auto_promote, custom_field labels (POS doesn't need)
```

### L-2 Award Bonus Points (MEDIUM risk — financial write)
```
POST /api/pos/customers/{customer_id}/points/award
  body: { points: int, description: str, idempotency_key: str }
  → verify_pos_auth → user doc
  → customer = db.customers.find_one({id, user_id}) — 404 if not found
  → loyalty_settings — 403 if loyalty_enabled == false
  → points > 1000 → 400 "Exceeds maximum award of 1,000 points per transaction"
  → points <= 0 → 400 "points must be a positive integer"
  → call create_points_transaction(type=bonus) ← existing helper in points.py
      → updates customer.total_points + tier
      → inserts points_transactions doc
      → fires bonus_points + points_earned WhatsApp events (async)
  → return POSResponse(data={
        transaction_id, customer_id,
        points_awarded, new_balance, new_tier
    })
```

**Note on idempotency**: `create_points_transaction` does NOT have idempotency for `bonus` type (unlike `redeem` which uses `redeem_loyalty_points` helper with idempotency). For POS, the caller is responsible for not double-calling. We accept idempotency_key in the request body for logging/audit but do not enforce it server-side in Phase 1.

### L-3 Points History (read-only)
```
GET /api/pos/customers/{customer_id}/points-history?limit=20
  → verify_pos_auth → user doc
  → db.points_transactions.find({customer_id, user_id}).sort(-created_at).limit(limit)
  → return POSResponse(data={customer_id, transactions: [...], total: N})
```

### L-4 Wallet Credit (MEDIUM risk — financial write)
```
POST /api/pos/customers/{customer_id}/wallet/credit
  body: { amount: float, description: str, payment_method: str, idempotency_key: str }
  → verify_pos_auth → user doc
  → customer = db.customers.find_one({id, user_id}) — 404 if not found
  → loyalty_settings — 403 if wallet_enabled == false
  → amount <= 0 → 400 "amount must be positive"
  → payment_method missing/empty → 400 "payment_method is required"
  → call create_wallet_transaction(type=credit) ← existing helper in wallet.py
      → updates customer.wallet_balance
      → inserts wallet_transactions doc
      → fires wallet_credit WhatsApp event (async)
  → return POSResponse(data={
        transaction_id, customer_id,
        amount_credited, new_balance, payment_method
    })
```

### L-5 Wallet History (read-only)
```
GET /api/pos/customers/{customer_id}/wallet-history?limit=20
  → verify_pos_auth → user doc
  → customer = db.customers.find_one → get current balance
  → db.wallet_transactions.find({customer_id, user_id}).sort(-created_at).limit(limit)
  → return POSResponse(data={
        customer_id, current_balance,
        transactions: [...], total: N
    })
```

---

## 4. Conflict Check

- L-1 to L-5 do NOT conflict with existing `GET /pos/customers/{id}/loyalty` or `POST /pos/loyalty/redeem`
- L-2 calls `create_points_transaction` which updates `customers.total_points` and `customers.tier` — same as all other earn/bonus paths. No conflict.
- L-4 calls `create_wallet_transaction` which updates `customers.wallet_balance` — same as all other wallet paths. No conflict.
- WhatsApp side effects (bonus_points, wallet_credit events) are existing — already tested in previous QA runs.

---

## 5. Risk Items

### R1 — L-2 bonus points cap (1,000 pts) — where to enforce

Cap enforced at the POS wrapper layer BEFORE calling `create_points_transaction`. The helper itself has no cap. This is correct: the CRM admin can still award any amount via CRM JWT; only POS-originated awards are capped.

### R2 — L-4 wallet_enabled guard

`create_wallet_transaction` in `wallet.py:14` does NOT check `wallet_enabled`. We must add the guard in the POS wrapper. Otherwise POS could credit wallets even when the feature is disabled.

### R3 — L-2 bonus WhatsApp events fire for every award

`create_points_transaction(type=bonus)` fires `bonus_points` + `points_earned` WhatsApp events via `asyncio.create_task`. On live preprod with real customer phones, every POS bonus award triggers a WhatsApp message. This is intended behaviour but worth noting.

### R4 — `create_points_transaction` is a `get_current_user` endpoint — cannot call it directly

`points.py:20` uses `get_current_user` as a dependency. We cannot call it with a `verify_pos_auth` user. We must **replicate the bonus-type logic inline** in `pos_loyalty.py` rather than calling the CRM function. The logic is simple:

```python
# inline from points.py:87-170 (earn/bonus branch only)
current_points = customer.get("total_points", 0)
new_balance = current_points + points
new_tier = calculate_tier(new_balance, settings)
# update customer
# insert points_transactions doc
# fire WhatsApp events (async)
```

Same applies to `create_wallet_transaction` — replicate the credit branch inline.

This is the MEDIUM risk: we replicate ~40 LOC of financial write logic. It must exactly match the existing helpers.

---

## 6. Files WILL Change

| File | Type | Change |
|---|---|---|
| `routers/pos_loyalty.py` | **NEW** | ~200 LOC — 5 endpoints |
| `backend/server.py` | EDIT | +2 lines (import `pos_loyalty` + `include_router`) |

## 7. Files WILL NOT Change

`routers/points.py` · `routers/wallet.py` · `core/loyalty.py` · `models/schemas.py` · `routers/pos.py` · all frontend files

---

## 8. Downstream Consumers

| Consumer | Impact |
|---|---|
| `GET /pos/customers/{id}/loyalty` | None — still works, separate endpoint |
| `POST /pos/orders` loyalty earn path | None — separate code path |
| `POST /pos/loyalty/redeem` | None — separate code path |
| CRM Dashboard (`DashboardPage`) | None — reads same `points_transactions` + `wallet_transactions` |
| CRM `LoyaltySettingsPage` | None — L-1 is read-only |

---

## 9. Verification Matrix

| # | Test | Expected |
|---|---|---|
| V1 | `GET /pos/loyalty/settings` | Earn %, tier mins, enabled flags returned |
| V2 | `GET /pos/customers/{id}/points-history` | Sorted transactions list, newest first |
| V3 | `POST award` (100 pts, valid) | `success=true`, new_balance = old + 100 |
| V4 | `POST award` (1,001 pts) | `success=false`, "Exceeds maximum award of 1,000 points" |
| V5 | `POST award` (loyalty_enabled=false) | `success=false`, 403 or error response |
| V6 | `POST award` (customer not found) | `success=false`, "Customer not found" |
| V7 | `GET /pos/customers/{id}/wallet-history` | Transactions + current_balance |
| V8 | `POST wallet/credit` (₹500, payment_method=cash) | `success=true`, new_balance = old + 500 |
| V9 | `POST wallet/credit` (no payment_method) | `success=false`, "payment_method is required" |
| V10 | `POST wallet/credit` (wallet_enabled=false) | `success=false`, 403 or error |
| V11 | Existing `GET /pos/customers/{id}/loyalty` | Unchanged (regression) |

---

## 10. Impact Analysis Output

```
Planning complete: CR-080
Stage: Impact Analysis
Code reality: NONE (pos_loyalty.py does not exist)
Risk: MEDIUM
Files WILL change: routers/pos_loyalty.py (new ~200 LOC), server.py (+2 lines)
Files WILL NOT touch: routers/points.py, routers/wallet.py, core/loyalty.py, models/schemas.py
Owner decisions: none open
Key finding: create_points_transaction and create_wallet_transaction use get_current_user —
             cannot call directly. Inline the bonus/credit branches (~40 LOC).
             Must add wallet_enabled guard (not present in wallet.py helper).
Next: Implementation Plan → Implementation
```
