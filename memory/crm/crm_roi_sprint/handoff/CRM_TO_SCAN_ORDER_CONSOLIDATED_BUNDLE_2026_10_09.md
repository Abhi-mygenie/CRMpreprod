# CRM → Scan & Order (Customer App) — Consolidated note, 2026-10-09
**One message, everything pending between us.** Sections: §0 CR-084 ack · §1 identity-path rulings (context) · §2–§5 four shipped changes to validate on preview · §6 FYI · §7 contract items we still need · §8 how to reply.

Preview base URL: the CRM preview the owner shared with you (`REACT_APP_BACKEND_URL`). All routes below are under `/api`.

---
## §0 — CR-084 (OTP removal): your 2026-10-08 confirmation received — CLOSED both sides
Recorded. `CR-2026-09-14-001` "restore when live" voided on our records too. Alignment check: you deleted `crmForgotPassword` / `crmResetPassword` — CRM never had a customer forgot/reset route, and the staff `/auth/forgot-password/*` + `PUT /auth/reset-password` routes were removed by us the same day (CR-097). Correct deletions; nothing to restore.

---
## §1 — Identity-path rulings (owner-FINAL 2026-10-08) — context for §2–§5

---

## (a) Default diner identity path — **skip-otp is the ONLY path**
Owner ruling 2026-10-08. The password page is **not** opt-in; please drop it entirely. Your per-restaurant `skipOtp*` flags can be retired — behaviour is the same for every restaurant: phone → `POST /scan/auth/skip-otp` → token.

## (b) Password login — **CRM is retiring it (CR-098)**
Facts: of 7,737 customers on preprod, **2** have a password — both test records on `test_restaurant` (2026-08-11, security tester). Zero real diners. `skip-otp` already bypasses the password (your L4 note is correct), and with CR-090 closed there is no reset. So the password path provides neither security nor recovery.
CRM action: **CR-098** (registered 2026-10-08) removes `POST /scan/auth/register` and `POST /scan/auth/login` (password). Target **w/c 13 Oct**, ships with CR-093. Both will return 404 after that; the change-log row will be CONFIRMED with evidence.
Customer App action: stop offering password login/setup; remove `/password-setup`.

## (c) Does `skip-otp` create? — **Yes. By design. `lookup` never does.**
`skip-otp` (`scan.py:181-228`) = **login**: find by `{phone, restaurant_id}`; if absent, **create** (`name:""`, Bronze, 0 pts) and return a 24 h token. With OTP and password gone it is the only thing that can create a new diner, so this stays.
`lookup` (CR-093) = **question**: read-only, `{exists, name}`, never creates, never returns a token.
Recommended sequence in the app: `lookup` first (greet a known diner / show "new here?"), then `skip-otp`.
Known side-effects, all registered: abuse limiter → CR-089; blank-name records (21 today) → diner fills profile later; phone-format drift → CR-085.

## (d) Dates (owner-committed 2026-10-08)
| Item | Target | Notes |
|---|---|---|
| **CR-093** `POST /scan/auth/lookup` | **w/c 13 Oct 2026** | Your CR-2026-10-03-003 fast-follow |
| **CR-098** remove customer password routes | **w/c 13 Oct 2026** | Ships with 093 |
| **CR-096** `POST /scan/feedback` hybrid intake | **w/c 27 Oct 2026** | Your CR-2026-10-07-001. Depends on CR-085 canonical phone landing first |

## CR-093 `lookup` — contract details now frozen
| Decision | Ruling |
|---|---|
| Request | `POST /api/scan/auth/lookup` `{ "phone": "<digits>", "country_code": "+91" (optional, default "+91"), "restaurant_id": "689" }` |
| Match key | `{user_id, phone, country_code}` — same key CRM sync already dedups on |
| Response | `{ success, message, data: { exists: bool, name: string \| null } }` — **blank stored name → `null`** (Q3 final) |
| Duplicates | if the same phone exists twice under one restaurant, the **oldest record** (`created_at` asc) is returned |
| Not found | `exists: false, name: null`, HTTP 200. **Never creates.** |
| Validation | `phone` digits only; `country_code` `^\+\d{1,4}$`; bad input → 400. Rate-limited per IP + per phone → 429 with `Retry-After` |
| Index | `customers {user_id, phone}` non-unique index added with this CR (Q6 final) |

## Phone format — the honest picture (affects you)
96% of stored phones are plain 10 digits. The other 4% (390) are stored verbatim as typed at the POS counter — placeholders (`0000000000`), 11–14 digit typos, `+91…` or spaces inside the phone, and **genuine foreign diners** (`+61 …`, `+44 …`; restaurant 541 has 143). POS sends `phone` and `country_code` as separate fields; **CRM has been storing `phone` without normalising it — that is a CRM gap, fixed in CR-085** (canonical phone on every write path, one dedup key `{restaurant, phone, country_code}`).
What this means for you: send `phone` as **digits only** and `country_code` separately (default `+91`) on `lookup`, `skip-otp` and `feedback`. `lookup` will normalise the same way CR-085 does, so foreign diners become findable as soon as the stored data is cleaned — no POS change required.

## Your "not sent yet" item
Understood: you delete your quarantined OTP code (CR-2026-10-07-002) first, then confirm with evidence. CRM's side (`request-otp`/`verify-otp` → 404) is already CONFIRMED in the change-log.

---
*CRM internal refs: `planning/CR_093_IMPACT_ANALYSIS.md` · `planning/CR_084_CR_097_IMPACT_ANALYSIS.md` · `final/CR_084_CR_097_CLOSURE.md` · dashboard rows 085/089/093/096/098.*


---
## §2 — CR-098: customer password routes retired (shipped 2026-10-08) — PLEASE VALIDATE
**Owner sends; agents never send.** Follows our reply of 2026-10-08 (identity path Q-A, item b).

---

## What CRM changed (CR-098)
We removed the customer **password** login path from the Customer App API on preprod:

| Route | Before | Now |
|---|---|---|
| `POST /api/scan/auth/register` (phone + name + password) | set a password on a customer, returned a token | **404** |
| `POST /api/scan/auth/login` (phone + password) | verified the password, returned a token | **404** |

Nothing else moved:
| Route | Status |
|---|---|
| `POST /api/scan/auth/skip-otp` `{phone, restaurant_id}` | unchanged — **the only identity path**; find-or-create, returns 24 h token |
| `GET /api/scan/auth/me` | unchanged; still 403 without token; never returns `password_hash` |
| `GET/PUT /api/scan/profile*`, orders, loyalty, addresses, call-waiter, request-bill | unchanged |
| `POST /api/scan/auth/lookup` | **not yet built** (CR-093, next — still 404 today) |

## Why
- Only 2 of 7,737 customers ever had a password — both test records. No real diner used it.
- `skip-otp` never checked the password, so the password gave no protection; with no reset flow (CR-090 closed) it could only lock people out.
- `register` allowed anyone who knew a phone number to set a password on that customer's existing record. Closed.

## What we verified (preprod, 2026-10-08) — 13/13 independent QA checks
- Both routes return `404 {"detail":"Not Found"}` for empty and full bodies; **no customer is created** by those calls.
- The two former password-holders log in via `skip-otp` → 200 + token (no lock-out).
- `skip-otp` for a normal r689 phone → 200 + token.
- `/auth/me` and `/profile` with a customer token → 200; `/auth/me` without token → 403.
- CRM staff login (POS-delegated) → 200, untouched.

## Where to validate — preview environment
**Base URL**: `https://preprod-crm-app-1.preview.emergentagent.com`
All routes are under `/api`. No auth needed for the identity routes; customer-token routes take `Authorization: Bearer <token>` from `skip-otp`.

```bash
BASE=https://preprod-crm-app-1.preview.emergentagent.com

# 1. Removed routes → expect 404 {"detail":"Not Found"}
curl -i -X POST $BASE/api/scan/auth/register -H 'Content-Type: application/json' \
  -d '{"phone":"9876543210","name":"Test","password":"x","restaurant_id":"689"}'
curl -i -X POST $BASE/api/scan/auth/login -H 'Content-Type: application/json' \
  -d '{"phone":"9876543210","password":"x","restaurant_id":"689"}'

# 2. Only identity path → expect 200 + data.token
curl -s -X POST $BASE/api/scan/auth/skip-otp -H 'Content-Type: application/json' \
  -d '{"phone":"9876543210","restaurant_id":"689"}'

# 3. Token routes → expect 200 (replace <token>)
curl -s $BASE/api/scan/auth/me  -H 'Authorization: Bearer <token>'
curl -s $BASE/api/scan/profile  -H 'Authorization: Bearer <token>'

# 4. Guard intact → expect 403
curl -i $BASE/api/scan/auth/me

# 5. Not yet built (CR-093) → expect 404 today
curl -i -X POST $BASE/api/scan/auth/lookup -H 'Content-Type: application/json' -d '{}'
```
Note: `skip-otp` creates the customer if the phone is unknown to that restaurant — use a phone you're happy to have as a test record, or an existing one.

## What we need from you — please validate from the Customer App side
1. From your app on preprod, hit `POST /api/scan/auth/register` and `POST /api/scan/auth/login` → confirm you see **404** and your UI handles it (or, better, no longer calls them).
2. Confirm `/password-setup` is removed / unreachable, and the `skipOtp*` per-restaurant flags are retired (everyone goes `skip-otp`).
3. Run your normal landing flow end-to-end on at least one restaurant (e.g. `689`): phone → `skip-otp` → `/auth/me` → profile/orders. Confirm nothing regressed.
4. Reply with evidence (your request/response or a screenshot) so we can mark CR-098 **CLOSED** on our side. Our closure gate waits for your confirmation.

## What's next from CRM
`POST /api/scan/auth/lookup` (CR-093) — read-only `{exists, name|null}`, never creates — target **w/c 13 Oct**. Contract shape as sent in our 2026-10-08 reply (`{phone digits-only, country_code? default "+91", restaurant_id}`). We'll send a "live, please validate" note like this one when it ships.

---
*CRM internal: `planning/CR_098_IMPLEMENTATION_PLAN.md` · `qa/CR_098_QA_HANDOVER.md` · `/app/test_reports/iteration_2.json` · change-log Wave 2 row CONFIRMED.*


---
## §3 — CR-093: `POST /scan/auth/lookup` live (shipped 2026-10-08) — PLEASE VALIDATE
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


---
## §4 — CR-089: skip-otp rate limit (shipped 2026-10-09) — PLEASE VALIDATE
**Owner sends; agents never send.**

## What changed
`POST https://preprod-crm-app-1.preview.emergentagent.com/api/scan/auth/skip-otp` now has a speed limit. **Request, response and behaviour on success are unchanged** (find-or-create, 24 h token). One new outcome:

| Response | When |
|---|---|
| `429 {"detail":"Too many login attempts"}` + header `Retry-After: <seconds>` | more than **30 calls/min from one IP**, or more than **5 calls per 5 min for one phone+restaurant** |

Limits are **separate** from `lookup`'s — your normal `lookup → skip-otp` sequence costs 1 tick on each, never 2 on one.

## Why
`skip-otp` is now the only identity path and it creates a customer for every unknown phone; with no limit anyone could mass-create customers or probe the phone space. This is preventive — no abuse has been seen.

## What to validate
1. Normal landing flow still works: phone → (`lookup`) → `skip-otp` → `/auth/me`.
2. Handle 429 on `skip-otp` the same way you already handle it on `lookup`: back off for `Retry-After`, show a gentle "please try again in a moment".
3. Deliberately trip it once (6 quick `skip-otp` calls for one phone) and confirm your UI recovers after `Retry-After`.
4. Reply with evidence so we can close CR-089. Also still pending from you: evidence for CR-098 (register/login → 404) and CR-093 (`lookup` live).

```bash
BASE=https://preprod-crm-app-1.preview.emergentagent.com
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w '%{http_code}\n' -X POST $BASE/api/scan/auth/skip-otp -H 'Content-Type: application/json' -d '{"phone":"<an existing phone>","restaurant_id":"689"}'; done   # 200 ×5 then 429
```


---
## §5 — CR-085-A: canonical phone on skip-otp + lookup (shipped 2026-10-09) — PLEASE VALIDATE
**Owner sends; agents never send.** Base: `https://preprod-crm-app-1.preview.emergentagent.com`

## What changed
CRM now normalises every customer phone it receives and matches on **restaurant + digits + country code**. `"98387 77712"`, `"+91 98387 77712"`, `"09838777712"` and `"9838777712"` are the **same diner** on every channel.

## For Scan & Order (Customer App)
| Route | Change |
|---|---|
| `POST /api/scan/auth/skip-otp` | phone normalised before find-or-create → no more duplicate records from formatting. **New: invalid phone → `400 {"detail":"Enter a valid mobile number"}`** (e.g. `0000000000`, 9 digits). |
| `POST /api/scan/auth/lookup` | same helper; malformed `country_code` (e.g. `"91"`) → 400. Flagged-invalid records never returned. |
Validate: spaced/`+91` variants of one phone → same token subject; junk → 400; your 400 handling shows a friendly message.

## For POS
**Nothing is rejected on any POS route.** Request/response shapes unchanged. Stored `phone` is now digits-only with `country_code`; `phone_raw` kept when we cleaned it; junk phones stored with `phone_invalid:true` and excluded from WhatsApp/loyalty jobs.
⚠️ Pending CRM-owner decision: bills with junk phones currently still credit a *flagged* customer; `customer-lookup` still returns such records. We'll confirm the final behaviour.
Validate: `POST /api/pos/customers` with `"+91 90000 00123"` → stored `9000000123`; `customer-lookup` with `"90000-00123"` → found; a bill via `/api/pos/orders` with a spaced phone links to the existing customer.

Reply with evidence; CRM closure of CR-085-A waits for both teams.


---
## §6 — FYI, no action
- **CR-085-A2** (2026-10-09): POS bills with junk/blank phones are now **guest orders** (`customer_id:null`) — such orders never appear under any customer in `/scan/orders`, by design. POS `customer-lookup` hides `phone_invalid` records (POS-side only).
- **BUG-025** (registered, fix queued): skip-otp per-phone limit can currently be exceeded by prefixing `+91` / `0`. Does not affect your integration.
- Decision for later: a diner's junk-phone history is **not** backfilled; a per-restaurant correction report will precede any data cleanup (CR-085-B, end of batch).

---
## §7 — Contract items still open from your side (from our 2026-10-03 handover)

| # | Item | Why we need it | Blocks |
|---|---|---|---|
| **CA-1** | **Countersignature** on `CONTRACT_CUSTOMER_APP_CRM_v1.0` Part 1 (§1–§6) | CRM signed 2026-10-03; contract becomes **v1.0 FROZEN** only on their signature | Contract freeze |
| **CA-2** | **Q-CA-1 — cutover confirmation**: tell us when Customer App has stopped reading `GET /scan/config/{rid}` and `GET /scan/menu/dietary-tags/{rid}` (reads its own collections directly) | CR-095 GET removal is gated on this | CR-095 (GET half) |
| **CA-3** | **Confirm A9-b hybrid** feedback design as written in §4c, and that they will switch from their `POST /api/config/feedback` to CRM `POST /scan/feedback` | Already owner-approved on CRM side; need their ACK before planning closes | CR-096 |
| **CA-4** | **B1 — the exact four collection names "missing on UAT"** | Cannot answer against UAT DB without names | Ownership board completeness |
| **CA-5** | **B2 — the exact four "unclaimed" collections** they meant (our candidates: `non_qr_blocks`, `status_checks`, `message_logs`, `templates`) | Reconcile against our scan | Ownership board completeness |
| **CA-6** | **Acknowledge per-tier earn fields** for CR-094 adapter (4× `*_earn_percent`, not one `base_earn_percent`) | Avoid adapter mismatch at integration | CR-094 integration |
| **CA-7** | **Acknowledge Call Waiter / Pay Bill are inert** (POS P1 = NO) and that direction (P6) is parked — their UI should not promise a waiter is notified | Customer-facing correctness | None (informational) |
| **CA-8** | **Confirm they accept the rollout sequence §6** (CRM step-1 wave → they wire → admin login to POS → CR-095) and give a target date for their step 2–3 | Lets us set a firm ship date at PLANNING | Planning dates |
| **CA-9** | After 093/094/096 land: they receive refreshed `/api/openapi.json` subset + contract **v2.1** diff from us (CRM-owed, tracked) | Their request #1 | CR-088 |

---
## §8 — How to reply (one line each is enough)
| Item | Your reply |
|---|---|
| §2 CR-098 | "No calls to `/scan/auth/register` or `/scan/auth/login` remain; skip-otp is our only login — validated <date>" |
| §3 CR-093 | "lookup validated on preview <date>: exists/name shape, 400 on bad input, 429 + Retry-After seen" |
| §4 CR-089 | "client handles 429 + Retry-After on skip-otp — validated <date>" |
| §5 CR-085-A | "spaced phone → same account ✅; `0000000000` → 400 message shown in UI ✅ — <date>" |
| §7 CA-1…CA-8 | answers / dates |

These four validations are the last gate before CRM formally closes CR-098 / 093 / 089 / 085-A.
