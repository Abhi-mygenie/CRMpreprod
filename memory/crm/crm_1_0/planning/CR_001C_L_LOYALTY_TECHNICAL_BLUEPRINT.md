# CR-001C-L — Loyalty Technical Blueprint (Stage B.1)

**Module:** CR-001C-L (Loyalty)
**Stage:** B.1 — Technical Planning + Cleanup Blueprint
**Date:** 2026-05-22
**Status:** **`cr001c_loyalty_blueprint_waiting_owner_answers`**
**Author:** Planning-only inspection. No code, DB, env, migration, or sync touched.

> This blueprint sits between **Stage B (Change Proposal — written)** and
> **Stage C (Test Setup)**. It converts the 12-item proposal (F1 + C1–C11)
> into safe implementation phases, surfaces the F10 / CR-003 conflict,
> identifies dead-code cleanup, and produces a phased owner-approval gate.

---

## 1. Executive Summary

The Stage B Loyalty proposal is **technically valid** but **too large to
implement as a single drop**. Twelve interlocking changes touch 7 backend
files, 1 model file, and (optionally) 1 frontend page. Several changes
have hidden inter-dependencies (e.g. C3 cannot ship without F1; C2 silently
arms a re-sync wipe trap that only C11 disarms; C7 changes `loyalty_jobs.py`
which is hot-running cron territory).

**Recommendation:** split into **5 sequential phases (L1–L5)** with an
owner gate at the end of each. Bundle L1+L2 for the first approval cycle
(low risk, foundational), then gate L3 specifically because it overrides
the earlier **F10 / CR-003 deferral**. L4 is mechanical. L5 is the
cleanup pass that only runs after L1–L4 are verified in preview.

Two of the 11 surgical changes (C8 tier-upgrade WhatsApp and C9 off-peak
timezone) are recommended for **deferral out of this CR** — they expand
scope into WhatsApp Automation and i18n territory respectively, and
neither blocks loyalty correctness.

**The blueprint itself is planning-only** — no code, no DB, no migration.
Owner must answer Q-LB1..Q-LB6 before code touches anything.

---

## 2. Inputs Reviewed

| Doc | Read |
|---|---|
| `/app/memory/crm/crm_1_0/planning/CR_001C_MODULE_BREAKDOWN_PLAN.md` | ✅ |
| `/app/memory/crm/crm_1_0/analysis/CR_001C_L_LOYALTY_LOGIC_AS_IS_REVIEW.md` | ✅ |
| `/app/memory/crm/crm_1_0/planning/CR_001C_L_LOYALTY_CHANGE_PROPOSAL.md` | ✅ |
| `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | ✅ |
| `/app/memory/crm/crm_1_0/final/CRM_1_0_OPEN_GAPS_REGISTER.md` | ✅ |
| `/app/backend/routers/pos.py` (relevant ranges: 240–340, 600–780, 920–985, 1135–1290, 2320–2386) | ✅ |
| `/app/backend/routers/migration.py` (230–335) | ✅ |
| `/app/backend/routers/customers.py` (140–340, 1480–1495) | ✅ |
| `/app/backend/routers/points.py` (1–110) | ✅ |
| `/app/backend/core/loyalty_jobs.py` (full) | ✅ |
| `/app/backend/core/helpers.py` (full) | ✅ |
| `/app/backend/services/analytics_service.py` (1–284) | ✅ |
| `/app/backend/models/schemas.py` (loyalty section) | ✅ |
| `/app/frontend/src/pages/LoyaltySettingsPage.jsx` | ✅ (knob audit only) |
| `/app/frontend/src/pages/CustomerDetailPage.jsx` | ✅ (display field audit only) |

No DB read. No code modified.

---

## 3. Stage B Proposal Validation

| Item | Proposal | Valid? | Notes | Phase |
|---|---|---|---|---|
| **F1** | Extract `_calculate_points` → `core/loyalty.py` | ✅ Yes | Pure refactor. Required by C3 (migration cannot import from `pos.py` cleanly). Recommend exposing TWO functions: `calculate_points()` and `calculate_tier()` (latter already in `helpers.py`; re-home both into `core/loyalty.py` for cohesion). | **L1** |
| **C1** | Honor `loyalty_enabled` in realtime + migration | ✅ Yes | Two-touch: pos.py (realtime side) + migration.py (migration side). Realtime touch is trivial. Migration touch must happen in same phase as C3 to be coherent. | L2 (realtime) + L3 (migration) |
| **C2** | Migration stops pulling MyGenie loyalty/wallet/coupon aggregates | ⚠️ Yes, but **arms a re-sync trap** | If C2 ships without C11, any re-sync of an existing customer will overwrite their already-computed counters with zeros. **C2 and C11 must ship in the same phase.** | **L3 — together with C11** |
| **C3** | Migration order_sync uses shared helper + `$inc total_points + total_points_earned` | ⚠️ Valid but **overrides F10 deferral** | See §10. Safe only under clean-slate pre-prod policy + a hard guard. **Requires explicit owner re-confirmation (Q-LB1).** | **L3 — gated on Q-LB1** |
| **C4** | Realtime POS `$inc total_points_earned` | ✅ Yes | Low risk. Must respect C1 kill-switch. | L2 |
| **C5** | Manual redeem `$inc total_points_redeemed` | ✅ Yes | Trivial. Independent. | **L4** |
| **C6** | First-visit bonus init `total_points_earned` | ✅ Yes | Low risk. Lives in `_find_or_create_customer`. Belongs with C4 (same realtime customer path). | L2 |
| **C7** | Birthday/anniversary cron `$inc total_points_earned` + recompute tier | ✅ Yes | Touches scheduled cron in `loyalty_jobs.py`. Lower urgency than L2/L3. | L4 |
| **C8** | Tier-upgrade WhatsApp from realtime POS | ⚠️ Valid but **scope expansion** | Touches WhatsApp event templates. Owner explicitly listed WhatsApp as not-touched in CR-001C. Recommend **deferral to WhatsApp Automation CR** unless current `tier_upgrade` template wiring is verified safe. | **Deferred (Q-LB6)** |
| **C9** | Off-peak: timezone + cross-midnight | ⚠️ Valid but **scope expansion (i18n)** | Pre-prod is India-only per owner statement. Cross-midnight is an edge case (default 14:00–17:00 is mid-afternoon). Recommend **deferral**. | **Deferred (Q-LB5)** |
| **C10** | Defensive init on all customer-create paths | ✅ Yes | Mechanical. Sprinkles across L2 (POS-create) and L3 (migration-create). | L2 + L3 |
| **C11** | Re-sync safety (don't reset counters) | ✅ Yes — **mandatory** with C2 | Without this, C2 silently destroys data on re-sync. | **L3 — must ship with C2** |

---

## 4. Recommended Phase Plan

| Phase | Items | Goal | Risk | Owner Gate |
|---|---|---|---|---|
| **L1** | F1 (+ `calculate_tier` co-location) | Create one source of truth for loyalty math | **Low** — pure refactor with parity tests | After L1 QA |
| **L2** | C1 (realtime side), C4, C6, C10 (POS-create) | Realtime POS counters grow correctly + `loyalty_enabled` honored | **Low–Medium** — touches main POS write path | After L2 QA (paired approval with L1) |
| **L3** | C1 (migration side), C2, C3, C10 (migration-create), C11 | Migration uses same helper; clean-slate; re-sync safe | **Medium–High** — overrides F10 deferral; touches migration | **Q-LB1 confirmation required before L3** |
| **L4** | C5, C7 | Manual redeem + cron paths consistent with new counter behavior | **Low** | After L4 QA |
| **L5** | Dead-code removal | Remove `earn_percent` branch, synthetic backfill, drift constants | **Low** — gated on L1–L4 verified | After live verification |
| **DEFERRED** | C8, C9 | Tier-upgrade WhatsApp, off-peak i18n | n/a | Move to separate CRs |

Implementation order: **L1 → L2 → L3 → L4 → L5**. Each phase is a separate diff with its own QA report.

---

## 5. Phase L1 — Shared Helper Foundation

### Goal
Create `/app/backend/core/loyalty.py` as the single source of truth for
points calculation and tier resolution. **Zero behavior change** —
absolute parity with current `pos.py::_calculate_points` and
`helpers.py::calculate_tier`.

### Helper Responsibilities (recommended scope = Q-LB3 option **B**)

| Function | Responsibility | Inputs | Output |
|---|---|---|---|
| `calculate_points(order_amount, customer, settings, now=None)` | Base earn + off-peak bonus computation. Returns a structured breakdown. | order_amount: float · customer: dict · settings: dict · now: datetime (optional, defaults to UTC now) | dict: `{base_points, off_peak_bonus, total_points, applied_tier, earn_percent_applied, off_peak_window_matched}` |
| `calculate_tier(total_points, settings)` | Map total_points → tier name. Pure function. | total_points: int · settings: dict | str: `"Bronze" \| "Silver" \| "Gold" \| "Platinum"` |

> **Recommended scope = B (points + tier).** Adding redemption-value helpers
> (scope C) expands the surface area and pulls in policy decisions about
> max_redemption_percent / max_redemption_amount that are read-side only.
> Defer to L5 or a later CR.

### Files Touched (L1)
| File | Change | Risk |
|---|---|---|
| `/app/backend/core/loyalty.py` | **NEW** — house `calculate_points` + `calculate_tier` | Low |
| `/app/backend/routers/pos.py` | Replace `_calculate_points` inline body with `from core.loyalty import calculate_points`. Keep `_calculate_points` as a thin wrapper for one release to ease rollback. | Low |
| `/app/backend/core/helpers.py` | `calculate_tier` stays here OR is re-exported from `core/loyalty.py` for back-compat (decide at L1 implementation; prefer re-export). | Low |

### Tests Required (L1)
- **Parity test 1** — 30 synthetic orders varying tier × amount × off-peak window × min_order_value. Assert `_calculate_points(...)` (old) `== calculate_points(...)` (new).
- **Parity test 2** — `calculate_tier(...)` over [-1, 0, 499, 500, 1499, 1500, 4999, 5000, 99999] with three settings docs (defaults, custom thresholds, missing thresholds).
- **Negative test** — order_amount < min_order_value → 0 points, no off-peak bonus.
- **Off-peak test** — multiplier mode & flat mode, IN-window and OUT-of-window (using current IST hardcoding, since C9 deferred).

### Dead-Code Impact (L1)
None yet. Old `_calculate_points` stays as wrapper. Removal scheduled for **L5**.

### L1 Owner Questions
- None blocking. Q-LB3 (helper scope) decides whether scope is points-only (A), points+tier (B, ⭐ recommended), or expanded (C).

---

## 6. Phase L2 — Realtime POS Loyalty Correctness

### Goal
Fix realtime POS write path so every future order:
- Honors `loyalty_enabled` master toggle (C1 realtime side).
- `$inc`s `total_points_earned` (C4).
- Initializes `total_points_earned` from first-visit bonus (C6).
- Initializes all loyalty fields on POS-create path (C10 realtime side).

### Files Touched (L2)
| File | Change | Risk |
|---|---|---|
| `/app/backend/routers/pos.py` | `pos_order_webhook` — check `settings.loyalty_enabled` before calling helper; if off, skip points-related writes but still do visits/spend/wallet. `_save_order_and_transactions` (or the inline update at line 1233–1244) — switch from `$set` to `$inc`+`$set` to add `total_points_earned`. `_find_or_create_customer` — when creating customer, init `total_points_earned = first_visit_bonus`, `total_points_redeemed = 0`. CRM-manual `create_customer` — init `total_points_earned = 0`, `total_points_redeemed = 0`. | Medium |

### Tests Required (L2)
- **Static QA harness** (motor-monkey-patched) — fire `_save_order_and_transactions` with:
  - `loyalty_enabled=true`, ₹500 order → `total_points` and `total_points_earned` both `$inc 25`.
  - `loyalty_enabled=false`, ₹500 order → neither incremented; `total_visits +1`, `total_spent +500` still apply.
  - First-visit customer with `first_visit_bonus_points=50`, ₹500 order → new customer doc shows `total_points=50+25=75`, `total_points_earned=50+25=75` after the first-visit row also fires.
- **Live HTTP probe** — same shape as CR-001A Phase 2 probe (auth-rejected with new schema → HTTP 401).
- **Regression** — CR-001A Phase 1 + Phase 2 alias mapping still correct.

### L2 Owner Questions
- None blocking. (Q-LB6 covers C8 but C8 is deferred out of L2.)

### Bundled approval
**L1 + L2 ship together as the first owner approval cycle** (Q-LB2 = B).

---

## 7. Phase L3 — Migration Loyalty Correctness

> ⚠️ **GATED on Q-LB1.** This phase overrides the F10 / CR-003 deferral. Do
> not implement without explicit owner confirmation.

### Goal
Bring migration into parity with realtime by using the SAME helper from L1.
Stop trusting MyGenie aggregates. Make re-sync safe.

### Files Touched (L3)
| File | Change | Risk |
|---|---|---|
| `/app/backend/routers/migration.py` | order_sync loop — replace the broken `loyalty_settings.get("earn_percent", 0)` line with `calculate_points()` from L1. Honor `settings.loyalty_enabled`. `$inc total_points + total_points_earned + total_visits + total_spent`. Recompute `tier` inline. Drop the existing coupon_transactions write (Q-LOYALTY-5 says coupon migration is out of scope; that block moves to CR-001C-C). Drop `$inc total_coupon_used` (same reason). | **High** — touches main migration write path |
| `/app/backend/routers/customers.py` | `sync_customers_from_mygenie` — stop reading `mygenie_customer.loyalty_point/total_points_earned/total_points_redeemed/wallet_balance/total_wallet_received/total_wallet_used/total_coupon_used`. Hard-init to 0. Drop the synthetic backfill block (lines 303–347). Drop the inline tier calc (lines 235–245). Add the **safety guard** (`LOYALTY_CLEAN_SLATE_RECALC` flag — see §10). | **High** |
| `/app/backend/routers/customers.py` (C11) | Existing-customer update branch (line 275–279) — switch from full `$set: customer_data` to an explicit allow-list `$set` that excludes loyalty/wallet/coupon counters and behavioral fields (`total_visits`, `total_spent`, `last_visit`, `avg_order_value`). Demographics + addresses + sync metadata only. | **High** — silent field exclusion is easy to get wrong |

### Tests Required (L3)
- **Dry-run mode (recommended)** — add a `?dry_run=true` flag to the order_sync endpoint that logs what WOULD happen but doesn't write. Owner inspects output for one restaurant before live migration.
- **Idempotency test** — run customer_sync twice for the same restaurant; assert counters are NOT reset on second run (C11).
- **Helper parity test** — run order_sync for a small synthetic batch (10 orders); assert per-order `points_transactions` shape and customer counter growth matches what realtime would produce for the same orders one-by-one.
- **Order ordering test** — assert orders are processed in chronological order so tier upgrades fire at the correct moment (a customer hitting Silver mid-history should earn at Silver % for orders that come after the upgrade).

### L3 Owner Questions
- **Q-LB1** (F10 conflict) — blocking.
- Should `order_sync` log "tier upgraded at order X" events for audit?
- Should the dry-run output be machine-readable (JSON) or human-readable (table)?

---

## 8. Phase L4 — Manual / Cron Loyalty Consistency

### Goal
Manual redeem path and scheduled cron paths grow the same counters that
realtime + migration grow.

### Files Touched (L4)
| File | Change | Risk |
|---|---|---|
| `/app/backend/routers/points.py` | `create_points_transaction` — when `type=="redeem"`, also `$inc total_points_redeemed`. When `type in {"earn","bonus"}` AND `loyalty_enabled=true`, also `$inc total_points_earned`. | Low |
| `/app/backend/core/loyalty_jobs.py` | `run_birthday_bonus` + `run_anniversary_bonus` — switch from `$set total_points` to `$inc total_points + total_points_earned`. Recompute tier inline using `calculate_tier` from L1. Honor `loyalty_enabled` at job start. | Medium (cron territory) |

### Tests Required (L4)
- **Manual-redeem unit** — POST `/api/points/transaction` with `type=redeem, points=100`; assert customer's `total_points -= 100` and `total_points_redeemed += 100`.
- **Cron unit** — invoke `run_birthday_bonus` directly with a synthetic customer whose dob matches today; assert `total_points`, `total_points_earned`, `tier` all updated; assert `last_birthday_bonus_year` set; assert idempotency on second invocation same day.
- **`loyalty_enabled=false` test** — both manual earn-type and cron must skip writes when toggle is off.

### L4 Owner Questions
- Should expiry-job behavior change? (Currently `total_points_redeemed` is NOT touched by expiry. Stage A §8 ⚠️-N flagged the absence of an "expired" counter on customer profile. **Recommend: leave expiry as-is in L4.** Surface "expired" as a separate read-side card in CR-001C-V.)

---

## 9. Phase L5 — Cleanup / Dead-Code Removal

> Only runs **after L1–L4 are merged and QA'd in preview**.

### Goal
Remove the legacy code paths that the new helper replaces. Reduce
duplication, drift, and confusion.

### Dead Code Inventory (resolved in L5)

| File | Old Logic | Replacement | Remove When | Risk |
|---|---|---|---|---|
| `pos.py::_calculate_points` (wrapper from L1) | Inline body now wraps `core.loyalty.calculate_points` | Direct call | After L1+L2 QA passes | Low |
| `migration.py:276` `earn_percent = loyalty_settings.get("earn_percent", 0)` line | Broken — field never exists | `calculate_points()` call | L3 ships | Already broken, no risk |
| `customers.py:235–245` inline tier calc | Block-form `if points >= X: tier = Y` | `calculate_tier()` from L1 | C2 ships in L3 | Low |
| `customers.py:183–189` MyGenie loyalty/wallet/coupon aggregate reads | `mygenie_customer.get("loyalty_point", 0)`, etc. | Hard-init to 0 | C2 ships in L3 | Medium — verify no downstream code reads these from `customer_data` before the `$set` |
| `customers.py:303–347` synthetic backfill transactions | 4 conditional `points_transactions` / `wallet_transactions` inserts on new customer | Per-order rows from order_sync | C2 ships in L3 | Low |
| `pos.py:464–467` POS fallback `redemption_value=0.25` constants | Drift vs settings endpoint default (1.0) | One canonical default in `core/loyalty.py` constants | After L1 settles | Low |
| `helpers.py::calculate_tier` (if not re-exported) | Lives in helpers.py, gets imported by 4 callers | Re-home to `core/loyalty.py`, leave a re-export shim in helpers.py | L5 | Low |
| `pos.py:1226` `new_points = current_points + earned` calculation | Used for response payload and WhatsApp template | Compute from `$inc` result OR keep — not strictly dead | Decide at L5 | None — keep |
| Frontend label drift | "Total Earned" / "Total Redeemed" on CustomerDetailPage.jsx — already wired to correct fields, no change needed | — | n/a | None |

### L5 Owner Questions
- None blocking. **Q-LB4 = B** (clean up only after L1–L4 QA) is the only meta-question.

---

## 10. F10 / CR-003 Conflict Check

### Background
- **F10** — flagged during CR-001B audit. Migration's `order_sync` was awarding points per historical order, which double-counted against MyGenie's already-imported `total_points` snapshot.
- **Resolution at the time:** **deferred to CR-003 (Loyalty Points Flow)** because there was no safe way to dedup historical points without rules from the owner.

### The Conflict
Stage B proposal **C3** says migration order_sync should compute points
per order using the same helper as realtime. This is exactly the behavior
F10 deferred.

### Resolution Under Owner's New Framing
The owner explicitly stated (this session):

> "this is not in production yet … this is pre-production … everything will be
> clean data … no loyalty points we are migrating, no coupon goods we are
> migrating, nothing we are migrating … same helper which will be used to
> convert this into loyalty points during the real time, the same helper
> will be used here also."

This **clean-slate pre-prod policy** dissolves the F10 double-count
concern:

- **C2** stops pulling MyGenie's `loyalty_point` (no snapshot to double-count against).
- **C3** computes per-order from `order_amount` using one formula.
- Customer balance is **the sum of all order-derived points** — only one source.

So under the **current owner framing**, the F10 deferral can be overridden
**but only for clean go-live**.

### Required Guard

To make this safe for any future re-migration of a different restaurant
that might already have prod data, the implementation **must** include a
guard:

**Option C of Q-LB1** — a config flag `LOYALTY_CLEAN_SLATE_RECALC` (env
var or per-restaurant `loyalty_settings.clean_slate_mode: bool` flag).
When `true`:
- `customer_sync` zeros out aggregates (C2).
- `order_sync` computes per-order points (C3).

When `false` (default):
- `customer_sync` either trusts MyGenie aggregates OR raises an error
  prompting owner to set the flag.
- `order_sync` does NOT $inc total_points (current safe behavior).

### Recommended Answer to Q-LB1
**Option C** (config flag) — it makes the behavior explicit, auditable,
and reversible. Owner sets the flag per restaurant before triggering
migration. No accidental wipes on a re-migration of a prod-loaded
restaurant in the future.

### Phase L3 Status
**Blocked on Q-LB1 owner answer.** L1, L2, L4, L5 are not blocked.

---

## 11. Dead Code / Duplicate Logic Inventory

See §9 table (consolidated there to avoid duplication).

---

## 12. File Touch Map by Phase

| Phase | Files | Type of Change | Risk |
|---|---|---|---|
| **L1** | `core/loyalty.py` (NEW), `routers/pos.py` (replace `_calculate_points` body), `core/helpers.py` (re-export shim for `calculate_tier`) | Refactor + new file | Low |
| **L2** | `routers/pos.py` (`pos_order_webhook`, `_save_order_and_transactions` customer update, `_find_or_create_customer`, `create_customer`) | Behavior change in realtime POS write path | Medium |
| **L3** | `routers/migration.py` (order_sync loop), `routers/customers.py` (`sync_customers_from_mygenie` — both new-customer and existing-customer branches) | Behavior change in migration write path; **GATED on Q-LB1** | High |
| **L4** | `routers/points.py` (`create_points_transaction`), `core/loyalty_jobs.py` (birthday + anniversary jobs) | Behavior change in manual/cron paths | Low–Medium |
| **L5** | All files touched by L1–L4 (remove wrappers, remove dead branches, consolidate constants) | Cleanup | Low |
| **DEFERRED (C8)** | `routers/pos.py` (WhatsApp event fire) | Out of this CR | n/a |
| **DEFERRED (C9)** | `core/helpers.py`, `models/schemas.py`, `LoyaltySettingsPage.jsx` | Out of this CR | n/a |

---

## 13. QA Strategy by Phase

| Phase | Static QA | Runtime QA | Owner Smoke |
|---|---|---|---|
| **L1** | Parity tests (old vs new helper) over a synthetic battery; tier-mapping tests | Import smoke: backend boots; `/api/health` ✅ | Read code diff |
| **L2** | Motor-monkey-patched `_save_order_and_transactions` cases: ON/OFF kill-switch, first-visit, normal earn | Live HTTP probe (unauth → 401 confirms schema accepted); inspect 1 real test order's `customers` + `points_transactions` rows | Push 2–3 test POS orders on chosen restaurant; verify `total_points_earned` grows; verify off-toggle suppresses points |
| **L3** | Dry-run on synthetic 10-order batch; idempotency double-run; helper parity | Single-restaurant migration run on the owner-chosen test restaurant; inspect `points_transactions` count vs orders count | Owner triggers Sync Customers then Sync Orders on test restaurant; verifies customer profile counters match expected per-order math |
| **L4** | Unit harness for manual redeem; cron-direct invocation harness for birthday/anniversary | None additional | Manual: staff redeems points on a test customer via UI; verifies `total_points_redeemed` grows |
| **L5** | Re-run all L1–L4 harnesses to confirm cleanup didn't regress | Backend boots; `/api/health` ✅; `cr_001a_check.sh` Phase 1 regression still passes | None — pure cleanup |

---

## 14. Module Boundary Protection

These boundaries are **enforced** by this blueprint:

| Boundary | Treatment |
|---|---|
| **Wallet module (CR-001C-W)** | The only wallet-adjacent touch is **C2 clean-slate init** in `customer_sync` (zeroing `wallet_balance`, `total_wallet_received`, `total_wallet_used`). All other wallet logic (manual credit/debit, POS wallet debit, wallet_transactions writes) is **not touched**. |
| **Coupon module (CR-001C-C)** | Same as Wallet — only the clean-slate init zeros `total_coupon_used` and `last_coupon_used`. The current migration writes to `coupon_transactions` and `$inc total_coupon_used` (lines 301–321 of `migration.py`); these are **dropped** in L3 because Q-LOYALTY-5 says historical coupon data is not migrated. Coupon write-path correctness is deferred to CR-001C-C. |
| **Dashboard / Visibility (CR-001C-V)** | Not touched. Stage A ⚠️-M and ⚠️-N (dashboard expired-points + customer "expired" card) defer to CR-001C-V. |
| **WhatsApp Automation** | Not touched except if Q-LB6 = A (then C8 ships, otherwise deferred to WhatsApp CR). |
| **POS webhook schema** | Not touched. CR-001A Phase 1/2 owns this. |
| **Migration infrastructure** | The migration sync orchestration (`migration.py` outer loop, R689 scheduling, batching) is **not touched**. Only the per-order loyalty block inside `sync_orders_from_mygenie` is rewritten. |
| **CR-002 `pos_request_logs`** | Not touched. |
| **Authentication / `core/auth.py`** | Not touched. |
| **`core/database.py`** | Not touched. |
| **`core/scheduler.py`** | Not touched (jobs themselves change in L4; the scheduler that invokes them does not). |
| **Frontend `CustomerDetailPage.jsx`** | Not touched — fields already wired to the correct DB fields; once L1–L4 grow those fields correctly, the page is correct. |

---

## 15. Owner Question Gate

| Q | Question | Options | Blueprint Recommendation |
|---|---|---|---|
| **Q-LB1** | Should the F10 deferral be overridden for this clean-slate loyalty module? | A. Yes, for clean pre-prod/go-live only. B. No, keep migration points disabled; realtime only. C. Add a config flag `LOYALTY_CLEAN_SLATE_RECALC=true` and use it only during clean go-live setup. D. Defer migration points again. | **C** — explicit, auditable, reversible. **A** is acceptable if owner is comfortable with the lack of guard for any future re-migration. **B/D** make CR-001C-V dashboard cards wrong from day 1. |
| **Q-LB2** | Phasing approach? | A. Approve one phase at a time. B. Approve L1+L2 together, then gate L3, L4, L5 separately. C. Approve all phases in one batch. | **B** — L1+L2 are foundational + realtime correctness with low risk and tight coupling. L3 is the controversial one (F10). L4 is mechanical. L5 only runs after live verification. |
| **Q-LB3** | Shared helper scope (`core/loyalty.py`)? | A. Points only. B. Points + tier. C. Points + tier + bonus eligibility + redemption-value helpers. | **B** — Points + tier. Adding redemption helpers expands the surface (max_redemption_percent/amount, min_redemption_points) without clear benefit to this CR. Can be done in a later CR. |
| **Q-LB4** | Dead-code cleanup timing? | A. Same phase where replacement is introduced. B. Final cleanup phase L5 after QA proves replacement. C. Leave old code commented. | **B** — safer rollback path if L1–L4 reveal issues. |
| **Q-LB5** | Off-peak timezone (C9) — implement now? | A. Yes, configurable timezone + cross-midnight in Loyalty module. B. Only cross-midnight; keep IST fixed. C. Defer off-peak improvements. | **C** — Pre-prod is India-only; default 14:00–17:00 doesn't cross midnight. C9 expands i18n surface. Defer to a separate small CR if/when non-IST restaurant onboards. |
| **Q-LB6** | Tier-upgrade WhatsApp event (C8) — include in Loyalty or defer? | A. Include now if existing template/event mapping is already safe. B. Defer to WhatsApp Automation module. C. Implement event flag only, no WhatsApp send. | **B** — Owner's module breakdown explicitly excludes WhatsApp from CR-001C. The current `tier_upgrade` event already exists in `points.py` (manual path); duplicating it into realtime POS is safe but expands scope. Move to the next WhatsApp CR. |

---

## 16. Recommended Approval Bundle

The blueprint's recommended path:

1. **Approve L1 + L2 together** (single owner approval cycle).
   - Foundational refactor (L1) + realtime POS correctness (L2).
   - Low–medium risk; doesn't touch migration; doesn't override F10.
   - Owner reviews L1+L2 diff in preview before merge.

2. **Gate L3 on Q-LB1.**
   - Owner picks A or C (recommended C).
   - L3 implementation begins only after Q-LB1 answer.
   - Includes dry-run mode for migration to inspect output before live run.

3. **Approve L4 standalone.**
   - Mechanical. Low risk.
   - Can ship in parallel with L3 if owner prefers.

4. **L5 runs last, after L1–L4 QA passes in preview.**
   - Pure cleanup.
   - Re-runs all L1–L4 harnesses to prove no regression.

5. **Defer C8 and C9 to separate CRs.**
   - C8 → next WhatsApp Automation CR.
   - C9 → small i18n CR when non-IST restaurant onboards.

---

## 17. Implementation Readiness Verdict

**`cr001c_loyalty_blueprint_waiting_owner_answers`**

Blocking owner answers required before any code:
- **Q-LB1** — F10 conflict resolution (recommended: C — config flag).
- **Q-LB2** — phasing approach (recommended: B — L1+L2 together, gate L3+).
- **Q-LB3** — helper scope (recommended: B — points + tier).
- **Q-LB4** — cleanup timing (recommended: B — L5 after QA).
- **Q-LB5** — off-peak C9 timing (recommended: C — defer).
- **Q-LB6** — tier-upgrade WhatsApp C8 timing (recommended: B — defer).

Recommended reply format from owner:
`Q-LB1: C · Q-LB2: B · Q-LB3: B · Q-LB4: B · Q-LB5: C · Q-LB6: B`

After answers:
- If Q-LB1 ∈ {A, C}: Phase L1+L2 ready to implement. L3 ready after L1+L2 QA.
- If Q-LB1 = B: Phase L3 dropped; CR-001C-L scope shrinks to L1+L2+L4+L5; CR-001C-V dashboards will show points only from realtime orders.
- If Q-LB1 = D: CR-001C-L cannot close; module stays open pending CR-003.

---

## 18. Confirmations

- ✅ No code changed by this Stage B.1 blueprint
- ✅ No backend changed
- ✅ No frontend changed
- ✅ No DB read or written
- ✅ No env file modified
- ✅ No migration triggered
- ✅ No sync triggered
- ✅ No deploy
- ✅ No supervisor restart
- ✅ No other module (Coupons / Wallet / Visibility) inspected for change
- ✅ `/app/memory/final/` untouched
- ✅ Baseline docs (`CR_001_INDEX.md`, `CRM_1_0_OPEN_GAPS_REGISTER.md`) untouched
- ✅ Only one new file created: this blueprint

---

## ⏸ Hard Gate — Owner Answers Required

Reply with answers to Q-LB1 through Q-LB6 (multiple-choice). Once
answered, I will:
1. Lock the implementation scope per the answers.
2. Stage C (Test Setup) proposal for L1+L2 (assuming Q-LB2 = B).
3. Stop again for owner approval before any code touches anything.

No code, DB, migration, or env will be modified until this gate clears.
