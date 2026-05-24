# POS Loyalty Redeem API — Handoff to POS Team

> **⚠️ SUPERSEDED 2026-05-24 — see `CR_001C_LR_REDEMPTION_FINAL_PAYLOAD_HANDOFF_TO_POS.md` for the current contract.**
>
> The cashier-click model described below is no longer the primary POS flow.
> POS should embed `loyalty_points_used` in the final `/api/pos/orders` payload;
> CRM commits redemption there. The standalone `POST /api/pos/loyalty/redeem`
> endpoint is retained for direct testing / admin tooling only.
> Field-level contract for that standalone endpoint remains accurate.

---

> **🟢 STATUS: GREEN-LIGHT — POS may consume in preview.**
>
> CR-001C-LR is implemented in CRM preview. Static QA **36 / 36 PASS** on
> 2026-05-23 (controlled, isolated fixtures, full teardown). The endpoint
> below is live at the preview origin and ready for POS integration.
> Prod cut-over will follow the joint batch (same window as the next CR-001A /
> CR-001D / LR push). No prod traffic yet.

---

**CR:** CR-001C-LR (Loyalty Redeem mini-phase, inside CR-001C-L)
**Phase:** LR (single endpoint)
**Date drafted:** 2026-05-23
**From:** CRM Team
**To:** POS 3.0 Billing Team
**Re:** Standalone "redeem loyalty points at billing" endpoint
**Parent docs:**
- `planning/CR_001C_LR_POS_LOYALTY_REDEEM_API_ANALYSIS_AND_PLAN.md`
- `implementation/CR_001C_LR_POS_LOYALTY_REDEEM_API_IMPLEMENTATION_REPORT.md`
- `qa/CR_001C_LR_POS_LOYALTY_REDEEM_API_QA_REPORT.md`

---

## 1. Scope of this Handoff

| Item | In LR? |
|---|---|
| `POST /api/pos/loyalty/redeem` (deduct points + write PT row at billing) | ✅ |
| Tier-aware `ratio_per_point` reuse (LX-A) | ✅ |
| Idempotency (replay + conflict) | ✅ |
| Auto-cap when requested > allowed | ✅ |
| `loyalty_enabled` kill-switch | ✅ |
| Loyalty reverse / refund | ❌ Future redemption CR |
| Coupon redeem / validate / list | ❌ CR-001C-C |
| Wallet debit / credit / reverse | ❌ CR-001C-W |
| `POST /api/pos/max-redeemable` tier-aware upgrade | ❌ follow-up |
| POS frontend implementation | POS team (this doc gives the contract) |

---

## 2. Endpoint

```
POST  /api/pos/loyalty/redeem
```

**Preview origin:** `https://loyalty-trigger-fix.preview.emergentagent.com`

Full URL in preview:

```
https://loyalty-trigger-fix.preview.emergentagent.com/api/pos/loyalty/redeem
```

Prod origin will be the existing CRM prod host. The path is unchanged across environments.

---

## 3. Auth

Same as every other `/api/pos/*` endpoint — `verify_pos_auth`. POS should always use the API-key path.

```
X-API-Key: <restaurant_api_key>
```

JWT Bearer is accepted as a fallback (and `type=customer` tokens are rejected), but production POS traffic should use `X-API-Key` exclusively. No new key needs to be provisioned — the same API key POS already uses for `POST /api/pos/orders`, `GET /api/pos/customers/{id}`, etc. works for redeem.

No new scopes / permissions. `user_id` (restaurant) is derived from the key and used to scope every read/write.

---

## 4. Request Contract

```http
POST /api/pos/loyalty/redeem HTTP/1.1
Content-Type: application/json
X-API-Key: <restaurant_api_key>

{
  "customer_id":        "cust_abc123",
  "points_to_redeem":   100,
  "order_id":           "868999",
  "order_total":        850,
  "idempotency_key":    "pos_order_868999_loyalty_100"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `customer_id` | string | ✅ | CRM `customers.id` for the restaurant (resolved via `/api/pos/customer-lookup` or `/api/pos/customers/{id}`) |
| `points_to_redeem` | integer | ✅ | Positive. Non-integer → HTTP 422 (Pydantic). Zero / negative → `INVALID_POINTS`. |
| `order_id` | string | ✅ | POS order id this redemption is being applied to. Empty / whitespace → `ORDER_ID_REQUIRED`. |
| `order_total` | number | ✅ | The bill amount POS is computing redemption against. Used to enforce `max_redemption_percent` and to derive auto-cap. |
| `idempotency_key` | string | ✅ | POS-generated, deterministic per redeem action. Empty / whitespace → `IDEMPOTENCY_KEY_REQUIRED`. **Recommended format:** `pos_{restaurant_id}_{order_id}_loyalty_{points}` |

### 4.1 Idempotency key — required POS behavior

POS **must** send `idempotency_key`. The CRM uses it to dedupe retries safely. Two rules:

1. On a transient failure (network, 5xx, timeout) POS **must retry with the same key**. The CRM will either replay the original successful response or return `IDEMPOTENCY_CONFLICT` if the parameters changed.
2. POS **must not reuse the same key for a different redeem action**. The recommended format above naturally encodes restaurant + order + points, which prevents accidental reuse.

---

## 5. Success Response (HTTP 200, `success=true`)

```json
{
  "success": true,
  "message": "Points redeemed successfully",
  "data": {
    "customer_id":             "cust_abc123",
    "points_redeemed":         100,
    "ratio_per_point":         1.5,
    "redeemed_value":          150.0,
    "remaining_points":        380,
    "remaining_points_value":  570.0,
    "tier":                    "Gold",
    "total_points_redeemed":   100,
    "transaction_id":          "53e3faef-be5c-4e53-94dc-5396b92156c7"
  }
}
```

| Field | Meaning |
|---|---|
| `points_redeemed` | **The actual points deducted.** May be **less than `points_to_redeem`** if auto-capped — POS must display this value to the cashier, not the requested value. |
| `ratio_per_point` | Tier-aware ₹/point used for this redemption (per Q-LR1: tier source is the customer's current tier). |
| `redeemed_value` | `points_redeemed × ratio_per_point` — the ₹ discount POS should apply to the bill. |
| `remaining_points` | New `total_points` balance after redeem. |
| `remaining_points_value` | `remaining_points × ratio_per_point` — useful for the receipt footer. |
| `tier` | Customer's current tier (unchanged by redeem — Q-LR1: no downgrade). |
| `total_points_redeemed` | New lifetime redeemed counter. |
| `transaction_id` | CRM-side PT row id. **Persist this on the POS order** — it will be required by the future reverse / refund endpoint. |

### 5.1 Idempotent replay

If POS retries with the same `idempotency_key` (same `customer_id` + `order_id` + `points`), the response is identical to the original success plus a marker:

```json
{
  "success": true,
  "message": "Points redeemed successfully (idempotent replay)",
  "data": {
    "...": "same fields as the original",
    "idempotent": true
  }
}
```

POS can use the `idempotent` marker for log/metric segmentation, but functionally must treat it the same as the first response.

---

## 6. Failure Response (HTTP 200, `success=false`)

All business failures return **HTTP 200** with `success=false`. POS must not key off the HTTP status — always inspect `success` and `data.error.code`.

```json
{
  "success": false,
  "message": "Loyalty program is disabled.",
  "data": {
    "error": {
      "code": "LOYALTY_DISABLED",
      "message": "Loyalty program is currently disabled."
    }
  }
}
```

Only schema-level failures (`points_to_redeem` non-integer, malformed JSON, missing fields) return **HTTP 422**.

### 6.1 Error code catalog

| Code | Cause | POS action |
|---|---|---|
| `ORDER_ID_REQUIRED` | Empty / whitespace `order_id` | Fix payload. Don't retry. |
| `IDEMPOTENCY_KEY_REQUIRED` | Empty / whitespace `idempotency_key` | Fix payload. Don't retry. |
| `INVALID_POINTS` | `points_to_redeem ≤ 0` | UI: refuse submission. |
| `IDEMPOTENCY_CONFLICT` | Same key was previously used with different `customer_id` / `order_id` / `points`. `data.error.existing` carries the original triplet for diagnostics. | **Do not retry.** Treat as a POS bug — the key is being reused. |
| `SETTINGS_MISSING` | Restaurant has no `loyalty_settings` doc | UI: hide redeem (treat as loyalty disabled). |
| `LOYALTY_DISABLED` | `loyalty_settings.loyalty_enabled = false` | UI: hide redeem. (The `/pos/customers/{id}/loyalty` blob already exposes `loyalty_enabled` — POS should pre-gate.) |
| `CUSTOMER_NOT_FOUND` | `customer_id` not found under this restaurant | UI: show "customer not found". |
| `BELOW_MIN_REDEMPTION` | Customer balance or requested points below `min_redemption_points`. `data.error.min_redemption_points` carries the threshold. | UI: show min threshold message. |
| `INSUFFICIENT_POINTS` | After auto-cap, zero points are redeemable | UI: show available balance. |

### 6.2 HTTP-level errors

| Status | Meaning |
|---|---|
| `401` | Missing / invalid `X-API-Key` (POS configuration issue). |
| `422` | Pydantic body schema violation (missing required field, wrong type — e.g. `points_to_redeem: 12.5`). |
| `5xx` | Server error. **POS must retry with the same `idempotency_key`.** |

---

## 7. Business Rules (owner-approved)

| # | Rule | Origin |
|---|---|---|
| 1 | **No tier downgrade on redeem.** Customer tier is never modified by this endpoint. | Q-LR1 |
| 2 | **Positive points sign** in `points_transactions.points`; `transaction_type="redeem"` indicates direction. | Q-LR2 |
| 3 | **`idempotency_key` is required.** | Q-LR3 |
| 4 | **Redeem is blocked** when `loyalty_enabled=false`. | Q-LR4 |
| 5 | **`order_id` is required** for POS billing redemption. | Q-LR5 |
| 6 | **Auto-cap, do not reject**, when requested points exceed `max_redemption_percent`, `max_redemption_amount`, or customer's `total_points`. The response carries the capped `points_redeemed` / `redeemed_value`. | Q-LR6 |
| 7 | `ratio_per_point` is tier-aware (LX-A): per-tier override → restaurant `redemption_value` → `0.25` fallback. | LX-A |
| 8 | `min_redemption_points` enforced on **both** customer balance and requested points. | plan §6 |

---

## 8. Data Mutations (informational — POS does not see these)

- `customers`: `$set total_points` (decremented), `$inc total_points_redeemed` (incremented). **`tier` and `total_points_earned` are NOT touched.**
- `points_transactions`: one new row per successful (non-replay) redeem with `transaction_type="redeem"`, `points` (positive), `redeemed_value`, `ratio_per_point`, `balance_after`, `order_id`, `idempotency_key`, `bill_amount`, `points_expired=false`, `created_at`.

The PT-row schema is **forward-compatible** with the future loyalty reverse endpoint — `transaction_id` returned to POS is sufficient to drive the reversal.

---

## 9. Recommended POS Flow at Billing

```
1. Cashier opens bill (order_total known, customer_id resolved).
2. POS reads /pos/customers/{id}/loyalty → checks loyalty_enabled + balance.
3. Cashier enters redeem amount → POS optionally calls /pos/max-redeemable
   to display the cap (note: this helper is NOT yet tier-aware; the LR
   endpoint will auto-cap correctly regardless).
4. On confirm:
     idempotency_key = f"pos_{restaurant_id}_{order_id}_loyalty_{points}"
     POST /api/pos/loyalty/redeem
5. On HTTP 200 + success=true:
     - apply data.redeemed_value as a discount line on the bill
     - display data.points_redeemed (use the CAPPED value, not the typed one)
     - persist data.transaction_id on the POS order record
6. On HTTP 5xx / timeout:
     - retry the EXACT same payload (same idempotency_key)
7. On success=false:
     - branch on data.error.code per §6.1
```

---

## 10. cURL Examples

### 10.1 Successful redeem

```bash
curl -X POST 'https://loyalty-trigger-fix.preview.emergentagent.com/api/pos/loyalty/redeem' \
  -H 'Content-Type: application/json' \
  -H 'X-API-Key: <restaurant_api_key>' \
  -d '{
    "customer_id": "cust_abc123",
    "points_to_redeem": 100,
    "order_id": "868999",
    "order_total": 850,
    "idempotency_key": "pos_868999_loyalty_100"
  }'
```

### 10.2 Replay (exact same body) — expect `idempotent: true`

```bash
curl -X POST '...same URL...' \
  -H 'X-API-Key: ...' \
  -H 'Content-Type: application/json' \
  -d '{ "...same body as 10.1..." }'
```

### 10.3 Conflict (same key, different points) — expect `IDEMPOTENCY_CONFLICT`

```bash
curl -X POST '...same URL...' \
  -H 'X-API-Key: ...' \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_id": "cust_abc123",
    "points_to_redeem": 250,
    "order_id": "868999",
    "order_total": 850,
    "idempotency_key": "pos_868999_loyalty_100"
  }'
```

---

## 11. Things POS Must NOT Do

| ❌ Anti-pattern | ✅ Correct |
|---|---|
| Re-derive `redeemed_value` client-side and apply it instead of `data.redeemed_value` | Always use the server-returned `redeemed_value` (snapshots tier ratio at redeem time). |
| Display `points_to_redeem` after auto-cap | Always display `data.points_redeemed` (the capped, actual amount). |
| Send a fresh `idempotency_key` on retry | Send the **exact same key** as the original attempt. |
| Reuse an existing `idempotency_key` for a new redeem action | Generate a new deterministic key per redeem; reuse only on retry. |
| Discard `transaction_id` | Persist it on the POS order — required for the future reverse endpoint. |
| Treat HTTP 200 as automatic success | Always check `success` flag + `data.error.code`. |
| Call this endpoint when `loyalty_enabled=false` (visible via `/pos/customers/{id}/loyalty`) | Pre-gate redeem UI on the loyalty blob; this endpoint is a server-side safety net only. |

---

## 12. QA Evidence

- **Static QA:** 36 / 36 PASS (`/app/memory/crm/crm_1_0/qa/CR_001C_LR_POS_LOYALTY_REDEEM_API_QA_REPORT.md`).
- **Coverage:** success path (10 assertions), auto-cap, below-min, loyalty disabled, missing settings, customer not found, invalid points (zero / negative / float), missing `order_id`, missing `idempotency_key`, idempotent replay (no double-deduct, single PT row), idempotency conflict (points + customer variants), no tier downgrade, tier-aware Gold ratio, LX-A 6-key blob regression, `/api/health` regression.
- **Sample artifacts:** `/app/test_reports/cr_001c_lr_qa_results.json` (machine-readable per-assertion log).

POS may run their own integration tests against the preview origin. The endpoint is idempotent, so re-running the same scenario does not pollute counters.

---

## 13. Open Items (NOT in LR scope)

| Item | Owner | Status |
|---|---|---|
| Loyalty reverse / refund endpoint | CRM | Deferred (future redemption CR). PT schema already supports it. |
| `POST /api/pos/max-redeemable` tier-aware upgrade | CRM | Deferred (follow-up). Currently uses flat `redemption_value`; LR endpoint compensates by auto-capping correctly. |
| `{user_id:1, idempotency_key:1}` index on `points_transactions` | CRM | Deferred to L5 cleanup. |
| Admin redeem counter parity (`routers/points.py`) | CRM | L4. |
| Order-webhook embedded redeem counter parity (`routers/pos.py:1543-1598`) | CRM | L4. |

---

## 14. Contacts

| Topic | Owner |
|---|---|
| Endpoint contract / bugs | CRM team (this repo) |
| API key provisioning | CRM ops |
| POS integration | POS 3.0 Billing team |

---

## 15. Final Status

`cr001c_lr_pos_loyalty_redeem_api_qa_passed`

**POS may consume `POST /api/pos/loyalty/redeem` in preview now.**

Prod rollout will be coordinated separately; this doc is the source of truth for the contract and will not change between preview and prod.
