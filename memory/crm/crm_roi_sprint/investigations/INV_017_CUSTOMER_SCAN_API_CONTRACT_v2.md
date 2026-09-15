# MyGenie CRM — Customer Surface API Contract (v2, `/api/scan/*`)

**Status:** AS-BUILT (verified against code + live probe, INV-017, 2026-09-15) · **Version:** 2.0
**Machine-readable:** `INV_017_openapi_scan_v2.json` (filtered FastAPI export, same folder)
**Base URL:** `https://crm.mygenie.online/api` (prod URL to be confirmed by owner) · Preprod pod: `<REACT_APP_BACKEND_URL>/api`
**Source of truth:** `backend/routers/scan.py`, `backend/core/auth.py`. If this doc and code disagree, code wins.

> Sections marked **PROPOSED** are not built yet — they are what CRM would add if the owner approves the follow-up CR. Everything else is live today.

---

## 0. Conventions

| Topic | Rule |
|---|---|
| Auth (authenticated routes) | `Authorization: Bearer <customer JWT>` — HTTPBearer. `x-api-key` is ignored on `/scan/*`. |
| Tenant scoping | Always from JWT claim `restaurant_id`. Never pass `restaurant_id` on authenticated routes. |
| `restaurant_id` on public auth routes | Accepts short id (`"689"`) or full (`"pos_0001_restaurant_689"`); short is normalised to full. |
| Envelope | `{ "success": bool, "message": string, "data": object \| null }` — always unwrap `data`. |
| Business errors | HTTP **200** with `success:false`, `data:null`, human `message`. |
| Transport errors | HTTP **4xx** with `{ "detail": string \| array }`: 401 invalid/expired token · 403 missing Authorization header · 422 body validation (pydantic array) · 429 OTP request cap · 404 unknown path. |
| Timestamps | ISO-8601 UTC strings, e.g. `"2026-09-15T10:22:31.123456+00:00"`. |
| Pagination | `limit` query only (default 20, **hard cap 50**). **No `skip`/`offset`.** |
| IDs | Customer/order/transaction ids are UUID strings; address ids `addr_<12hex>`. |

### 0.1 Customer JWT
| Item | Value |
|---|---|
| Algorithm | HS256 |
| Lifetime | **24 h** (fixed). No refresh endpoint — re-authenticate via `skip-otp` / `login`. |
| Claims | `customer_id` (uuid) · `restaurant_id` (`pos_0001_restaurant_{rid}`) · `phone` · `type:"customer"` · `exp` |
| ⚠️ | There is **no `user_id` claim**. Tenant id is `restaurant_id`. |

---

## 1. Authentication (public — no Bearer)

### 1.1 `POST /scan/auth/skip-otp` — frictionless login (find-or-create)
Request `{ "phone": "9876543210", "restaurant_id": "689" }`
Response 200
```json
{ "success": true, "message": "Login successful",
  "data": { "token": "<jwt>", "customer_id": "<uuid>", "is_new_customer": false, "phone": "9876543210" } }
```
Behaviour: creates a Bronze customer with empty `name` if phone unknown. **No rate limit, no 409, no `Retry-After`.** Existing password-holders also receive a token.

### 1.2 `POST /scan/auth/register` — phone + password
Request `{ "phone", "name" (required), "password", "restaurant_id", "email"? }`
200 ok → `data: { "token", "customer_id" }`
200 `success:false` → `"Phone already registered"` (phone already has a password)
422 → `name`/`password`/`phone`/`restaurant_id` missing
Note: an existing OTP/POS-created customer without password is upgraded in place (name/email overwritten).

### 1.3 `POST /scan/auth/login` — phone + password
Request `{ "phone", "password", "restaurant_id" }`
200 ok → `data: { "token", "customer_id" }`
200 `success:false` → `"Invalid credentials"` (unknown phone, no password set, or wrong password — same message)

### 1.4 `POST /scan/auth/request-otp` — ⚠️ DEV-ONLY today
Request `{ "phone", "restaurant_id" }`
200 → `data: { "phone", "expires_in_seconds": 600, "dev_otp": "123456" }`
429 → `{ "detail": "Too many OTP requests. Try again in a few minutes." }` (>3 per phone per 5 min)
**No SMS/WhatsApp is sent. `dev_otp` is returned in the body.** Do not use in production until GAP-05 is fixed.

### 1.5 `POST /scan/auth/verify-otp`
Request `{ "phone", "otp", "restaurant_id" }`
200 ok → `data: { "token", "customer_id", "is_new_customer", "phone" }`
200 `success:false` → `"Invalid OTP"` | `"OTP expired"` (10-min expiry; no attempt lockout)

### 1.6 Forgot / reset password — **DOES NOT EXIST** (404). See PROPOSED §6.

---

## 2. Profile (Bearer)

### 2.1 `GET /scan/auth/me` (alias `GET /scan/profile`)
200 → `data` = customer document (`password_hash` removed). Fields the app should rely on:

| Field | Type | Notes |
|---|---|---|
| `id` | string | customer id |
| `name`, `phone`, `email` | string/null | `name` may be `""` for skip-otp-created customers |
| `country_code` | string | default `"+91"` |
| `tier` | string | `Bronze` \| `Silver` \| `Gold` \| `Platinum` |
| `total_points` | int | current balance |
| `wallet_balance` | float | |
| `total_visits`, `total_spent` | int, float | |
| `total_points_earned`, `total_points_redeemed` | int | lifetime (may be absent on old docs) |
| `total_wallet_received`, `total_wallet_used` | float | lifetime (may be absent) |
| `dob`, `anniversary`, `gender`, `preferred_language`, `allergies[]`, `favorites[]`, `diet_preference`, `spice_level`, `cuisine_preference` | | profile prefs |
| `addresses[]` | array | see §5 |
| `created_at`, `updated_at` | ISO | |

Other POS-sync fields (`pos_customer_id`, `gst_*`, `custom_field_*`, `notes`, …) may appear — ignore.
200 `success:false` → `"Customer not found"`.

### 2.2 `PUT /scan/profile`
Body: any subset of `name, email, dob, anniversary, gender, preferred_language, allergies[], favorites[], diet_preference, spice_level, cuisine_preference`. Phone cannot be changed.
200 → `{ success:true, message:"Profile updated", data:null }` · 200 `success:false` → `"No fields to update"`.

### 2.3 `GET /scan/loyalty` — computed summary (use for header + Points tab totals)
```json
{ "total_points": 1240, "points_monetary_value": 310.0, "tier": "Silver",
  "next_tier": "Gold", "points_to_next_tier": 260, "wallet_balance": 150.0,
  "total_visits": 12, "total_spent": 8420.5, "earn_rate_percent": 7.0,
  "redemption_value_per_point": 0.25 }
```
`next_tier` is `null` and `points_to_next_tier` is `0` at Platinum.

---

## 3. Orders (Bearer)

### 3.1 `GET /scan/orders?limit=50`
200 → `data: { "orders": [ Order ], "total": <int> }` — `orders` newest first (by CRM `created_at`), max 50; `total` = full count for this customer at this restaurant.

**Order** (full POS-ingested document; key fields)

| Field | Type | Notes |
|---|---|---|
| `id` | string | CRM order id (use for `/scan/orders/{id}`) |
| `pos_order_id`, `restaurant_order_id` | string/null | POS ids (show `restaurant_order_id` as bill no.) |
| `created_at` | ISO | CRM ingest time |
| `order_created_at`, `order_updated_at` | string/null | POS-side timestamps |
| `order_amount` | float | grand total |
| `order_sub_total` | float/null | |
| `order_discount`, `coupon_code`, `coupon_discount`, `loyalty_points_used`, `loyalty_discount`, `wallet_used` | | |
| `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `delivery_charge`, `tip_amount`, `round_up` | float/null | |
| `order_type` | string | **raw POS text** — live values: `dinein`, `takeaway`, `take_away`, `delivery`, `WalkIn`, `pos`. Normalise client-side. |
| `order_status`, `payment_method`, `payment_status`, `payment_type` | string/null | |
| `table_id`, `room_id`, `address_id` | string/null | |
| `points_earned` | int | |
| `off_peak_bonus` | int/null | |
| `items` | `OrderItem[]` | embedded |

**OrderItem**

| Field | Type | Maps to app field |
|---|---|---|
| `item_name` | string | `name` |
| `item_qty` | int | `quantity` |
| `item_price` | float | `price` (unit price) |
| `item_category`, `variant`, `variations[]`, `add_ons[]`, `addon_amount`, `variation_amount`, `discount_amount`, `gst_amount`, `vat_amount`, `is_veg`, `item_notes`, `pos_food_id` | | optional extras |

### 3.2 `GET /scan/orders/{order_id}`
200 → `data: Order` · 200 `success:false` → `"Order not found"` (also when order belongs to another customer).

Visibility rule: only orders where POS supplied the customer's phone at ingest are linked (`customer_id`). Walk-in orders without phone never appear.

---

## 4. Points & Wallet ledgers (Bearer)

### 4.1 `GET /scan/points/history?limit=50`
200 → `data: { "transactions": [ PointsTx ], "total": <int> }` (`total` = rows returned, ≤50)

**PointsTx**

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `points` | int | **always ≥ 0**; direction from `transaction_type` |
| `transaction_type` | string | `earn` \| `redeem` \| `bonus` \| `expired` (only this key — there is no `type`) |
| `description` | string/null | |
| `bill_amount` | float/null | on `earn` |
| `balance_after` | int/null | |
| `created_at` | ISO | |

App mapping: `earned` ← `earn`,`bonus` · `redeemed` ← `redeem` · `expired` ← `expired`. Sign: negate for `redeem`/`expired` if the UI wants signed values.
`expiring_soon` — **not available** (see PROPOSED §6).

### 4.2 `GET /scan/wallet/history?limit=50`
200 → `data: { "transactions": [ WalletTx ], "total": <int> }`

**WalletTx**: `id`, `amount` (float, ≥0), `transaction_type` (`credit` \| `debit`), `description`, `created_at`.
Balance → `/scan/loyalty.wallet_balance`; lifetime totals → `/scan/auth/me.total_wallet_received` / `total_wallet_used`.
Feature gate: `GET /scan/config/{restaurant_id}` → `data.showWallet` (bool). Wallet is per-tenant opt-in; hide tab when false.

### 4.3 `GET /scan/coupons`
200 → `data: { "coupons": [ Coupon + "my_usage_count" ] }` — active, in-date, eligible for this customer.

---

## 5. Addresses (Bearer) — unchanged from Phase-1

| Method | Path | Body | 200 `data` |
|---|---|---|---|
| GET | `/scan/addresses` | — | `{ addresses: Address[], total }` (default first) |
| POST | `/scan/addresses` | `Address` fields (`address` required) | new: `{ address_id, address }` · dedup (same `address`+`pincode`): `{ address_id, deduplicated:true }` |
| PUT | `/scan/addresses/{id}` | partial `Address` | `{ address_id }` |
| DELETE | `/scan/addresses/{id}` | — | `{ address_id }` (default auto-reassigned to most recent) |
| PUT | `/scan/addresses/{id}/default` | — | `{ address_id }` |

**Address**: `id, address_type (Home/Office/Other), address, house, floor, road, city, state, pincode, country, latitude, longitude, contact_person_name, contact_person_number, dial_code, zone_id, delivery_instructions, is_default, pos_address_id, created_at, updated_at`.
Not found → 200 `success:false` `"Address not found"`. First address auto-becomes default.

---

## 6. PROPOSED (not built — pending owner approval)

| Id | Change | Where | Risk |
|---|---|---|---|
| P-1 | Gate `dev_otp` behind `ENV=dev` / `OTP_DEV_MODE=true`; omit in prod responses | `scan.py:227` | LOW code / **P1 security** |
| P-2 | Add `skip` query param to `/scan/orders`, `/scan/points/history`, `/scan/wallet/history`; keep cap 50 | `scan.py` | LOW |
| P-3 | Add `expiring_soon: { points, expires_at }` to `/scan/loyalty` (reuse staff `points/expiring` logic) | `scan.py` | LOW–MEDIUM |
| P-4 | Rate-limit `skip-otp` (e.g. 5/phone/10 min → 429 + `Retry-After`) and/or return `success:false,"Password required"` when customer has `password_hash` | `scan.py` | MEDIUM (auth-adjacent, owner approval) |
| P-5 | Real OTP delivery (SMS/WhatsApp provider) → then `POST /scan/auth/forgot-password` `{phone, restaurant_id}` + `POST /scan/auth/reset-password` `{phone, otp, new_password, restaurant_id}` | new | HIGH (owner decision on provider) |
| P-6 | Expose OpenAPI at `/api/openapi.json` | `server.py` | LOW |

---

## 7. Change log
| Date | Version | Change |
|---|---|---|
| 2026-09-15 | 2.0 (as-built) | First formal capture of the `/scan/*` customer contract from code + live probe (INV-017). Replaces Customer App's assumed `/customer/me/*` contract. |
