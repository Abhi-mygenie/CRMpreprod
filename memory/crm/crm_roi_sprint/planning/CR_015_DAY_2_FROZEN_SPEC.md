# CR-015 Day-2 — Frozen Specification for T3 (Event-Data Expansion)

**Status**: `cr015_day_2_frozen_pending_implementation`
**Audit date**: 2026-05-29
**Auditor**: agent (read-only code inspection — every claim verified)
**Predecessor**: `planning/CR_015_PHASE_1_PLAN.md` v1.1 §5.2, §5.4
**For consumption by**: implementation agent (next session or this one)

---

## 0. Purpose

Plan v1.1 §5.2 described `build_order_event_context` and §5.4 listed callsites. This document **freezes that into a code-level spec** that an implementation agent can execute mechanically without re-deriving anything. Every line number, every field name, every reachability claim has been verified in `/app` source at audit time.

If you (implementation agent) hit anything that contradicts this document, **STOP and surface to owner** — do not improvise. Drift between spec and code is what caused the v1.0 → v1.1 rework.

---

## 1. Day-1 baseline (what's already landed; do NOT re-touch)

| Already done | File | Anchor | Status |
|---|---|---|---|
| T1 resolver hardening | `core/whatsapp.py` | `get_event_template_config` lines 373-415 | ✅ landed, 8 tests pass, live smoke confirmed |
| T5 14 new registry entries | `core/whatsapp_variables.py` | end of `WHATSAPP_VARIABLES` list, marked `CR-015 T5 (2026-05-29)` | ✅ landed |
| T5 `time` + `titlecase` formatters | `core/whatsapp.py` | `_format_value` lines ~225-275 | ✅ landed, 16 tests pass |
| Unit tests | `tests/test_cr015_resolver.py` | new file, 44 tests | ✅ green |
| Regression updates | `tests/test_whatsapp_p2_5_expansion.py` + `tests/test_whatsapp_variables_endpoint.py` | hardcoded count assertions | ✅ updated for 37 vars |

**Implication for Day 2**: registry + resolver + formatters are ready. T3 just needs to populate `event_data` with the keys the registry can already source from.

---

## 2. Audited reachability map — which triggers fire where, in what state

This is **the single most important table in this doc**. Every claim verified by grep + view in current `/app`.

| # | Code path | Trigger callsite | Event_key fired | Local vars available at this line | Touched by T3? |
|---|---|---|---|---|---|
| A | `POST /api/pos/orders` | `routers/pos.py:1462` | `send_bill` | `order_data` (POSOrderWebhook), `updated_customer`, `points_earned`, `new_points`, `wallet_used`, `new_wallet_balance`, `crm_loyalty_points_redeemed`, `crm_loyalty_discount`, `order_id` (the persisted internal id), `pts` (dict with off_peak_bonus) | ✅ **YES — primary fix** |
| B | `POST /api/pos/orders` | `routers/pos.py:1481` | `welcome_message` (only if `is_new=True`) | Same as A + `first_visit_bonus` | ✅ **YES — merge order_ctx** |
| C | `POST /api/pos/orders` | `routers/pos.py:1497` | `tier_upgrade` (only if tier changed) | Same as A + `old_tier`, `new_tier` | ✅ **YES — merge order_ctx** |
| D | `POST /api/pos/events` | `routers/pos.py:2194` | dynamic (`new_order_*`, `order_ready_*`, `item_*`, `send_bill_manual`, `send_bill_auto`) — `send_bill_manual`/`send_bill_auto` re-mapped to `send_bill` internally at line 2094 | `event_data.event_data` (POS-supplied dict) merged into `context_data` at line 2190 | ❌ **NO — POS owns event_data shape here** (see §6) |
| E | `routers/points.py:133` | `bonus_points` (admin POST `/api/points/transaction` with type=bonus) | `customer`, `tx_data`, `new_balance`, `tx_doc` | ❌ no |
| F | `routers/points.py:155` | `tier_upgrade` (non-POS path) | Same as E + old_tier/new_tier | ❌ no |
| G | `routers/wallet.py:55` | `wallet_credit` | `customer`, `tx_data`, `new_balance`, `tx_id` | ❌ no |
| H | `routers/wallet.py:77` | `wallet_debit` | Same as G | ❌ no |
| I | `routers/auth.py:515` | `reset_password` | `customer`, `otp`, `user` | ❌ no — OTP-only context |
| J | `routers/coupons.py:258` | `coupon_earned` (manual issue) | `customer`, `coupon`, `code` | ❌ no — already adequate |
| K | `services/feedback_service.py:59` | `feedback_request` | `customer`, `feedback_data`, `feedback_id` | ❌ no |
| L | `core/loyalty.py:456` | `points_redeemed` | `customer`, `tx_doc`, `actual_points`, `new_balance`, `redeemed_value`, `order_id` | ❌ no — already adequate |
| M | `core/loyalty_jobs.py:105` | `birthday` (daily cron) | `customer`, `bonus_points`, `new_points`, `today` | ❌ no |
| N | `core/loyalty_jobs.py:212` | `anniversary` (daily cron) | Same shape | ❌ no |
| O | `core/loyalty_jobs.py:302` | `points_expiring` (daily cron) | `customer`, `expiring_points`, `earliest_expiry`, `now` | ❌ no |
| P | `core/loyalty_jobs.py:436` | `coupon_expiring` (daily cron) | `customer`, `coupon`, `today_str` | ❌ no |
| Q | `core/loyalty_jobs.py:479` | `inactive_customer` (daily cron) | `customer`, `now` | ❌ no |
| R | `core/whatsapp.py:759` | `trigger_points_earned_event` wrapper — called from G, H, E secondary | passthrough | ❌ no (wrapper) |

**Scope of T3 = rows A, B, C only.** That is, **3 callsites in `routers/pos.py` only**. All other 15 callsites either:
- Already have adequate context for their template (G/H/L/J),
- Have no order context to add at that callsite (I, K, M-Q),
- Are POS-driven payloads we don't own (D).

This matches plan v1.1 §5.4 exactly. **T4 minor enrichments are Day 3 work, not Day 2.**

---

## 3. POSOrderWebhook field manifest (verified against `routers/pos.py:1116`)

These are all the fields that `build_order_event_context` is allowed to read from `order_data`. **DO NOT** access any field not in this list — they're not declared on the Pydantic model.

| Field | Type | Default | Used by `build_order_event_context`? |
|---|---|---|---|
| `pos_id` | str | "mygenie" | no |
| `restaurant_id` | str | required | no |
| `restaurant_name` | Optional[str] | None | brand_data carries this — no |
| `order_id` | str | required | ✅ |
| `restaurant_order_id` | Optional[str] | None | ✅ |
| `cust_mobile` | str | required | no |
| `cust_name` / `cust_email` | Optional[str] | None | no (customer doc has these) |
| `user_id` | Optional[str] | None | no |
| `order_amount` | float | required | ✅ |
| `order_sub_total_amount` | Optional[float] | None | ✅ |
| `order_discount` | float | 0.0 | ✅ |
| `self_discount` | float | 0.0 | ✅ |
| `coupon_code` | Optional[str] | None | ✅ |
| `coupon_discount` | float | 0.0 | ✅ |
| `coupon_title` | Optional[str] | None | ✅ |
| `coupon_type` | Optional[str] | None | ✅ |
| `wallet_used` | float | 0.0 | ✅ (with caller override) |
| `tax_amount` | float | 0.0 | ✅ |
| `gst_tax` / `vat_tax` / `service_tax` / `service_gst_tax_amount` | float | 0.0 | ✅ |
| `tip_amount` / `tip_tax_amount` | float | 0.0 | ✅ |
| `delivery_charge` | float | 0.0 | ✅ |
| `round_up` | float | 0.0 | ✅ |
| `payment_method` | Optional[str] | None | ✅ |
| `payment_status` | Optional[str] | None | ✅ |
| `payment_type` | Optional[str] | None | ✅ |
| `transaction_id` | Optional[str] | None | ✅ |
| `order_status` | Optional[str] | None | ✅ |
| `order_type` | Optional[str] | "pos" | ✅ |
| `table_id` | Optional[str] | None | ✅ |
| `waiter_id` / `employee_id` | Optional[str] | None | no |
| `employee_name` | Optional[str] | None | ✅ (also exposed as `waiter_name`) |
| `print_kot` / `print_bill_status` | Optional[str] | None | no |
| `paid_room` / `room_id` / `address_id` | Optional[str] | None | no (room_info covers it) |
| `order_created_at` | Optional[str] | None (alias `created_at`) | ✅ (also exposed as `order_date` and `order_time`) |
| `order_updated_at` | Optional[str] | None | no |
| `order_notes` | Optional[str] | None | ✅ |
| `items` | Optional[List[OrderItem]] | None | derived `item_count = len(items)` |
| `room_info` | Optional[RoomInfo] | None | no (CR-014 territory) |
| `associated_order_ids` | Optional[List[str]] | None | no |
| `loyalty_points_used` | Optional[int] | None | ✅ (with caller override) |
| `loyalty_discount` | Optional[float] | None | ✅ (with caller override) |
| `loyalty_idempotency_key` | Optional[str] | None | no |

**Confirmed**: 26 fields used, 21 unused but declared. No `**extra` passthrough hacks needed.

---

## 4. The exact T3 spec — frozen code

### 4.1 New helper: `build_order_event_context` in `core/whatsapp.py`

**Insertion point**: between existing `_format_coupon_field` (line 322) and `build_body_values` (line 333). Add a new section header comment.

**Signature & behaviour**:

```python
def build_order_event_context(
    order_data,
    customer: Dict[str, Any],
    *,
    points_earned: int,
    new_points: int,
    wallet_used: float,
    new_wallet_balance: float,
    crm_loyalty_points_redeemed: int = 0,
    crm_loyalty_discount: float = 0.0,
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    CR-015 T3 (2026-05-29): Build a single event_data dict for ALL POS
    order-triggered WhatsApp events (send_bill, welcome_message, tier_upgrade).

    Strategy is additive: caller spreads {**order_ctx, ...event_specific...}
    when calling trigger_whatsapp_event(). Existing keys consumed by the
    resolver continue working; new keys (payment_method, order_date, etc.)
    flow through to the registry's `event` sources.

    Args:
        order_data: POSOrderWebhook Pydantic instance (routers/pos.py:1116)
        customer:   Updated customer dict (post-points/wallet/tier update)
        points_earned, new_points: outcomes from points calc
        wallet_used, new_wallet_balance: outcomes from wallet adjustment
        crm_loyalty_points_redeemed, crm_loyalty_discount:
            outcomes from CRM-side loyalty redemption back-calc (0 if none)
        extra: optional dict merged at the end (caller injection point)

    Returns:
        Dict with ~25 keys. None and empty-string values are stripped so the
        resolver's source-chain fallback works (registry → event → customer → brand).

    Notes:
        * Coupon fields are read directly from `order_data` (POS payload
          carries them as first-class fields). This is correct even though
          coupon_usage recording happens AFTER the trigger fires in pos.py
          (line 1510), because the POS-supplied coupon data is the source
          of truth for the customer-facing message.
        * `restaurant_name` is intentionally NOT included — it's resolved
          from `brand_data` at trigger time (whatsapp.py:581-587).
        * `order_id` is the POS-supplied id (`order_data.order_id`).
          The caller may override `reference_id` to the persisted internal id.
    """
    items = list(getattr(order_data, "items", None) or [])
    ctx: Dict[str, Any] = {
        # ── Identification ──
        "order_id": order_data.order_id,
        "pos_order_id": order_data.order_id,
        "restaurant_order_id": (
            order_data.restaurant_order_id or order_data.order_id
        ),
        # ── Amounts ──
        "order_amount": order_data.order_amount,
        "order_sub_total_amount": order_data.order_sub_total_amount,
        "order_discount": order_data.order_discount,
        "self_discount": order_data.self_discount,
        # ── Taxes ──
        "tax_amount": order_data.tax_amount,
        "gst_tax": order_data.gst_tax,
        "vat_tax": order_data.vat_tax,
        "service_tax": order_data.service_tax,
        # ── Tips / charges ──
        "tip_amount": order_data.tip_amount,
        "delivery_charge": order_data.delivery_charge,
        "round_up": order_data.round_up,
        # ── Payment ──
        "payment_method": order_data.payment_method,
        "payment_status": order_data.payment_status,
        "payment_type": order_data.payment_type,
        "transaction_id": order_data.transaction_id,
        # ── Order meta ──
        "order_status": order_data.order_status,
        "order_type": order_data.order_type,
        "table_id": order_data.table_id,
        "employee_name": order_data.employee_name,
        "waiter_name": order_data.employee_name,           # registry alias
        "order_created_at": order_data.order_created_at,
        "order_date": order_data.order_created_at,         # registry alias
        "order_time": order_data.order_created_at,         # registry alias
        "order_notes": order_data.order_notes,
        # ── Derived ──
        "item_count": len(items),
        # ── Loyalty / wallet outcomes (caller-supplied) ──
        "points_earned": points_earned,
        "points_balance": new_points,
        "wallet_used": wallet_used if wallet_used else (order_data.wallet_used or 0.0),
        "wallet_balance": new_wallet_balance,
        "loyalty_points_used": (
            crm_loyalty_points_redeemed or order_data.loyalty_points_used or 0
        ),
        "loyalty_discount": (
            crm_loyalty_discount or order_data.loyalty_discount or 0.0
        ),
        # ── Coupon (from POS payload — first-class on POSOrderWebhook) ──
        "coupon_code": order_data.coupon_code,
        "coupon_title": order_data.coupon_title,
        "coupon_discount": order_data.coupon_discount,
        "coupon_type": order_data.coupon_type,
    }
    if extra:
        ctx.update(extra)
    # Strip None and empty-string values; preserve 0 / 0.0 (valid integers/currency)
    return {k: v for k, v in ctx.items() if v is not None and v != ""}
```

**Why strip empty values**: the resolver's source chain (`whatsapp.py:272-303`) prefers the FIRST non-empty source. If we put `payment_method: None` in event_data, it overrides nothing, but adds clutter. If we put `payment_method: ""`, the resolver treats it as a non-fill and falls through correctly to the next source — but we have no next source for this field, so it'd resolve to "". Stripping at builder = same outcome, less log noise.

**Why `getattr` for `items`**: in 100% of production code paths `order_data` is a `POSOrderWebhook` instance, so `order_data.items` would work. Using `getattr` is purely defensive for any future dict-shaped caller (e.g. tests). Tiny robustness cost.

**Tests** (added to existing `tests/test_cr015_resolver.py` or new file `tests/test_cr015_event_context.py`):

| # | Test name | What it asserts |
|---|---|---|
| 1 | `test_build_minimal_required_only` | With only required POSOrderWebhook fields, ctx has order_id/pos_order_id/order_amount + the 4 outcome fields. No None values. |
| 2 | `test_build_full_payload_populates_25_keys` | With all 26 source fields filled, ctx has ≥ 25 keys. |
| 3 | `test_none_stripping` | Optional fields not set → not in returned dict. |
| 4 | `test_empty_string_stripped` | Explicit empty-string fields not in returned dict. |
| 5 | `test_zero_values_preserved` | `order_amount=0` and `wallet_used=0` remain in dict (valid currency 0). |
| 6 | `test_item_count_derived` | `items=[OrderItem×3]` → `ctx["item_count"]==3`; `items=None` → `ctx["item_count"]==0`. |
| 7 | `test_coupon_fields_from_pos_payload` | When `order_data.coupon_code` is set, coupon_* flow through. |
| 8 | `test_extra_overrides_take_precedence` | `extra={"order_amount": 99999}` → `ctx["order_amount"]==99999`. |
| 9 | `test_restaurant_order_id_fallback` | When `order_data.restaurant_order_id` is None, falls back to `order_id`. |
| 10 | `test_caller_loyalty_overrides_pos_supplied` | Caller's `crm_loyalty_discount=42` overrides `order_data.loyalty_discount`. |

### 4.2 Refactor: `routers/pos.py:1450-1508` — three trigger callsites

**Exact diff target**: the block from line 1450 (the `updated_customer` definition) through line 1508 (close of tier_upgrade trigger).

```python
        # Update customer with latest data for triggers
        updated_customer = {
            **customer,
            "total_points": new_points,
            "tier": new_tier,
            "wallet_balance": new_wallet_balance,
            "total_visits": new_total_visits,
            "total_spent": new_total_spent
        }

        # CR-015 T3 (2026-05-29): build a single event_data context shared by all
        # POS order-triggered events. See core.whatsapp.build_order_event_context.
        from core.whatsapp import build_order_event_context
        order_ctx = build_order_event_context(
            order_data, updated_customer,
            points_earned=points_earned,
            new_points=new_points,
            wallet_used=wallet_used,
            new_wallet_balance=new_wallet_balance,
            crm_loyalty_points_redeemed=crm_loyalty_points_redeemed,
            crm_loyalty_discount=crm_loyalty_discount,
        )

        # 8. Fire WhatsApp triggers
        # send_bill trigger - for every order
        asyncio.create_task(trigger_whatsapp_event(
            db, user["id"], "send_bill", updated_customer,
            {
                **order_ctx,
                # CR-004 P3.5: idempotency + reference enrichment (per-event override)
                "idempotency_key": f"{order_data.order_id}_send_bill",
                "reference_type": "order",
                "reference_id": order_id,
            }
        ))

        # welcome_message trigger - only for new customers
        if is_new:
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "welcome_message", updated_customer,
                {
                    **order_ctx,
                    "first_visit_bonus": first_visit_bonus,
                    "idempotency_key": f"{updated_customer.get('id')}_welcome",
                    "reference_type": "customer",
                    "reference_id": updated_customer.get("id"),
                }
            ))

        # tier_upgrade trigger - if tier changed
        old_tier = customer.get("tier", "Bronze")
        if new_tier != old_tier and _tier_rank_pos(new_tier) > _tier_rank_pos(old_tier):
            asyncio.create_task(trigger_whatsapp_event(
                db, user["id"], "tier_upgrade", updated_customer,
                {
                    **order_ctx,
                    "old_tier": old_tier,
                    "new_tier": new_tier,
                    "idempotency_key": f"{updated_customer.get('id')}_tier_{new_tier}",
                    "reference_type": "customer",
                    "reference_id": updated_customer.get("id"),
                }
            ))
```

**Key shape preservation**:
- `idempotency_key` values are **byte-identical** to the pre-T3 version (CR-004 P3.5 invariants preserved).
- `reference_type` and `reference_id` are unchanged.
- `points_balance`, `points_earned`, `wallet_balance`, `wallet_used`, `order_amount`, `order_id`, `pos_order_id` — all keys that the existing resolver chain depends on — are present in `order_ctx`.
- `welcome_message` no longer carries `"order_amount"` as a separately-set key (it's already in `order_ctx`); also no longer carries `"points_balance"` separately (same). `first_visit_bonus` IS still set separately because it's not POS-payload data.
- `tier_upgrade` no longer carries `"points_balance"` separately (it's in `order_ctx`); but `old_tier`/`new_tier` are still event-specific extras.

**Import to add at top of `routers/pos.py`**: change `from core.whatsapp import trigger_whatsapp_event` (currently line 14) to include `build_order_event_context`:

```python
from core.whatsapp import trigger_whatsapp_event, build_order_event_context
```

(Avoids the inline `from core.whatsapp import` inside the function body shown in the diff above. Either is fine; module-top import is cleaner. **Implementation agent: use module-top import**, the inline `from` in the diff above is shown only for diff clarity.)

### 4.3 Files touched by T3 — exact list

| File | Change | LoC Δ |
|---|---|---|
| `/app/backend/core/whatsapp.py` | Add `build_order_event_context` function | +75 |
| `/app/backend/routers/pos.py` | Import + refactor lines 1450-1508 | +18 / −22 (net −4) |
| `/app/backend/tests/test_cr015_event_context.py` | NEW — 10 unit tests | +180 |

**NO other backend file is touched by T3**. Confirmed by:
- `core/whatsapp.py` other functions: untouched
- `routers/pos.py` other endpoints (including `/api/pos/events` at line 2050): untouched
- `routers/wallet.py`, `routers/points.py`, `routers/coupons.py`, `routers/auth.py`, `core/loyalty.py`, `core/loyalty_jobs.py`, `services/feedback_service.py`: untouched in T3 (T4 minor work on Day 3)
- Frontend: untouched

---

## 5. Reachability verification — what calls what

Pre-T3 state:

```
POST /api/pos/orders  (pos.py:1274)
    └─ line 1462: trigger_whatsapp_event("send_bill", {…10 keys ad-hoc dict…})
    └─ line 1481: trigger_whatsapp_event("welcome_message", {…6 keys ad-hoc dict…})
    └─ line 1497: trigger_whatsapp_event("tier_upgrade", {…6 keys ad-hoc dict…})
```

Post-T3 state (with order_ctx ≈ 25 keys):

```
POST /api/pos/orders  (pos.py:1274)
    ├─ build_order_event_context(...)   ← new local var order_ctx (~25 keys)
    └─ line 1462: trigger_whatsapp_event("send_bill", {**order_ctx, idempotency_key, ref_type, ref_id})  → ~28 keys
    └─ line 1481: trigger_whatsapp_event("welcome_message", {**order_ctx, first_visit_bonus, idempotency_key, ref_type, ref_id})  → ~29 keys
    └─ line 1497: trigger_whatsapp_event("tier_upgrade", {**order_ctx, old_tier, new_tier, idempotency_key, ref_type, ref_id})  → ~30 keys
```

**Downstream consumers of `event_data` (the dict passed to `trigger_whatsapp_event`)**:
- `core/whatsapp.py:597` — `trigger_whatsapp_event` accepts `event_data` and passes it forward.
- `core/whatsapp.py:633` — `event_data` reaches `build_body_values` via the resolver chain.
- `core/whatsapp.py:307` — `_check_event_data_for_coupon_field` reads `coupon_code`, `coupon_title`, `coupon_discount`, `coupon_expiry`, `discount`. **All present in our order_ctx**.
- `core/whatsapp.py:286-296` — `resolve_variable` reads `event_data.get(field)` for any registry source declared as `from=event`. **All new T5 registry entries declare `from=event` for the keys we add**.

**No consumer of `event_data` reads any key NOT in the union of {old_keys, new_order_ctx_keys}**. So additivity is safe.

---

## 6. Explicit non-changes — what stays exactly as-is

| Item | Why preserved |
|---|---|
| `POST /api/pos/events` body shape | POS contract — owned by external POS system; mid-flight refactor would break the integration |
| `routers/pos.py:2194` context_data | Generic POS event passthrough — `event_data.event_data` is POS-supplied; we don't enrich here |
| `trigger_whatsapp_event` signature | `(db, user_id, event_type, customer, event_data)` — unchanged; T3 only adds keys inside the `event_data` dict |
| `trigger_points_earned_event` signature | Unchanged |
| `_check_event_data_for_coupon_field` and `_format_coupon_field` | CR-004 P2.5-B coupon_pick path — unchanged |
| `build_body_values` | Unchanged — already reads `event_data.get(field)` via `resolve_variable` |
| `get_event_template_config` | Already hardened in Day 1 |
| Frontend variable-mapping modal | T6 work on Day 3 — Day 2 doesn't touch the frontend |
| Cron-driven events (M-Q in §2) | No order context to add; their existing event_data is adequate |
| Wallet/Points/Coupons/Auth/Feedback callsites (E-K, L) | T4 Day 3 — Day 2 doesn't touch these |

---

## 7. Risk register (audit-fresh)

| # | Risk | P | Impact | Mitigation in this spec |
|---|---|---|---|---|
| 1 | Old event_data shape consumer breaks on new keys | Very Low | High | All consumers read by key; ignoring unknown keys is safe |
| 2 | `coupon_code` flows from order_ctx + caller's per-event `coupon_code` collide | None | — | None of the 3 callsites override coupon_code; order_ctx wins by construction |
| 3 | `wallet_used` semantic drift between caller's value and `order_data.wallet_used` | Low | Low | Builder prefers caller-supplied, falls back to POS payload — verified |
| 4 | `loyalty_points_used` semantic drift (POS supplied vs CRM back-calculated) | Low | Med | Builder prefers CRM-calculated (truthy) → POS payload → 0. Matches loyalty.py semantics (CRM is source of truth, per CR-007 Fix B) |
| 5 | `restaurant_order_id` is None in legacy POS payloads → templates expecting bill number show order_id instead | Very Low | Low | Builder falls back to order_id; template designer can choose which variable to map |
| 6 | New keys in event_data create logspam | Low | Low | None-stripping in builder; loglines unaffected (event_data is not logged verbatim today) |
| 7 | Live POS will send a field with unexpected type (e.g. int where str expected) | Low | Med | Pydantic on POSOrderWebhook validates at ingest. Builder only reads validated fields. |
| 8 | `tier_upgrade` callsite calls `customer.get("tier")` BEFORE the local var `old_tier` exists — wait, it does NOT have old_tier yet at line 1495 | Verified | — | Line 1495 sets `old_tier = customer.get("tier", "Bronze")` BEFORE the trigger at 1497. Order is correct in current code and preserved in spec. |

---

## 8. Smoke + acceptance for Day 2

### 8.1 Static checks (run before commit)

```bash
cd /app/backend && python3 -m pytest tests/test_cr015_resolver.py tests/test_cr015_event_context.py -v
# Expect: 44 + 10 = 54 passed

cd /app/backend && python3 -m pytest tests/test_whatsapp_resolver.py tests/test_whatsapp_p2_5_expansion.py tests/test_whatsapp_variables_endpoint.py tests/test_whatsapp_status_machine.py tests/test_whatsapp_text_mode.py -q
# Expect: 65 passed (regression baseline)
```

### 8.2 Live smoke probe (read-only)

Write `/app/backend/scripts/cr015_t3_smoke_probe.py` modelled on the T1 probe:

```python
# Fire a SYNTHETIC POSOrderWebhook through build_order_event_context() locally
# (no DB writes, no HTTP). Assert ≥ 20 keys present, payment_method/order_date/
# order_type/restaurant_order_id all populated correctly through resolve_variable.
```

This is a unit-style probe; it does NOT POST to `/api/pos/orders`. Live POS-driven test is the Day 4 integration test (plan §9.3).

### 8.3 Acceptance gate to mark Day 2 complete

| # | Check | Method |
|---|---|---|
| 1 | `build_order_event_context` exists, signature matches §4.1 | code review |
| 2 | Returns dict with ≥ 20 keys for a full POSOrderWebhook | unit test |
| 3 | Strips None/empty-string but preserves 0 | unit test |
| 4 | 3 triggers in pos.py spread `**order_ctx` correctly | code review + grep |
| 5 | All idempotency_keys byte-identical to pre-T3 | grep diff |
| 6 | `trigger_whatsapp_event` signature unchanged | grep |
| 7 | 109 baseline tests + 10 new tests all green | pytest |
| 8 | Backend restarts cleanly, `/api/health` 200 | curl |
| 9 | Closeout doc updated with Day-2 handover note | view |
| 10 | Dashboard updated: row 15 → "Day 2 done; T3 landed" | view |

---

## 9. Handoff instructions for implementation agent

If you are picking this up:

1. **Read this entire doc first.** Especially §2 (reachability map) and §4 (frozen spec).
2. **Read these files once each** (no edits yet):
   - `/app/backend/core/whatsapp.py` lines 270-330 (where the new function inserts)
   - `/app/backend/routers/pos.py` lines 1450-1510 (the refactor target)
3. **Implement in this order**:
   - a. Add `build_order_event_context` to `core/whatsapp.py` (§4.1)
   - b. Create `tests/test_cr015_event_context.py` with the 10 tests (§4.1)
   - c. Run those tests; iterate until green
   - d. Add `build_order_event_context` to the existing `from core.whatsapp import …` line in `routers/pos.py` (line 14)
   - e. Refactor lines 1450-1508 per §4.2
   - f. Run linter + full test suite (54 + 65 = 119 expected)
   - g. Run T3 smoke probe (§8.2)
   - h. Restart backend, check `/api/health`
4. **Update**:
   - Closeout doc Day 2 section with one paragraph per change + acceptance ticks
   - Dashboard row 15 status
5. **STOP and surface to owner** before starting Day 3 (T4 + T6 + T7). Day 3 = separate freeze doc.

**Hard rules** (per /app/memory/README.md §9):
- No `testing_agent_v3` invocation
- No DB writes during T3 (T3 is code-only)
- No push to prod
- No frontend changes in T3
- If the spec contradicts the code you read, STOP and surface — do not improvise

---

## 10. Things that changed from v1.1 plan after this audit

| Spot | v1.1 said | Audit verified | This freeze doc |
|---|---|---|---|
| `routers/pos.py` callsite for `payment.received` | listed as `pos.py:2194` | That's `/api/pos/events` (line 2050) — generic POS event passthrough, NOT a separate `payment.received` event. Plan v1.1's row 4 in §5.4 already correctly described this as "audit only". | Listed in §2 row D, marked "NO — POS owns event_data shape" |
| Need for `coupon` param on `build_order_event_context` | v1.1 §5.2 had `coupon: dict \| None = None` param | Triggers fire at line 1462 BEFORE coupon recording at 1510. But POS payload itself carries coupon_code/title/discount/type as first-class fields, so reading from `order_data.coupon_*` is correct and the `coupon` param is unnecessary. | Param dropped from §4.1; coupon fields read directly from `order_data` |
| Callsite count | "18 actual" in v1.1 §3.0 | Verified 18 (including 3 wrapper-helper sites). T3 scope is 3 of them. | Same count documented in §2 |
| `import build_order_event_context` placement | v1.1 didn't specify | Place at module-top alongside existing `from core.whatsapp import trigger_whatsapp_event` (line 14) | §4.2 |
| Day 2 effort | "1 day" implied | This audit + spec freeze took ~30 min; implementation should take ~2 hours including tests. | unchanged |

**Net delta vs v1.1**: minor refinements, no scope changes. Confidence is higher because every claim was re-verified.

---

**End of Day-2 freeze spec. Status: ready for implementation.**
