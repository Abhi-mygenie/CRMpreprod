# CR-001C-C — Coupon V1 Implementation Plan

**Module:** CR-001C-C (Coupon) — V1 implementation plan
**Date:** 2026-05-24
**Status:** `cr001c_coupon_v1_implementation_plan_ready_for_owner_approval`
**Author:** CRM Team
**Prerequisites:**
- Capability audit: `cr001c_coupon_existing_system_capability_audit_complete_waiting_owner_decisions`
- Architecture decision: `cr001c_coupon_scrap_vs_keep_decision_option_b_hybrid_rebuild_recommended`
- Owner decisions: `cr001c_coupon_v1_owner_decisions_frozen_ready_for_implementation_plan`

---

## 1. Executive Summary

Coupon V1 implements the **POS-facing** coupon contract on top of the existing CRM coupon skeleton. The implementation:

- **Keeps** the `coupons` collection, the 9 admin CRUD endpoints, and the Pydantic models (frontend depends on them).
- **Rebuilds** the POS coupon flow as two clean endpoints (`GET /api/pos/coupons/available`, `POST /api/pos/coupons/validate`) backed by a single shared service module (`core/coupon.py`).
- **Defers** usage commitment to the final `POST /api/pos/orders` payload — same final-commit pattern as Loyalty LR Correction. `validate` is read-only. The legacy `/api/pos/coupons/apply` is retained as a thin wrapper for backwards compatibility but is documented as deprecated for POS.
- **Records** usage in `coupon_usage` (real-time canonical) with `order_id` linkage for idempotency. `coupon_transactions` is treated as migration-only legacy.
- **Aligns analytics** to read from `coupon_usage` (so realtime coupon flow shows up in dashboards).

V1 is restricted to **ORDER_FLAT + ORDER_PERCENTAGE** (Q1=A). Item/category coupons are V2 and BOGO/happy-hour are V3 (Q6=B). Wallet stacking is deferred to CR-001C-W (Q3=D). Coupon ↔ Loyalty stacking is config-driven via a new `stackable_with_loyalty` flag, default `False` (Q2=C). Discount basis and source of truth: POS sends the actual applied amount in the final payload, CRM commits (Q4=B, Q5=C).

---

## 2. Inputs Reviewed

| # | Document | Purpose |
|---|---|---|
| 1 | `/app/memory/PRD.md` | Top-level CR-001C-C scope |
| 2 | `/app/memory/crm/crm_1_0/planning/CR_001_INDEX.md` | CR-001C-C row |
| 3 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_EXISTING_SYSTEM_CAPABILITY_AUDIT.md` | Existing capability surface |
| 4 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_SCRAP_VS_KEEP_DECISION.md` | Option B architecture |
| 5 | `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_OWNER_DECISIONS.md` | Q1–Q6 frozen answers |
| 6 | `/app/memory/crm/crm_1_0/planning/POS3_0_BUG_108_API_INVENTORY_FOR_CRM_2026_05_22.md` | POS contract inventory |

| # | Code file inspected | Why |
|---|---|---|
| 1 | `backend/routers/coupons.py` (1–238) | 9 admin CRUD endpoints + legacy `/validate` & `/apply` (admin JWT) |
| 2 | `backend/routers/pos.py` POS coupon block (~2400–2476) | Existing `/pos/coupons/validate` + `/pos/coupons/apply` (query-param, no JSON body, no error codes) |
| 3 | `backend/routers/pos.py` `POSOrderWebhook` model (~1100–1230) | `coupon_code` + `coupon_discount` fields already exist on final-order schema |
| 4 | `backend/routers/pos.py` `/pos/orders` handler (~1240–1462) | Final-order persistence path — currently passes coupon fields to `order_doc` but does **not** record `coupon_usage` |
| 5 | `backend/routers/pos.py` legacy `/webhook/payment-received` (~1464–1740) | Embedded inline coupon block — to be wrapped/deprecated |
| 6 | `backend/routers/pos.py` order persistence helper `_persist_order(...)` (~800–940) | Where `coupon_usage` recording will be added |
| 7 | `backend/models/schemas.py` (460–518) | `Coupon`, `CouponCreate`, `CouponUpdate`, `CouponUsage` models |
| 8 | `backend/services/analytics_service.py` `get_coupon_stats(...)` (217–233) | Currently reads `coupon_transactions` — must align to `coupon_usage` |
| 9 | `backend/routers/migration.py` (~480) | Writes legacy `coupon_transactions` rows during R689 migration — left untouched (read-only side for analytics) |
| 10 | `backend/core/loyalty.py` `redeem_loyalty_points(...)`, `compute_max_redeemable(...)` | Reference pattern for the new `core/coupon.py` service |
| 11 | `backend/routers/pos.py` `verify_pos_auth` import (line 10) | POS auth pattern (X-API-Key) to mirror for new endpoints |
| 12 | `backend/server.py` router registration | Where to add `coupons_pos_router` if it’s split out (decision: register inside existing `pos.router`) |

**Collections inspected:**
- `coupons` (canonical config) — keep
- `coupon_usage` (realtime usage) — promote to canonical, add `order_id` + indexes
- `coupon_transactions` (migration-only) — read-only legacy, analytics will union

---

## 3. Frozen Decisions Applied

| # | Decision | Source |
|---|---|---|
| Architecture | Option B — keep skeleton, rebuild POS contract + engine | Scrap-vs-Keep doc |
| Q1 = A | V1 supports `ORDER_FLAT` + `ORDER_PERCENTAGE` only | Owner decisions doc |
| Q2 = C | Coupon + Loyalty stack only if `stackable_with_loyalty=True` (default `False`) | Owner decisions doc |
| Q3 = D | Wallet stacking deferred to CR-001C-W (V1 ignores wallet entirely) | Owner decisions doc |
| Q4 = B | Usage recorded only at final `POST /api/pos/orders` | Owner decisions doc |
| Q5 = C | POS is source of truth: POS sends `coupon_code`, `coupon_discount`, `order_total` in final payload; CRM validates and records using POS-sent values | Owner decisions doc |
| Q6 = B | V1 = flat/pct only; V2 = item/category; V3 = BOGO/happy-hour | Owner decisions doc |

---

## 4. Current Code Baseline

### 4.1 Files / endpoints classified

| File / endpoint | Action |
|---|---|
| `backend/routers/coupons.py` — 9 admin CRUD endpoints (`POST /coupons`, `GET /coupons`, `GET /coupons/{id}`, `PUT`, `DELETE`, `POST /toggle`, `POST /validate` (admin), `POST /apply` (admin), `GET /{id}/usage`) | **KEEP unchanged** (frontend dependency). |
| `backend/routers/pos.py` `pos_validate_coupon` (~2402) | **REBUILD** — replace with JSON-body version with structured `error.code`. Old query-param signature deprecated. |
| `backend/routers/pos.py` `pos_apply_coupon` (~2446) | **DEPRECATE** for POS. Keep route but mark legacy in docstring; do not delete in V1 (POS may still hit it during transition). |
| `backend/routers/pos.py` `pos_process_order` (`POST /pos/orders`, ~1240) | **EXTEND** — call new service to validate coupon + record `coupon_usage` when `coupon_code` is present. Idempotent on `order_id`. |
| `backend/routers/pos.py` `pos_payment_received` (~1464) inline coupon block (~1630) | **REWIRE** through the new service helper (no duplicated logic). Functionally unchanged in V1. |
| `backend/services/analytics_service.py` `get_coupon_stats` | **ALIGN** — union of `coupon_usage` (realtime) + `coupon_transactions` (legacy migration). |
| `backend/models/schemas.py` `Coupon`, `CouponCreate`, `CouponUpdate`, `CouponUsage` | **EXTEND** (backward compatible) — add `coupon_type`, `stackable_with_loyalty`, and on `CouponUsage` add `user_id`, `restaurant_id`, `order_id`, `order_total`, `coupon_discount`, `discount_type`, `discount_value`, `source`, `created_at`. All `Optional` with safe defaults. |
| `backend/core/coupon.py` | **NEW FILE** — central coupon service. |
| `backend/routers/migration.py` | **NOT TOUCHED**. |
| `backend/routers/customers.py`, `points.py`, `wallet.py`, `feedback.py`, etc. | **NOT TOUCHED**. |
| `backend/core/loyalty.py` | **NOT TOUCHED** (Loyalty frozen). |
| `/app/memory/final/` | **NOT TOUCHED**. |

### 4.2 Existing field surface confirmed

`coupons` collection — fields already present (audit + grep): `id`, `user_id`, `code`, `discount_type` (`"flat"` | `"percentage"`), `discount_value`, `start_date`, `end_date`, `usage_limit`, `per_user_limit` (default 1), `min_order_value`, `max_discount`, `specific_users`, `applicable_channels` (default `["delivery","takeaway","dine_in"]`), `description`, `is_active`, `total_used`, `created_at`.

`coupon_usage` collection — fields already present: `id`, `coupon_id`, `customer_id`, `order_value`, `discount_applied`, `channel`, `used_at`.

`POSOrderWebhook` (final POS payload) — fields already present (pos.py lines 1148–1149): `coupon_code: Optional[str]`, `coupon_discount: float = 0.0`. Also `order_amount` (line 1142), `order_sub_total_amount` (1143), `order_discount` (1146), `order_id` (top-level pos identifier already on the model).

---

## 5. Implementation Scope

### 5.1 IN-V1
1. New file `backend/core/coupon.py` — central coupon service with 5 functions (see §7).
2. New endpoint `GET /api/pos/coupons/available` in `pos.py`.
3. Rebuilt endpoint `POST /api/pos/coupons/validate` in `pos.py` — JSON body + structured `error.code`.
4. Extension of `POST /api/pos/orders` to commit `coupon_usage` when `coupon_code` is present and non-empty (idempotent on `order_id`).
5. Backward-compatible model extensions on `Coupon` and `CouponUsage`.
6. Analytics alignment in `get_coupon_stats` to read `coupon_usage` (realtime) + `coupon_transactions` (legacy).
7. MongoDB indexes on `coupon_usage` (`order_id` unique, plus `(user_id, coupon_id)`, `(user_id, customer_id, coupon_id)`).
8. QA harness `backend/tests/qa_cr001c_c_coupon_v1.py`.

### 5.2 OUT-OF-V1 (reaffirmed)
Item-level / category-level / BOGO / Buy-X-Get-Y / every-Nth / happy-hour / time-window / free-item / wallet cashback / referral / POS cart auto-add free item / coupon reversal-refund lifecycle / Wallet CR / Loyalty changes / L5 cleanup / prod deployment.

---

## 6. API Contract Plan

### 6.1 `GET /api/pos/coupons/available`

| Item | Value |
|---|---|
| **File** | `backend/routers/pos.py` (register under existing `pos.router`) |
| **Auth** | `Depends(verify_pos_auth)` — X-API-Key header (same as all POS endpoints) |
| **Query params** | `customer_id: str` *(required)*, `order_total: float` *(required)*, `channel: str = "pos"` *(optional, defaults to `pos`)* |
| **Body** | None (GET) |
| **Behaviour** | Read-only. Calls `list_available_coupons(...)`. No usage recorded. |
| **Filters applied** | `user_id == auth.user_id`, `is_active == True`, `start_date <= now <= end_date`, `order_total >= min_order_value`, `total_used < usage_limit` (if set), per-customer usage `< per_user_limit`, `channel in applicable_channels`, `customer_id in specific_users` when `specific_users` is non-empty. |

**Success response (200) — example**

```json
{
  "success": true,
  "message": "Available coupons",
  "data": {
    "customer_id": "cust_abc",
    "order_total": 850.0,
    "channel": "pos",
    "count": 2,
    "coupons": [
      {
        "id": "cpn_001",
        "code": "WELCOME50",
        "title": "Welcome 50 off",
        "coupon_type": "order",
        "discount_type": "flat",
        "discount_value": 50.0,
        "min_order_value": 500.0,
        "max_discount": null,
        "expected_discount": 50.0,
        "final_amount_preview": 800.0,
        "stackable_with_loyalty": false,
        "valid_from": "2026-05-01T00:00:00+00:00",
        "valid_until": "2026-12-31T23:59:59+00:00"
      },
      {
        "id": "cpn_002",
        "code": "FLAT10PCT",
        "title": "10% off",
        "coupon_type": "order",
        "discount_type": "percentage",
        "discount_value": 10.0,
        "min_order_value": 300.0,
        "max_discount": 150.0,
        "expected_discount": 85.0,
        "final_amount_preview": 765.0,
        "stackable_with_loyalty": true
      }
    ]
  }
}
```

**Empty-state response (200)**

```json
{
  "success": true,
  "message": "No coupons available",
  "data": { "customer_id": "cust_abc", "order_total": 850.0, "channel": "pos", "count": 0, "coupons": [] }
}
```

> 200 (not 404) for empty list — matches existing POS convention (`POSResponse(success=True, message=..., data={"count":0,"coupons":[]})`).

---

### 6.2 `POST /api/pos/coupons/validate`

| Item | Value |
|---|---|
| **File** | `backend/routers/pos.py` (replaces existing query-param version) |
| **Auth** | `Depends(verify_pos_auth)` |
| **Body** | Pydantic `POSCouponValidateRequest` |

**Request body**

```json
{
  "code": "WELCOME50",
  "customer_id": "cust_abc",
  "order_total": 850.0,
  "channel": "pos",
  "loyalty_points_used": 0
}
```

- `code` — required, case-insensitive (uppercased server-side).
- `customer_id` — required, used for `specific_users` + `per_user_limit` checks.
- `order_total` — required, the POS-computed subtotal/order amount on which coupon would apply.
- `channel` — optional, defaults to `"pos"`.
- `loyalty_points_used` — optional, used only for stacking check (Q2). If `> 0` and coupon’s `stackable_with_loyalty == False`, returns `STACKING_NOT_ALLOWED`. **No state change**.

**Success response (200)**

```json
{
  "success": true,
  "message": "Coupon valid",
  "data": {
    "valid": true,
    "code": "WELCOME50",
    "coupon_id": "cpn_001",
    "title": "Welcome 50 off",
    "coupon_type": "order",
    "discount_type": "flat",
    "discount_value": 50.0,
    "computed_discount": 50.0,
    "final_amount_preview": 800.0,
    "stackable_with_loyalty": false
  }
}
```

> `validate` is **read-only** — does NOT insert into `coupon_usage`, does NOT `$inc total_used`, does NOT mutate anything. (Q4=B.)

**Failure response (200 with `success=false`)** — matches existing `POSResponse` envelope used across `pos.py`. HTTP 200 prevents POS-side generic 4xx handling from losing the structured payload.

```json
{
  "success": false,
  "message": "Coupon expired",
  "data": {
    "valid": false,
    "error": {
      "code": "EXPIRED",
      "field": "end_date",
      "detail": "Coupon WELCOME50 expired on 2026-04-30T23:59:59+00:00"
    }
  }
}
```

**Error code mapping**

| Trigger | `error.code` | Message |
|---|---|---|
| No coupon doc match (`user_id`+`code`) | `INVALID_CODE` | "Invalid coupon code" |
| Found but `is_active == False` | `INACTIVE` | "Coupon is inactive" |
| `now < start_date` | `INACTIVE` | "Coupon not yet active" (sub-case; `field=start_date`) |
| `now > end_date` | `EXPIRED` | "Coupon has expired" |
| `total_used >= usage_limit` (when set) | `USAGE_LIMIT_REACHED` | "Coupon usage limit reached" |
| Per-customer count `>= per_user_limit` | `CUSTOMER_USAGE_LIMIT_REACHED` | "Customer has already used this coupon the maximum times" |
| `order_total < min_order_value` | `MIN_ORDER_NOT_MET` | "Minimum order value is Rs.{min}" |
| `channel not in applicable_channels` | `CHANNEL_NOT_VALID` | "Coupon not valid for channel {channel}" |
| `specific_users` non-empty and customer not in list | `CUSTOMER_NOT_ELIGIBLE` | "Coupon not valid for this customer" |
| `loyalty_points_used > 0` AND `stackable_with_loyalty == False` | `STACKING_NOT_ALLOWED` | "Coupon cannot be combined with loyalty points" |

All errors carry the same `{ code, field?, detail }` envelope.

---

## 7. Central Coupon Service Plan

**New file:** `backend/core/coupon.py`

Mirrors the structure of `backend/core/loyalty.py`. All functions are pure (no HTTP concerns) and return `dict` results with an `ok: bool` and either `data` or `error`.

| Function | Signature (planned) | Responsibility |
|---|---|---|
| `normalize_coupon_type(discount_type: Optional[str]) -> str` | sync | Maps legacy `"flat"`/`"percentage"` and new `"order_flat"`/`"order_percentage"` aliases to canonical `"flat"`/`"percentage"`. V1 rejects anything else. |
| `compute_coupon_discount(coupon: dict, order_total: float) -> float` | sync | Pure calculator. `flat` → `min(discount_value, order_total)`. `percentage` → `min((order_total * discount_value) / 100, max_discount or +inf)`. Rounds to 2 decimals. |
| `validate_coupon_for_customer(db, *, user_id, code, customer_id, order_total, channel, loyalty_points_used: float = 0.0, now: datetime \| None = None) -> dict` | async | Single source of truth for **all** validation checks listed in §6.2. Returns `{"ok": True, "coupon": dict, "computed_discount": float}` or `{"ok": False, "error": {"code": str, "field": str \| None, "detail": str}}`. Used by `validate`, `available`, and final-order recording. |
| `list_available_coupons(db, *, user_id, customer_id, order_total, channel, now: datetime \| None = None) -> list[dict]` | async | Pulls all `is_active=True` coupons for `user_id`, runs `validate_coupon_for_customer` filter on each, returns only the passing ones with `expected_discount` + `final_amount_preview` pre-computed. |
| `record_coupon_usage_for_order(db, *, user_id, restaurant_id, customer_id, code, order_id, order_total, coupon_discount_from_pos: float, channel: str, source: str = "pos_orders", now: datetime \| None = None) -> dict` | async | Final-commit. Re-runs `validate_coupon_for_customer` (Q5 — CRM is a guardrail even though POS is source of truth). If validation fails, returns `{"ok": False, "error": {...}}` and `pos_orders` handler logs but does **not** roll back the order. If valid, performs an **upsert** on `coupon_usage` keyed by `order_id` (idempotent — replay of same `order_id` is a no-op), then `$inc total_used` on the coupon **only on first insert** (uses `upsert` result `upserted_id` to gate the increment). Records the POS-sent `coupon_discount` as canonical (Q5=C). |

**Idempotency strategy (final commit)**

- Unique compound index `{ user_id: 1, order_id: 1 }` on `coupon_usage`, partial filter `order_id` exists.
- `update_one({"user_id":..., "order_id":...}, {"$setOnInsert": {<usage doc>}}, upsert=True)`.
- If `upserted_id is None` → already recorded → return existing doc, do NOT increment `total_used`.
- If `upserted_id is not None` → first insert → `$inc total_used: 1` on `coupons`.

**Stacking with Loyalty (Q2=C)** — `validate_coupon_for_customer` accepts `loyalty_points_used`. The `pos_orders` handler passes the redeem amount from the same payload. If `loyalty_points_used > 0` and `coupon.stackable_with_loyalty != True` → `STACKING_NOT_ALLOWED`. CRM does NOT decide which side wins — POS chose to stack; CRM rejects with structured error so POS can correct.

**Wallet (Q3=D)** — service ignores `wallet_used` and any wallet-related fields. No wallet check in V1.

---

## 8. Data Model / Field Plan

### 8.1 `coupons` collection — backward-compatible additions

| Field | Type | Default | Source | Notes |
|---|---|---|---|---|
| `id` | str | — | existing | UUID |
| `user_id` | str | — | existing | CRM user / restaurant owner |
| `restaurant_id` | str \| None | `None` | **derived at read time** from `users.restaurant_id` if not present | NOT stored in V1 — the existing `user_id` scoping is sufficient. `coupon_usage` will store `restaurant_id` for analytics joins. |
| `code` | str | — | existing | Stored uppercase |
| `title` | str \| None | `None` | **NEW (optional)** | Display name. Falls back to `description` for backwards compat. |
| `coupon_type` | str | `"order"` | **NEW (optional)** | Discriminator for future V2/V3 (`"item"`, `"category"`, `"bogo"`, …). V1 only writes/accepts `"order"`. |
| `discount_type` | str | — | existing | `"flat"` or `"percentage"` |
| `discount_value` | float | — | existing | |
| `min_order_value` | float | `0` | existing | |
| `max_discount` | float \| None | `None` | existing | Cap for percentage |
| `is_active` | bool | `True` | existing | |
| `start_date` / `valid_from` | ISO str | — | existing (`start_date`) | Service reads both keys for fwd compat. |
| `end_date` / `valid_until` / `expires_at` | ISO str | — | existing (`end_date`) | Service reads `end_date` first, falls back to `valid_until`/`expires_at` if present. |
| `usage_limit` | int \| None | `None` | existing | Global limit |
| `per_user_limit` | int | `1` | existing | |
| `applicable_channels` | list[str] | `["delivery","takeaway","dine_in"]` | existing | V1 also accepts `"pos"`. |
| `specific_users` | list[str] \| None | `None` | existing | Customer IDs |
| `stackable_with_loyalty` | bool | `False` | **NEW (optional)** | Q2 stacking flag. Default `False` ⇒ existing rows behave as non-stackable. |
| `total_used` | int | `0` | existing | Incremented atomically on first `coupon_usage` insert per `order_id`. |
| `created_at` | ISO str | — | existing | |
| `description` | str \| None | `None` | existing | |

**No DB migration required** — all new fields are optional with safe defaults. Pydantic models in `schemas.py` extend `Coupon` / `CouponCreate` / `CouponUpdate` with the new optional fields.

### 8.2 `coupon_usage` collection — extension to canonical realtime row

| Field | Type | Default | Source | Notes |
|---|---|---|---|---|
| `id` | str | — | existing | UUID |
| `user_id` | str | — | **NEW** | Restaurant owner scope; required for indexes |
| `restaurant_id` | str \| None | `None` | **NEW** | From `POSOrderWebhook.restaurant_id` or `users.restaurant_id` |
| `customer_id` | str | — | existing | |
| `coupon_id` | str | — | existing | |
| `coupon_code` | str | — | **NEW** | Denormalized for analytics |
| `order_id` | str \| None | `None` | **NEW** | `POSOrderWebhook.order_id` (POS-side order id); idempotency key |
| `order_total` | float | — | **NEW** | Canonical = POS-sent `order_amount` (Q5=C) |
| `coupon_discount` | float | — | **NEW** | Canonical = POS-sent `coupon_discount` (Q5=C) |
| `discount_type` | str | — | **NEW** | Denormalized from coupon at usage time |
| `discount_value` | float | — | **NEW** | Denormalized |
| `channel` | str | `"pos"` | existing | |
| `source` | str | `"pos_orders"` | **NEW** | `"pos_orders"` \| `"pos_payment_received"` \| `"admin_apply"` |
| `order_value` | float \| None | `None` | existing (legacy) | Keep for backward compat; equal to `order_total` for new rows |
| `discount_applied` | float \| None | `None` | existing (legacy) | Keep for backward compat; equal to `coupon_discount` for new rows |
| `used_at` | ISO str | — | existing | Kept |
| `created_at` | ISO str | — | **NEW** | `datetime.now(timezone.utc).isoformat()` — preferred timestamp |

**Indexes (created on startup, idempotent — `ensure_coupon_indexes(db)` invoked from `server.py` lifespan):**

```text
db.coupon_usage.create_index([("user_id", 1), ("order_id", 1)],
  unique=True, partialFilterExpression={"order_id": {"$type": "string"}})
db.coupon_usage.create_index([("user_id", 1), ("coupon_id", 1), ("customer_id", 1)])
db.coupon_usage.create_index([("user_id", 1), ("created_at", -1)])
db.coupons.create_index([("user_id", 1), ("code", 1)], unique=True)  # may already exist; safe to assert
```

---

## 9. Final POS Order Integration Plan

### 9.1 Where it hooks in
`pos_process_order` (`POST /api/pos/orders`, `backend/routers/pos.py`, ~line 1240). After the order document is built and persisted by `_persist_order(...)` (~800), and **after** the loyalty redeem block runs (so loyalty result is known for the response payload). Coupon recording is **non-blocking** for order persistence — order is already saved.

### 9.2 Canonical field mapping (Q5=C)

| Final payload field | CRM canonical record |
|---|---|
| `coupon_code` | `coupon_usage.coupon_code` (uppercased) |
| `coupon_discount` | `coupon_usage.coupon_discount` *(POS-sent, source of truth)* |
| `order_amount` | `coupon_usage.order_total` |
| `order_id` | `coupon_usage.order_id` *(idempotency key)* |
| `customer_id` (resolved from `cust_mobile` or direct) | `coupon_usage.customer_id` |
| `restaurant_id` | `coupon_usage.restaurant_id` |
| `order_type` / `channel` | `coupon_usage.channel` (fallback `"pos"`) |
| `loyalty_points_used` (alias of `used_loyalty_point`) | passed to `validate_coupon_for_customer` for stacking check |

### 9.3 Decision matrix (edge cases)

| Scenario | CRM behaviour |
|---|---|
| `coupon_code` present + `coupon_discount > 0` + validates | Record `coupon_usage`, `$inc total_used` (first time), include in response `data.coupon` block. |
| `coupon_code` present + `coupon_discount == 0` | **WARN-LOG** at `logger.warning` with `pos_order_id`, then **skip recording**. CRM does not synthesize a discount. (Treats as POS-side cancel/zero-out; not an error.) |
| `coupon_discount > 0` but `coupon_code` missing/empty | **WARN-LOG**; do NOT record `coupon_usage` (no canonical key). Order still persists. |
| `coupon_code` was not previously validated (no `validate` call) | **Still record.** Final order is the commit point (Q4=B). CRM re-runs `validate_coupon_for_customer` server-side — if it fails, record nothing, log structured `coupon_validation_failed_at_final_order` warning with `error.code`, return order with `data.coupon = {"recorded": false, "error": {...}}`. Order itself is **not rejected** because POS already showed the discount to the customer. |
| `coupon_code` valid but `coupon_discount` ≠ CRM-computed amount | **Honour POS amount** (Q5=C — POS is source of truth). CRM logs a `coupon_amount_variance` warning with both values for analytics. |
| Final-order webhook **replay** (same `order_id`) | Upsert hits existing row → no-op on `total_used`. Response returns existing `coupon_usage.id`. |
| `loyalty_points_used > 0` and `stackable_with_loyalty == False` | Record nothing for coupon; log `STACKING_NOT_ALLOWED` warning; loyalty already committed (separate row). Order still persists. (Surfaces the conflict but does not block — final-commit model.) |
| Coupon present on legacy `/webhook/payment-received` | Same service helper called, but `source="pos_payment_received"`. Backwards compatible. |

### 9.4 Response shape addition

Existing `/pos/orders` success response (~line 1437) gets a new optional field:

```json
"coupon_usage": {
  "recorded": true,
  "usage_id": "uuid-...",
  "coupon_code": "WELCOME50",
  "coupon_discount": 50.0,
  "idempotent_replay": false
}
```

Or on validation failure at final-commit:

```json
"coupon_usage": {
  "recorded": false,
  "coupon_code": "EXPIRED10",
  "error": { "code": "EXPIRED", "field": "end_date", "detail": "..." }
}
```

### 9.5 Alignment with Loyalty pattern

Mirrors `loyalty_redeem_result` exactly (see `pos.py:1456`). Same shape, same final-commit semantics, same idempotency-on-`order_id` philosophy. Coupon recording happens **independently** of loyalty (no atomic transaction across the two) — same as today’s loyalty redeem; failure of one does not block the other.

---

## 10. Analytics Alignment Plan

### 10.1 Current state
`services/analytics_service.py::get_coupon_stats(user_id)` reads only from `coupon_transactions` (migration legacy). Realtime coupon usage from `/pos/coupons/apply` today writes to `coupon_usage` and is **invisible to analytics**.

### 10.2 V1 alignment
Switch `get_coupon_stats` to **union both collections**:

| Metric | New source |
|---|---|
| `total_coupons` | `db.coupons.count_documents({user_id})` *(unchanged)* |
| `coupons_used` | `db.coupon_usage.count_documents({user_id})` + `db.coupon_transactions.count_documents({user_id})` |
| `discount_availed` | `Σ coupon_usage.coupon_discount` + `Σ coupon_transactions.discount_amount` |

Both collections are read; `coupon_usage` is the **realtime canonical** for new orders, `coupon_transactions` remains read-only for historical R689-migrated rows.

### 10.3 QA confirmation
- After inserting a synthetic `coupon_usage` row (test), `get_coupon_stats` must reflect both the count and the discount sum.
- Migration-side `coupon_transactions` rows must continue to appear (no regression).

> Wallet analytics (CR-001C-W concern) is not touched.

---

## 11. Compatibility / Legacy Endpoint Plan

| Endpoint | Status in V1 | Reason |
|---|---|---|
| `POST /coupons` (admin) | unchanged | Frontend `CouponsPage.jsx` create flow |
| `GET /coupons` (admin) | unchanged | Frontend list |
| `GET /coupons/{id}` (admin) | unchanged | Frontend detail |
| `PUT /coupons/{id}` (admin) | unchanged | Frontend edit |
| `DELETE /coupons/{id}` (admin) | unchanged | Frontend delete |
| `POST /coupons/{id}/toggle` (admin) | unchanged | Frontend |
| `POST /coupons/validate` (admin JWT, query-param) | unchanged | Internal admin test page; not used by POS |
| `POST /coupons/apply` (admin JWT) | unchanged | Internal admin manual-apply; not used by POS |
| `GET /coupons/{id}/usage` (admin) | unchanged | Will read from `coupon_usage` (already does) — automatically picks up new realtime rows |
| `POST /api/pos/coupons/validate` (POS, query-param) | **REPLACED** with JSON-body version (signature change). POS team is the only consumer; coordinated through BUG-108 handoff. |
| `POST /api/pos/coupons/apply` (POS) | **DEPRECATED** — kept functional as a thin wrapper around `record_coupon_usage_for_order` with `source="pos_apply_legacy"`. Docstring flagged "legacy — POS should commit via `/pos/orders`". Removal in L5/V2. |
| `GET /api/pos/coupons/available` | **NEW** |

Frontend impact: **none**. Admin uses the JWT routes only.

---

## 12. File-by-File Implementation Plan

| File | Change Type | Planned Change | Risk |
|---|---|---|---|
| `backend/core/coupon.py` | **NEW** | 5 functions: `normalize_coupon_type`, `compute_coupon_discount`, `validate_coupon_for_customer`, `list_available_coupons`, `record_coupon_usage_for_order`. ~250 LOC. | LOW — pure service module, no side effects outside its own calls. |
| `backend/models/schemas.py` | **EXTEND** | Add optional `title`, `coupon_type`, `stackable_with_loyalty` to `Coupon`/`CouponCreate`/`CouponUpdate`. Extend `CouponUsage` with optional `user_id`, `restaurant_id`, `coupon_code`, `order_id`, `order_total`, `coupon_discount`, `discount_type`, `discount_value`, `source`, `created_at`. Add new `POSCouponValidateRequest` model. ~30 LOC. | LOW — all additions are `Optional` with defaults. Existing rows deserialize unchanged via `extra="ignore"`. |
| `backend/routers/pos.py` | **EXTEND + REBUILD** | (a) Add `GET /coupons/available` endpoint (~40 LOC). (b) Replace `pos_validate_coupon` with JSON-body version routed through `validate_coupon_for_customer` (~25 LOC). (c) Wire `pos_apply_coupon` through `record_coupon_usage_for_order` (≤10 LOC delta, marked legacy). (d) In `pos_process_order` after `_persist_order`, add coupon-record block (~25 LOC). (e) Rewire inline coupon block in `pos_payment_received` through the service (~10 LOC delta). | MEDIUM — `pos.py` is large; isolation by adding code in clearly-marked CR-001C-C blocks reduces blast radius. Keep `loyalty_redeem_result` flow untouched. |
| `backend/services/analytics_service.py` | **EXTEND** | Update `get_coupon_stats` to union `coupon_usage` + `coupon_transactions`. ~15 LOC delta. | LOW — additive read; existing migration callers unaffected. |
| `backend/server.py` | **EXTEND** | In `lifespan`, call `await ensure_coupon_indexes(db)` (new helper exported from `core/coupon.py`). ~3 LOC. | LOW — idempotent index creation. |
| `backend/tests/qa_cr001c_c_coupon_v1.py` | **NEW** | Static + DB-fixture QA harness for the 22 QA cases (§13). | LOW |
| `backend/routers/coupons.py` | **NOT TOUCHED** | Admin CRUD frozen. | — |
| `backend/routers/migration.py` | **NOT TOUCHED** | Legacy `coupon_transactions` writer left alone. | — |
| `backend/core/loyalty.py`, `wallet.py`, etc. | **NOT TOUCHED** | Out of scope. | — |
| `/app/memory/final/` | **NOT TOUCHED** | Out of scope. | — |

---

## 13. QA Plan

**Harness:** `backend/tests/qa_cr001c_c_coupon_v1.py` — mirrors `qa_cr001c_lr_redeem.py` style: seeds isolated user/customer/coupon docs, calls service functions directly + endpoints via TestClient, asserts schema + side-effects.

| # | Case | Expected |
|---|---|---|
| QA-01 | `available` returns active eligible coupons | 200, list contains seeded coupon `WELCOME50`, `expected_discount` & `final_amount_preview` correctly computed. |
| QA-02 | `available` excludes inactive coupons (`is_active=False`) | Coupon missing from list. |
| QA-03 | `available` excludes expired coupons (`end_date < now`) | Coupon missing from list. |
| QA-04 | `available` excludes coupons whose `min_order_value > order_total` | Coupon missing from list. |
| QA-05 | `available` respects `specific_users` filter | Customer in list ⇒ included; not in list ⇒ excluded. |
| QA-06 | `validate` flat coupon success | `valid=True`, `computed_discount=50.0`, `final_amount_preview=order-50`. |
| QA-07 | `validate` percentage coupon success | `computed_discount = round(order_total*pct/100, 2)`. |
| QA-08 | `validate` percentage with `max_discount` cap | `computed_discount = min(computed, max_discount)`. |
| QA-09 | `validate` invalid code | `error.code == "INVALID_CODE"`. |
| QA-10 | `validate` expired coupon | `error.code == "EXPIRED"`. |
| QA-11 | `validate` inactive coupon | `error.code == "INACTIVE"`. |
| QA-12 | `validate` min-order-not-met | `error.code == "MIN_ORDER_NOT_MET"`. |
| QA-13 | `validate` global usage_limit reached | `error.code == "USAGE_LIMIT_REACHED"`. |
| QA-14 | `validate` per_user_limit reached | `error.code == "CUSTOMER_USAGE_LIMIT_REACHED"`. |
| QA-15 | `validate` customer not in `specific_users` | `error.code == "CUSTOMER_NOT_ELIGIBLE"`. |
| QA-16 | `validate` channel not in `applicable_channels` | `error.code == "CHANNEL_NOT_VALID"`. |
| QA-17 | `validate` stacking when `stackable_with_loyalty=False` and `loyalty_points_used > 0` | `error.code == "STACKING_NOT_ALLOWED"`. |
| QA-18 | `validate` stacking allowed when `stackable_with_loyalty=True` and `loyalty_points_used > 0` | `valid=True`. |
| QA-19 | Final `POST /pos/orders` records `coupon_usage` once | Single `coupon_usage` row inserted; `coupons.total_used` incremented by 1. |
| QA-20 | Final `POST /pos/orders` retry with same `order_id` is idempotent | Second call inserts no row; `total_used` unchanged; response `idempotent_replay=true`. |
| QA-21 | Final `POST /pos/orders` with `coupon_code` present and `coupon_discount == 0` | No `coupon_usage` row; warning logged; order persisted normally. |
| QA-22 | Final `POST /pos/orders` with `coupon_discount > 0` but `coupon_code` missing | No `coupon_usage` row; order persisted. |
| QA-23 | Final `POST /pos/orders` with coupon that fails server-side validation | Order persisted; `coupon_usage.recorded=false`; structured error in response. |
| QA-24 | `get_coupon_stats` reflects new realtime row | After QA-19, `coupons_used += 1`, `discount_availed += coupon_discount`. |
| QA-25 | `get_coupon_stats` still reflects legacy `coupon_transactions` | Migration row count unchanged in result. |
| QA-26 | Admin CRUD smoke — create / list / toggle / delete | 200 across the board; existing behaviour. |
| QA-27 | Loyalty regression — LX-A 6-key blob + LR final-commit | Unchanged (Loyalty QA harness re-run, 52/52 still PASS). |
| QA-28 | Wallet regression | `wallet_used` path unchanged; no coupon code path mutates wallet docs. |

**Total: 28 QA cases.**

---

## 14. Rollback Plan

V1 is feature-isolated by file boundaries. Rollback is a code-revert; no DB migration to undo.

| Layer | Rollback step |
|---|---|
| Endpoint disable (fast) | Comment out the new endpoint decorators in `pos.py` (`/coupons/available`, JSON `/coupons/validate`). Legacy query-param `validate` remains usable. |
| Final-order recording disable | Remove the coupon-record block from `pos_process_order` (single contiguous block, ~25 LOC). Order persistence path untouched. |
| Service module | Leave `core/coupon.py` in place (unreferenced is harmless) or `git revert`. |
| Schema additions | All new fields are optional ⇒ no DB rollback needed. |
| Index rollback | `db.coupon_usage.drop_index("user_id_1_order_id_1")` if causing issues — safe; recreatable. |
| Analytics rollback | Revert `get_coupon_stats` two-line change. |

Feature-flag option (defer to implementation phase if owner wants): wrap the final-order recording block in `if os.environ.get("COUPON_V1_RECORD_USAGE", "true").lower() == "true":`. Disabled by env in <1 min.

---

## 15. Implementation Order

1. **Central coupon service** — `backend/core/coupon.py` (`normalize_coupon_type`, `compute_coupon_discount`, `validate_coupon_for_customer`, `list_available_coupons`, `record_coupon_usage_for_order`, `ensure_coupon_indexes`).
2. **Schema additions** — `backend/models/schemas.py` (optional fields, `POSCouponValidateRequest`).
3. **POS `available` endpoint** — `backend/routers/pos.py`.
4. **POS `validate` endpoint rebuild** — `backend/routers/pos.py` (JSON body + `error.code`).
5. **Final-order coupon recording** — wire into `pos_process_order`. Also rewire `pos_payment_received` + deprecate `pos_apply_coupon`.
6. **Index bootstrap** — `server.py` lifespan call to `ensure_coupon_indexes(db)`.
7. **Analytics alignment** — `services/analytics_service.py::get_coupon_stats` union.
8. **Tests / QA** — `backend/tests/qa_cr001c_c_coupon_v1.py` (28 cases) + Loyalty regression rerun.
9. **Docs update** — implementation report, QA report, INDEX/PRD status flip.

---

## 16. Risks and Open Questions

### Risks

| Risk | Mitigation |
|---|---|
| `pos.py` is large (2585 LOC) — edits risk accidental regression in unrelated POS endpoints | All CR-001C-C changes are inside clearly-marked `# CR-001C-C` blocks; Loyalty QA harness rerun catches regressions. |
| POS team may not yet send `loyalty_points_used` reliably in final payload (BUG-108 still open) | Stacking check tolerates `None`/`0` ⇒ no STACKING_NOT_ALLOWED unless POS explicitly sends `> 0`. Same alias precedent as CR-001C-LR. |
| `coupon_usage` legacy rows lack `user_id` ⇒ analytics union may double-count if migration writes both | Migration writes only to `coupon_transactions` (verified in `migration.py:480`). `coupon_usage` is realtime-only ⇒ no double count. |
| Idempotency unique index creation on existing collection with legacy rows lacking `order_id` | Use `partialFilterExpression={"order_id": {"$type": "string"}}` so the index ignores legacy rows without `order_id`. |
| `pos.coupon_code` casing inconsistencies | Service uppercases on both write and lookup (precedent set by admin `create_coupon`). |

### Open questions (non-blocking — defaults proposed)

| # | Question | Proposed default for V1 |
|---|---|---|
| OQ-1 | Should CRM reject `/pos/orders` if coupon validation fails server-side at final commit? | **No.** Order persists, coupon-not-recorded warning surfaced in response. (Aligns with Loyalty LR Correction philosophy: POS is the billing source of truth at commit time.) |
| OQ-2 | Should `expected_discount` in `available` be computed using current `order_total`, or per-coupon for each potential combination? | **Current `order_total` only.** Per-combination preview is V2 territory. |
| OQ-3 | Should `validate` echo a server-side `signature` token for POS to send back in final payload (binding the validation to the commit)? | **No for V1.** Final-commit re-validates server-side; signature pattern is not in scope. |
| OQ-4 | Should `stackable_with_loyalty` be exposed in admin CRUD UI in V1? | **Backend only.** Frontend admin UI add is out of scope; owner can patch via API. UI added in a separate small ticket post-V1 if needed. |

All four are owner-deferrable. None block implementation start.

---

## 17. Final Recommendation

**Ready for implementation.** The plan:
- Reuses 100% of the existing `coupons` collection and admin CRUD surface.
- Adds one new service module (`core/coupon.py`) and one new POS endpoint (`GET /pos/coupons/available`).
- Replaces one existing POS endpoint signature (`POST /pos/coupons/validate` → JSON body + structured errors) — only POS team is impacted, coordinated through BUG-108 handoff.
- Extends two existing handlers (`POST /pos/orders` and `POST /pos/webhook/payment-received`) with a single idempotent service call each.
- Aligns analytics with a 2-line read addition.
- Backwards compatible at the data layer (no DB migration).
- Idempotent at the final commit (unique `order_id` per `coupon_usage`).
- Mirrors the Loyalty LR Correction pattern owner already approved.

Recommend proceeding to implementation phase under status flip:
- Start: `cr001c_coupon_v1_implementation_in_progress`
- Completion target: `cr001c_coupon_v1_implementation_qa_passed_in_preview`

---

## 18. Final Status

`cr001c_coupon_v1_implementation_plan_ready_for_owner_approval`


---

# Addendum A — Owner Clarifications (Approved 2026-05-24)

This addendum responds to the 7 clarifications attached to plan approval. Everything below supersedes / extends the corresponding section in the original plan. Status remains `cr001c_coupon_v1_implementation_plan_ready_for_owner_approval` → flipping to `cr001c_coupon_v1_implementation_in_progress` upon implementation start.

## A.1 Seed / test coupon fixture plan

**Confirmed empty state (verified against prod-preprod DB `mygenie` on 2026-05-24):**

| Collection | Count |
|---|---|
| `coupons` | 0 |
| `coupon_usage` | 0 |
| `coupon_transactions` | 0 |
| `users` | 17 |
| `customers` | 2734 |

Since all 3 coupon collections are empty, QA needs synthetic fixtures. Fixture script and policy:

- **File:** `backend/tests/seed_coupon_v1_fixtures.py`
- **Mode:** Idempotent, scoped to a single CRM user via `--user-id <id>` and a single customer via `--customer-id <id>` CLI args. Skips inserts if `code` already exists for that `user_id`.
- **Auto-prefix:** All seeded coupon codes are prefixed `QA_C1_` to avoid colliding with any real coupons an owner creates later.
- **Cleanup:** Script also supports `--cleanup` which deletes only `code LIKE 'QA_C1_%'` rows and their `coupon_usage` children (matched by `coupon_id`).
- **Coupons seeded (6 rows):**

| Code | Type | Value | Min order | Max disc | Channels | Specific users | Stackable w/ loyalty | Active | Expiry |
|---|---|---|---|---|---|---|---|---|---|
| `QA_C1_FLAT50` | flat | 50 | 200 | — | pos, dine_in | — | False | True | +30d |
| `QA_C1_PCT10` | percentage | 10 | 100 | 80 | pos, dine_in, takeaway, delivery | — | True | True | +30d |
| `QA_C1_EXPIRED` | flat | 25 | 0 | — | pos | — | False | True | **-1d** |
| `QA_C1_INACTIVE` | flat | 25 | 0 | — | pos | — | False | **False** | +30d |
| `QA_C1_PERUSER` | flat | 10 | 0 | — | pos | — | False | True | +30d (per_user_limit=1) |
| `QA_C1_VIPONLY` | flat | 100 | 500 | — | pos, dine_in | `[QA_C1_CUST]` | False | True | +30d |

- **Customer fixture:** Reuses an existing customer in the database. QA harness picks the first customer for the seeded `user_id` and writes its `id` into `QA_C1_VIPONLY.specific_users` so the eligibility test is deterministic.
- **Runner:** QA harness `qa_cr001c_c_coupon_v1.py` calls `seed_coupon_v1_fixtures.seed(...)` in setup and `seed_coupon_v1_fixtures.cleanup(...)` in teardown — no persistent prod-DB pollution.

## A.2 Frozen canonical POS payload field map

Canonical names are CRM-side. Aliases are accepted on input (via Pydantic `validation_alias=AliasChoices(...)`, same precedent as CR-001C-LR `loyalty_points_used`). On read/output CRM always returns the canonical name.

| Concept | **Canonical** | Accepted aliases on input | Notes |
|---|---|---|---|
| Coupon code | `coupon_code` | `couponCode`, `coupon` | Uppercased server-side. Required to record usage. |
| Discount amount (POS-applied) | `coupon_discount` | `couponDiscount`, `coupon_amount`, `coupon_discount_amount` | Float ≥ 0. POS-source-of-truth (Q5=C). |
| Coupon title (display) | `coupon_title` | `couponTitle`, `coupon_name` | Optional; falls back to coupon doc's `title` / `description`. |
| Coupon type | `coupon_type` | `couponType` | V1 accepts `"order"`/`"order_flat"`/`"order_percentage"`. Others rejected with `INVALID_COUPON_TYPE_FOR_V1` (logged warning, recording skipped). |
| Order amount | `order_amount` | `orderAmount`, `order_total`, `orderTotal` | Float. Recorded as `coupon_usage.order_total`. |
| Order id (POS-side) | `order_id` | `orderId`, `pos_order_id` (read-only fallback) | String. Idempotency key. |
| Customer reference | `customer_id` | direct field on payload | Used when present. |
| Customer phone fallback | `cust_mobile` | `customer_phone`, `mobile`, `phone` | Used to resolve to `customers.id` when `customer_id` absent. |
| Channel | `channel` | `order_type` (fallback) | Defaults to `"pos"`. |
| Restaurant scope | `restaurant_id` | `restaurantId` | Stored on `coupon_usage`. |
| Loyalty stack signal | `loyalty_points_used` | `used_loyalty_point`, `used_loyalty_points` | Existing CR-001C-LR alias set; reused for stacking check. |

> Aliases on `coupon_code`, `coupon_discount`, `coupon_title`, `coupon_type`, `order_amount` are new and added to `POSOrderWebhook` in this CR. The `order_id`, `cust_mobile`, `customer_id`, `restaurant_id`, `loyalty_points_used` aliases already exist.

## A.3 Final-order validation failure behavior (frozen)

When `coupon_code` is present in the final `/pos/orders` payload and CRM's server-side `validate_coupon_for_customer` returns `ok=False`:

1. **Order persistence continues normally.** The order document is already saved by `_save_order_and_transactions`. CRM never rolls back the order because POS already showed the discount to the customer at the till.
2. **No `coupon_usage` row is inserted.**
3. **No `coupons.total_used` increment.**
4. **Structured warning logged** via `logger.warning` with shape:

    ```
    coupon_validation_failed_at_final_order user_id=<...> pos_order_id=<...>
      order_id=<crm uuid> customer_id=<...> coupon_code=<UPPER>
      error_code=<CODE> error_field=<field|null> reason=<short detail>
    ```
5. **Response surfaces the failure** under `data.coupon_usage`:

    ```json
    "coupon_usage": {
      "recorded": false,
      "coupon_code": "QA_C1_EXPIRED",
      "error": { "code": "EXPIRED", "field": "end_date", "detail": "..." }
    }
    ```
6. **HTTP status remains 200** (response envelope `success=true` for the overall order). Loyalty redeem outcome is independent.

> If `coupon_code` is missing/blank, no validation runs, no log line. If `coupon_code` is present but `coupon_discount == 0`, treated as POS-side cancel → warning `coupon_zero_discount_skipped` and recording skipped (also frozen here).

## A.4 Coupon discount mismatch tolerance (frozen)

CRM computes its own expected discount via `compute_coupon_discount(coupon, order_total)` and compares against the POS-sent `coupon_discount`. POS is source of truth (Q5=C) — CRM does not override — but it does log variance for analytics/reconciliation.

**Tolerance threshold:**

> `abs(pos_sent − crm_computed) <= max(1.00, 0.01 * crm_computed)`
>
> i.e. **₹1.00 absolute** OR **1% relative**, whichever is greater.

- Within tolerance ⇒ silent. Record POS amount as-is.
- Outside tolerance ⇒ `logger.warning("coupon_amount_variance ...")` with both values, ratio, and `pos_order_id` for offline reconciliation. **Recording still proceeds with POS amount** (per Q5=C). Variance does NOT block the order.
- Tolerance is constants in `core/coupon.py` (`COUPON_VARIANCE_ABS_TOLERANCE = 1.00`, `COUPON_VARIANCE_REL_TOLERANCE = 0.01`) so an owner can tune without redeploy if needed.

Rationale: rounding modes differ between POS billing engines (banker's rounding vs half-up) and CRM Python rounding; a sub-rupee delta is normal and not actionable.

## A.5 Idempotency uniqueness (frozen)

**Choice: `(user_id, order_id)` — one-coupon-per-order in V1.**

| Aspect | Decision |
|---|---|
| V1 unique key on `coupon_usage` | Compound unique partial index `{user_id: 1, order_id: 1}` where `order_id` exists as string. |
| One coupon per order? | **Yes for V1.** POS sends a single `coupon_code` per `/pos/orders` payload; the schema only carries one. |
| Future-safe upgrade path | When V2 introduces item/category coupons that may stack with each other (still no multi-coupon at order level expected for V2), the index can be **swapped non-destructively** to `{user_id: 1, order_id: 1, coupon_code: 1}` because the V1 keyset is a proper prefix subset of V2 keyset (no row has two coupon codes today, so the V2 index's uniqueness is satisfied by the V1 data without conflict). |
| Migration cost on upgrade | Zero data migration — only `db.coupon_usage.drop_index(...)` + `create_index(...)`. Documented in the implementation report. |

> The narrower V1 key prevents accidental dual-coupon attempts in V1 even if a future POS bug sends two coupons on the same `order_id`.

## A.6 Admin CRUD endpoint compatibility — frozen list + smoke matrix

All 9 endpoints in `backend/routers/coupons.py` are kept verbatim. None touched by Coupon V1. Verified by grep on 2026-05-24:

| # | Method | Path | Function | Frontend caller |
|---|---|---|---|---|
| 1 | POST | `/api/coupons` | `create_coupon` | `CouponsPage.jsx` — create modal |
| 2 | GET | `/api/coupons` (+`?active_only=true`) | `list_coupons` | `CouponsPage.jsx` — list view |
| 3 | GET | `/api/coupons/{id}` | `get_coupon` | `CouponsPage.jsx` — detail |
| 4 | PUT | `/api/coupons/{id}` | `update_coupon` | `CouponsPage.jsx` — edit |
| 5 | DELETE | `/api/coupons/{id}` | `delete_coupon` | `CouponsPage.jsx` — delete |
| 6 | POST | `/api/coupons/{id}/toggle` | `toggle_coupon` | `CouponsPage.jsx` — active toggle |
| 7 | POST | `/api/coupons/validate` (query params, admin JWT) | `validate_coupon` | Internal admin test |
| 8 | POST | `/api/coupons/apply` (query params, admin JWT) | `apply_coupon` | Internal admin manual-apply |
| 9 | GET | `/api/coupons/{id}/usage` | `get_coupon_usage` | `CouponsPage.jsx` — usage report |

QA smoke matrix added to harness (QA-26a..QA-26i):

| Case | Method | Asserts |
|---|---|---|
| QA-26a | POST `/coupons` | 200, returns full Coupon model incl. new optional fields (`title`, `coupon_type`, `stackable_with_loyalty`) with defaults |
| QA-26b | GET `/coupons` | 200, includes created coupon |
| QA-26c | GET `/coupons/{id}` | 200, exact match |
| QA-26d | PUT `/coupons/{id}` | 200, update visible on subsequent GET |
| QA-26e | POST `/coupons/{id}/toggle` | 200, `is_active` flips |
| QA-26f | POST `/coupons/validate` (admin JWT, query-param) | 200, legacy shape preserved |
| QA-26g | POST `/coupons/apply` (admin JWT) | 200, legacy shape preserved, writes to `coupon_usage` with legacy fields |
| QA-26h | GET `/coupons/{id}/usage` | 200, returns usage list (incl. new realtime rows seamlessly) |
| QA-26i | DELETE `/coupons/{id}` | 200, coupon and its `coupon_usage` rows removed |

## A.7 Analytics double-count guard QA

Risk identified in plan §16: realtime `coupon_usage` writes via `/pos/coupons/apply` legacy or `/pos/orders` final-commit may overlap with `coupon_transactions` rows if a future migration ever back-fills both. Confirmed in code grep: today only `migration.py:480` writes to `coupon_transactions`; all realtime paths write only to `coupon_usage`. Guard QA cases:

| Case | Scenario | Expected |
|---|---|---|
| QA-24 | Insert 1 fresh `coupon_usage` row via `/pos/orders` final-commit | `get_coupon_stats`: `coupons_used += 1`, `discount_availed += coupon_discount` |
| QA-25 | Insert 1 synthetic `coupon_transactions` row (simulate migration) | `get_coupon_stats`: `coupons_used += 1`, `discount_availed += discount_amount` — counted independently |
| QA-29 (**NEW**) | Insert both a `coupon_usage` row AND a `coupon_transactions` row for the SAME `pos_order_id` | `coupons_used` increments by **2** today (acknowledged limitation; documented). A `dedup_key` field (`pos_order_id`) is planned for V2 if owner wants strict de-duplication — out of V1 scope. |
| QA-30 (**NEW**) | Realtime path writes only to `coupon_usage` (assert `coupon_transactions` count unchanged after `/pos/orders` call) | Realtime never writes `coupon_transactions`; migration is the sole writer |
| QA-31 (**NEW**) | Migration path writes only to `coupon_transactions` (assert `coupon_usage` count unchanged after a simulated migration insert) | Migration never writes `coupon_usage` |

> QA-29 documents a known shape: same `pos_order_id` legitimately cannot appear in both collections in production because migration only back-fills historical orders (pre-CRM-realtime cutoff). QA-29 just *encodes* that invariant — if it ever fires in real data, that is a bug in migration code, not in coupon code.

**QA total revised: 32 cases (was 28).**

---

## A.8 Status flip on implementation start

When implementation begins:
- `CR_001_INDEX.md` row: `cr001c_coupon_v1_implementation_in_progress`
- On QA pass: `cr001c_coupon_v1_implementation_qa_passed_in_preview`

