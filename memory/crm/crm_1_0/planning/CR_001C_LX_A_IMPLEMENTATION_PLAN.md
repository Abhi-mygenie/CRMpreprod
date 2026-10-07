# CR-001C-LX Phase LX-A — Implementation Plan & Patch Checklist (REVISED)

**Module:** CR-001C-L (Loyalty) — bridge phase **LX**, stage **LX-A** (logic + schema patch)
**Date:** 2026-05-22
**Parent plan:** `CR_001C_LX_POS_BUG_108_API_CONTRACT_ALIGNMENT_PLAN.md`
**Mode:** Planning only — no code touched, no DB, no env, no migration, no deploy.
**Owner approval received:**
- "LX approved per defaults" (Q-LX1..6 → recommended)
- Patch all 3 read endpoints (Concern LX-A-#6 → A)
- **Override LX-A-#7 → replacement, not additive**
- **POS BUG-108 split into 3 CRM phases — Phase 1 (Loyalty) active now; Coupon and Wallet deferred (see §0)**

**Status target after owner says "go-implement":** `cr001c_lx_a_implementation_in_progress`
**Final status after QA passes:** `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview`

---

## 0. BUG-108 — 3-Phase CRM Split (Authoritative Scope)

POS BUG-108 is delivered by CRM in **three sequential phases**, one CRM CR each. Only Phase 1 is active in this LX-A plan.

| Phase | CR | Scope (BUG-108 mapping) | Status |
|---|---|---|---|
| **1 — Loyalty** | **CR-001C-L** | BUG-108 §3.3 (tier → ratio config) + the customer-loyalty read shape across `POST /pos/customer-lookup`, `GET /pos/customers/{id}`, `GET /pos/customers/{id}/loyalty`. Covers the full Loyalty lifecycle inside CR-001C-L: **L1, L2, L3, LX-A (this plan), L4, L5, final Loyalty QA, final POS handoff.** | **ACTIVE NOW** |
| **2 — Coupon** | **CR-001C-C** | BUG-108 §3.1 (`GET /pos/coupons/available`) + §3.2 (`POST /pos/coupons/validate` BUG-108-shaped body contract + `error.code` taxonomy) + customer-coupon entitlement model. | **DEFERRED** — opens after Phase 1 fully closes |
| **3 — Wallet** | **CR-001C-W** | BUG-108 wallet read-shape audit only (no write APIs in BUG-108 scope). Wallet debit / credit / reverse stay deferred to a future redemption CR. | **DEFERRED** — opens after Phase 2 |

### Scope statement (will be repeated in the POS handoff doc)

> "BUG-108 is handled in 3 CRM phases:
> 1. CR-001C-L Loyalty — active now
> 2. CR-001C-C Coupon — next
> 3. CR-001C-W Wallet — later
>
> This handoff covers only the Loyalty phase. Coupon and Wallet will receive separate CRM plans and handoffs."

### What "finish Phase 1 completely" means in CR-001C-L

The remaining cycle for Phase 1 (in order):

| Step | What | Status |
|---|---|---|
| L1 — shared `core/loyalty.py` helper | done | ✅ Complete |
| L2 — realtime POS loyalty correctness | done | ✅ Complete |
| L3 — migration clean-slate parity | controlled QA done | ✅ Controlled QA passed; ⏳ real owner-triggered migration validation pending |
| **LX-A — POS loyalty API response contract** | **this plan** | ⏸ Awaiting "go-implement" |
| L4 — manual redeem + birthday/anniversary cron `$inc` parity | not started | ⏸ Sequenced after LX-A |
| L5 — dead-code removal | not started | ⏸ Sequenced after L4 |
| Final Loyalty QA | not started | ⏸ Sequenced after L5 |
| Final POS handoff (Loyalty only) | DRAFT staged at `handoff/CR_001C_LX_POS_BUG_108_LOYALTY_API_HANDOFF_TO_POS.md` | ⏸ Banner flips to GREEN-LIGHT after final Loyalty QA |

### Hard rules for this active phase (Phase 1 — Loyalty)

- ❌ Do **not** implement Coupon (§3.1 / §3.2 / entitlement model / `error.code` taxonomy).
- ❌ Do **not** implement Wallet (read shape audit, debit/credit/reverse — none of it).
- ❌ Do **not** implement any redemption / debit / reversal endpoints.
- ❌ Do **not** start CR-001C-C or CR-001C-W implementation.
- ❌ Do **not** touch prod.
- ❌ Do **not** run migration unless owner manually triggers it and asks for verification.
- ❌ Do **not** touch `/app/memory/final/`.

---

## 1. Locked Decisions (Override Applied)

| ID | Decision |
|---|---|
| Q-LX1 | Pause L4, ship LX patch first. |
| Q-LX2 | Coupon endpoints belong to CR-001C-C. |
| Q-LX3 | **Option A** — extend existing endpoints; no new endpoint. |
| Q-LX4 | **Option A** — add 4 per-tier settings fields with backward-compatible helper fallback. |
| Q-LX5 | `ratio_per_point` = rupees per point. `points_value = total_points × ratio_per_point`. |
| Q-LX6 | L4 manual-redeem will pick up the new helper too (handled inside L4, not LX). |
| LX-A-#1 | Resolution happens in a helper, not in Pydantic class default. |
| LX-A-#2 | No DB migration. Existing `loyalty_settings` docs fall through helper to restaurant-level `redemption_value`. |
| LX-A-#3 | No admin UI in LX. Owner sets per-tier values via `PATCH /api/loyalty-settings` or direct Mongo until a tiny follow-up frontend touch ships in CR-001C-L close-out. |
| LX-A-#4 | Semantics: rupees-per-point. Locked. |
| LX-A-#5 | Keep `redemption_value` (restaurant-level) as fallback + add 4 per-tier fields. |
| LX-A-#6 | Patch **all 3** read endpoints via a single shared helper. |
| **LX-A-#7** | **OVERRIDE — REPLACEMENT, NOT ADDITIVE.** Old keys `redemption_value_per_point` and `points_monetary_value` are **REMOVED** from the POS-facing loyalty blob. POS-facing blob now contains **strictly 6 keys**: `tier`, `tier_label`, `total_points`, `ratio_per_point`, `points_value`, `loyalty_enabled`. Justification: pre-prod, no live POS consumer of old keys yet. |
| LX-A-#8 | POS contract mismatch on `/pos/coupons/validate` is CR-001C-C. |
| LX-A-#9 | If `loyalty_settings` missing → `loyalty.loyalty_enabled = false`; `ratio_per_point = 0.25`. |
| LX-A-#10 | `tier_label` derived as `f"{tier} Member"`. |

---

## 2. Final POS-Facing Loyalty Blob — 6 Keys (Locked)

```json
{
  "loyalty": {
    "tier": "Gold",
    "tier_label": "Gold Member",
    "total_points": 480,
    "ratio_per_point": 1.5,
    "points_value": 720.0,
    "loyalty_enabled": true
  }
}
```

**Removed (vs pre-LX shape):**
- `points_monetary_value` — superseded by `points_value`
- `redemption_value_per_point` — superseded by `ratio_per_point`
- `next_tier` — not in BUG-108 §3.3
- `points_to_next_tier` — not in BUG-108 §3.3
- `wallet_balance` — already top-level on customer detail / lookup; not nested
- `earn_rate_percent` — not requested by POS; out of scope for BUG-108
- `total_visits`, `total_spent` — top-level only (where they exist today)

> Frontend impact: any internal CRM admin page that reads these removed keys must read top-level fields instead. **The 3 POS endpoints touched in LX-A are not consumed by the CRM admin frontend** (`CustomerDetailPage.jsx`, `LoyaltySettingsPage.jsx`, etc. use the `/api/customers/*` admin endpoints, not `/pos/*`). Confirmed by grep of frontend src against `/pos/customer-lookup`, `/pos/customers/{`, `/pos/customers/{...}/loyalty`. **No frontend change required.**

---

## 3. Scope (In / Out)

### In — Phase LX-A

1. **Schema:** add 4 per-tier optional float fields to `LoyaltySettings` + `LoyaltySettingsUpdate`.
2. **Helper:** `get_redemption_value_for_tier(tier, settings)` in `core/helpers.py`.
3. **Helper:** `build_pos_loyalty_blob(customer, settings)` in `core/loyalty.py` (single source of truth, **6 keys only**).
4. **Read-path patches:** 3 endpoints in `routers/pos.py` use the shared helper.
5. **Static QA harness:** `/tmp/cr_001c_lx_a_static_qa.py`.
6. **Read-only smoke** on R689 via the running backend (no writes).
7. **Reports:** implementation report + QA report.
8. **POS handoff doc:** `/app/memory/crm/crm_1_0/handoff/CR_001C_LX_POS_BUG_108_LOYALTY_API_HANDOFF_TO_POS.md` (DRAFT staged now; finalized post-QA).

### Out — Phase LX-A

L4, L5, coupon module (CR-001C-C), wallet module (CR-001C-W), admin UI for per-tier values, migration code, realtime POS write-path, `/app/memory/final/`, prod deploy, supervisor/.env/dep changes, mutation of existing Mongo documents.

---

## 4. Files Touched (4 files, all `backend/`)

```
backend/models/schemas.py          +8  −0    (4 fields on LoyaltySettings, 4 optional on LoyaltySettingsUpdate)
backend/core/helpers.py            +14 −0    (1 new helper: get_redemption_value_for_tier)
backend/core/loyalty.py            +32 −0    (1 new helper: build_pos_loyalty_blob — 6 keys)
backend/routers/pos.py             +8  −55   (3 read-path call sites use build_pos_loyalty_blob;
                                               points_value in /customer-lookup uses helper)
```

Net effect with override: ~62 lines added, ~55 lines removed (more deletion now that old keys are dropped). Smaller blast radius than additive approach.

---

## 5. Patch Sketches (planning only — not yet applied)

### 5.1 `models/schemas.py` — `LoyaltySettings` + `LoyaltySettingsUpdate`

Insert immediately after `redemption_value: float = 1.0` (current line 590) in `LoyaltySettings`:

```python
# CR-001C-LX Phase LX-A (2026-05-22) — per-tier monetary value of a point.
# Resolution at request time: per-tier override > restaurant-level
# `redemption_value` > 0.25 default. No DB migration needed; existing
# `loyalty_settings` docs use the fallback transparently.
bronze_redemption_value: Optional[float] = None
silver_redemption_value: Optional[float] = None
gold_redemption_value: Optional[float] = None
platinum_redemption_value: Optional[float] = None
```

Same 4 fields added to `LoyaltySettingsUpdate` (already all `Optional`):

```python
bronze_redemption_value: Optional[float] = None
silver_redemption_value: Optional[float] = None
gold_redemption_value: Optional[float] = None
platinum_redemption_value: Optional[float] = None
```

### 5.2 `core/helpers.py` — new resolver helper

Append at end of file:

```python
def get_redemption_value_for_tier(tier: str, settings: dict) -> float:
    """Resolve rupees-per-point for a given tier (CR-001C-LX-A).

    Lookup order:
      1. settings.{tier.lower()}_redemption_value   (per-tier override)
      2. settings.redemption_value                  (restaurant-level)
      3. 0.25                                       (legacy hardcoded fallback)
    """
    if not settings:
        return 0.25
    per_tier = settings.get(f"{tier.lower()}_redemption_value")
    if per_tier is not None:
        return float(per_tier)
    rest = settings.get("redemption_value")
    if rest is not None:
        return float(rest)
    return 0.25
```

### 5.3 `core/loyalty.py` — POS-facing blob builder (6 keys only)

Append at end of file:

```python
def build_pos_loyalty_blob(customer: dict, settings: dict) -> dict:
    """Compose the POS-facing `loyalty` blob (CR-001C-LX-A).

    Single source of truth for `/pos/customers/{id}`,
    `/pos/customers/{id}/loyalty`, and the `points_value` field in
    `/pos/customer-lookup`.

    Returns STRICTLY 6 keys per LX-A-#7 (replacement, not additive):
      tier, tier_label, total_points, ratio_per_point, points_value,
      loyalty_enabled.

    Pre-LX keys (points_monetary_value, redemption_value_per_point,
    next_tier, points_to_next_tier, wallet_balance, earn_rate_percent)
    are intentionally NOT returned.
    """
    from core.helpers import get_redemption_value_for_tier

    tier = customer.get("tier", "Bronze")
    total_points = customer.get("total_points", 0)
    ratio_per_point = get_redemption_value_for_tier(tier, settings or {})
    points_value = round(total_points * ratio_per_point, 2)
    loyalty_enabled = bool((settings or {}).get("loyalty_enabled", False))

    return {
        "tier": tier,
        "tier_label": f"{tier} Member",
        "total_points": total_points,
        "ratio_per_point": ratio_per_point,
        "points_value": points_value,
        "loyalty_enabled": loyalty_enabled,
    }
```

### 5.4 `routers/pos.py` — patch 3 call sites

**Import update (top of file):** add `build_pos_loyalty_blob` to the existing `from core.loyalty import ...` line.

**5.4.1 `pos_customer_lookup` (lines 1682-1724)**

Today's response is a flat dict with `points_value` computed from restaurant-level `redemption_value`. Per POS inventory §2.2, this endpoint stays **flat** (no nested loyalty blob). Only the `points_value` field becomes tier-aware.

Replace lines 1702-1715 region:

```python
settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
blob = build_pos_loyalty_blob(customer, settings)
```

In the return data dict, replace `"points_value": round(customer.get("total_points", 0) * redemption_value, 2)` with `"points_value": blob["points_value"]`. All other flat fields in the response (`registered`, `customer_id`, `name`, `phone`, `tier`, `total_points`, `wallet_balance`, `total_visits`, `total_spent`, `allergies`, `favorites`, `last_visit`, `addresses`) **stay unchanged**.

> Result: lookup response shape identical to today's POS inventory §2.2; only `points_value` is now tier-aware.

**5.4.2 `pos_get_customer_full` (lines 2017-2061)**

Replace lines 2029-2057 (the 29-line inline computation + the `customer["loyalty"] = { ... }` block) with:

```python
settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
recent_orders = await db.orders.find(
    {"customer_id": customer_id, "user_id": user["id"]},
    {"_id": 0, "id": 1, "pos_order_id": 1, "order_amount": 1,
     "order_type": 1, "items": 1, "points_earned": 1, "created_at": 1}
).sort("created_at", -1).limit(5).to_list(5)

customer["loyalty"] = build_pos_loyalty_blob(customer, settings)
customer["recent_orders"] = recent_orders
customer["addresses"] = customer.get("addresses", [])
```

> Result: top-level customer doc unchanged (still carries `wallet_balance`, `total_points`, `tier`, etc.); nested `loyalty` blob is now the **strict 6-key shape**.

**5.4.3 `pos_customer_loyalty` (lines 2296-2328)**

Replace lines 2303-2327 (entire inline computation + return block) with:

```python
settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
blob = build_pos_loyalty_blob(customer, settings)
return POSResponse(success=True, message="Loyalty summary", data=blob)
```

> Result: endpoint returns the **strict 6-key blob** as the entire data payload. `total_visits` and `total_spent` previously returned here are dropped (they're available on `GET /pos/customers/{id}` top-level for any caller that needs them).

### 5.5 Endpoints NOT touched in LX-A

`POST /pos/customers` (line 201), `PUT /pos/customers/{id}` (358), `POST /pos/max-redeemable` (442), `POST /pos/orders` (1168), `POST /pos/webhook/payment-received` (1347), `GET /pos/customers` search (1980), `POST /pos/coupons/validate` (2335), `POST /pos/coupons/apply` (2379), all address endpoints (2086-2238), `GET /pos/customers/{id}/orders` (2275), `GET /pos/customers/{id}/notes/*` (2416, 2457). All migration, wallet, points, scan, feedback, whatsapp, auth, analytics, scheduler files. Frontend. Existing `loyalty_settings` documents.

---

## 6. Static QA Harness — `/tmp/cr_001c_lx_a_static_qa.py`

Mocks: motor + httpx. Real Mongo NOT touched. Pattern follows the L3 static QA harness.

### 6.1 Test matrix (target: ~50 assertions)

| # | Scenario | Assertions |
|---|---|---|
| QA-1 | **Restaurant-level fallback (no per-tier set)** — settings has only `redemption_value=0.5`, Silver customer, `total_points=200` | `blob.ratio_per_point == 0.5`; `blob.points_value == 100.0` (2) |
| QA-2 | **Per-tier override wins** — `silver_redemption_value=1.2`, `redemption_value=0.5`, Silver customer, `total_points=200` | `blob.ratio_per_point == 1.2`; `blob.points_value == 240.0` (2) |
| QA-3 | **Customer tier not overridden** — only `gold_redemption_value=1.5` set; Bronze customer | `blob.ratio_per_point == 0.5` (falls through to restaurant-level) (1) |
| QA-4 | **All 4 per-tier set** — 4 distinct customers | 4 distinct `ratio_per_point` values returned (4) |
| QA-5 | **`loyalty_enabled=False`** — kill-switch active | `blob.loyalty_enabled == False`; `blob.points_value` still computed numerically (read-side does not zero it); `blob.total_points` unchanged (3) |
| QA-6 | **`loyalty_settings` doc missing** — `find_one` returns `None` | `blob.ratio_per_point == 0.25`; `blob.points_value == round(total_points * 0.25, 2)`; `blob.loyalty_enabled == False` (3) |
| QA-7 | **`tier_label` derivation** — 4 tier customers | `blob.tier_label == "Bronze Member"`, `"Silver Member"`, `"Gold Member"`, `"Platinum Member"` (4) |
| QA-8 | **Strict 6-key shape** — `set(blob.keys()) == {tier, tier_label, total_points, ratio_per_point, points_value, loyalty_enabled}` across all scenarios above | (1 per scenario, 9 scenarios = 9) |
| QA-9 | **Removed keys absent** — none of `points_monetary_value`, `redemption_value_per_point`, `next_tier`, `points_to_next_tier`, `wallet_balance`, `earn_rate_percent`, `total_visits`, `total_spent` in `blob` | 8 negative assertions × 1 customer = 8 |
| QA-10 | **`/pos/customer-lookup` `points_value` tier-aware** — call site test with same customer as QA-2 | Lookup response `points_value == 240.0`; lookup response keys unchanged vs pre-LX (key set equality) (2) |
| QA-11 | **`/pos/customers/{id}` `loyalty` blob** — call site test | `customer.loyalty` is strict 6-key dict; `customer` top-level still carries `name`, `phone`, `wallet_balance`, `total_points`, `tier`, `recent_orders`, `addresses` (8) |
| QA-12 | **`/pos/customers/{id}/loyalty` payload** — call site test | Response `data` is strict 6-key dict; no `total_visits`/`total_spent` (3) |
| QA-13 | **Tier defaults** — customer with `tier` key missing | `blob.tier == "Bronze"`; `blob.tier_label == "Bronze Member"` (2) |
| QA-14 | **Zero points** — `total_points=0` | `blob.points_value == 0.0` (1) |
| QA-15 | **L3 helper regression** — `calculate_points` + `calculate_tier` produce same outputs as L3 inputs | 5 |

**Target: ~51 assertions, 0 failures.**

### 6.2 Lint + service health

- `ruff check backend/{models/schemas.py,core/helpers.py,core/loyalty.py,routers/pos.py}` — no new findings vs pre-LX baseline.
- `sudo supervisorctl restart backend` → `curl http://localhost:8001/api/health == 200`.

### 6.3 Read-only smoke on R689

1. Get R689's API key (admin endpoint `GET /api/pos/api-key`).
2. `curl -H "X-API-Key: …" /api/pos/customers/{R689_existing_customer_id}` — confirm strict 6-key blob.
3. `curl -H "X-API-Key: …" /api/pos/customers/{R689_existing_customer_id}/loyalty` — confirm strict 6-key payload.
4. `curl -X POST … /api/pos/customer-lookup -d '{"phone":"…"}'` — confirm `points_value` matches `total_points * ratio_per_point`.
5. **Optional** owner-driven test: `PATCH /api/loyalty-settings` with `{"silver_redemption_value": 1.5}`, re-run step 3, assert `ratio_per_point == 1.5`. **Revert** to `null` afterwards.

No writes to customers/orders/points_transactions/wallet_transactions at any step.

### 6.4 Regression smoke

- `git diff --name-only` must show exactly 4 files: `backend/models/schemas.py`, `backend/core/helpers.py`, `backend/core/loyalty.py`, `backend/routers/pos.py`. No other file changed.

---

## 7. Risk Matrix (Override-adjusted)

| # | Risk | Mitigation | Coverage |
|---|---|---|---|
| R-1 | New per-tier fields persist as `null` for existing restaurants | `get_redemption_value_for_tier` falls through `null` → restaurant-level → 0.25 | QA-1, QA-3 |
| R-2 | Pydantic rejects older clients' POST/PATCH bodies | All 4 new fields `Optional[float] = None` | Implicit |
| R-3 | **Removed keys break a hidden consumer** | Pre-prod, no live POS; grep of frontend src confirms no internal use. **POS handoff doc spells out the removed keys.** | Doc, not test |
| R-4 | Realtime POS write-path drifts | Untouched in LX-A (Q-LX6 = A applies in L4) | Not touched |
| R-5 | `loyalty_enabled=false` confuses POS when `points_value > 0` | Blob still returns numeric `points_value`; POS frontend decides display | QA-5; documented in handoff |
| R-6 | `tier` field unknown string | Defaults to "Bronze" | QA-13 |
| R-7 | `loyalty_settings` missing `loyalty_enabled` key | `(settings or {}).get("loyalty_enabled", False) → False` | QA-6 |

---

## 8. Sequence (after owner says "go-implement")

| Step | Action | Artifact |
|---|---|---|
| 1 | Apply 4 file patches per §5 | `git diff` on 4 files |
| 2 | `ruff check` on the 4 files | Lint pass |
| 3 | Run `/tmp/cr_001c_lx_a_static_qa.py` | ~51/51 pass target |
| 4 | `sudo supervisorctl restart backend` | health endpoint 200 |
| 5 | Read-only smoke on R689 (§6.3) | 3-5 curl checks |
| 6 | Revert any smoke-only settings on R689 | R689 baseline restored |
| 7 | Write `implementation/CR_001C_LX_A_IMPLEMENTATION_REPORT.md` + `qa/CR_001C_LX_A_QA_REPORT.md` | Status → `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` |
| 8 | **Finalize** `handoff/CR_001C_LX_POS_BUG_108_LOYALTY_API_HANDOFF_TO_POS.md` — fill QA evidence section + flip status | Handoff doc ready for POS team |
| 9 | Stop; await owner gate to proceed to L4 | — |

Total estimated effort: ~half day for implementation + harness + smoke + reports + handoff finalization.

---

## 9. Out-of-Scope Re-confirmation

- ❌ Coupon APIs (CR-001C-C)
- ❌ Wallet APIs (CR-001C-W)
- ❌ Redemption/debit/reversal endpoints (future CR)
- ❌ Frontend admin UI for per-tier values
- ❌ Migration code changes
- ❌ Realtime POS write-path changes
- ❌ `/app/memory/final/` writes
- ❌ Prod deploy
- ❌ Supervisor / .env / dependency changes
- ❌ Mutation of any existing Mongo documents

---

## 10. POS Handoff Document — Staged Now, Finalized Post-QA

Path: `/app/memory/crm/crm_1_0/handoff/CR_001C_LX_POS_BUG_108_LOYALTY_API_HANDOFF_TO_POS.md`

A **DRAFT** is being staged at this path **alongside** this LX-A plan so POS team has the full target contract for pre-review. The DRAFT contains:
- Final endpoint list
- Final 6-key response shape with concrete Bronze/Silver/Gold sample responses
- Explicit list of removed keys
- Fallback behavior
- Coupon endpoints → CR-001C-C deferral
- Wallet endpoints → CR-001C-W deferral
- Redemption/reversal → future CR deferral
- **QA Evidence section marked PENDING — fills in after go-implement + QA pass**
- **Status field marked DRAFT — flips to GREEN-LIGHT once QA passes**

Until QA passes, the handoff doc's top banner clearly says **`STATUS: DRAFT (contract locked, QA pending)`**. After QA passes (step 8 above), top banner becomes **`STATUS: GREEN-LIGHT — POS may consume`**.

---

## 11. Confirmations (planning hygiene)

- ✅ No code changed
- ✅ No DB mutated
- ✅ No env changed
- ✅ No migration triggered
- ✅ No deploy
- ✅ No supervisor restart
- ✅ L4 not started
- ✅ Coupon implementation not started
- ✅ Wallet implementation not started
- ✅ `/app/memory/final/` untouched
- ✅ Existing L1/L2/L3 reports untouched
- ✅ Existing `redemption_value` field semantics preserved
- ✅ Override LX-A-#7 (replacement, not additive) applied
- ✅ POS BUG-108 inventory preserved verbatim at `planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md`
- ✅ Handoff doc DRAFT staged at `handoff/...` (planning artifact, not yet finalized)

---

## 12. ⏸ Hard Gate — Owner Action Required

This document is **planning only**. No code, schema, helper, or test harness exists yet. Reply with one of:

1. **"Go-implement LX-A"** → I apply patches §5.1 → §5.4, run §6 QA, write the two close-out reports, finalize the handoff doc, stop at the L4 gate.
2. **"LX-A approved with overrides: [...]"** → I revise this plan and republish.
3. **"Hold — clarify [item]"** → I clarify before any further step.

**No implementation, migration, or deploy starts until this gate clears.**

Status: `cr001c_lx_a_loyalty_pos_contract_patched_qa_passed_in_preview` (advanced from `cr001c_lx_a_implementation_plan_awaiting_go_implement` on 2026-05-23)
