# CRM POS Order Webhook Investigation Report

> **Branch:** `main` (`/app`)
> **Date:** 2026-05-21
> **Investigator:** Senior CRM ↔ POS Webhook Investigation Agent
> **Mode:** Investigation only — no code, env, or DB changes performed.

---

## 1. Executive Summary

| Question | Answer |
|---|---|
| Are POS webhook endpoints present in CRM? | **Yes.** Mounted under `/api/pos/*` (router declared in `routers/pos.py`, line 18). |
| Is an inbound order-create endpoint present? | **Yes.** `POST /api/pos/orders` (`pos_order_webhook`, `routers/pos.py:1070`). A deprecated `POST /api/pos/webhook/payment-received` also exists (`routers/pos.py:1219`). |
| Is order JSON contract defined in code? | **Yes.** `POSOrderWebhook` pydantic model (`routers/pos.py:995–1067`) — full field-level schema. |
| Is auth clear? | **Yes.** Dual auth via `verify_pos_auth` (`core/auth.py:93–127`) — accepts `X-API-Key: <users.api_key>` or `Authorization: Bearer <staff JWT>`. |
| Is the CR-001 pushed `crm_token` the right credential? | **Yes.** `crm_token` pushed via `POST /api/v1/auth/restaurant-crm-token` IS `users.api_key`, which is exactly what `X-API-Key` resolves on the CRM side. |
| Are orders actually being saved? | **Yes — for some restaurants.** Live DB shows `orders` collection contains **17,353** documents across 7+ restaurant users; the most recent insert is **2026-05-21T06:44:15+00:00**, i.e. minutes before this report. |
| **Why are some orders not appearing in CRM?** | **The endpoint and write path are working.** Non-arrival is restaurant-specific. The most likely causes (ranked in §8) are: (a) POS still calling the **deprecated** `/pos/webhook/payment-received` URL or a wrong path that 404s; (b) silent rejection by `_validate_order` because of `payment_status != "success"`, duplicate `pos_order_id`, or `pos_id`/`restaurant_id` mismatch with `users.{pos_id, restaurant_id}`; (c) POS sending `restaurant_id` as **integer** while CRM stores and compares it as **string** (CRM stores `"475"`, not `475`); (d) POS not yet sending the `X-API-Key` header even though CR-001 has pushed it. POS-side request logs are required to confirm which of these is happening for the affected restaurants. |

**Bottom line:** the CRM-side inbound order pipeline is implemented, documented, and demonstrably writing data. The current order-sync gap is a **payload / auth / endpoint-path issue on the POS side**, not a missing CRM endpoint.

---

## 2. POS Webhook Endpoint Inventory

All endpoints prefixed with `/api/pos`. Auth column shows what `verify_pos_auth` accepts unless noted.

| Method | Endpoint | Function (file:line) | Auth | Purpose | Writes to DB? |
|---|---|---|---|---|---|
| POST | `/api/pos/customers` | `pos_create_customer` (`pos.py:200`) | `verify_pos_auth` | Create CRM customer from POS | **Yes** — `customers` |
| PUT  | `/api/pos/customers/{customer_id}` | `pos_update_customer` (`pos.py:353`) | `verify_pos_auth` | Update customer | **Yes** — `customers` |
| GET  | `/api/pos/customers` | `pos_search_customers` (`pos.py:1852`) | `verify_pos_auth` | Search customers (typeahead) | No |
| GET  | `/api/pos/customers/{customer_id}` | `pos_get_customer_full` (`pos.py:1889`) | `verify_pos_auth` | Full customer profile | No |
| DELETE | `/api/pos/customers/{customer_id}` | `pos_soft_delete_customer` (`pos.py:1940`) | `verify_pos_auth` | Soft-delete (set `is_blocked=true`) | **Yes** — `customers` |
| POST | `/api/pos/customer-lookup` | `pos_customer_lookup` (`pos.py:1554`) | `verify_pos_auth` | Phone-exact lookup w/ loyalty | No |
| POST | `/api/pos/max-redeemable` | `pos_max_redeemable` (`pos.py:437`) | `verify_pos_auth` | Max points redeemable for a bill | No |
| **POST** | **`/api/pos/orders`** | **`pos_order_webhook` (`pos.py:1070`)** | **`verify_pos_auth`** | **Primary inbound ORDER webhook** | **Yes** — `orders`, `order_items`, `customers`, `points_transactions`, `wallet_transactions` |
| POST | `/api/pos/webhook/payment-received` | `pos_payment_received` (`pos.py:1219`) | `verify_pos_auth` | **DEPRECATED** legacy payment webhook | **Yes** — `customers`, `points_transactions` (NO `orders` insert, NO `order_items`, NO wallet/WhatsApp triggers) |
| POST | `/api/pos/events` | `pos_event_webhook` (`pos.py:1637`) | `verify_pos_auth` | Trigger WhatsApp events (does NOT save orders) | `whatsapp_message_logs` only |
| GET  | `/api/pos/customers/{customer_id}/addresses` | `pos_list_addresses` (`pos.py:1958`) | `verify_pos_auth` | List addresses | No |
| POST | `/api/pos/customers/{customer_id}/addresses` | `pos_add_address` (`pos.py:1974`) | `verify_pos_auth` | Add address | **Yes** — `customers.addresses` |
| PUT  | `/api/pos/customers/{customer_id}/addresses/{addr_id}` | `pos_update_address` (`pos.py:2018`) | `verify_pos_auth` | Update address | **Yes** — `customers.addresses` |
| DELETE | `/api/pos/customers/{customer_id}/addresses/{addr_id}` | `pos_delete_address` (`pos.py:2051`) | `verify_pos_auth` | Delete address | **Yes** — `customers.addresses` |
| PUT  | `/api/pos/customers/{customer_id}/addresses/{addr_id}/default` | `pos_set_default_address` (`pos.py:2080`) | `verify_pos_auth` | Mark default address | **Yes** — `customers.addresses` |
| POST | `/api/pos/address-lookup` | `pos_cross_restaurant_address_lookup` (`pos.py:2110`) | `verify_pos_auth` | Cross-restaurant phone→addresses | No |
| GET  | `/api/pos/customers/{customer_id}/orders` | `pos_customer_orders` (`pos.py:2147`) | `verify_pos_auth` | Read order history (READ-ONLY) | No |
| GET  | `/api/pos/customers/{customer_id}/loyalty` | `pos_customer_loyalty` (`pos.py:2168`) | `verify_pos_auth` | Loyalty summary | No |
| POST | `/api/pos/coupons/validate` | `pos_validate_coupon` (`pos.py:2207`) | `verify_pos_auth` | Validate coupon | No |
| POST | `/api/pos/coupons/apply` | `pos_apply_coupon` (`pos.py:2251`) | `verify_pos_auth` | Apply & record coupon usage | **Yes** — `coupon_usages` |
| GET  | `/api/pos/customers/{customer_id}/notes/items` | `pos_customer_item_notes` (`pos.py:2288`) | `verify_pos_auth` | Aggregated item notes (read) | No |
| GET  | `/api/pos/customers/{customer_id}/notes/orders` | `pos_customer_order_notes` (`pos.py:2329`) | `verify_pos_auth` | Aggregated order notes (read) | No |
| GET  | `/api/pos/api-key` | `get_api_key` (`pos.py:1598`) | **CRM staff JWT only** (`get_current_user`) | Fetch own API key | Lazy-creates `users.api_key` |
| POST | `/api/pos/api-key/regenerate` | `regenerate_api_key` (`pos.py:1609`) | **CRM staff JWT only** | Rotate API key | **Yes** — `users.api_key` |

Mounted in `backend/server.py:33–48` via `api_router.include_router(pos.router)` under prefix `/api`. CORS allows `*` (`server.py:69`).

---

## 3. Order-Related Endpoint Deep Dive

### 3.1 `POST /api/pos/orders` — PRIMARY ORDER WEBHOOK

- **Method:** POST
- **Path:** `/api/pos/orders` (full: `<CRM_BASE_URL>/api/pos/orders`)
- **Function:** `pos_order_webhook` — `routers/pos.py:1070–1216`
- **Auth:** `verify_pos_auth` → `X-API-Key: <users.api_key>` **OR** `Authorization: Bearer <staff JWT>`
- **Request body model:** `POSOrderWebhook` — `routers/pos.py:995–1067`
- **Required fields (no default):** `restaurant_id`, `order_id`, `cust_mobile`, `order_amount`
- **Optional / defaulted fields:** `pos_id` (default `"mygenie"`), `payment_status` (default `"success"`), `order_type` (default `"pos"`), `cust_name`, `cust_email`, `user_id` (= POS customer ID), all tax/charge/tip fields (default `0.0`), `coupon_code`, `wallet_used`, `items[]` (`OrderItem` model, see §4).
- **Validations performed (before any write)** — `_validate_order` (`pos.py:523–555`):
  1. `user.pos_id` (from CRM `users` doc) **must equal** incoming `order_data.pos_id` — else reject with `"Invalid pos_id. Expected: ..."`.
  2. `user.restaurant_id` **must equal** incoming `order_data.restaurant_id` — else reject with `"Invalid restaurant_id. Expected: ..."`.
  3. `order_data.payment_status` **must equal** `"success"` — else reject with `"Order not processed - payment status: <x>"`.
  4. Duplicate check: `orders` collection lookup by `{pos_id, pos_restaurant_id, pos_order_id}` — if found, return `"Duplicate order - already processed"`.
- **DB writes (on success):**
  | Collection | Operation | Key fields written |
  |---|---|---|
  | `orders` | `insert_one` (`pos.py:868`) | `id`, `user_id`, `customer_id`, `pos_id`, `pos_restaurant_id`, `pos_order_id`, `pos_customer_id`, `cust_mobile`, `cust_name`, `cust_email`, `order_amount`, `order_sub_total`, all taxes/discounts/charges, `payment_method/status/type`, `order_type/status`, `table_id`, `waiter_id`, `employee_id/name`, `items[]` (embedded), `points_earned`, `off_peak_bonus`, `order_created_at`, `order_updated_at`, `created_at` |
  | `order_items` | `insert_many` (`pos.py:915`) | One row per cart item with `order_id`, `customer_id`, `user_id`, `item_name`, `pos_food_id`, `item_category`, `item_qty`, `item_price`, variants/add-ons, taxes, station, notes |
  | `customers` | `update_one` (`pos.py:1129`) | `total_points`, `tier`, `wallet_balance`, `total_visits`, `total_spent`, `avg_order_value`, `last_visit` |
  | `customers` | `insert_one` via `_find_or_create_customer` (`pos.py:715`) | Auto-creates customer if `cust_mobile` (or `user_id`/`pos_customer_id`) not found |
  | `points_transactions` | `insert_one` (`pos.py:921`) | `transaction_type: "earn"`, points earned with order_id reference |
  | `wallet_transactions` | `insert_one` (`pos.py:934`) | Only when `wallet_used > 0` |
- **Response model:** `POSResponse { success, message, data }` — on success returns `order_id, pos_order_id, customer_id, points_earned, total_points, tier, wallet_balance_after, coupon_applied`.
- **WhatsApp side-effects (non-blocking, `asyncio.create_task`):** `send_bill` (every order), `first_visit` (new customers), `tier_upgrade` (tier increase). These are best-effort and never affect the order write.
- **Error envelope:** Validation failures return HTTP **200** with `{"success": false, "message": "..."}` (POS-friendly). Only programming exceptions return HTTP 500.

### 3.2 `POST /api/pos/webhook/payment-received` — DEPRECATED (still active)

- **Method:** POST
- **Path:** `/api/pos/webhook/payment-received`
- **Function:** `pos_payment_received` — `routers/pos.py:1219–1552`
- **Auth:** Same `verify_pos_auth`.
- **Request body model:** `POSPaymentWebhook` — `models/schemas.py:750–757`. Fields: `customer_phone` (required), `bill_amount` (required), `channel` (default `"dine_in"`), `coupon_code`, `redeem_points`, `bill_id`, `metadata`. **No `restaurant_id`, no `order_id`, no `items[]`.**
- **DB writes:** `customers` (auto-create + update points/spend), `points_transactions`. **NO insert into `orders`. NO `order_items`.**
- **Implication:** A POS calling this endpoint will appear "connected" (returns `success: true`), customer/points get updated, but the order is **never recorded as an order row in `orders`** — so CRM UI/order history will not display it. Per `POS_API.md` §5.2 and §Appendix B this endpoint is explicitly deprecated and migration to `/pos/orders` is required for order rows to appear.

### 3.3 `POST /api/pos/events` — NOT an order endpoint

- **Function:** `pos_event_webhook` — `routers/pos.py:1637+`
- **Purpose:** Trigger WhatsApp messages around order lifecycle (`new_order_customer`, `order_confirmed`, `order_ready_customer`, `send_bill_auto`, …).
- **Does NOT save orders.** It only reads from `whatsapp_event_template_map` and writes to `whatsapp_message_logs`. Any POS sending order data here will be ignored from a persistence standpoint.

### 3.4 `GET /api/pos/customers/{customer_id}/orders` — read-only history

- **Function:** `pos_customer_orders` (`pos.py:2147–2167`).
- **Reads from `orders` collection.** Does not accept inbound writes.

---

## 4. Expected Order JSON Format

Code-defined contract — `POSOrderWebhook` (`routers/pos.py:995–1067`) + `OrderItem` (`pos.py:948–992`).

### Minimum payload (only required fields)

```json
{
  "restaurant_id": "475",
  "order_id": "ORD-12345",
  "cust_mobile": "9876543210",
  "order_amount": 850.0
}
```

Defaults applied by the model when omitted:
`pos_id="mygenie"`, `payment_status="success"`, `order_type="pos"`, all numeric tax/discount/wallet fields = `0.0`.

> ⚠️ **Important catch:** the model default `pos_id="mygenie"` will **fail** the `_validate_order` gate if `users.pos_id` is `"0001"` (which is the value the MyGenie SSO login flow hardcodes for every MyGenie user — see `routers/auth.py:395`). For MyGenie POS the payload **must explicitly send `pos_id: "0001"`** to pass validation.

### Full recommended payload (matches POS_API.md §5.1)

```json
{
  "pos_id": "0001",
  "restaurant_id": "475",
  "restaurant_name": "LSD Fried Chicken",
  "order_id": "ORD-12345",
  "restaurant_order_id": "INV-09921",
  "cust_mobile": "9876543210",
  "cust_name": "Raj Kumar",
  "cust_email": "raj@example.com",
  "user_id": "pos-customer-id-or-mygenie-userid",
  "order_amount": 850.0,
  "order_sub_total_amount": 800.0,
  "order_discount": 0.0,
  "self_discount": 0.0,
  "coupon_code": null,
  "coupon_discount": 0.0,
  "wallet_used": 0.0,
  "tax_amount": 50.0,
  "gst_tax": 50.0,
  "vat_tax": 0.0,
  "service_tax": 0.0,
  "service_gst_tax_amount": 0.0,
  "tip_amount": 0.0,
  "tip_tax_amount": 0.0,
  "delivery_charge": 0.0,
  "round_up": 0.0,
  "payment_method": "upi",
  "payment_status": "success",
  "payment_type": "prepaid",
  "transaction_id": "TXN-XYZ",
  "order_status": "completed",
  "order_type": "dinein",
  "table_id": "T5",
  "waiter_id": "W3",
  "employee_id": "E12",
  "employee_name": "Anita",
  "print_kot": "Yes",
  "print_bill_status": "Yes",
  "paid_room": null,
  "room_id": null,
  "address_id": null,
  "order_created_at": "2026-05-21T06:30:00+00:00",
  "order_updated_at": "2026-05-21T06:35:00+00:00",
  "order_notes": "No plastic cutlery",
  "items": [
    {
      "item_name": "Dal Tadka",
      "pos_food_id": 1234,
      "item_category": "Main Course",
      "item_qty": 1,
      "item_price": 250.0,
      "variant": null,
      "variations": [],
      "add_on_ids": [],
      "add_on_qtys": [],
      "add_ons": [],
      "variation_amount": 0.0,
      "addon_amount": 0.0,
      "discount_amount": 0.0,
      "service_charge": 0.0,
      "gst_amount": 12.5,
      "vat_amount": 0.0,
      "station": "KITCHEN",
      "item_notes": "Make it spicy"
    }
  ]
}
```

### Docs vs Code mismatch on payload

`POS_API.md` §5.1 says `"Required: restaurant_id, order_id, cust_mobile, order_amount"`. Code agrees, BUT the doc example uses `"pos_id": "mygenie"` (string `"mygenie"`), whereas the **MyGenie SSO login flow stores `users.pos_id = "0001"` (hardcoded, `routers/auth.py:395`)**. Therefore the doc example would actually fail `_validate_order` for a MyGenie-logged-in user. POS team must send `"pos_id": "0001"`. (See §7 mismatch table.)

---

## 5. Authentication Contract

### How POS should authenticate (verified in code)

`core/auth.py:93–127` (`verify_pos_auth`):

```text
Priority 1 → header  X-API-Key: <users.api_key>
              ↳ looks up users by {api_key: <value>}; returns user dict
Priority 2 → header  Authorization: Bearer <JWT>
              ↳ decodes with JWT_SECRET; rejects customer-type tokens
              ↳ looks up users by {id: payload.user_id}
Neither → 401 "Authentication required. Provide X-API-Key header or Bearer token."
```

### `users.api_key` mapping

- Stored as `users.api_key` (string, format `dp_live_<urlsafe>`), generated by `generate_api_key()` (`core/auth.py:44–46`).
- Pushed to MyGenie POS via CR-001: `POST {MYGENIE_API_URL}/api/v1/auth/restaurant-crm-token` with `{ "restaurant_id": <users.restaurant_id>, "crm_token": <users.api_key> }` — see `routers/auth.py:48–128`.
- Verified in the live DB: **9 of 10** users have `api_key` set AND `crm_token_registered_with_pos: true`. CR-001 push is succeeding.

### Therefore — is the CR-001 token compatible with the order webhook?

**Yes.** `crm_token` in the CR-001 payload IS literally `users.api_key`. POS must send it back to CRM as:

```
X-API-Key: dp_live_***
```

If POS sends it under any other header name (`Authorization: Bearer dp_live_...`, `crm-token: dp_live_...`, `api-key: dp_live_...`), it will be **rejected with 401** because `verify_pos_auth` only matches the literal header `X-API-Key`.

> Note: `Authorization: Bearer <crm_token>` will NOT work — `verify_pos_auth` decodes Bearer tokens as JWTs (HS256, `JWT_SECRET`), and `dp_live_*` is not a JWT, so JWT decode will throw and return 401 "Invalid token".

---

## 6. Database Write Path

| Step | Function (file:line) | Action |
|---|---|---|
| 1. Validate | `_validate_order` (`pos.py:523–555`) | pos_id / restaurant_id / payment_status / duplicate gates |
| 2. Find or create customer | `_find_or_create_customer` (`pos.py:558–730`) | **Auto-creates** customer if `pos_customer_id` AND `phone` both miss. Lookup order: `pos_customer_id` → `phone`. First-visit bonus applied if `loyalty_settings.first_visit_bonus_enabled`. |
| 3. Compute points | `_calculate_points` (`pos.py:733–765`) | Tier-based earn % + off-peak bonus; gated by `min_order_value` |
| 4. Wallet validation | inline (`pos.py:1109–1118`) | Rejects if `wallet_used > customer.wallet_balance` |
| 5. Update customer aggregates | `db.customers.update_one` (`pos.py:1129–1140`) | `total_points`, `tier`, `wallet_balance`, `total_visits`, `total_spent`, `avg_order_value`, `last_visit` |
| 6. Insert order | `_save_order_and_transactions` (`pos.py:768–946`) | `orders.insert_one`, `order_items.insert_many`, `points_transactions.insert_one`, optional `wallet_transactions.insert_one` |
| 7. Async WhatsApp triggers | `asyncio.create_task` (`pos.py:1158–1190`) | `send_bill`, `first_visit`, `tier_upgrade` |

### Customer auto-creation contract

- **Lookup keys:** (1) `{user_id, pos_customer_id == order_data.user_id}`, (2) `{user_id, phone == order_data.cust_mobile}`.
- **If both miss:** new doc inserted in `customers` with `lead_source: "POS"`, `notes: "Auto-created via POS order"`, `pos_customer_id`, `pos_id`, `pos_restaurant_id` populated.
- **Therefore:** orders for unknown customers DO NOT fail. CRM ingests them and creates the customer in the same transaction.

### Order deduplication

- Compound key: `{pos_id, pos_restaurant_id, pos_order_id}` — checked at `pos.py:544–548`. Same `order_id` from same restaurant via same POS will return `success: false, message: "Duplicate order - already processed"` (HTTP 200, no write). This is silent from the POS's perspective unless it parses `success`.

### Live DB confirmation

```
orders        : 17,353 docs
order_items   :    179 docs (low — indicates many orders ingested without items[])
Latest order  : 2026-05-21T06:44:15Z  (mantri / restaurant_id=675)
By user_id (top 5):
  pos_0001_restaurant_475  → 16,472 orders, last 2026-05-14 13:40
  pos_0001_restaurant_364  →    658 orders, last 2026-05-19 19:03
  pos_0001_restaurant_558  →    108 orders, last 2026-05-20 11:20
  pos_0001_restaurant_391  →     86 orders, last 2026-05-16 11:54
  pos_0001_restaurant_478  →     21 orders, last 2026-05-20 14:42
Restaurants WITH crm_token_registered_with_pos=true but ZERO orders:
  pos_0001_restaurant_739 (Five star)
  pos_0001_restaurant_760 (Mygenie Yogish)
```

So order ingestion is **fully functional for some restaurants** and **completely silent for others** — pattern consistent with restaurant-level config/payload issues on POS, not a CRM endpoint bug.

---

## 7. Docs vs Code Mismatch

| Area | Docs Say | Code Does | Risk |
|---|---|---|---|
| `pos_id` value | `POS_API.md` §5.1 example: `"pos_id": "mygenie"`; default in `POSOrderWebhook` is `"mygenie"` (`pos.py:998`) | `_validate_order` (`pos.py:526`) **rejects** if `user.pos_id` is set and incoming `pos_id != user.pos_id`. MyGenie SSO hardcodes `users.pos_id = "0001"` (`routers/auth.py:395`). | **HIGH** — any MyGenie POS that sends `"pos_id": "mygenie"` (or omits it, taking default) gets rejected with `"Invalid pos_id. Expected: 0001, Received: mygenie"`. |
| `restaurant_id` type | `POS_API.md` examples show `"restaurant_id": "509"` (string) | CRM stores it as **string** (`routers/auth.py:392`: `restaurant_id = str(restaurant.get("id", ""))`). `_validate_order` does literal string `!=` comparison. | **MEDIUM** — if POS sends `restaurant_id` as **integer** (`509`), pydantic will coerce to `"509"` in most cases (since `restaurant_id: str` on the model), but if the JSON payload has unexpected leading zeros or whitespace it will mismatch. |
| Deprecated endpoint signposting | Docs flag `/pos/webhook/payment-received` as DEPRECATED (§5.2, Appendix B) but say it "may still be in active use by MyGenie POS" | The endpoint **still exists, still authenticates, still returns success, but does NOT write to `orders`** | **HIGH** — silent data loss from the order-listing perspective. A restaurant whose POS still calls this URL will appear to be "syncing" (200 OK) but no `orders` row ever appears in CRM. |
| Required fields | Docs: `restaurant_id, order_id, cust_mobile, order_amount` | Code agrees: same four are non-defaulted in `POSOrderWebhook` | No mismatch |
| Customer auto-create | Docs: "Auto-creates customer if `cust_mobile` not found" | Code matches; also auto-links by `pos_customer_id` first | No mismatch |
| Duplicate response | Docs: "Same `pos_id + restaurant_id + order_id` is rejected" | Code matches (`pos.py:544–554`), returns HTTP 200 with `success: false` | **LOW** — POS may not parse `success: false` and assume success; retries could appear as failures. |
| Response status code | Docs imply 200 OK / 4xx | Code returns **HTTP 200** for ALL business-logic failures (`Invalid pos_id`, `payment_status != success`, `Duplicate`) — only auth errors return 401 | **MEDIUM** — POS code that switches purely on HTTP status will treat a rejected order as a successful one. |

---

## 8. Likely Failure Reasons (ranked by evidence)

> Live DB shows the CRM endpoint is healthy and writing data. So "orders not appearing" is restaurant-scoped — these are the failure modes most consistent with that observation:

1. **POS sending wrong `pos_id`** (HIGH confidence, code evidence).
   - `POSOrderWebhook.pos_id` defaults to `"mygenie"`; CRM users created by MyGenie SSO have `users.pos_id = "0001"`.
   - If POS omits `pos_id` or sends `"mygenie"`, `_validate_order` returns `success: false, message: "Invalid pos_id. Expected: 0001, Received: mygenie"` — HTTP 200, no write.

2. **POS still using deprecated `/pos/webhook/payment-received`** (HIGH confidence, docs explicitly say "may still be in active use by MyGenie POS").
   - Endpoint succeeds, customer + points get updated, but `orders` collection is **never written**. From the order-listing perspective, the order is invisible.
   - Action: ask POS team which exact URL they POST to.

3. **`payment_status != "success"`** (MEDIUM confidence).
   - If MyGenie POS pushes orders at "queue"/"confirmed" stage rather than after payment, the order will be rejected: `"Order not processed - payment status: queue"`. Default in the model is `"success"`, so this only triggers when POS explicitly sends another value.

4. **POS not sending `X-API-Key` header** or sending under wrong header name (MEDIUM confidence).
   - CR-001 has pushed the token to POS successfully for 9 of 10 users, but that only confirms POS *received* the token. It does not confirm POS is *using it on every call*, nor that POS attaches it as `X-API-Key`.
   - `Authorization: Bearer dp_live_*` will fail (JWT decode error → 401).

5. **`restaurant_id` mismatch** (MEDIUM confidence).
   - CRM stores `users.restaurant_id` as **string** (`"475"`). `_validate_order` does `!=` on raw values. If POS sends `restaurant_id: 475` (integer), pydantic typically coerces to `"475"` and it works. But if POS sends a different `restaurant_id` (e.g., outlet-level vs. franchise-level), the order is rejected.
   - Evidence: 2 of 10 restaurants (`739`, `760`) have **zero** orders despite successful CR-001 registration.

6. **Duplicate `order_id` from POS retries** (LOW confidence, but easy to miss).
   - If POS retries a failed call (network blip) with the same `pos_id+restaurant_id+order_id`, the second call returns `success: false, message: "Duplicate order"`. Real first-time orders should not hit this.

7. **POS hitting a 404 path** (LOW confidence).
   - If POS configured a URL like `/api/v1/pos/orders` or `/pos/order` (missing `/api` prefix or singular), FastAPI returns 404 and nothing is written. Note `server.py:30` mounts router under `/api`.

8. **Validation error 422** (LOW confidence).
   - Missing `restaurant_id`/`order_id`/`cust_mobile`/`order_amount` returns FastAPI 422 with details. Logs would show this clearly.

9. **POS reading order_items endpoint mistakenly** — `order_items` has only 179 docs while `orders` has 17,353. So many ingested orders had **no `items[]` array**, meaning POS is sending order header without line items. This is functional (order is recorded) but means CRM cannot show line-item breakdown for those — could appear as "empty order" in the UI.

---

## 9. Test Payload Required From POS

### Minimum working test payload (will pass `_validate_order` for `pos_0001_restaurant_475`)

```json
{
  "pos_id": "0001",
  "restaurant_id": "475",
  "order_id": "TEST-CRM-PROBE-001",
  "cust_mobile": "9999900001",
  "cust_name": "CRM Probe",
  "order_amount": 199.0,
  "payment_status": "success",
  "order_type": "dinein",
  "items": [
    {
      "item_name": "Test Item",
      "item_qty": 1,
      "item_price": 199.0
    }
  ]
}
```

> Replace `restaurant_id` to match the affected restaurant. Replace `order_id` with a unique value every retry. `pos_id` MUST be `"0001"` for any MyGenie-SSO user (per `routers/auth.py:395`).

### Header

```
Content-Type: application/json
X-API-Key: dp_live_***   ← the same value pushed via CR-001 as crm_token
```

---

## 10. Runtime Test Plan

### Step 1 — Pick credentials

```bash
# In Mongo, for the affected restaurant — example: 475
db.users.findOne(
  { id: "pos_0001_restaurant_475" },
  { id:1, pos_id:1, restaurant_id:1, api_key:1, crm_token_registered_with_pos:1, _id:0 }
)
# Expect: { id:"pos_0001_restaurant_475", pos_id:"0001", restaurant_id:"475",
#          api_key:"dp_live_***", crm_token_registered_with_pos:true }
```

### Step 2 — Send curl (use the externally reachable CRM URL)

```bash
curl --location 'https://<CRM_BASE_URL>/api/pos/orders' \
  --header 'Content-Type: application/json' \
  --header 'X-API-Key: dp_live_***' \
  --data '{
    "pos_id": "0001",
    "restaurant_id": "475",
    "order_id": "PROBE-2026-05-21-001",
    "cust_mobile": "9999900001",
    "cust_name": "CRM Probe",
    "order_amount": 199.0,
    "payment_status": "success",
    "order_type": "dinein",
    "items": [
      { "item_name": "Probe Item", "item_qty": 1, "item_price": 199.0 }
    ]
  }'
```

Expected response:

```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "<uuid>",
    "pos_order_id": "PROBE-2026-05-21-001",
    "customer_id": "<uuid>",
    "is_new_customer": true,
    "order_amount": 199.0,
    "points_earned": 9,
    "total_points": 9,
    "tier": "Bronze"
  }
}
```

### Step 3 — Confirm DB write

```bash
db.orders.findOne({ pos_order_id: "PROBE-2026-05-21-001" }, { _id:0 })
db.order_items.find({ order_id: "<uuid from above>" }, { _id:0 })
db.customers.findOne({ phone: "9999900001", user_id: "pos_0001_restaurant_475" }, { _id:0 })
db.points_transactions.findOne({ order_id: "<uuid>" }, { _id:0 })
```

### Step 4 — Confirm CRM frontend display

- Log into CRM as `pos_0001_restaurant_475`.
- Navigate to **Customers** → search `9999900001` → record should appear.
- Open customer → **Order history** → "PROBE-2026-05-21-001" should show.

### Step 5 — Failure-mode probes

Send the same payload again to verify dedup:

```bash
# Expect: { success: false, message: "Duplicate order - already processed", data: { duplicate: true } }
```

Send with wrong `pos_id`:

```bash
# Body: "pos_id": "mygenie"
# Expect: { success: false, message: "Invalid pos_id. Expected: 0001, Received: mygenie" }
```

Send with `payment_status` other than `success`:

```bash
# Body: "payment_status": "queue"
# Expect: { success: false, message: "Order not processed - payment status: queue" }
```

Send with bad key:

```bash
# Header: X-API-Key: bogus
# Expect HTTP 401 { "detail": "Invalid API key" }
```

---

## 11. Questions for POS Team

1. **Exact URL POS calls for order sync** — is it `POST /api/pos/orders` (current), or still `POST /api/pos/webhook/payment-received` (deprecated, does not write to `orders`)?
2. **Auth header in use** — `X-API-Key: dp_live_***`? Or `Authorization: Bearer dp_live_***` (which will fail)? Any other custom header name like `crm-token`?
3. **Exact JSON being sent** for a representative order — please share the full request body for one failing case from logs. We need to see `pos_id`, `restaurant_id` (and its type), `payment_status`, and `order_id`.
4. **Response received** by POS — HTTP status code and full response body. CRM returns business-logic failures as **HTTP 200 with `success: false`**, so a "200" alone does not mean the order was saved.
5. **Order lifecycle** — does POS push only on payment success, or also for `queue` / `confirmed` / `cancelled` states? CRM only accepts `payment_status: "success"`.
6. **Customer identifiers sent** — does POS include `user_id` (POS-side customer ID), only `cust_mobile`, or both? CR uses `user_id` to set `pos_customer_id` for stronger linkage.
7. **`restaurant_id` data type** — string `"475"` or integer `475`? CRM stores and compares as string; integer is auto-coerced by pydantic but type changes downstream (e.g., from outlet ID vs. franchise ID) will cause silent rejection.
8. **Retry policy** — on a 5xx/timeout, does POS retry with the SAME `order_id`? If yes, second call returns `Duplicate order` — make sure POS treats that as success.

---

## 12. Final Verdict

```
order_webhook_ready_payload_or_auth_issue
```

Rationale:
- The CRM POS order webhook (`POST /api/pos/orders`) is implemented, authenticated, documented, and demonstrably writing rows to the `orders` collection (17,353 docs; latest 2026-05-21 06:44 UTC, minutes before this report was written).
- CR-001 token push to MyGenie is succeeding (9 of 10 users show `crm_token_registered_with_pos: true`).
- Two restaurants with successful CR-001 registration (`739`, `760`) have zero orders, and one high-volume restaurant (`475`) stopped receiving orders 6 days ago. This is the symptom-pattern of a **POS-side payload, endpoint-path, or header issue**, not a CRM endpoint bug.
- Confirmation requires POS to share (a) the exact URL/header it uses, and (b) one full failing request/response trace, so we can map it to one of the failure modes in §8 and either fix the POS payload or, if necessary, raise a downstream CR on the CRM side (e.g., loosen `pos_id` default, accept integer `restaurant_id`, return non-200 for business rejections so POS auto-retries are easier to detect).
