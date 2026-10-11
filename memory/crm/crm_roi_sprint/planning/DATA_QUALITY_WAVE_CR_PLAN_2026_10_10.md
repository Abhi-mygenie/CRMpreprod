# Data-Quality Wave — CR Plan (proposal for INTAKE)
**Date**: 2026-10-10 · **Role**: Planning (docs only; nothing registered until owner opens INTAKE) · Sources: `BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md` (gaps G-1…G-8, L-1/L-2), `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md`, `DATA_CLEANUP_GATE_PLAN_2026_10_10.md`. Next free CR id = **111** (register ends at CR-110).

## Headline
**7 new CRs (CR-111 → CR-117) + 3 existing data CRs (CR-085-B, CR-087, CR-101) + 2 amendments (CR-110, CR-086) + PROC-001 + 1 POS brief + 1 S&O note.** Executed in **4 waves**; data is written only in Wave C, after every Wave A code item is live on prod and the DQ baseline exists.

---

## Wave A — close the doors (code; prod deploy; before any data write)

| CR | Title | Contains | Gap | Files | Size / risk | Depends on |
|---|---|---|---|---|---|---|
| **CR-111** | Importer phone validation | `_validate_and_classify_row` uses `normalize_phone` (invalid → row error, same wording as UI); new/update decision via `phone_match` not raw string; `country_code` from helper; import preview shows the rejection reason | G-1 | `routers/customers.py` (~15 lines) · `tests/test_cr111_import_phone.py` (+4) | S / LOW | — |
| **CR-113** | Data-quality logging & visibility | (a) `order_sync`: `link_status` on every written order (`linked` / `unlinked_no_customer` / `unlinked_invalid_phone` / `anonymous`), counters `unlinked_count · anonymous_count · invalid_phone_count` on `migration_sync_logs`; (b) `customer_sync`: `flagged_phone_count · dedup_hits` counters + WARNING line per flagged record; (c) W2 guest `payment-received` → `pos_guest_events` row (tenant, phone_raw, bill, coupon, ts) + WARNING; (d) `GET /api/customers?phone_invalid=true` filter + "Invalid phone" badge/filter chip on Customers page; (e) `POS_REQUEST_LOGGING_ENABLED=true`, `SAMPLE_RATE=0.1` on prod for 30 days (env only) | G-3, L-1, L-2, Q6 | `migration.py` · `customers.py` · `pos.py` · `CustomersPage.jsx` · prod `.env` (~60 lines) · tests (+6) | M / LOW (additive fields only) | — |
| **CR-114** | Daily data-quality job | Scheduled job (platform cron `.emergent/crons.yml` → `POST /api/cron/data-quality`, admin-gated) writing one row per tenant per day to `data_quality_daily`: new dup groups · new unflagged invalid phones · new null-cc · guest orders · sync-unlinked orders (excl. anonymous) · flagged phones total · customers/orders totals; `GET /api/cron/data-quality/latest` for the owner; row in `cron_job_logs` | G-2 (evidence), G-6 | `routers/cron.py` · `core/data_quality.py` (new, ~120 lines) · `.emergent/crons.yml` · tests (+4) | M / LOW (read-only aggregation) | — |
| **CR-115** | Sync resilience | (a) 401 on any page → `users.mygenie_token_invalid:true` + `mygenie_token_invalid_at`; Dashboard banner "POS connection expired — log in again to refresh" (cleared on next login); (b) `migration_sync_logs.last_completed_page`; `POST /migration/sync-orders?resume=true` continues from it; (c) `sync-orders` returns **409** if no `customer_sync` has ever completed for the tenant (UI offers "Run customer sync first") | G-5, G-4 (ordering) | `migration.py` · `customers.py` · `auth.py` (clear flag) · `DashboardPage.jsx` / `MigrationPage.jsx` (~80 lines) · tests (+5) | M / MEDIUM (touches sync loop) | — |
| **CR-110 (amend)** | Token refresh selector | Replace `dp_live_` test with: `mygenie_token_invalid:true` **or** latest sync error `401` **or** `last_login < now-60d`; `--restaurant` flag; dry-run list first; prod run only with owner password confirmation | G-8 | `scripts/push_and_refresh_tokens.py` | S / LOW | CR-115 (flag) |

Exit criteria Wave A: all five live on prod · `data_quality_daily` has **≥3 consecutive days** (the "before" baseline) · `phone_invalid` visible to staff.

---

## Wave B — see before touching (read-only tooling + approvals)

| CR | Title | Contains | Depends on |
|---|---|---|---|
| **CR-116** | Discrepancy report generator | `scripts/cleanup/generate_reports.py --restaurant <rid>|--all` (read-only user): the 6-sheet per-restaurant xlsx + md summary per `DATA_CLEANUP_GATE_PLAN §2` (categories J/F/T/S/B, D-true/twin, CC, O-A/B/C, hygiene, validation preview) + `ALL_RESTAURANTS_SUMMARY.md`; `approve_convert.py` turns the returned sheet into `<rid>_APPROVED.json` (schema + hash of source report) | Wave A deployed (so the report reflects post-deploy state) |
| **POS brief** (not a CRM CR) | `CRM_TO_POS_DATA_QUALITY_ASKS_2026_10_10.md` | P-8 server-to-server sync credential · P-9 phone validation in POS master (or blank, never placeholder) · P-10 `country_code` in `/customer/list` · P-11 `user_id` + phone on bills · P-12 confirm `cust_mobile:""` = walk-in · **P-15 ID-space: is `order.user_id` == `/customer/list.id`?** (Palm group 0/3,000 match) · P-14 master dedupe | owner sends |
| **S&O note** (not a CR) | contract v1.1 addendum | S-1…S-6 from recurrence doc §4.1 (country_code always, digits only, no retry on 400, single skip-otp per phone) | owner sends |
| **Approval** | human gate | owner approves all files; restaurants approve flagged rows (Jeh's Nest, Kunafa, CAFE 103, Palm House, Cafe Flora, LSD, Craft, Aura, Pav & Pages ×2, Mill Bakery, mantri); write-capable prod credential issued for the run window | CR-116 output |

---

## Wave C — write (approved data only; one restaurant per run)

| CR | Title | Contains | Depends on |
|---|---|---|---|
| **CR-117** | Cleanup runner framework | `scripts/cleanup/run_cleanup.py`: pre-flight (write user + db check, approval hash, live re-detect & stale-skip, per-tenant `mongodump`, `data_cleanup_runs` row) · action engine A1–A6 (each idempotent, `data_cleanup_audit` before/after per doc) · `customers_merged_archive` · `--rollback <run_id>` · auto-runs PROC-001 queries post-run · `--apply` refused without a ≤24 h dry-run of the same hash. **Tested on preprod first** with the same approval format. | CR-116 (approval JSON schema) |
| **CR-085-B** (existing) | Phone / cc cleanup | Executes A1 (cc→+91), A2 (F re-parse), A3 (flag J/T/S, apply restaurant corrections), B blank handling per owner Q3 | CR-117 · approvals |
| **CR-087** (existing) | Duplicates + O-A backfill | A4 merge keep-oldest (twins system-approved; history-on-both-sides restaurant-approved) · A5 O-A backfill `customer_id` link-only (owner Q1) · **Palm group (r541/628/665/666/474/661) carved out until P-15 answered** | CR-085-B first (twins become true dups after cc fix) |
| **CR-101** (existing) | Hygiene | A6: orphan-tenant customers, dead `password_hash`, drop `customer_otps`, zero-history blank-phone docs | CR-087 |
| **PROC-001** (existing) | Prod validation | V1–V10 per tenant after each run; global at end; results stored in `data_cleanup_runs` | each run |

Run order inside Wave C: system-only small tenants → Kunafa Mahal / CAFE 103 (twins) → Brew (O-A 391 orders) → Jeh's Nest (94 dup groups with history) last → Palm group only after P-15.

---

## Wave D — hard stop + optional recovery

| CR | Title | Contains | Depends on |
|---|---|---|---|
| **CR-112** | Unique partial index | `customers` unique index `{user_id:1, phone:1, country_code:1}` with `partialFilterExpression {phone:{$type:"string",$ne:""}, phone_invalid:{$ne:true}}`; `DuplicateKeyError → re-find & return existing` at the 6 insert sites (W1, W2, W3, W8, W13, UI); created with `background:true`; dry check `V2 == 0` on every tenant first | G-2 | Wave C complete (dup groups = 0) |
| **CR-086 Part C (amend, OPTIONAL)** | Order sync creates stub when `pos_customer_id` present | Owner ruled anonymous bills acceptable; Part C only matters for O-B rows with a POS id (today ~9,900, mostly Palm group). **Decision deferred until P-15 answer** — if POS says the id spaces differ, Part C is pointless and is closed OBSOLETE | — | P-15 |
| **Closure** | | 7 consecutive `data_quality_daily` days at zero new dups / unflagged invalid / null-cc · CR-112 created without error · closure docs for 085-B/087/101/111–117 | | Wave D |

---

## Count & effort summary

| Wave | Items | New CRs | Est. effort (impl + QA) | Prod writes? |
|---|---|---|---|---|
| A | CR-111, 113, 114, 115, CR-110 amend | 4 | ~3–4 agent sessions | code deploy only |
| B | CR-116, POS brief, S&O note, approvals | 1 | ~1 session + owner/restaurant time | none (read-only user) |
| C | CR-117, 085-B, 087, 101, PROC-001 | 1 | ~2 sessions tooling + 1 run session per batch of tenants | **yes — approved rows only** |
| D | CR-112, CR-086 Part C (optional), closure | 1 | ~1 session | index only |
| **Total** | | **7 new** (+3 existing data CRs, +2 amendments) | | |

## Why this order (one line each)
1. Wave A before C: prod is still creating the defects daily; cleaning first means cleaning twice; the DQ job must exist to give a *before* number.
2. CR-116 after Wave A deploy: the report must describe the data the new code will inherit, not a snapshot the deploy will change (e.g. blank-phone customers stop being created).
3. CR-085-B before CR-087: 69 cc-twins become ordinary duplicates only after cc is fixed; merging first would mis-count.
4. CR-112 last: a unique index cannot be built while duplicates exist, and building it before CR-113/114 would hide double-inserts as 500s instead of measurable events.
5. POS items never block CRM waves: flags are idempotent; only the Palm-group backfill waits on P-15.

## Owner decisions needed to open INTAKE
- Approve the 7 CR titles/scopes above (or merge CR-113+114, or split CR-115) → Intake registers rows 111–117 in `CR_STATUS_DASHBOARD.md` + register.
- Gate-plan Q1–Q5 (`DATA_CLEANUP_GATE_PLAN §7`): O-A link-only · F re-parse as system action · blank-phone-with-history handling · Palm group hold · write-credential owner.
- Send POS brief + S&O note.
