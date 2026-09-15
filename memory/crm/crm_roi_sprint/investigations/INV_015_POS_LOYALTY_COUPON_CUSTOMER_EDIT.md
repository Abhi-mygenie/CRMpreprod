# INV-015 — Investigation Report
## POS: Customer Edit + Loyalty/Coupon Management Gaps

**Date**: 2026-08-06
**Role**: Investigation Agent
**Triggered by**: Owner request — "manage loyalty and coupon on POS from POS UI" + "edit customer — edit option is not there"
**Steps used**: 10/10
**Confidence**: HIGH — full code read, all endpoints traced

---

## 1. CUSTOMER EDIT FROM POS

### 1.1 Code Reality

The endpoint **EXISTS** and uses POS auth:

```
PUT /api/pos/customers/{customer_id}
X-API-Key: <api_key>
```

`pos.py:373` — `verify_pos_auth` ✅
`POSCustomerUpdate` schema (`pos.py:127`) — accepts 30+ optional fields ✅

Also confirmed working:
- `GET /api/pos/customers/{customer_id}` — full customer with loyalty + recent orders + addresses ✅
- `GET /api/pos/customers?search=` — typeahead search by name/phone ✅

### 1.2 Why POS UI may not know it works — 3 Contract Gaps

**GAP-CE-1 (BLOCKER): Schema requires 3 mandatory fields on every PUT**

```python
class POSCustomerUpdate(BaseModel):
    pos_id: str       # REQUIRED — "mygenie", "petpooja", etc.
    restaurant_id: str # REQUIRED — the restaurant's POS ID
    phone: str         # REQUIRED — used as dedup key
    name: Optional[str] = None
    ...everything else optional...
```

A POS "Edit Profile" screen knows the `customer_id` (URL param) but having to always send `pos_id`, `restaurant_id`, and `phone` in every edit payload is inconvenient. POS can derive `pos_id` / `restaurant_id` from the auth key.

**Root cause**: These were originally designed for POS-push (POS sending its own identifiers), not for POS-UI edit flows.

---

**GAP-CE-2: PUT response returns only 4 fields — POS cannot refresh UI without a second GET**

```json
{
    "success": true,
    "message": "Customer updated successfully",
    "data": {
        "customer_id": "...",
        "name": "...",
        "phone": "...",
        "updated_at": "..."
    }
}
```

A POS UI editing `dob`, `anniversary`, `email`, or `allergies` gets no confirmation of what changed. Must call `GET /api/pos/customers/{id}` to refresh — an unnecessary extra round-trip.

---

**GAP-CE-3: No POS API contract document for customer edit**

The `PUT /api/pos/customers/{id}` endpoint is not documented in any POS API contract. The POS team may simply not know it exists.

### 1.3 Verdict

The customer edit endpoint **exists and works**. The POS team needs:
1. A contract doc explaining it
2. Optionally: make `pos_id`/`restaurant_id` optional (derive from auth)
3. Optionally: return the full updated customer in PUT response

---

## 2. LOYALTY MANAGEMENT FROM POS

### 2.1 What POS Can Already Do (all `X-API-Key` ✅)

| Endpoint | What it does |
|---|---|
| `GET /api/pos/customers/{id}/loyalty` | Current tier, points balance, points value, earn %, redemption config |
| `POST /api/pos/max-redeemable` | Max redeemable + projected earn + tier upgrade on a given bill |
| `POST /api/pos/loyalty/redeem` | Redeem points during checkout |
| `POST /api/pos/orders` | Auto-earn points, auto-tier upgrade, wallet debit |

### 2.2 What POS CANNOT Do — All Blocked by CRM JWT Auth

| Gap # | Operation | Existing endpoint | Auth today | POS use case |
|---|---|---|---|---|
| **L-1** | Read loyalty settings (earn %, tier thresholds, enabled flags) | `GET /api/loyalty/settings` | CRM JWT ONLY | Show cashier "Bronze earns 5%, Silver earns 7%" — needed for cashier training screen |
| **L-2** | Manually award bonus points (service recovery, complimentary gift) | `POST /api/points/transaction` type=`bonus` | CRM JWT ONLY | "Guest had a bad experience — award 200 points as goodwill" |
| **L-3** | View full points history per customer | `GET /api/points/transactions/{customer_id}` | CRM JWT ONLY | "Show me this customer's last 10 point earn/redeem events" |
| **L-4** | Credit customer wallet at POS counter (cash top-up) | `POST /api/wallet/transaction` type=`credit` | CRM JWT ONLY | "Customer paid ₹500 cash to top up wallet" |
| **L-5** | View wallet transaction history per customer | `GET /api/wallet/transactions/{customer_id}` | CRM JWT ONLY | Cashier verifies wallet credits/debits before order |
| **L-6** | Get wallet balance per customer | `GET /api/wallet/balance/{customer_id}` | CRM JWT ONLY | Already partially covered by `customer-lookup` response (includes `wallet_balance`) — but no standalone endpoint |

**Note**: `PUT /api/loyalty/settings` (configure earn rates, tier thresholds) should remain CRM-only. Too high risk to expose to POS.

### 2.3 Implementation path

Most gaps are **auth-only changes** — the business logic already exists. Work needed:
- L-1, L-3, L-5, L-6: add `verify_pos_auth` version of existing read endpoints → LOW risk
- L-2 (bonus points): add POS endpoint wrapping `POST /points/transaction` with bonus guard → MEDIUM risk (writes to financial collection)
- L-4 (wallet credit): add POS endpoint wrapping `POST /wallet/transaction` with credit guard → MEDIUM risk (writes to financial collection)

---

## 3. COUPON MANAGEMENT FROM POS

### 3.1 What POS Can Already Do (all `X-API-Key` ✅)

| Endpoint | What it does |
|---|---|
| `GET /api/pos/coupons/available?customer_id=&order_total=` | List coupons eligible for THIS customer + order value |
| `POST /api/pos/coupons/validate` | Validate a coupon code + compute discount |
| `POST /api/pos/orders` (coupon_code field) | Record coupon usage automatically |

### 3.2 What POS CANNOT Do — All Blocked by CRM JWT Auth

| Gap # | Operation | Existing endpoint | Auth today | POS use case |
|---|---|---|---|---|
| **C-1** | List ALL coupons (catalogue, not order-specific) | `GET /api/coupons?active_only=true` | CRM JWT ONLY | Cashier browses all available coupons to decide which to apply |
| **C-2** | Get single coupon full details | `GET /api/coupons/{id}` | CRM JWT ONLY | View before editing |
| **C-3** | Create a new coupon | `POST /api/coupons` | CRM JWT ONLY | Restaurant manager creates "Weekend 20% off" from POS |
| **C-4** | Edit an existing coupon | `PUT /api/coupons/{id}` | CRM JWT ONLY | Extend expiry, change discount value |
| **C-5** | Toggle coupon active / inactive | `POST /api/coupons/{id}/toggle` | CRM JWT ONLY | Quickly pause a coupon without deleting |
| **C-6** | Delete a coupon | `DELETE /api/coupons/{id}` | CRM JWT ONLY | Remove a coupon permanently |
| **C-7** | View coupon usage stats | `GET /api/coupons/{id}/usage` | CRM JWT ONLY | "How many times was this coupon used today?" |
| **C-8** | Distribute coupon to a specific customer | ❌ **Does NOT exist anywhere** | — | "Give this VIP customer a personal 30% off code" — NET-NEW feature |

### 3.3 Implementation path

- C-1 to C-7: **auth-only changes** — wrap existing CRM endpoints with `verify_pos_auth`. Business logic unchanged.
- C-5 (toggle), C-6 (delete): should keep the in-use guard (block delete if mapped to event/campaign) — already coded in CRM.
- C-8 (distribute): **net-new** — needs new endpoint + `coupon_distributions` collection or extend `coupon_usage` with a `pending_distribution` flag.

---

## 4. SUMMARY — GAP MAP

```
CUSTOMER EDIT
  PUT /api/pos/customers/{id}  ✅ EXISTS
  ├── GAP-CE-1: pos_id + restaurant_id mandatory → awkward for UI edit
  ├── GAP-CE-2: PUT response only 4 fields → needs second GET to refresh
  └── GAP-CE-3: no contract doc — POS team may not know it exists

LOYALTY MANAGEMENT
  Read-only (tier, balance, history):
  ├── GAP-L-1: GET loyalty settings → CRM JWT only
  ├── GAP-L-3: GET points history → CRM JWT only
  ├── GAP-L-5: GET wallet history → CRM JWT only
  └── GAP-L-6: GET wallet balance standalone → CRM JWT only

  Write (financial — MEDIUM risk):
  ├── GAP-L-2: Award bonus points → CRM JWT only
  └── GAP-L-4: Credit wallet → CRM JWT only

COUPON MANAGEMENT
  Read-only:
  ├── GAP-C-1: List all coupons → CRM JWT only
  ├── GAP-C-2: Get single coupon → CRM JWT only
  └── GAP-C-7: View usage stats → CRM JWT only

  Write (MEDIUM risk):
  ├── GAP-C-3: Create coupon → CRM JWT only
  ├── GAP-C-4: Edit coupon → CRM JWT only
  ├── GAP-C-5: Toggle active → CRM JWT only
  └── GAP-C-6: Delete coupon → CRM JWT only

  Net-new:
  └── GAP-C-8: Distribute coupon to customer → does NOT exist anywhere
```

---

## 5. RISK CLASSIFICATION

| Group | Risk | Reason |
|---|---|---|
| Customer edit fix (CE-1, CE-2) | LOW | No logic change; schema + response shape only |
| Loyalty read (L-1, L-3, L-5, L-6) | LOW | Read-only, just change auth layer |
| Loyalty write (L-2, L-4) | MEDIUM | Writes to `points_transactions` + `wallet_transactions` (financial) |
| Coupon read (C-1, C-2, C-7) | LOW | Read-only, additive auth |
| Coupon write (C-3, C-4, C-5, C-6) | MEDIUM | Coupon creation/edit affects discount math; delete needs in-use guard |
| Coupon distribute (C-8) | MEDIUM | Net-new feature, new data model needed |

---

## 6. RECOMMENDATION — 3 NEW CRs TO REGISTER

### CR-079: POS Customer Edit — Contract Fix (P2, LOW risk, ~45 min)

**Scope**:
1. Make `pos_id` and `restaurant_id` optional in `POSCustomerUpdate` (derive from X-API-Key auth if not sent)
2. Return full updated customer object in `PUT /api/pos/customers/{id}` response (instead of 4-field stub)
3. Write POS API contract doc for customer edit

**Files**: `routers/pos.py` (2 edits), contract doc

---

### CR-080: POS Loyalty & Wallet Management (P1, MEDIUM risk, ~2.5 hrs)

**Scope**:

*Read endpoints (LOW risk — auth wrap only):*
- `GET /api/pos/loyalty/settings` — read-only settings for POS display
- `GET /api/pos/customers/{id}/points-history?limit=20` — full points transaction log
- `GET /api/pos/customers/{id}/wallet-history?limit=20` — wallet transactions

*Write endpoints (MEDIUM risk — financial writes):*
- `POST /api/pos/customers/{id}/points/award` — bonus points (service recovery, complimentary)
  - Fields: `points` (int), `description` (str), `idempotency_key` (str)
  - Guard: `loyalty_enabled=true` required
- `POST /api/pos/customers/{id}/wallet/credit` — top-up wallet at POS counter
  - Fields: `amount` (float), `description` (str), `payment_method` (str), `idempotency_key` (str)
  - Guard: `wallet_enabled=true` required

**Files**: `routers/pos.py` or new `routers/pos_loyalty.py`

---

### CR-081: POS Coupon Management (P2, MEDIUM risk, ~3 hrs)

**Scope**:

*Read endpoints (LOW risk):*
- `GET /api/pos/coupons` — list all coupons with pagination
- `GET /api/pos/coupons/{id}` — full coupon details
- `GET /api/pos/coupons/{id}/usage?limit=20` — usage history for a coupon

*Write endpoints (MEDIUM risk — same business logic as CRM):*
- `POST /api/pos/coupons` — create coupon (wraps `core/coupon.py` create logic)
- `PUT /api/pos/coupons/{id}` — edit coupon
- `POST /api/pos/coupons/{id}/toggle` — activate / deactivate
- `DELETE /api/pos/coupons/{id}` — delete (with in-use guard already in coupon.py)

*Net-new (MEDIUM risk):*
- `POST /api/pos/coupons/{id}/distribute` — assign coupon to a specific customer
  - Creates a `pending_distribution` record: `{coupon_id, customer_id, assigned_at, assigned_by, used: false}`
  - Customer gets a WhatsApp notification with the coupon code (optional, using existing `coupon_earned` event)

**Files**: `routers/pos.py` or new `routers/pos_coupons.py`

---

## 7. Investigation Output

```
Investigation complete: INV-015
Root cause: 
  - Customer edit: endpoint EXISTS (PUT /api/pos/customers/{id}) but schema requires
    pos_id + restaurant_id + phone as mandatory; response returns only 4 fields. 
    POS team likely unaware it exists — no contract doc.
  - Loyalty management: all loyalty/wallet write + read endpoints are CRM JWT only.
    14 gaps total across loyalty (6) and coupons (8). All coupon management is
    CRM JWT only. 1 net-new gap (coupon distribute to customer).
Classification: BE (auth layer + missing POS endpoints)
Confidence: HIGH
Steps used: 10/10
Evidence: routers/pos.py:127-447, routers/coupons.py:1-314, routers/points.py:1-373, routers/wallet.py:1-123
Recommendation: INTAKE — register 3 new CRs (CR-079, CR-080, CR-081) before planning
Report: /app/memory/crm/crm_roi_sprint/investigations/INV_015_POS_LOYALTY_COUPON_CUSTOMER_EDIT.md
```
