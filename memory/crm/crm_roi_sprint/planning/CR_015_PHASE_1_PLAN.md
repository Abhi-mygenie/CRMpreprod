# CR-015 — WhatsApp Template Variable Mapping Fidelity — Phase 1 Plan

**Sprint**: ROI Measurement / CRM
**CR code**: CR-015
**Lifecycle stage**: `cr015_planning_phase_1_pending_owner_signoff`
**Date**: 2026-05-29
**Author**: agent (Phase 1 plan; awaits owner sign-off before any code lands)
**Predecessor doc**: `../discovery/CR_015_WHATSAPP_VARIABLE_MAPPING_FIDELITY_DISCOVERY.md`

---

## 0. Status

| Phase | Status |
|---|---|
| 0 Discovery | ✅ complete (parked since 2026-05-28) |
| 1 Planning | **🟡 this doc — awaiting owner sign-off** |
| 2 Implementation | not started |
| 3 QA + Live Test | not started |

**Sign-off gate**: owner must approve §3 (locked decisions), §6 (work sequence), §11 (live test) before any code is written.

---

## 1. Recap (one paragraph)

The variable-mapping subsystem has 3 stacked defects that cause every templated WhatsApp slot to render as literal placeholder text. **Bug #1** is a `template_id` type mismatch (`int` vs `str`) in the resolver query. **Bug #2** is garbage in stored mappings (free-text + typos) because the admin UI never validated. **Bug #3** is severe event-data truncation at trigger callsites — only 10 of 40+ POS fields are forwarded. This CR fixes all three with a defensive resolver, a one-time DB normalization, an event-data expansion at every callsite, registry additions, an admin UI guard, and a one-time cleanup of R689's bad mappings.

---

## 2. Locked decisions (from owner reply 2026-05-29)

> Owner answered every Q1–Q8 with option `a` (recommended default). These are now LOCKED for this CR.

| # | Decision | Locks |
|---|---|---|
| Q1 | Canonical type for `template_id` across both collections = **`str`** | T2 migration target; resolver coerces to str at boundary |
| Q2 | R689 template 25140 cleanup = **DB script with dry-run + owner approval** | T7 sequence |
| Q3 | Event-data forwarding = **single giant `order_event_context` dict** to every trigger | T3, T4 design |
| Q4 | Admin UI on unknown var_key = **block save with inline error** | T6 client + server validation |
| Q5 | T4 callsite scope = **all 15 trigger callsites this CR** | T4 scope (see §5.4 audit table) |
| Q6 | `titlecase` formatter for `order_type` | T5 new formatter |
| Q7 | Separate `order_date` + `order_time` variables | T5 registry additions |
| Q8 | All 12 registry entries in a single PR | T5 release plan |

### Process defaults (B1–B3, applied unless overridden at sign-off)

| # | Default | Override window |
|---|---|---|
| B1 | `mongodump` of `whatsapp_event_template_map` + `whatsapp_template_variable_map` to `/tmp/cr015_pre_t2_backup_<UTC-iso>/` before any T2 write | Owner may opt for full DB dump or no backup |
| B2 | Live test = Option-A (synthetic POS order to `/api/pos/orders` for R689, watch full trace, against template 25140) | Owner may add other tenants/templates |
| B3 | Sequence: **T1 → T5 → T3 → T6 → T7 → T4 → T2** | Owner may reorder; rationale in §6 |

---

## 3. File-level plan

### 3.1 Backend files touched

| File | Change | Track | LoC delta |
|---|---|---|---|
| `backend/core/whatsapp.py::get_template_config` (lines 380–405) | T1 — Coerce `template_id` to str at both query branches (event_template_map result + variable_map query) | T1 | +6 / −2 |
| `backend/core/whatsapp.py::_format_value` (lines 224–248) | T5 — Add `time` (HH:MM AM/PM) + `titlecase` formatters | T5 | +20 |
| `backend/core/whatsapp_variables.py` | T5 — Add 12 entries (see §4) + add `ORDER_EVENTS` keys to existing entries where missing | T5 | +200 |
| `backend/routers/pos.py:1462–1477` (send_bill trigger) | T3 — Replace ad-hoc dict with `build_order_event_context(order_data, customer, points_earned, …)` helper | T3 | +30 / −10 |
| `backend/routers/pos.py:1481–1492` (welcome_message trigger) | T4 — Pass `order_event_context` merged with welcome-specific keys | T4 | +5 |
| `backend/routers/pos.py:1497–1508` (tier_upgrade trigger) | T4 — Same pattern | T4 | +5 |
| `backend/routers/pos.py:2194` (payment.received) | T4 — Audit + enrich | T4 | +10 |
| `backend/routers/wallet.py:55,77` (wallet_credit/debit) | T4 — Enrich with wallet context | T4 | +10 |
| `backend/routers/auth.py:505,515` (reset_password, welcome_message) | T4 — Audit, enrich if needed | T4 | +5 |
| `backend/routers/coupons.py:258` (coupon_earned manual) | T4 — Enrich with coupon context fields | T4 | +5 |
| `backend/routers/points.py:133,155` (points_earned, bonus_points) | T4 — Audit + enrich | T4 | +5 |
| `backend/core/loyalty.py:456` (tier_upgrade) | T4 — Audit + enrich | T4 | +5 |
| `backend/core/loyalty_jobs.py:105,212,302,436,479` (5 daily cron events) | T4 — Audit + enrich event_data dict | T4 | +20 |
| `backend/services/feedback_service.py:59` (feedback_request) | T4 — Audit + enrich | T4 | +5 |
| `backend/core/whatsapp.py` (new helper) | T3 — Add `build_order_event_context(order_data, customer, …)` builder | T3 | +60 |
| `backend/routers/whatsapp.py` — admin variable-mapping endpoints | T6 — Add server-side validation: reject mapping value not in `VARIABLES_BY_KEY` | T6 | +25 |
| `backend/scripts/cr015_t2_normalize_template_ids.py` (NEW) | T2 — Idempotent script with `--dry-run`, `--commit`, `--backup-path`. Coerces all `template_id` fields in both collections to str. | T2 | +120 |
| `backend/scripts/cr015_t7_cleanup_r689_template_25140.py` (NEW) | T7 — Fix R689's 3 bad mappings ({{4}}, {{5}}, {{7}}) for template 25140 with `--dry-run`/`--commit` | T7 | +60 |
| `backend/scripts/cr015_audit_unknown_var_keys.py` (NEW, support tool) | Audit — scan all `whatsapp_template_variable_map.mappings` across tenants, report unknown keys. Read-only. | T7 | +50 |
| `backend/tests/test_cr015_resolver.py` (NEW) | Unit tests — type-agnostic lookup, missing-key paths, formatter edge cases | tests | +200 |
| `backend/tests/test_cr015_event_context.py` (NEW) | Unit tests — `build_order_event_context` populates all 40+ fields | tests | +120 |

### 3.2 Frontend files touched

| File | Change | Track | LoC delta |
|---|---|---|---|
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` OR variable-mapping subcomponent (TBD on inspection — see §7) | T6 — Replace free-text input with `Select` (Radix `Select`) sourcing from `/api/whatsapp/variables` registry endpoint. Block save with inline error if any mapping value not in list. Show existing free-text values as warning chip "Invalid — please pick from list" but do NOT auto-discard. | T6 | +120 / −40 |
| `frontend/src/lib/api.js` or service module | T6 — Add `/api/whatsapp/variables` fetch if not already present (registry is server-of-truth). | T6 | +15 |

### 3.3 Files NOT touched (explicit)

- ❌ `backend/.env`, `frontend/.env` (no env changes)
- ❌ `backend/models/schemas.py::AUTOMATION_EVENTS` (CR-016 territory)
- ❌ Meta-approved template bodies (no Meta re-approval cycle)
- ❌ Any historical `whatsapp_message_logs` rows (no backfill, CR-004 rule)
- ❌ `field_aliases` legacy shim in `whatsapp.py` (out of scope per §4 discovery)

---

## 4. Registry additions (T5)

### 4.1 Twelve new entries

All entries follow existing schema. `event` sources listed in priority order; first non-empty wins. Added to `backend/core/whatsapp_variables.py`.

| key | label | category | sources (priority) | formatter | fills_on_events |
|---|---|---|---|---|---|
| `payment_method` | Payment Method | order | `event.payment_method` | `titlecase` | `ORDER_EVENTS` |
| `order_date` | Order Date | order | `event.order_created_at`, `event.order_date` | `date` | `ORDER_EVENTS` |
| `order_time` | Order Time | order | `event.order_created_at`, `event.order_time` | `time` | `ORDER_EVENTS` |
| `restaurant_order_id` | Bill Number | order | `event.restaurant_order_id`, `event.pos_order_id`, `event.order_id` | `none` | `ORDER_EVENTS` |
| `transaction_id` | Transaction ID | order | `event.transaction_id` | `none` | `ORDER_EVENTS` + `["wallet_credit","wallet_debit"]` |
| `table_id` | Table Number | order | `event.table_id`, `event.table_no` | `none` | `ORDER_EVENTS` |
| `waiter_name` | Waiter Name | order | `event.employee_name`, `event.waiter_name` | `none` | `ORDER_EVENTS` |
| `order_type` | Order Type | order | `event.order_type` | `titlecase` | `ORDER_EVENTS` |
| `loyalty_points_used` | Loyalty Points Used | loyalty | `event.loyalty_points_used`, `event.points_redeemed` | `integer` | `ORDER_EVENTS + ["points_redeemed"]` |
| `loyalty_discount` | Loyalty Discount | loyalty | `event.loyalty_discount` | `currency` | `ORDER_EVENTS` |
| `wallet_used` | Wallet Used | wallet | `event.wallet_used`, `event.amount` | `currency` | `ORDER_EVENTS + ["wallet_debit"]` |
| `tax_amount` | Tax Amount | order | `event.tax_amount`, `event.gst_tax` | `currency` | `ORDER_EVENTS` |
| `item_count` | Item Count | order | `event.item_count` (derived in §4.3) | `integer` | `ORDER_EVENTS` |
| `order_notes` | Order Notes | order | `event.order_notes` | `none` | `ORDER_EVENTS` |

> Note: that's **14 entries** in the table — discovery doc said 12. `loyalty_points_used` and `wallet_used` were marked "missing as a variable" in §3 of discovery; I've broken them out separately. Owner: keep at 14 or fold any back to 12? Default: ship all 14 (still single PR per Q8).

### 4.2 Two new formatters (`backend/core/whatsapp.py::_format_value`)

```python
# Inside _format_value(value, formatter):

if formatter == "time":
    from datetime import datetime as dt
    try:
        if isinstance(value, str):
            d = dt.fromisoformat(value.replace("Z", "+00:00"))
            return d.strftime("%I:%M %p").lstrip("0")  # e.g. "7:45 PM"
        return str(value)
    except (ValueError, TypeError):
        return str(value)

if formatter == "titlecase":
    s = str(value).strip().replace("_", " ").replace("-", " ")
    return s.title().replace(" ", "-") if "_" in str(value) or "-" in str(value) else s.title()
    # "dine_in"  → "Dine-In"
    # "takeaway" → "Takeaway"
    # "DINE_IN"  → "Dine-In"
```

Owner: confirm `titlecase` output style ("Dine-In" hyphen-joined for compound; plain Title-Case for single word). Alternative is always-spaced ("Dine In") — call out preference if different.

### 4.3 Derived field — `item_count`

Computed inside `build_order_event_context` (T3) — `len(order_data.items or [])`. Not from POS payload directly.

---

## 5. Code design — key new constructs

### 5.1 T1 — Resolver hardening (`get_template_config`)

```python
async def get_template_config(db, user_id, event_key):
    event_map = await db.whatsapp_event_template_map.find_one(
        {"user_id": user_id, "event_key": event_key}, {"_id": 0}
    )
    if not event_map or not event_map.get("is_enabled", True):
        return None

    template_id = event_map.get("template_id")
    if template_id is None:
        return None

    # CR-015 T1: coerce to str — resolver is type-agnostic until T2 normalization runs
    template_id_str = str(template_id)

    var_map = await db.whatsapp_template_variable_map.find_one(
        {
            "user_id": user_id,
            "$or": [
                {"template_id": template_id_str},
                {"template_id": template_id},  # legacy int rows
            ],
        },
        {"_id": 0},
    )

    return {
        "template_id": template_id_str,           # canonical str downstream
        "template_name": event_map.get("template_name", ""),
        "is_enabled": event_map.get("is_enabled", True),
        "variable_mappings": var_map.get("mappings", {}) if var_map else {},
        "variable_modes": var_map.get("modes", {}) if var_map else {},
    }
```

Defensive — fixes Bug #1 immediately. T2 makes the `$or` dead code; we'll remove the int branch in a v2 cleanup CR after canonical-str migration is verified.

### 5.2 T3 — `build_order_event_context(order_data, customer, points_earned, new_points, wallet_used, new_wallet_balance, …)` (new helper in `backend/core/whatsapp.py`)

Returns a flat dict of ~50 keys covering: every field on `POSOrderWebhook`, derived `item_count`, the loyalty/wallet/coupon outcomes already computed in the POS handler, plus the CR-004 P3.5 idempotency/reference fields. Idempotency_key is overridden per event by the caller (e.g. `f"{order_id}_send_bill"`).

```python
def build_order_event_context(
    order_data,            # POSOrderWebhook
    customer,              # already-updated customer dict
    *,
    points_earned: int,
    new_points: int,
    wallet_used: float,
    new_wallet_balance: float,
    crm_loyalty_points_redeemed: int = 0,
    crm_loyalty_discount: float = 0,
    coupon: dict | None = None,
    extra: dict | None = None,
) -> dict:
    ctx = {
        # — POS payload passthrough (40 fields, only non-None) —
        "order_id": order_data.order_id,
        "pos_order_id": order_data.order_id,
        "restaurant_order_id": getattr(order_data, "restaurant_order_id", None) or order_data.order_id,
        "order_amount": order_data.order_amount,
        "order_sub_total_amount": getattr(order_data, "order_sub_total_amount", None),
        "order_discount": getattr(order_data, "order_discount", None),
        "tax_amount": getattr(order_data, "tax_amount", None),
        "gst_tax": getattr(order_data, "gst_tax", None),
        "payment_method": getattr(order_data, "payment_method", None),
        "payment_status": getattr(order_data, "payment_status", None),
        "transaction_id": getattr(order_data, "transaction_id", None),
        "order_type": getattr(order_data, "order_type", None),
        "table_id": getattr(order_data, "table_id", None),
        "employee_name": getattr(order_data, "employee_name", None),
        "waiter_name": getattr(order_data, "employee_name", None) or getattr(order_data, "waiter_name", None),
        "order_created_at": getattr(order_data, "order_created_at", None),
        "order_notes": getattr(order_data, "order_notes", None),
        "delivery_charge": getattr(order_data, "delivery_charge", None),
        "tip_amount": getattr(order_data, "tip_amount", None),
        # — derived —
        "item_count": len(getattr(order_data, "items", None) or []),
        # — loyalty / wallet outcomes (already computed in caller) —
        "points_earned": points_earned,
        "points_balance": new_points,
        "wallet_used": wallet_used,
        "wallet_balance": new_wallet_balance,
        "loyalty_points_used": crm_loyalty_points_redeemed,
        "loyalty_discount": crm_loyalty_discount,
        # — coupon (if applied) —
        "coupon_code": (coupon or {}).get("code"),
        "coupon_title": (coupon or {}).get("title"),
        "coupon_discount": (coupon or {}).get("discount"),
    }
    if extra:
        ctx.update(extra)
    # Strip None values to prevent overwriting registry-source fallbacks
    return {k: v for k, v in ctx.items() if v is not None}
```

Caller (each `trigger_whatsapp_event` site in `routers/pos.py`):

```python
order_ctx = build_order_event_context(
    order_data, updated_customer,
    points_earned=points_earned, new_points=new_points,
    wallet_used=wallet_used, new_wallet_balance=new_wallet_balance,
    crm_loyalty_points_redeemed=crm_loyalty_points_redeemed,
    crm_loyalty_discount=crm_loyalty_discount,
    coupon=applied_coupon_dict,
)

# send_bill
asyncio.create_task(trigger_whatsapp_event(
    db, user["id"], "send_bill", updated_customer,
    {**order_ctx, "idempotency_key": f"{order_data.order_id}_send_bill",
     "reference_type": "order", "reference_id": order_id}
))
```

### 5.3 T2 — DB normalization script

`backend/scripts/cr015_t2_normalize_template_ids.py`

Behaviour:
1. `--dry-run` (default): scan both collections, print summary `N rows with int template_id in event_template_map`, `M rows with int template_id in variable_map`. Print per-row `(_id, template_id, type)` for first 20 of each.
2. `--commit`: requires `--backup-path /tmp/cr015_pre_t2_backup_<iso>/`; writes `mongodump` of the two collections there first, then runs `update_many` to coerce `template_id` to str. Logs every `_id` updated to stdout + writes audit JSON to `--backup-path/audit.json`.
3. Re-runnable safely (idempotent — no-op on already-str rows).
4. Exits non-zero if backup-path already exists or `mongodump` not available.

Owner approval gate: agent MUST present `--dry-run` output to owner and wait for explicit "commit" instruction.

### 5.4 T4 — 15 callsite audit table

| # | File:line | Event | Today | Action |
|---|---|---|---|---|
| 1 | `routers/pos.py:1462` | `send_bill` | 10 keys | Replace with `order_ctx` (T3) |
| 2 | `routers/pos.py:1481` | `welcome_message` | 3 order keys | Merge `order_ctx` + `first_visit_bonus` |
| 3 | `routers/pos.py:1497` | `tier_upgrade` | 3 keys | Merge `order_ctx` + `old_tier`/`new_tier` |
| 4 | `routers/pos.py:2194` | (payment_received) | unknown | Audit + add `transaction_id`, `payment_method` minimum |
| 5 | `routers/points.py:133` | `points_earned` (manual) | TBD | Audit + add txn fields |
| 6 | `routers/points.py:155` | `bonus_points` | TBD | Audit + add reason/source |
| 7 | `routers/wallet.py:55` | `wallet_credit` | amount/balance | Add `transaction_id`, `wallet_used` semantics check |
| 8 | `routers/wallet.py:77` | `wallet_debit` | amount/balance | Same |
| 9 | `routers/auth.py:505` | `reset_password` | OTP | Keep minimal (OTP only); no order context |
| 10 | `routers/auth.py:515` | `welcome_message` (non-order) | customer ctx | Keep customer-only |
| 11 | `routers/coupons.py:258` | `coupon_earned` (manual) | coupon doc | Add coupon ctx fields per registry |
| 12 | `services/feedback_service.py:59` | `feedback_request` | customer + order | Add `restaurant_order_id`, `order_date` |
| 13 | `core/loyalty.py:456` | `tier_upgrade` (non-POS path) | tier fields | Add tier fields only; no order |
| 14 | `core/loyalty_jobs.py:105` | `birthday` (daily) | bonus_points | Already minimal; add brand-only context |
| 15 | `core/loyalty_jobs.py:212` | `anniversary` (daily) | bonus_points | Same |
| 16 | `core/loyalty_jobs.py:302` | `points_expiring` (daily) | expiring_points, days | Already adequate; verify |
| 17 | `core/loyalty_jobs.py:436` | `inactive_customer` (daily) | days_inactive | Already adequate; verify |
| 18 | `core/loyalty_jobs.py:479` | `coupon_expiring` (daily) | coupon ctx | Verify all coupon fields present |

> 18 sites, not 15 — discovery doc undercounted by 3. Owner: still in-scope under Q5 (audit ALL). Effort estimate stands (~1 day for T4 — most cron sites need only verification, not refactor).

### 5.5 T6 — Admin UI guard

**Server side** (`backend/routers/whatsapp.py` — variable-mapping save endpoint, currently free-text):

```python
from core.whatsapp_variables import VARIABLES_BY_KEY

def _validate_mapping_payload(mappings: dict) -> list[str]:
    errors = []
    for slot, var_key in mappings.items():
        if not slot.startswith("{{") or not slot.endswith("}}"):
            errors.append(f"Invalid slot key: {slot}")
            continue
        if not isinstance(var_key, str) or not var_key.strip():
            errors.append(f"{slot}: variable cannot be empty")
            continue
        clean_key = var_key.strip()
        if clean_key not in VARIABLES_BY_KEY:
            errors.append(f"{slot}: unknown variable '{var_key}' — must be one of {sorted(VARIABLES_BY_KEY.keys())[:5]}...")
    return errors
```

Returns 422 with `{"errors": [...]}` on failure.

**Client side** (frontend variable-mapping form): replace `<Input type="text">` per `{{N}}` slot with `<Select>` of options from `/api/whatsapp/variables` (already exists per CR-004 P2.5). Disable Save when any slot has empty or invalid selection. Existing free-text values shown as `<Select>` with badge "⚠ Invalid — pick from list".

Loading of existing mapping doc: if a value isn't in registry, show it as the selected value with a red border + tooltip "Invalid — choose a valid variable". Owner must re-pick before Save un-disables.

### 5.6 T7 — R689 template 25140 cleanup script

Fixed mapping (proposed, owner can adjust before --commit):

| Slot | Current | Proposed |
|---|---|---|
| {{1}} | `customer_name` | unchanged |
| {{2}} | `amount` | unchanged |
| {{3}} | `order_id` | unchanged |
| {{4}} | `"payment method missing "` | **`payment_method`** |
| {{5}} | `"order dare missing "` | **`order_date`** |
| {{6}} | `points_earned` | unchanged |
| {{7}} | `points_earned` (dup) | **`points_balance`** |

Script: `--dry-run` prints proposed change; `--commit` writes after backup. Owner approves the slot-4/5/7 corrections before --commit.

---

## 6. Work sequence (B3, default)

```
Day 1   ──  T1 resolver hardening (~10 LoC + tests)
            T5 registry: 14 entries + 2 formatters (~220 LoC + tests)
            Live smoke: probe R689 send_bill in DB; confirm var_map now finds rows

Day 2   ──  T3 build_order_event_context helper + POS callsite (~90 LoC + tests)
            Smoke: live POS order at preview against R689; confirm event_data has all keys via log instrumentation

Day 3   ──  T6 server-side validation (~25 LoC + tests)
            T6 client-side dropdown + invalid-warning UX (~135 LoC)
            Smoke: existing R689 garbage values flagged in UI; new mapping save blocked on bad key

Day 4   ──  T7 R689 cleanup script — dry-run, owner review, commit
            T4 callsite audit pass — refactor 17 remaining sites (~70 LoC across files)

Day 5   ──  T2 normalization script — dry-run, owner review, mongodump, commit
            Remove `$or` legacy int branch in resolver (post-T2 cleanup)

Day 6   ──  Live test (Option A) for end-to-end: synthetic POS Rs.1850 order at R689 → all 7 slots populated correctly in delivered WhatsApp
            QA report at qa/CR_015_LIVE_TEST_REPORT.md
            Update dashboard + register → cr015_closed_live_test_passed
```

Total: 6 working days (matches discovery's 6-7 dev-day estimate).

**Rationale for ordering**:
- T1 first → unblocks current production sends *defensively* with one safe change. Lowest risk, highest immediate value.
- T5 next → registry is purely additive; doesn't impact production until events forward the new fields.
- T3 third → with T1 + T5 in place, T3's expanded event_data starts populating slots immediately (no UI work needed for that). End of Day 2 the "Test, Test, Test" bug is dead.
- T6 fourth → with the resolver + registry honest, NOW lock the UI so operators can re-map without poisoning the DB.
- T7 fifth → owner self-serves cleanup via fixed UI, OR runs script. Either works because Day 4 has T6 live.
- T4 sixth → audit the remaining 17 callsites for parity. Lower risk because T3 pattern is proven on POS.
- T2 last → DB-wide normalization is the riskiest write. Wait until all reader paths are type-agnostic so a partial migration cannot break anything.

---

## 7. Open implementation questions (small, won't block sign-off)

These I'll resolve during implementation. Flagging now for transparency:

| # | Question | Plan |
|---|---|---|
| I1 | What is the exact React component path holding the variable-mapping form today? | Inspect `WhatsAppAutomationContent.jsx` + any modal/dialog children; will pin path in implementation closeout doc. |
| I2 | Does `/api/whatsapp/variables` already exist for the frontend to fetch the registry? | If yes, reuse; if no, add a `GET` returning `[{key, label, category, example, description}]`. Pin in closeout. |
| I3 | Does `POSOrderWebhook` actually carry `restaurant_order_id`, `order_created_at`, `payment_method`, `transaction_id`, `order_type`, `table_id`, `employee_name`, `order_notes` as declared fields, or are they passthrough on a dict? | Read `models/schemas.py::POSOrderWebhook`; will adjust `build_order_event_context` accordingly. If any are not first-class, will accept via `**extra` from the model dump. |
| I4 | Existing `field_aliases` legacy shim — does it interfere with any of the 12 new keys? | Read once during T5; if collision, scope a tiny rename. |
| I5 | Does the admin "test send" UX in `WhatsAppAutomationContent.jsx` synthesize fake event_data? | If yes, ensure it synthesizes ALL the new context keys too so test sends preview correctly. |

---

## 8. API contracts (no breaking changes)

| Endpoint | Change |
|---|---|
| `GET /api/whatsapp/variables` (if exists) | Response gains 14 new entries. Backward-compatible — clients reading by key are unaffected. |
| `POST/PUT /api/whatsapp/template-variable-map` (T6 server validation) | Response shape unchanged on success. On invalid var_key returns `422 {"errors": [...]}`. Breaking only for clients posting garbage today — that's by design. |
| `POST /api/pos/orders` | Unchanged — same contract, more fields propagated downstream. |
| `trigger_whatsapp_event(...)` Python signature | Unchanged. `event_data` is dict; expansion is purely a content change. |

---

## 9. Test plan

### 9.1 Unit tests (new)

`backend/tests/test_cr015_resolver.py` — 14 tests:
- int template_id resolves via $or branch
- str template_id resolves
- missing template_id returns None
- disabled event returns None
- variable_mapping respects user_id scope (no cross-tenant leak)
- formatter `time` round-trip (ISO → HH:MM AM/PM, edge: midnight, noon, missing TZ)
- formatter `titlecase` (`dine_in`, `take_away`, `DELIVERY`, plain word, empty)
- resolve_variable picks first non-empty source
- resolve_variable returns "" for empty event/customer/brand
- registry coverage: every key in WHATSAPP_VARIABLES has at least one source + formatter slot

`backend/tests/test_cr015_event_context.py` — 8 tests:
- `build_order_event_context` includes all 25+ keys from minimal POSOrderWebhook
- None-stripping behaviour (no `payment_method=None` polluting downstream)
- `item_count` derived correctly (0, 1, N)
- coupon dict folds in when provided
- `extra` overrides take precedence
- works with dict-style order_data (compatibility)
- doesn't fail on missing optional fields

`backend/tests/test_cr015_admin_validation.py` — 6 tests:
- valid mappings save (200)
- unknown var_key rejected (422)
- empty value rejected
- whitespace-only value rejected
- invalid slot key (`{1}` vs `{{1}}`) rejected
- mixed valid/invalid returns all errors

### 9.2 Smoke probes (live, between phases)

- **After T1**: `python -c` probe — `get_template_config(db, "pos_0001_restaurant_689", "send_bill")` returns non-empty `variable_mappings`.
- **After T3**: log-instrument the `send_bill` trigger; fire synthetic order; assert `event_data` has all 25+ context keys.
- **After T6**: open admin UI → mapping form → try save with old garbage → see inline error.

### 9.3 Live integration test (Option A — owner-confirmed)

Mirrors CR-004 P3.5 approach. Single test scenario:

| Step | Action | Pass criteria |
|---|---|---|
| 1 | POST synthetic order to `{preview}/api/pos/orders` for R689, `cust_mobile=7505242126`, `order_amount=1850`, `payment_method=UPI`, `order_type=dine_in`, `table_id=T5`, `restaurant_order_id=KM-1234` | 200 response, order persisted, points calc fires |
| 2 | Watch backend logs for `send_bill` trigger | Trigger fires, `event_data` keys count ≥ 25 |
| 3 | Inspect `whatsapp_message_logs` row for this order | `body_values` populated for ALL slots `{{1}}` through `{{7}}` of template 25140; no empty values |
| 4 | Inspect AuthKey send response | `LogID` returned; status `pending` |
| 5 | Wait for delivery callback | `pending → delivered → read` lifecycle visible in `whatsapp_callback_logs` |
| 6 | Open WhatsApp on test phone | Message body shows real values: customer name, Rs.1850.00, order date, UPI, points earned, points balance |
| 7 | Place a second order with `order_amount=500`, `coupon_code=WELCOME10` | `coupon_code` and `coupon_discount` populated in body_values; arrives with coupon-aware content |

QA report template at `qa/CR_015_LIVE_TEST_REPORT.md` (to be created at QA phase).

### 9.4 Regression checks (existing tests)

Run the existing 65 passing WhatsApp tests under `backend/tests/test_whatsapp_*.py`. All must still pass. Any new fail → triage before merge.

---

## 10. Risk register (updated from discovery)

| Risk | P | Impact | Mitigation locked here |
|---|---|---|---|
| T2 normalization writes corrupt mappings | Low | High | `mongodump` backup + dry-run + owner approval per Q2 default |
| T3 expanded event_data confuses downstream consumers expecting old shape | Low | Med | Strip-None pattern + additive-only; resolver only reads keys it knows |
| T1 `$or` query slower under load | Low | Low | Two indexed lookups; both collections small (one row per template per tenant). Index already on `(user_id, template_id)`. |
| T6 UI break for tenants mid-edit | Med | Med | Existing free-text values render as warnings, not auto-discarded. Save blocked only on submit. |
| Owner skips T2 → resolver lives on `$or` forever | Low | Low | Document tech debt in closeout; revisit in next sprint |
| `titlecase` formatter mangles edge case (e.g. all-caps "UPI") | Low | Low | Unit-test all known order_type values + add owner-confirmed mapping override if needed |
| Synthetic live-test message lands in spam | Low | Low | Same test phone as CR-004 P3.5 (7505242126) which proven to receive |
| Daily-cron events under T4 audit reveal undertruncation that needs more registry work | Med | Low | Out-of-scope deferral — register as CR-015b |
| AuthKey webhook still pointing at old pod | Low | High | Owner confirmed rotation 2026-05-29 to `a28cb9e3-…` — verify by triggering one test send before sprint Day 1 |

---

## 11. Definition of done (locked)

1. **T1** lands and unit tests pass; live R689 probe shows `variable_mappings` non-empty for `send_bill`.
2. **T5** lands; 14 new entries + 2 new formatters; unit tests pass; backward-compatible.
3. **T3** lands; live POS order against R689 trace shows all `order_ctx` keys present in `event_data`.
4. **T6** server-side rejects bad var_keys (422); client-side dropdown enforces selection.
5. **T7** R689 template 25140 mapping cleaned to all-valid keys.
6. **T4** all 18 trigger callsites verified or refactored.
7. **T2** `mongodump` taken; both collections normalized to str `template_id`; `$or` legacy branch removed from resolver.
8. Live integration test (§9.3) passes — Rs.1850 order → WhatsApp arrives with all 7 slots populated correctly + `delivered`/`read` callbacks.
9. Coupon-applied order (§9.3 step 7) renders coupon variables correctly.
10. QA report at `qa/CR_015_LIVE_TEST_REPORT.md` with acceptance matrix.
11. Dashboard row 16 status → `cr015_closed_live_test_passed`.
12. Register row updated.
13. PRD.md §11 line updated.

---

## 12. Out of scope (re-confirmed from discovery)

- Renaming any existing variable key
- Removing legacy `field_aliases` shim
- Editing Meta-approved template bodies
- Backfilling historical `whatsapp_message_logs`
- Per-tenant custom variables
- Conditional / computed variables
- Multi-language variable values
- CR-014 e-invoice fields
- Re-sending historical failed messages
- CR-016 dynamic event registry

---

## 13. Sign-off checklist for owner

Before code lands, owner please confirm:

- [ ] **§2 locked decisions** (Q1–Q8 + B1–B3) — accept as listed, or amend specific items
- [ ] **§4.1 entry count** — ship 14 (proposed) or trim to original 12
- [ ] **§4.2 titlecase output style** — "Dine-In" (hyphen) preferred?
- [ ] **§5.6 R689 slot-4/5/7 corrections** — `payment_method` / `order_date` / `points_balance` confirmed?
- [ ] **§6 work sequence** — T1 → T5 → T3 → T6 → T7 → T4 → T2 OK, or reorder?
- [ ] **§9.3 live test scenario** — Rs.1850 UPI dine-in + Rs.500 coupon order at test phone 7505242126 OK?
- [ ] **AuthKey webhook** — confirmed pointing at `a28cb9e3-…` for callback verification in §9.3
- [ ] **B1 backup target** — `/tmp/cr015_pre_t2_backup_<UTC-iso>/` acceptable, or different path?

Once any open box answered "go", I start Day 1 (T1 + T5).

---

## 14. Lifecycle status update on approval

When owner says "Plan approved" → this doc's status becomes `cr015_planning_phase_1_approved_implementation_authorized` → I create the implementation closeout shell at `implementation/CR_015_VARIABLE_MAPPING_FIDELITY_CLOSEOUT.md` and begin Day 1.

Dashboard row 16 status: `cr015_planning_phase_1_approved` (until first commit lands).

---

**End of Phase 1 Plan. Awaiting owner sign-off on §13 checklist.**
