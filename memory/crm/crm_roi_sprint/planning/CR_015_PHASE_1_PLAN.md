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
| 1 Planning | **🟡 v1.1 — code-audited; awaiting owner sign-off** |
| 2 Implementation | not started |
| 3 QA + Live Test | not started |

**Sign-off gate**: owner must approve §3 (locked decisions), §6 (work sequence), §11 (live test) before any code is written.

**v1.1 change log (2026-05-29)**: Plan re-audited against actual code. Discovery doc had several inaccuracies (file paths, function names, line numbers, frontend state). Corrections marked **[v1.1 FACT]** throughout.

---

## 1. Recap (one paragraph, v1.1 corrected)

The variable-mapping subsystem renders WhatsApp slots as literal template defaults ("Test") whenever the resolver fails to load mappings. The root cause is a **`template_id` type mismatch** in `whatsapp_event_template_map` (some rows store `int`, others `str`) while `whatsapp_template_variable_map` always stores `str` (verified — the save endpoint at `routers/whatsapp.py:601` writes the path parameter, always a str). When the int-vs-str mismatch hits, the resolver returns `variable_mappings={}` and `variable_modes={}` → every slot resolves to `""` → AuthKey renders the template's literal defaults. Layered on top: (a) only a small subset of POS fields is forwarded into `event_data`, blocking many registry resolutions even when the mapping is correct, and (b) the registry lacks 12–14 fields that Indian bill templates need (`payment_method`, `order_date`, etc.). The fix is a defensive resolver, a giant `order_event_context` passed to every trigger, registry expansion, optional admin-UI hardening, R689 data cleanup, and a one-time DB normalization.

**[v1.1 FACT — refined Bug #2 framing]**: The admin UI is NOT free-text in "Map to Field" mode. The variable-mapping modal (`WhatsAppAutomationContent.jsx:1650-1684`) already uses a `<Select>` sourcing from `/api/whatsapp/variables`. The garbage values discovered on R689 template 25140 (`"payment method missing "`, `"order dare missing "`) were saved in **"Custom Text" mode** (`modes: {"{{4}}": "text", "{{5}}": "text"}` per the discovery evidence). In that mode the operator typed notes-to-self meaning "the source field for this is missing, please add later" — those literal strings will be sent to customers verbatim once Bug #1 is fixed unless cleaned up. So T6 (admin UI hardening) is less about blocking unknown var_keys (Select already enforces that) and more about (i) warning the operator that text-mode values are sent literally, and (ii) detecting/flagging legacy garbage on load. T7 (R689 cleanup) becomes more important — those slots need to be switched from text mode → map mode with the right var_key.

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

## 3. File-level plan (v1.1 — all line numbers verified against current `/app`)

### 3.0 Audit summary

| Claim from Discovery | v1.1 Verified status |
|---|---|
| `get_template_config` is the resolver function | **WRONG**. Actual name is `get_event_template_config` (`backend/core/whatsapp.py:373`). |
| Variable-map endpoint is free-text | **WRONG**. UI uses a `<Select>` (`WhatsAppAutomationContent.jsx:1650-1684`); free-text only in "text" mode. |
| `/api/whatsapp/variables` endpoint may not exist | **EXISTS** (`routers/whatsapp.py:43`). Returns `{"variables": WHATSAPP_VARIABLES}`. |
| `POSOrderWebhook` lives in `models/schemas.py` | **WRONG**. Lives in `routers/pos.py:1116`. All 40+ fields are first-class Pydantic — no `**extra` needed. |
| 15 trigger callsites | **18 actual** (3 more than counted): also `points.py:144`, `wallet.py:67`, `wallet.py:89` via `trigger_points_earned_event`, plus `core/whatsapp.py:562, 748` internal wrappers (not user-facing). |
| `loyalty_jobs.py` lines `105/212/302/436/479` | Mostly accurate but lines 436/479 swapped (436 = coupon_expiring loop, 479 = inactive_customer). |
| Server-side validation rejects unknown var_key | **NOT IMPLEMENTED**. Endpoint at `routers/whatsapp.py:601-655` validates only `coupon_pick` format; map-mode values are stored as-is. |
| Bug #2 = "admin UI accepts free-text" | **PARTIAL**. UI's Map-mode is Select. Bug #2 garbage was saved via **Custom Text mode** as notes-to-self. |
| Bug #1 type-mismatch causes empty body_values | **CONFIRMED**. `build_body_values` (`whatsapp.py:313`) returns `""` when `mapped_field=""`; empty bodyValues → AuthKey renders template defaults. |

### 3.1 Backend files touched

| File | Function / Region | Track | Change | LoC Δ |
|---|---|---|---|---|
| `backend/core/whatsapp.py` | `get_event_template_config` (lines 373–405) | T1 | Coerce `template_id` to str in query: `$or: [{template_id: str(tid)}, {template_id: tid}]`. Return canonical str in `config["template_id"]`. | +8 / −2 |
| `backend/core/whatsapp.py` | `_format_value` (lines 224–248) | T5 | Add `time`, `titlecase` formatters | +20 |
| `backend/core/whatsapp.py` | new helper `build_order_event_context(...)` after line 310 | T3 | New ~60-line builder for POS-derived event_data. See §5.2. | +60 |
| `backend/core/whatsapp_variables.py` | end of `WHATSAPP_VARIABLES` list (around line 340) | T5 | Add 14 new entries (see §4.1). Optionally add `ORDER_EVENTS` to existing entries that should fill on `send_bill` but currently don't. | +220 |
| `backend/routers/pos.py` | `pos_order_webhook` (lines 1462–1508) — 3 triggers | T3 | Build `order_ctx` once; pass to all 3 triggers with event-specific idempotency_key + extras merged. | +25 / −18 |
| `backend/routers/pos.py` | `pos_event_webhook` (lines 2180–2196) — generic event trigger | T4 | Audit — already merges `event_data.event_data` from POS. Add `payment_method`, `transaction_id` defaults if missing in payload. | +6 |
| `backend/routers/wallet.py` | wallet_credit/wallet_debit triggers (lines 55, 77) | T4 | Add `transaction_id` (= `tx_id`), `payment_method` (= `tx_data.payment_method`), `wallet_used` semantic for debit. Already has amount + balance. | +6 |
| `backend/routers/points.py` | bonus_points + tier_upgrade (lines 133, 155) | T4 | Add `bill_amount`, `description` from `tx_data`. Tier_upgrade already minimal — verify. | +5 |
| `backend/routers/auth.py` | reset_password (line 515) | T4 | Already minimal (OTP only). No order context to add. **Keep as-is**; only audit. | 0 |
| `backend/routers/coupons.py` | coupon_earned manual (line 258) | T4 | Already has coupon_code/title/discount/expiry. Add `discount_value` formatter alignment — verify. | +2 |
| `backend/core/loyalty.py` | points_redeemed (line 456) | T4 | Add `order_id`, `redeemed_value` formatted. | +3 |
| `backend/core/loyalty_jobs.py` | birthday/anniversary/expiring/coupon_expiring/inactive (lines 105, 212, 302, 436, 479) | T4 | Audit — birthday/anniversary minimal but adequate. coupon_expiring already has coupon ctx. inactive_customer has customer-only — adequate. **Verify only, no refactor.** | +0 / verify |
| `backend/services/feedback_service.py` | feedback_request (line 59) | T4 | **No order context available at this callsite** — fed only customer + rating + feedback_id. Adequate; no enrichment possible without DB join. **Keep as-is.** | 0 |
| `backend/routers/whatsapp.py` | `save_template_variable_mapping` (lines 601–655) | T6 | Add server-side check: for each `(slot, value)` where `mode != "text" AND mode != "coupon_pick"`, reject if `value` not in `VARIABLES_BY_KEY` and not in `{"", "none"}`. Returns 422 with `errors[]`. | +25 |
| `backend/scripts/cr015_t2_normalize_template_ids.py` | NEW | T2 | `--dry-run`/`--commit`/`--backup-path` script; mongodumps both collections, then coerces template_id to str via update_many. | +120 |
| `backend/scripts/cr015_t7_cleanup_r689_template_25140.py` | NEW | T7 | Fix 3 slots: {{4}} text→map var=payment_method, {{5}} text→map var=order_date, {{7}} duplicate→points_balance. Removes corresponding `modes` entries. | +60 |
| `backend/scripts/cr015_audit_unknown_var_keys.py` | NEW (support tool) | T7 | Read-only scan of all `whatsapp_template_variable_map.mappings` across tenants — flag unknown var_keys grouped by (tenant, template, mode). | +50 |
| `backend/tests/test_cr015_resolver.py` | NEW | tests | 14 unit tests for type-agnostic lookup, formatter edge cases (see §9.1) | +200 |
| `backend/tests/test_cr015_event_context.py` | NEW | tests | 8 unit tests for `build_order_event_context` | +120 |
| `backend/tests/test_cr015_admin_validation.py` | NEW | tests | 6 unit tests for T6 validation | +120 |

### 3.2 Frontend files touched

| File | Region | Track | Change | LoC Δ |
|---|---|---|---|---|
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | save handler (lines 674–705) | T6 | Surface server 422 errors inline next to the offending `{{N}}` row instead of generic toast. Use `availableVariables` to render error message like "Unknown variable 'foo' — pick from list". | +35 |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | variable mapping modal open (lines 653–672) | T6 | On modal open, detect legacy garbage: any text-mode value with non-empty content + matches typo heuristics like `(missing|none|todo)` or trailing whitespace → render warning chip "⚠ Looks like a placeholder — please pick a variable or remove" above the row. | +25 |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | Custom Text mode input (around line 1640) | T6 | Add inline hint: "This text will be sent to the customer literally. Pick 'Map to Field' if you want dynamic value." | +5 |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | `availableVariables` consumption | T6 | Existing — auto picks up the 14 new registry entries via existing `/whatsapp/variables` fetch. **No client change for registry expansion.** | 0 |

### 3.3 Files NOT touched (explicit)

- ❌ `backend/.env`, `frontend/.env`
- ❌ `backend/models/schemas.py` — `AUTOMATION_EVENTS` lists, `POSOrderWebhook` (latter lives in `routers/pos.py`, no schema change needed)
- ❌ Meta-approved template bodies
- ❌ Historical `whatsapp_message_logs` rows (no backfill)
- ❌ `field_aliases` legacy shim in `whatsapp.py` — confirmed not in current file; the legacy `_check_event_data_for_coupon_field`/`_format_coupon_field` helpers stay (coupon_pick mode depends on them)
- ❌ `trigger_whatsapp_event` signature (`whatsapp.py:541`) — additive event_data only
- ❌ Frontend route map, sidebar, top-level App.js

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

## 5. Code design — key new constructs (v1.1 — verified)

### 5.1 T1 — Resolver hardening (`get_event_template_config`)

**[v1.1 FACT]** Function is `get_event_template_config` (not `get_template_config`). Lives at `backend/core/whatsapp.py:373`. Save endpoint (`routers/whatsapp.py:644-655`) writes `template_id` from path parameter — always str. Mismatch is caused only by `whatsapp_event_template_map` rows, where some legacy save path stored int.

```python
async def get_event_template_config(db, user_id: str, event_key: str) -> Optional[Dict]:
    event_map = await db.whatsapp_event_template_map.find_one(
        {"user_id": user_id, "event_key": event_key}, {"_id": 0}
    )
    if not event_map or not event_map.get("is_enabled", True):
        return None

    template_id = event_map.get("template_id")
    if template_id is None:
        return None

    # CR-015 T1: type-agnostic lookup — variable_map always stores str (verified
    # via routers/whatsapp.py:644-655), event_map may store int from legacy
    # save path. Coerce + $or until T2 normalization runs.
    template_id_str = str(template_id)
    template_id_query = (
        {"template_id": template_id_str}
        if template_id_str == str(template_id)
        else {"template_id": template_id}
    )

    var_map = await db.whatsapp_template_variable_map.find_one(
        {"user_id": user_id, "template_id": template_id_str}, {"_id": 0}
    )
    # Defensive fallback in case any legacy var_map row stored as int.
    if var_map is None and isinstance(template_id, int):
        var_map = await db.whatsapp_template_variable_map.find_one(
            {"user_id": user_id, "template_id": template_id}, {"_id": 0}
        )

    return {
        "template_id": template_id_str,    # canonical str downstream
        "template_name": event_map.get("template_name", ""),
        "is_enabled": event_map.get("is_enabled", True),
        "variable_mappings": var_map.get("mappings", {}) if var_map else {},
        "variable_modes": var_map.get("modes", {}) if var_map else {},
    }
```

Defensive — fixes Bug #1 immediately. T2 makes the fallback dead code; we'll remove the int branch in a v2 cleanup CR after T2 commits.

### 5.2 T3 — `build_order_event_context(...)` helper (new in `backend/core/whatsapp.py`)

**[v1.1 FACT]** `POSOrderWebhook` is defined at `backend/routers/pos.py:1116`. All these are first-class declared fields with proper types and defaults (verified):

| Field | Type | Default |
|---|---|---|
| `order_id` | `str` | required |
| `restaurant_order_id` | `Optional[str]` | `None` |
| `order_amount` | `float` | required (alias `orderAmount`/`order_total`) |
| `order_sub_total_amount` | `Optional[float]` | `None` |
| `coupon_code` / `coupon_discount` / `coupon_title` / `coupon_type` | str/float/str/str | nullable / 0 |
| `wallet_used` | `float` | 0 |
| `tax_amount` / `gst_tax` / `vat_tax` / `service_tax` / `service_gst_tax_amount` | `float` | 0 |
| `tip_amount` / `delivery_charge` / `round_up` | `float` | 0 |
| `payment_method` / `payment_status` / `payment_type` / `transaction_id` | `Optional[str]` | `None` |
| `order_status` / `order_type` / `table_id` / `waiter_id` / `employee_id` / `employee_name` | `Optional[str]` | `None` (order_type default `"pos"`) |
| `order_created_at` / `order_updated_at` | `Optional[str]` | `None` (accepts `created_at` alias) |
| `order_notes` | `Optional[str]` | `None` |
| `items` | `Optional[List[OrderItem]]` | `None` |
| `loyalty_points_used` | `Optional[int]` | `None` |
| `loyalty_discount` | `Optional[float]` | `None` |
| `room_info` | `Optional[RoomInfo]` | `None` |

So `build_order_event_context` uses attribute access on the Pydantic model — no `**extra` needed:

```python
def build_order_event_context(
    order_data,            # POSOrderWebhook (Pydantic; routers/pos.py:1116)
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
    items = list(order_data.items or [])
    ctx = {
        # POS passthrough
        "order_id": order_data.order_id,
        "pos_order_id": order_data.order_id,
        "restaurant_order_id": order_data.restaurant_order_id or order_data.order_id,
        "order_amount": order_data.order_amount,
        "order_sub_total_amount": order_data.order_sub_total_amount,
        "order_discount": order_data.order_discount,
        "self_discount": order_data.self_discount,
        "tax_amount": order_data.tax_amount,
        "gst_tax": order_data.gst_tax,
        "vat_tax": order_data.vat_tax,
        "service_tax": order_data.service_tax,
        "tip_amount": order_data.tip_amount,
        "delivery_charge": order_data.delivery_charge,
        "round_up": order_data.round_up,
        "payment_method": order_data.payment_method,
        "payment_status": order_data.payment_status,
        "payment_type": order_data.payment_type,
        "transaction_id": order_data.transaction_id,
        "order_status": order_data.order_status,
        "order_type": order_data.order_type,
        "table_id": order_data.table_id,
        "employee_id": order_data.employee_id,
        "employee_name": order_data.employee_name,
        "waiter_name": order_data.employee_name,  # alias for template designers
        "order_created_at": order_data.order_created_at,
        "order_date": order_data.order_created_at,     # registry source alias
        "order_time": order_data.order_created_at,     # registry source alias
        "order_notes": order_data.order_notes,
        # Derived
        "item_count": len(items),
        # Loyalty/wallet outcomes (caller-supplied)
        "points_earned": points_earned,
        "points_balance": new_points,
        "wallet_used": wallet_used if wallet_used else order_data.wallet_used,
        "wallet_balance": new_wallet_balance,
        "loyalty_points_used": crm_loyalty_points_redeemed or order_data.loyalty_points_used,
        "loyalty_discount": crm_loyalty_discount or order_data.loyalty_discount,
        # Coupon (passthrough from POS payload OR caller override)
        "coupon_code": (coupon or {}).get("code") or order_data.coupon_code,
        "coupon_title": (coupon or {}).get("title") or order_data.coupon_title,
        "coupon_discount": (coupon or {}).get("discount") or order_data.coupon_discount,
        "coupon_type": order_data.coupon_type,
    }
    if extra:
        ctx.update(extra)
    # Strip None/empty-string values so registry source-chain fallbacks work
    return {k: v for k, v in ctx.items() if v not in (None, "")}
```

**Caller (verified — `routers/pos.py:1462-1508`)**:

```python
order_ctx = build_order_event_context(
    order_data, updated_customer,
    points_earned=points_earned, new_points=new_points,
    wallet_used=wallet_used, new_wallet_balance=new_wallet_balance,
    crm_loyalty_points_redeemed=crm_loyalty_points_redeemed,
    crm_loyalty_discount=crm_loyalty_discount,
)

# send_bill (line 1462)
asyncio.create_task(trigger_whatsapp_event(
    db, user["id"], "send_bill", updated_customer,
    {**order_ctx,
     "idempotency_key": f"{order_data.order_id}_send_bill",
     "reference_type": "order", "reference_id": order_id}
))

# welcome_message (line 1481) — only if is_new
if is_new:
    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "welcome_message", updated_customer,
        {**order_ctx,
         "first_visit_bonus": first_visit_bonus,
         "idempotency_key": f"{updated_customer.get('id')}_welcome",
         "reference_type": "customer",
         "reference_id": updated_customer.get("id")}
    ))

# tier_upgrade (line 1497)
if new_tier != old_tier and _tier_rank_pos(new_tier) > _tier_rank_pos(old_tier):
    asyncio.create_task(trigger_whatsapp_event(
        db, user["id"], "tier_upgrade", updated_customer,
        {**order_ctx,
         "old_tier": old_tier, "new_tier": new_tier,
         "idempotency_key": f"{updated_customer.get('id')}_tier_{new_tier}",
         "reference_type": "customer",
         "reference_id": updated_customer.get("id")}
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

### 5.4 T4 — 18 callsite audit table (v1.1 — verified)

| # | File:line | Event_key | Today's event_data keys | T4 action |
|---|---|---|---|---|
| 1 | `routers/pos.py:1462` | `send_bill` | order_id, pos_order_id, order_amount, points_earned, points_balance, wallet_used, wallet_balance, idempotency_key, reference_* | **Refactor**: replace with `**order_ctx` + idempotency + reference. ~25 new keys flow. |
| 2 | `routers/pos.py:1481` | `welcome_message` | first_visit_bonus, order_amount, points_balance, idempotency_key, reference_* | **Refactor**: `**order_ctx` + first_visit_bonus. |
| 3 | `routers/pos.py:1497` | `tier_upgrade` | old_tier, new_tier, points_balance, idempotency_key, reference_* | **Refactor**: `**order_ctx` + tier fields. |
| 4 | `routers/pos.py:2194` | (POS pushes its own `event_type`) | order_id, pos_order_id, restaurant_name, idempotency_key, reference_*, **+POS-supplied event_data dict** | **Audit only** — generic POS event passthrough already merges `event_data.event_data`. Defaults for `payment_method`/`transaction_id` if missing in payload would require schema change — skip. |
| 5 | `routers/points.py:133` | `bonus_points` | bonus_points, points_balance, idempotency_key, reference_* | **Minor**: add `bill_amount` (from `tx_data.bill_amount`), `description`. |
| 6 | `routers/points.py:144` | (via `trigger_points_earned_event` wrapper) | helper-managed | **Audit only** — wrapper not in 15-callsite list; semantically correct. |
| 7 | `routers/points.py:155` | `tier_upgrade` (non-POS path) | old_tier, new_tier, points_balance, idempotency_key, reference_* | **Minor**: already adequate for non-POS path. No order context to add. |
| 8 | `routers/wallet.py:55` | `wallet_credit` | amount, wallet_balance, idempotency_key, reference_* | **Minor**: add `payment_method` (from `tx_data.payment_method`), `transaction_id` (= `tx_id`), `description`. |
| 9 | `routers/wallet.py:67` | (via `trigger_points_earned_event` wrapper) | helper-managed | **Audit only**. |
| 10 | `routers/wallet.py:77` | `wallet_debit` | amount, wallet_balance, idempotency_key, reference_* | **Minor**: same as wallet_credit. `wallet_used = amount` semantic. |
| 11 | `routers/wallet.py:89` | (via `trigger_points_earned_event` wrapper) | helper-managed | **Audit only**. |
| 12 | `routers/auth.py:515` | `reset_password` | otp, restaurant_name, reference_* | **No change** — OTP-only context; no order. |
| 13 | `routers/coupons.py:258` | `coupon_earned` (manual) | coupon_code, discount, coupon_discount, discount_type, discount_value, coupon_title, coupon_expiry, idempotency_key, reference_* | **No change** — already complete for coupon context. |
| 14 | `services/feedback_service.py:59` | `feedback_request` | rating, feedback_message, feedback_id, idempotency_key, reference_* | **No change** — no order link available at this callsite without DB join; would need separate CR. |
| 15 | `core/loyalty.py:456` | `points_redeemed` | points_redeemed, points_balance, redeemed_value, idempotency_key, reference_* | **Minor**: add `order_id` (already in scope), `order_total`. |
| 16 | `core/loyalty_jobs.py:105` | `birthday` (daily cron) | birthday_bonus, points_balance, idempotency_key, reference_* | **No change** — adequate for greeting context. |
| 17 | `core/loyalty_jobs.py:212` | `anniversary` (daily cron) | anniversary_bonus, points_balance, idempotency_key, reference_* | **No change** — adequate. |
| 18 | `core/loyalty_jobs.py:302` | `points_expiring` (daily cron) | expiring_points, expiry_date, points_balance, idempotency_key, reference_* | **No change** — adequate. |
| 19 | `core/loyalty_jobs.py:436` | `coupon_expiring` (daily cron) | coupon_code, coupon_title, coupon_discount, coupon_expiry, idempotency_key, reference_* | **No change** — adequate. |
| 20 | `core/loyalty_jobs.py:479` | `inactive_customer` (daily cron) | customer_name, points_balance, tier, total_visits, idempotency_key, reference_* | **No change** — adequate. |

**Net T4 work** (v1.1): 3 refactor callsites in `pos.py` (covered by T3), 3 minor enrichments (`points.py:133`, `wallet.py:55,77`, `loyalty.py:456`), rest audit-only. **Effort revises down from 1 day → 0.5 day**.

### 5.5 T6 — Admin UI hardening (v1.1 — scope refined)

**[v1.1 FACT]** The "Map to Field" mode already uses a `<Select>` (`WhatsAppAutomationContent.jsx:1650-1684`) sourcing from `availableVariables` (the `/whatsapp/variables` registry response). So **a free-text vs Select replacement is NOT needed**. The actual problem is:

1. **Custom Text mode** lets operators type literal strings that go straight to customers. The R689 garbage (`"payment method missing "`) was typed in Custom Text mode, not Map mode.
2. **Server-side validation is absent** — `routers/whatsapp.py:601-655` only validates `coupon_pick` format. Map-mode and text-mode values pass through unchecked.
3. **Legacy garbage on load** — when modal opens for a template with old text-mode garbage, no warning is shown.

**Backend change** (`backend/routers/whatsapp.py` — extend `save_template_variable_mapping`):

```python
from core.whatsapp_variables import VARIABLES_BY_KEY

# Inside save_template_variable_mapping, AFTER coupon_pick block, BEFORE the update_one:
errors = []
for placeholder, mapped_value in clean_mappings.items():
    mode = modes.get(placeholder, "map")
    if mode == "coupon_pick":
        continue  # already validated above
    if mode == "text":
        # Operator confirmation that "text" is intentional — value sent literally.
        # Heuristic flag for likely-garbage; non-blocking, returned as warning.
        if any(token in (mapped_value or "").lower() for token in ("missing", "todo", "tbd", "n/a")) \
                or (mapped_value or "").strip() != (mapped_value or ""):
            warnings.append({
                "placeholder": placeholder,
                "type": "text_mode_suspicious_value",
                "message": f"{placeholder}: '{mapped_value}' looks like a placeholder note — will be sent to customer literally"
            })
        continue
    # mode == "map" (default) — value MUST be a registry key
    clean_key = (mapped_value or "").strip()
    if clean_key in ("", "none"):
        continue  # explicit no-mapping, allowed
    if clean_key not in VARIABLES_BY_KEY:
        errors.append({
            "placeholder": placeholder,
            "type": "unknown_variable",
            "message": f"{placeholder}: unknown variable '{mapped_value}'"
        })

if errors:
    raise HTTPException(status_code=422, detail={"errors": errors})
```

Warnings array (built in P2 block already) gains `text_mode_suspicious_value` warnings to surface to operator.

**Frontend change** (`WhatsAppAutomationContent.jsx`):

1. **Save handler** (`handleSaveVariableMapping` lines 674-705): catch 422 with `detail.errors[]` → set per-row error state. Render below each `{{N}}` row in red.
2. **Modal-open handler** (`openVariableMappingModal` lines 653-672): after loading existing mappings, scan for text-mode garbage heuristic. Set a `suspiciousMappings` state. Render warning chip above the row.
3. **Custom Text mode input area** (around line 1640): add `<p className="text-xs text-gray-500 mt-1">This text will be sent to customers exactly as typed. Use "Map to Field" for dynamic values.</p>`

No new Radix components introduced — uses existing `<Select>` / `<Input>` / `<Badge>`.

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

## 6. Work sequence (v1.1 — refined effort)

```
Day 1   ──  T1 resolver hardening — get_event_template_config defensive lookup (~10 LoC + 14 unit tests)
            T5 registry: 14 entries + 2 formatters added to whatsapp_variables.py / whatsapp.py (~220 LoC + 10 unit tests)
            Smoke probe: live `get_event_template_config(db, "pos_0001_restaurant_689", "send_bill")` in python REPL → returns non-empty `variable_mappings`

Day 2   ──  T3 build_order_event_context helper in core/whatsapp.py + refactor pos.py:1462/1481/1497 callsites (~90 LoC + 8 unit tests)
            Smoke: synthetic POS order to preview, instrument trigger to log event_data keys → expect ≥ 25 keys present

Day 3   ──  T6 server-side 422 validation in routers/whatsapp.py:601 (~25 LoC + 6 unit tests)
            T6 frontend save-handler 422 surfacing + text-mode garbage warning chip (~65 LoC)
            T7 dry-run + commit R689 template 25140 cleanup (with owner approval gate)
            T4 minor enrichments: wallet.py:55/77, points.py:133, loyalty.py:456 (~12 LoC total)

Day 4   ──  T2 mongodump + dry-run + owner-approved commit (normalize template_id to str)
            Post-T2: remove fallback int-branch in get_event_template_config
            T7 audit script run across all tenants — report unknown var_keys (read-only)

Day 5   ──  Live integration test (Option A) — Rs.1850 UPI dine-in synthetic order at R689 against template 25140 → assert all 7 slots populated
            Second synthetic order with coupon code → assert coupon_code/discount populated
            QA report at qa/CR_015_LIVE_TEST_REPORT.md
            Update dashboard + register → cr015_closed_live_test_passed
```

**Total: 5 working days** (revised from 6 in v1.0 — T4 scope shrank after audit; rest of cron callsites already adequate).

**Rationale unchanged**: T1 first (defensive), T5 next (additive), T3 third (unblocks send_bill rendering by EOD2), T6+T7+T4 minor enrichments grouped on Day 3, T2 normalization isolated on Day 4 (riskiest write).

---

## 7. Implementation questions — RESOLVED in v1.1 (no remaining unknowns)

| # | Question | Status / Resolution |
|---|---|---|
| I1 | Exact React component path for variable-mapping form? | **RESOLVED**: `frontend/src/components/shared/WhatsAppAutomationContent.jsx` — modal lines 1429-1715. No separate component to factor out. |
| I2 | Does `/api/whatsapp/variables` already exist? | **RESOLVED**: Yes — `routers/whatsapp.py:43`. Frontend already consumes it (`WhatsAppAutomationContent.jsx:504`). No new endpoint needed. |
| I3 | Does `POSOrderWebhook` carry all the declared fields, or `**extra` passthrough? | **RESOLVED**: All required fields are first-class Pydantic — see §5.2 table. No `**extra` needed. Lives in `routers/pos.py:1116`, not `models/schemas.py`. |
| I4 | Does `field_aliases` legacy shim interfere? | **RESOLVED**: No such shim in current `whatsapp.py`. Legacy `_check_event_data_for_coupon_field` + `_format_coupon_field` (lines 286-310) are coupon_pick-only and stay untouched. |
| I5 | Does admin "test send" UX synthesize event_data? | **RESOLVED**: `TestTemplateModal` (lines 18-220) uses `availableVariables.find(v => v.key === mappedField)` — pulls examples from registry. T5 entries' `example` fields will appear automatically. No T5 code change needed in the modal; verify in regression. |

All v1.1 corrections are reflected in §3.1 (file table), §5.1 (resolver), §5.2 (POSOrderWebhook fields), §5.4 (callsite audit), §5.5 (UI scope refined).

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

## 13. Sign-off checklist for owner (v1.1)

Before code lands, owner please confirm:

- [ ] **§2 locked decisions** (Q1–Q8 + B1–B3) — accept as listed, or amend specific items
- [ ] **§3.0 audit findings** — accepted (discovery doc inaccuracies overridden by v1.1 facts)
- [ ] **§4.1 entry count** — ship 14 (proposed) or trim to original 12
- [ ] **§4.2 titlecase output style** — "Dine-In" (hyphen-joined for compound, plain Title-Case for single word)?
- [ ] **§5.5 T6 scope refined** — server-side 422 + frontend warning chip + Custom-Text hint (no `<Select>` replacement needed; UI is already correct). Agree?
- [ ] **§5.6 R689 slot-4/5/7 corrections** — `payment_method` / `order_date` / `points_balance` (was duplicate of `points_earned`); slots 4 + 5 also switch from text mode → map mode. Confirmed?
- [ ] **§6 work sequence (5 days)** — T1+T5 → T3 → T6+T7+T4-minor → T2 → live test. OK, or reorder?
- [ ] **§9.3 live test scenario** — Rs.1850 UPI dine-in + Rs.500 coupon order at test phone 7505242126 OK?
- [ ] **AuthKey webhook** — confirmed pointing at `a28cb9e3-…` for callback verification
- [ ] **B1 backup target** — `/tmp/cr015_pre_t2_backup_<UTC-iso>/` acceptable, or different path?

Once any open box answered "go", I start Day 1 (T1 + T5).

---

## 14. Lifecycle status update on approval

When owner says "Plan approved" → this doc's status becomes `cr015_planning_phase_1_approved_implementation_authorized` → I create the implementation closeout shell at `implementation/CR_015_VARIABLE_MAPPING_FIDELITY_CLOSEOUT.md` and begin Day 1.

Dashboard row 16 status: `cr015_planning_phase_1_approved` (until first commit lands).

---

**End of Phase 1 Plan. Awaiting owner sign-off on §13 checklist.**
