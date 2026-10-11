# CRM Reply — Endpoint Validation Brief
## From: MyGenie CRM · Re: INV-2026-09-15-003 (`CRM_BRIEF_ENDPOINT_VALIDATION.md`) · CRM ref: INV-022 · Date: 2026-09-28

**Status:** APPROVED CONTENT — awaiting CRM owner "send". Code for the new/removed endpoints is **not yet built**; see §5 for sequencing.

**Ground rules both sides now agree on**
1. Customer App never reads/writes CRM collections. **CRM never reads/writes Customer App collections.** Data crosses only via API.
2. Contract of record for `/scan/*` remains `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` (v2.0.1). This reply amends it; a v2.1 will be issued once CR-093/094/095 land.
3. Where this doc and code disagree, code wins — tell us and we fix the doc.

---

## 0. Identity — confirmed

| Your statement | CRM answer |
|---|---|
| Pre-login: `phone` 10-digit + `restaurant_id` `"689"` | **OK.** Phone is matched as an **exact string** — send exactly 10 digits, no `+91`, no spaces, no dashes. Short rid is normalised to `pos_0001_restaurant_689` on all public auth routes. |
| Post-login: customer JWT claims `customer_id, restaurant_id, phone` | **OK, but:** `restaurant_id` claim is the **full** form `pos_0001_restaurant_689`; also `type:"customer"`. 24 h, no refresh. |
| "We will not pass `restaurant_id` again once we have the token" | **Confirmed.** Authenticated routes ignore it; tenant always comes from the JWT. |

## A. Logged-in customer (Bearer customer token)

| # | Feature | Endpoint | CRM confirm |
|---|---|---|---|
| A1 | Profile header | `GET /scan/auth/me` + `GET /scan/loyalty` | **OK.** `me` → full customer doc (minus `password_hash`): `name, phone, email, tier, total_points, wallet_balance, …`. `loyalty` → `total_points, tier, next_tier, points_to_next_tier, wallet_balance, points_monetary_value, earn_rate_percent, redemption_value_per_point, total_visits, total_spent`. |
| A2 | Orders tab | `GET /scan/orders?limit=` | **OK, but:** **no `skip`** (limit only; default 20, cap 50 — CR-088 will add `skip`). Rows are raw order docs: `id, pos_order_id, restaurant_order_id, order_amount, order_sub_total, order_status, order_type, created_at, order_created_at, points_earned, coupon_code, …` — map to your `{order_id,date,total,status}` yourself. `total` = full count. |
| A3 | Order detail | `GET /scan/orders/{order_id}` | **OK.** Full order doc incl. `items[]` = `item_name, item_qty, item_price, variant, add_ons, item_category`. Only the token-holder's own orders. |
| A4 | Points tab | `GET /scan/points/history?limit=` | **OK, but:** row = `points (always positive), transaction_type (earn\|redeem\|bonus\|expired), description, created_at`. **No `order_id`** on the row (order ref appears inside `description`). `total` = rows returned. |
| A5 | Wallet tab | `GET /scan/wallet/history?limit=` | **OK, but:** row = `amount, transaction_type, description, created_at`. **No `balance_after`** — current balance is `/scan/loyalty.wallet_balance`. |
| A6 | Coupons | `GET /scan/coupons` | **OK, but:** returns the full coupon doc, not a 4-field summary. Use `code, title, description, discount_type, discount_value, max_discount, min_order_value, start_date, end_date, valid_days, per_user_limit, my_usage_count`. **No `expires_at`** → use `end_date`. |
| A7 | Edit profile | `PUT /scan/profile` | **OK.** Accepts `name, email, dob, anniversary, gender, preferred_language, allergies[], favorites[], diet_preference, spice_level, cuisine_preference`. Phone cannot be changed. |
| A8 | Addresses | `GET/POST /scan/addresses`, `PUT/DELETE /scan/addresses/{id}`, `PUT …/default` | **OK — unchanged.** |
| A9 | Feedback | `POST /scan/feedback` | **OK, but: token required.** Body = `{ "rating": 1-5, "message"?: string, "order_id"?: string }`. **`name` and `email` are not accepted** — taken from the token's customer. Anonymous feedback does not exist; if you need it, raise it and we will intake a CR. |
| A10 | Call waiter / request bill | `POST /scan/call-waiter`, `POST /scan/request-bill` | **OK, but:** body = `{ "table_id": string, "message"?: string }` — field is **`table_id`**, not `table_no`. Token required. Writes an event to `pos_event_logs` — see Q-CA-2. |

## B. Before login — all MISSING today → **CRM will build**

| # | Feature | CRM answer | What CRM will build |
|---|---|---|---|
| B1 | Greet by name | **MISSING.** Do **not** use `skip-otp` for this — it creates a customer for every phone typed, unverified. | **`POST /scan/auth/lookup`** · body `{phone, restaurant_id}` · returns `{exists: bool, name: string\|null}` · creates nothing, returns no token · rate-limited per IP+phone. (CR-093) |
| B2 | Checkout pre-fill with points/tier | **MISSING — and will stay login-gated.** Points, tier and wallet are personal data; CRM will not return them for an unauthenticated phone. | Name prefill via B1. For points/tier/wallet, obtain a customer token first (move your OTP/login step before checkout, as you offered). Then use A1. |
| B3 | "You will earn N points" | **MISSING on `/scan/config` — and we will not add it there** (that collection is yours). Data lives in CRM `loyalty_settings`. | **`GET /scan/loyalty-rules/{restaurant_id}`** · public, no auth · returns `loyalty_enabled, wallet_enabled, coupon_enabled, bronze/silver/gold/platinum_earn_percent, tier_silver_min, tier_gold_min, tier_platinum_min, redemption_value, min_redemption_points, min_order_value, first_visit_bonus_enabled, first_visit_bonus_points, off_peak_bonus_enabled, off_peak_start_time, off_peak_end_time`. (CR-094) |

**→ Please validate the impact of B1/B2/B3 on your landing page and checkout flow and reply (Q-CA-4).** In particular confirm you can move login before checkout.

## C. Restaurant admin login — **CRM is not the identity provider**

| # | CRM answer |
|---|---|
| C1 | **No `/scan/admin/login`, and we recommend you do not want one.** CRM's own admin login is a pass-through to **MyGenie POS** (`login` → `profile`); the CRM `users` row is only a cache of that result. **Authenticate your admin panel against MyGenie POS directly, exactly as CRM does.** From the POS profile you get `restaurants[0].id` (= short `restaurant_id`), restaurant `name`, `phone`, `emp_email`. `pos_id` is a constant `"0001"` (CRM hardcodes the same). |
| C2 | **Not needed** under C1 — you mint and verify your own admin token. CRM will **not** share its JWT secret. |

**Impact for you to validate (Q-CA-3):**
- Your admin login depends on POS uptime, not CRM (same as CRM today).
- You need the same POS `MYGENIE_API_URL`, login and profile endpoints CRM uses — obtain from the POS team.
- **Do not call** POS's "register CRM token" endpoint — that is CRM-only.
- Stop reading CRM `users` immediately once this is wired; the earlier "frozen `users` fields" read-contract is **retired**.
- Open POS question (we are asking too): can one admin have more than one restaurant in `restaurants[]`? CRM currently takes `[0]`.

## D. Write-locks — **both agreed**

| # | Collection | CRM answer |
|---|---|---|
| D1 | `customer_app_config` | **Customer App owns it (O1 = Customer App).** CRM will remove **both** `PUT /scan/config/{rid}` **and** `GET /scan/config/{rid}` (symmetric rule). Keys CRM's PUT could write (61): colours/fonts/logo/tagline/welcome, `banners[]`, ~45 `show*` flags, about/contact/social, nav/footer, `customPages[]`, `extraInfoItems[]`, opening/closing time. Nothing in CRM UI ever used it. **Sequencing:** you confirm you read `customer_app_config` directly (Q-CA-1) → CRM removes the routes. (CR-095) |
| D2 | `dietary_tags_mapping` | **Agreed — Customer App owns.** CRM removes `PUT` **and** `GET /scan/menu/dietary-tags/{rid}`. CRM has never written this collection. Same CR-095, same cutover gate. |

## E. Housekeeping

| # | Question | CRM answer |
|---|---|---|
| E1 | JWT fallback `dinepoints-secret-key-2024` removed? | **Removed in the current codebase** — `JWT_SECRET` is read strictly from env; boot fails if missing. Whether the live host runs this exact build is being verified separately (CRM GAP-11). |
| E2 | Does `PUT /scan/config` normalise rid? | **No** — it stores the URL form as-is. Irrelevant after D1. All 13 existing config docs already use short ids. |
| E3 | Do `pos_event_logs`, `otp_tokens`, `segment_whatsapp_config`, `message_logs` exist in prod? | Preprod: **none of the four exist.** `pos_event_logs` is created on first call-waiter/request-bill. CRM OTPs are in `customer_otps` (not `otp_tokens`). Prod not probed. |
| E4 | Who owns `import_logs`, `webhook_logs`, `coupon_distributions`, `customer_documents`? | **All CRM-owned.** Do not read or write. |
| E5 | Will you fill `CRM_BRIEF_OWNERSHIP_BOARD.md`? | **Yes** — we have not received the file. Please send (Q-CA-5). |

---

## 5. Sequencing (what happens in which order)

1. You reply to Q-CA-1…5 below.
2. CRM registers CR-093 / CR-094 / CR-095 and plans them (CRM owner gate).
3. CRM builds **B1 lookup + B3 loyalty-rules** first (additive, no breaking change) → you wire B1/B3 and move login before checkout.
4. You cut over to reading `customer_app_config` / `dietary_tags_mapping` directly and switch admin login to POS → confirm.
5. CRM removes the 4 config/dietary routes (CR-095) and stops being read for `users`.
6. CRM issues `/scan/*` contract v2.1 + refreshed OpenAPI.

## 6. Questions back to you

| # | Question |
|---|---|
| Q-CA-1 | Date by which you read `customer_app_config` and `dietary_tags_mapping` directly (gates CR-095 route removal). |
| Q-CA-2 | Who consumes `pos_event_logs` (call-waiter / request-bill events)? CRM writes them, nothing in CRM reads them. Is this yours, POS's, or dead? |
| Q-CA-3 | Validate the C1 Option-(a) impact above on your admin panel; confirm you will not call CRM-token registration. |
| Q-CA-4 | Validate B1/B2/B3 impact on landing + checkout; confirm login can move before checkout. |
| Q-CA-5 | Send `CRM_BRIEF_OWNERSHIP_BOARD.md`. |

**Attachments (unchanged, still current):** `INV_017_CRM_CONTRACT_REPLY_TO_CUSTOMER_APP.md` · `INV_017_CUSTOMER_SCAN_API_CONTRACT_v2.md` (v2.0.1) · `INV_017_openapi_scan_v2.json` · `INV_018_ORDER_LINKAGE_GAPS.md` §6.
