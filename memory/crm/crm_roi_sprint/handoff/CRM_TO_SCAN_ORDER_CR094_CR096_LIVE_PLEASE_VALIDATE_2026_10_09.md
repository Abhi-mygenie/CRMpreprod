# CRM → Scan & Order (Customer App) — CR-094 + CR-096 live, please validate
**Date:** 2026-10-09
**Owner sends; agents never send.**
**Base URL (preview):** `https://crm-preprod-7.preview.emergentagent.com`
All routes are under `/api`. These are the two items you were waiting on from our last exchange.

---

## §1 — CR-094: `GET /api/scan/loyalty-rules/{rid}` is LIVE

### What it is
Public, no-auth endpoint. Call it **before login** so a diner can see what they'll earn before they tap "log in". Replaces any local/hardcoded earn-rate copy on your end.

```http
GET /api/scan/loyalty-rules/{rid}
```

`{rid}` = short form (`689`) or full (`pos_0001_restaurant_689`). No `Authorization` header needed — any header present is silently ignored.

---

### Response shape
```json
{
  "success": true,
  "message": "Loyalty rules",
  "data": { <33 flat keys — full list below> }
}
```

**404** `{"detail":"Restaurant not found"}` — bad/unknown rid.
**429** `{"detail":"Too many requests"}` + `Retry-After: <seconds>` — 60 calls/min per IP. Back off for the header value.

Origin sets `Cache-Control: public, max-age=60`. (Preview edge currently rewrites this to `no-store` — verify the header on the production domain, not on preview.)

---

### The 33 keys (flat, CA-6 names)

| Group | Keys |
|---|---|
| Flags | `loyalty_enabled` · `wallet_enabled` · `coupon_enabled` |
| Earn | `bronze_earn_percent` · `silver_earn_percent` · `gold_earn_percent` · `platinum_earn_percent` |
| Tier thresholds | `tier_silver_min` · `tier_gold_min` · `tier_platinum_min` |
| Redemption | `redemption_value` · `bronze_redemption_value` · `silver_redemption_value` · `gold_redemption_value` · `platinum_redemption_value` · `min_redemption_points` · `max_redemption_percent` · `max_redemption_amount` · `min_order_value` |
| Bonuses | `first_visit_bonus_enabled` · `first_visit_bonus_points` · `birthday_bonus_enabled` · `birthday_bonus_points` · `anniversary_bonus_enabled` · `anniversary_bonus_points` · `feedback_bonus_enabled` · `feedback_bonus_points` |
| Off-peak | `off_peak_bonus_enabled` · `off_peak_bonus_type` · `off_peak_bonus_value` · `off_peak_start_time` · `off_peak_end_time` |
| Expiry | `points_expiry_months` |

---

### Semantics you must know

**`*_redemption_value` — already resolved, never null.**
`bronze/silver/gold/platinum_redemption_value` are the **effective ₹ per point per tier** — we computed them server-side. Do not fall back to `redemption_value ÷ something`; just read the per-tier key directly. Example for Kunafa Mahal (r689): bronze=1.0, silver=2.0, gold=3.0, platinum=4.0.

**`max_redemption_amount: null` = no cap.** Show "no limit" or omit the cap copy.

**`points_expiry_months: 0` = points never expire.**

**`off_peak_bonus_type`** is either `"multiplier"` or `"flat"`. Times are `HH:MM` in restaurant-local time (Asia/Kolkata).

**`loyalty_enabled: false` → show no earn/redeem copy at all.** All 33 keys are still returned so you can cache the shape, but hide the loyalty section entirely.

**Bonus fields — informational only for now. Do NOT promise "+N points" for these three:**
- `birthday_*` / `anniversary_*` — the award scheduler is not enabled in this batch. A diner can still set their DOB/anniversary via `PUT /scan/profile`.
- `feedback_*` — nothing awards feedback bonus points yet (separate future item).
- `first_visit_*` — awarded automatically on first POS order; safe to show ("earn N bonus points on your first visit").

---

### Try it
```bash
BASE=https://crm-preprod-7.preview.emergentagent.com

# 200 — 33 keys, per-tier redemption
curl -s "$BASE/api/scan/loyalty-rules/689" | python3 -m json.tool

# 404 — unknown restaurant
curl -s "$BASE/api/scan/loyalty-rules/999999"

# Junk bearer token → still 200 (route is public)
curl -s "$BASE/api/scan/loyalty-rules/689" -H "Authorization: Bearer junk"
```

---

### What we need from you — please validate
1. `GET /api/scan/loyalty-rules/689` → 200, `data` has exactly 33 keys, `*_redemption_value` is not null for any tier.
2. A restaurant you use with `loyalty_enabled: false` → still returns 200 with all 33 keys; your UI hides loyalty copy.
3. Your pre-login "earn N points" preview renders correctly from the live endpoint on at least one tenant.
4. Reply with evidence (response snippet or screenshot) so we can mark CR-094 **consumer-validated**.

---

## §2 — CR-096: `POST /api/scan/feedback` hybrid intake is LIVE

### What changed
**`POST /api/scan/feedback` now works without a login token.** Your sign-in card for no-token diners can be removed. Three paths:

| Case | What you send | What happens |
|---|---|---|
| **A — logged-in diner** | `Authorization: Bearer <token>` + `{rating}` | Linked to their account. `feedback_count +1`. Same as before. |
| **B — bad/expired token** | Stale bearer header | **401** → re-run `skip-otp`, resubmit. |
| **C — no token, known phone** | `{rating, restaurant_id, phone, country_code?}` | Resolved to existing customer. **No customer created.** `linked: true`. |
| **D — no token, unknown phone** | same | Stored unlinked. Phone kept. **No customer created.** `linked: false`. |
| **E — no token, no phone** | `{rating, restaurant_id}` | Anonymous, unlinked. `linked: false`. |
| **F — invalid phone supplied** | junk digits | **400 "Enter a valid mobile number"** — nothing stored. Validate client-side before sending. |

---

### Contract

**Request (no-token path):**
```json
{
  "rating": 4,
  "restaurant_id": "689",
  "phone": "9876543210",
  "country_code": "+91",
  "message": "Great food!",
  "order_id": "<optional>"
}
```

- `rating`: 1–5 (integer). Outside range → **400**.
- `restaurant_id`: short (`"689"`) or full. Required when no token. Unknown rid → **404**.
- `phone`: optional. Digits only, same normalisation as `skip-otp` / `lookup`. Invalid → **400**.
- `country_code`: optional, default `"+91"`.
- `message`: optional, capped at 500 characters server-side.
- `order_id`: optional. If the order isn't found under that restaurant it's stored as `null` (never a hard error).

**Response:**
```json
{
  "success": true,
  "message": "Feedback submitted",
  "data": {
    "feedback_id": "<uuid>",
    "linked": true
  }
}
```

`linked: true` = attributed to an existing customer. Use this to show "thanks — your feedback has been recorded on your account" vs a generic thank-you.

**Rate limits (no-token path only):** 10 submissions/min per IP (`fb-ip:` bucket), 3 per 10 min per phone+restaurant (`fb-ph:` bucket). Token path is not rate-limited (already identity-bound). Both return **429** + `Retry-After`.

**Never creates a customer.** This route only reads the customers collection. A diner who submits anonymous feedback and later logs in via `skip-otp` is a separate customer record until CRM links them by phone.

---

### What to remove / change on your side
1. **Remove the sign-in card** shown to no-token diners on the feedback screen. Case E (anonymous, no phone) is now valid — you can submit feedback with just `{rating, restaurant_id}`.
2. **Remove any call to your own `POST /api/config/feedback`** (the local Customer App endpoint). CRM's `/scan/feedback` is the new single target.
3. If you capture the diner's phone elsewhere in the flow (e.g. they typed it to check loyalty), you can pass it here to get attribution (`linked: true`) without requiring a full skip-otp/login.

---

### Try it
```bash
BASE=https://crm-preprod-7.preview.emergentagent.com

# Case E — anonymous, no phone → 200 linked:false
curl -s -X POST $BASE/api/scan/feedback \
  -H 'Content-Type: application/json' \
  -d '{"rating":4,"restaurant_id":"689"}'

# Case C — known phone → 200 linked:true
curl -s -X POST $BASE/api/scan/feedback \
  -H 'Content-Type: application/json' \
  -d '{"rating":5,"restaurant_id":"689","phone":"7505242126","country_code":"+91"}'

# Case F — invalid phone → 400
curl -s -X POST $BASE/api/scan/feedback \
  -H 'Content-Type: application/json' \
  -d '{"rating":3,"restaurant_id":"689","phone":"0000000000"}'

# Case B — expired/bad token → 401
curl -s -X POST $BASE/api/scan/feedback \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer stale.token.here' \
  -d '{"rating":3}'
```

---

### What we need from you — please validate
1. Anonymous feedback (`{rating, restaurant_id}` only) → 200, `linked: false`. Your UI shows the generic thank-you.
2. Your full no-token feedback flow end-to-end on preview: diner enters rating (± phone if captured), submits, sees thank-you. Sign-in card is gone.
3. If a diner has an active token, the token path still works: submit with `Authorization: Bearer <token>` → 200, `linked: true`.
4. Bad/expired token → 401 handled gracefully (re-run skip-otp, re-submit).
5. Reply with evidence so we can mark CR-096 **consumer-validated**.

---

## §3 — Open items still with you (no change since last note)

| # | Item | Still waiting for |
|---|---|---|
| **CA-2** | Cutover date — when you stop reading `GET /scan/config/{rid}` + `GET /scan/menu/dietary-tags/{rid}` from CRM | A target date. Blocks our CR-095 GET removal. |
| **CA-4** | The four collection names "missing on UAT" (your B1 from 2026-10-03) | The four names — we can't check UAT without them. |
| **CA-5** | The four "unclaimed" collections (your B2). Our candidates: `non_qr_blocks`, `status_checks`, `message_logs`, `templates`. | Confirm or correct. |
| **CA-8** | Steps 2–3 date — your wiring + admin-login-to-POS after CRM's step-1 wave | A target date. |

---

## §4 — How to reply (one line each is enough)

| Item | Your reply |
|---|---|
| §1 CR-094 | "loyalty-rules validated on preview \<date\>: 33 keys ✅, per-tier values non-null ✅, pre-login preview renders ✅" |
| §2 CR-096 | "hybrid feedback validated \<date\>: anonymous 200 ✅, token path 200 ✅, 401 handled ✅, sign-in card removed ✅" |
| CA-2 | cutover date |
| CA-4 | four collection names |
| CA-5 | confirm or correct our candidates |
| CA-8 | steps 2–3 target date |

These two validations, together with the Wave 2–3 owner smoke, are the last gate before CRM formally closes CR-094, CR-096, and the Wave 2–3 bundle together.

---
*CRM internal refs: `qa/CR_094_QA_HANDOVER.md` · `qa/CR_096_QA_HANDOVER.md` · `test_reports/iteration_9.json` (13/13 + 15/15 PASS) · `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` rows CR-094 + CR-096.*
