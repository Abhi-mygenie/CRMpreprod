# CR-093 — Impact Analysis
## Public customer lookup `POST /scan/auth/lookup` → `{exists, name}`

**Date**: 2026-10-07
**Role**: Planning Agent (Impact Analysis stage only — no implementation plan yet, no code)
**Risk**: **HIGH** (verified, see §5) — new public unauthenticated route in the `/scan/auth/*` block
**Intake doc**: `discovery/SESSION_2026_09_28_BATCH_INTAKE_CR093_CR095.md` §1
**Contract**: `CONTRACT_CUSTOMER_APP_CRM_v1.0` §4c (B1/B2) — CRM signed Part 1 on 2026-10-03
**Status**: ⏸ **OPEN — 7 owner decisions pending (§7). Nothing below is assumed.**

---

## 1. Registration verified

| Check | Result |
|---|---|
| Registered | ✅ `CR_STATUS_DASHBOARD.md` row 093, 📋 REGISTERED 2026-09-28, P1 / HIGH |
| Intake doc exists | ✅ §1 of batch intake |
| Owner approval to PLAN | ⚠️ Owner asked for impact analysis in this session ("take planning role for impact analysis of CR-093") — treated as PLANNING gate open for **analysis only**. Implementation gate is **not** open. |
| Contract alignment | ✅ §4c B1/B2: name-only, no create, no token, rate-limited; points/tier/wallet login-gated |

---

## 2. Code reality — **NONE**

| Probe | Evidence |
|---|---|
| `POST /api/scan/auth/lookup` on preview | **404** (curl, 2026-10-07) |
| `grep "auth/lookup" routers/` | 0 hits |
| Closest existing | `POST /api/pos/customer-lookup` (`pos.py:2041`) — POS `X-API-Key` auth, returns full customer + loyalty + documents. Not usable from a browser. |
| Current Customer App stand-in | `POST /scan/auth/skip-otp` (`scan.py:303–348`) — **inserts** a blank customer (`name:""`) for every unknown phone and mints a 24h token. |

---

## 3. Data-flow trace (proposed route, as per intake + contract)

```
Customer App (browser, no auth)
  └─ POST /api/scan/auth/lookup  {phone, restaurant_id(short "689")}
       ├─ rate-limit check (per IP + per phone+rid)  → 429 on breach
       ├─ _normalize_restaurant_id("689") → "pos_0001_restaurant_689"   (scan.py:30, existing)
       ├─ db.customers.find_one({phone, user_id}, {name:1})               (READ ONLY)
       └─ _resp(True, "...", {exists: bool, name: str|null})
```

**Writes**: none to `customers`. Only possible write = rate-limiter state (see Q5).
**Reads**: `customers` (1 query). Nothing else.

### Existing building blocks that WILL be reused (no change)
| Piece | Location | Note |
|---|---|---|
| `_normalize_restaurant_id` | `scan.py:30` | same as every pre-login route |
| `SkipOTPRequest` body shape `{phone, restaurant_id}` | `scan.py:58–60` | lookup body is identical → can reuse model or add `LookupRequest` |
| `_resp` envelope | `scan.py:178` | `{success, message, data}` |
| 429 pattern | `scan.py:191–199` (`request-otp`) | raises `HTTPException(429)`; counts docs in `customer_otps` over 5 min |
| Client-IP extraction behind ingress | `core/pos_request_logger.py:284–286` | reads `x-forwarded-for`, falls back to `request.client.host` — only place in codebase that does this |

---

## 4. DB facts that shape the design (preprod, 2026-10-07, read-only)

| Fact | Value | Why it matters |
|---|---|---|
| Customers total | 7,736 | — |
| Exact 10-digit `phone` | 7,439 (96.2%) | exact-match lookup works for 96%; rest (`+91…`, `91…`, 11-digit, junk) invisible until CR-085 |
| Customers with `name` `""`/missing | **20** | mostly `skip-otp`-created; `exists:true` but nothing to greet with → **Q3** |
| Duplicate `(user_id, phone)` groups | **18** | `find_one` returns an arbitrary one → **Q4** |
| `is_blocked: true` | 0 today | still must not leak (intake rule) |
| `customers` indexes | `_id`, `idx_customers_user_id`, `idx_customers_user_tags` | **no `{user_id, phone}` index** → query uses `user_id` index then scans tenant → **Q6** |
| `customer_otps` indexes | `_id` only | existing 5-min counter in `request-otp` is unindexed too (pre-existing, not CR-093 scope) |

---

## 5. Risk — verified **HIGH** (no change from intake)

| Trigger (prompt §5) | Applies? | Note |
|---|---|---|
| API contract | ✅ | new public route, added to contract v2.1 |
| Auth-adjacent | ✅ | sits in `/scan/auth/*`; phone-enumeration surface |
| Permissions / shared state | ✅ | unauthenticated; rate-limiter state |
| Money / payments | ❌ | — |
| Production data write | ❌ | read-only on `customers` (limiter state aside) |
| Hotspot file (addendum §7) | ❌ | `routers/scan.py` is **not** a listed hotspot |
| Customer data exposure | ⚠️ | exposes `name` for a phone → **CRITICAL only if** rate-limit is absent/weak. Mitigated by design → stays HIGH. |

**Minimum process**: full gate flow + regression checklist (prompt §5 HIGH row). No Fast Lane.
**Owner approval needed** (prompt §7): starting implementation · API contract change · touching auth-adjacent logic (Part C "auth/login/SSO/token flow" — lookup mints **no** token, but is in the auth block; flagged conservatively).

---

## 6. Conflicts & dependencies

| Item | Relationship | Conflict? |
|---|---|---|
| **CR-095** (remove 4 routes, same file `scan.py`) | both edit `scan.py`; lookup lands at ~L303 block, CR-095 deletes L102–175 + L713–808 | ❌ No line overlap. Sequence: 093 first (per §6 rollout). |
| **CR-096** (feedback hybrid, same file) | same file, different block (L816+) | ❌ No overlap. |
| **CR-089** (`skip-otp` guard rails) | would want the **same limiter** | ⚠️ Design choice now (Q5) should be reusable by 089. Not blocking. |
| **CR-085** (phone canonicalisation) | lookup = exact match until 085 | ⚠️ Soft dependency, accepted at intake. Q7 decides input validation. |
| **CR-088** (expose `/api/openapi.json`) | contract v2.1 refresh promised to Customer App | ❌ Not blocking 093. |
| **CR-084** (`dev_otp` leak) | adjacent code (`request-otp`) | ❌ Independent. |
| Customer App §6 step 2 | they wire lookup + drop `skip-otp` on landing | ❌ They are waiting on us. |
| **Env**: `/app/backend/tests/` **missing on this pod** (INC-01 recurrence from baseline 2026-09-08) | QA will need a fresh test file; no existing `/scan` tests to regress against | ⚠️ Flag for QA role; not a CR-093 blocker. |

**Addendum "Do Not Do" check**: does not touch coupon math, loyalty calc, POS ingestion, customer identity/merge (`pos.py`), WhatsApp send, analytics, or auth/login flow (`auth.py`). ✅ None triggered.

---

## 7. Owner decisions required — **OPEN, not assumed**

| # | Decision | Options | Planning recommendation (for owner to accept/reject) |
|---|---|---|---|
| **Q1** | Rate-limit values | (a) 10/min per IP + 5 per 5 min per phone+rid · (b) owner-specified · (c) IP-only | (a) — from intake |
| **Q2** | `name` returned | (a) full stored `name` · (b) first token only | (a) — Customer App trims |
| **Q3** *(new)* | 20 customers have `name:""` | (a) `exists:true, name:null` · (b) `exists:true, name:""` · (c) `exists:false` | (a) — truthful + lets Customer App ask for name |
| **Q4** *(new)* | 18 duplicate `(user_id, phone)` groups | (a) most recently `updated_at` · (b) first inserted · (c) `exists:true, name:null` when >1 match | (a) |
| **Q5** *(new)* | Limiter storage | (a) in-process dict (resets on restart; single-pod OK; **not** shared across replicas) · (b) Mongo collection (new collection, e.g. `scan_lookup_attempts`, TTL index — persistent, multi-replica safe, extra write per call) · (c) `slowapi` (new dependency, in-memory by default) | **No recommendation without owner input** — depends on production topology (addendum §15 Q1: production deployment is UNKNOWN). |
| **Q6** *(new)* | Add compound index `{user_id:1, phone:1}` on `customers` | (a) yes, at startup like `idx_customers_user_tags` · (b) no, rely on tenant scan | (a) — also helps `skip-otp`/`request-otp`/POS lookup. Index-only, no schema change, but touches `customers` → owner approval per Part C. |
| **Q7** *(new)* | Input validation on `phone` | (a) require `^\d{10}$`, else 400 · (b) accept any string, exact match | (a) — matches contract I1 canonical 10-digit; non-conforming strings cannot match 96% of data anyway |

**Not a question (follow existing code)**: 429 raised as `HTTPException` like `request-otp`; `is_blocked` not leaked; rid normalised via existing helper; response in `_resp` envelope; code marker `# CR-093:`.

**Out of scope (noted, not planned here)**: anonymous (no-phone) feedback — belongs to CR-096; raised to owner 2026-10-07 as a possible §4c amendment.

---

## 8. Files — scope lock (preliminary; final at Implementation Plan)

| WILL change | Why |
|---|---|
| `routers/scan.py` | new model + route in C1 auth block (~40–60 LOC) |
| `server.py` | **only if Q6 = (a)** — one `create_index` line next to existing `idx_customers_*` |
| `requirements.txt` | **only if Q5 = (c)** |

| WILL NOT touch | Why |
|---|---|
| `routers/pos.py`, `core/coupon.py`, `core/loyalty.py`, `core/helpers.py` | hotspots, unrelated |
| `routers/auth.py`, `core/auth.py` | no token minted; `verify_customer_token` unchanged |
| `models/schemas.py` | request model lives in `scan.py` like siblings |
| `core/pos_request_logger.py` | **import-only reuse** of IP extraction (if owner agrees); no edit |
| Any frontend file | Customer App is external |

---

## 9. Downstream consumers

| Consumer | Impact |
|---|---|
| Customer App landing / checkout | gains greeting + name prefill; drops `skip-otp` from landing |
| `skip-otp` | unchanged; expected call volume **drops** (fewer junk customers) — positive side effect for CR-089 |
| CRM staff UI | none |
| POS | none |
| Contract v2.1 / OpenAPI | +1 route (CR-088 refresh) |

---

## 10. Verification matrix (draft — finalised in Implementation Plan)

| # | Check | Expect |
|---|---|---|
| V1 | known 10-digit phone + valid rid | `200 {exists:true, name:"<stored>"}` |
| V2 | unknown phone | `200 {exists:false, name:null}`; **no new `customers` doc** |
| V3 | known phone, wrong rid | `exists:false` (tenant isolation) |
| V4 | `name:""` customer | per Q3 |
| V5 | duplicate-phone tenant | per Q4 |
| V6 | > limit per IP | `429` |
| V7 | > limit per phone+rid | `429` |
| V8 | malformed phone | per Q7 |
| V9 | `is_blocked:true` customer | `exists:true`, no block flag in body |
| V10 | response has no `points/tier/wallet/id/email` | fields absent |
| V11 | existing `/scan/auth/request-otp`, `verify-otp`, `skip-otp`, `login`, `register` | unchanged (regression) |
| V12 | `customers` count before == after full matrix | equality |

---

## 11. Planning output (prompt §8 Role 2 format)

```text
Planning complete: CR-093
Stage: Impact Analysis
Code reality: NONE
Risk: HIGH
Files WILL change: routers/scan.py (+ server.py if Q6=a; + requirements.txt if Q5=c)
Files WILL NOT touch: routers/pos.py, core/coupon.py, core/loyalty.py, core/helpers.py, routers/auth.py, core/auth.py, models/schemas.py, frontend/*
Owner decisions: Q1–Q7 OPEN (see §7)
Docs: planning/CR_093_IMPACT_ANALYSIS.md
Next: Owner answers Q1–Q7 → Implementation Plan → Gate approval
```

---

## 8. Owner rulings update — 2026-10-08
| Q | Ruling | Status |
|---|---|---|
| Q1, Q2, Q5 | as agreed 2026-10-07 | FINAL |
| Q3 blank name | return `name: null` | **FINAL** |
| Q4 duplicate phone | return **oldest** (`created_at` asc). Owner asked *why* duplicates exist → CRM-side: CSV importer double-inserts same phone in one file + never writes `country_code`, so sync F11 dedup `{user_id, phone, country_code}` misses it; POS held one record. Blank-phone groups: POS walk-in `6759` + CRM order-webhook re-create. Import bugs to be registered **later** (owner). | ⏳ pending owner nod on "oldest" |
| Q6 index | add `customers {user_id, phone}` non-unique | **FINAL** |
| Q7 phone format | Owner direction: POS sends `country_code` + digits-only `phone` **separately**; CRM accepts as sent; `lookup` takes `{phone, country_code? (default "+91"), restaurant_id}` and matches `{user_id, phone, country_code}`. Strict digits-only `phone`; `country_code` `^\+\d{1,4}$`. Foreign diners (r541: 143) become findable once POS splits the fields (CR-085). | ⏳ pending owner nod on shape |
| New | **CR-098** registered: retire `POST /scan/auth/register` + `/login` (password). Ships with 093. | — |
| Dates | 093 + 098 **w/c 13 Oct 2026**; 096 w/c 27 Oct (after 085) | owner-committed |
Reply draft to Scan & Order: `handoff/CRM_REPLY_TO_SCAN_ORDER_QA_IDENTITY_PATH_2026_10_08.md`.

## 9. Owner Q (2026-10-08): "as of today's code, can duplicates still happen, and can I reproduce?" — YES, 4 live gaps
| # | Live gap (current code) | Repro on preprod |
|---|---|---|
| G1 | CSV importer: same phone on two rows → two inserts. `phone_to_doc` built once (`customers.py:1600`), never updated per row; both rows classified `new` → two `InsertOne` (`:1648-1663`). | Import CSV with rows `A,9000000001` and `B,9000000001` → 2 customers |
| G2 | CSV importer writes **no `country_code`** (`new_doc` `:1648`). Sync F11 dedup needs `{user_id, phone, country_code}` (`:456-460`) → no match → sync inserts a second record for the same phone. | Import `A,<phone that exists in POS>` → run Sync Customers → 2 customers |
| G3 | Order webhook matches `phone` **exact string** and creates with `+91` (`pos.py:1737-1757`). Blank or differently-formatted phone → new record. | `POST /api/pos/webhook` `customer_phone:""` → "Customer " created; or `customer_phone:"+91 9000000002"` when CRM holds `9000000002` → 2nd record |
| G4 | Format mismatch across channels: `skip-otp` stores digits (`9000000003`); POS sync delivers whatever staff typed (`+91 90000 00003`) → different strings → 2 records. | `skip-otp {phone:"9000000003"}` then sync a POS customer typed as `+91 90000 00003` |
No channel normalises phone except the importer's own validator (which then forgets `country_code`). POS held one record in every real-phone duplicate group; the extras were CRM-made.

## 10. Q7 — present wire shape per channel vs change needed from POS
| Channel | Present shape (what arrives) | CRM today | Change needed (POS) |
|---|---|---|---|
| Customer sync (CRM pulls MyGenie list) | object has `phone` (free text as typed: `"+61 404668073"`, `"95034 05081"`, `"0000000000"`) **and** `country_code` (always `"+91"`/null) | copies `phone` verbatim; `country_code` → `+91` if null | `phone` = digits only, validated at entry; `country_code` = real dial code (`+61`), never a constant |
| Order/payment webhook `POST /api/pos/webhook` | `customer_phone` only — **no country code field** | hardcodes `country_code:"+91"` | add `country_code`; send `customer_phone` digits only |
| `POST /api/pos/customers` | `phone` + `country_code` (default `+91`) | stores as sent, exact-string dedup | same: digits-only `phone`, real `country_code` |
| `POST /api/pos/customer-lookup` | `phone` only | exact-string match | add `country_code`; digits-only `phone` |
CRM side (CR-085): accept as sent, validate `phone` `^\d{6,15}$` + `country_code` `^\+\d{1,4}$`, store both, dedup/match on `{user_id, phone, country_code}` on **every** channel (today only sync does). `lookup` (CR-093) adopts the same shape on day one.

### 10a. Owner correction (2026-10-08): "POS already sends country_code + phone; the gap is at CRM end" — AGREED
POS sync and `POST /api/pos/customers` already deliver `phone` and `country_code` separately. Webhook and customer-lookup send `phone` only (CRM defaults `+91`; not a duplicate cause). Dirty `phone` content is staff typing, but **CRM chooses to store it verbatim** — that is our gap. All five fixes (normalise on every write path · importer `country_code` · importer double-insert · one dedup key everywhere · no create on blank phone) are CRM-only = **CR-085 scope, zero POS dependency**. POS ask downgraded to optional (add `country_code` to webhook + lookup). CR-093 `lookup` has **no POS dependency**.
