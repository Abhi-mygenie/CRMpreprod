# INTAKE — Findings from Wave A Planning · BUG-038 · BUG-039 · BUG-040 · CR-118 · POS asks P-16 / P-17
**Date**: 2026-10-10 · **Role**: Intake Agent (ALPHA v0.1 Role 1) · **Source**: Wave A Impact Analyses (`planning/CR_111_IMPACT_ANALYSIS.md`, `CR_113_CR_114_IMPACT_ANALYSIS.md`, `CR_115_IMPACT_ANALYSIS.md`, `CR_110_AMEND_BUG_035_IMPACT_ANALYSIS.md`), owner Q&A 2026-10-10, one prod **read-only** probe (17 blank-phone orphan orders) · **No application code changed. No data written.**

Owner instruction: *"choose intake role for register CRs and bugs found during session"*.

---

## 1. Bugs registered

### BUG-038 — `customer_sync` F11 dedup references the function instead of the matched document
- **Classification**: BUG · **Severity**: **P2** · **Risk**: LOW (2-line fix) · **Duplicate check**: DISTINCT (CR-001B-fix F11 introduced dedup; CR-100 made `phone_match` tolerant — neither covers the variable typo) · **Blast radius**: MEDIUM (every customer sync on every tenant)
- **Where**: `routers/customers.py:470` `phone_match.get("pos_customer_id")` and `:473` `existing = phone_match` — should be `phone_match_doc` (assigned at `:461`). `phone_match` is the imported helper from `core/phone.py`.
- **Evidence** (code reality, Planning 2026-10-10): `AttributeError: 'function' object has no attribute 'get'` is raised inside the per-record `try` (`:341`) → caught at `:555` → `failed_count += 1`, record pushed to `failed_records`, **existing customer not updated** (POS `pos_customer_id`, name, addresses lost), no insert. `GET /migration/status` reports `updated_count` as `duplicates_merged` → mislabeled; real F11 hits sit in `failed`.
- **Fix**: → **CR-113(b)** (owner ruling 2026-10-10 Q1=a): replace both references with `phone_match_doc`; the new `dedup_hits` counter replaces the broken log line. QA case V4 in `CR_113_CR_114_IMPACT_ANALYSIS.md` §8.
- **Owner Q**: none.

### BUG-039 — `order_sync` stores POS placeholder customer ids (`0`, `9223372036854775807`) as real `pos_customer_id`
- **Classification**: BUG (data classification) · **Severity**: **P3** · **Risk**: LOW · **Duplicate check**: DISTINCT (not in CR-086 / BUG-037 / recurrence doc) · **Blast radius**: SMALL (classification only; 17 rows on prod today)
- **Where**: `routers/migration.py:190` `pos_customer_id = _coerce_pos_id(mygenie_order.get("user_id"))` — `core/helpers.py:69-82` treats only `None`/`""` as absent; `0` → `"0"`, `9223372036854775807` → stored as a valid id.
- **Evidence** (prod read-only probe 2026-10-10, query `pos_id:"mygenie", customer_id:null, pos_customer_id present, cust_mobile blank`): **17 orders, all CAFE 103 (`pos_0001_restaurant_644`), 2026-06-26 → 2026-07-27**, ₹18,783: `pos_customer_id = "0"` ×13 · `"9223372036854775807"` (INT64 max) ×2 · `"45174883"` ×1. **No customer with any of these ids exists for r644.** Same POS also sends `cust_mobile:""` on these bills → they are walk-ins carrying a placeholder id, not saved customers.
- **Impact**: (1) `PROD_DB_INVESTIGATION_2026_10_09.md` Finding 4 row "Blank phone, has pos_customer_id — 17 — ✅ recoverable" is **wrong** → corrected ⚠️ in that doc; recoverable total is ₹2.14 cr / 9,907, not ₹2.15 cr / 9,924. (2) CR-113(a) `link_status` would label them `unlinked_no_customer` instead of `anonymous`; CR-114 orphan KPI would count them; CR-115(d) re-link would never match (harmless) but CR-087 O-A would list them as backfill candidates.
- **Fix**: → **CR-113(a)** scope add: treat `pos_customer_id ∈ {"0", "9223372036854775807"}` as absent for classification (`anonymous`) and in the orphan KPI (CR-114) and CR-115(d)/CR-087 matching. Storage of the raw value unchanged (audit). + **POS ask P-17** (send `user_id:null`, never a placeholder).
- **Owner Q**: none.

### BUG-040 — `push_and_refresh_tokens.py` hard-codes the shared POS password and prints token material
- **Classification**: BUG (security hygiene) · **Severity**: **P2** · **Risk**: LOW (fix) / MEDIUM (exposure) · **Duplicate check**: RELATED to BUG-035 (same script, different defect) · **Blast radius**: SMALL (script only; repo is public on GitHub → the default password is in a public repo)
- **Where**: `scripts/push_and_refresh_tokens.py:20` `PASSWORD = ... else "Qplazm@10"` (default when `--password` absent) · `:82` prints `crm_token[:20]` to stdout.
- **Evidence**: file content (Planning 2026-10-10). Violates generic rule R11 / §2 Security.
- **Fix**: → **CR-110 amendment** (with BUG-035): read password via `getpass` prompt (owner ruling 2026-10-10 110-Q2), no default, no token characters in output, run record with masked values. **Owner action outside CRM**: rotate the shared POS password if it is still the one in the file.
- **Owner Q**: confirm rotation (not a CRM task).

---

## 2. CR registered

### CR-118 — Zero-touch restaurant provisioning (CRM tenant exists from POS day one) + one-time catch-up for existing POS restaurants
- **Classification**: CR (feature / integration) · **Severity**: **P1** · **Risk**: **HIGH** (auth-adjacent: creates `users` docs + `api_key`; multi-tenant; depends on POS contract) · **Duplicate check**: RELATED — CR-086 (missing customers of *existing* tenants), CR-110 (token refresh), POS ask P-8 (server-to-server sync credential), CR-097 (removed self-registration — CR-118 must stay POS-driven, no public register) · **Blast radius**: LARGE (every new restaurant; ~110+ existing POS restaurants without a CRM account)
- **Owner intent (verbatim, 2026-10-10)**: *"we will need a mechanism as soon as restaurant is created CRM user shd be created so from first day all orders are sync and for old/existing customer one time cron or script which will sync all existing rest orders and customers"*.
- **Evidence**: CRM has 90 `users` (89 with token) vs 200+ restaurants on POS (owner); a tenant exists only after the owner's first CRM login (`routers/auth.py:355-446` creates user + `api_key` + pushes `crm_token` to POS). No login → no api_key → POS cannot send realtime orders → zero data. 14 tenants dormant (token expired, no re-login). Sync is blocked until `loyalty_settings` exists (`customers.py:263-280`, `migration.py:113-130`).
- **Scope (for Planning)**: (a) `POST /api/pos/restaurants/provision` server-to-server (platform secret) → create tenant with safe defaults (`loyalty_settings` loyalty **off**, no WhatsApp event maps, `provisioned_by:"pos"`, `activated:false`) + `api_key` returned to POS; (b) historical sync without human login → requires **P-8** credential; (c) one-time catch-up job for existing POS restaurants: restaurant list (**P-16**) → provision → customer sync → order sync, throttled, resumable (reuses CR-115 resume); (d) UI "not yet activated by owner" state; (e) idempotent — re-provision of an existing tenant is a no-op.
- **Depends on**: POS P-8 + P-16 · CR-115 (resume, 401 flag) · CR-113 (link_status) deployed. **Batch**: next batch after DQ-1 (proposed "ONB-1 Onboarding"), not Wave A.
- **Owner Qs for Planning**: Q1 who holds the platform secret / rotation · Q2 default settings for auto-created tenants (loyalty off, WA off — confirm) · Q3 catch-up order and throttle (tenants/night) · Q4 should auto-provisioned tenants appear in any owner dashboard before activation.

---

## 3. POS asks added (for the Wave B POS brief `CRM_TO_POS_DATA_QUALITY_ASKS_2026_10_10.md`, not yet drafted)

| # | Ask | Reason |
|---|---|---|
| **P-16** | Provisioning hook (POS → CRM on restaurant create) **or** a platform-level "list restaurants" API | CR-118 (a)/(c); 110+ POS restaurants have no CRM tenant |
| **P-17** | Never send a placeholder customer id on bills — `user_id:null` when no saved customer (today `0` and `9223372036854775807` observed, CAFE 103, Jun–Jul 2026) | BUG-039; mis-classifies walk-ins as recoverable |

---

## 4. Scope changes recorded (no new ids)

| Item | Change | Ruled by |
|---|---|---|
| CR-115(c) | guard already exists; owner wants the response changed to **HTTP 409** anyway → backend `migration.py:828-833` `HTTPException(409)` + `MigrationPage.jsx:95` toast source + 1 test | owner 2026-10-10 Q2=b |
| CR-115(b) | resume for **both** customer and order sync | owner Q4=a |
| CR-115(d) | match rule **pending** owner (id-only / id+phone / drop and rely on full re-sync) — see handover | open |
| CR-114 | prod run writes snapshot to **file**; infra executes on prod DB | owner Q5=a |
| CR-110 amend | preprod proof that refreshed `crm_token` works for sync is **mandatory** before any prod run; selector also must handle "200+ restaurants" expectation: script only ever sees CRM `users` (90), not POS restaurants — documented | owner Q6=a |
| CR-113(a) | + BUG-039 placeholder-id classification | this intake |
| CR-113(b) | + BUG-038 fix | owner Q1=a |

---

## 5. Docs corrected
- `discovery/PROD_DB_INVESTIGATION_2026_10_09.md` Finding 4 row for the 17 blank-phone/with-pid orders → ⚠️ **not recoverable** (placeholder ids), recoverable = 9,907 / ₹2.14 cr.

---

```text
Intake complete: BUG-038 · BUG-039 · BUG-040 · CR-118 (+ POS asks P-16, P-17; scope updates to CR-113/114/115/110-amend)
Classification: BUG ×3 (1 logic, 1 data classification, 1 security hygiene) · CR ×1 (feature/integration)
Severity: P1 ×1 (CR-118) · P2 ×2 (BUG-038, BUG-040) · P3 ×1 (BUG-039)
Risk: HIGH ×1 (CR-118) · LOW ×3
Duplicate check: BUG-038 DISTINCT · BUG-039 DISTINCT · BUG-040 RELATED BUG-035 · CR-118 RELATED CR-086/CR-110/P-8/CR-097
Evidence: captured (code lines; prod read-only probe output in this doc §1 BUG-039)
Blast radius: LARGE ×1 (CR-118) · MEDIUM ×1 (BUG-038) · SMALL ×2
Docs updated: this file · BUG_REGISTRY_CAMPAIGNS.md (+3) · 00_register/ROI_MEASUREMENT_CR_REGISTER.md (row 72) · CR_STATUS_DASHBOARD.md (DQ-1 rows + transition) · DECISIONS_LOG.md · PROD_DB_INVESTIGATION_2026_10_09.md (⚠️ correction) · PRD.md · handoff
Next: owner answers CR-115(d) match rule → "choose planning role for implementation planning of Group 1 / Group 2"
```

---

## 6. Owner question 2026-10-10 — "every POS order should carry a customer id; any September cases without one?" (prod read-only probe)

September 2026 orders on prod: **23,162** (order_sync 2,439 · realtime 20,723).

| Path | Total | No customer id **and** blank phone (walk-in) | No id but phone present | Has customer id |
|---|---|---|---|---|
| `order_sync` | 2,439 | **2,050 (84 %)** | 0 | 389 (all linked) |
| realtime `/pos/orders` | 20,723 | **17,262 (83 %)** | 3,461 (all linked by phone) | n/a — realtime order docs do not store the POS customer id (gap, see below) |

`order_sync` walk-ins by restaurant (Sept): The Craft 984/1,100 · CAFE 103 724/828 · Woko 281/397 · 11 The Cafe 40/41 · ONE BITE 7/8 · Five Ridge 4/6 · Curry's Lounge 4/4 · Virtual Food Court 3/32 · Teekha Koyla 2/19 · Takita 1/4. Placeholder ids (BUG-039) in Sept: **0**.

**Reading**: the POS does allow billing with no customer attached — ~83 % of September bills on both paths have neither id nor phone. This is consistent with the owner's 2026-10-10 ruling that anonymous bills are acceptable, but contradicts "customer is always created first". → strengthen **P-12** in the POS brief with this evidence (ask POS to confirm walk-in billing without customer is by design) and keep **P-11** (send `user_id` + phone whenever a customer *was* selected).

**Gap found**: realtime `POST /pos/orders` receives `user_id` (`POSOrderCreate.user_id`) but uses it only for customer lookup (`pos.py:674-697`); the order document never stores it. Proposed **CR-113(a) scope add**: persist `pos_customer_id` on realtime order docs (additive field) so "did POS send a customer id?" is answerable for realtime orders too. Owner approval needed (realtime path is CRITICAL file; additive write only).
