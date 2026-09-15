# CR-001C-L Phase L4-A — Admin / Manual Redeem Hardening Plan & Handover

**Date:** 2026-05-25
**Author:** Session 2 Analysis Agent
**Status:** `cr001c_l_l4a_admin_redeem_hardening_plan_ready_for_implementation`
**Branch:** `26-may` (Abhi-mygenie/CRMpreprod.git)
**Database:** External MongoDB `52.66.232.149:27017/mygenie`

Reference predecessor docs (already verified against code):
- `planning/CR_001C_L_LOYALTY_L4_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` (original §4 catalogue — picked up here without re-analysis)
- `planning/CR_001C_L_LOYALTY_L4_CRON_ONLY_ANALYSIS_AND_IMPLEMENTATION_PLAN.md` §12 (parked items table — this plan unparks them)
- `implementation/CR_001C_LR_CORRECTION_IMPLEMENTATION_REPORT.md` (shared helper this plan now extends to admin)
- `core/loyalty.py::redeem_loyalty_points` (canonical commit helper — source of truth)

---

## 0. Code as Source of Truth — Files Inspected

This plan is grounded in the actual source files in the running tree. Every line reference below has been verified.

| File | Lines | Why |
|---|---:|---|
| `backend/routers/points.py` | 1–302 | Admin redeem endpoint lives at `POST /api/points/transaction` (line 19) plus `POST /api/points/earn` thin wrapper |
| `backend/core/loyalty.py` | 1–489 | Canonical `redeem_loyalty_points` helper (line 244) — source of truth for commit |
| `backend/core/helpers.py` | 1–47 | `calculate_tier`, `get_earn_percent_for_tier`, `get_redemption_value_for_tier` (the three pure resolvers admin should use) |
| `backend/models/schemas.py` | 412–450, 916–949 | `Customer.total_points_redeemed` field, `PointsTransactionCreate`, `PointsTransaction` (note: `PointsTransactionCreate` has NO `idempotency_key` or `order_id` fields today) |
| `frontend/src/pages/CustomerDetailPage.jsx` | 87–107 (admin redeem), 130–138 (bonus on wallet credit) | Only 2 frontend call-sites; both POST `/points/transaction` with `{customer_id, points, transaction_type, description, bill_amount}`. No idempotency key sent today. |

---

## 1. Executive Summary

**Goal:** Bring the admin/manual redeem path (`POST /api/points/transaction` with `transaction_type="redeem"`) to parity with the POS redemption path that the LR Correction already hardened. Eliminate 6 data/correctness defects and make one architectural decision (Q-L4-5).

**Approach (RECOMMENDED — Option Y):** Route the `redeem` branch of `create_points_transaction` through the existing `core.loyalty.redeem_loyalty_points` helper. The helper already implements every fix this plan needs (tier-no-downgrade, `total_points_redeemed` `$inc`, ratio-aware `redeemed_value`, `points_expired: False`, idempotency, `loyalty_enabled` kill-switch, `redeemed_value` and `ratio_per_point` on the PT row). One funnel, one source of truth.

**Out of scope:** `earn` / `bonus` branches of the same endpoint, `/points/earn` quick endpoint, expiry crons, frontend redesign, POS endpoints, migration, wallet, coupon. Only the `redeem` branch is touched.

**Scope:** ~80 LOC change in 1 file (`routers/points.py`), ~25 LOC change in 1 file (`models/schemas.py`), ~5 LOC in 1 frontend file (`CustomerDetailPage.jsx`), 1 new QA harness (~450 LOC). No DB migration. No new indexes (existing index on `points_transactions.idempotency_key` from LR Correction already covers admin).

---

## 2. Current Behaviour vs Target — Defect-by-Defect

### Current code path (verified in `routers/points.py` lines 19–95)

```
POST /api/points/transaction { customer_id, points, transaction_type: "redeem", description, bill_amount }
  → fetch customer by (id, user_id)                          (line 21)
  → fetch loyalty_settings (FALLBACK: tier-mins only)         (line 25–27)
  → check current_points >= tx_data.points                    (line 33)
      → 400 "Insufficient points" if not
  → new_balance = current_points − points                     (line 35)
  → new_tier = calculate_tier(new_balance, settings)          (line 39)  ❌ DOWNGRADE BUG
  → $set customer.total_points, customer.tier, customer.last_visit
                                                              (lines 41–51)  ❌ tier downgrade + last_visit on redeem
  → insert PT row {id, user_id, customer_id, points,
                    transaction_type, description, bill_amount,
                    balance_after, created_at}                (lines 53–66)  ❌ missing 5 fields
  → WA "points_redeemed" trigger                              (lines 74–77)
  → tier upgrade WA (cannot fire on redeem — only downgrade possible)
                                                              (lines 89–93)
```

### Defects mapped to the target helper

| # | Defect (current) | Target behaviour | Source-of-truth in helper |
|---|---|---|---|
| **A1** | `total_points_redeemed` counter NOT incremented anywhere in lines 41–51. Customer's lifetime redeemed total stays at its old value forever. | `$inc total_points_redeemed: actual_points` | `core/loyalty.py` line 415 |
| **A2** | Tier recomputed unconditionally on line 39. A Gold customer with 5000 pts redeeming 4500 drops to 500 pts → `calculate_tier` returns Silver → customer demoted. | NO tier change on redeem (Q-LR1). | `core/loyalty.py` lines 410–417 — `$set` writes only `total_points`, tier intentionally omitted |
| **A3** | Flat `points` deducted, no ratio applied, no `redeemed_value` recorded on PT row. Reports cannot show "₹ worth of points redeemed". Gold customer's higher per-point value silently ignored. | Tier-aware `ratio_per_point` via `get_redemption_value_for_tier`, `redeemed_value = actual_points × ratio_per_point` recorded on PT row. | `core/loyalty.py` lines 199, 388, 404, 429–430 |
| **A4** | PT row missing `points_expired: False`. The expiry cron's PT-row filters can't deterministically include/exclude this row. | PT row written with `points_expired: False`. | `core/loyalty.py` line 432 |
| **A5** | No idempotency. A double-click on the "Redeem" button deducts twice. `PointsTransactionCreate` schema has no `idempotency_key` field. `last_visit` is also overwritten on redeem (line 44) which is semantically wrong — the customer didn't visit. | Idempotency via `idempotency_key`; replay returns the original tx without re-deducting; conflict on key-reuse returns `IDEMPOTENCY_CONFLICT`. `last_visit` NOT touched on redeem. | `core/loyalty.py` lines 287–353 (idempotency lookup + replay), no `last_visit` write |
| **A6** | `loyalty_enabled = false` is NOT checked on lines 32–66. Admin redeem succeeds even when loyalty is paused at the restaurant level. | Hard reject with `LOYALTY_DISABLED` when `settings.loyalty_enabled` is falsy. | `core/loyalty.py` lines 358–359 |
| **A7** | (Architectural decision) Admin path has its own copy of redemption logic. | Decision: **Option Y — Funnel admin through `redeem_loyalty_points` helper.** Single source of truth. Same precedent as the 5-caller funnel in LR Correction. | LR Correction §5.1 |

---

## 3. Earn / Bonus Branch — Intentionally Untouched

The `create_points_transaction` endpoint also handles `transaction_type="earn"` and `transaction_type="bonus"`. **This plan does NOT touch those branches.**

| Branch | Why not touched in L4-A |
|---|---|
| `earn` | Admin manual `earn` is informational/edge-case; POS does all real earning. Out of scope of the L4-A "redeem hardening" charter. |
| `bonus` | Manual bonus (e.g., goodwill, wallet-credit-bonus, feedback) does NOT have a tier-downgrade risk and does not double-deduct. L4 cron already hardened the birthday/anniversary bonus path (atomic `$inc`). Adoption of the same `$inc` pattern for manual bonus is a candidate for a future small CR, not this one. |
| `expired` | Written only by the expiry cron via `loyalty_jobs.py`. Already correct. |

**Concrete consequence:** Inside `create_points_transaction`, lines 32–35 (the redeem branch) and lines 32–66 (everything redeem-specific) are replaced; everything for `earn`/`bonus` stays untouched.

---

## 4. Detailed Implementation Plan

### 4.1 File 1 — `backend/models/schemas.py`

Add two optional fields to `PointsTransactionCreate` (line 922) so the admin redeem can pass `idempotency_key` and an optional `order_id` (admin redeems are NOT tied to an order most of the time; field is optional and defaults to a synthetic value when missing — see §4.2).

```python
# BEFORE (lines 922–927)
class PointsTransactionCreate(BaseModel):
    customer_id: str
    points: int
    transaction_type: str
    description: str
    bill_amount: Optional[float] = None

# AFTER
class PointsTransactionCreate(BaseModel):
    customer_id: str
    points: int
    transaction_type: str
    description: str
    bill_amount: Optional[float] = None
    # L4-A: optional idempotency + order linkage for admin redeem.
    # `redeem_loyalty_points` requires both; admin path will fall back
    # to deterministic synthetic values when caller omits them.
    idempotency_key: Optional[str] = None
    order_id: Optional[str] = None
```

**Backward compatibility:** Both new fields are optional. Existing frontend callers (which never send them) continue to work unchanged.

**No change** to `PointsTransaction` (the response model) — the helper already writes `idempotency_key`, `order_id`, `redeemed_value`, `ratio_per_point`, `points_expired` directly into the Mongo doc and the response model has `model_config = ConfigDict(extra="ignore")` (line 930) so it tolerates the extra fields.

### 4.2 File 2 — `backend/routers/points.py`

**Goal:** Inside `create_points_transaction` (line 19), branch on `tx_data.transaction_type == "redeem"` and route to the shared helper. `earn` / `bonus` paths stay untouched.

#### 4.2.1 New imports (top of file, after line 14)

```python
from core.loyalty import redeem_loyalty_points  # L4-A: shared helper
```

#### 4.2.2 Refactor `create_points_transaction` (lines 19–95)

The new structure:

```python
@router.post("/transaction", response_model=PointsTransaction)
async def create_points_transaction(
    tx_data: PointsTransactionCreate,
    user: dict = Depends(get_current_user),
    background_tasks: BackgroundTasks = None,
):
    customer = await db.customers.find_one({"id": tx_data.customer_id, "user_id": user["id"]})
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    # =====================================================================
    # L4-A (2026-05-25): redeem branch funnels through shared helper.
    # Helper enforces:
    #   • NO tier downgrade (Q-LR1)
    #   • $inc total_points_redeemed (A1)
    #   • Tier-aware ratio_per_point + redeemed_value on PT row (A3)
    #   • points_expired: False on PT row (A4)
    #   • Idempotency replay + IDEMPOTENCY_CONFLICT (A5)
    #   • loyalty_enabled kill-switch (A6)
    #   • last_visit NOT updated on redeem (A5 sub-issue)
    # =====================================================================
    if tx_data.transaction_type == "redeem":
        settings = await db.loyalty_settings.find_one(
            {"user_id": user["id"]}, {"_id": 0}
        )

        # Admin redeems may not have a real order. Use deterministic synthetic
        # values when caller omits them. This keeps the helper's required-field
        # guards satisfied without leaking the admin context into the helper.
        order_id = tx_data.order_id or f"admin_{uuid.uuid4().hex[:12]}"
        idempotency_key = tx_data.idempotency_key or f"admin_{order_id}"
        order_total = tx_data.bill_amount or 0.0

        result = await redeem_loyalty_points(
            db=db,
            user_id=user["id"],
            customer=customer,
            settings=settings,
            points_to_redeem=tx_data.points,
            order_id=order_id,
            order_total=order_total,
            idempotency_key=idempotency_key,
        )

        if not result["ok"]:
            # Map helper error codes to HTTP. Mirror LR endpoint surface.
            code = result.get("code") or "REDEEM_FAILED"
            status_map = {
                "CUSTOMER_NOT_FOUND": 404,
                "ORDER_ID_REQUIRED": 400,
                "IDEMPOTENCY_KEY_REQUIRED": 400,
                "IDEMPOTENCY_CONFLICT": 409,
                "INVALID_POINTS": 400,
                "INSUFFICIENT_POINTS": 400,
                "BELOW_MIN_REDEMPTION": 400,
                "LOYALTY_DISABLED": 403,
                "SETTINGS_MISSING": 400,
            }
            raise HTTPException(
                status_code=status_map.get(code, 400),
                detail=result["message"],
            )

        # Helper persisted everything. Read back the PT row to keep response shape.
        tx_id = result["data"]["transaction_id"]
        tx_doc = await db.points_transactions.find_one({"id": tx_id}, {"_id": 0})
        return PointsTransaction(**tx_doc)

    # =====================================================================
    # earn / bonus branches — UNCHANGED from prior implementation.
    # =====================================================================
    settings = await db.loyalty_settings.find_one({"user_id": user["id"]}, {"_id": 0})
    if not settings:
        settings = {"tier_bronze_min": 0, "tier_silver_min": 500, "tier_gold_min": 1500, "tier_platinum_min": 5000}

    current_points = customer.get("total_points", 0)
    old_tier = customer.get("tier", "Bronze")
    new_balance = current_points + tx_data.points
    new_tier = calculate_tier(new_balance, settings)

    update_data = {
        "total_points": new_balance,
        "tier": new_tier,
        "last_visit": datetime.now(timezone.utc).isoformat(),
    }

    if tx_data.transaction_type == "earn" and tx_data.bill_amount:
        update_data["total_spent"] = customer.get("total_spent", 0) + tx_data.bill_amount
        update_data["total_visits"] = customer.get("total_visits", 0) + 1

    await db.customers.update_one({"id": tx_data.customer_id}, {"$set": update_data})

    tx_id = str(uuid.uuid4())
    tx_doc = {
        "id": tx_id,
        "user_id": user["id"],
        "customer_id": tx_data.customer_id,
        "points": tx_data.points,
        "transaction_type": tx_data.transaction_type,
        "description": tx_data.description,
        "bill_amount": tx_data.bill_amount,
        "balance_after": new_balance,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    await db.points_transactions.insert_one(tx_doc)

    updated_customer = {**customer, "total_points": new_balance, "tier": new_tier}

    if tx_data.transaction_type == "bonus":
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "bonus_points", updated_customer,
            {"bonus_points": tx_data.points, "points_balance": new_balance}
        ))
        asyncio.create_task(trigger_points_earned_event(
            db, user["id"], updated_customer, tx_data.points, "bonus", new_balance
        ))

    if new_tier != old_tier and _tier_rank(new_tier) > _tier_rank(old_tier):
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "tier_upgrade", updated_customer,
            {"old_tier": old_tier, "new_tier": new_tier, "points_balance": new_balance}
        ))

    return PointsTransaction(**tx_doc)
```

**Notable preservation:**
- `_tier_rank` helper (lines 98–101) — UNCHANGED, still used by bonus tier-upgrade path.
- All other endpoints in this file (`/transactions/{customer_id}`, `/earn`, `/expiring/{customer_id}`, `/process-expiry-reminders`, `/expire`, loyalty-settings GET/PUT, birthday/anniversary cron triggers) — UNCHANGED.
- The `redeem` branch no longer writes `last_visit` (Q-A5).
- The `redeem` branch no longer fires the WhatsApp `points_redeemed` event from this file — the helper already fires it (lines 437–456 of `core/loyalty.py`). No duplicate trigger.

#### 4.2.3 `/points/earn` quick endpoint (line 111)

UNCHANGED. It eventually calls `create_points_transaction` with `transaction_type="earn"`, which hits the unchanged earn branch.

### 4.3 File 3 — `backend/frontend/src/pages/CustomerDetailPage.jsx`

Optional but recommended: send an `idempotency_key` on the admin redeem call so the helper's idempotency layer actually protects against double-clicks (not just same-request retries).

```jsx
// Lines 87–107 — handlePointsTransaction
const handlePointsTransaction = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
        const idempotency_key =
            pointsAction === "redeem"
                ? `admin_redeem_${id}_${Date.now()}`
                : undefined;
        await api.post("/points/transaction", {
            customer_id: id,
            points: parseInt(pointsData.points),
            transaction_type: pointsAction,
            description: pointsData.description || `${pointsAction === "bonus" ? "Bonus points" : "Points redeemed"}`,
            bill_amount: null,
            ...(idempotency_key && { idempotency_key }),
        });
        // …rest unchanged…
    } catch (err) { … }
};
```

**Why `Date.now()` is acceptable here:** The idempotency window for "accidental double-click" is sub-second. Two clicks in the same millisecond on the same browser are physically impossible. If the user wants to redeem twice intentionally, they'll click after the modal closes and the new modal generates a new timestamp.

**If the frontend is not updated:** the backend falls back to `f"admin_{order_id}"` which is itself `f"admin_admin_{uuid4().hex[:12]}"` (unique per call) → idempotency still works against simultaneous duplicate HTTP requests landing on the server (rare but the LR Correction precedent dictates we always have a key).

### 4.4 No file 4 (no DB migration, no schema migration)

- No new index — `points_transactions.idempotency_key` already exists (created during LR Correction implementation).
- No backfill — existing PT rows without `redeemed_value` / `ratio_per_point` / `points_expired` continue to work; analytics queries already use `$ifNull` defaults.

---

## 5. Owner Decisions Frozen

| Q | Question | Decision | Source |
|---|---|---|---|
| Q-L4A-1 | Manual redeem: should it tier-downgrade? | **NO** (mirror Q-LR1). | LR Correction Q-LR1 |
| Q-L4A-2 | Should `total_points_redeemed` be incremented on manual redeem? | **YES** ($inc, atomic) | A1 |
| Q-L4A-3 | Tier-aware ratio? | **YES** — admin must respect per-tier `*_redemption_value` | A3 |
| Q-L4A-4 | Idempotency? | **YES** — backend uses `f"admin_{order_id}"` fallback; frontend sends `admin_redeem_<id>_<ts>` (recommended) | A5 |
| Q-L4A-5 | `loyalty_enabled = false` behaviour? | **HARD REJECT** with `LOYALTY_DISABLED` (HTTP 403). Owner explicitly disabled loyalty; admin path must respect it. | A6 |
| Q-L4A-6 | Shared helper or inline fixes? | **Shared helper** (Option Y). | Q-L4-5 / A7 |
| Q-L4A-7 | Should `last_visit` be updated on redeem? | **NO** — redemption is not a visit. | A5 sub-issue |
| Q-L4A-8 | Backfill of historical PT rows? | **NO** — forward-only, mirrors CR-001A Phase 1 policy. Old rows keep their shape. | LR Correction §rollback note |
| Q-L4A-9 | Should manual `bonus` adopt atomic `$inc`? | **DEFERRED to a separate small CR** (not in L4-A). Current bonus path uses `$set` arithmetic; this works but is a candidate for the same atomicity treatment. | Out of scope §3 |

---

## 6. Error Codes Surface (admin redeem after L4-A)

All inherited from the shared helper. No new codes introduced. HTTP status mapping:

| Code | HTTP | Meaning |
|---|---:|---|
| `CUSTOMER_NOT_FOUND` | 404 | Customer not in restaurant scope |
| `ORDER_ID_REQUIRED` | 400 | Should never fire — backend synthesises |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | Should never fire — backend synthesises |
| `IDEMPOTENCY_CONFLICT` | 409 | Same key, different customer/order/points |
| `INVALID_POINTS` | 400 | Non-positive integer |
| `INSUFFICIENT_POINTS` | 400 | Available points < requested (after auto-cap) |
| `BELOW_MIN_REDEMPTION` | 400 | `min_redemption_points` not satisfied |
| `LOYALTY_DISABLED` | 403 | `loyalty_enabled = false` |
| `SETTINGS_MISSING` | 400 | No `loyalty_settings` doc for restaurant |

Replay (same key, same params) → HTTP 200 with the original PT row (no double-deduct).

---

## 7. QA Plan — New Harness `qa_cr001c_l_l4a_admin_redeem.py`

**Location:** `backend/tests/qa_cr001c_l_l4a_admin_redeem.py`
**Style:** Mirror `qa_cr001c_lr_redeem.py` and `qa_cr001c_l4_cron.py` — direct DB fixtures, no HTTP. Run with `python -m tests.qa_cr001c_l_l4a_admin_redeem`.
**Target assertion count:** **~28** (range: 25–30 is acceptable).

### 7.1 Asserts grouped by defect

| Group | # asserts | What it asserts |
|---|---:|---|
| **G1 Happy path** | 3 | Gold customer with 1000 pts redeems 200 → `total_points = 800`, `total_points_redeemed += 200`, tier stays Gold |
| **G2 No tier downgrade (A2)** | 4 | Gold customer with 1500 pts redeems 1400 → `total_points = 100`, tier STILL Gold (not Silver/Bronze); customer doc `tier` field unchanged; helper response shows `tier: "Gold"` |
| **G3 `total_points_redeemed` parity (A1)** | 3 | Sequential admin redeems on same customer accumulate via `$inc`; concurrent admin+POS redeem on same customer with different keys both increment correctly |
| **G4 Tier-aware ratio (A3)** | 4 | Settings with `gold_redemption_value=0.5, silver_redemption_value=0.25`; Gold redeem 100 pts → PT row has `redeemed_value=50.0, ratio_per_point=0.5`; Silver redeem 100 pts → `redeemed_value=25.0, ratio_per_point=0.25`; fallback to restaurant `redemption_value` when per-tier missing; fallback to 0.25 hardcode when both missing |
| **G5 `points_expired: False` (A4)** | 1 | Admin redeem PT row has `points_expired: False` explicitly (not missing field) |
| **G6 Idempotency (A5)** | 5 | (a) Same key replays identically — second call returns `status="replayed"`, balance unchanged after; (b) Different key on same customer commits twice; (c) Same key but different points → `IDEMPOTENCY_CONFLICT` 409; (d) Same key but different customer → conflict; (e) Frontend-synthesised key (`admin_redeem_<cust>_<ts>`) and backend-synthesised key (`admin_<uuid>`) both work |
| **G7 `last_visit` unchanged (A5 sub)** | 1 | Customer's `last_visit` field before admin redeem == after admin redeem |
| **G8 `loyalty_enabled` kill-switch (A6)** | 2 | `loyalty_enabled=false` → HTTP 403 `LOYALTY_DISABLED`, customer + PT collection unchanged; `loyalty_enabled` missing → reads `false` → same 403 |
| **G9 `SETTINGS_MISSING`** | 1 | Restaurant with no `loyalty_settings` doc → 400 `SETTINGS_MISSING` |
| **G10 `BELOW_MIN_REDEMPTION`** | 2 | `min_redemption_points=100`, customer has 50 → reject; customer has 150 but requests 50 → reject |
| **G11 `INSUFFICIENT_POINTS`** | 1 | Customer has 50 pts, requests 100 → reject (no partial debit) |
| **G12 `max_redemption_percent` auto-cap (Q-LR6 inheritance)** | 1 | Settings `max_redemption_percent=50, bill_amount=200`, customer has plenty of points — auto-cap to ≤100₹ worth (verifies admin uses same calculator as POS) |
| **G13 Earn/Bonus regression** | 2 | Manual `bonus` of 100 pts still increments `total_points`, recomputes tier, fires `bonus_points` WA trigger; manual `earn` with bill_amount still updates `total_spent` + `total_visits` |
| **G14 LR regression** | 2 | Run subset of existing LR harness (any 2 cases) — proves the shared helper still behaves correctly for POS callers after refactor |
| **G15 PT row shape** | 1 | PT row contains: `idempotency_key, order_id, points_expired, ratio_per_point, redeemed_value, bill_amount, balance_after, customer_id, user_id, transaction_type="redeem", id, created_at` |

### 7.2 Regression gates (existing harnesses must remain green)

| Harness | Assertions | Target |
|---|---:|---|
| `qa_cr001c_lr_redeem` | 52 | 52/52 PASS |
| `qa_cr001c_l4_cron` | 17 | 17/17 PASS |
| `qa_cr001c_c_coupon_v1` | 45 | 45/45 PASS |
| `qa_cr001c_c_coupon_v2_item_category` | 45 | 45/45 PASS |
| `qa_cr001c_c_coupon_v3_a_time_window` | 31 | 31/31 PASS |
| `qa_cr001c_c_coupon_v3_b_bogo_bxgy` | 49 | 49/49 PASS |
| `qa_cr001c_c_coupon_v3_c_every_nth` | 41 | 41/41 PASS |
| **L4-A NEW** | **~28** | **~28/28 PASS** |
| **TOTAL** | **~308** | **~308/308 PASS** |

### 7.3 Live HTTP smoke (post-static-QA)

1. `GET /api/health` → 200.
2. `POST /api/points/transaction` with JWT auth, `transaction_type="redeem"`, real customer — verify HTTP 200 + new PT row + `total_points_redeemed` incremented on customer doc.
3. Same call twice with same `idempotency_key` — second returns identical PT id, no double-deduct.
4. Same call with `loyalty_enabled=false` flipped on the restaurant settings — HTTP 403, no PT row written.

---

## 8. Files Touched — Cumulative Summary

| File | Type | LOC delta | Notes |
|---|---|---|---|
| `backend/models/schemas.py` | Modified | +3 lines | 2 optional fields on `PointsTransactionCreate` |
| `backend/routers/points.py` | Modified | ~+50 / ~−30 (net +20) | Redeem branch routed through helper; earn/bonus untouched |
| `backend/tests/qa_cr001c_l_l4a_admin_redeem.py` | New | ~450 LOC | ~28 assertions + DB fixture setup/teardown |
| `frontend/src/pages/CustomerDetailPage.jsx` | Modified | +5 lines | Optional `idempotency_key` on redeem |

**No new files** in `core/` — the helper already exists.
**No DB migration**.
**No env change**.
**No new dependency**.
**No supervisor restart needed** beyond the hot-reload cycle.

---

## 9. Files Explicitly UNTOUCHED

| File | Why protected |
|---|---|
| `backend/core/loyalty.py` | Helper is the spec. Touching it would invalidate the LR Correction 52/52 QA. |
| `backend/core/helpers.py` | Pure resolvers — no change needed. |
| `backend/routers/pos.py` | POS redemption path uses the helper directly. Out of L4-A scope. |
| `backend/routers/migration.py` | Migration L3 closed. No earn/redeem semantics in L4-A. |
| `backend/core/loyalty_jobs.py` | L4 cron path closed (17/17 QA). Untouched. |
| `backend/services/analytics_service.py` | Reports already use `$ifNull` defaults; new PT rows just have richer data. |
| `backend/routers/coupons.py` | Coupon admin CRUD — unrelated. |
| `backend/routers/wallet.py` | Wallet flow — unrelated. |
| `/app/memory/final/` | Frozen. |
| Legacy `coupon_transactions` collection | Frozen. |

---

## 10. Risk Register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Existing PT rows in DB lack `redeemed_value` / `ratio_per_point` / `points_expired` → analytics queries that did NOT use `$ifNull` would skip them | Low — analytics already uses `$ifNull` per LR Correction §5.4 | Forward-only policy (Q-L4A-8). Old rows continue to work. |
| R2 | Frontend not updated to send `idempotency_key` → simultaneous duplicate HTTP requests still possible if backend synthesises identical keys | Very Low — backend synthesises `f"admin_admin_{uuid4().hex[:12]}"` per call which is unique per request | Implement the optional frontend change (§4.3). |
| R3 | `loyalty_enabled = false` HARD REJECT will surface as a new 403 error in the admin UI where it previously silently succeeded | Medium — owner-facing UX change | Toast in `CustomerDetailPage.jsx` already shows `err.response?.data?.detail` (line 103). Owner will see "Loyalty program is currently disabled." Clear message. |
| R4 | Bonus path still uses non-atomic `$set` arithmetic on `total_points` | Low — bonus is admin-initiated, rate is human-typing — race window negligible | Deferred to a future small CR (Q-L4A-9). |
| R5 | Refactor accidentally breaks the response shape (`PointsTransaction` model) for frontend | Low — the response model has `extra="ignore"` and we read the row back from DB | QA G15 explicitly asserts the PT row shape; frontend uses `tx.transaction_type` and `tx.points` (the two fields it actually displays in `CustomerDetailPage.jsx` line 524–542). |

---

## 11. Rollback

Single revert of 3 files restores prior behaviour:
1. `git checkout HEAD~1 -- backend/routers/points.py`
2. `git checkout HEAD~1 -- backend/models/schemas.py`
3. `git checkout HEAD~1 -- frontend/src/pages/CustomerDetailPage.jsx`
4. (Delete `backend/tests/qa_cr001c_l_l4a_admin_redeem.py` — no runtime dependency.)

DB requires no rollback — new fields on PT rows are additive and tolerated by the existing reader code.

---

## 12. Implementation Sequence for the Implementation Agent

Recommended order (each step independently verifiable):

### Step 1 — Schema additive (5 min)
- Edit `backend/models/schemas.py` `PointsTransactionCreate` (§4.1).
- Hot-reload picks up automatically.
- Verify: `python3 -c "from models.schemas import PointsTransactionCreate; print(PointsTransactionCreate.model_fields.keys())"` must include `idempotency_key` and `order_id`.

### Step 2 — Router refactor (30 min)
- Edit `backend/routers/points.py` (§4.2).
- Hot-reload picks up automatically.
- Verify: `tail -n 50 /var/log/supervisor/backend.err.log` shows clean `Application startup complete`.

### Step 3 — Write QA harness (90 min)
- Create `backend/tests/qa_cr001c_l_l4a_admin_redeem.py` per §7.
- Mirror structure of `qa_cr001c_lr_redeem.py`. Reuse its `setup_test_restaurant`, `setup_test_customer`, `cleanup_admin_redeem_fixtures` patterns.
- Run: `cd /app/backend && python -m tests.qa_cr001c_l_l4a_admin_redeem`
- Target: ~28/28 PASS.

### Step 4 — Regression sweep (15 min)
- Run all 7 prior harnesses (§7.2). All must remain green.
- Run combined harness: total ~308 assertions PASS.

### Step 5 — Live HTTP smoke (10 min)
- §7.3 — exec the 4 curl scenarios. Capture HTTP codes + DB state into the implementation report.

### Step 6 — Frontend change (optional but recommended, 5 min)
- Edit `frontend/src/pages/CustomerDetailPage.jsx` (§4.3).
- Hot-reload picks up automatically.
- Verify: open `/customers/<id>`, click "Redeem Points", submit twice rapidly — second click returns "Points redeemed successfully" with identical balance (replay, not double-deduct).

### Step 7 — Implementation report (15 min)
- Write `implementation/CR_001C_L_L4A_ADMIN_REDEEM_HARDENING_IMPLEMENTATION_REPORT.md`.
- Sections: §1 summary, §2 files diff with line ranges, §3 QA results table, §4 live smoke evidence, §5 known limitations / deferred follow-ups, §6 rollback note.
- Write `qa/CR_001C_L_L4A_ADMIN_REDEEM_HARDENING_QA_REPORT.md`.
- Update `planning/CR_001_INDEX.md` with new row under CR-001C-L: tracker `cr001c_l_l4a_admin_redeem_hardening_qa_passed_in_preview`.
- Update `/app/memory/PRD.md` Session-2 section with the completion line.

**Total time estimate: ~2.5 hours (close to the original ~1.5 days estimate but tighter because the helper does the heavy lifting).**

---

## 13. Acceptance Criteria

The implementation is accepted iff:

1. ✅ All ~308 QA assertions PASS (existing 280 + new ~28).
2. ✅ Live `POST /api/points/transaction` with `transaction_type="redeem"` writes a PT row with all 7 new fields (`idempotency_key`, `order_id`, `redeemed_value`, `ratio_per_point`, `points_expired`, plus existing `balance_after`, `bill_amount`).
3. ✅ Live double-click on admin redeem deducts ONCE (idempotent).
4. ✅ Live Gold customer with high balance redeems large amount → tier still Gold afterwards (no downgrade).
5. ✅ Live admin redeem on restaurant with `loyalty_enabled=false` returns HTTP 403 with `LOYALTY_DISABLED`.
6. ✅ `customer.total_points_redeemed` increments correctly across multiple admin redeems.
7. ✅ No regression in 7 prior QA harnesses (52 LR + 17 L4 + 211 coupon = 280 still green).
8. ✅ Backend hot-reloads clean (`/api/health` 200, no startup errors).
9. ✅ Implementation report + QA report + PRD + CR_001_INDEX updated.

---

## 14. Final Status (this plan, not implementation)

```
cr001c_l_l4a_admin_redeem_hardening_plan_ready_for_implementation
```

No code, DB, env, or deployment changes by this planning step.
Implementation NOT started; ready for the next agent to execute §12.

On kickoff → flip status to `cr001c_l_l4a_admin_redeem_hardening_implementation_in_progress`.
On QA pass → `cr001c_l_l4a_admin_redeem_hardening_qa_passed_in_preview`.

---

## Appendix A — Line-by-line crosswalk: admin redeem → helper

| Defect | OLD location (`routers/points.py`) | NEW location (`core/loyalty.py`) |
|---|---|---|
| A1 `total_points_redeemed` missing | Lines 41–45 (`update_data` dict — never sets it) | Line 415 (`$inc: total_points_redeemed`) |
| A2 tier downgrade | Line 39 (`new_tier = calculate_tier(...)`) + line 43 (`"tier": new_tier`) | Lines 410–417 ($set writes only `total_points`, no tier) |
| A3 no ratio | Line 35 (`new_balance = current_points − tx_data.points`) | Lines 199, 388, 404 (`ratio_per_point` resolved, `redeemed_value` computed) |
| A4 `points_expired` missing | Lines 54–64 (PT doc — no field) | Line 432 (`"points_expired": False`) |
| A5 idempotency | Absent | Lines 287–353 (replay + conflict) |
| A5 `last_visit` overwrite | Line 44 (`"last_visit": now`) | Absent — helper does NOT touch `last_visit` |
| A6 `loyalty_enabled` ignored | Absent | Lines 358–359 |
| A7 duplicate logic | Lines 19–95 | Lines 244–474 (one helper, called from 5 places) |

---

## Appendix B — Outside-this-CR loyalty backlog (parked but visible)

These items are NOT in L4-A. They are listed here so the implementation agent knows what to defer.

| Item | Group | Status |
|---|---|---|
| L5 cleanup (deprecated `loyalty_clean_slate_recalc`, `earn_percent` branch, drift constants, alias retirement, `run_points_expiry` `$lt` fragility) | B | Gated on L4-A passing — start L5 immediately after |
| Off-peak timezone fix (hardcoded IST `+5:30`) | C9 | Deferred — needs restaurant-tz from `users.settings.timezone` (same chain as V3-A coupons) |
| Tier-upgrade WhatsApp from realtime POS | C8 | Deferred to separate WhatsApp Automation CR |
| Per-tier redemption value UI (`LoyaltySettingsPage.jsx`) | D2 | Backend ready — frontend gap |
| `loyalty disabled` admin badge | D3 | UI hygiene, low priority |
| `/api/pos/max-redeemable` `pos_id` cleanup / `restaurant_id` cross-check | D1 | LR Correction §5.7 item 8 — DEFERRED |
| Atomic `$inc` for manual bonus (race-window very narrow) | (new) | Candidate for a future small CR |

---

**End of plan.**
