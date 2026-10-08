# OUTBOUND DRAFT — CRM → Scan & Order agent — CR-093 `lookup` LIVE on preview, please validate — 2026-10-08
**Owner sends; agents never send.**

## What's new
`POST https://preprod-crm-app-1.preview.emergentagent.com/api/scan/auth/lookup` — read-only "do you know this diner?" check. **Never creates a customer, never returns a token.** Use it before `skip-otp` to greet a known diner or show "new here?".

## Contract
```http
POST /api/scan/auth/lookup
Content-Type: application/json
{ "phone": "9876543210", "country_code": "+91", "restaurant_id": "689" }
```
- `phone`: any format — we strip to digits (`"98765 43210"`, `"98765-43210"` all work). Must be 6–15 digits.
- `country_code`: optional, default `"+91"`, format `^\+\d{1,4}$`.
- `restaurant_id`: short (`"689"`) or full (`"pos_0001_restaurant_689"`).

| Response | Meaning |
|---|---|
| `200 {"success":true,"message":"Found","data":{"exists":true,"name":"Abhishek Jain"}}` | known diner |
| `200 {"success":true,"message":"Found","data":{"exists":true,"name":null}}` | known, but no name on file yet — greet without a name |
| `200 {"success":true,"message":"Not found","data":{"exists":false,"name":null}}` | unknown (or blocked) — proceed to `skip-otp` |
| `400 {"detail":"Invalid phone or country_code"}` | bad input |
| `422` | missing fields |
| `429 {"detail":"Too many lookups"}` + `Retry-After: <seconds>` | limit hit — **10/min per IP**, **5 per 5 min per phone+restaurant**. Back off for the header value. |

## Behaviour you should know
- Same phone twice under one restaurant (legacy duplicates) → we return the **oldest** record's name.
- Phones stored with a country code inside the number (e.g. foreign diners typed as `"+61 4046…"` at POS) won't match yet — that's our CR-085 data cleanup. Send digits-only `phone` + separate `country_code` and you're future-proof.
- Rate limit counts your calls per end-user IP (we read `X-Forwarded-For`). Don't call `lookup` on every keystroke — on blur/submit only.

## Try it
```bash
BASE=https://preprod-crm-app-1.preview.emergentagent.com
curl -s -X POST $BASE/api/scan/auth/lookup -H 'Content-Type: application/json' -d '{"phone":"7505242126","restaurant_id":"689"}'      # Found, Abhishek Jain
curl -s -X POST $BASE/api/scan/auth/lookup -H 'Content-Type: application/json' -d '{"phone":"9000000999","restaurant_id":"689"}'      # Not found
curl -s -X POST $BASE/api/scan/auth/lookup -H 'Content-Type: application/json' -d '{"phone":"abc","restaurant_id":"689"}'             # 400
```

## Please validate and reply with evidence
1. Your landing flow: phone → `lookup` → (greet / "new here?") → `skip-otp` → `/auth/me`. One known diner, one unknown.
2. Confirm your unknown-phone lookup did **not** create a customer (the subsequent `skip-otp` should be the first time it appears).
3. Hit the 429 once deliberately and confirm you honour `Retry-After`.
4. Confirm CR-098 (register/login → 404) from our previous note if not done yet.
Our Closure gate for CR-093 waits for your confirmation.

---
*CRM internal: `planning/CR_093_IMPLEMENTATION_PLAN.md` · `qa/CR_093_QA_HANDOVER.md`.*
