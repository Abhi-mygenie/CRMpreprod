# Batch Fix Recurrence Validation — "If the same bad input arrives again, what happens now?"
**Date**: 2026-10-10 · **Role**: Investigation (read-only; code traced on preprod branch `8oct` + batch CRs; data facts from prod read-only) · **No code changes. No data writes.**

Companion to `PROD_DB_INVESTIGATION_2026_10_09.md` (production data only). This doc answers four owner questions:
1. With the recent batch fixes, what happens if the same issues come again?
2. How do we ensure they do not come again?
3. Where are we logging such issues today — and where are we not?
4. What validation is needed at Scan & Order, the Order (webhook/sync) path, and the POS agent?

Legend for verdicts: 🟢 **BLOCKED** (cannot be written) · 🟡 **FLAGGED** (written, but marked and excluded from matching) · 🔴 **STILL LEAKS** (written silently, same as before) · ⚪ **N/A** (path cannot receive this input).

> ⚠️ Everything below describes the **batch code (preprod)**. **None of it is on production yet** — prod still runs pre-CR-085 code and is still creating null-cc customers and orphan orders (see prod report Findings 3/4/6).

---

## 0. Write paths (the 7 doors into `customers` / `orders`)

| ID | Path | File:line (batch code) | Phone handling today |
|---|---|---|---|
| **W1** | Realtime order `POST /pos/orders` | `routers/pos.py:684-688` `_find_or_create_customer` | `normalize_phone` → invalid/blank → **guest order** (`customer_id:null`, `guest_order:true`) · `pos_customer_id` match first |
| **W2** | Payment webhook `POST /pos/webhook/payment-received` | `pos.py:1798-1820` | `normalize_phone` → invalid → guest response, **no customer, no order write** |
| **W3/W4** | POS customer create/update `POST/PUT /pos/customers` | `pos.py:224-252, 404-413` | normalise; invalid → stored with `phone_invalid:true` (POS never blocked) |
| **W5** | POS `customer-lookup` | `pos.py:2113-2118` | invalid or `phone_invalid` record → not found |
| **W8** | `customer_sync` (POS master → CRM) | `routers/customers.py:371-379, 457-528` | normalise; invalid → `phone_invalid:true`; F11 dedup `phone_match` before insert |
| **W11** | CSV importer `POST /customers/import` | `customers.py:100-117, 1631` | own validator (10 digits, isdigit) + `country_code:"+91"` — **does not call `normalize_phone`** |
| **W13/W14** | Scan `skip-otp` / `lookup` | `routers/scan.py:185-224, 259-266` | normalise; invalid → **400**; rate-limited; skip-otp find-or-create; lookup read-only |
| **W15** | `order_sync` (POS orders → CRM) | `routers/migration.py:209-224` | match by `pos_customer_id` then `phone_match`; **never creates a customer** → `customer_id:null` |
| **UI** | CRM `POST/PUT /customers` | `customers.py:802-805, 1812-1818` | normalise; invalid → 400; dedup |

---

## 1. Recurrence matrix — same input arrives again

### 1.1 Junk phone (`0000000000`, `1111111111`, `5555555555`, 11-digit `99908183420`, blank)

| Door | Verdict | What happens now |
|---|---|---|
| W1 realtime order | 🟡 → guest | Order saved with `customer_id:null`, `guest_order:true`, `guest_reason:"invalid_phone"`. No customer, no points, no WhatsApp. Invoice still generated. |
| W2 payment webhook | 🟢 | Returns `guest_order:true`; nothing written to `customers`. (Nothing written to `orders` either — see §3 gap L-2.) |
| W3/W4 POS customer API | 🟡 | Customer stored with `phone_invalid:true`; hidden from W5 lookup and scan lookup. |
| W8 customer_sync | 🟡 | Same as W3: stored + flagged. **Prod evidence: 29/32 junk docs came through this door** — they will keep arriving from the POS master on every sync, flagged but present. |
| W11 CSV importer | 🔴 **STILL LEAKS** | `_validate_and_classify_row` accepts any 10-digit string: `0000000000`, `1111111111` pass (`isdigit`, `len==10`). Only `+91`/12-digit strip is handled; `0` prefix 11-digit rejected by length. No `phone_invalid` flag, no `normalize_phone`. → **gap G-1** |
| W13 skip-otp / W14 lookup | 🟢 | 400 `Invalid phone or country_code`. |
| UI create/update | 🟢 | 400. |
| W15 order_sync | 🟡 | Order saved `customer_id:null` (invalid phone can't match). Not flagged as guest (no `guest_order` key). → **gap G-3** (no way to tell "invalid phone" from "no customer yet"). |

### 1.2 Duplicate customer (same `user_id + phone`, second insert)

| Door | Verdict | What happens now |
|---|---|---|
| W1 / W2 / W3 / W8 / W13 / UI | 🟢 (single-request) | Every door runs `find_one(phone_match(...))` before insert; CR-100 also matches legacy null/"" cc. |
| **Any door, concurrent** | 🔴 **STILL LEAKS** | No **unique index** on `(user_id, phone, country_code)` — only the non-unique CR-093 `{user_id, phone}` index. Two tills posting the same new diner within the same ~50 ms (or sync + realtime overlapping) will both pass `find_one` and both insert. Prod evidence: 100/187 dup groups were created same-day (importer double-insert era), 0 new groups in Oct — so low frequency, but not structurally impossible. → **gap G-2** |
| W11 CSV importer | 🟢 | In-file dup → 400 (BUG-013); existing phone → update not insert. But matches on raw `phone` string only, not `phone_match` → a file with `+919876543210` vs stored `9876543210` is normalised by the importer's own strip, OK; `09876543210` (11 digits) → rejected. Acceptable. |

### 1.3 Null / empty `country_code`

| Door | Verdict |
|---|---|
| All write doors (W1, W2, W3/4, W8, W11, W13, UI) | 🟢 | Every insert sets `country_code` from `normalize_phone` (default `+91`); W11 hard-codes `+91`. |
| Read side for the 609 legacy docs | 🟡 handled | CR-100 `phone_match` treats `+91`/`null`/`""` as one identity → no new twin is created when the legacy diner returns. Data itself fixed in CR-085-B. |
| **Foreign numbers via W8** | 🟡 | If POS master sends `country_code:""` with a UK number, `normalize_phone` defaults to `+91` and flags invalid (10-digit rule). Acceptable; flagged. |

### 1.4 Orphan orders (order arrives, no customer doc exists)

| Door | Verdict | What happens now |
|---|---|---|
| W1 realtime, **valid** phone, no customer | 🟢 | Customer auto-created (`Customer XXXX`), order linked. (Prod: 0 realtime orphans ever.) |
| W1 realtime, blank/invalid phone | 🟡 by design | Guest order (`guest_order:true`). **This will increase the raw `customer_id:null` count after deploy — the orphan KPI must exclude `guest_order:true`.** |
| W15 order_sync, `pos_customer_id` present, customer not yet synced | 🔴 **STILL LEAKS** | `customer_id:null`, no stub created, no counter incremented. Linked only if a later `customer_sync` runs **and** a backfill re-links old orders (there is no re-link step today — `order_sync` only updates `customer_id` when it re-processes the same order: `migration.py:289-303`). This is exactly the 9,924 / ₹2.15 cr segment. **CR-086 Part C not implemented.** |
| W15 order_sync, blank phone + no `pos_customer_id` | ⚪ correct | Anonymous till bill. Stays null forever; 209k on prod. Nothing to fix in CRM; only POS can attach a customer at billing time. |
| Ordering of syncs | 🔴 | UI lets a tenant run `order_sync` before `customer_sync`; nothing enforces order. → **gap G-4** |

### 1.5 Stale `mygenie_token` → sync 401

| Scenario | Verdict | What happens now |
|---|---|---|
| Token expired on POS side, tenant triggers sync | 🟡 logged | `migration_sync_logs` row `status:"failed", error:"API error on page N: 401"`, in-memory `sync_status` shows failed. UI shows failure on the Migration page only while the tenant is looking. No retry, no alert, no token refresh. |
| 401 **mid-run** (seen at page 45/147/329/499/1733 on prod) | 🔴 partial | Sync stops; earlier pages written, later pages missing; `status:"failed"` but `synced_count` looks healthy. No "resume from page N". → **gap G-5** |
| Token refresh | ⚪ | Only path is the restaurant logging into CRM (`auth.py:369`). CRM stores only `password_hash`, cannot re-login on the tenant's behalf. CR-110 script requires the owner's shared password → operational, not structural. |

### 1.6 Coupon code with trailing space / lowercase

| Door | Verdict |
|---|---|
| Coupon create/update (`coupons.py`, `pos_coupons.py`) | 🟢 | `.strip().upper()` at write (CR-109). |
| Validate (`/pos/coupons/validate`, `/scan/coupons/validate`) | 🟢 | normalised before lookup (CR-108/109). Prod data already clean. |

---

## 2. How to make sure it does not come back (structural, not procedural)

| # | Gap | Proposal (register as CR; no code now) | Size |
|---|---|---|---|
| **G-1** | CSV importer accepts junk 10-digit phones; no `phone_invalid`, bypasses `normalize_phone` | Replace `_validate_and_classify_row` phone block with `normalize_phone`; `invalid` → row error (importer is operator-facing, so **reject**, Option A like UI). Also use `phone_match` for the update/new decision. | ~15 lines `customers.py` + 3 tests |
| **G-2** | No DB-level uniqueness → concurrent double-insert possible | After CR-085-B/087 clear the 187 groups: **unique partial index** `{user_id:1, phone:1, country_code:1}` with `partialFilterExpression: {phone: {$type:"string", $ne:""}}`; wrap inserts in `try/except DuplicateKeyError → re-find`. This is the only guarantee that survives new code paths. | index + 6 insert sites |
| **G-3** | `order_sync` writes `customer_id:null` without saying why | Add `link_status` on sync-written orders: `linked` / `unlinked_no_customer` / `unlinked_invalid_phone` / `anonymous`; add counters `unlinked_count`, `anonymous_count`, `invalid_phone_count` to the `migration_sync_logs` row. Realtime already has `guest_order/guest_reason` — mirror it. | ~20 lines `migration.py` |
| **G-4** | `order_sync` never creates the customer; sync order not enforced | **CR-086 Part C** (owner Q3=a pending): when `pos_customer_id` or valid phone present and no customer → create stub (`notes:"Auto-created via order sync"`, no points). Plus: `POST /migration/sync-orders` refuses (409) if `customer_sync` has never completed for the tenant, or auto-chains customer_sync → order_sync. Plus one-time **backfill** (CR-087) linking existing orphans by `pos_customer_id` then `phone_match`. | ~30 lines + backfill script |
| **G-5** | 401 mid-run → silent partial sync; no refresh, no alert | (a) On 401: mark `users.mygenie_token_invalid:true`, surface a banner "Re-login to CRM to refresh POS connection" on Dashboard; (b) persist `last_completed_page` so a re-run resumes; (c) ask POS for a **non-expiring server-to-server credential** (api_key-based) for `/order/list` + `/customer/list` so sync does not depend on a human login (POS agent item P-8). | CRM ~25 lines; POS contract item |
| **G-6** | KPI drift after CR-085-A2 deploy | Define the orphan KPI as `customer_id:null AND guest_order:{$ne:true} AND (pos_customer_id present OR cust_mobile present)`; add to PROC-001 validation query set. | docs/query only |
| **G-7** | Junk numbers live in the POS customer master and re-import every sync | POS to validate phone at customer create in POS (same rule: 10 digits, starts 6–9, not all-same). Until then CRM flags (W8) — acceptable. | POS agent item P-9 |
| **G-8** | CR-110 selector wrong (`dp_live_` test) | Re-scope script: select `last_login < now-60d` **or** latest `migration_sync_logs.error` matches `401`. Run per-tenant with owner confirmation. | script edit |

Priority: **G-4 + G-3** (closes the ₹2.15 cr segment and makes it measurable) → **G-1** (only remaining silent junk door) → **G-2** (structural guarantee, after cleanup) → **G-5/G-8** (token resilience) → G-6/G-7 (docs/POS).

---

## 3. Logging audit — where each issue is visible today

| Issue | Persisted (queryable) | Ephemeral (uvicorn / supervisor log) | **Not logged anywhere** |
|---|---|---|---|
| Invalid phone on realtime order (W1) | `orders.guest_order/guest_reason` ✅ · `loyalty_mismatch_logs` only if points mismatch | `warning loyalty_redeem_skipped_guest`, `wallet_used_on_guest_order` (only when loyalty/wallet touched) | plain guest order with no loyalty → **no log line**, only the order flag |
| Invalid phone on payment webhook (W2) | ❌ nothing — response only | ❌ | **L-2**: a guest `payment-received` leaves **zero trace** in DB (no order, no log). Coupon usage *is* recorded with `customer_id:null`. |
| Invalid phone from POS customer API / sync (W3/W8) | `customers.phone_invalid:true` ✅ | `customer_sync … phone=%r` info line per record | no per-run count of flagged records in `migration_sync_logs` |
| Invalid phone at importer (W11) | `import_logs.errors[]` ✅ (for rows it rejects) | — | junk that passes (G-1) is invisible |
| Invalid phone at skip-otp / lookup (W13/14) | `scan_lookup_attempts` (rate-limit buckets only, TTL) | 400 appears only as access-log line | **no record of rejected phones** (fine for privacy; but no "Customer App sends bad data" metric) |
| Duplicate insert prevented | ❌ | `customer_sync F11 phone+country_code dedup matched …` info (sync only) | realtime/UI/skip-otp dedup hits are silent |
| Duplicate insert **not** prevented (race) | ❌ | ❌ | **only discoverable by aggregation** (as done in prod report) |
| Orphan order written by `order_sync` | the order itself (`customer_id:null`) | ❌ | **L-1**: no counter, no reason, no log line |
| Sync failed / 401 | `migration_sync_logs.status/error` ✅ · in-memory `sync_status` | `logger.exception` on per-record failures | no alert, no tenant-facing banner after page reload, no `users` flag |
| Coupon code normalised at write | ❌ | ❌ | not needed |
| Raw POS payloads (for forensics) | `pos_request_logs` — **disabled** (`POS_REQUEST_LOGGING_ENABLED=false`; collection absent on prod) | access log only | cannot replay what POS actually sent for any of the 219k orphans |

**Where logs physically are**: `/var/log/supervisor/backend.err.log` (uvicorn + `logging` module, rotated by supervisor, not shipped anywhere); Mongo collections listed in prod report Finding 8. There is **no data-quality dashboard, no alerting, no daily job** that counts guest orders / flagged phones / unlinked orders. `cron_job_logs` exists but `daily_loyalty_jobs` last ran 2026-05-26 (already surfaced to owner).

**Minimum logging additions (fold into G-3/G-5):** `migration_sync_logs` += `{unlinked_count, anonymous_count, invalid_phone_count, flagged_phone_count, dedup_hits}`; `users` += `mygenie_token_invalid`; W2 guest → write a `pos_guest_events` row (or at least a `warning` line) so the payment is traceable; consider `POS_REQUEST_LOGGING_ENABLED=true` with `SAMPLE_RATE=0.1` on prod for 30 days (TTL exists) to get payload forensics.

---

## 4. Validation checklist per consumer

### 4.1 Scan & Order agent (Customer App) — doors W13/W14 + `/scan/feedback`, `/scan/coupons/validate`
Already **BLOCKED** at CRM for bad phone (400) and rate-limited. The remaining risk is UX and identity-splitting, not data corruption.

| # | They must | Why |
|---|---|---|
| S-1 | Send `country_code` on every identity call (`skip-otp`, `lookup`, `feedback`) — contract v1.1 | Without it CRM defaults `+91`; a `+44` diner would be flagged invalid |
| S-2 | Send phone **digits only**, no `+91`, no leading `0`, no spaces (CRM normalises, but canonical input keeps limiter buckets and logs clean) | BUG-025 lesson |
| S-3 | Handle `400 Invalid phone or country_code` with an inline message, never retry-loop (limiter 5/5 min per phone) | avoids self-inflicted 429 |
| S-4 | Treat `lookup → 404` as "new diner", then `skip-otp` (find-or-create) — never call `skip-otp` twice in parallel for one phone | the only client-side way to trigger the G-2 race |
| S-5 | Never create a customer client-side or cache a `customer_id` across restaurants | tenant scope is `user_id + phone` |
| S-6 | Validate against the published OpenAPI (`/api/openapi.json`, CR-088) after each CRM release | contract drift |

### 4.2 Order path (realtime `POST /pos/orders` + `payment-received` + `order_sync`) — doors W1/W2/W15
This is where the money leaks. Validation owned by CRM, inputs owned by POS.

| # | Must hold | Where enforced today | Gap |
|---|---|---|---|
| O-1 | Every order carries `restaurant_id`, `pos_id`, unique `order_id` | `_validate_order` ✅ (pos.py:641-660) | — |
| O-2 | `user_id` (POS customer id) sent whenever a customer was attached to the bill | POS side | prod: 9,907 orphans have `pos_customer_id` but CRM had no customer → **G-4** |
| O-3 | `cust_mobile` canonical or blank — never `0000000000` as "no customer" | CRM normalises → guest ✅ | POS should send blank, not junk (P-9) |
| O-4 | Blank/invalid phone → **guest order**, never a `Customer ` doc with `phone:""` | ✅ CR-085-A2 (preprod) | prod still creates them (78 docs) until deploy |
| O-5 | Sync-written order must record **why** it is unlinked | ❌ | G-3 |
| O-6 | `order_sync` must not run before `customer_sync` has completed at least once | ❌ | G-4 |
| O-7 | Orders that arrive before their customer must be **re-linked** when the customer appears | ❌ (only on re-processing same order) | G-4 backfill |
| O-8 | A 401 mid-sync must leave a resumable, visible state | partial ❌ | G-5 |
| O-9 | Orphan KPI query excludes `guest_order:true` and anonymous bills | docs | G-6 / PROC-001 |

### 4.3 POS agent — doors W3/W4/W5/W8 + sync credentials

| # | Ask (for the POS brief) | Reason / evidence |
|---|---|---|
| P-8 | Provide a **server-to-server credential** (CRM `api_key`-based or long-lived token) accepted by `/order/list` and `/customer/list`, so CRM sync does not depend on a staff login session | 35/37 prod sync failures are 401; 14 tenants dormant since Mar–May 2026 |
| P-9 | Validate phone at POS customer create (10 digits, starts 6–9, not all-same digit, optional `country_code`) **or** send blank instead of a placeholder | 29/32 junk phones on prod came from the POS master via sync; they re-import every run |
| P-10 | Always include `country_code` in `/customer/list` payload (ISO `+NN`) | 609 null-cc docs; CRM defaults `+91` otherwise |
| P-11 | On the bill, if a customer was selected in POS, send **both** `user_id` and `user.phone` in order payloads (realtime and `/order/list`) | 17 orphans have pid but blank phone; 9,907 have both but arrived before customer sync |
| P-12 | Confirm what `cust_mobile:""` on 209k orders means (walk-in with no customer) so CRM can classify them `anonymous` and stop counting them as a defect | 95.5% of orphans; ₹7.71 cr; CAFE 103 = 15,844 of 15,865 |
| P-13 | Validate CR-085-A2 behaviour (already in `CRM_TO_POS_CR085A_A2_LIVE_PLEASE_VALIDATE_2026_10_09.md`): invalid phone → `guest_order:true` in response; `customer-lookup` hides flagged records | pending POS validation |
| P-14 | Confirm whether POS can **dedupe its own master** (same phone twice per restaurant) — else CRM keeps 100+ same-day dup groups re-appearing on sync until G-2 index exists | prod: 100/187 dup groups same-day |

---

## 5. Verdict summary

| Finding | Same input again (batch code) | Structural guarantee exists? | Logged? |
|---|---|---|---|
| Junk phone | 🟢 UI/scan · 🟡 POS/sync (flag) · 🟡 realtime (guest) · **🔴 CSV importer** | No (G-1) | partial (flag / guest key); W2 none |
| Duplicates | 🟢 per request · **🔴 concurrent** | **No** (G-2 unique index) | no |
| Null cc | 🟢 all doors | yes (helper on all 15 write points) | n/a |
| Orphan orders | 🟢 realtime valid · 🟡 realtime invalid (guest, by design) · **🔴 order_sync** | **No** (G-3/G-4, CR-086 Part C) | **no** (L-1) |
| Stale token | 🟡 logged failure · **🔴 mid-run partial** | No (G-5/P-8) | `migration_sync_logs` only |
| Coupon spaces | 🟢 | yes (write-time strip) | n/a |

**Bottom line:** the batch closed every **human-facing** door (CRM UI, Customer App) and made POS-facing doors **flag instead of corrupt**. Three doors still leak silently: **CSV importer junk phones**, **concurrent double-insert**, and — the only one with money on it — **`order_sync` orphans (₹2.15 cr recoverable, ₹7.71 cr anonymous by nature)**. None of the fixes are on production yet.

**Owner rulings 2026-10-10** (see `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md`): CSV validation at CRM side ✅ (CR-111) · order-sync anonymous orphans accepted as not-a-defect (only customer-exists backfill + POS P-15 ID-space question remain) · concurrent dups → POS contract + CRM daily data-quality log (CR-113) · new POS ask **P-15**: is `order.user_id` the same ID space as `/customer/list.id`? (Palm group: 0/3,000 ids match after completed syncs).

**Proposed registrations (INTAKE, owner approval):** CR-111 importer `normalize_phone` (G-1) · CR-112 unique partial index + DuplicateKey handling (G-2, after 085-B/087) · CR-113 sync link-status + counters + guest-webhook trace (G-3, L-1, L-2) · CR-086 Part C + sync-order guard + backfill (G-4; Q3=a pending) · CR-114 401 resilience (G-5) · CR-110 selector fix (G-8) · POS brief P-8…P-14 · PROC-001 += orphan KPI definition (G-6).
