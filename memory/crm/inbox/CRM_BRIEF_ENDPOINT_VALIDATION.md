# CRM Brief — What the Customer App needs from the `/scan/*` API
## From: MyGenie Customer App · Ref: INV-2026-09-15-003 · Date: 2026-09-15

**Context in one line:** Our owner has ruled that the Customer App must never read or write CRM's
MongoDB collections. Everything customer-related must come from your API. Below is the complete
list of what we need. We believe most of it already exists — please confirm each row.

**How to reply:** copy the table, fill the last column with `OK` / `OK, but: <difference>` / `MISSING`.

---

## How we identify a customer

| When | How we identify them | Comes from |
|---|---|---|
| **Before login** | `phone` (10-digit national, e.g. `9579504871`) + `restaurant_id` (short, `"689"`) | diner types phone on landing page / checkout |
| **After login** | your **customer JWT** (`/scan/auth/verify-otp` or `/scan/auth/skip-otp`) — claims `customer_id`, `restaurant_id`, `phone` | sent as `Authorization: Bearer` on every call |
| **Restaurant** | `restaurant_id` short format `"689"` everywhere. If you need `pos_0001_restaurant_689`, tell us and we'll send that instead. | URL `/:restaurantId/...` |

If the token already carries `restaurant_id`, we will **not** pass it again. Please confirm.

---

## What we need — one row per feature

### A. Logged-in customer (we send your customer token)

| # | Feature in our app | Endpoint we will call | We need back | CRM confirm |
|---|---|---|---|---|
| A1 | Profile header — name, tier, points, wallet | `GET /scan/auth/me` + `GET /scan/loyalty` | `name, phone, tier, total_points, wallet_balance` | |
| A2 | Profile → Orders tab | `GET /scan/orders?limit=&skip=` | list `{order_id, date, total, status}` | |
| A3 | Order detail | `GET /scan/orders/{order_id}` | order + line items | |
| A4 | Profile → Points tab | `GET /scan/points/history?limit=` | `{points, type earn/redeem, order_id, date}` | |
| A5 | Profile → Wallet tab | `GET /scan/wallet/history?limit=` | `{amount, type, balance_after, date}` | |
| A6 | Coupons for this customer | `GET /scan/coupons` | `{code, discount, min_order, expires_at}` | |
| A7 | Edit profile | `PUT /scan/profile` | accepts `name, email` | |
| A8 | Addresses | `GET/POST /scan/addresses`, `PUT/DELETE /scan/addresses/{id}`, `PUT .../default` | already in use — confirm unchanged | |
| A9 | **Submit feedback** | `POST /scan/feedback` | **exact body?** we have `rating 1–5, message, name, email`. Is token required? | |
| A10 | Call waiter / request bill | `POST /scan/call-waiter`, `POST /scan/request-bill` | body = `{table_no}`? | |

### B. Before login (we only have phone + restaurant_id)

| # | Feature in our app | What we need | Endpoint — exists? | CRM confirm |
|---|---|---|---|---|
| B1 | **Greet by name** — diner types phone on landing page → "Welcome back, Alok" | `{exists: true/false, name}` for `phone` + `restaurant_id` | we don't see one in OpenAPI. Do you have it? If not, is `POST /scan/auth/skip-otp` acceptable (it creates the customer as a side-effect)? | |
| B2 | **Checkout pre-fill** — diner types phone at Review Order → pre-fill name, show points/tier | `{name, total_points, tier, wallet_balance}` for `phone` + `restaurant_id` | same as B1, plus points. If you require login for points, say so — we'll move OTP before checkout. | |
| B3 | **"You will earn N points"** preview at checkout | the restaurant's loyalty **rules**: `bronze/silver/gold/platinum_earn_percent, redemption_value, min_order_value, first_visit_bonus_enabled, first_visit_bonus_points` | not in `/scan/loyalty` (that's the customer's balance). Can you add these fields to `GET /scan/config/{restaurant_id}` which we already read? | |

### C. Restaurant admin (our admin panel login)

| # | Feature | What we need | Endpoint — exists? | CRM confirm |
|---|---|---|---|---|
| C1 | Admin logs into **our** admin panel with email + password | verify credentials, return `{token, restaurant_id, pos_id, restaurant_name}` | today we read your `users` collection directly — we must stop. Do you have `POST /scan/admin/login` or equivalent? If not, will you add it? | |
| C2 | Validate that admin token on our admin routes | a way to verify your admin token (shared public key, or `GET /scan/admin/me`) | | |

### D. Two write-locks we need from you (owner decisions O1 / O2)

| # | Collection | Ask | CRM confirm |
|---|---|---|---|
| D1 | `customer_app_config` | Owner decision pending (O1). If Customer App is confirmed owner: disable or 405 your `PUT /scan/config/{rid}`. If key-partition: send us the list of keys CRM writes. | |
| D2 | `dietary_tags_mapping` | **Owner decided: Customer App owns.** Please disable `PUT /scan/menu/dietary-tags/{rid}` (keep GET). | |

### E. Housekeeping (yes/no)

| # | Question | CRM confirm |
|---|---|---|
| E1 | Is your JWT fallback `dinepoints-secret-key-2024` removed / removable before next release? | |
| E2 | Does `PUT /scan/config/{rid}` normalise `restaurant_id` to short format `"689"` before writing? | |
| E3 | Do `pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs` exist in prod? | |
| E4 | Who owns `import_logs`, `webhook_logs`, `coupon_distributions`, `customer_documents`? | |
| E5 | Will you also fill the per-collection JSON in `CRM_BRIEF_OWNERSHIP_BOARD.md`? (needed to sign the ownership map) | |

---

## What we do once you confirm

- Delete 14 dead backend routes that read your tables (zero user impact).
- Point profile tabs at A2/A4/A5 (they're on your old v1 paths today → 404).
- Switch feedback to A9 and delete our direct insert.
- Wire B1–B3 to whatever you confirm, or move OTP earlier if you require login.
- Replace our `users` read with C1/C2.
- Sign the ownership map.
