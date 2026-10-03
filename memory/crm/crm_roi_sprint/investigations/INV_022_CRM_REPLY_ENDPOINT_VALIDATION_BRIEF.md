# INV-022 — CRM reply to Customer App brief `CRM_BRIEF_ENDPOINT_VALIDATION.md` (ref INV-2026-09-15-003)

**Role:** INVESTIGATION (read-only). **Code changed:** none. **Verified against:** `backend/routers/scan.py`, `backend/routers/auth.py`, `backend/core/auth.py`, `backend/core/helpers.py`, live preprod Mongo (`mygenie`).
**Inbound artifact:** `/app/memory/crm/inbox/CRM_BRIEF_ENDPOINT_VALIDATION.md`
**Status:** DRAFT — owner POV review pending before sending.

---

## 0. Identity model — confirmed with one correction

| Their statement | CRM answer |
|---|---|
| Before login: `phone` 10-digit + `restaurant_id` short `"689"` | **OK.** Public auth routes accept short or full id; short is normalised to `pos_0001_restaurant_689`. Phone is matched **as an exact string** — send exactly 10 digits, no `+91`, no spaces (CR-085 is still open; CRM does not normalise today). |
| After login: customer JWT with `customer_id, restaurant_id, phone` | **OK, but:** `restaurant_id` claim is the **full** form `pos_0001_restaurant_689`, plus `type:"customer"`. 24 h, no refresh. |
| "If the token carries `restaurant_id` we will not pass it again" | **OK — confirmed.** Authenticated routes ignore any `restaurant_id` you send; tenant always comes from the JWT. |

## A. Logged-in customer

| # | CRM confirm |
|---|---|
| A1 | **OK.** `/scan/auth/me` → full customer doc minus `password_hash` (`name, phone, tier, total_points, wallet_balance, …`). `/scan/loyalty` → `total_points, tier, next_tier, points_to_next_tier, wallet_balance, points_monetary_value, earn_rate_percent, redemption_value_per_point, total_visits, total_spent`. |
| A2 | **OK, but:** no `skip` — `limit` only (default 20, cap 50). `total` = full count. Field names are the raw order doc: `id, pos_order_id, restaurant_order_id, order_amount, order_status, created_at, order_created_at, …` — not `{order_id, date, total, status}`. Map on your side or wait for CR-088 (`skip`). |
| A3 | **OK.** Returns full order doc incl. `items[]` (`item_name, item_qty, item_price, variant, add_ons, item_category`). Only the token-holder's own orders. |
| A4 | **OK, but:** fields are `points, transaction_type (earn/redeem/bonus/expired), description, created_at`. **No `order_id`** on the ledger row (order ref is inside `description` text only). `total` = rows returned, not ledger size. |
| A5 | **OK, but:** fields are `amount, transaction_type, description, created_at`. **No `balance_after`.** Current balance is in `/scan/loyalty.wallet_balance`. |
| A6 | **OK, but:** rich coupon doc, not a 4-field summary. Use `code, title, description, discount_type, discount_value, max_discount, min_order_value, start_date, end_date, valid_days, per_user_limit, my_usage_count`. There is **no `expires_at`** — use `end_date`. |
| A7 | **OK.** Accepts `name, email, dob, anniversary, gender, preferred_language, allergies[], favorites[], diet_preference, spice_level, cuisine_preference`. Phone cannot be changed. |
| A8 | **OK — unchanged.** |
| A9 | **OK, but:** **token required.** Body = `{rating:int 1–5, message?:string, order_id?:string}`. **`name` and `email` are NOT accepted** — they are taken from the token's customer record. Anonymous feedback is not possible today; if you need it, that is a new CR. |
| A10 | **OK, but:** body field is **`table_id`** (string), not `table_no`; optional `message`. Token required. Writes to `pos_event_logs` (see E3). |

## B. Before login (phone + restaurant_id only)

| # | CRM confirm |
|---|---|
| B1 | **MISSING.** No "lookup by phone" endpoint. `skip-otp` works as a stand-in **but it creates a customer as a side-effect** for every phone typed, with no verification → junk customers + CR-089 risk. **CRM recommendation: do not use skip-otp for greeting.** Propose new `POST /scan/auth/lookup` → `{exists, name?}` (no create, no token, rate-limited) as a new CR. |
| B2 | **MISSING** — and CRM position is **points/tier/wallet require login**. Showing a stranger's balance from a typed phone number is a privacy leak. Move OTP (or whichever login you keep) before checkout. Name-only prefill can come from the B1 lookup endpoint. |
| B3 | **MISSING on `/scan/config`, but data exists.** All requested fields are in `loyalty_settings` (`bronze/silver/gold/platinum_earn_percent`, `redemption_value` + per-tier `*_redemption_value`, `min_order_value`, `first_visit_bonus_enabled/points`, `tier_*_min`, `loyalty_enabled`, `wallet_enabled`, `coupon_enabled`). CRM recommendation: **do not fold into `/scan/config/{rid}`** (that collection is yours per O1). Propose new public `GET /scan/loyalty-rules/{restaurant_id}` returning a whitelisted subset. New CR. |

## C. Restaurant admin login

| # | CRM confirm |
|---|---|
| C1 | **MISSING as `/scan/admin/login` — and CRM is not the identity provider.** CRM's own admin login (`POST /api/auth/login`) proxies **MyGenie POS** (`MYGENIE_LOGIN_ENDPOINT` + profile), then caches the user in `users`. The CRM `users` row is a **cache**, not the source of truth. Two options: **(C1-a, recommended)** Customer App authenticates against MyGenie POS directly, exactly as CRM does — no CRM dependency, no shared secret. **(C1-b)** Customer App calls existing `POST /api/auth/login` → `{access_token, user:{id, pos_id, restaurant_name, email, phone}}`; `restaurant_id` = `id` minus `pos_0001_restaurant_` prefix. Caveats of C1-b: it has side-effects (re-hashes password, re-registers CRM token with POS, may create loyalty settings), returns a **staff** JWT scoped to CRM, and the matching `GET /api/auth/me` leaks `meta_access_token`. We would need to add a side-effect-free, trimmed variant → new CR. |
| C2 | **Depends on C1.** If C1-a: not needed. If C1-b: `GET /api/auth/me` validates the staff token today (but over-shares, see above). CRM will **not** share its JWT secret (see E1 / JWT-overlap issue). |

## D. Write-locks

| # | CRM confirm |
|---|---|
| D1 | **O1 still pending with CRM owner.** CRM's `PUT /scan/config/{rid}` writes **61 keys** (full list = `AppConfigUpdate` in `scan.py:102-170`: colours, fonts, logo, banners, ~45 `show*` flags, about/contact/social, nav/footer, custom pages). CRM owner has indicated Option A (disable the PUT) — awaiting explicit go-ahead to implement. |
| D2 | **Acknowledged.** `PUT /scan/menu/dietary-tags/{rid}` will be disabled (GET kept) — same CR as D1. Note: collection `dietary_tags_mapping` does **not exist** in preprod today (0 writes so far). |

## E. Housekeeping

| # | CRM confirm |
|---|---|
| E1 | **Already removed in repo** — `core/auth.py:11` is `JWT_SECRET = os.environ['JWT_SECRET']`, no fallback; boot fails if unset. Whether **live** runs this build is the open GAP-11 provenance question. |
| E2 | **No.** `PUT /scan/config` stores whatever form was passed in the URL (`scan.py:761`). GET does a 3-way lookup so reads work either way. Becomes moot if D1 disables the PUT. All 13 existing config docs use **short** ids. |
| E3 | Preprod: `pos_event_logs` **MISSING** (created on first call-waiter/request-bill) · `otp_tokens` **MISSING** (CRM uses `customer_otps`, 5 docs) · `segment_whatsapp_config` **MISSING** · `message_logs` **MISSING**. Prod not probed (read-only rule). |
| E4 | All four are **CRM-owned**: `import_logs` (CSV import), `webhook_logs` (POS webhooks), `coupon_distributions`, `customer_documents` (CR-072/075 hotel docs). Customer App should not read/write them. |
| E5 | Yes — pending owner approval of the ownership map (not yet in CRM memory; `CRM_BRIEF_OWNERSHIP_BOARD.md` not received). |

---

## Proposed new CRs arising from this brief (NOT registered — owner decision)

| Proposed | Scope | Est. |
|---|---|---|
| CR-093 | `POST /scan/auth/lookup` — phone+rid → `{exists, name}`; no create, no token, rate-limited | ~1 h |
| CR-094 | `GET /scan/loyalty-rules/{rid}` — public whitelisted loyalty settings for "you will earn N" | ~1 h |
| CR-095 | Admin auth for Customer App — decide C1-a (POS direct) vs C1-b (trimmed CRM endpoint) | decision first |
| (existing) CR-088 | add `skip`, consistent `total` | registered |
| (existing) Issue 2 | disable `PUT /scan/config` + `PUT /scan/menu/dietary-tags` (D1/D2) | ~15 min |
