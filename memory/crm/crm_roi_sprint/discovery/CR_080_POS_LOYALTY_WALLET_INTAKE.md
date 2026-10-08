# CR-080 — POS Loyalty & Wallet Management — Intake Doc

**Date**: 2026-08-06
**Role**: Intake Agent
**Sprint**: crm_roi_sprint
**Source investigation**: INV-015 (`investigations/INV_015_POS_LOYALTY_COUPON_CUSTOMER_EDIT.md`)

---

## 1. Owner Request (verbatim)

> "We want to manage loyalty and coupon on POS so we will do all operations from POS UI. We will need API for same."

*(CR-080 covers loyalty + wallet. CR-081 covers coupons.)*

---

## 2. Classification

| Field | Value |
|---|---|
| **Type** | CR — new feature (POS auth wrappers for existing loyalty/wallet logic) |
| **Severity** | P1 — POS UI cannot award bonus points or top up wallets without this |
| **Risk** | MEDIUM (write endpoints touch financial collections) |
| **Effort estimate** | ~2.5 hrs |

---

## 3. Duplicate Check

| Candidate | Verdict | Reason |
|---|---|---|
| Existing `GET /loyalty/settings` | RELATED, DISTINCT | That uses CRM JWT. CR-080 adds a POS-auth (X-API-Key) read version. Different auth, different consumer. |
| Existing `POST /points/transaction` | RELATED, DISTINCT | That uses CRM JWT. CR-080 wraps it for POS with appropriate guards. |
| CR-018 / CR-017 (max-redeemable, projected tier) | RELATED, DISTINCT | Those were billing-time helpers. CR-080 is management/admin operations. |

**Result: DISTINCT — proceed as CR-080.**

---

## 4. Code Reality — What Exists vs What's Missing

### Already accessible from POS (X-API-Key) ✅

| Endpoint | What |
|---|---|
| `GET /api/pos/customers/{id}/loyalty` | Tier, balance, earn %, redemption config |
| `POST /api/pos/max-redeemable` | Max redeemable + projected earn |
| `POST /api/pos/loyalty/redeem` | Redeem during checkout |
| `POST /api/pos/orders` (loyalty_points_used field) | Auto-earn + auto-tier + wallet debit |

### Missing — all CRM JWT today

| Gap | Operation | Existing CRM endpoint | Auth gap |
|---|---|---|---|
| **L-1** | Read loyalty settings (earn %, tier thresholds, flags) | `GET /api/loyalty/settings` (`points.py:303`) | CRM JWT only |
| **L-2** | Manually award bonus points | `POST /api/points/transaction` type=`bonus` (`points.py:20`) | CRM JWT only |
| **L-3** | View full points history per customer | `GET /api/points/transactions/{id}` (`points.py:179`) | CRM JWT only |
| **L-4** | Credit wallet at POS counter | `POST /api/wallet/transaction` type=`credit` (`wallet.py:14`) | CRM JWT only |
| **L-5** | View wallet transaction history | `GET /api/wallet/transactions/{id}` (`wallet.py:109`) | CRM JWT only |
| **L-6** | Get wallet balance (standalone) | `GET /api/wallet/balance/{id}` (`wallet.py:117`) | CRM JWT only — though `wallet_balance` is already in `customer-lookup` response |

**L-1, L-3, L-5, L-6** = read-only, LOW risk. **L-2, L-4** = financial writes, MEDIUM risk.

---

## 5. Proposed New POS Endpoints

All use `X-API-Key` (`verify_pos_auth`). Read-only endpoints just change auth. Write endpoints add guards.

### READ ENDPOINTS (LOW risk)

**L-1** `GET /api/pos/loyalty/settings`
Returns earn %, tier thresholds, enabled flags — read-only. POS uses for cashier training screen and "earn X% on this purchase" display.
```json
{
    "loyalty_enabled": true,
    "wallet_enabled": true,
    "bronze_earn_percent": 5.0,
    "silver_earn_percent": 7.0,
    "gold_earn_percent": 10.0,
    "platinum_earn_percent": 15.0,
    "tier_silver_min": 500,
    "tier_gold_min": 1500,
    "tier_platinum_min": 5000,
    "redemption_value": 1.0,
    "min_redemption_points": 50
}
```
Excludes: `jwt_secret`, campaign scheduler, lifecycle thresholds (POS doesn't need those).

**L-3** `GET /api/pos/customers/{customer_id}/points-history?limit=20`
Full points ledger for POS display. Reuses `points_transactions` collection.
```json
{
    "customer_id": "...",
    "transactions": [
        { "id": "...", "points": 250, "type": "earn", "description": "Order KM-1234 (₹2500)", "balance_after": 890, "created_at": "..." },
        { "id": "...", "points": -50, "type": "redeem", "description": "Redeemed on order", "balance_after": 640, "created_at": "..." }
    ],
    "total": 2
}
```

**L-5** `GET /api/pos/customers/{customer_id}/wallet-history?limit=20`
Wallet transaction ledger.
```json
{
    "customer_id": "...",
    "balance": 150.0,
    "transactions": [
        { "id": "...", "amount": 200.0, "type": "credit", "description": "Wallet top-up at counter", "balance_after": 200.0, "created_at": "..." },
        { "id": "...", "amount": 50.0, "type": "debit", "description": "Used on order", "balance_after": 150.0, "created_at": "..." }
    ]
}
```

---

### WRITE ENDPOINTS (MEDIUM risk)

**L-2** `POST /api/pos/customers/{customer_id}/points/award`

Award bonus points manually (service recovery, complimentary gift, cashier discretion).

Request:
```json
{
    "points": 200,
    "description": "Service recovery — long wait",
    "idempotency_key": "award_KM_20260806_001"
}
```

Guards:
- `loyalty_enabled = true` required — return 403 if off
- `points` must be positive integer
- Calls existing `create_points_transaction` logic (type=`bonus`)
- Fires `bonus_points` WhatsApp event
- Idempotency on `idempotency_key`

**L-4** `POST /api/pos/customers/{customer_id}/wallet/credit`

Top-up wallet at POS counter (customer pays cash/card to load wallet).

Request:
```json
{
    "amount": 500.0,
    "description": "Wallet top-up — cash",
    "payment_method": "cash",
    "idempotency_key": "topup_KM_20260806_001"
}
```

Guards:
- `wallet_enabled = true` required — return 403 if off
- `amount` must be positive float
- Calls existing `create_wallet_transaction` logic (type=`credit`)
- Fires `wallet_credit` WhatsApp event

---

## 6. Owner Decisions Required (Q1–Q3)

### Q1 — New file or extend `routers/pos.py`?

`pos.py` is already 3,625 LOC. Adding 6 new endpoints would push it further.

| Option | |
|---|---|
| **a) New file `routers/pos_loyalty.py`** | Cleaner separation, easier to maintain |
| **b) Extend `routers/pos.py`** | One file, consistent with existing pattern |

Agent recommends: **(a)** — new file. `pos.py` is already a hotspot.

---

### Q2 — Bonus points (L-2): cap per transaction?

Should there be a maximum bonus points limit per single award from POS?

| Option | |
|---|---|
| **a) No cap** — trust POS cashier/manager | Simple |
| **b) Cap at 500 points per award** — prevents abuse | Safer for live tenants |

Agent recommends: **(b)** — cap at configurable max (e.g. 1000). Can be a constant for now.

---

### Q3 — Wallet credit (L-4): payment method required or optional?

| Option | |
|---|---|
| **a) Required** | Audit trail — must record HOW customer paid (cash / card / UPI) |
| **b) Optional** | Simpler payload |

Agent recommends: **(a)** — required. Wallet top-ups are financial transactions needing audit trails.

---

## 7. Blast Radius

| Area | Impact |
|---|---|
| **Files WILL change** | `routers/pos_loyalty.py` (new file) or `routers/pos.py` (if Q1=b) + `server.py` (+1 import + include_router) |
| **Files WILL NOT change** | `routers/points.py`, `routers/wallet.py`, `core/loyalty.py`, `models/schemas.py`, all frontend files |
| **DB collections read/written** | `loyalty_settings` (read), `points_transactions` (read+write), `wallet_transactions` (read+write), `customers` (wallet_balance write) |
| **WhatsApp side effects** | L-2 fires `bonus_points` event · L-4 fires `wallet_credit` event (both already coded in existing paths) |
| **Blast radius** | MEDIUM |

---

## 8. Intake Output

```
Intake complete: CR-080
Classification: CR — new feature (POS auth wrappers for loyalty/wallet)
Severity: P1
Risk: MEDIUM
Duplicate check: DISTINCT
Evidence: confirmed by code read (points.py, wallet.py, pos.py)
Blast radius: MEDIUM (new file + server.py change + financial writes)
Docs updated:
  - discovery/CR_080_POS_LOYALTY_WALLET_INTAKE.md (this file)
  - 00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 30 added)
  - CR_STATUS_DASHBOARD.md (board row added)
  - DECISIONS_LOG.md (registration entry added)
Next: Planning — BLOCKED on owner Q1 (new file?), Q2 (cap?), Q3 (payment_method required?)
```

*Zero production files modified during Intake.*
