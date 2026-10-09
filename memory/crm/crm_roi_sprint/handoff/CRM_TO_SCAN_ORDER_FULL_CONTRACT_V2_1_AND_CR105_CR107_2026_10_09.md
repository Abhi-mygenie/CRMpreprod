# CRM → Scan & Order — Full contract update v2.1 + two new checkout endpoints
**Date:** 2026-10-09
**Owner sends; agents never send.**
**Re:** CA-9 (OpenAPI + contract diff) · CR-107 `POST /scan/max-redeemable` LIVE · CR-105 `POST /scan/coupons/validate` LIVE

This is the complete picture of the CRM `/scan/*` API as it stands today. All previously confirmed items are marked ✅. Two new endpoints need your validation (§2, §3). One note on coupon codes (§4).

---

## §1 — CA-9: Full `/scan/*` endpoint inventory + contract v2.1 diff

This is the refreshed contract we owe you from §6 step 5 of the rollout sequence. Full list of every live `/scan/*` route today:

**Base URL:** `https://crm-preprod-7.preview.emergentagent.com/api`
**Full OpenAPI:** `GET /api/openapi.json` (186 paths total — filter to `/api/scan/`)

### Complete `/scan/*` route table (19 routes)

| Method | Path | Status | Notes |
|---|---|---|---|
| `POST` | `/scan/auth/skip-otp` | ✅ live | Login — find-or-create. Accepts `{phone, restaurant_id, country_code?}`. Rate: 30/min IP, 5/5min phone. |
| `POST` | `/scan/auth/lookup` | ✅ live (CR-093) | Read-only existence check. `{exists, name\|null}`. Rate: 10/min IP, 5/5min phone. |
| `GET` | `/scan/auth/me` | ✅ live | Profile from token. 403 if no token. |
| `GET` | `/scan/loyalty-rules/{rid}` | ✅ live (CR-094) | **Pre-login.** 33 flat keys: earn %, redemption, bonuses. No auth. Rate: 60/min IP. |
| `GET` | `/scan/profile` | ✅ live | Full customer profile. Token required. |
| `PUT` | `/scan/profile` | ✅ live | Update name, email, dob, anniversary, preferences. Token required. |
| `GET` | `/scan/loyalty` | ✅ live | Points, tier, wallet balance, `expiring_soon`, `expiring_date`. Token required. |
| `GET` | `/scan/points/history` | ✅ live (CR-088) | `?skip=&limit=` (cap 50). Returns `{transactions, total, skip, limit}`. Token required. |
| `GET` | `/scan/wallet/history` | ✅ live (CR-088) | Same pagination shape. Token required. |
| `GET` | `/scan/orders` | ✅ live (CR-088) | `?skip=&limit=`. Returns `{orders, total, skip, limit}`. Token required. |
| `GET` | `/scan/orders/{order_id}` | ✅ live | Single order detail. Token required. |
| `GET` | `/scan/coupons` | ✅ live (BUG-034 fixed) | Active eligible coupons for the diner. Token required. See §4 on trailing spaces. |
| `POST` | `/scan/coupons/validate` | **🆕 NEW (CR-105)** | Validate code → discount preview. Token required. **→ see §3** |
| `POST` | `/scan/max-redeemable` | **🆕 NEW (CR-107)** | Max loyalty pts redeemable for a bill amount. Token required. **→ see §2** |
| `GET`, `POST` | `/scan/addresses` | ✅ live | List / add addresses. Token required. |
| `PUT`, `DELETE` | `/scan/addresses/{addr_id}` | ✅ live | Update / delete address. Token required. |
| `PUT` | `/scan/addresses/{addr_id}/default` | ✅ live | Set default address. Token required. |
| `POST` | `/scan/feedback` | ✅ live (CR-096) | Hybrid: token OR `{restaurant_id, phone?}`. Sign-in card removal is your next CR. |
| `POST` | `/scan/call-waiter` | ✅ live (inert) | Writes `pos_event_logs` — inert until POS P6 resolved. |
| `POST` | `/scan/request-bill` | ✅ live (inert) | Same. |

### Removed routes (return 404)

| Route | Removed by | Status |
|---|---|---|
| `POST /scan/auth/register` | CR-098 | 404 |
| `POST /scan/auth/login` (password) | CR-098 | 404 |
| `GET /scan/config/{rid}` | CR-095 | 404 |
| `PUT /scan/config/{rid}` | CR-095 | 404 |
| `GET /scan/menu/dietary-tags/{rid}` | CR-095 | 404 |
| `PUT /scan/menu/dietary-tags/{rid}` | CR-095 | 404 |

### Contract v2.1 delta (from v1.0 §4)

| Change | Detail |
|---|---|
| **+** `POST /scan/auth/lookup` | CR-093 — read-only existence check |
| **+** `GET /scan/loyalty-rules/{rid}` | CR-094 — pre-login earn/redemption preview |
| **~** `POST /scan/feedback` | CR-096 — token now optional; hybrid intake |
| **+** `GET /scan/orders?skip=&limit=` | CR-088 — pagination + true total |
| **+** `GET /scan/points/history?skip=&limit=` | CR-088 — pagination + true total |
| **+** `GET /scan/wallet/history?skip=&limit=` | CR-088 — pagination + true total |
| **~** `GET /scan/loyalty` | CR-088 — adds `expiring_soon`, `expiring_date` |
| **+** `GET /api/openapi.json` | CR-088 — live at this path (186 paths) |
| **+** `POST /scan/max-redeemable` | **CR-107 — NEW** |
| **+** `POST /scan/coupons/validate` | **CR-105 — NEW** |
| **–** `POST /scan/auth/register` | CR-098 — 404 |
| **–** `POST /scan/auth/login` | CR-098 — 404 |
| **–** `GET+PUT /scan/config/{rid}` | CR-095 — 404 |
| **–** `GET+PUT /scan/menu/dietary-tags/{rid}` | CR-095 — 404 |

---

## §2 — CR-107: `POST /scan/max-redeemable` — LIVE, please validate

**What it does:** Given a bill amount, returns the maximum loyalty points the diner can redeem on that order — server-side, cap-aware, tier-aware.

```http
POST /api/scan/max-redeemable
Authorization: Bearer <customer_token>
Content-Type: application/json

{ "bill_amount": 500.0 }
```

**Response when redemption is possible:**
```json
{
  "success": true,
  "data": {
    "ok": true,
    "code": null,
    "max_points_redeemable": 200,
    "max_discount_value": 200.0,
    "ratio_per_point": 1.0,
    "available_points": 400,
    "min_redemption_points": 50,
    "loyalty_enabled": true,
    "projected_points_earned": 25
  }
}
```

**Response when redemption is not available:**
```json
{
  "success": true,
  "data": {
    "ok": false,
    "code": "BELOW_MIN_REDEMPTION",
    "max_points_redeemable": 0,
    "max_discount_value": 0.0,
    "available_points": 30,
    "min_redemption_points": 50,
    "loyalty_enabled": true,
    "projected_points_earned": 25
  }
}
```

**`code` values:** `null` (ok) · `LOYALTY_DISABLED` · `SETTINGS_MISSING` · `BELOW_MIN_REDEMPTION`

**Usage:** call this when the checkout screen opens to show "You can redeem up to N points (₹X off)". If `ok:false`, hide or disable the redemption input. Always show `projected_points_earned` — they earn points regardless of whether they redeem.

**No rate limit** — token-gated, read-only.

```bash
BASE=https://crm-preprod-7.preview.emergentagent.com
curl -s -X POST $BASE/api/scan/max-redeemable \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"bill_amount": 500}'
```

**Please validate and reply:** `POST /scan/max-redeemable {bill_amount:500}` → confirm `ok`, `max_points_redeemable`, `projected_points_earned` present.

---

## §3 — CR-105: `POST /scan/coupons/validate` — LIVE, please validate

**What it does:** Validate a coupon code against the diner's order total before the order is placed. Read-only — no usage is recorded here (recorded when POS processes the order).

```http
POST /api/scan/coupons/validate
Authorization: Bearer <customer_token>
Content-Type: application/json

{
  "code": "SAVE10",
  "order_total": 500.0,
  "channel": "dine_in",
  "items": []
}
```

- `code` — required; case-insensitive; **strip whitespace client-side** (see §4)
- `order_total` — required, cart subtotal before discount
- `channel` — optional, default `"dine_in"`; options: `"dine_in"`, `"delivery"`, `"takeaway"`
- `items` — optional; only needed for BOGO / item-scope coupons

**Success response (HTTP 200):**
```json
{
  "success": true,
  "message": "Coupon valid",
  "data": {
    "valid": true,
    "code": "SAVE10",
    "title": "Weekend Offer",
    "discount_type": "percentage",
    "discount_value": 10.0,
    "computed_discount": 50.0,
    "final_amount_preview": 450.0,
    "min_order_value": 200.0,
    "stackable_with_loyalty": false,
    "coupon_type": "order"
  }
}
```

**Error responses (HTTP 200, check `valid:false`):**
```json
// Bad code
{ "data": { "valid": false, "error": { "code": "INVALID_CODE", "detail": "Invalid coupon code: SAVE10" } } }

// Expired
{ "data": { "valid": false, "error": { "code": "EXPIRED" } } }

// Below minimum order
{ "data": { "valid": false, "error": { "code": "MIN_ORDER_NOT_MET", "detail": "Minimum order ₹200 required" } } }

// Per-user limit reached
{ "data": { "valid": false, "error": { "code": "PER_USER_LIMIT" } } }

// Wrong channel (e.g. delivery-only coupon, diner is dine-in)
{ "data": { "valid": false, "error": { "code": "NOT_APPLICABLE" } } }
```

**Important:** HTTP status is **always 200** — check `data.valid` to know the outcome.

**Rate limit:** 10 calls/min per IP. Returns `429` + `Retry-After`.

```bash
BASE=https://crm-preprod-7.preview.emergentagent.com
curl -s -X POST $BASE/api/scan/coupons/validate \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer <token>" \
  -d '{"code":"FLAT100TEST","order_total":1000}'
# → valid:true, computed_discount:100, final_amount_preview:900
```

**Please validate and reply:** (a) valid code with sufficient order → `valid:true, computed_discount > 0` · (b) invalid code → `valid:false, error.code:"INVALID_CODE"` · (c) sign-in card removed from feedback screen (from CR-096 earlier).

---

## §4 — Coupon code data note

Some coupon codes in the database were entered with trailing spaces (e.g. `"FLAT TODAY "`). CRM strips the input but the DB lookup is exact-match — a trailing space in the DB will return `INVALID_CODE` even if the input looks correct. **Please strip whitespace from coupon codes client-side before sending.** We will clean the DB codes in a future data hygiene pass (CR-085-B).

---

## §5 — Summary of open items

| Item | Owner | Status |
|---|---|---|
| Validate `POST /scan/max-redeemable` | **Scan & Order** | Requesting now (§2) |
| Validate `POST /scan/coupons/validate` | **Scan & Order** | Requesting now (§3) |
| Sign-in card removal from feedback | **Scan & Order** | Your next registered CR (started) |
| Steps 2–3 of September sequence | **Scan & Order** | Your timeline |
| Owner smoke (CR-098/093/089 formal closure) | **CRM owner** | Internal CRM |

**Nothing else is pending between our teams.** The contract is signed (CA-1 ✅), all Waves 1–4 are shipped and validated, CA-9 is delivered above.

---

*CRM internal refs: `qa/CR_105_CR_107_QA_HANDOVER.md` · `qa/CR_094_QA_HANDOVER.md` · `qa/CR_096_QA_HANDOVER.md` · `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` · `investigations/CONTRACT_CUSTOMER_APP_CRM_v1.0_CRM_SIGNOFF.md`*
