# CRM API Contract Verification Request — Customer App

**From:** MyGenie Customer App team
**To:** MyGenie CRM team
**Date:** 2026-09-15
**Ref:** INV-2026-09-15-001
**CRM base URL in use:** `https://crm.mygenie.online/api` · `REACT_APP_CRM_API_VERSION=v2`
**Auth headers we send:** `Authorization: Bearer <customer JWT from skip-otp/login/register>` + `x-api-key: <per-restaurant key>` (values not included here)

We need you to **confirm or correct** the contract below. Please fill the **"CRM answer"** column and return the document (or reply with an OpenAPI/Swagger export — `/openapi.json` on your host currently serves the SPA, `/api/openapi.json` is 404).

---

## PART A — Customer Profile page data

The Customer App `/profile` page renders 4 tabs. This is what the app calls today and what it expects back.

### A1. Profile header (name / phone / email / tier / points / wallet balance)

| Item | Customer App today | CRM answer |
|---|---|---|
| Endpoint called | `GET /scan/auth/me` (Bearer) | |
| Live status observed (bad token) | 401 `Invalid customer token` → route exists ✅ | |
| Fields the UI reads | `name`, `phone`, `email`, `tier`, `total_points`, `wallet_balance`, `id` | |
| **Q-P1** | Does v2 `/scan/auth/me` return **`tier`, `total_points`, `wallet_balance`**? If not, which endpoint provides them? | |
| **Q-P2** | Exact response envelope: `{ success, message, data: {...} }`? (our client unwraps `data`) | |

### A2. Orders tab

| Item | Customer App today | CRM answer |
|---|---|---|
| Endpoint called | `GET /customer/me/orders?limit=50&skip=0` (Bearer) | |
| Live status observed | **404 Not Found** ❌ | |
| Candidate v2 route we found | `GET /scan/orders` → 401 on bad token (exists) — **contract unknown** | |
| Response shape the UI expects | `{ total_orders, orders: [ { id, created_at, order_amount, order_type, points_earned, items: [ { name, quantity, price } ] } ] }` | |
| **Q-O-1** | What is the **v2 endpoint** for a customer's order history? Method, path, query params (pagination), auth. | |
| **Q-O-2** | Exact response schema — field names for order id, date, amount, order type (dine-in/takeaway/delivery), points earned, line items. | |
| **Q-O-3** | Is the order list **restaurant-scoped** by the token, or must we pass `restaurant_id`? | |
| **Q-O-4** | Are orders placed via POS (`preprod.mygenie.online/api/v1`) visible in CRM order history? If not, where should the app read them from? | |

### A3. Points tab

| Item | Customer App today | CRM answer |
|---|---|---|
| Endpoint called | `GET /customer/me/points?limit=50` (Bearer) | |
| Live status observed | **404 Not Found** ❌ | |
| Candidate v2 routes probed | `/scan/points`, `/scan/auth/points` → both **404** — **no v2 route found** | |
| Response shape the UI expects | `{ total_points, points_value, tier, expiring_soon, transactions: [ { id, type \| transaction_type ('earned'/'redeemed'/…), points, description, created_at } ] }` | |
| **Q-PT-1** | Does v2 expose customer **points balance + transaction history**? Method, path, auth. | |
| **Q-PT-2** | Exact response schema (esp. transaction `type` values and sign convention of `points`). | |
| **Q-PT-3** | If not yet built — ETA, or confirm points should be hidden in the app. | |

### A4. Wallet tab

| Item | Customer App today | CRM answer |
|---|---|---|
| Endpoint called | `GET /customer/me/wallet?limit=50` (Bearer) | |
| Live status observed | **404 Not Found** ❌ | |
| Candidate v2 routes probed | `/scan/wallet`, `/scan/auth/wallet` → both **404** — **no v2 route found** | |
| Response shape the UI expects | `{ wallet_balance, total_received, total_used, transactions: [ { id, type \| transaction_type ('credit'/'debit'/…), amount, description, created_at } ] }` | |
| **Q-W-1** | Does v2 expose customer **wallet balance + transaction history**? Method, path, auth. | |
| **Q-W-2** | Exact response schema. | |
| **Q-W-3** | If not yet built — ETA, or confirm wallet should be hidden in the app. | |

### A5. Addresses (used in delivery flow — already v2, confirm only)

| Endpoint | Observed | CRM answer (confirm unchanged) |
|---|---|---|
| `GET /scan/addresses` | 401 on bad token → exists | |
| `POST /scan/addresses` | (dedup on address+pincode; returns `address` or only `address_id`) | |
| `PUT /scan/addresses/{id}` · `DELETE /scan/addresses/{id}` · `PUT /scan/addresses/{id}/default` | per Phase-1 contract | |

---

## PART B — OTP / customer auth routes

Context: Customer App has **quarantined** OTP login and forgot/reset-password (CR-2026-09-14-001) because SMS was not delivered in production. The **live** login path today is **`POST /scan/auth/skip-otp`** (frictionless, no OTP) plus password login/register.

| # | Route (v2) | Live status observed (empty body) | What we need CRM to verify | CRM answer |
|---|---|---|---|---|
| **Q-O1** | `POST /scan/auth/request-otp` body `{ phone, restaurant_id }` | 422 (validation) → route exists | Is a **real SMS** sent in production? Which provider / DLT template / sender ID? Is `dev_otp` still returned in the response body (must be **removed** in prod)? | |
| **Q-O2** | `POST /scan/auth/verify-otp` body `{ phone, otp, restaurant_id }` | 422 → route exists | Confirm response `{ token, customer_id, is_new_customer, phone }`. OTP expiry & max attempts? | |
| **Q-O3** | `POST /scan/auth/skip-otp` body `{ phone, restaurant_id }` | 422 → route exists | Confirm this stays supported (it is our **only** live customer login). Rate-limit / `Retry-After` behaviour, 409 semantics (existing customer with password). | |
| **Q-O4** | `POST /scan/auth/login` body `{ phone, password, restaurant_id }` | 422 → route exists | Confirm response `{ token, customer_id }`. | |
| **Q-O5** | `POST /scan/auth/register` body `{ phone, name, password, restaurant_id, email? }` | 422 → route exists | Confirm `name` is mandatory; response `{ token, customer_id }`. | |
| **Q-O6** | **Forgot / reset password** — `/customer/forgot-password`, `/customer/reset-password`, `/scan/auth/forgot-password`, `/scan/auth/reset-password` | **all 404** | Is there **any** v2 password-reset endpoint? If not, will one be built (depends on Q-O1 SMS working)? Until then the app keeps "Forgot Password" hidden. | |
| **Q-O7** | Token | — | Customer JWT lifetime, refresh mechanism (if any), and claim `user_id` format (`pos_{posId}_restaurant_{rid}` — app derives `x-api-key` from it). | |
| **Q-O8** | Errors | — | Confirm business errors arrive as HTTP 200 `{ success:false, message }` vs HTTP 4xx `{ detail }` — we handle both, but need the canonical rule. | |

---

## PART C — What we ask for

1. Filled-in **CRM answer** columns above, **or** a Swagger/OpenAPI export of the `/scan/*` customer surface.
2. One **UAT customer token** (or a UAT phone + restaurant_id we can `skip-otp` with) so we can capture real responses before planning the fix — share via secure channel, never in this document.
3. Confirmation of **production vs UAT** CRM base URLs.

## PART D — What happens on our side after your reply

- We register a Change Request to add v2 branches for orders / points / wallet in the Customer App (no code changes until then — investigation is read-only).
- OTP answers feed CR-2026-09-12-017 (SMS finalisation) and decide whether OTP login / forgot-password can be re-enabled.
