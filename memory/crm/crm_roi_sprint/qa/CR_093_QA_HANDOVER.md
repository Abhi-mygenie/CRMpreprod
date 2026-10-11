# QA Handover — CR-093 `POST /scan/auth/lookup`
**Date**: 2026-10-08 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_093_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_093_IMPACT_ANALYSIS.md` · **Risk**: HIGH (new public unauthenticated route)
**Creds**: `/app/memory/test_credentials.md` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`

## What changed (2 files)
| File | Change |
|---|---|
| `backend/routers/scan.py` | + `LookupRequest` (phone, restaurant_id, country_code="+91") · + `_client_ip`, `_lookup_rate_limited` (Mongo `scan_lookup_attempts`, sliding window) · + `POST /auth/lookup` after `/auth/me` · imports `Request`, `timedelta`, `re` |
| `backend/server.py` | + startup indexes: `customers idx_customers_user_phone {user_id,phone}` · `scan_lookup_attempts idx_lookup_key_created`, `ttl_scan_lookup_attempts (expires_at, TTL 0)` |

## Contract
Request `{ "phone": "<any format; digits extracted>", "country_code": "+91" (optional), "restaurant_id": "689" }`
Response `200 { success, message, data: { exists: bool, name: string|null } }` · `400` invalid phone/cc · `422` missing fields · `429` + `Retry-After` on limit (10/min per IP; 5 per 5 min per phone+restaurant). Never creates. Blocked customers → `exists:false`.

## Implementation self-test — 12/12 PASS (preview, 2026-10-08)
| # | Check | Result |
|---|---|---|
| L1 | `{}` | 422 ✅ |
| L2 | `phone:"abc"` · `country_code:"91"` | 400, 400 ✅ |
| L3 | unknown `"90000 00999"` r689 | `{exists:false,name:null}`; **customers count 7737 → 7737** ✅ |
| L4 | `"75052-42126"` r689 | `{exists:true,name:"Abhishek Jain"}` ✅ (normalisation) |
| L5 | blank-name `9696759716` r618 | `{exists:true,name:null}` ✅ |
| L6 | duplicate group `9309105737` r635 | `name:"Siddhi Malani"` (oldest, 2026-07-13) ✅ |
| L7 | `+61 404668073` r541 | `exists:false` — **known gap** until CR-085 (stored as `phone:"+61 404668073"`, cc `+91`) ✅ as expected |
| L8 | 11 calls same IP | 10×200 then 429, `retry-after: 48` ✅ |
| L9 | 6 calls same phone, 6 IPs | 5×200 then 429 ✅ |
| L10 | indexes present | `idx_customers_user_phone` · `ttl_scan_lookup_attempts expireAfterSeconds=0` ✅ |
| L11 | `explain()` | IXSCAN on `idx_customers_user_phone` ✅ |
| L12 | skip-otp `{}` 422 · `/auth/me` no token 403 · staff login 200 | ✅ |

## QA asks — re-run independently
1. L1–L9, L12 with fresh calls. Use distinct `X-Forwarded-For` values to avoid tripping the IP limiter unintentionally; wait ≥60 s if you hit 429 on IP, ≥300 s on phone.
2. Assert `customers` count unchanged across all your lookup calls (read via a known endpoint or Mongo).
3. Blocked customer: find one with `is_blocked:true` (if any) → `exists:false`.
4. `restaurant_id` given as `"pos_0001_restaurant_689"` (full form) behaves the same as `"689"`.
5. `Retry-After` header present and integer on 429.
6. After 5+ minutes, `scan_lookup_attempts` rows from your run are being expired by TTL (count decreasing).
7. Backend err log clean.

## Known / out of scope
- Records without `country_code` (CSV-imported) and phones stored with embedded `+cc`/spaces won't match until CR-085 normalises stored data.
- Limiter is reusable by CR-089 for `skip-otp`.
