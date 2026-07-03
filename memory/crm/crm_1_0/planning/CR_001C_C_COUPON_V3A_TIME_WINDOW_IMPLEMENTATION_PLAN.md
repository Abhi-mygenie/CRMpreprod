# CR-001C-C — Coupon V3-A Time-Window / Happy-Hour Implementation Plan

**Module:** CR-001C-C (Coupon) — V3-A first complex offers phase
**Date:** 2026-02
**Status:** `cr001c_coupon_v3a_time_window_implementation_plan_ready_for_owner_approval`
**Author:** CRM Team
**Prerequisites (frozen):**
- V1 → `cr001c_coupon_v1_implementation_qa_passed_in_preview` (45/45)
- V2 → `cr001c_coupon_v2_item_category_implementation_qa_passed_in_preview` (45/45)
- V3 planning → `cr001c_coupon_v3a_time_window_plan_ready_for_implementation_approval` (Addendum C frozen)

**Source-of-truth for scope:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3_COMPLEX_OFFERS_PLANNING.md` → §C.1 V3-A scope freeze + §C.3 cross-phase invariants.

> **PLANNING DOCUMENT ONLY.** No code changes, no DB changes, no env changes, no migrations, no deployment. Wallet, Loyalty, `/app/memory/final/` are not touched. Implementation starts only after owner approves this plan.

---

## 1. Executive Summary

V3-A adds **time-window / happy-hour eligibility** as a generic cross-cutting rule on top of every existing coupon type (V1 order-scope, V2 item/category-scope). It does **not** introduce any new offer-type computation path — the existing V1/V2 compute path is preserved verbatim. V3-A only adds a **pre-check**: if the cart is submitted outside the configured `valid_days` / `start_time`–`end_time` window in the resolved restaurant timezone, the coupon is rejected with `OUTSIDE_TIME_WINDOW`.

### What V3-A delivers
1. New optional fields on `coupons`: `valid_days[]`, `start_time`, `end_time`, `timezone` + `offer_type` (default `"simple"`).
2. Server-clock evaluation of the window (POS-supplied `order_time` is informational only).
3. `OUTSIDE_TIME_WINDOW` error code at `/validate` and (non-blocking) at `/api/pos/orders`.
4. `time_window_status` block on validate / orders responses (only when window configured).
5. `time_window` block per coupon on `/available` (coupons outside window still returned with `within_window_now=false` + `next_window_start`).
6. `coupon_usage` row gains optional `offer_type` + `time_window_status` snapshot.
7. Analytics gain additive `breakdown_by_offer_type` + V3-A-specific `time_window_usage` block.
8. New QA harness `qa_cr001c_c_coupon_v3_a_time_window.py` — **~25 assertions**.
9. V1 (45) + V2 (45) regression remains green. Combined baseline post-V3-A: **~115 assertions**.

### Design principle
Time-window is **orthogonal to offer_type and discount_scope**. A V1 ORDER_PERCENTAGE becomes a happy-hour coupon by adding `valid_days` + `start_time` + `end_time`. A V2 ITEM_PERCENTAGE becomes a happy-hour beverages discount the same way. No coupon-type duplication; no engine fork.

### Scope discipline
V3-A v1 ships **time-window only**. `offer_type ∈ {"bogo","bxg","nth_item","free_item","combo"}` is **NOT** implemented in V3-A. The `offer_type` field is introduced (default `"simple"`) so V3-B onwards has the discriminator already in place — but V3-A v1 only writes / reads `"simple"`.

---

## 2. Inputs Reviewed

| Source | Purpose |
|---|---|
| `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3_COMPLEX_OFFERS_PLANNING.md` (incl. Addendum C) | Scope freeze §C.1, cross-phase invariants §C.3, timezone fallback §C.1.5, V3-A POS contract delta §C.1.6 |
| `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V1_IMPLEMENTATION_PLAN.md` (+Addendum A) | V1 validation pipeline, error envelope, idempotency, variance tolerance |
| `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V2_ITEM_CATEGORY_PLANNING.md` (+Addendum B) | V2 cart-aware validate contract, non-blocking final-order behavior |
| `/app/memory/crm/crm_1_0/implementation/CR_001C_C_COUPON_V2_ITEM_CATEGORY_IMPLEMENTATION_REPORT.md` | V2 service surface — entry points to extend |
| `backend/core/coupon.py` (read-only) | `validate_coupon_for_customer`, `list_available_coupons`, `record_coupon_usage_for_order`, `_resolve_validity_window` |
| `backend/models/schemas.py` (read-only) | `Coupon`, `CouponCreate`, `CouponUpdate`, `CouponUsage`, `POSCouponValidateRequest` |
| `backend/routers/pos.py` (read-only) | `pos_validate_coupon`, `pos_available_coupons`, `pos_order_webhook` |
| `backend/services/analytics_service.py` (read-only) | `get_coupon_stats` |
| `backend/routers/coupons.py` (read-only) | Confirmed admin CRUD remains untouched |
| Python `zoneinfo` (stdlib, Python 3.9+) | Timezone implementation library (no new dep) |

---

## 3. V3-A Data Model (frozen schema delta)

All additions are **optional, backward-compatible, no migration**. V1/V2 rows naturally have these fields absent → resolves to "no window" → identical V1/V2 behavior.

### 3.1 `coupons` collection — new optional fields

| Field | Type | Default | Constraints | Notes |
|---|---|---|---|---|
| `offer_type` | str | `"simple"` | `"simple"` only used in V3-A v1 | Discriminator for future V3-B+. V3-A v1 writes/reads `"simple"` only. |
| `valid_days` | List[int] \| None | `None` | Each int in `[0..6]` (Mon=0 … Sun=6). Empty list `[]` is treated as `None`. | `None` = window applies all days. |
| `start_time` | str \| None | `None` | `"HH:MM"` 24h regex `^([01]\d\|2[0-3]):[0-5]\d$`. | If only one of `start_time`/`end_time` is set, both are ignored (window incomplete → treated as no daily window — explicit log warning). |
| `end_time` | str \| None | `None` | Same regex. | If `end_time <= start_time` → overnight wrap (see §6). |
| `timezone` | str \| None | `None` | IANA tz string validated via `zoneinfo.ZoneInfo(name)` at admin CRUD time. | Resolution chain in §5. |

### 3.2 `coupon_usage` collection — new optional fields

| Field | Type | Default | Notes |
|---|---|---|---|
| `offer_type` | str \| None | `None` | Denormalized at usage time. V3-A always writes `"simple"`. V1/V2 legacy rows lack this field → analytics buckets them under `unknown`. |
| `time_window_status` | dict \| None | `None` | Snapshot at usage time: `{within_window: bool, server_time_used: ISO_with_tz, tz: str, tz_fallback: str \| None}`. Present only when the coupon had a window configured. |

### 3.3 No new indexes
- Existing `(user_id, order_id)` unique partial index continues to provide V3-A idempotency.
- Analytics queries can use the existing `(user_id, created_at)` index for `breakdown_by_offer_type`; future hot-path optimization (`(user_id, offer_type, created_at)`) deferred until V3-B+ telemetry justifies it.

### 3.4 Backward-compatibility guarantees
- V1/V2 coupons without window fields → existing behavior, no `time_window_status` block in response.
- V1/V2 `coupon_usage` rows without `offer_type` → analytics treats as `unknown` bucket.
- Admin CRUD (`routers/coupons.py`) Pydantic model picks up the new optional fields automatically. Existing payloads from `CouponsPage.jsx` (which doesn't set them) continue to work.

---

## 4. `valid_days` Semantics (frozen)

### 4.1 Encoding
- Integer list, ISO weekday convention: **Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6**.
- This matches Python `datetime.weekday()`.
- Admin CRUD validates each int is in `[0..6]` and the list is deduped + sorted before persistence.

### 4.2 Semantics
- `valid_days=None` → window evaluated on **every day** (only `start_time` / `end_time` gates it).
- `valid_days=[]` → treated same as `None` (empty list is meaningless). Admin CRUD logs an info-level warning.
- `valid_days=[0,1,2,3,4]` → Mon–Fri only.
- `valid_days=[5,6]` → Weekends only.

### 4.3 Day evaluation
- "Today" is computed in the resolved restaurant timezone (§5), not UTC.
- Crossing midnight in restaurant tz can put us on a different weekday than UTC. Example: 23:30 UTC Friday in `Asia/Kolkata` is already Saturday 05:00 — the window check uses **Saturday** as `valid_days` filter, not Friday.

### 4.4 Overnight interaction with `valid_days`
When `end_time < start_time` (overnight wrap), the **"day"** of the window is the day the window **starts**, not the day it crosses into. Example: `valid_days=[4]` (Friday only), `start_time="22:00"`, `end_time="02:00"`. A cart submitted Saturday 01:30 in restaurant tz is **still within** the Friday window (carry-over). A cart submitted Saturday 22:00 is **outside** (Saturday isn't in `valid_days`, and Saturday's window hasn't started yet). See §6 for the algorithm.

---

## 5. `timezone` Resolution Chain (frozen per OQ-V3-5)

### 5.1 Resolution order (every validate / available / orders call)

```
effective_tz, fallback_marker =
    1. coupon.timezone               → if set AND zoneinfo.ZoneInfo(name) loads
    2. users.settings.timezone        → if set on the restaurant doc AND loads
    3. "Asia/Kolkata"                  → product default (current), no fallback marker
    4. "UTC"                            → last resort, set tz_fallback="utc"
```

`fallback_marker` semantics:
- Steps 1, 2, 3 → `tz_fallback=None`.
- Step 4 → `tz_fallback="utc"` recorded in `time_window_status` and a `coupon_timezone_fallback_to_utc` warning logged once per request.

### 5.2 `users.settings.timezone` lookup
- Read from the same `users` collection that already backs restaurant auth.
- Pydantic model side: no schema change to `users`. Read raw doc via `db.users.find_one({"id": user_id}, {"settings.timezone": 1})`.
- If the `settings` sub-doc doesn't exist OR the field is null/empty → fall through to step 3.
- Recommendation (non-blocking): a follow-up CR could expose this field in the Settings admin UI. Out of V3-A scope.

### 5.3 IANA validation
- At **admin coupon CRUD** time (POST/PUT `/api/coupons`), the Pydantic validator on `Coupon.timezone` calls `ZoneInfo(value)` and rejects invalid names with a 422 — same error envelope as other Pydantic field errors. This prevents bad data from ever entering the DB.
- At **read/validate** time, defensive `try/except ZoneInfoNotFoundError` falls through the chain (Steps 2 → 3 → 4). Logs `coupon_timezone_unresolvable` warning when this happens (should never happen if Step 1 was validated at write time, but covers any imported legacy data).

### 5.4 No new dependency
- Python 3.9+ stdlib `zoneinfo` is used. No `pytz` install. The pod's Python is 3.11+ (verified via existing `loyalty_jobs.py` use of `zoneinfo` patterns).

---

## 6. Server-Clock Validation + Overnight Window Algorithm (frozen)

### 6.1 Server-clock policy (frozen)
- The within-window decision uses `datetime.now(timezone.utc)` converted to `effective_tz`.
- POS-supplied `order_time` (optional in `POSCouponValidateRequest`) is **ignored for the decision**. It is echoed back in `time_window_status.pos_supplied_order_time` for transparency.
- Rationale (anti-abuse): cashier device clock drift / deliberate clock skew cannot grant out-of-window discounts.

### 6.2 Algorithm

```python
def is_within_time_window(coupon, now_utc) -> tuple[bool, dict]:
    """
    Returns:
      (within_window, status_dict)
    where status_dict = {
        "within_window": bool,
        "server_time_used": ISO_with_tz_offset,
        "tz": "Asia/Kolkata",
        "tz_fallback": None | "utc",
        "valid_days": [...] | None,
        "start_time": "HH:MM" | None,
        "end_time": "HH:MM" | None,
        "next_window_start": ISO_with_tz_offset | None,
        "pos_supplied_order_time": str | None,   # echo from request when present
    }
    If the coupon has no window configured (no valid_days, no start/end),
    returns (True, status_dict_with_no_window=True). The status block is still
    emitted with within_window=True so callers can uniformly read it.
    """
    has_days = bool(coupon.get("valid_days"))
    s = coupon.get("start_time")
    e = coupon.get("end_time")
    has_time = bool(s) and bool(e)   # both required; one alone is ignored

    if not has_days and not has_time:
        # No window → always within. Status block returned but minimal.
        return True, _build_status_no_window(coupon, now_utc)

    effective_tz, tz_fallback = _resolve_tz(coupon, restaurant_user_doc)
    now_local = now_utc.astimezone(effective_tz)
    weekday = now_local.weekday()    # 0=Mon … 6=Sun
    now_time = now_local.time()      # HH:MM:SS

    # Step 1: valid_days check (uses the day the window STARTS, see §4.4)
    if has_days and has_time and e <= s:
        # Overnight wrap. The "window day" is the day the window starts.
        # If now_local is in the early-morning carry-over zone (now_time < end),
        # then the window started yesterday — we must check valid_days for
        # (weekday - 1) % 7 instead of `weekday`.
        if now_time < _parse_time(e):
            window_owning_day = (weekday - 1) % 7
        else:
            window_owning_day = weekday
        if window_owning_day not in coupon["valid_days"]:
            return False, _status_outside(...)
    elif has_days:
        if weekday not in coupon["valid_days"]:
            return False, _status_outside(...)

    # Step 2: daily time check
    if has_time:
        ts = _parse_time(s)   # datetime.time
        te = _parse_time(e)
        if ts <= te:
            within_today = ts <= now_time < te
        else:
            # Overnight wrap: within if now >= start OR now < end
            within_today = now_time >= ts or now_time < te
        if not within_today:
            return False, _status_outside(...)

    return True, _status_within(...)
```

### 6.3 `next_window_start` computation
- Returned in **all** outside-window responses so POS UI can show a countdown.
- Algorithm: walk forward day-by-day (max 7 days) in `effective_tz`, find the next day that is in `valid_days` (or all days if `valid_days` is None), combine with `start_time`. Convert back to ISO UTC for transport.
- If `valid_days` set but cart submitted on a non-valid-day, `next_window_start` jumps to the next valid weekday's `start_time`.
- If the coupon's `end_date` (V1 expiry) is sooner than the computed next-window-start → return `null` and log `coupon_window_after_expiry`.

### 6.4 Boundary semantics
- `start_time <= now_time < end_time` (start inclusive, end exclusive). At exactly `end_time`, the coupon is **outside** (industry-standard "happy hour ends at 18:00 means last order at 17:59:59").
- For overnight wrap (`end_time < start_time`): `now_time >= start_time OR now_time < end_time` (same exclusive-end semantics).

### 6.5 DST handling
- Asia/Kolkata has no DST → no special handling.
- For DST timezones (e.g. America/New_York): `zoneinfo` handles ambiguous/missing local times correctly via `fold=0` default. Edge case: a `start_time="02:30"` on a "spring forward" day in America/New_York where 02:30 doesn't exist. Decision: **accept zoneinfo's default behavior (rolls forward to 03:30 logical time)** — restaurant operators in DST timezones should configure windows that avoid 02:00–03:00 ambiguity, or accept the off-by-one-hour for two days per year. Document in §10 risks.

---

## 7. `available` / `validate` / Final-Order Behavior (frozen)

### 7.1 `GET /api/pos/coupons/available`
- Query-only (matches V2 OQ-1). No cart body.
- **Coupons outside their window are STILL returned** so POS UI can render them greyed-out with a countdown.
- Per-coupon response delta:
  ```json
  {
    "id": "cpn_xyz",
    "code": "HAPPY20",
    "discount_scope": "order",
    "offer_type": "simple",
    "time_window": {
      "configured": true,
      "within_window_now": false,
      "valid_days": [0,1,2,3,4],
      "start_time": "15:00",
      "end_time": "18:00",
      "tz": "Asia/Kolkata",
      "tz_fallback": null,
      "next_window_start": "2026-02-12T09:30:00+00:00"
    },
    "requires_cart_validation": false,
    "expected_discount": 50.0,                  // computed normally when within window
    "final_amount_preview": 450.0
  }
  ```
- When the coupon has **no window** (`valid_days`, `start_time`, `end_time` all absent), the `time_window` block is `{"configured": false}` — POS UI hides the window UI entirely.
- Note on `expected_discount`: when the coupon has a window but is currently outside it, `expected_discount` is computed **as if the window weren't there** (so POS can show "you'd save ₹50 from 3 PM"). The `within_window_now=false` flag is the authoritative gate. Only the actual `/validate` call returns `OUTSIDE_TIME_WINDOW`.

### 7.2 `POST /api/pos/coupons/validate`
- Request gains optional `order_time` (ISO 8601). Informational only.
- Window check runs **early** in `validate_coupon_for_customer` — before V1 pre-checks like `min_order_value`. Rationale: window is the most "cheap" check and the most likely failure for a happy-hour coupon; failing fast is friendly.
- Order of checks in `validate_coupon_for_customer` (post-V3-A):
  1. Code resolves to a coupon doc → `INVALID_CODE`
  2. `is_active=true` → `INACTIVE`
  3. `start_date <= now <= end_date` (V1 ISO date range) → `INACTIVE` / `EXPIRED`
  4. **NEW: `is_within_time_window` check** → `OUTSIDE_TIME_WINDOW`
  5. `usage_limit` → `USAGE_LIMIT_REACHED`
  6. `per_user_limit` → `CUSTOMER_USAGE_LIMIT_REACHED`
  7. `min_order_value` → `MIN_ORDER_NOT_MET`
  8. `applicable_channels` → `CHANNEL_NOT_VALID`
  9. `specific_users` → `CUSTOMER_NOT_ELIGIBLE`
  10. `stackable_with_loyalty` vs `loyalty_points_used` → `STACKING_NOT_ALLOWED`
  11. `discount_type` normalization → `INACTIVE`
  12. Scope-aware compute dispatch (V1 order / V2 item / V2 category)
- Outside-window response shape (frozen):
  ```json
  {
    "success": false,
    "data": {
      "error": {
        "code": "OUTSIDE_TIME_WINDOW",
        "field": "time_window",
        "detail": "Coupon valid Mon-Fri 15:00-18:00 Asia/Kolkata; current local time is Wednesday 12:34"
      },
      "time_window_status": { /* full status block, see §6.2 */ }
    }
  }
  ```
- Within-window success response gains `time_window_status` block alongside existing V1/V2 success fields. When the coupon has no window, `time_window_status.configured=false` is emitted (or owner may prefer to omit the block entirely — see §11 OQ-V3A-1).

### 7.3 `POST /api/pos/orders` (final commit)
- No new top-level fields required from POS.
- `record_coupon_usage_for_order` already re-invokes `validate_coupon_for_customer`. Window check runs automatically via Step 4 above.
- **Non-blocking failure (frozen per OQ-V3-8):** if outside window at final-commit time (e.g. cashier rang the bill 5 minutes past 18:00):
  1. Order **persists normally**.
  2. `coupon_usage` is **NOT** recorded.
  3. `coupons.total_used` is **NOT** incremented.
  4. Structured warning `coupon_validation_failed_at_final_order` logged with `error_code=OUTSIDE_TIME_WINDOW`.
  5. Response `data.coupon_usage` carries:
     ```json
     {
       "recorded": false,
       "coupon_code": "HAPPY20",
       "error": {
         "code": "OUTSIDE_TIME_WINDOW",
         "field": "time_window",
         "detail": "..."
       },
       "time_window_status": { /* snapshot at commit time */ }
     }
     ```
  6. HTTP status remains 200 (envelope `success=true`).
- **Recording side:** when the window check passes, `coupon_usage.offer_type="simple"` and `coupon_usage.time_window_status` snapshot are written alongside existing V1/V2 fields.

### 7.4 `coupon_usage` row shape (frozen, V3-A additive)
```
{
  ... all V1/V2 fields preserved ...
  "offer_type": "simple",                           # always "simple" in V3-A v1
  "time_window_status": {                            # optional; only if coupon has a window
    "within_window": true,
    "server_time_used": "2026-02-11T15:42:13+05:30",
    "tz": "Asia/Kolkata",
    "tz_fallback": null,
    "valid_days": [0,1,2,3,4],
    "start_time": "15:00",
    "end_time": "18:00"
  }
}
```

### 7.5 Analytics
- `get_coupon_stats` adds `breakdown_by_offer_type`:
  ```json
  "breakdown_by_offer_type": {
    "simple":    { "used": 100, "discount": 12000.0 },
    "bogo":      { "used":   0, "discount":     0.0 },   // future
    "bxg":       { "used":   0, "discount":     0.0 },
    "nth_item":  { "used":   0, "discount":     0.0 },
    "free_item": { "used":   0, "discount":     0.0 },
    "combo":     { "used":   0, "discount":     0.0 },
    "unknown":   { "used":  42, "discount":  5200.0 }    // legacy rows without offer_type
  }
  ```
- `get_coupon_stats` adds V3-A-specific `time_window_usage`:
  ```json
  "time_window_usage": {
    "coupons_with_window": 3,
    "used_within_window": 18,
    "used_outside_window_attempts": 2     // counted from non-blocking warnings (read from a future
                                          //   warning-counter; v1 may set this to 0 and stash to v2)
  }
  ```
  > **Implementation note:** `used_outside_window_attempts` requires either (a) a new `coupon_validation_failures` collection or (b) parsing log lines. v1 will ship with this field returning `0` and a TODO marker — the rich attempt counter is a V3-A2 nice-to-have, not blocking. Owner approved §C.1.1 already (see OQ-V3A-2 below).

### 7.6 Admin CRUD (`routers/coupons.py`)
- **UNTOUCHED.** The `Coupon` / `CouponCreate` / `CouponUpdate` Pydantic models gain the new optional fields, so existing POST/PUT/DELETE endpoints automatically accept and return them. `CouponsPage.jsx` continues to work without sending the new fields.
- One small Pydantic validator added to `CouponCreate` / `CouponUpdate`:
  - `valid_days`: each int in `[0..6]`; dedupe; sort
  - `start_time` / `end_time`: regex `^([01]\d|2[0-3]):[0-5]\d$`
  - `timezone`: `ZoneInfo(value)` must load
  - Pair rule: if exactly one of `start_time`/`end_time` is set, raise 422 (`time_window_incomplete`)

---

## 8. File-by-File Implementation Plan

| File | Type of change | Approx LOC delta | Risk |
|---|---|---|---|
| `backend/core/coupon.py` | EXTEND — add `_resolve_effective_tz`, `_parse_hhmm`, `_is_within_time_window`, `_build_time_window_status`, `_compute_next_window_start`. Insert window check as Step 4 in `validate_coupon_for_customer` before usage/min_order/channel checks. Update `list_available_coupons` to attach `time_window` block per coupon (including outside-window coupons). Update `record_coupon_usage_for_order` to snapshot `time_window_status` and `offer_type` into the usage doc. | ~200 LOC | LOW — window check returns (True, status) when no window configured → V1/V2 fast path unchanged. |
| `backend/models/schemas.py` | EXTEND — `Coupon` / `CouponCreate` / `CouponUpdate` gain `offer_type`, `valid_days`, `start_time`, `end_time`, `timezone`. `CouponUsage` gains optional `offer_type`, `time_window_status`. `POSCouponValidateRequest` gains optional `order_time: str | None`. Add Pydantic validators per §7.6. | ~80 LOC | LOW — all additions optional; admin payloads unchanged. |
| `backend/routers/pos.py` | EXTEND — `pos_validate_coupon` passes `request.order_time` through (informational echo), surfaces `time_window_status` in success/failure response. `pos_available_coupons` exposes `time_window` block per coupon. `pos_order_webhook` already re-invokes `validate_coupon_for_customer` via `record_coupon_usage_for_order`; just surface `time_window_status` in `data.coupon_usage` response. | ~50 LOC | LOW |
| `backend/services/analytics_service.py` | EXTEND — `get_coupon_stats` adds `breakdown_by_offer_type` (Mongo `$group` on `offer_type` with `$ifNull` → `unknown`) and `time_window_usage` (count coupons where `valid_days` or `start_time` set; count `coupon_usage` rows with `time_window_status.within_window=true`). | ~40 LOC | LOW — additive |
| `backend/routers/coupons.py` | **NO CHANGE.** Model gains pick up new fields automatically. | 0 | NONE |
| `backend/server.py` | NO CHANGE — `ensure_coupon_indexes` already covers V3-A query patterns. | 0 | NONE |
| `backend/tests/seed_coupon_v1_fixtures.py` | EXTEND — add 4 V3-A fixtures (`QA_C3A_HAPPYHOUR_V1` order-percentage with window, `QA_C3A_HAPPYHOUR_V2_ITEM` item-percentage with window, `QA_C3A_OVERNIGHT` overnight wrap, `QA_C3A_NOWINDOW` control). Cleanup regex extends to `QA_C3A_*`. | ~80 LOC | LOW |
| `backend/tests/qa_cr001c_c_coupon_v3_a_time_window.py` | **NEW** — ~25-assertion harness. ~500 LOC. | +500 | LOW |
| `backend/tests/qa_cr001c_c_coupon_v1.py` | **NO CHANGE** — must rerun green as regression (45/45). | 0 | NONE |
| `backend/tests/qa_cr001c_c_coupon_v2_item_category.py` | **NO CHANGE** — must rerun green as regression (45/45). | 0 | NONE |
| `backend/core/loyalty.py`, wallet code, migration code, `routers/coupons.py`, `coupon_transactions` collection, `/app/memory/final/` | **UNTOUCHED.** | 0 | NONE |

**Total delta:** ~450 LOC (excluding new test harness) + ~500 LOC new test file. No DB migration, no env change, no new index, no new dependency (Python stdlib `zoneinfo`).

---

## 9. QA Plan — ~25 V3-A Assertions

Same `QA_C3A_USER_<run-id>` scoping pattern as V1/V2. The V1 (45) + V2 (45) harnesses are rerun first as regression and **must remain at 45/45 each**.

### 9.1 Regression (must remain green)
- **R1**: V1 harness — 45/45 PASS
- **R2**: V2 harness — 45/45 PASS

### 9.2 V3-A core window evaluation (~6 cases)
| # | Case | Expected |
|---|---|---|
| V3A-01 | Coupon with `valid_days=[0,1,2,3,4]`, `start=15:00`, `end=18:00`, tz=Asia/Kolkata. Submit at 16:00 IST on a Wednesday. | `within_window=true`, V1 discount computed normally. |
| V3A-02 | Same coupon, submit at 12:00 IST Wednesday. | `OUTSIDE_TIME_WINDOW`, `error.detail` mentions current local time + window. |
| V3A-03 | Same coupon, submit at 19:00 IST Wednesday. | `OUTSIDE_TIME_WINDOW`. Boundary check: exactly `18:00:00` is also outside (exclusive end). |
| V3A-04 | Same coupon, submit on a Saturday at 16:00 IST. | `OUTSIDE_TIME_WINDOW`, `error.detail` mentions `valid_days`. |
| V3A-05 | Coupon with `start=09:00`, `end=09:00` (zero-width window). | Defensive: admin CRUD validator rejects with 422; if seeded directly, runtime treats as "always outside" → `OUTSIDE_TIME_WINDOW`. |
| V3A-06 | Coupon with no window fields. | `within_window=true`, `time_window_status.configured=false`, V1/V2 behavior unchanged. |

### 9.3 Overnight wrap (~2 cases)
| # | Case | Expected |
|---|---|---|
| V3A-07 | Coupon `start=22:00`, `end=02:00`, `valid_days=[4]` (Fri only). Submit Saturday at 01:00 IST. | `within_window=true` — window started Friday 22:00 IST, still active. Window-owning-day correctly = Friday. |
| V3A-08 | Same coupon, submit Saturday at 23:00 IST. | `OUTSIDE_TIME_WINDOW` — Saturday not in `valid_days`, and Saturday's window hasn't started. |

### 9.4 Timezone resolution (~3 cases)
| # | Case | Expected |
|---|---|---|
| V3A-09 | Coupon has `timezone="America/New_York"`. Restaurant `users.settings.timezone="Asia/Kolkata"`. Window 15:00–18:00. Submit at 16:00 IST (= ~05:30 NY). | `OUTSIDE_TIME_WINDOW`; coupon.timezone wins; `time_window_status.tz="America/New_York"`. |
| V3A-10 | Coupon has no `timezone`. Restaurant `users.settings.timezone="Asia/Kolkata"`. Submit at 16:00 IST within window. | `within_window=true`; `time_window_status.tz="Asia/Kolkata"`, `tz_fallback=null`. |
| V3A-11 | Coupon has no `timezone`. Restaurant has no `settings.timezone` (or `users` doc missing the field). | Falls to product default `Asia/Kolkata`; `tz_fallback=null`. (If both default-product-tz and restaurant tz are unset/invalid in some future deployment, the UTC fallback path is exercised — covered by mocked unit test.) |

### 9.5 Server-clock vs POS-supplied `order_time` (~2 cases)
| # | Case | Expected |
|---|---|---|
| V3A-12 | Within-window in server clock; POS sends `order_time` outside the window. | `within_window=true` (POS time ignored); response echoes POS-supplied time in `time_window_status.pos_supplied_order_time`. |
| V3A-13 | Outside-window in server clock; POS sends `order_time` inside the window. | `OUTSIDE_TIME_WINDOW` (POS time ignored). |

### 9.6 `/available` response shape (~3 cases)
| # | Case | Expected |
|---|---|---|
| V3A-14 | `GET /available` when at least one coupon has a window and is currently within. | Returned with `time_window.within_window_now=true`, `next_window_start=null`, `expected_discount` populated. |
| V3A-15 | `GET /available` when same coupon is outside its window. | Returned with `time_window.within_window_now=false`, `next_window_start` set, `expected_discount` still populated (informational "you'd save"). |
| V3A-16 | `GET /available` returns mix of windowed + non-windowed coupons. | Non-windowed coupons emit `time_window.configured=false`. |

### 9.7 V1 + V2 happy-hour cross-cutting (~2 cases)
| # | Case | Expected |
|---|---|---|
| V3A-17 | V1 ORDER_PERCENTAGE coupon with `start=15:00`, `end=18:00`. Validate within window. | V1 percentage computed normally; `time_window_status` present in response. |
| V3A-18 | V2 ITEM_PERCENTAGE coupon with same window + cart `items[]`. Validate within window. | V2 item-scope discount computed normally; `time_window_status` present. |

### 9.8 Final-order non-blocking (~3 cases)
| # | Case | Expected |
|---|---|---|
| V3A-19 | Final `/api/pos/orders` arrives within window. | Order persists; `coupon_usage.recorded=true`, `coupon_usage.offer_type="simple"`, `coupon_usage.time_window_status` snapshot present. |
| V3A-20 | Final `/api/pos/orders` arrives outside window. | Order persists (HTTP 200); `coupon_usage.recorded=false`, `error.code="OUTSIDE_TIME_WINDOW"`, structured warning logged. `coupons.total_used` NOT incremented. |
| V3A-21 | Idempotent replay of V3A-19 with same `(user_id, order_id)`. | Replay path; `recorded=false`, `idempotent_replay=true`; existing `coupon_usage` row returned unchanged. |

### 9.9 Analytics (~2 cases)
| # | Case | Expected |
|---|---|---|
| V3A-22 | After mixed V1+V2+V3-A usage, call `get_coupon_stats`. | Top-level keys preserved; `breakdown_by_offer_type.simple` increments; `unknown` bucket holds legacy rows. |
| V3A-23 | Call `get_coupon_stats` after V3-A usage. | `time_window_usage.coupons_with_window`, `used_within_window` populated correctly; `used_outside_window_attempts` returns `0` (V3-A v1 placeholder). |

### 9.10 Admin CRUD round-trip (~1 case)
| # | Case | Expected |
|---|---|---|
| V3A-24 | POST `/api/coupons` with V3-A fields → GET → PUT (update `start_time`) → GET → DELETE. | All operations 200 OK; fields round-trip; invalid `timezone="Invalid/Zone"` → 422; mismatched `start_time` only (no `end_time`) → 422. |

### 9.11 Loyalty + Wallet regression (~1 case)
| # | Case | Expected |
|---|---|---|
| V3A-25 | Run Loyalty LR + L4 + LX-A regression harness alongside V3-A harness. | All Loyalty assertions PASS unchanged. Wallet collections unchanged. `/app/memory/final/` unchanged. |

**Total: 25 V3-A assertions + 90 regression = 115 expected on V3-A QA pass.**

---

## 10. Risk Register (V3-A-specific)

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| RV3A-1 | DST ambiguous local times (spring-forward gap) | Low (no DST in India) | Off-by-one-hour for 2 days/year in DST tz restaurants | Accept `zoneinfo` default; document for operators. |
| RV3A-2 | Restaurant's `users.settings.timezone` field missing entirely → silent UTC fallback | Low | Wrong window evaluation | Default to `"Asia/Kolkata"` before UTC; `tz_fallback="utc"` flag in status block; warning log line. |
| RV3A-3 | Cashier device clock skew sending POS `order_time` very far from server time | Medium | None to discount (server clock wins) | Decision frozen per OQ-V3-5; echo for audit, never decide. |
| RV3A-4 | Overnight window + `valid_days` interaction misread by admin | Medium | Coupon fires on wrong day | Window-owning-day algorithm documented + QA V3A-07/08 cover. |
| RV3A-5 | `expected_discount` shown in `/available` outside-window suggests discount available now | Low | UX confusion | `within_window_now=false` is the authoritative flag; POS UI greys discount text. |
| RV3A-6 | `next_window_start` past the coupon's `end_date` | Low | UI countdown to a window that never fires | Return `null` and log `coupon_window_after_expiry`. |
| RV3A-7 | Non-blocking final-order failure could let bill-time clock-drift bypass window | Medium | Money loss if cashier deliberately runs late | Final-order check runs server-side; warning logged; analytics counter (V3-A2) will surface patterns. |
| RV3A-8 | Admin sets `start_time` without `end_time` (or vice versa) | High (admin UI free-form) | Coupon never matches window | Pydantic validator rejects; admin CRUD returns 422. |
| RV3A-9 | Invalid IANA tz string seeded directly into DB | Low (admin CRUD rejects new ones) | Runtime fallback to default | Defensive `try/except ZoneInfoNotFoundError` at read time; warning log. |
| RV3A-10 | `valid_days` typed as int but persisted as string by some legacy admin | Low | Window check skips day | Pydantic coerces; admin CRUD validator strict. Existing rows have no `valid_days` so risk is zero on legacy data. |

---

## 11. Owner Questions (V3-A-specific, mostly non-blocking)

All V3 OQs are already frozen in Addendum C. The V3-A implementation surfaces two micro-questions:

### OQ-V3A-1 — When a coupon has no window, should the response still emit `time_window_status` block?
- a. **Yes, emit `{"configured": false}` for uniformity** ← recommended
- b. Omit the block entirely when no window is configured (saves ~30 bytes per response)

### OQ-V3A-2 — Should V3-A v1 ship the `used_outside_window_attempts` analytics counter, or defer to V3-A2?
- a. **Defer to V3-A2 — return `0` with TODO marker** ← recommended (avoids new collection / log-parser plumbing in v1)
- b. Ship in v1 — requires a new `coupon_validation_failures` collection write on every non-blocking failure

Both have safe recommended defaults — non-blocking for implementation kickoff.

---

## 12. Implementation Effort Estimate

| Surface | Estimate |
|---|---|
| Schema additions (Pydantic + validators) | ~80 LOC |
| Core service (`_resolve_effective_tz`, `_is_within_time_window`, status builders, next-window calc, recording updates) | ~200 LOC |
| Router plumbing (validate + available + orders response shapes) | ~50 LOC |
| Analytics (`breakdown_by_offer_type` + `time_window_usage`) | ~40 LOC |
| QA harness `qa_cr001c_c_coupon_v3_a_time_window.py` | ~500 LOC (25 assertions) |
| Fixture seeder extension | ~80 LOC |
| **Total non-test LOC** | **~370** |
| **Total inc. tests** | **~950 LOC** |

Conservative sprint estimate: **2–3 working days for one engineer** including live HTTP smoke verification, with the V1+V2 regression harnesses re-run before each commit.

---

## 13. Rollback Plan

Feature-isolated. To disable V3-A:
1. Remove the `_is_within_time_window` call from Step 4 of `validate_coupon_for_customer` (single line revert).
2. Stop populating `time_window_status` in responses (response shape becomes V2-identical).
3. Drop `breakdown_by_offer_type` + `time_window_usage` blocks from `get_coupon_stats`.

No DB migration to undo. All V3-A schema fields are optional → can stay in place harmlessly even after rollback.

---

## 14. What this Plan Does NOT Cover

- V3-B (BOGO / BXG) — separate implementation plan against Addendum C §C.2.1.
- V3-C (Every-Nth) — separate implementation plan against Addendum C §C.2.2.
- V3-D (Free-item) — separate implementation plan against Addendum C §C.2.3.
- V3-E (Combo) — PARKED to V4 (Addendum C §C.0).
- Per-day distinct windows (Mon 3–6, Sat 12–4) — V3-A2 if owner needs it later.
- Holiday / event calendar overrides.
- Admin UI exposure of time-window fields in `CouponsPage.jsx` — follow-up CR-001C-C-UI.
- Lifetime customer-Nth counter (V3-C2 if owner approves later).
- POS integration handoff for V1 + V2 + V3-A — separate handoff doc once V3-A passes preview QA.

---

## 15. Final Status

`cr001c_coupon_v3a_time_window_implementation_plan_ready_for_owner_approval`

Plan is implementation-ready. No code, DB, env, migration, or deployment changes have been made. Wallet, Loyalty, and `/app/memory/final/` are untouched. Implementation can begin once owner:
1. Approves this V3-A implementation plan (or supplies edits).
2. Confirms recommended defaults on OQ-V3A-1 (emit empty status block when no window) and OQ-V3A-2 (defer `used_outside_window_attempts` to V3-A2).

On approval → status flips to `cr001c_coupon_v3a_time_window_implementation_in_progress` → on QA pass to `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`.
