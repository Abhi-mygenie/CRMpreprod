# CRM API Contract Verification — CRM Reply

**Ref:** INV-2026-09-15-001 · **CRM tracking:** INV-017 · **Date:** 2026-09-15
**Verified against:** CRM codebase `routers/scan.py` + live preprod data (aggregates only). No secrets included.
**Rule of thumb:** everything the Customer App needs already exists under **`/api/scan/*`**. Nothing exists under `/customer/me/*`. All authenticated `/scan/*` routes use `Authorization: Bearer <customer JWT>`; `x-api-key` is ignored on these routes.

**Envelope (all `/scan/*`):** `{ "success": bool, "message": str, "data": object|null }` — unwrap `data`.

---

## PART A — Profile page

### A1. Profile header
| Item | CRM answer |
|---|---|
| Endpoint | `GET /scan/auth/me` ✅ (alias: `GET /scan/profile`) |
| Q-P1 | **Yes.** `data` is the full customer document: `id, name, phone, email, tier, total_points, wallet_balance, total_visits, total_spent, total_points_earned, total_points_redeemed, total_wallet_received, total_wallet_used, dob, anniversary, addresses[], …` (`password_hash` stripped). For a computed loyalty summary (next tier, earn rate, ₹ value of points) use `GET /scan/loyalty`. |
| Q-P2 | Confirmed `{ success, message, data }`. Not-found → HTTP 200 `{success:false,"Customer not found",data:null}`. |

### A2. Orders tab
| Item | CRM answer |
|---|---|
| Q-O-1 | **`GET /scan/orders?limit=50`** (Bearer). `limit` capped at 50. **No `skip`** — only the latest ≤50 orders are retrievable today. Detail: `GET /scan/orders/{id}`. |
| Q-O-2 | `data = { orders: [...], total: <int> }` (`total` = **full count** of this customer's orders — note: the points/wallet ledgers' `total` is only rows returned, see Q-PT-2/Q-W-2). Each order: `id` (CRM), `pos_order_id`, `restaurant_order_id`, `created_at` (ISO, CRM ingest), `order_created_at` (POS time), `order_amount`, `order_sub_total`, `order_type`, `order_status`, `points_earned`, `coupon_code`, `coupon_discount`, `loyalty_points_used`, `wallet_used`, `payment_method`, `items[]`. **Line items use POS names: `item_name`, `item_qty`, `item_price`** (plus `variant`, `add_ons`, `item_category`). `order_type` is raw POS text — live values: `dinein`, `takeaway`, `take_away`, `delivery`, `WalkIn`, `pos` (normalise on your side). |
| Q-O-3 | **Restaurant-scoped by token** (`restaurant_id` claim). Do not pass `restaurant_id`. |
| Q-O-4 | **Yes** — POS orders are ingested into CRM (`POST /api/pos/orders`) and linked to the customer by phone at ingest time; they appear in `/scan/orders`. Caveat: only orders where POS supplied the customer phone get linked (live: ~28% of all orders). Unlinked walk-in orders are not retrievable per customer. |

### A3. Points tab
| Item | CRM answer |
|---|---|
| Q-PT-1 | **Yes, two calls:** balance → `GET /scan/loyalty`; ledger → `GET /scan/points/history?limit=50` (Bearer, cap 50, no `skip`). Probed paths `/scan/points`, `/scan/auth/points` are wrong. |
| Q-PT-2 | `/scan/loyalty` → `{ total_points, points_monetary_value, tier, next_tier, points_to_next_tier, wallet_balance, total_visits, total_spent, earn_rate_percent, redemption_value_per_point }`. `/scan/points/history` → `{ transactions:[{ id, points, transaction_type, description, bill_amount, balance_after, created_at }], total }` (⚠️ `total` = rows returned ≤50, **not** full ledger count). **`transaction_type` values: `earn`, `redeem`, `bonus`, `expired`** (not `earned/redeemed`). **`points` is always positive**; direction comes from `transaction_type`. Field is `transaction_type` only (no `type`). |
| Q-PT-3 | Built. **Not available:** `expiring_soon` (no customer-facing route yet — CRM can add to `/scan/loyalty` on request). Map `points_value` ← `points_monetary_value`. |

### A4. Wallet tab
| Item | CRM answer |
|---|---|
| Q-W-1 | **Yes:** balance → `GET /scan/loyalty` (`wallet_balance`) or `/scan/auth/me`; ledger → `GET /scan/wallet/history?limit=50` (cap 50, no `skip`). |
| Q-W-2 | `{ transactions:[{ id, amount, transaction_type, description, created_at }], total }` (⚠️ `total` = rows returned, not full count); `transaction_type` = `credit` \| `debit`. `total_received` / `total_used` ← `/scan/auth/me` → `total_wallet_received` / `total_wallet_used`. |
| Q-W-3 | Built, but wallet is **per-tenant opt-in** (`wallet_enabled`, default off) and effectively unused in preprod today. Recommend showing the tab only when `GET /scan/config/{restaurant_id}` → `showWallet` is true. |

### A5. Addresses — **confirmed unchanged**
`GET /scan/addresses` → `{addresses[], total}` (default first). `POST /scan/addresses` → new: `{address_id, address}`; dedup hit (same address+pincode): `{address_id, deduplicated:true}` (no `address`). `PUT/DELETE /{id}`, `PUT /{id}/default` → `{address_id}`. Not-found → 200 `{success:false}`.

---

## PART B — OTP / auth

| # | CRM answer |
|---|---|
| Q-O1 | **No SMS is sent — in any environment.** `request-otp` only logs the OTP server-side and **returns it as `dev_otp` in the response**. No provider / DLT / sender ID exists in CRM. "SMS not delivered" is expected. CRM will register a security item to remove `dev_otp` from non-dev responses; do **not** re-enable OTP login until a delivery provider is decided. |
| Q-O2 | Response confirmed `{ token, customer_id, is_new_customer, phone }`. OTP expiry **10 min**. **No max-attempt lockout** (only request cap: 3 per phone per 5 min → HTTP 429). Wrong/expired OTP → 200 `{success:false}`. |
| Q-O3 | **Stays supported.** Find-or-create by phone; response `{ token, customer_id, is_new_customer, phone }`. **No rate limit, no `Retry-After`, no 409** — an existing password customer also gets a token silently. |
| Q-O4 | Confirmed `{ token, customer_id }`. Bad credentials → 200 `{success:false,"Invalid credentials"}`. |
| Q-O5 | `name` **is mandatory** (422 if missing). Response `{ token, customer_id }`. Phone already registered with password → 200 `{success:false}`. Existing OTP/POS customer without password is upgraded in place. |
| Q-O6 | **No customer password-reset endpoint exists** (all 4 probed paths correctly 404). Will depend on Q-O1 provider decision. Keep "Forgot Password" hidden. |
| Q-O7 | JWT HS256, **lifetime 24 h**, **no refresh** — re-login via `skip-otp`. Claims: `customer_id`, `restaurant_id`, `phone`, `type:"customer"`, `exp`. ⚠️ The tenant claim is named **`restaurant_id`** (value `pos_0001_restaurant_{rid}`), **not `user_id`**. |
| Q-O8 | Canonical rule: **transport/auth/validation → HTTP 4xx `{detail}`** (401 missing header *on live* / 403 on preprod pod — FastAPI version drift, treat both as "re-auth"; 401 invalid/expired token; 422 body validation; 429 OTP cap; 404 unknown path). **Business outcomes → HTTP 200 `{success:false, message, data:null}`.** Keep handling both. |

---

## PART C

1. Answers above. OpenAPI: FastAPI serves it at host **root** `/openapi.json`, which the ingress routes to the SPA — CRM can export the JSON internally and share on request.
2. UAT token: any `phone` + `restaurant_id` via `POST /scan/auth/skip-otp` on the UAT host works today — owner to share a UAT restaurant id via secure channel.
3. Base URLs: production CRM URL / deployment is **not documented in this codebase** — owner to confirm.

---

## Corrections after Customer App review (2026-09-15)
| # | Your finding | CRM verdict |
|---|---|---|
| D1 | Doc said missing header → 403; live returns 401 on all 7 routes | **Confirmed, doc corrected.** Verified live: all 7 `/scan/*` routes → `401 {"detail":"Not authenticated"}` with no header. Preprod pod (pinned `fastapi==0.110.1`) returns 403 for the same case; live runs FastAPI ≥ 0.122 where HTTPBearer switched to 401 (RFC 7235 alignment). Environment drift, not a contract rule — treat 401/403 identically. Tracked as P-7. |
| D4 | `total` = full count for orders but rows-returned for points/wallet | **Confirmed, doc corrected.** `scan.py:529` uses `count_documents` for orders; `scan.py:509/519` use `len(txns)` for ledgers. Fix folded into P-2 (pending owner approval). Until then, don't use ledger `total` for pagination. |
