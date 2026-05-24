# POS Loyalty Redemption — Final-Payload Handoff to POS

> **🟢 STATUS: GREEN-LIGHT — POS may consume in preview.**
>
> CR-001C-LR Correction is implemented in CRM preview. Static QA **52 / 52 PASS**
> on 2026-05-24 (51 original + 1 alias-addendum). This document is the corrected
> POS contract, **superseding** the cashier-click model documented in
> `CR_001C_LR_POS_LOYALTY_REDEEM_API_HANDOFF_TO_POS.md`.
>
> **2026-05-24 alias addendum:** the canonical field name on `/api/pos/orders` is
> `loyalty_points_used`, but CRM also accepts POS-legacy aliases
> `used_loyalty_point` (singular) and `used_loyalty_points` (plural) on the same
> field via Pydantic `validation_alias`. POS may roll out the rename on its own
> timeline. Aliases are transitional and retire in L5 cleanup. See §3.3.

---

**CR:** CR-001C-LR (Correction)
**Date:** 2026-05-24
**From:** CRM Team
**To:** POS 3.0 Billing Team
**Re:** Loyalty redemption now commits at the final order payload — not on cashier click

---

## 1. What Changed (vs. the original LR handoff)

| Aspect | Before (cashier-click) | After (final-payload — THIS doc) |
|---|---|---|
| When does CRM redeem? | When POS calls `/api/pos/loyalty/redeem` on cashier click | When POS sends the final order via `/api/pos/orders` (primary) or `/api/pos/webhook/payment-received` (legacy) |
| POS responsibility on cashier click | Call CRM redeem API | **Compute discount locally**, adjust displayed bill, send redemption decision in the final payload |
| `/api/pos/loyalty/redeem` | Primary POS endpoint | **Testing / admin-tooling only** (still works, kept for curl/QA) |
| `/api/pos/max-redeemable` | Calculator, not tier-aware | **Now tier-aware**, returns full context, structured error codes |

## 2. The POS Billing Flow (Recommended)

```
1. Cashier opens bill. POS reads:
     GET /api/pos/customers/{id}/loyalty       (or /pos/customer-lookup)
     → caches: total_points, ratio_per_point, tier, loyalty_enabled

2. POS asks server-truth cap for the current bill:
     POST /api/pos/max-redeemable
     → caches: max_points_redeemable, max_discount_value

3. Cashier types redeem amount X (constrained by max_points_redeemable):
     discount_preview = X * ratio_per_point        ← LOCAL math, no CRM call
     new_balance      = total_points - X            ← LOCAL math
     Display both on the bill UI.

4. Cashier confirms bill. POS sends the final order:
     POST /api/pos/orders
     {
       ...existing order fields...,
       "loyalty_points_used":      X,              ← REQUIRED if redeeming
       "loyalty_discount":         X * ratio,      ← informational; server recomputes
       "loyalty_idempotency_key":  "<optional>"    ← server falls back to "order_<order_id>"
     }
     CRM commits redemption atomically as part of the order.

5. POS reads the response:
     data.loyalty_redeem.transaction_id       ← persist on the POS order
     data.loyalty_redeem.points_redeemed      ← may be < X if auto-capped — use this
     data.loyalty_redeem.redeemed_value       ← the ₹ discount actually applied
     data.points_earned                       ← earn is on NET amount
```

## 3. New / Changed Endpoints

### 3.1 `POST /api/pos/customers/{customer_id}/loyalty` — *(unchanged, LX-A)*

Strict 6-key blob: `tier, tier_label, total_points, ratio_per_point, points_value, loyalty_enabled`. Use this once per bill to drive the redeem UI.

### 3.2 `POST /api/pos/max-redeemable` — **REVISED**

#### Request

```json
{
  "pos_id":        "mygenie",
  "restaurant_id": "689",
  "customer_id":   "5ebde664-...",     // either this...
  "cust_mobile":   "7505242126",       // ...or this (at least one)
  "bill_amount":   1000
}
```

- `customer_id` and `cust_mobile` are both optional individually; at least one required.
- `customer_id` preferred when both are present.

#### Success response

```json
{
  "success": true,
  "message": "Max redeemable calculated",
  "data": {
    "max_points_redeemable": 240,
    "max_discount_value":    360.0,
    "ratio_per_point":       1.5,
    "tier":                  "Gold",
    "available_points":      240,
    "min_redemption_points": 50,
    "loyalty_enabled":       true
  }
}
```

#### Failure responses (`success=true` preserved; POS branches on `data.error.code`)

| `error.code` | Trigger |
|---|---|
| `LOYALTY_DISABLED` | Restaurant's `loyalty_enabled=false` |
| `SETTINGS_MISSING` | No `loyalty_settings` doc for the restaurant |
| `BELOW_MIN_REDEMPTION` | Customer balance below `min_redemption_points` |
| `INVALID_REQUEST` | Neither `customer_id` nor `cust_mobile` provided (`success=false`) |
| `CUSTOMER_NOT_FOUND` | Customer not found under the authed restaurant (`success=false`) |

All P0/P1 alignments per the frozen plan §5.7 are live. The calculator and the commit-side auto-cap share the same `compute_max_redeemable` function — they cannot disagree.

### 3.3 `POST /api/pos/orders` — **REVISED (added 3 optional fields)**

#### New optional fields on `POSOrderWebhook`

| Field | Type | Required | Notes |
|---|---|---|---|
| `loyalty_points_used` | int? | only when redeeming | Points POS chose to redeem (must be > 0 if present). **Accepted aliases (deprecated, transitional):** `used_loyalty_point`, `used_loyalty_points`. POS may send either the canonical name or one of the legacy aliases during migration; CRM resolves to the canonical field. Aliases will be retired in L5. |
| `loyalty_discount` | float? | optional | POS-displayed ₹ — server recomputes for source of truth. **Do NOT map your `discount_value` field here** — `discount_value` is a *total-discount* aggregate (loyalty + coupon + self + order) and would be mis-attributed to loyalty alone. Either send a strictly-loyalty-only ₹ value or omit this field; CRM recomputes from `loyalty_points_used × ratio_per_point` regardless. |
| `loyalty_idempotency_key` | string? | optional | Server falls back to `f"order_{order_id}"` if absent. **Recommended: omit.** POS retries that replay the same `order_id` are then automatically idempotent with zero POS code change. |

#### Behavior

- If `loyalty_points_used > 0`:
  - CRM calls the shared redeem helper **before** the earn calc.
  - On success: `customer.total_points` decremented, `total_points_redeemed` incremented, PT row written (`transaction_type="redeem"`, positive points, with `order_id`, `idempotency_key`, `redeemed_value`, `ratio_per_point`).
  - **Earn is computed on `order_amount − redeemed_value`** (so the customer doesn't earn back the very points they just redeemed).
  - Response includes a new top-level `data.loyalty_redeem` block carrying the full redemption result.
- On any redeem error (other than auto-cap, which is silent):
  - **The entire order webhook hard-fails** with `success=false`.
  - The order is **not** persisted.
  - No PT rows, no wallet changes.
  - POS must surface the error and not let the cashier proceed silently.

#### Idempotency on order retries (zero-touch for POS)

POS already retries the order webhook by replaying the same `order_id`. The server-derived `loyalty_idempotency_key = f"order_{order_id}"` makes those retries automatically safe for loyalty — the second call returns the original redeem result with `data.loyalty_redeem.idempotent=true` and **does not double-deduct**.

POS may still send an explicit `loyalty_idempotency_key`; it takes precedence over the derived one.

#### Sample success response

```json
{
  "success": true,
  "message": "Order processed successfully",
  "data": {
    "order_id": "internal_id_...",
    "pos_order_id": "868999",
    "customer_id": "cust_abc123",
    "order_amount": 500.0,
    "points_earned": 20,           // 5% of (500 − 100) = 20
    "total_points": 220,           // post-redeem + earn
    "tier": "Bronze",
    "wallet_used": 0,
    "wallet_balance_after": 0,
    "coupon_applied": null,
    "coupon_discount": 0.0,
    "loyalty_redeem": {
      "customer_id": "cust_abc123",
      "points_redeemed": 100,
      "ratio_per_point": 1.0,
      "redeemed_value": 100.0,
      "remaining_points": 200,
      "remaining_points_value": 200.0,
      "tier": "Bronze",
      "total_points_redeemed": 100,
      "transaction_id": "pt_05bf..."
    }
  }
}
```

#### Sample hard-fail response (insufficient points / loyalty disabled / etc.)

```json
{
  "success": false,
  "message": "Loyalty redemption failed: Minimum 50 points required. Customer has 10.",
  "data": {
    "error": {
      "code": "BELOW_MIN_REDEMPTION",
      "message": "Minimum 50 points required. Customer has 10.",
      "min_redemption_points": 50,
      "available_points": 10
    }
  }
}
```

### 3.4 `POST /api/pos/webhook/payment-received` — *(legacy, now routed through shared helper)*

If your deployment still uses this endpoint, the existing `redeem_points` field continues to work. Defects in the previous embedded implementation are now fixed:

- ✅ `$inc customer.total_points_redeemed`
- ✅ Tier-aware ratio (`get_redemption_value_for_tier`)
- ✅ Honors `loyalty_enabled`
- ✅ Idempotent (derived `payrec_<bill_id_or_synth>` key)
- ✅ PT row carries `order_id`, `idempotency_key`, `redeemed_value`, `ratio_per_point`, `points_expired=false`

You may also send `metadata.loyalty_idempotency_key` to override the server-derived key.

Unlike `/pos/orders`, this endpoint does **not** hard-fail on redeem errors — the payment flow continues and `data.points_redeemed_error` is surfaced.

### 3.5 `POST /api/pos/loyalty/redeem` — **NOT the primary POS flow**

This endpoint is retained for direct testing and admin tooling **only**. Production POS should embed `loyalty_points_used` in `/api/pos/orders` instead.

Contract is unchanged from the original LR handoff (see `CR_001C_LR_POS_LOYALTY_REDEEM_API_HANDOFF_TO_POS.md` for the field-level details).

## 4. Error Code Catalog (consolidated)

| Code | Endpoints | Trigger |
|---|---|---|
| `ORDER_ID_REQUIRED` | `/loyalty/redeem` | Empty/whitespace `order_id` |
| `IDEMPOTENCY_KEY_REQUIRED` | `/loyalty/redeem` | Empty/whitespace `idempotency_key` |
| `INVALID_POINTS` | `/loyalty/redeem`, `/orders`, `/webhook/payment-received` | `points_to_redeem ≤ 0` |
| `IDEMPOTENCY_CONFLICT` | all redeem callers | Same key, different `customer_id` / `order_id` / `points` |
| `SETTINGS_MISSING` | `/max-redeemable`, all redeem callers | No `loyalty_settings` doc |
| `LOYALTY_DISABLED` | `/max-redeemable`, all redeem callers | `loyalty_enabled=false` |
| `CUSTOMER_NOT_FOUND` | `/max-redeemable`, `/loyalty/redeem` | Customer not found under restaurant |
| `BELOW_MIN_REDEMPTION` | `/max-redeemable`, all redeem callers | Below `min_redemption_points` |
| `INSUFFICIENT_POINTS` | redeem callers | After auto-cap, zero points redeemable |
| `INVALID_REQUEST` | `/max-redeemable` | Neither `customer_id` nor `cust_mobile` |

## 5. What POS Must NOT Do (anti-patterns)

| ❌ Anti-pattern | ✅ Correct |
|---|---|
| Call `/pos/loyalty/redeem` on cashier click | Embed `loyalty_points_used` in the final `/pos/orders` payload |
| Re-derive `redeemed_value` client-side | Use `data.loyalty_redeem.redeemed_value` from CRM response |
| Display `loyalty_points_used` after auto-cap | Display `data.loyalty_redeem.points_redeemed` (capped, actual) |
| Send a fresh key on order retry | Replay the same `order_id` — server derives the same key |
| Reuse the same `loyalty_idempotency_key` for a different redeem | Derive a unique key per redemption action |
| Use `/max-redeemable`'s `data.error.code` as a 5xx-style hard error | It's an HTTP 200 with `success=true` and a structured `data.error.code` — branch on the code |
| Skip the cap check on long-running bills | Re-fetch `/max-redeemable` whenever `bill_amount` changes materially |

## 6. QA Evidence

- **Static QA: 52 / 52 PASS** — see `qa/CR_001C_LR_CORRECTION_QA_REPORT.md`.
- New coverage: `/max-redeemable` alignment (7 assertions), calculator-cap == commit-cap parity (1), `/pos/orders` embedded redeem (3), order-retry idempotency fallback (1), order-webhook hard-fail (1), **POS-legacy alias `used_loyalty_point` accepted with identical commit semantics (QA-21, added 2026-05-24)**.
- Old coverage preserved: all 36 original LR assertions still pass through the shared helper.

POS may run their own integration tests against the preview origin (`https://loyalty-trigger-fix.preview.emergentagent.com`). All redeem paths are idempotent — replaying the same order is safe.

## 7. Migration Note for POS

The CRM side is forward-only:

- POS deployments that don't yet send `loyalty_points_used` keep working with **zero** code change.
- **POS deployments that still send the legacy alias `used_loyalty_point` (or plural `used_loyalty_points`) keep working unchanged — CRM resolves the alias to the canonical field.** Aliases are transitional and will be retired in L5 cleanup once POS has migrated. There is no hard deadline; coordinate the rename on the POS team's own timeline.
- `/pos/max-redeemable` continues to accept `cust_mobile`-only requests (back-compat). Adding `customer_id` is a non-breaking improvement POS can adopt at its own pace.
- The standalone `/pos/loyalty/redeem` endpoint continues to function — but POS deployments using it for cashier-click should switch to the order-payload model when convenient.

There is no flag-day. There is no required cutover order.

## 8. Open Items (NOT in this correction)

| Item | Owner | Status |
|---|---|---|
| Loyalty reverse / refund endpoint | CRM | Future redemption CR |
| `{user_id:1, idempotency_key:1}` index on `points_transactions` | CRM | L5 cleanup |
| Admin redeem counter parity (`routers/points.py`) | CRM | L4 |
| Birthday / anniversary cron counter parity | CRM | L4 |
| `pos_id` cleanup / `restaurant_id` cross-check on `/max-redeemable` | CRM | Deferred (frozen plan §5.7 item 8) |

## 9. Contacts

| Topic | Owner |
|---|---|
| Endpoint contract / bugs | CRM team |
| API key provisioning | CRM ops |
| POS integration | POS 3.0 Billing team |

## 10. Final Status

`cr001c_lr_correction_qa_passed`

POS may consume the corrected flow in preview now. Prod rollout will be coordinated separately; this doc is the source of truth for the contract and will not change between preview and prod.
