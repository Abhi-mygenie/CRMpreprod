# INTAKE — Batch "Data Quality & Cleanup" · CR-111 → CR-117 · BUG-035 → BUG-037 · carry-overs
**Date**: 2026-10-10 · **Role**: Intake Agent (ALPHA v0.1 Role 1) · **Source**: prod read-only investigation (`discovery/PROD_DB_INVESTIGATION_2026_10_09.md`, `PROD_PER_RESTAURANT_BREAKDOWN_2026_10_10.md`), recurrence validation (`BATCH_FIX_RECURRENCE_VALIDATION_2026_10_10.md`), planning proposals (`planning/DATA_CLEANUP_GATE_PLAN_2026_10_10.md`, `planning/DATA_QUALITY_WAVE_CR_PLAN_2026_10_10.md`), owner rulings 2026-10-10 · **No application code changed. No data written.**

Owner instruction: *"register these bugs and CRs for new batch; anything left from the previous batch goes into the same batch; then write the handover."*

---

## 0. Batch definition

**Batch name**: `DQ-1` — Data Quality & Cleanup
**Goal**: every door that created the production mess is closed (code), the mess is measured daily (job), then cleaned per restaurant on approval (scripts), then made structurally impossible (index).
**Hard rule**: no production data write without a per-restaurant approved discrepancy report (owner ruling 2026-10-09 + 2026-10-10).
**Prerequisite from previous batch**: owner smoke → Closure of the "Customer App identity + public reads" batch (CR-093/098/089/085-A/A2/094/096/099/100/102/104/105/106/107/109/BUG-025…034) and its **prod deploy**. Those items stay with the previous batch; they are *not* re-registered here — only their deploy is a Wave-A exit criterion.

---

## 1. New items registered

### CR-111 — Importer phone validation via `normalize_phone` (fixes BUG-036)
- **Classification**: CR (preventive) · **Severity**: P2 · **Risk**: LOW · **Duplicate check**: DISTINCT (CR-085-A W11 only added `country_code`; validator untouched) · **Blast radius**: SMALL (`routers/customers.py` import preview + import; 2 tenants ever used it)
- **Evidence**: `customers.py:100-117` accepts any 10-digit string (`0000000000` passes `isdigit` + `len==10`); prod junk `9999999999 Noname` @ Jeh's Nest came via import. Gap G-1.
- **Scope**: `_validate_and_classify_row` → `normalize_phone` (invalid → row error "Invalid phone"), new/update decision via `phone_match`, preview shows reason. +4 tests.
- **Owner Q**: none (owner 2026-10-10: "we should validate at our side").

### CR-112 — Unique partial index on `customers (user_id, phone, country_code)` + DuplicateKey handling
- **Classification**: CR (structural) · **Severity**: P1 · **Risk**: HIGH (index on 24k-doc live collection; 6 insert sites) · **Duplicate check**: DISTINCT (CR-093 Q6 index is non-unique) · **Blast radius**: LARGE (all customer-creating paths)
- **Evidence**: no unique constraint; 187 dup groups on prod; concurrent inserts can still double-insert (G-2).
- **Scope**: `partialFilterExpression {phone:{$type:"string",$ne:""}, phone_invalid:{$ne:true}}`; `DuplicateKeyError → re-find → return existing` at W1/W2/W3/W8/W13/UI; pre-check V2==0 per tenant; `background:true`.
- **Depends on**: Wave C complete (dup groups = 0). **Owner Q**: none yet (planning will ask about `country_code` null legacy docs if any remain).

### CR-113 — Data-quality logging & visibility
- **Classification**: CR (observability) · **Severity**: P1 · **Risk**: LOW (additive fields/logs/UI filter) · **Duplicate check**: DISTINCT · **Blast radius**: MEDIUM (`migration.py`, `customers.py`, `pos.py`, `CustomersPage.jsx`, prod `.env`)
- **Evidence**: L-1 sync writes `customer_id:null` with no log/counter; L-2 guest `payment-received` leaves zero DB trace; `phone_invalid` has no UI filter/API param/log line (grep 0 hits in `frontend/src`); `pos_request_logs` disabled on prod.
- **Scope**: (a) `orders.link_status` + sync counters `unlinked_count/anonymous_count/invalid_phone_count`; (b) `customer_sync` counters `flagged_phone_count/dedup_hits` + WARNING per flagged record; (c) `pos_guest_events` row + WARNING on W2 guest; (d) `GET /api/customers?phone_invalid=true` + badge/filter chip; (e) prod `POS_REQUEST_LOGGING_ENABLED=true`, `SAMPLE_RATE=0.1`, TTL 30 d (env only).
- **Owner Q1**: (e) prod request-log sampling — approve 10 % for 30 days? (storage ≈ small; TTL index exists).

### CR-114 — Daily data-quality job (`data_quality_daily`)
- **Classification**: CR (observability) · **Severity**: P1 · **Risk**: LOW (read-only aggregations; admin-gated route) · **Duplicate check**: DISTINCT (no DQ metric exists; `cron_job_logs` only loyalty jobs) · **Blast radius**: SMALL (`routers/cron.py`, new `core/data_quality.py`, `.emergent/crons.yml`)
- **Evidence**: owner 2026-10-10 "logs today should tell us if still leakage"; today leakage is discoverable only by ad-hoc aggregation.
- **Scope**: per tenant per day: new dup groups · new unflagged invalid phones · new null-cc · guest orders · sync-unlinked (excl. anonymous) · flagged total · customers/orders totals; `GET /api/cron/data-quality/latest`; row in `cron_job_logs`. Defines the **orphan KPI** (G-6): `customer_id:null AND guest_order≠true AND (pos_customer_id OR cust_mobile present)`.
- **Owner Q2**: run time (proposed 02:30 IST) and who receives a summary (dashboard card vs none this batch).

### CR-115 — Sync resilience: 401 flag + banner · resume · ordering guard · re-link on customer arrival (fixes BUG-037)
- **Classification**: CR · **Severity**: P1 · **Risk**: MEDIUM (touches both sync loops) · **Duplicate check**: RELATED to CR-086 (creation) — distinct scope (resilience + re-link, no stub creation) · **Blast radius**: MEDIUM (`migration.py`, `customers.py`, `auth.py`, Dashboard/Migration pages)
- **Evidence**: 35/37 prod sync failures = 401, 5 mid-run (pages 45/147/329/499/1733) → silent partial syncs (G-5); UI allows `order_sync` before `customer_sync` (G-4); Brew 391/391 orphan orders whose customers arrived later were never re-linked (BUG-037).
- **Scope**: (a) 401 → `users.mygenie_token_invalid:true/_at` + Dashboard banner, cleared on login; (b) `migration_sync_logs.last_completed_page` + `?resume=true`; (c) `sync-orders` 409 until a `customer_sync` has completed once; (d) `customer_sync` post-step: for each **newly inserted** customer, `orders.updateMany({user_id, customer_id:null, pos_customer_id∈variants} ∪ phone_match) → $set customer_id, link_status:"linked_late"` — forward-only (historical O-A handled by CR-087).
- **Owner Q3**: (d) is a forward-only *data write inside normal sync* — confirm it is in scope now (it is the structural fix for the Brew pattern) or defer to after CR-087.

### CR-116 — Discrepancy report generator + approval converter (read-only tooling)
- **Classification**: CR (tooling) · **Severity**: P1 · **Risk**: LOW (read-only user) · **Duplicate check**: DISTINCT (085-B "report-first" ruling had no tool) · **Blast radius**: SMALL (`scripts/cleanup/`)
- **Scope**: `generate_reports.py --restaurant|--all` → 6-sheet xlsx + md per restaurant (categories J/F/T/S/B · D-true/twin · CC · O-A/B/C · hygiene · validation preview) + `ALL_RESTAURANTS_SUMMARY.md`; `approve_convert.py` → `<rid>_APPROVED.json` with source-report hash. Spec: `planning/DATA_CLEANUP_GATE_PLAN_2026_10_10.md §2–3`.
- **Owner Q4**: report format xlsx (restaurants) + md (owner) — OK?

### CR-117 — Cleanup runner framework (`run_cleanup.py`) with backup, audit, rollback
- **Classification**: CR (tooling, executes 085-B/087/101) · **Severity**: P0 (production data write) · **Risk**: CRITICAL · **Duplicate check**: DISTINCT · **Blast radius**: LARGE (customers, orders, ledgers of one tenant per run)
- **Scope**: pre-flight (write-user+db check, approval hash, live re-detect & stale-skip, per-tenant `mongodump`, `data_cleanup_runs` row) · actions A1–A6 idempotent with `data_cleanup_audit` before/after · `customers_merged_archive` (never delete history) · `--rollback <run_id>` · auto PROC-001 · `--apply` only after ≤24 h dry-run of same hash · **preprod rehearsal mandatory**. Spec: gate plan §4.
- **Owner Q5–Q9** (= gate plan §7): O-A link-only vs recompute stats · F re-parse as system action when cc unambiguous · blank-phone docs with history · Palm-group hold until P-15 · who issues the write credential and for which window.

### BUG-035 — CR-110 token script selects every tenant (`dp_live_` test checks wrong field)
- **Severity**: P2 · **Risk**: MEDIUM if run on prod as-is (would re-login 89 tenants with the shared password) · **Status**: 📋 REGISTERED · **Where**: `scripts/push_and_refresh_tokens.py:29-31` — `mygenie_token.startswith("dp_live_")`; `dp_live_` is the CRM `api_key` format (`core/auth.py:46`). Prod: 11 tenants synced OK in Oct with their tokens.
- **Fix**: → **CR-110 amendment** (selector = `mygenie_token_invalid:true` ∨ last sync error 401 ∨ `last_login < now-60d`; `--restaurant`; dry-run list). Also corrects prod report Finding 7.

### BUG-036 — CSV importer accepts junk 10-digit phones; bypasses `normalize_phone`
- **Severity**: P2 · **Risk**: LOW · **Status**: 📋 REGISTERED → fix = **CR-111**. Evidence above (G-1).

### BUG-037 — Orders synced before their customer are never re-linked when the customer arrives
- **Severity**: P1 · **Risk**: LOW (read logic) · **Status**: 📋 REGISTERED → structural fix = **CR-115 (d)**; historical fix = **CR-087 O-A**. Evidence: Brew r699 — 1,128 orders (Mar–Apr 2026) with `pos_customer_id` (stored as int), customers synced 2026-08-12, 391/391 customers exist, orders still `customer_id:null`. `migration.py:289-303` updates `customer_id` only when the same order is re-processed.

---

## 2. Carry-overs from the previous batch (moved into DQ-1, not re-registered)

| Item | Current status | Why it belongs here | Wave |
|---|---|---|---|
| **CR-085-B** phone/cc cleanup | 📋 report-first ruled | the data write itself | C |
| **CR-087** dup merge + orphan backfill | 📋 P1 CRITICAL | data write; now scoped by prod numbers (118 true + 69 twins; O-A Brew; Palm hold) | C |
| **CR-101** hygiene | 📋 P3 | data write | C |
| **PROC-001** prod validation | 📋 mandatory | runs after every CR-117 run | C |
| **CR-086** POS customers missing from CRM | ⏸ DEFERRED | **amend**: anonymous orphans accepted (owner 2026-10-10); Part C (stub on sync) decision deferred to POS **P-15** answer; resilience/re-link moved to CR-115 | D (optional) |
| **CR-110** token refresh script | 🟢 implemented (preprod) | **amend** per BUG-035 before any prod run | A |
| **BUG-028** `/customers` overflow @390 | 📋 P3 | small UI fix; owner never confirmed priority — ride with CR-113 (d) since the same page is edited | A |
| **ENV-002** prod edge verification | 📋 P2 (infra) | still open; not CRM code; keep visible — XFF trust affects limiter evidence | A (infra) |
| **CR-103** POS L-1 parity | ⏸ PARKED (no POS changes) | **stays parked** — listed only so it is not lost | — |
| **Owner smoke + Closure of previous batch** | pending | Wave-A exit criterion (prod deploy) | gate |

Not carried (already closed or outside scope): CR-108 🔒, CR-095 🔒, CR-084/097 🔒; CR-069 (older batch, implemented, never specifically QA'd — flagged in handover as "outside DQ-1, owner to decide").

---

## 3. Cross-team items (not CRM CRs — owner sends)

| Doc to draft (Planning role) | Content |
|---|---|
| `handoff/CRM_TO_POS_DATA_QUALITY_ASKS_2026_10_10.md` | P-8 server-to-server sync credential · P-9 phone validation at POS customer create (or blank, never placeholder) · P-10 `country_code` in `/customer/list` · P-11 `user_id` + phone on bills · P-12 confirm `cust_mobile:""` = walk-in · P-14 master dedupe · **P-15 is `order.user_id` the same id space as `/customer/list.id`?** (Palm group 0/3,000 match after completed syncs) · P-13 (already sent) CR-085-A2 validation |
| S&O contract v1.1 addendum | S-1…S-6 (`BATCH_FIX_RECURRENCE_VALIDATION §4.1`) |

---

## 4. Recommended execution order (detail in handover)

**Wave A (code, before any data write)**: CR-111 → CR-113 (+BUG-028) → CR-114 → CR-115 → CR-110 amend → QA → prod deploy → 3-day DQ baseline
**Wave B (read-only)**: CR-116 → reports for 79 tenants → POS brief + S&O note sent → approvals
**Wave C (writes, approved only)**: CR-117 (preprod rehearsal) → CR-085-B → CR-087 → CR-101, each followed by PROC-001; tenant order: system-only → Kunafa/CAFE 103 → Brew → Jeh's Nest → Palm group after P-15
**Wave D**: CR-112 → CR-086 decision → 7-day DQ watch → Closure

---

## 5. Open owner questions (consolidated)
| # | Item | Question |
|---|---|---|
| Q1 | CR-113 (e) | enable prod POS request-log sampling 10 % / 30 d? |
| Q2 | CR-114 | run time 02:30 IST; summary surface (none / dashboard card)? |
| Q3 | CR-115 (d) | forward-only re-link inside `customer_sync` — in scope now, or after CR-087? |
| Q4 | CR-116 | xlsx for restaurants + md for owner — OK? |
| Q5 | CR-117 / 087 | O-A backfill: link only, or also recompute `total_visits/total_spent`? |
| Q6 | CR-085-B | F re-parse of unambiguous foreign cc as system action (no restaurant confirmation)? |
| Q7 | CR-085-B / 101 | blank-phone docs **with** history: keep flagged, or merge into per-tenant "Walk-in"? |
| Q8 | CR-087 | hold Palm group (r541/628/665/666/474/661) O-A until P-15 — confirm |
| Q9 | CR-117 | who issues the write-capable prod Mongo credential; run window |
| Q10 | batch | approve the batch composition (merge 113+114? split 115?) and open **Planning** for Wave A |

---

```text
Intake complete: CR-111 · CR-112 · CR-113 · CR-114 · CR-115 · CR-116 · CR-117 · BUG-035 · BUG-036 · BUG-037 (+ carry-overs 085-B/087/101/PROC-001/086-amend/110-amend/BUG-028/ENV-002)
Classification: CR ×7 (2 tooling, 2 observability, 1 preventive, 1 resilience, 1 structural) · BUG ×3
Severity: P0 ×1 (117) · P1 ×5 (112/113/114/115/BUG-037) · P2 ×4 (111/BUG-035/BUG-036/…)
Risk: CRITICAL ×1 (117) · HIGH ×1 (112) · MEDIUM ×2 (115, BUG-035) · LOW ×rest
Duplicate check: all DISTINCT; CR-115 RELATED to CR-086 (scope split recorded)
Evidence: captured (prod read-only probes saved under discovery/probes/, raw output *_RAW.txt)
Blast radius: LARGE ×2 (112, 117) · MEDIUM ×2 (113, 115) · SMALL ×rest
Docs updated: this file · CR_STATUS_DASHBOARD.md · 00_register/ROI_MEASUREMENT_CR_REGISTER.md · BUG_REGISTRY_CAMPAIGNS.md · DECISIONS_LOG.md · PRD.md · handoff/SESSION_2026_10_10_HANDOVER_DQ1_BATCH_INTAKE.md
Next: Planning (Wave A) — after owner answers Q10 (+Q1–Q3 for Wave A items)
```
