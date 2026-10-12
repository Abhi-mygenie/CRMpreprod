# CRM → Scan & Order (Customer App) — CR-119 / CR-120 / CR-121 / CR-122 / CR-123 live on preprod, please validate
**Date:** 2026-10-12
**Owner sends; agents never send.**
**Base URL (preprod preview):** `https://mygenie-crm-preprod.preview.emergentagent.com`
All routes under `/api`. Test restaurant: **r689** (Kunafa Mahal, preprod). Test coupons already seeded (see §6).

This closes out both of your briefs (INV-023 name/phone; INV-024 anonymous coupons) **and** the three coupon-list UX issues from `OUTBOUND_TO_CRM_COUPON_LIST_UX_THREE_ISSUES_2026-10-12.md`.

---

## §0 — TL;DR (what changed for you)

| CR | Endpoint | Change | What you do |
|---|---|---|---|
| **CR-119** | `POST /scan/auth/skip-otp` | Accepts optional `name`; response now echoes `name` | Send `name` at Browse Menu; drop the `PUT /scan/profile` second call for new diners |
| **CR-120** | `POST /scan/coupons/validate` | Token now **optional**; pass `restaurant_id` in body when anonymous | Let diner Apply a code before phone entry |
| **CR-121** | `GET /scan/coupons` | Token now **optional**; pass `?restaurant_id=` when anonymous; anonymous list = generic coupons only | Show coupon list on checkout before login |
| **CR-122** | `GET /scan/coupons` | New `?order_total=` param → engine path: min-order filtering, `requires_cart_validation` always set, `time_window`, `expected_discount`, **`recommended_code`** | Always pass `order_total`; auto-apply `recommended_code`; show "Tap to see discount" for cart-validated coupons |
| **CR-123** | `POST /scan/max-redeemable` + points awarded on every order | Loyalty earn base corrected: points = tier % of **pre-tax food value minus coupon minus points redeemed**. Preview endpoint gets optional `points_to_redeem` + `coupon_discount` and returns `earn_base_preview` | `bill_amount` must be the **pre-tax, pre-discount cart sub-total**; send the two new fields so the preview equals what gets credited; after the order, show `points_earned` from CRM — never compute locally |

Nothing was removed. Every existing call you make today still works unchanged.

---

## §1 — CR-119: `skip-otp` accepts `name`

```http
POST /api/scan/auth/skip-otp
{ "restaurant_id": "689", "phone": "9876543210", "country_code": "91", "name": "Priya" }
```

Response (new key `name`):
```json
{ "success": true, "message": "Login successful",
  "data": { "token": "...", "customer_id": "...", "is_new_customer": true, "phone": "9876543210", "name": "Priya" } }
```

Rules:
- `name` optional. Whitespace-only is treated as empty.
- **New customer** → stored at creation.
- **Existing customer** → `name` in body is **ignored**; response returns the name already on file. Use `PUT /scan/profile {name}` if the diner edits it.
- Per owner ruling: call `skip-otp` at **Browse Menu** (phone capture), not at Place Order.

---

## §2 — CR-120: `POST /scan/coupons/validate` — token optional

```http
POST /api/scan/coupons/validate
# anonymous — no Authorization header
{ "code": "STO-GENERIC-10", "order_total": 450, "channel": "dine_in", "restaurant_id": "689" }

# authenticated — restaurant_id ignored, taken from token
Authorization: Bearer <customer_token>
{ "code": "STO-GENERIC-10", "order_total": 450, "channel": "dine_in" }
```

Success shape unchanged from CR-105 (`valid`, `computed_discount`, `final_amount_preview`, `min_order_value`, `stackable_with_loyalty`, `coupon_type`).

Error codes you must handle:
| `data.error.code` | Meaning | UX |
|---|---|---|
| `CUSTOMER_REQUIRED` | Standard coupon (`requires_customer=true`) tried anonymously | Prompt "Enter your phone to use this coupon" → skip-otp → re-validate with token |
| `MIN_ORDER_NOT_MET` | cart < `min_order_value` | Show min order |
| `CHANNEL_NOT_VALID` | coupon not for this channel | Hide / explain |
| `NOT_FOUND` / `EXPIRED` / `PER_USER_LIMIT` | as named | Show message |
| HTTP **422** | anonymous call without `restaurant_id` | Client bug — always send it |
| HTTP **429** + `Retry-After` | per-IP rate limit | Back off |

Still **validate-only**. Usage is recorded by POS at order placement (`coupon_code` in your POS order payload). Do not show "applied" until the order is placed.

---

## §3 — CR-121: `GET /scan/coupons` — token optional

```http
GET /api/scan/coupons?restaurant_id=689&channel=dine_in            # anonymous
GET /api/scan/coupons?channel=dine_in  + Authorization: Bearer ...   # authenticated
```

- **Anonymous:** only `requires_customer=false` (generic) coupons are returned. Standard coupons are hidden entirely (owner ruling Q4). No `my_usage_count`.
- **Authenticated:** behaviour unchanged (per-user limit, specific_users, `my_usage_count`).
- 422 if anonymous and `restaurant_id` missing. 429 + `Retry-After` on anonymous rate limit.

---

## §4 — CR-122: `GET /scan/coupons?order_total=` — the fix for your 3 issues

**Always pass `order_total` (cart subtotal before discount).** This switches the route to the same engine POS uses.

```http
GET /api/scan/coupons?restaurant_id=689&order_total=960&channel=dine_in
```

Live result on preprod right now (r689, ₹960):
```json
{ "success": true, "message": "6 coupons available",
  "data": {
    "coupons": [ ...6 items... ],
    "recommended_code": "GYAN",
    "recommended_discount": 96.0
  } }
```

### Issue 1 — non-applicable coupons shown → FIXED
Coupons whose `min_order_value > order_total` are **excluded**. Per-user-limit-exhausted and wrong-channel coupons are excluded.
Time-window coupons (happy-hour etc.) are **still returned** but flagged — read `time_window.within_window_now`:
```json
"time_window": { "configured": true, "within_window_now": false, "valid_days": [...], "start_time": "18:00", "end_time": "21:00", "tz": "Asia/Kolkata", "next_window_start": "..." }
```
Show these greyed-out with "Valid 6–9 PM", or hide — your call.

### Issue 2 — BXGY shows "₹0 off" → FIXED
`requires_cart_validation` is now **always** `true`/`false` (never null).
- `false` → `expected_discount` and `final_amount_preview` are real numbers. Show "₹96 off".
- `true` (BOGO / buy-X-get-Y / nth-item / item- or category-scoped) → `expected_discount: null`. Show **"Tap to see discount"**. On tap, call `POST /scan/coupons/validate` **with `items[]`**:
```json
"items": [
  { "food_id": "202959", "item_id": "202959", "name": "Golden Caramel", "quantity": 3, "unit_price": 120.0 }
]
```
Minimum per item: `food_id` (or `item_id`) + `quantity` + `unit_price`. Extra display fields on these coupons: `offer_type` (`simple|bxg|bogo|nth_item`), `buy_quantity`, `get_quantity`, `nth_item_number`, `eligible_match_hint`, `display_title`, `pos_instruction`.

### Issue 3 — no recommendation → FIXED
`recommended_code` / `recommended_discount` = the applicable **simple** coupon with the highest `expected_discount` that is **inside its time window now**. Cart-validated coupons are never recommended (discount unknown without cart). `null` when nothing qualifies or when `order_total` is omitted. Safe to auto-apply, then confirm via `/validate`.

### Per-coupon fields in engine path
`id, code, title, display_title, coupon_type, discount_scope, discount_type, discount_value, min_order_value, max_discount, expected_discount, final_amount_preview, requires_cart_validation, eligible_match_hint, stackable_with_loyalty, valid_from, valid_until, offer_type, time_window{}, buy_quantity, get_quantity, get_discount_type, get_discount_value, max_applications, allow_repeat, same_item_required, pos_instruction, nth_item_number, nth_discount_type, nth_discount_value` + `my_usage_count` (authenticated only).

Note field renames vs. legacy path: `start_date/end_date` → `valid_from/valid_until`; `description` folded into `title`.

### Without `order_total` — unchanged
Legacy response (CR-121 shape), no `recommended_code`, `requires_cart_validation` may be null. Kept only for backward compat — please migrate.

---

## §4b — CR-123: loyalty points — what the diner actually earns, and how to preview it

### The rule (now consistent across POS and CRM)
```
earn base = cart sub-total (pre-tax, pre-discount)
          − coupon / bill discount
          − ₹ value of loyalty points redeemed on this order
points    = tier % × earn base          (min-order gate applies to this net base)
```
Diners do **not** earn on GST/service charge, and do **not** earn on the part of the bill they paid with a coupon or with their own points.

Worked example (real order shape): sub-total ₹290, coupon ₹43.50, GST ₹12.33, Bronze 5 % → base ₹246.50 → **12 points**. (Showing "5 % of ₹290 = 14" or "5 % of the ₹258.83 total = 12.9" would both be wrong.)

### `POST /scan/max-redeemable` — contract clarification + 2 optional fields
```http
POST /api/scan/max-redeemable
Authorization: Bearer <customer_token>

{ "bill_amount": 290.0,          // REQUIRED — pre-tax, pre-discount cart sub-total (NOT the total incl. GST)
  "coupon_discount": 43.5,       // optional — computed_discount from /scan/coupons/validate, if a coupon is applied
  "points_to_redeem": 100 }      // optional — points the diner has chosen to redeem (we clamp to max_points_redeemable)
```
Response — all existing keys unchanged, **two added**:
```json
{ "ok": true, "max_points_redeemable": 110, "ratio_per_point": 1.0, "available_points": 159,
  "projected_points_earned": 7,
  "earn_base_preview": 146.5,          // NEW — the ₹ the % was applied to (290 − 43.5 − 100)
  "points_to_redeem_applied": 100 }    // NEW — what we actually deducted after clamping
```
- Omit both optional fields → response identical to today (preview = earn with no coupon, no redemption).
- `points_to_redeem` above `max_points_redeemable` (or when `ok:false`) → clamped; read `points_to_redeem_applied` to show the diner what will really apply.
- Call it again whenever the cart, coupon, or redemption slider changes — it's read-only and cheap.

### What to show on screen
- Checkout: "You'll earn **N** points" ← `projected_points_earned` from this call, with the current coupon + redemption passed in.
- After order placed: show **`points_earned` from CRM** (POS gets it in the order response and should surface it). Do not recompute from `loyalty-rules` earn %.
- If you display the earn %, phrase it as "5 % on food value after discounts", not "5 % on your bill".

---

## §5 — Recommended checkout flow (end to end)

1. Browse Menu → phone (+ name) → `POST /scan/auth/skip-otp` (CR-119) → store token.
2. Checkout → `GET /scan/coupons?order_total=<cart>&channel=<ch>` (token if you have one, else `restaurant_id`) (CR-121/122).
3. If `recommended_code` → auto-apply → `POST /scan/coupons/validate` to confirm `computed_discount`.
4. Diner taps a `requires_cart_validation: true` coupon → `/validate` with `items[]`.
5. Diner types a code anonymously → `/validate` with `restaurant_id` (CR-120). On `CUSTOMER_REQUIRED` → phone prompt → skip-otp → re-validate with token. Phone re-auth failure at Place Order = **silent + logged, no toast** (owner ruling D2).
6. Place Order → send `coupon_code` to POS. POS records usage.

---

## §6 — Test coupons on preprod r689

| Code | Type | Scenario |
|---|---|---|
| `STO-GENERIC-10` | generic, 10% | Anonymous happy path; recommended at low totals |
| `STO-GENERIC-MIN` | generic, min ₹300 | `MIN_ORDER_NOT_MET` below 300; excluded from list at `order_total<300` |
| `STO-DELIVERY` | generic, delivery-only | `CHANNEL_NOT_VALID` on dine_in |
| `STO-STANDARD` | requires_customer | Hidden from anonymous list; `CUSTOMER_REQUIRED` on anonymous validate |
| `STO-ONCE` | per_user_limit 1 | `PER_USER_LIMIT` after one POS use |
| `SEED_V3A_*` | time-window | `within_window_now: false` outside hours |
| `GYAN` | simple 10%, min ₹10 | Currently the `recommended_code` at ₹960 |

### Validation checklist — please confirm each
- [ ] V1 skip-otp with `name` → `is_new_customer: true`, `name` echoed; repeat call → existing name returned, not overwritten
- [ ] V2 anonymous `/validate` `STO-GENERIC-10` @450 → `computed_discount: 45`
- [ ] V3 anonymous `/validate` `STO-STANDARD` → `CUSTOMER_REQUIRED`; with token → valid
- [ ] V4 anonymous `GET /scan/coupons?restaurant_id=689` → no `STO-STANDARD` in list
- [ ] V5 `?order_total=96` → `STO-GENERIC-MIN` absent; `?order_total=960` → present
- [ ] V6 `?order_total=960` → `recommended_code` non-null; every coupon has boolean `requires_cart_validation`
- [ ] V7 BXGY coupon → `expected_discount: null`, `requires_cart_validation: true`; `/validate` with `items[]` returns a number
- [ ] V8 omit `restaurant_id` anonymously → 422
- [ ] V9 `POST /scan/max-redeemable {bill_amount: 290, coupon_discount: 43.5}` → `projected_points_earned 12`, `earn_base_preview 246.5`, `points_to_redeem_applied 0`
- [ ] V10 same call without the new fields → same keys as before + the 2 new ones, `projected_points_earned` unchanged from today
- [ ] V11 `points_to_redeem: 9999` → `points_to_redeem_applied == max_points_redeemable`

---

## §7 — Status

| CR | CRM QA | Owner smoke | Prod |
|---|---|---|---|
| CR-119 / 120 / 121 | PASS (`qa/CR_119_CR_120_CR_121_QA_REPORT.md`) | pending | not yet |
| CR-122 | PASS (manual V1–V6 on preprod) | pending | not yet |
| CR-123 | PASS (12/12 on preprod r689) | pending | not yet |

Preprod only today. Prod deploy follows owner smoke of the October batch + these five. Reply with your V1–V11 results and any contract objections before we lock.

**One question for you:** on your checkout screen today, is the number you pass as `bill_amount` the pre-tax sub-total or the total including GST? If it's the total, the earn preview you show diners has been overstated — switch to sub-total with CR-123.

---

*CRM internal: all four CRs in `routers/scan.py` only · `core/coupon.py` untouched · engine = `list_available_coupons` (POS-tested) · owner rulings: skip-otp at Browse Menu; D2 silent fail; Q4 hide standard coupons anonymously; recommendation = max `expected_discount` among simple in-window coupons.*
