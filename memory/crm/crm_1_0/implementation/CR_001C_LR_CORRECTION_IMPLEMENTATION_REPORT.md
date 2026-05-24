# CR-001C-LR Correction — Redemption Trigger + max-redeemable Alignment — Implementation Report

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-24
**Status:** `cr001c_lr_correction_qa_passed`
**Frozen plan:** `planning/CR_001C_LR_REDEMPTION_TRIGGER_CORRECTION_PLAN.md`

---

## 1. Scope Delivered

| Frozen decision | Delivered |
|---|---|
| Q-CORR-1: Both `/pos/orders` and `/pos/webhook/payment-received` route through shared helper | ✅ |
| Q-CORR-2: Auto-cap silent; other redeem errors hard-fail the order | ✅ |
| Q-CORR-3: Earn computed on `order_amount − redeemed_value` | ✅ |
| Q-CORR-4: Server-derived `loyalty_idempotency_key = f"order_{order_id}"` when POS omits one | ✅ |
| Q-CORR-5: `/webhook/payment-received` embedded redeem block → shared helper call | ✅ |
| Q-CORR-6: `/loyalty/redeem` kept as thin wrapper over the helper | ✅ |
| Q-CORR-7: New POS handoff doc issued; original LR handoff marked superseded | ✅ |
| Q-CORR-8: Started immediately; L4 unblocked but unaffected | ✅ |
| `/max-redeemable` items 1-7 (tier-aware ratio, kill-switch, no fallback, shared math, echoed fields, structured codes, `customer_id` OR `cust_mobile`) | ✅ |
| `/max-redeemable` item 8 (`pos_id` cleanup / cross-check) | ⏸ deferred per freeze |

## 2. Files Touched (exactly these — no others)

| File | Type | Note |
|---|---|---|
| `backend/core/loyalty.py` | modified | +258 LOC: `compute_max_redeemable(...)` + `redeem_loyalty_points(...)` + private `_rej` |
| `backend/routers/pos.py` | modified | (a) imports; (b) `POSMaxRedeemableRequest` accepts `customer_id`/`cust_mobile`; (c) `pos_max_redeemable` body → wrapper over `compute_max_redeemable`; (d) `pos_loyalty_redeem` body → wrapper over `redeem_loyalty_points` (~25 LOC, replacing ~225 LOC); (e) `POSOrderWebhook` +3 optional fields; (f) `pos_order_webhook` inserts redeem-before-earn block; (g) `pos_payment_received` embedded block → wrapper |
| `backend/tests/qa_cr001c_lr_redeem.py` | modified | +15 assertions (QA-16…QA-20); teardown extended to wipe `orders` collection |
| `memory/crm/crm_1_0/implementation/CR_001C_LR_CORRECTION_IMPLEMENTATION_REPORT.md` | new | this report |
| `memory/crm/crm_1_0/qa/CR_001C_LR_CORRECTION_QA_REPORT.md` | new | QA report |
| `memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` | new | new POS contract |
| `memory/crm/crm_1_0/handoff/CR_001C_LR_POS_LOYALTY_REDEEM_API_HANDOFF_TO_POS.md` | modified | top-banner: superseded |
| `memory/crm/crm_1_0/planning/CR_001_INDEX.md` | modified | append "LR correction" row |
| `memory/PRD.md` | modified | append correction status + L4 sequencing note |

**Nothing else was touched.** No changes to `routers/points.py`, `core/helpers.py`, `core/whatsapp.py`, `models/schemas.py`, frontend, migration, `/app/memory/final/`, or any other file.

## 3. Shared Helper Module — `core/loyalty.py`

Two new entry points, both exported (already used via direct import from `routers/pos.py`).

### 3.1 `compute_max_redeemable(customer, settings, bill_amount) -> dict`

Pure function (no DB writes). Returns:

```python
{
  "ok": bool,
  "code": None | "LOYALTY_DISABLED" | "SETTINGS_MISSING" | "BELOW_MIN_REDEMPTION",
  "message": str,
  "max_points_redeemable": int,
  "max_discount_value": float,
  "ratio_per_point": float,
  "tier": str,
  "available_points": int,
  "min_redemption_points": int,
  "loyalty_enabled": bool,
}
```

- Tier-aware via `get_redemption_value_for_tier(...)` (LX-A helper).
- Honors `loyalty_enabled` kill-switch → `code=LOYALTY_DISABLED`.
- Honors absent `loyalty_settings` → `code=SETTINGS_MISSING` (no hardcoded fallbacks).
- Three-cap math: `min(bill × max_percent%, max_amount, available × ratio)`.

### 3.2 `redeem_loyalty_points(db, user_id, customer, settings, points_to_redeem, order_id, order_total, idempotency_key) -> dict`

Async. Performs the entire commit-side flow. Returns:

```python
{
  "ok": bool,
  "status": "committed" | "replayed" | "rejected",
  "code": None | <ErrorCode>,
  "message": str,
  "data": {...response payload identical to /loyalty/redeem...},
}
```

Order of operations:

1. `ORDER_ID_REQUIRED` / `IDEMPOTENCY_KEY_REQUIRED` / `INVALID_POINTS` guards
2. Idempotency lookup (replay → status="replayed"; conflict → `IDEMPOTENCY_CONFLICT`)
3. `SETTINGS_MISSING` / `LOYALTY_DISABLED`
4. `CUSTOMER_NOT_FOUND`
5. `BELOW_MIN_REDEMPTION` (against both balance and request)
6. Tier-aware ratio + auto-cap via `compute_max_redeemable(...)` — **the same function the calculator endpoint calls**
7. `INSUFFICIENT_POINTS` if post-cap is zero
8. Mutate: `$set total_points`, `$inc total_points_redeemed`; **no tier change** (Q-LR1)
9. Insert PT row with: `transaction_type="redeem"`, positive `points`, `redeemed_value`, `ratio_per_point`, `order_id`, `idempotency_key`, `balance_after`, `points_expired=false`
10. Best-effort WhatsApp `points_redeemed` trigger (fire-and-forget; never blocks)

Helper never raises — every failure is a structured rejection in the return dict so callers can decide their own envelope (hard-fail order vs. soft-warn).

## 4. Endpoint Changes

### 4.1 `POST /api/pos/loyalty/redeem` (standalone — kept for testing only)

Body shrunk from ~225 LOC to ~25 LOC: loads `customer` + `settings`, delegates to helper, wraps result in `POSResponse`. Contract unchanged.

### 4.2 `POST /api/pos/max-redeemable` (calculator — aligned)

| Aspect | Before | After |
|---|---|---|
| Ratio | flat `settings.redemption_value` | **tier-aware** `get_redemption_value_for_tier(...)` |
| `loyalty_enabled=false` | ignored (returned non-zero cap) | returns 0 + `error.code=LOYALTY_DISABLED` |
| No `loyalty_settings` | silent hardcoded fallback `{0.25, 100, 50%, ₹500}` | returns 0 + `error.code=SETTINGS_MISSING` |
| Below min | message-string only | `error.code=BELOW_MIN_REDEMPTION` |
| Response fields | `max_points_redeemable, max_discount_value` | + `ratio_per_point, tier, available_points, min_redemption_points, loyalty_enabled` (always echoed) |
| Customer lookup | `cust_mobile` only | `customer_id` OR `cust_mobile` (prefer `customer_id`) |
| Shared math | none | calls `compute_max_redeemable(...)` — same function the redeem helper auto-caps with |

### 4.3 `POST /api/pos/orders` (realtime order webhook — primary POS flow now)

Schema additions on `POSOrderWebhook` (all optional, forward-only):

```python
loyalty_points_used:       Optional[int]    # POS-decided redemption; null/0 → no redemption
loyalty_discount:          Optional[float]  # POS-displayed ₹ (server recomputes; informational)
loyalty_idempotency_key:   Optional[str]    # explicit key; server falls back to f"order_{order_id}"
```

Handler flow (after customer load, before earn calc):

```
if order_data.loyalty_points_used > 0:
    idem = order_data.loyalty_idempotency_key or f"order_{order_data.order_id}"
    result = await redeem_loyalty_points(...)
    if not result.ok:
        return POSResponse(success=False, data=result.data)   # hard-fail entire order
    earn_base = order_amount - result.data.redeemed_value     # earn-on-net
```

Order response gets a new `data.loyalty_redeem` block carrying the helper's result data (or `null` when no redemption was requested).

### 4.4 `POST /api/pos/webhook/payment-received` (legacy payment webhook)

Embedded 56-LOC redeem block replaced with a helper call:

- `order_id` derived from `webhook_data.bill_id` (or synthesized from phone+amount)
- `idempotency_key` derived from `webhook_data.metadata.loyalty_idempotency_key` (or `f"payrec_{order_id}"`)
- On success: response carries `points_redeemed` + transactions list as before
- On failure: surfaces `points_redeemed_error` (preserves legacy soft-fail semantics for this endpoint specifically)

This path now has counter parity (`$inc total_points_redeemed`), tier-aware ratio, idempotency, kill-switch handling, and the LR-grade PT row schema — all by virtue of routing through the shared helper.

## 5. Failure Handling Matrix

| Endpoint | Auto-cap | Other redeem errors |
|---|---|---|
| `/pos/loyalty/redeem` (standalone) | Silent (success=true, capped points) | success=false + error.code |
| `/pos/orders` (primary) | Silent (success=true, capped points) | **Hard-fail entire order webhook** (Q-CORR-2 Option C) |
| `/pos/webhook/payment-received` (legacy) | Silent | Soft-fail: payment proceeds; `points_redeemed_error` surfaced in response |
| `/pos/max-redeemable` (calculator) | n/a — returns the cap | `success=true`, `max_points_redeemable=0`, `data.error.code` |

## 6. Idempotency Semantics (post-correction)

| Caller | Default `idempotency_key` |
|---|---|
| `/pos/loyalty/redeem` | POS-required (`IDEMPOTENCY_KEY_REQUIRED` if absent) |
| `/pos/orders` | `order_data.loyalty_idempotency_key` if POS sends; else server-derived `f"order_{order_id}"` |
| `/pos/webhook/payment-received` | `metadata.loyalty_idempotency_key` if POS sends; else server-derived `f"payrec_{bill_id_or_synth}"` |

All three callers go through the same helper, so:
- Same key + same `(customer_id, order_id, points)` → idempotent replay
- Same key + different params → `IDEMPOTENCY_CONFLICT`

The order-webhook design (Q-CORR-4 Option A) means POS retries of the entire order payload — which already replay the same `order_id` — are automatically safe for the loyalty side too, with **zero POS code change required**.

## 7. Out-of-Scope Confirmations

| Item | Reason |
|---|---|
| L4 admin redeem + birthday/anniversary cron counter parity | Separate phase (next) |
| L5 dead-code cleanup, orphaned PT row cleanup | Separate phase |
| Coupon (validate/list/redeem/reverse) | CR-001C-C |
| Wallet (debit/credit/reverse) | CR-001C-W |
| Loyalty reverse / refund | Future redemption CR |
| `routers/points.py` admin redeem path | L4 — shared helper now ready for adoption |
| POS frontend code | POS team |
| CRM admin UI | None required |
| Migration / data backfill | None required (forward-only schema additions) |
| `pos_id` cleanup / `restaurant_id` cross-check on `/max-redeemable` | Deferred per freeze (item 8) |
| Production deploy | Out — preview only |
| `/app/memory/final/` | Untouched |

## 8. Rollback Note

Forward-only:

1. `POSOrderWebhook` schema additions are `Optional` → rollback = drop the fields; existing POS clients keep working.
2. Helper extraction is a refactor — `git revert` restores the prior inline LR block. The standalone `/loyalty/redeem` and the embedded blocks in `/orders` and `/webhook/payment-received` would all return to their pre-correction behavior.
3. No data migration. No schema breaking changes. No collection rename. No index addition.

Hot reload picks up rollback automatically; supervisor `restart backend` finalizes.

## 9. QA Result

**52/52 PASS** — `tests/qa_cr001c_lr_redeem.py`. Detailed evidence in
`qa/CR_001C_LR_CORRECTION_QA_REPORT.md`.

Coverage:

- 36 original LR assertions — preserved behavior of `/loyalty/redeem` via the helper.
- 15 correction assertions covering `/max-redeemable` alignment (7), calculator-cap == commit-cap parity (1), `/pos/orders` redeem path (3), `/pos/orders` order_id-derived idempotency fallback (1), `/pos/orders` hard-fail semantics (1), plus LX-A 6-key blob regression and `/api/health` regression.
- **1 alias-addendum assertion (QA-21, 2026-05-24):** `/pos/orders` accepts POS-legacy alias `used_loyalty_point` and produces identical commit semantics (same PT row, same `$inc total_points_redeemed`, same earn-on-net) as the canonical `loyalty_points_used` path.

## 10. Alias Addendum (2026-05-24, forward-only)

Live R689 testing revealed POS's outbound mapper sends `used_loyalty_point` (singular legacy alias). To unblock POS rollout without altering any frozen Q-CORR decision, the `POSOrderWebhook.loyalty_points_used` field gained a Pydantic `validation_alias`:

```python
loyalty_points_used: Optional[int] = Field(
    default=None,
    validation_alias=AliasChoices(
        "loyalty_points_used",
        "used_loyalty_point",
        "used_loyalty_points",
    ),
)
```

Pattern reused from CR-001A Phase 1 (`order_created_at` ← `created_at`). One file touched (`backend/routers/pos.py`, `POSOrderWebhook` field declaration only). One QA assertion added. Aliases retire in L5 cleanup once POS migrates. Plan §12 captures the full decision matrix.

## 11. Final Status

`cr001c_lr_correction_qa_passed` (52/52 — alias-addendum included)
