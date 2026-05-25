# CR-001C-LR — Redemption Trigger Correction Plan

**Module:** CR-001C-LR (correction)
**Date:** 2026-05-23
**Status:** `cr001c_lr_redemption_trigger_correction_plan_frozen_ready_to_implement`
**Author:** CRM Team
**Trigger:** Owner correction — POS does NOT call redeem on cashier-click. Actual redemption must execute when CRM receives the final billing payload.
**Freeze:** 2026-05-23 — All Q-CORR-1…8 resolved with CRM recommendations. `/api/pos/max-redeemable` alignment scope locked (§5.7 items 1-7 approved; item 8 deferred). Plan is FROZEN — implementation may proceed.

---

## 1. Executive Summary

The LR work delivered `POST /api/pos/loyalty/redeem` as a **standalone, live, cashier-click endpoint**. Owner has corrected the business model:

> **POS calculates redemption locally and bundles the redemption decision into the final bill/payment/order payload. CRM redeems only when that final payload arrives.**

Practical consequence: the existing realtime endpoints — `POST /api/pos/orders` (the primary realtime order webhook) and/or `POST /api/pos/webhook/payment-received` (legacy payment webhook) — are where the actual deduction belongs. The standalone `/api/pos/loyalty/redeem` endpoint built in LR should NOT be the primary POS flow.

This plan proposes:

1. Extract LR's redemption logic into a **shared, reusable helper** in `core/loyalty.py`.
2. Wire the helper into the realtime order webhook (`POST /api/pos/orders`) on the final payload it already receives.
3. Decide the fate of the existing embedded redeem block in `/webhook/payment-received` (lines 1783-1838) — either redirect it through the helper or deprecate it.
4. Keep `POST /api/pos/loyalty/redeem` as an **opt-in standalone endpoint** for direct testing / admin tooling, NOT the primary POS flow.
5. **Align `POST /api/pos/max-redeemable` (calculator) with the same shared helper** so the cap shown to the cashier and the cap actually applied at commit time are mathematically guaranteed to match. *(Owner-approved 2026-05-23 — see §5.7.)*

**No code changes** until owner approves this plan.

> **🟢 PLAN FROZEN 2026-05-23.** All open questions (Q-CORR-1 through Q-CORR-8) are resolved using the CRM-recommended options. The `/api/pos/max-redeemable` alignment scope (§5.7 items 1-7) was independently owner-approved on 2026-05-23. Implementation may begin against this frozen contract — no further question round is required. See **§10 Frozen Decisions** for the locked-in matrix.

---

## 2. Current State Audit (read-only inspection)

### 2.1 Endpoint inventory — what exists today

| Endpoint | File / lines | Purpose | Mutates points? | Tier-aware? | Idempotent? | Counter parity (`total_points_redeemed`)? |
|---|---|---|---|---|---|---|
| `POST /api/pos/orders` | `routers/pos.py:1409-1585` | Realtime order webhook (primary). Earns points, applies wallet, records coupon. | **NO redeem** — schema has no loyalty-redemption field | n/a | n/a | n/a |
| `POST /api/pos/webhook/payment-received` | `routers/pos.py:1588-1922` | Legacy "payment received" webhook | **YES** — embedded block at lines 1783-1838 | ❌ flat `redemption_value` | ❌ none | ❌ missing `$inc total_points_redeemed` |
| `POST /api/pos/max-redeemable` | `routers/pos.py:443-522` | Calculator only | NO | ❌ flat | n/a | n/a |
| `POST /api/pos/loyalty/redeem` (LR — just built) | `routers/pos.py:525-770` | Standalone cashier-click redeem (per now-corrected scope) | YES | ✅ LX-A helper | ✅ key required | ✅ `$inc total_points_redeemed` |
| `POST /api/points/transaction` | `routers/points.py` | Admin / JWT redeem | YES | ❌ flat | ❌ none | ❌ missing `$inc` |

### 2.2 Realtime order webhook payload — what fields exist

`POSOrderWebhook` (schema at `routers/pos.py:1297-1397`):

| Category | Fields present | Loyalty redemption field? |
|---|---|---|
| Identification | `pos_id`, `restaurant_id`, `order_id`, `restaurant_order_id` | — |
| Customer | `cust_mobile`, `cust_name`, `cust_email`, `user_id` | — |
| Amounts | `order_amount`, `order_sub_total_amount` | — |
| Discounts | `order_discount`, `self_discount`, `coupon_code`, `coupon_discount` | — |
| Wallet | `wallet_used` | — |
| Taxes | `tax_amount`, `gst_tax`, `vat_tax`, `service_tax`, `service_gst_tax_amount` | — |
| Tips / charges | `tip_amount`, `tip_tax_amount`, `delivery_charge`, `round_up` | — |
| Payment | `payment_method`, `payment_status`, `payment_type`, `transaction_id` | — |
| Status / meta | `order_status`, `order_type`, `table_id`, `waiter_id`, `employee_id` | — |
| Room (CR-001A Phase 2) | `room_info`, `associated_order_ids` | — |
| Items | `items[]` | — |

**Finding:** `POSOrderWebhook` carries **NO loyalty redemption field today**. It has `wallet_used` (mirror behavior for wallet) and `coupon_code`/`coupon_discount` (record-only for coupon), but no `loyalty_points_used` / `loyalty_discount` / `points_redeemed` / `used_loyalty_point` field.

The realtime order webhook handler (`pos_order_webhook`, lines 1409-1585) consequently never calls any redeem path. This is the **primary gap to close** under the corrected scope.

### 2.3 Payment webhook payload — what fields exist

`POSPaymentWebhook` (schema at `models/schemas.py:775-782`):

```python
class POSPaymentWebhook(BaseModel):
    customer_phone: str
    bill_amount: float
    channel: str = "dine_in"
    coupon_code: Optional[str] = None
    redeem_points: Optional[int] = None   # ← only loyalty-redemption signal
    bill_id: Optional[str] = None
    metadata: Optional[dict] = None
```

`redeem_points` IS present. The handler at lines 1783-1838 already redeems points based on this field, but with the known defects listed in the LR plan §3.2:

```python
# Existing block (lines 1807-1832), summarized:
new_points = current_points - points_to_redeem
await db.customers.update_one(
    {"id": customer["id"]},
    {"$set": {"total_points": new_points}}    # ← no $inc total_points_redeemed
)
tx_doc = {
    "id": str(uuid.uuid4()),
    "user_id": user["id"],
    "customer_id": customer["id"],
    "points": points_to_redeem,
    "transaction_type": "redeem",
    "description": "Redeemed at POS (Bill: Rs.X)",
    "bill_amount": webhook_data.bill_amount,
    "balance_after": new_points,
    "created_at": now,
    # ❌ no order_id
    # ❌ no idempotency_key
    # ❌ no redeemed_value
    # ❌ no ratio_per_point
    # ❌ no points_expired flag
}
```

Defects vs LR:

| LR rule | Embedded block | Gap |
|---|---|---|
| `$inc total_points_redeemed` | ❌ missing | counter drift (DEFECT-L4-R1) |
| Tier-aware `ratio_per_point` via `get_redemption_value_for_tier` | ❌ flat `redemption_value` | wrong ₹ for non-Bronze customers |
| `loyalty_enabled` kill-switch | ❌ not checked | ignores LF-MERGE |
| Idempotency (replay + conflict) | ❌ none | retry → double-deduct |
| PT row carries `order_id` | ❌ no | reverse endpoint cannot link |
| PT row carries `idempotency_key` | ❌ no | dedup impossible |
| PT row carries `redeemed_value`, `ratio_per_point` | ❌ no | audit gap |
| `min_redemption_points` enforced | ✅ partial | (request-only, not balance-only check) |
| `points_expired = false` stamp | ❌ no | L3 cron filtering safe today but inconsistent |

### 2.4 Other realtime hot paths (informational)

- `POST /api/points/transaction` (`routers/points.py`) — admin path, JWT auth. Same defects as 2.3. Out of LR; L4 fixes it.
- `POST /api/pos/loyalty/redeem` (LR) — built correctly but, per owner correction, **should NOT be the cashier-click endpoint**. Its body of logic should be promoted to a shared helper and reused.

---

## 3. Owner Correction — Restated

| Actor | New responsibility |
|---|---|
| **POS** | (1) Read available points + `ratio_per_point` via existing CRM read endpoints (LX-A). (2) Calculate the loyalty discount locally on cashier click. (3) Adjust the final payable amount in POS UI. (4) Send the loyalty redemption fields **inside the final order / collect-bill / payment payload**. |
| **CRM** | Perform actual redemption **only** when the final order / payment payload arrives. Use a **single shared helper** that: deducts `total_points`, increments `total_points_redeemed`, creates a `points_transactions` row, applies idempotency from the payload (order_id / payment_id / explicit key) to prevent double redemption. |

**Therefore:**
- Standalone `POST /api/pos/loyalty/redeem` is NOT the primary POS click endpoint.
- Whichever realtime endpoint POS chooses as the "final payload" must carry redemption fields, and the handler must call the shared helper.

---

## 4. Proposed Architecture

```
                       ┌──────────────────────────────────────────────┐
                       │  core/loyalty.py                             │
                       │  ─────────────────────────────────────────── │
                       │  async def redeem_loyalty_points(...)        │
                       │      → tier-aware ratio, auto-cap, mutate    │
                       │                                              │
                       │  async def compute_max_redeemable(           │
                       │      customer, settings, bill_amount         │
                       │  ) -> {max_points, max_discount, ratio, ...} │
                       │      → SHARED cap math used by both          │
                       │        the calculator endpoint AND the       │
                       │        auto-cap step inside redeem_*         │
                       │                                              │
                       │  • Tier-aware ratio (LX-A)                   │
                       │  • loyalty_enabled kill-switch               │
                       │  • SETTINGS_MISSING handling                 │
                       │  • Identical guardrails on both sides        │
                       └────────────┬─────────────────────────────────┘
                                    │
              ┌──────────────┬──────┴──────┬─────────────────────────┐
              │              │             │                         │
              ▼              ▼             ▼                         ▼
   ┌──────────────────┐ ┌──────────────┐ ┌──────────────────┐ ┌─────────────────┐
   │ POST /pos/orders │ │ POST /pos/   │ │ POST /pos/       │ │ POST /pos/      │
   │ (REALTIME — NEW: │ │ webhook/     │ │ loyalty/redeem   │ │ max-redeemable  │
   │  add loyalty     │ │ payment-     │ │ (existing, kept  │ │ (CALCULATOR —   │
   │  fields, call    │ │ received     │ │ for direct       │ │ owner-approved  │
   │  redeem helper)  │ │ (legacy —    │ │ testing only —   │ │ alignment via   │
   │                  │ │ fix via      │ │ thin wrapper)    │ │ shared helper)  │
   │                  │ │ helper)      │ │                  │ │                 │
   └──────────────────┘ └──────────────┘ └──────────────────┘ └─────────────────┘
        COMMIT side                                                CALCULATOR side
```

**Single source of truth.** Four callers, one helper module with two entry points (`redeem_loyalty_points` for commit, `compute_max_redeemable` for the calculator). The calculator-side cap and the commit-side auto-cap are produced by the same function — POS can never display a number that diverges from what CRM actually applies.

---

## 5. Detailed Changes (deferred — for plan review only)

### 5.1 New shared helper — `core/loyalty.py`

| Item | Decision |
|---|---|
| Location | `core/loyalty.py` (next to `build_pos_loyalty_blob`, `calculate_tier`) |
| Signature | `async def redeem_loyalty_points(db, user_id, customer_doc, settings, points_to_redeem, order_id, order_total, idempotency_key) -> dict` |
| Return shape | `{status: "ok"\|"capped"\|"skipped", code: <ErrorCode\|null>, data: {points_redeemed, ratio_per_point, redeemed_value, remaining_points, transaction_id, ...}}` |
| Inputs already loaded by caller | `customer_doc` and `settings` — caller passes them in (avoids double-load on the order webhook which has both already) |
| Idempotency lookup | Same `{user_id, idempotency_key, transaction_type:"redeem"}` query |
| Idempotency conflict | Same `(customer_id, order_id, points)` triplet comparison |
| Side effects | `customers.update_one` ($set + $inc), `points_transactions.insert_one`, optional WhatsApp `points_redeemed` trigger |
| Error codes | Identical to LR catalog (`LOYALTY_DISABLED`, `INSUFFICIENT_POINTS`, `IDEMPOTENCY_CONFLICT`, etc.) |

### 5.2 `POSOrderWebhook` schema additions (`routers/pos.py:1297`)

Forward-only, optional fields:

| New field | Type | Notes |
|---|---|---|
| `loyalty_points_used` | `Optional[int]` | Points POS decided to redeem locally; ≥ 0; null/0 → no redemption |
| `loyalty_discount` | `Optional[float]` | The ₹ amount POS displayed to the cashier; **server recomputes** from `ratio_per_point` and only uses this for cross-check / variance flag |
| `loyalty_idempotency_key` | `Optional[str]` | Server falls back to `f"order_{order_id}"` if POS does not send one (see §6.4) |

Rationale for optional + forward-only: existing POS deployments that don't yet send these fields keep working with zero-redemption behavior.

### 5.3 `pos_order_webhook` handler wiring (`routers/pos.py:1409-1585`)

Insert the redeem step **before** the earn step:

```
1. Validate                                            (existing)
2. Loyalty settings                                    (existing)
3. Find or create customer                             (existing)
4. NEW: Redeem step
   - If order_data.loyalty_points_used > 0:
       result = await redeem_loyalty_points(...)
       - On ok / capped: subtract result.redeemed_value from bill total
         for earn calc base (if owner wants earn on net-of-redemption)
       - On any error code: skip earn? fail order? → see §6.2
5. Earn (current logic) — operates on the post-redeem `total_points`
6. Wallet validation                                   (existing)
7. Update customer stats                               (existing)
8. Save order + transactions                           (existing)
9. WhatsApp triggers                                   (existing)
```

Earn ordering question: should earn be computed on `order_amount` or on `order_amount - loyalty_discount`? See §6.3.

### 5.4 `pos_payment_received` handler (`routers/pos.py:1588-1922`)

Two options, owner picks:

| Option | Effort | Risk |
|---|---|---|
| **A. Replace embedded block with helper call** | ~30 LOC change | Low. Brings defect-free behavior. Existing POS clients keep working. |
| **B. Deprecate the endpoint entirely** | Remove handler + schema (or 410 Gone response) | Medium. Need to confirm no production POS still calls it. |

Recommended: **Option A** unless owner confirms B is safe. If A: also extend `POSPaymentWebhook` with `loyalty_idempotency_key` (optional; fallback to `bill_id` or `order_id`).

### 5.5 `pos_loyalty_redeem` standalone endpoint

| Item | Decision |
|---|---|
| Keep endpoint | ✅ Yes — useful for direct curl testing, CRM admin tooling, future scenarios |
| Refactor body | Thin wrapper that loads customer + settings, calls the shared helper, maps result → `POSResponse`. ~30 LOC. |
| Mark in handoff doc | Add banner: "Not the primary POS flow. Primary path = embed `loyalty_points_used` in `/api/pos/orders` payload." |
| Auth | Unchanged (`verify_pos_auth`) |

### 5.6 Admin path `POST /api/points/transaction` (`routers/points.py`)

**OUT of this correction.** Owner has explicitly scoped L4 to address admin counter parity. This plan does NOT touch `routers/points.py`. (Optional future: redirect the admin path through the helper too, during L4.)

### 5.7 `POST /api/pos/max-redeemable` alignment (owner-approved 2026-05-23)

The calculator endpoint must be aligned with the shared helper so the cap displayed to the cashier and the cap actually applied at commit time are produced by the **same function**. POS can no longer show a number that diverges from what CRM applies.

#### 5.7.1 Scope decision (locked in)

| # | Item | Status | Notes |
|---|---|---|---|
| 1 | Use `get_redemption_value_for_tier(customer.tier, settings)` so the calculator is tier-aware | **P0 — APPROVED** | Replaces the flat `settings.redemption_value` read. Same helper LR + LX-A use. |
| 2 | Respect `loyalty_enabled`. If `false`, return `max_points_redeemable=0`, `max_discount_value=0` with `error.code = "LOYALTY_DISABLED"` | **P0 — APPROVED** | LF-MERGE alignment. POS can branch on the same code LR returns. |
| 3 | If `loyalty_settings` doc is missing, **drop the hardcoded fallback** (`{redemption_value:0.25, min_redemption:100, max_percent:50, max_amount:500}`). Return `max_points_redeemable=0`, `max_discount_value=0` with `error.code = "SETTINGS_MISSING"` | **P0 — APPROVED** | Mirrors LR. No more silent divergence from the commit path. |
| 4 | Both the calculator endpoint AND the auto-cap step inside the new `redeem_loyalty_points` helper must call the same `compute_max_redeemable(...)` function | **P0 — APPROVED** | This is the structural guarantee that display == commit. |
| 5 | Echo additional read-only fields in the response: `ratio_per_point`, `tier`, `available_points`, `min_redemption_points`, `loyalty_enabled` | **APPROVED** | Eliminates a redundant POS round-trip to the loyalty blob per typed-amount calculation. |
| 6 | Use structured `error.code` values on non-happy paths: `BELOW_MIN_REDEMPTION`, `LOYALTY_DISABLED`, `SETTINGS_MISSING` | **APPROVED** | POS branches on code, not message string. Symmetric with LR error catalog. |
| 7 | Accept either `customer_id` or `cust_mobile`. At least one required. Prefer `customer_id` when both present. `cust_mobile` remains supported for backward compatibility. Lookup MUST stay scoped to the authenticated `user_id`. | **APPROVED** | Disambiguates duplicate-phone edge cases; aligns with the rest of `/api/pos/*` which uses `customer_id`. |
| 8 | `pos_id` cleanup / cross-check `request.restaurant_id` against API-key's restaurant | **DEFERRED** | Only do it if the change is trivial and low-risk during implementation. Otherwise leave as-is in this correction. |

#### 5.7.2 Proposed `compute_max_redeemable(...)` helper signature

Location: `core/loyalty.py` (alongside `redeem_loyalty_points`).

```python
async def compute_max_redeemable(
    customer: dict,            # already-loaded customer doc
    settings: dict | None,     # already-loaded loyalty_settings (or None)
    bill_amount: float,
) -> dict:
    """
    Returns:
      {
        "ok": bool,
        "code": <None|"LOYALTY_DISABLED"|"SETTINGS_MISSING"|"BELOW_MIN_REDEMPTION">,
        "max_points_redeemable": int,
        "max_discount_value": float,
        "ratio_per_point": float,
        "tier": str,
        "available_points": int,
        "min_redemption_points": int,
        "loyalty_enabled": bool,
      }

    Pure function (no DB writes). Used by:
      - POST /api/pos/max-redeemable handler (returns this shape directly under data)
      - the auto-cap step inside redeem_loyalty_points (same caps are enforced
        before mutation)
    """
```

#### 5.7.3 Request contract — proposed (post-correction)

```json
{
  "pos_id":        "mygenie",
  "restaurant_id": "689",
  "customer_id":   "5ebde664-c7b7-46b7-85ab-f5c5319161b9",   // optional
  "cust_mobile":   "7505242126",                              // optional (legacy)
  "bill_amount":   1000
}
```

Resolution rule:
- If `customer_id` present → look up by id under authed `user_id`.
- Else if `cust_mobile` present → look up by phone under authed `user_id`.
- Else → `error.code = "INVALID_REQUEST"` (or HTTP 422 via Pydantic root-validator).

#### 5.7.4 Response contract — proposed (post-correction)

**Happy path:**

```json
{
  "success": true,
  "message": "Max redeemable calculated",
  "data": {
    "max_points_redeemable": 664,
    "max_discount_value":    664.0,
    "ratio_per_point":       1.0,
    "tier":                  "Gold",
    "available_points":      4588,
    "min_redemption_points": 100,
    "loyalty_enabled":       true
  }
}
```

**`LOYALTY_DISABLED`** (loyalty toggled off for the restaurant):

```json
{
  "success": true,
  "message": "Loyalty program is disabled.",
  "data": {
    "max_points_redeemable": 0,
    "max_discount_value":    0.0,
    "ratio_per_point":       0.0,
    "tier":                  "Gold",
    "available_points":      4588,
    "min_redemption_points": 0,
    "loyalty_enabled":       false,
    "error": {
      "code":    "LOYALTY_DISABLED",
      "message": "Loyalty program is currently disabled."
    }
  }
}
```

**`SETTINGS_MISSING`** (no `loyalty_settings` doc for the restaurant):

```json
{
  "success": true,
  "message": "Loyalty settings not configured.",
  "data": {
    "max_points_redeemable": 0,
    "max_discount_value":    0.0,
    "error": {
      "code":    "SETTINGS_MISSING",
      "message": "Loyalty settings not configured for this restaurant."
    }
  }
}
```

**`BELOW_MIN_REDEMPTION`** (customer balance under `min_redemption_points`):

```json
{
  "success": true,
  "message": "Customer below minimum redemption threshold.",
  "data": {
    "max_points_redeemable": 0,
    "max_discount_value":    0.0,
    "ratio_per_point":       1.0,
    "tier":                  "Gold",
    "available_points":      50,
    "min_redemption_points": 100,
    "loyalty_enabled":       true,
    "error": {
      "code":    "BELOW_MIN_REDEMPTION",
      "message": "Minimum 100 points required. Customer has 50."
    }
  }
}
```

Notes:
- `success=true` is preserved on all four shapes because "you can redeem 0 right now" is still a valid computation. POS branches on `data.error.code` (or its absence) to decide UI behavior. This matches LR's auto-cap semantics where a redemption of "0 actual points" is still success.
- HTTP status remains `200` for all of the above.
- `401` (auth) and `422` (Pydantic schema violation) remain HTTP-level errors.

#### 5.7.5 Rationale

> max-redeemable is the **calculator side** of the loyalty redemption flow, and the final bill/payment payload is the **commit side**. Both must use the same helper so POS never shows a different redeemable amount than CRM actually applies.

This eliminates a class of bug where, for example, a Gold customer at a restaurant with `gold_redemption_value=1.5` and `redemption_value=1.0` would see a cap computed at ratio 1.0 (calculator) but be deducted at ratio 1.5 (commit). After this alignment, that divergence is structurally impossible because both paths call `compute_max_redeemable` against the same `customer` and `settings`.

---

## 6. Open Questions for Owner — **ALL RESOLVED 2026-05-23 (FROZEN)**

> Each Q-CORR below is annotated with the **frozen decision** applied to this plan. Implementation works against these answers directly; no further Q&A round is needed.

### Q-CORR-1: Which realtime endpoint is the canonical "final payload"?

- **Option A:** `POST /api/pos/orders` is the only realtime endpoint POS calls. `/webhook/payment-received` is legacy/unused → deprecate.
- **Option B:** Both endpoints are live. POS uses one or the other depending on deployment. Both must be wired through the helper.
- **Option C:** Some other endpoint will become canonical (please specify).

**CRM recommendation:** Option B in code (route both through the helper, zero risk), Option A in handoff doc (POS contract narrows to `/api/pos/orders`).

✅ **FROZEN: Option B in code (both endpoints routed through the shared helper, zero-risk for any existing POS deployment). Option A in handoff doc (POS contract narrows to `/api/pos/orders` as the primary path).**

### Q-CORR-2: Failure handling on the order webhook

If the order payload includes `loyalty_points_used` but redemption fails (e.g. customer not found / insufficient points / loyalty disabled / conflict), what should the order webhook do?

- **Option A — Hard fail:** return `success=false`, do not persist the order. POS must retry without the redemption fields or correct the input.
- **Option B — Soft fail:** persist the order, skip the redemption, return `success=true` with a `loyalty_redeem_warning` field in the response. POS surfaces the warning to the cashier and decides next step.
- **Option C — Partial:** auto-cap is always silent (already does so in LR); other failures are hard-fail.

**CRM recommendation:** Option C. Auto-cap (Q-LR6) already silently succeeds. Other failures (`LOYALTY_DISABLED`, `IDEMPOTENCY_CONFLICT`, `CUSTOMER_NOT_FOUND`) should hard-fail because they indicate the POS-side calculation diverged from CRM truth — order shouldn't silently complete with incorrect totals.

✅ **FROZEN: Option C. Auto-cap is silent (already LR behavior). All other error codes (`LOYALTY_DISABLED`, `IDEMPOTENCY_CONFLICT`, `CUSTOMER_NOT_FOUND`, `INSUFFICIENT_POINTS`, `BELOW_MIN_REDEMPTION`, `SETTINGS_MISSING`) hard-fail the entire order webhook so the bill total never silently diverges from CRM truth.**

### Q-CORR-3: Earn calculation base

When `loyalty_points_used > 0`, should the earn step compute points on:

- **Option A:** Gross `order_amount` (today's behavior, no change).
- **Option B:** Net `order_amount - loyalty_discount` (so customers don't earn back the very points they just redeemed).

**CRM recommendation:** Option B. Industry standard. Aligns with `min_order_value` gating semantics (the customer effectively paid the net amount).

✅ **FROZEN: Option B. Earn is computed on `order_amount − redeemed_value`. `min_order_value` is also evaluated against the net amount, so a near-min order doesn't sneak across the earn threshold purely from points-discount.**

### Q-CORR-4: Idempotency key source on the order payload

POS may or may not send a dedicated `loyalty_idempotency_key`. Fallback?

- **Option A:** Server derives `loyalty_idempotency_key = f"order_{order_data.order_id}"` if not sent. Natural per-order uniqueness; safe for POS retries of the entire order webhook.
- **Option B:** Require POS to always send `loyalty_idempotency_key` when `loyalty_points_used > 0`.

**CRM recommendation:** Option A. POS already retries the order webhook by replaying the same `order_id`; deriving the idempotency key from `order_id` makes order-level retries automatically safe for loyalty too.

✅ **FROZEN: Option A. If POS omits `loyalty_idempotency_key`, server derives it as `f"order_{order_data.order_id}"`. POS retries of the order webhook (which already replay the same `order_id`) are therefore automatically idempotent on the loyalty side too. POS may still send an explicit key, which takes precedence.**

### Q-CORR-5: Fate of `/api/pos/webhook/payment-received`

- **Option A:** Keep + fix via helper (zero-breakage path).
- **Option B:** Deprecate (return HTTP 410 Gone) — only if confirmed POS no longer uses it.
- **Option C:** Leave the existing defective block alone — but then the counter parity defect persists.

**CRM recommendation:** Option A. Option C contradicts the LR scope improvements.

✅ **FROZEN: Option A. Replace the embedded redeem block (`routers/pos.py:1783-1838`) with a call to the shared `redeem_loyalty_points(...)` helper. `POSPaymentWebhook` schema extended with optional `loyalty_idempotency_key` (fallback to `bill_id` → `order_id`). All LR-grade defects in this legacy path are fixed by routing through the helper.**

### Q-CORR-6: Fate of standalone `/api/pos/loyalty/redeem`

- **Option A:** Keep as thin wrapper over the helper. Update handoff doc to clarify it is NOT the primary POS flow. Useful for direct testing, admin curl, and any future cashier-click-immediately variant.
- **Option B:** Remove entirely.

**CRM recommendation:** Option A. Cost of keeping is ~30 LOC; benefit is testability + future flexibility.

✅ **FROZEN: Option A. Endpoint stays. Its body is refactored into a thin wrapper that loads `customer` + `settings` then delegates to `redeem_loyalty_points(...)`. Handoff doc carries a banner: "Not the primary POS flow. Primary path = embed `loyalty_points_used` in `/api/pos/orders` payload."**

### Q-CORR-7: POS handoff doc update

Should the existing handoff doc `/app/memory/crm/crm_1_0/handoff/CR_001C_LR_POS_LOYALTY_REDEEM_API_HANDOFF_TO_POS.md` be:

- **Option A:** Updated in place with a "CORRECTION" banner at the top.
- **Option B:** Marked superseded; new handoff issued: `CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`.

**CRM recommendation:** Option B (separate doc). Keeps the audit trail of the original LR contract intact; gives POS a single, focused doc on the corrected contract.

✅ **FROZEN: Option B. Original LR handoff doc (`CR_001C_LR_POS_LOYALTY_REDEEM_API_HANDOFF_TO_POS.md`) gets a top-banner pointer marking it superseded; new comprehensive handoff is issued at `CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`. New doc covers: the new `loyalty_points_used` fields on `/api/pos/orders`, the same on `/api/pos/webhook/payment-received`, the updated `/api/pos/max-redeemable` contract (§5.7), the standalone `/api/pos/loyalty/redeem` as testing-only, and the full error-code catalog.**

### Q-CORR-8: Sequence — start now or block on L4?

✅ **FROZEN: Start now. L4 (admin redeem + cron counter parity) remains scoped separately and runs after this correction lands in preview. No dependency between the two — the shared helper this correction introduces will simplify L4 (admin path can also be redirected through it during L4).**

---

## 7. Out of Scope (this correction)

| Item | Reason |
|---|---|
| L4 (admin redeem + birthday/anniversary cron) | Separate phase; this correction is strictly LR routing + max-redeemable alignment |
| L5 cleanup | Deferred per scope-lock |
| Coupon redeem / validate / list (CR-001C-C) | Separate CR |
| Wallet debit / credit / reverse (CR-001C-W) | Separate CR |
| Loyalty reverse / refund endpoint | Future redemption CR |
| `pos_id` cleanup / `restaurant_id` cross-check on `/max-redeemable` (§5.7.1 item 8) | **DEFERRED** — owner-approved deferral; do only if trivial and low-risk during implementation |
| POS frontend implementation | POS team |
| CRM admin UI changes | None required |
| Migration / data backfill | None required (forward-only schema additions) |
| Prod deployment | Out — preview only |
| `/app/memory/final/` | Untouched |

---

## 8. Files Anticipated to Change (deferred — for visibility)

| File | Change |
|---|---|
| `backend/core/loyalty.py` | (a) New `redeem_loyalty_points` helper (~120 LOC); (b) New `compute_max_redeemable` helper (~50 LOC) used by both the calculator endpoint and the auto-cap step inside `redeem_loyalty_points` |
| `backend/routers/pos.py` | (a) `POSOrderWebhook` schema +3 optional fields; (b) `pos_order_webhook` handler insert redeem step; (c) `pos_payment_received` embedded block → helper call; (d) `pos_loyalty_redeem` body → thin wrapper; (e) `pos_max_redeemable` body → thin wrapper over `compute_max_redeemable`; request schema accepts `customer_id` OR `cust_mobile` (§5.7) |
| `backend/tests/qa_cr001c_lr_redeem.py` | Extend existing harness with order-webhook + payment-webhook redeem cases + max-redeemable alignment cases (same 36 assertions reused via helper-level tests + ~10 new wiring assertions + ~6 max-redeemable alignment assertions: tier-aware ratio, `LOYALTY_DISABLED`, `SETTINGS_MISSING`, `BELOW_MIN_REDEMPTION`, customer_id+cust_mobile lookup, calculator-cap == commit-cap parity) |
| `memory/crm/crm_1_0/implementation/CR_001C_LR_*_IMPLEMENTATION_REPORT.md` | New report appended after correction QA passes |
| `memory/crm/crm_1_0/qa/CR_001C_LR_*_QA_REPORT.md` | New QA report appended |
| `memory/crm/crm_1_0/handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` | New POS handoff (per Q-CORR-7 Option B). Will include the updated `/max-redeemable` contract per §5.7. |
| `memory/crm/crm_1_0/planning/CR_001_INDEX.md` | Append "LR correction" row |
| `memory/PRD.md` | Append correction status |

**No file deletions. No schema breaking changes. No data migration.**

---

## 9. Rollback Note (for the future implementation, once approved)

The correction is forward-only:

- Schema additions on `POSOrderWebhook` are `Optional` — rollback = ignore the new fields; existing POS clients unaffected.
- Helper extraction is a refactor — rollback = restore the inline LR block from git history.
- No data is created in production unless owner approves prod cut-over (this plan is preview-only).
- The standalone LR endpoint continues to function for direct testing throughout the correction.

`git revert` cleanly returns to the LR-as-cashier-click state.

---

## 10. Frozen Decisions (2026-05-23)

This plan is **FROZEN**. All Q-CORR items are resolved with the CRM-recommended option. Implementation proceeds directly against the matrix below.

| Q | Topic | Frozen decision |
|---|---|---|
| Q-CORR-1 | Canonical realtime endpoint(s) | ✅ **Option B in code** (both `/pos/orders` and `/pos/webhook/payment-received` routed through the shared helper) + **Option A in handoff doc** (POS contract narrows to `/pos/orders` as the primary path) |
| Q-CORR-2 | Failure handling on order webhook | ✅ **Option C** — auto-cap silent; all other redeem errors hard-fail the entire order webhook |
| Q-CORR-3 | Earn base when redeemed | ✅ **Option B** — earn computed on `order_amount − redeemed_value`; `min_order_value` evaluated against net |
| Q-CORR-4 | Idempotency key source | ✅ **Option A** — if POS omits `loyalty_idempotency_key`, server derives `f"order_{order_id}"`; explicit POS-sent key takes precedence |
| Q-CORR-5 | Fate of `/webhook/payment-received` | ✅ **Option A** — keep, replace embedded redeem block with shared helper call; schema gets optional `loyalty_idempotency_key` |
| Q-CORR-6 | Fate of standalone `/loyalty/redeem` | ✅ **Option A** — keep as thin wrapper over helper; handoff doc carries "not primary POS flow" banner |
| Q-CORR-7 | POS handoff doc | ✅ **Option B** — new doc `CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`; original LR handoff doc marked superseded with top-banner pointer |
| Q-CORR-8 | Sequence | ✅ **Start now**. L4 runs after; no dependency. |

**Already approved (max-redeemable scope — owner directive 2026-05-23):**

| Topic | Status |
|---|---|
| `/api/pos/max-redeemable` alignment scope (§5.7 items 1-7) | ✅ **APPROVED 2026-05-23** — owner directive (tier-aware ratio, `loyalty_enabled`, `SETTINGS_MISSING`, shared `compute_max_redeemable` helper, response field echoes, structured `error.code`, `customer_id`/`cust_mobile` accept-either) |
| Item 8 (`pos_id` cleanup / `restaurant_id` cross-check on `/max-redeemable`) | ⏸ **DEFERRED** — implement only if trivial and low-risk during implementation; otherwise skip |

---

## 11. Final Status

`cr001c_lr_redemption_trigger_correction_plan_frozen_ready_to_implement`

Plan is FROZEN. Implementation may begin against this contract. No further owner Q&A round is required. Once code lands and QA passes, the status will move to `cr001c_lr_correction_qa_passed`.

---

## 12. Alias Addendum — `used_loyalty_point` accepted on `/api/pos/orders` (2026-05-24)

**Status:** `cr001c_lr_alias_addendum_qa_passed` (52 / 52 PASS)

### 12.1 Trigger

Live R689 testing (orders `868917`, `868924`, `868925`) revealed that POS's outbound payload mapper currently sends the legacy field name `used_loyalty_point` (singular) on the bill-collect payload. Per the frozen plan §5.2, CRM only reads `loyalty_points_used` — so a POS field-rename was required before the LR correction could fire end-to-end. POS reported a non-trivial backend timeline for that rename.

To unblock POS rollout without changing any frozen decision in §10, CRM adds a Pydantic `validation_alias` on the `loyalty_points_used` field that also accepts the POS-side legacy names.

### 12.2 Frozen decisions UNCHANGED

This addendum does **not** alter any Q-CORR-1…8 decision, the `/max-redeemable` scope (§5.7 items 1-7), or the `/loyalty/redeem` retention. It is a forward-only, schema-level compatibility shim on a single field.

### 12.3 Scope

| Item | Decision |
|---|---|
| File touched | `backend/routers/pos.py` only — the `POSOrderWebhook.loyalty_points_used` field declaration |
| Pattern reused | Same `AliasChoices` precedent as CR-001A Phase 1 (`order_created_at` ← `created_at`) and CR-001A items (`pos_food_id` ← `item_id`, etc.) |
| Aliases accepted | `loyalty_points_used` (canonical) · `used_loyalty_point` (POS legacy, singular) · `used_loyalty_points` (POS legacy, plural variant) |
| `populate_by_name=True` | Already set on the model — no schema-config change needed |
| Behaviour when multiple aliases sent | Pydantic resolves to the canonical name; aliases are silently ignored if canonical is present. No double-application possible. |
| Behaviour when no alias sent | `loyalty_points_used = None` → redeem branch not taken (existing zero-loyalty behavior preserved) |
| `loyalty_discount` / `loyalty_idempotency_key` | UNCHANGED — no aliases added; same Optional fields as before |
| Idempotency | UNCHANGED — `f"order_{order_id}"` fallback unaffected |
| Hard-fail / earn-on-net / counter parity | UNCHANGED |
| Response shape (`data.loyalty_redeem`) | UNCHANGED — always canonical |
| Audit | UNCHANGED — `pos_request_logs.request_body` continues to capture the raw payload (whichever alias POS sends), and the handler logs the canonical resolved value |

### 12.4 Rollback

Forward-only: remove the `validation_alias=AliasChoices(...)` parameter and restore the simple `loyalty_points_used: Optional[int] = None` declaration. No data migration. No collection touch. `git revert` is clean.

### 12.5 Retirement plan

Aliases retire in **L5 cleanup** once POS has fully migrated to the canonical name. Tracking ticket: POS migration adoption status. Until then, both names continue to work — POS can deploy the rename on their own schedule without blocking the LR correction.

### 12.6 QA evidence

- `tests/qa_cr001c_lr_redeem.py` extended with **QA-21**: `/api/pos/orders` accepts POS-legacy alias `used_loyalty_point` and produces identical commit (same PT row schema, same `$inc total_points_redeemed`, same earn-on-net result) as the canonical `loyalty_points_used` path.
- Static QA: **52 / 52 PASS** (51 prior + 1 alias-addendum).
- LX-A 6-key blob regression: still strict (QA-14).
- All earn-on-net (Q-CORR-3), hard-fail (Q-CORR-2), and idempotency-fallback (Q-CORR-4) assertions still pass.
- Artifact: `/app/test_reports/cr_001c_lr_qa_results.json`.

### 12.7 POS contract update

The new POS handoff doc (`handoff/CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md`) is updated to:

- Mark `loyalty_points_used` as the **canonical** field name.
- List `used_loyalty_point` / `used_loyalty_points` as **accepted-but-deprecated** transitional aliases.
- State the retirement intent (L5).
- Reaffirm that all other POS-side gaps observed in R689 testing remain POS-team responsibility (calling `/api/pos/orders` at end-of-bill, gating Apply-Loyalty on customer-selected, using per-customer `ratio_per_point`).

