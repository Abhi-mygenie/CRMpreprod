# Production DB Investigation Report (PRODUCTION DATA ONLY)
**Date**: 2026-10-09 · **Refreshed**: 2026-10-10 (re-probed, corrections marked ⚠️) · **Role**: Investigation Agent · **DB**: Production `mygenie_db` via read-only user · **No code changes. No data writes.**

> Scope of this file: **what is in the production database today.** Code behaviour, recurrence analysis, logging audit and consumer validation live in the companion doc `BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md`.

---

## Connection confirmed
- `MONGO_URL`: `mongodb+srv://mygenie_mongo_readonly@mygenie.xdqqdpi.mongodb.net/mygenie_db`
- Backend: `Application startup complete` (index creation skipped — read-only user, expected)
- DB is **live** — counts move between probes (POS till traffic + nightly syncs). Latest activity seen: `migration_sync_logs` 2026-10-10 11:31 UTC, `users.last_login` 2026-10-10 11:31 UTC.

---

## Baseline (2026-10-09 probe)

| Collection | Count |
|---|---|
| customers | 24,068 → 24,130 (10-10) |
| orders | 325,806 → 326,543 (10-10) |
| coupons | 17 |
| loyalty_settings | 89 |
| users | 89 (90 incl. 1 doc without token) |
| points_transactions | 11,623 |
| feedback | 19 |
| invoices | 49,994 |

Orders by write path: `pos_id:"mygenie"` (order sync) **276,783** · `pos_id:"0001"` (realtime `/pos/orders`) **49,260** · `pos_id:null` 500.

---

## Finding 1 — Junk phones: **71 records** by pattern · **630 invalid by full CRM rule** (top-pattern subset probed: 32)

> ⚠️ 2026-10-10: applying `normalize_phone` (10 digits, starts 6–9, not all-same) to all prod customers gives **630 invalid**, of which ~540 came from the POS master. The extra ~560 are foreign numbers without `+cc` (Palm House 54+), 9/11-digit typos (Aura 19), and room/table numbers typed as phone (Craft, Cold Rock). Categories J/F/T/S/B and per-restaurant table → `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md` §Q2.

- **First**: 2023-07-12 · phone `5555555555` · **Last**: 2026-09-30 · phone `0000000000`
- **Top tenants**: r541 (13) · r383 (5) · r595 (4) · r523/478/509/661/788/408 (3 each) · 15 more
- ⚠️ **Origin (new)**: 29 of 32 probed junk docs carry `pos_customer_id` → they were **imported from POS by `customer_sync`**, i.e. the junk number exists in the POS customer master. Still arriving: 2026-07 (2), 2026-08 (1), 2026-09 (3).
- 32 junk customers hold **102 orders**. `phone_invalid` flag count on prod = **0** (CR-085-A not deployed).

**Action (CR-085-B):** Set `phone_invalid: true` on 71 docs. No deletion. Orders preserved. **Upstream**: POS master still contains these numbers (see companion doc §4 POS validation).

---

## Finding 2 — Duplicate customers

⚠️ Corrected counts (keyed on `user_id + phone`, phone non-blank):

| Group type | Groups | Meaning |
|---|---|---|
| Same `country_code` (true duplicates) | **118** | double-insert |
| `country_code` twins (`null`/`""` vs `+91`) | **69** | CR-100 twins — matched together at read time now, still two docs |
| **Total** | **187** | (earlier "44" counted only +91/+91 groups with data) |

- **100 / 187 groups were created on the same calendar day** → importer / sync double-insert signature (root cause recorded 2026-10-08: importer double-insert, no normalisation on write).
- Newest member created: 2026-07 (68 groups), 2026-08 (10), 2026-09 (7), 2026-10 (0 so far).
- Key groups with real data: `+91 7505242126` @ Brew ("abhi" 2023 vs blank 2026) · `+91 9876500001` @ 18march ("Customer 2" 243 pts / 10 visits vs "Test User" 100 pts) · `+91 8369699265` @ Jeh's Nest ("jayshree" 22 visits vs 0 visits). Most duplicates: 0 points, 0 visits.
- Most affected: Jeh's Nest (6) · Brew (5) · Cafe Flora (2) (+91/+91 groups).

**Action (CR-087):** Dry-run report per tenant → owner sign-off → keep-oldest, transfer data, delete extras. Twins (69) fold into CR-085-B cc fix first, then re-count.

---

## Finding 3 — Null/empty country_code: **609**

| Type | Count |
|---|---|
| key missing / `null` | 327 |
| `""` | 282 |

- Created by month: 2026-06 (15) · **2026-07 (211) · 2026-08 (302)** · 2026-09 (66) · 2026-10 (9) — **still being created on prod** (code fix not deployed).
- ⚠️ Origin: only **10 / 609** have `pos_customer_id` → not from `customer_sync`. Field-shape analysis: ~70% have the CSV-importer shape (`tags`, `whatsapp_opt_in`, `last_visit`, `avg_order_value`, no POS fields) = **pre-CR-085 importer (W11) dropped `country_code`**; ~30% have the full CRM-UI/realtime document shape (`gender`, `referral_code`, `pos_synced`…) = pre-CR-085 realtime/UI create.
- 262 of them have `total_visits > 0` (real diners). Sample doc has an **11-digit phone** `99908183420` (also invalid).
- Top tenants: r635 (184) · r792 (143) · r689 (135) · r687 (77) · r644 (31).

**Action (CR-085-B):** Set `country_code: "+91"` where null/empty (India-only confirmation per owner). CR-100 already matches them tolerantly at read time.

---

## Finding 4 — Orphan orders: **219,100 / 326,543 (67.1%)** ⚠️ LARGEST FINDING — **RE-CLASSIFIED**

Earlier line "All have phone (linkable) ✅" was **wrong**. Re-probe:

| Segment | Orders | Order value | Recoverable? |
|---|---|---|---|
| Blank phone **and** no `pos_customer_id` (anonymous walk-in bills) | **209,176 (95.5%)** | **₹7.71 cr** | ❌ Never — POS had no customer on the bill |
| Has `pos_customer_id` **and** phone | **9,907 (4.5%)** | **₹2.14 cr** | ✅ via customer sync (pos_customer_id or phone match) |
| Blank phone, has `pos_customer_id` | 17 | ₹18,783 | ✅ via pos_customer_id |
| Has phone, no `pos_customer_id` | 0 | — | — |
| **Total** | **219,100** | **₹9.86 cr** | **₹2.15 cr recoverable** |

- **100% of orphan orders came from `order_sync` (`pos_id:"mygenie"`). 0 orphan orders from realtime `/pos/orders`** (49,260 realtime orders, 30,843 since Sep — all linked, because pre-CR-085 realtime code auto-creates a customer for any phone, including blank → the 78 `phone:""` customer docs).
- Orphans still being written: 2026-06 17,764 · 2026-07 10,209 · 2026-08 3,637 · 2026-09 2,046 · 2026-10 206 (all blank-phone). Latest: 2026-10-07 @ r595.
- Of the recoverable 9,924 (sample 200): **15% already have a matching customer in CRM today** (customer synced *after* the order) → linkable immediately by a backfill; 85% need `customer_sync` to run first.
- Sample of orphans **with** phone (300): 9% linkable now · 13% invalid phone (junk) · 78% no customer doc yet.

Top 5 tenants (re-split):

| Restaurant | Orphan orders | Anonymous (no phone/no pid) | Recoverable |
|---|---|---|---|
| Pav & Pages Book Cafe | 67,688 | ≈ all | — |
| Cold Rock Cafe | 19,301 | ≈ all | — |
| **CAFE 103** (r644) | **15,865** | **15,844 / ₹1.63 cr** | **21 / ₹23,163** |
| The Palm House | 14,871 | ≈ all | — |
| The Craft Restaurant | 12,976 | ≈ all | — |

Per-restaurant split of the recoverable 9,924 (Bamboo Yoga ₹1.64 cr alone; Brew 391/391 linkable now; Palm group POS-id mismatch) → `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md` §Q1.

**Interpretation:** ₹7.71 cr is **not "invisible customer revenue"** — it is anonymous till revenue that was never attached to a customer in POS. The CRM-recoverable figure is **₹2.15 cr / 9,924 orders**.

**Action (CR-086 + CR-087):** customer sync for affected tenants → backfill link by `pos_customer_id` then phone → CR-086 Part C so future syncs create the stub customer. Anonymous bills stay `customer_id:null` (and after CR-085-A2 deploy, realtime invalid-phone bills become `guest_order:true` **by design** — exclude them from the orphan KPI).

---

## Finding 5 — Coupon trailing spaces: **0** ✅
Production coupons clean. CR-108/109 not deployed; nothing to fix in data.

---

## Finding 6 — Batch CRs not yet deployed to prod (expected)

| CR | Evidence in prod data |
|---|---|
| CR-085-A/A2 | `phone_invalid` 0 docs · `guest_order` 0 orders · null-cc still created in Oct |
| CR-082 | no `requires_customer` on coupons (defaults `True`, backward-compat ✅) |
| CR-104 | 0 bonus txns |
| CR-093/089 | no `scan_lookup_attempts` collection |
| CR-109 | n/a (data already clean) |

---

## Finding 7 — MyGenie tokens ⚠️ **CORRECTED**

Earlier line "ALL 89 stale (non-`dp_live_`)" used the wrong test: `dp_live_` is the **CRM `api_key`** format (`core/auth.py:46`), not `mygenie_token`. `mygenie_token` is a MyGenie Bearer session token, refreshed on every CRM login (`routers/auth.py:369`).

Actual state:
- 89 / 90 users have a `mygenie_token`; **25 tenants logged in during Oct-2026**, 13 in Sep, 13 in Aug; 5 last logged in Mar-2026.
- `migration_sync_logs`: **11 tenants completed syncs in Oct-2026** with stored tokens → tokens are valid for recently-logged-in tenants.
- Sync failures all-time: 37, of which **35 = `API error on page N: 401`** (incl. mid-run failures at page 45 / 147 / 329 / 499 / 1733 → partial syncs). Last 401: 2026-10-01. 2 tenants failed since Sep.
- Token age = time since that restaurant's last CRM login. Tenants that never log in (Mar/Apr/May cohort, 14) **will** 401 on any sync.

**Action**: CR-110 script (`/app/scripts/push_and_refresh_tokens.py`) **must be re-targeted** — its stale filter (`mygenie_token` not starting with `dp_live_`) selects *every* tenant. Use `last_login < cutoff` or "last sync failed 401" as the selector. Needs owner password confirmation; preprod-only until then.

---

## Finding 8 — Log collections present on prod (for companion doc §3)

| Collection | Docs | Latest | Note |
|---|---|---|---|
| `migration_sync_logs` | 187 | 2026-10-10 | per-run status/error/`failed_records`; **no unlinked-order counter** |
| `webhook_logs` | 1,579 | 2026-10-10 | Freshmarketer only |
| `import_logs` | 7 | 2026-08-14 | CSV importer row errors |
| `pos_event_logs` | 24 | 2026-03-09 | inert |
| `cron_job_logs`, `whatsapp_*_logs` | — | — | not data-quality |
| `pos_request_logs` | **absent** | — | `POS_REQUEST_LOGGING_ENABLED=false` |
| `scan_lookup_attempts`, `loyalty_mismatch_logs` | **absent** | — | not deployed / never triggered |

---

## Summary for data cleanup (CR-085-B → CR-087 → CR-101) — corrected

| Item | Prod count | Action |
|---|---|---|
| Junk phones | 71 (29/32 from POS master) | Flag `phone_invalid:true`; POS to clean master |
| Duplicate groups | 118 true + 69 cc-twins | cc fix first, then merge dry-run |
| Null/empty cc | 609 (still growing until deploy) | Set `country_code:"+91"` |
| Orphan orders — recoverable | **9,924 / ₹2.15 cr** | customer sync → backfill by `pos_customer_id` → phone |
| Orphan orders — anonymous | 209,176 / ₹7.71 cr | **leave** (`customer_id:null` is correct) |
| Coupon spaces | 0 | none |
| Tokens | 401 risk for ~14 dormant tenants, not 89 | re-scope CR-110 selector; run only for dormant/401 tenants |

---
*Investigation complete — read-only. Zero writes performed. Probe scripts used: `/tmp/probe.py`, `/tmp/probe2.py`, `/tmp/probe3.py` (read-only aggregations).*
