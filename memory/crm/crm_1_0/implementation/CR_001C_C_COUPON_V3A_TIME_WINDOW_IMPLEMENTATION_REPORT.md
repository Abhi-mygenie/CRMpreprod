# CR-001C-C — Coupon V3-A Time-Window / Happy-Hour Implementation Report

**Status:** `cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`
**Date:** 2026-02 (preview)
**Plan:** `/app/memory/crm/crm_1_0/planning/CR_001C_C_COUPON_V3A_TIME_WINDOW_IMPLEMENTATION_PLAN.md`
**Owner decisions applied:**
- OQ-V3A-1 = Yes, emit `time_window_status:{configured:false}` block uniformly
- OQ-V3A-2 = Defer `used_outside_window_attempts` analytics counter to V3-A2 (v1 returns `0`)

---

## 1. Summary

V3-A (Time-window / Happy-hour) implemented end-to-end per the approved implementation plan.

- **V1 regression:** **45/45 PASS** (`qa_cr001c_c_coupon_v1.py`)
- **V2 regression:** **45/45 PASS** (`qa_cr001c_c_coupon_v2_item_category.py`)
- **V3-A assertions:** **31/31 PASS** (`qa_cr001c_c_coupon_v3_a_time_window.py`)
- **Combined: 121/121 PASS.**
- Live HTTP smoke confirmed (backend service healthy, `/api/pos/coupons/validate` accepts the new optional `order_time` field).
- No DB migration. No new indexes. No new dependency (stdlib `zoneinfo`).
- Admin CRUD (`routers/coupons.py`) **UNTOUCHED.**
- Loyalty / Wallet / Migration code / `coupon_transactions` collection / `/app/memory/final/` **UNTOUCHED.**

---

## 2. Files changed

| File | Change | LOC delta | Highlights |
|---|---|---:|---|
| `backend/core/coupon.py` | EXTEND | ~180 | New helpers: `_v3a_parse_hhmm`, `_v3a_load_zoneinfo`, `_v3a_resolve_effective_tz` (4-step IANA chain), `_v3a_has_window`, `_v3a_is_within_time_window` (overnight wrap + window-owning-day), `_v3a_compute_next_window_start`. Inserted V3-A pre-check as **Step 4** in `validate_coupon_for_customer` (after EXPIRED, before USAGE_LIMIT_REACHED). New optional param `pos_supplied_order_time` echoed in status block (never authoritative). Success result extended with `offer_type` + `time_window_status`. `list_available_coupons` returns outside-window coupons with `within_window_now=false` + `next_window_start`. `record_coupon_usage_for_order` snapshots `offer_type` + `time_window_status` into `coupon_usage` rows and the response envelope. `COUPON_DEFAULT_TIMEZONE = "Asia/Kolkata"` constant added. |
| `backend/models/schemas.py` | EXTEND | ~80 | Imported `field_validator`. New shared validators `_v3a_validate_valid_days` (range + dedupe + sort), `_v3a_validate_hhmm` (`^([01]\d|2[0-3]):[0-5]\d$`), `_v3a_validate_timezone` (`ZoneInfo` loadable), `_v3a_validate_offer_type` (enum check). `Coupon`, `CouponCreate`, `CouponUpdate` gain optional `offer_type` (default `"simple"` on create), `valid_days`, `start_time`, `end_time`, `timezone`. `CouponUsage` gains optional `offer_type` + `time_window_status`. `POSCouponValidateRequest` gains optional `order_time` (ISO 8601, informational). |
| `backend/routers/pos.py` | EXTEND | ~25 | `pos_validate_coupon` passes `request.order_time` through to the service and surfaces `time_window_status` in both success and error responses. `pos_order_webhook` `coupon_usage` response block carries `offer_type` + `time_window_status` (on success AND on outside-window non-blocking failure). |
| `backend/services/analytics_service.py` | EXTEND | ~55 | `get_coupon_stats` adds `breakdown_by_offer_type` (Mongo `$ifNull` → `unknown`) and `time_window_usage` (`coupons_with_window`, `used_within_window`, `used_outside_window_attempts=0` per OQ-V3A-2). Existing keys unchanged → no dashboard regression. |
| `backend/tests/seed_coupon_v1_fixtures.py` | EXTEND | ~80 | 4 new V3-A fixtures: `QA_C3A_HAPPYHOUR_V1` (V1 ORDER_PERCENTAGE with Mon-Fri 15:00-18:00 IST window), `QA_C3A_HAPPYHOUR_V2_ITEM` (V2 ITEM_PERCENTAGE with same window), `QA_C3A_OVERNIGHT` (22:00-02:00 Fri-only wrap), `QA_C3A_NOWINDOW` (control). Cleanup regex extended to `QA_C3A_*`. Wide validity dates (2020 → 2099) so frozen-clock tests don't trip V1 start/end checks. |
| `backend/tests/qa_cr001c_c_coupon_v3_a_time_window.py` | NEW | ~575 | 31-assertion V3-A harness. Frozen-clock approach (`unittest.mock.patch.object(coupon_module, "datetime", _FrozenDatetime)`) for deterministic timezone tests. Covers all 25 plan cases + sub-cases. Test cleanup also drops the ad-hoc inserted `users` doc + V3A coupons. |
| `backend/routers/coupons.py` | **UNTOUCHED** | 0 | Admin CRUD 9 endpoints intact. The extended `Coupon`/`CouponCreate`/`CouponUpdate` models pick up V3-A fields with safe defaults. |
| `backend/server.py`, indexes | **UNTOUCHED** | 0 | V1 indexes cover V3-A query patterns. |
| `backend/core/loyalty.py`, wallet code, migration code | **UNTOUCHED** | 0 | Out of scope. |
| `/app/memory/final/` | **UNTOUCHED** | 0 | — |

**Total non-test delta:** ~340 LOC. **Total inc. tests:** ~915 LOC. No DB migration. No env change. No new dependency.

---

## 3. Owner decisions applied (Addendum C of V3 plan + V3-A plan OQs)

| OQ | Decision | Implementation |
|---|---|---|
| OQ-V3-1 | V3-A first | This is V3-A; no V3-B/C/D/E code introduced. `offer_type` enum accepts future values but no compute path implemented. |
| OQ-V3-5 | Restaurant local tz; server clock decides | `_v3a_resolve_effective_tz` implements the 4-step chain. POS-supplied `order_time` is **echoed** in `time_window_status.pos_supplied_order_time` and **never** consulted for the within-window decision. Verified by V3A-12, V3A-13. |
| OQ-V3-7 | One coupon per order | Idempotency key `(user_id, order_id)` unchanged. |
| OQ-V3-8 | Non-blocking final-order failure | `OUTSIDE_TIME_WINDOW` at `/orders` time → order persists, `coupon_usage` NOT recorded, `coupons.total_used` NOT incremented, structured warning logged, response `data.coupon_usage = {recorded:false, error:..., time_window_status:...}`. Verified by V3A-20, V3A-20b. |
| OQ-V3-10 | Admin UI deferred | `routers/coupons.py` untouched. `CouponsPage.jsx` unchanged. Admin sets fields via existing CRUD API. |
| **OQ-V3A-1** | Yes — emit uniform status block | `validate_coupon_for_customer` always returns `time_window_status` (either `configured:true` block when window set, or `configured:false` skeleton block when not). Verified by V3A-06. |
| **OQ-V3A-2** | Defer `used_outside_window_attempts` to V3-A2 | `_get_time_window_usage` returns `0` for that field; comment marks V3-A2 TODO. Verified by V3A-23. |

---

## 4. API contract changes (all additive)

### `GET /api/pos/coupons/available`
Per-coupon response gains:
- `offer_type: str` (always `"simple"` in V3-A v1)
- `time_window: {configured, within_window_now, valid_days, start_time, end_time, tz, tz_fallback, next_window_start}`

Coupons with `within_window_now=false` are **still returned** so POS UI can render them greyed-out with a countdown. For order-scope outside-window coupons, `expected_discount` / `final_amount_preview` remain populated (informational "you'd save"). For item/category-scope, they stay `null` (V2 OQ-1 preserved).

### `POST /api/pos/coupons/validate`
- Request gains optional `order_time` (ISO 8601). **Informational only.** Server clock decides.
- Success response gains `offer_type` + `time_window_status`.
- Outside-window response: `success=false`, `error.code="OUTSIDE_TIME_WINDOW"`, `error.field="time_window"`, `data.time_window_status` attached.

### `POST /api/pos/orders`
- No new top-level fields required from POS.
- `data.coupon_usage` gains `offer_type` + `time_window_status` on success; on outside-window failure also carries `time_window_status` alongside the error.

### New error code
- `OUTSIDE_TIME_WINDOW` — emitted by `/validate` (HTTP 200 envelope) and by `/orders` non-blocking final-commit failure.

All V1 error codes (9) and V2 error codes (5) remain unchanged. No V3-B/C/D/E codes were introduced.

---

## 5. Final POS order behavior (V3-A delta)

`pos_order_webhook` already re-invokes `validate_coupon_for_customer` via `record_coupon_usage_for_order`. The window check now runs automatically as Step 4 of validation.

1. **Within window** → `coupon_usage` row inserted with `offer_type="simple"` + `time_window_status` snapshot. `coupons.total_used` incremented on first insert (idempotent).
2. **Outside window** → **order persists** (HTTP 200). `coupon_usage` NOT inserted. `coupons.total_used` NOT incremented. Warning `coupon_validation_failed_at_final_order error_code=OUTSIDE_TIME_WINDOW` logged. Response `data.coupon_usage` carries `{recorded:false, coupon_code, error:{code, field, detail}, time_window_status:{...}}`.
3. **No window configured** → behaves exactly like V1/V2 (status block still emitted with `configured:false`).
4. **Replay (same `(user_id, order_id)`)** → existing row returned with `idempotent_replay=true`.
5. **Zero discount path** → unchanged from V1 (warn-log, skip).

---

## 6. Timezone resolution chain (frozen)

```
effective_tz =
  1. coupon.timezone               (IANA, validated at admin CRUD write time)
  2. users.settings.timezone        (restaurant doc; defensive lookup)
  3. COUPON_DEFAULT_TIMEZONE         ("Asia/Kolkata")
  4. UTC                              (last resort; tz_fallback="utc" logged)
```

The resolved tz string is echoed in **every** response under `time_window_status.tz`. `tz_fallback="utc"` flag fires only when Step 4 is reached (defensive — should not happen if Step 1 was validated at write time + Step 3 default loads).

V3A-09 verifies coupon.timezone (America/New_York) wins. V3A-10 verifies users.settings.timezone fallback. V3A-11 verifies the product-default Asia/Kolkata path.

---

## 7. Overnight window handling

Algorithm in `_v3a_is_within_time_window` per plan §6.2:
- `end_time <= start_time` → overnight wrap.
- Within-window check: `now >= start OR now < end`.
- `valid_days` interaction: when overnight and current time is in the early-morning carry-over (`now_time < end_time`), the **window-owning-day** is the previous weekday (the day the window started). Verified by V3A-07 (Saturday 01:00 IST is within the Friday window) and V3A-08 (Saturday 23:00 IST is NOT within because Saturday isn't in `valid_days` and Saturday's window hasn't started).

---

## 8. Server-clock validation

- `datetime.now(timezone.utc)` (within `core.coupon`) is the sole source for "now".
- POS-supplied `order_time` from `POSCouponValidateRequest.order_time` is captured into `time_window_status.pos_supplied_order_time` for audit/transparency only.
- Tests V3A-12 and V3A-13 cover both directions (POS lying about being inside / outside the window — CRM ignores both).
- This decision (frozen per OQ-V3-5) prevents cashier-device clock-drift / deliberate skew from granting out-of-window discounts.

---

## 9. Analytics impact

`get_coupon_stats` response now contains:

```json
{
  "total_coupons": ...,
  "coupons_used": ...,
  "discount_availed": ...,
  "breakdown_by_scope":      { "order": ..., "item": ..., "category": ..., "unknown": ... },
  "breakdown_by_offer_type": { "simple": ..., "bogo": ..., "bxg": ..., "nth_item": ..., "free_item": ..., "combo": ..., "unknown": ... },
  "time_window_usage":       { "coupons_with_window": ..., "used_within_window": ..., "used_outside_window_attempts": 0 }
}
```

- All existing keys preserved → dashboards do not break.
- Non-`simple` buckets in `breakdown_by_offer_type` stay at 0 until V3-B+.
- `unknown` bucket holds legacy `coupon_usage` rows without `offer_type` (V1/V2 historical records).
- `used_outside_window_attempts` is a V3-A2 placeholder (returns `0`) per OQ-V3A-2.

Verified by V3A-22 and V3A-23.

---

## 10. Indexes

**No new indexes.** V1's `coupon_usage.(user_id, order_id)` partial unique index continues to provide V3-A idempotency. V1's lookup indexes (`(user_id, coupon_id, customer_id)`, `(user_id, created_at)`) cover V3-A analytics queries.

---

## 11. QA results

### V1 regression — `python -m tests.qa_cr001c_c_coupon_v1`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### V2 regression — `python -m tests.qa_cr001c_c_coupon_v2_item_category`
```json
{ "total": 45, "passed": 45, "failed": 0 }
```

### V3-A — `python -m tests.qa_cr001c_c_coupon_v3_a_time_window`
```json
{ "total": 31, "passed": 31, "failed": 0 }
```

### Combined: **121/121 PASS.**

V3-A coverage breakdown (31 assertions):
- Window evaluation (V3A-01..06): 6
- Overnight wrap (V3A-07..08): 2
- Timezone resolution (V3A-09..11): 3
- Server-clock vs POS-supplied `order_time` (V3A-12..13): 2
- `/available` shape with windows (V3A-14..16): 3
- V1+V2 cross-cutting happy-hour (V3A-17..18): 2
- Final-order non-blocking + idempotent (V3A-19..21 + V3A-19b/20b): 5
- Analytics (V3A-22..23): 2
- Admin CRUD Pydantic validators (V3A-24a..d): 4
- Loyalty + Wallet untouched (V3A-25..25b): 2

---

## 12. Live HTTP smoke

| Endpoint | Result |
|---|---|
| `GET /api/health` | 200 healthy (backend restarted cleanly after schema changes) |
| `POST /api/pos/coupons/validate` with new `order_time` field (no API key) | 401 "Invalid API key" — confirms request body schema parsed successfully (no Pydantic 422 on `order_time`). |

Full live happy-hour smoke with a real POS user is a downstream POS-integration concern (deferred to the joint V1+V2+V3-A POS handoff).

---

## 13. Compatibility / what stayed stable

- V1 ORDER_FLAT / ORDER_PERCENTAGE behave identically (V1 harness 45/45).
- V2 ITEM_* / CATEGORY_* behave identically (V2 harness 45/45).
- V1/V2 coupons without window fields continue to work without modification.
- Existing `coupon_usage` rows without `offer_type` → bucketed under `unknown` in `breakdown_by_offer_type`.
- Idempotency key `(user_id, order_id)` unchanged.
- Variance tolerance (₹1 abs / 1% rel) unchanged.
- Stacking with loyalty (`stackable_with_loyalty` flag) unchanged.
- 9 admin CRUD endpoints unchanged; Pydantic models add optional V3-A fields with safe defaults.
- `coupon_transactions` legacy collection untouched. Analytics union preserved.
- `core/loyalty.py`, wallet code, migration code, `routers/coupons.py`, `/app/memory/final/` untouched.

---

## 14. Out-of-V3-A reaffirmed

NOT implemented in V3-A v1 (per Addendum C §C.2 scope locks):
- BOGO (`offer_type="bogo"`) — V3-B
- Buy-X-Get-Y (`offer_type="bxg"`) — V3-B
- Every-Nth (`offer_type="nth_item"`) — V3-C
- Free-item (`offer_type="free_item"`) — V3-D
- Combo (`offer_type="combo"`) — V3-E **PARKED to V4**
- Per-day distinct windows (Mon 3–6, Sat 12–4) — V3-A2
- Holiday / event calendar overrides
- `used_outside_window_attempts` counter — V3-A2 (per OQ-V3A-2)
- Admin UI exposure of window fields in `CouponsPage.jsx` — follow-up CR-001C-C-UI
- POS integration handoff for V1+V2+V3-A — separate handoff doc

---

## 15. Rollback

Feature-isolated. To disable V3-A:
1. Remove the V3-A pre-check block from Step 4 of `validate_coupon_for_customer`.
2. Stop populating `offer_type` + `time_window_status` in `record_coupon_usage_for_order`.
3. Drop `breakdown_by_offer_type` + `time_window_usage` from `get_coupon_stats`.

No DB migration to undo. All V3-A schema fields are optional → can stay in place harmlessly even after rollback. V1/V2 harnesses remain 45/45 with or without V3-A enabled.

---

## 16. Final status

`cr001c_coupon_v3a_time_window_implementation_qa_passed_in_preview`

Ready for owner sign-off and joint POS-side integration handoff alongside V1 + V2.
