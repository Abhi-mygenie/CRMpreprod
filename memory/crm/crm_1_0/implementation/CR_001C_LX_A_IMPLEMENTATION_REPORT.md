# CR-001C-LX Phase LX-A — Implementation Report

**Module:** CR-001C-L (Loyalty) — bridge phase **LX**, stage **LX-A**
**Date:** 2026-05-23
**Status:** **`cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`**
**Parent plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_LX_A_IMPLEMENTATION_PLAN.md`

---

## 1. Summary

Patched the 3 POS read endpoints (`POST /pos/customer-lookup`,
`GET /pos/customers/{id}`, `GET /pos/customers/{id}/loyalty`) so POS reads
tier-aware loyalty values from CRM instead of relying on a hardcoded 1:1
ratio. All 3 endpoints now compose their loyalty payload via a single
shared helper `core.loyalty.build_pos_loyalty_blob(customer, settings)`
returning the **strict 6-key** shape locked in LX-A §2:

```json
{
  "tier": "...", "tier_label": "...", "total_points": ...,
  "ratio_per_point": ..., "points_value": ..., "loyalty_enabled": ...
}
```

Per-tier configuration support added to `LoyaltySettings` /
`LoyaltySettingsUpdate` (4 optional float fields). No DB migration needed:
existing `loyalty_settings` documents continue to work via the
restaurant-level `redemption_value` fallback.

Override **LX-A-#7 (replacement, not additive)** applied — old keys
`points_monetary_value`, `redemption_value_per_point`, `next_tier`,
`points_to_next_tier`, nested `wallet_balance`, `earn_rate_percent`,
`total_visits`, `total_spent` are no longer returned inside the POS
loyalty blob. The CRM admin frontend does not consume any of these from
`/pos/*` endpoints (verified by grep against frontend `src/`).

---

## 2. Files Changed (exactly 4)

```
backend/models/schemas.py     +17 lines  (4 fields on LoyaltySettings, 4 optional on LoyaltySettingsUpdate, comments)
backend/core/helpers.py       +20 lines  (get_redemption_value_for_tier helper)
backend/core/loyalty.py       +35 lines  (build_pos_loyalty_blob helper)
backend/routers/pos.py        +14 / −45  (3 read-path patches + import)
```

Verified via `git diff --name-only HEAD` — only these 4 files modified.

### 2.1 `backend/models/schemas.py`

- `LoyaltySettings`: 4 optional per-tier fields inserted after
  `redemption_value` (defaults `None`, fall through helper).
- `LoyaltySettingsUpdate`: same 4 fields as `Optional[float] = None`.

### 2.2 `backend/core/helpers.py`

- New `get_redemption_value_for_tier(tier, settings) -> float`.
- Lookup order: per-tier override → restaurant-level `redemption_value` →
  `0.25` default.

### 2.3 `backend/core/loyalty.py`

- New `build_pos_loyalty_blob(customer, settings) -> dict`.
- Returns strictly 6 keys. Local-imports `get_redemption_value_for_tier`
  to avoid a circular import with `core.helpers.calculate_tier` shim.

### 2.4 `backend/routers/pos.py`

- Added `from core.loyalty import build_pos_loyalty_blob`.
- `pos_customer_lookup` (`POST /pos/customer-lookup`): the lookup
  response stays flat per POS inventory §2.2; only `points_value` is now
  tier-aware (uses `blob["points_value"]`). All other flat fields
  unchanged.
- `pos_get_customer_full` (`GET /pos/customers/{id}`): the nested
  `customer["loyalty"]` blob is now the strict 6-key shape. Top-level
  customer doc (including `wallet_balance`, `total_points`, `tier`,
  `recent_orders`, `addresses`) is unchanged.
- `pos_customer_loyalty` (`GET /pos/customers/{id}/loyalty`): response
  `data` is the strict 6-key blob. `total_visits` / `total_spent` that
  were previously inlined here are dropped (still available at top-level
  of `GET /pos/customers/{id}`).

---

## 3. Owner-Approved Decisions Applied

| ID | Decision | Reflected in |
|---|---|---|
| Q-LX1 | Pause L4, ship LX patch first. | LX-A live in preview |
| Q-LX3 | Option A — extend existing endpoints, no new endpoint. | `routers/pos.py` |
| Q-LX4 | Add 4 per-tier settings fields with backward-compatible fallback. | `models/schemas.py`, `core/helpers.py` |
| Q-LX5 | `ratio_per_point` = rupees per point. `points_value = total_points × ratio_per_point`. | `build_pos_loyalty_blob` |
| LX-A-#1 | Resolution in helper, not in Pydantic class default. | `get_redemption_value_for_tier` |
| LX-A-#2 | No DB migration. Existing `loyalty_settings` docs fall through helper. | Smoke step (§4.3) confirmed on R 18march |
| LX-A-#6 | Patch all 3 read endpoints via a single shared helper. | All 3 use `build_pos_loyalty_blob` |
| LX-A-#7 | **Replacement, not additive.** Old keys dropped. | `build_pos_loyalty_blob` returns exactly 6 keys |
| LX-A-#9 | If `loyalty_settings` missing → `loyalty_enabled = false`, `ratio_per_point = 0.25`. | `build_pos_loyalty_blob` + QA-6 |
| LX-A-#10 | `tier_label = f"{tier} Member"`. | `build_pos_loyalty_blob` + QA-7 |

---

## 4. Verification Evidence

### 4.1 Lint

`ruff check /app/backend/{models/schemas.py,core/helpers.py,core/loyalty.py,routers/pos.py}` → **0 new findings** in the 4 touched files. (4 pre-existing findings in unrelated `routers/analytics.py`, `routers/customers.py`, `services/analytics_service.py` are out of LX-A scope.)

### 4.2 Service health

```
sudo supervisorctl restart backend  → started
curl http://localhost:8001/api/health → 200 {"status":"healthy", ...}
```

### 4.3 Static QA — `/tmp/cr_001c_lx_a_static_qa.py`

**63 passed / 0 failed** (target was ~51). Coverage matrix:

| Section | Scenario | Assertions | Result |
|---|---|---|---|
| QA-1 | Restaurant-level fallback (no per-tier) | 2 | ✅ |
| QA-2 | Per-tier override wins | 2 | ✅ |
| QA-3 | Customer tier not overridden falls through | 1 | ✅ |
| QA-4 | All 4 per-tier set, 4 customers | 4 | ✅ |
| QA-5 | `loyalty_enabled=False` kill-switch | 3 | ✅ |
| QA-6 | `loyalty_settings` missing (None) | 3 | ✅ |
| QA-7 | `tier_label` derivation × 4 tiers | 4 | ✅ |
| QA-8 | Strict 6-key shape × 9 scenarios | 9 | ✅ |
| QA-9 | Removed keys absent (8 negative) | 8 | ✅ |
| QA-10 | `/pos/customer-lookup` `points_value` tier-aware + flat key-set unchanged | 2 | ✅ |
| QA-11 | `/pos/customers/{id}` blob + top-level preserved | 9 | ✅ |
| QA-12 | `/pos/customers/{id}/loyalty` strict 6-key, no `total_visits`/`total_spent` | 3 | ✅ |
| QA-13 | Tier defaults to Bronze | 2 | ✅ |
| QA-14 | Zero points | 1 | ✅ |
| QA-15 | L3 helper regression (`calculate_points`, `calculate_tier`) | 5 | ✅ |
| QA-16 | `get_redemption_value_for_tier` isolation | 5 | ✅ |
| **Total** | | **63** | **63 PASS / 0 FAIL** |

### 4.4 Live read-only smoke on preview Mongo (restaurant `18march` — `pos_0001_restaurant_478`)

> The plan named R689; in the running pre-prod data the comparable
> readiness profile is restaurant `18march` (has `loyalty_settings`
> + non-zero customer balances). Read-only smoke executed there.

| Step | Action | Expected | Got | Pass |
|---|---|---|---|---|
| 1 | `GET /api/pos/customers/{cust_id}` (Bronze, 128 pts, no per-tier override, `redemption_value=0.25`, `loyalty_enabled` missing) | strict 6-key blob: `ratio_per_point=0.25`, `points_value=32.0`, `loyalty_enabled=false` | exactly that | ✅ |
| 2 | `GET /api/pos/customers/{cust_id}/loyalty` | strict 6-key payload identical to nested blob from step 1 | exactly that | ✅ |
| 3 | `POST /api/pos/customer-lookup` (`phone=9742526341`, tier Bronze, 0 pts, default settings) | flat lookup shape unchanged vs pre-LX; `points_value=0.0` | exactly that; flat key-set equal to pre-LX | ✅ |
| 4 | Owner-style per-tier override: `PATCH-equivalent` set `bronze_redemption_value=1.5`; re-fetch loyalty for the 128-pt customer | `ratio_per_point=1.5`, `points_value=192.0` | exactly that | ✅ |
| 5 | Revert `bronze_redemption_value` to `None`; re-fetch | `ratio_per_point` falls back to restaurant-level `0.25` | exactly that | ✅ |
| 6 | Top-level customer doc fields preserved on `GET /pos/customers/{id}` | `name`, `phone`, `wallet_balance`, `total_points`, `tier`, `recent_orders`, `addresses` all present at top-level | all present | ✅ |

**No writes to customers / orders / `points_transactions` / `wallet_transactions` at any step.** The single mutation (per-tier value smoke) was reverted immediately and verified via re-fetch.

### 4.5 Regression scope

`git diff --name-only HEAD` →

```
backend/core/helpers.py
backend/core/loyalty.py
backend/models/schemas.py
backend/routers/pos.py
```

Exactly the 4 files in plan §4. No other file changed.

---

## 5. Status Transition

| State | Before | After |
|---|---|---|
| LX-A | `cr001c_lx_a_implementation_plan_awaiting_go_implement` | **`cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`** |

---

## 6. Out-of-Scope Re-confirmation

- ❌ L4 — not started
- ❌ L5 — not started
- ❌ Coupon (CR-001C-C) — not started
- ❌ Wallet (CR-001C-W) — not started
- ❌ Redemption / debit / reversal endpoints — not built
- ❌ Migration code — not touched
- ❌ Realtime POS write-path (`_save_order_and_transactions`) — not touched
- ❌ Frontend admin UI for per-tier values — not built
- ❌ Prod deploy — not done
- ❌ Supervisor / `.env` / dependency changes — none
- ❌ `/app/memory/final/` — untouched
- ❌ Existing L1/L2/L3 reports — untouched
- ❌ Mutation of existing Mongo documents — only the smoke per-tier value
  was set and reverted; no other mutation

---

## 7. Next Step

Awaiting owner go-ahead to resume L4 (manual redeem + birthday/anniversary
cron `$inc` parity). Per Q-LX6 default A, L4's manual-redeem path should
read `get_redemption_value_for_tier(...)` so redemption math stays
consistent with POS-read math.

POS team can immediately consume the 3 endpoints — the handoff doc
banner has been flipped to **GREEN-LIGHT**.

---

## 8. Confirmations

- ✅ Code applied per plan §5 (4 files)
- ✅ Static QA 63/63 PASS
- ✅ Live smoke on `18march` PASS (5/5 steps)
- ✅ Backend service healthy after restart
- ✅ Lint clean on touched files
- ✅ `git diff --name-only HEAD` shows exactly the 4 expected files
- ✅ L4/L5/Coupon/Wallet not started
- ✅ `/app/memory/final/` untouched
- ✅ Existing L3 reports untouched (verbatim status preserved)
- ✅ POS handoff doc finalized (banner = GREEN-LIGHT, §9 evidence filled)
