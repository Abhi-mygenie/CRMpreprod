# INV-017 — Customer App ↔ CRM v2 Contract Verification (Read-Only)

**Source:** `memory/crm/inbox/CRM_CONTRACT_VERIFICATION_REQUEST.md` (Customer App team, ref INV-2026-09-15-001)
**Role:** INVESTIGATION · **Risk:** HIGH (API contract / auth-adjacent) · **Code changed:** NONE
**Steps used:** 10/10 · **Date:** 2026-09-15
**Codebase truth:** `routers/scan.py` (879 LOC), `core/auth.py`, `routers/pos.py:880-1039`, `models/schemas.py`, live Mongo (aggregates only)

---

## 1. Hypotheses & outcome

| # | Hypothesis | Evidence | Result |
|---|---|---|---|
| H1 | Orders/points/wallet endpoints do not exist in v2 (feature gap) | `scan.py:464-543` defines `/scan/loyalty`, `/scan/points/history`, `/scan/wallet/history`, `/scan/orders`, `/scan/orders/{id}` | **ELIMINATED** — routes exist |
| H2 | Customer App probed the wrong paths (`/scan/points`, `/scan/wallet`, `/customer/me/*`) | Live probe: those → 404; real paths → 403 (no token) / 401 (bad token) | **CONFIRMED** — path mismatch, not a missing feature |
| H3 | Response schema differs from what the Customer App UI expects | Field-by-field diff below (§3) | **CONFIRMED** — shape mismatches on all 3 tabs |

**Root cause:** CONFIG/CONTRACT (FE). The Customer App integrated against an assumed `/customer/me/*` contract that never existed in CRM. The CRM v2 `/scan/*` surface covers every data need except **password reset**, but with different paths, envelope, field names and pagination.

---

## 2. Route inventory — customer surface (`/api/scan/*`, prefix `/api` from `server.py:156`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/scan/auth/request-otp` | none | body `{phone, restaurant_id}` · 429 after 3/5min · **log-only, returns `dev_otp`** |
| POST | `/scan/auth/verify-otp` | none | body `{phone, otp, restaurant_id}` · expiry 10 min · no max-attempt counter |
| POST | `/scan/auth/skip-otp` | none | body `{phone, restaurant_id}` · find-or-create · **no rate limit, no 409** |
| POST | `/scan/auth/register` | none | body `{phone, name, password, restaurant_id, email?}` · `name` required |
| POST | `/scan/auth/login` | none | body `{phone, password, restaurant_id}` |
| GET | `/scan/auth/me` | Bearer | full customer doc minus `password_hash` |
| GET/PUT | `/scan/profile` | Bearer | same doc / partial update |
| GET | `/scan/loyalty` | Bearer | tier/points/wallet summary (computed) |
| GET | `/scan/points/history?limit=` | Bearer | max 50, **no skip** |
| GET | `/scan/wallet/history?limit=` | Bearer | max 50, **no skip** |
| GET | `/scan/orders?limit=` | Bearer | max 50, **no skip**, returns `total` |
| GET | `/scan/orders/{order_id}` | Bearer | own orders only |
| GET | `/scan/coupons` | Bearer | eligible active coupons |
| GET/POST | `/scan/addresses` · PUT/DELETE `/scan/addresses/{id}` · PUT `/scan/addresses/{id}/default` | Bearer | unchanged from Phase-1 |
| — | `/scan/points`, `/scan/wallet`, `/scan/auth/wallet`, `/scan/auth/points`, `/customer/me/*`, `/scan/auth/forgot-password`, `/scan/auth/reset-password` | — | **DO NOT EXIST (404)** |

`x-api-key` header sent by the Customer App is **ignored** on all `/scan/*` routes (tenant comes from the JWT `restaurant_id` claim).

---

## 3. Gap matrix (Customer App expectation vs CRM reality)

### GAP-01 · Orders — path + shape (P1)
| | Customer App | CRM v2 |
|---|---|---|
| Path | `GET /customer/me/orders?limit=50&skip=0` | `GET /scan/orders?limit=50` |
| Envelope | flat | `{success, message, data:{orders:[], total}}` |
| `total_orders` | — | `data.total` |
| `id` | `id` | `id` ✅ (also `pos_order_id`, `restaurant_order_id`) |
| `created_at` | `created_at` | `created_at` ✅ (ISO str, CRM ingest time) · POS time in `order_created_at` |
| `order_amount` | `order_amount` | `order_amount` ✅ |
| `order_type` | dine-in/takeaway/delivery | raw POS strings: `dinein`, `takeaway`, `take_away`, `delivery`, `WalkIn`, `pos` (live distinct) |
| `points_earned` | `points_earned` | `points_earned` ✅ |
| `items[].name/quantity/price` | `name, quantity, price` | **`item_name, item_qty, item_price`** ❌ |
| Pagination | `skip` | **not supported** (limit only, capped 50) ❌ |
| Extra | — | ~60 POS fields per order (full doc returned, no projection) |

### GAP-02 · Points — path + shape (P1)
| | Customer App | CRM v2 |
|---|---|---|
| Path | `GET /customer/me/points?limit=50` | **two calls**: `GET /scan/loyalty` (balance) + `GET /scan/points/history?limit=50` (ledger) |
| `total_points` | | `loyalty.data.total_points` ✅ |
| `points_value` | | `loyalty.data.points_monetary_value` (name differs) |
| `tier` | | `loyalty.data.tier` ✅ (+ `next_tier`, `points_to_next_tier`, `earn_rate_percent`, `redemption_value_per_point`) |
| `expiring_soon` | | **not provided** in scan surface ❌ (staff-only `GET /points/expiring/{customer_id}` exists) |
| `transactions[].type \| transaction_type` | `earned/redeemed/…` | `transaction_type` only; live values **`earn`, `redeem`, `bonus`, `expired`** (no `type` key in DB — schema alias only) |
| `points` sign | expects sign | **always positive**; direction is in `transaction_type` (live: 0 negative rows of 13,987) |
| `description`, `created_at`, `id` | | ✅ present; also `balance_after`, `bill_amount` |

### GAP-03 · Wallet — path + shape (P1)
| | Customer App | CRM v2 |
|---|---|---|
| Path | `GET /customer/me/wallet?limit=50` | `GET /scan/loyalty` (balance) + `GET /scan/wallet/history?limit=50` |
| `wallet_balance` | | `loyalty.data.wallet_balance` or `auth/me.data.wallet_balance` ✅ |
| `total_received` / `total_used` | | `auth/me.data.total_wallet_received` / `total_wallet_used` (on customer doc; not in `/scan/loyalty`) |
| `transactions[].type` | `credit/debit` | `transaction_type` = `credit` / `debit` ✅ (live distinct) |
| `amount`, `description`, `created_at`, `id` | | ✅ |
| Feature flag | — | `loyalty_settings.wallet_enabled` per tenant (default `false`); `scan/config/{rid}.showWallet` UI flag. Live: only 12 wallet txns DB-wide — module effectively **inactive** (see CR-025 ⏸) |

### GAP-04 · Password reset for customers — MISSING (P2, blocked on SMS)
No customer forgot/reset-password route exists. Staff-side `/auth/forgot-password/*` (auth.py:573-708) is email-keyed and WhatsApp-delivered via tenant AuthKey — **not reusable** for customers. Any customer flow depends on OTP delivery (GAP-05).

### GAP-05 · OTP is DEV-ONLY (P0 for any OTP-based flow)
`scan.py:224-227`: no provider call; OTP is written to server log and **returned in the body as `dev_otp`**. No SMS/DLT/sender ID exists anywhere in CRM (env has only AuthKey WhatsApp keys). Customer App observation "SMS not delivered in production" is **expected behaviour**, not an outage. `dev_otp` leakage in prod is a **security defect** if `request-otp` is reachable publicly.

### GAP-06 · `skip-otp` has no guard rails (P2, security note)
No rate limit, no `Retry-After`, no 409 for existing password customers — anyone knowing a phone + restaurant_id receives a full 24h customer token. Recommend owner decision before this stays the "only live login".

### GAP-07 · Token contract (INFO)
Claims: `customer_id`, `restaurant_id` (= `pos_0001_restaurant_{rid}`), `phone`, `type:"customer"`, `exp` (24h, `core/auth.py:13`). **No `user_id` claim** — the Customer App doc says it derives `x-api-key` from `user_id`; the claim is named `restaurant_id`. **No refresh endpoint** — re-login via `skip-otp`.

### GAP-08 · Error convention is mixed (INFO)
- Transport/auth/validation → HTTP 4xx `{detail}` (401 bad/expired token, 403 missing header, 422 body, 429 OTP rate-limit).
- Business outcomes → HTTP 200 `{success:false, message, data:null}` (invalid credentials, invalid/expired OTP, not found, phone already registered).
Customer App's dual handling is correct; canonical rule above.

### GAP-09 · OpenAPI unreachable externally (INFO)
FastAPI serves `/openapi.json` and `/docs` at **root**, but ingress routes only `/api/*` to backend → external `/openapi.json` hits the SPA, `/api/openapi.json` is 404 (confirmed on pod). Export can be generated internally on request.

### GAP-10 · POS-order visibility (Q-O-4) — PARTIAL (DATA)
POS orders land in `db.orders` with `user_id` = tenant id and `customer_id` resolved by phone at ingestion (`pos.py:882`). `users.id` format `pos_0001_restaurant_{rid}` (40/40 users) == scan token `restaurant_id` → **linked orders are visible** via `/scan/orders`. Live: **18,778 of 66,977 orders (28%) carry a `customer_id`**; the rest (walk-in / no phone) can never appear in any customer's history.

---

## 4. Answers to Part B (OTP / auth)

| Q | Answer |
|---|---|
| Q-O1 | **No real SMS.** No provider, no DLT template, no sender ID. `dev_otp` **is** returned in prod body. Must be removed/gated before any prod exposure. |
| Q-O2 | Response confirmed `{token, customer_id, is_new_customer, phone}` inside `data`. Expiry 10 min. **No max-attempts** (only the 3-per-5-min request cap). Failures → 200 `{success:false}`. |
| Q-O3 | Supported; find-or-create; response `{token, customer_id, is_new_customer, phone}`. **No rate limit / Retry-After / 409.** Existing password customer also gets a token silently. |
| Q-O4 | Confirmed `{token, customer_id}`; bad creds → 200 `{success:false,"Invalid credentials"}`. |
| Q-O5 | `name` **mandatory** (422 if missing). Existing OTP/POS customer without password is upgraded in place. Response `{token, customer_id}`. Already-registered → 200 `{success:false}`. |
| Q-O6 | **None exists for customers.** Building one requires SMS/WhatsApp OTP delivery first. Keep "Forgot Password" hidden. |
| Q-O7 | 24h lifetime, HS256, no refresh. Claims listed in GAP-07. Claim name is `restaurant_id`, not `user_id`. |
| Q-O8 | See GAP-08. |

---

## 5. Recommendation

| Item | Route to | Notes |
|---|---|---|
| GAP-01/02/03 (path+shape) | **Customer App CR** (their side) — adapter over existing `/scan/*` | Zero CRM code needed for MVP. Optional CRM follow-up CR for `skip` pagination + `expiring_soon` in `/scan/loyalty` (LOW/MEDIUM, `scan.py` only, not a hotspot). |
| GAP-05 (`dev_otp` in prod) | **CRM INTAKE → P1 security** | Gate `dev_otp` behind env flag. Small, `scan.py:227`. Owner approval (auth-adjacent). |
| GAP-06 (`skip-otp` unguarded) | **Owner decision** | Accept risk vs add rate-limit. |
| GAP-04 + Q-O1 SMS provider | **Owner decision / new CR** | Provider selection (AuthKey SMS? WhatsApp OTP template?) is a business/procurement call. |
| Q-O7 claim naming | Customer App fix | Read `restaurant_id`, not `user_id`. |
| Part C item 2 (UAT token) | Owner, secure channel | Any `phone` + `restaurant_id` via `skip-otp` on UAT works today. |
| Part C item 3 (URLs) | Owner | Production CRM URL is UNKNOWN to this codebase (addendum §15 Q1). |

**Next role:** INTAKE (register GAP-05 `dev_otp` as P1 security item + optional pagination CR) → owner decisions on GAP-04/06.

---

## 6. Attached artifacts (for records)
| File | Purpose |
|---|---|
| `INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md` | Their questionnaire with "CRM answer" filled — send as-is |
| `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` | Formal as-built contract for `/api/scan/*` (+ §6 PROPOSED changes P-1…P-6) |
| `INV_017_openapi_scan_v2.json` | Machine-readable OpenAPI 3 export, filtered to 21 `/api/scan/*` paths + 14 schemas (from live app) |
