# CR-015 — WhatsApp Template Variable Mapping End-to-End Fidelity — Discovery (Phase 0)

**Sprint**: ROI Measurement / CRM
**CR code**: CR-015
**Lifecycle stage**: `cr015_discovery_phase_0_parked_pending_planning_signoff`
**Date**: 2026-05-28 (post CR-004 P3.5 closure live test)
**Tenant context**: bug surfaced on R689 Kunafa Mahal, but the issue is **system-wide**, affects every tenant, every template, every event trigger.
**Trigger event**: Live test of CR-004 P3.5 succeeded end-to-end on delivery tracking — but the WhatsApp message rendered with literal **"Test"** placeholder text in 7 slots, exposing a stack of variable-mapping bugs that this CR is scoped to fix.
**Linked CRs**:
- CR-004 (parent — provides template + send infrastructure; this CR fixes the variable plumbing)
- CR-014 (downstream — e-invoice link needs reliable variable resolution to ship)

---

## 1. Problem statement

The WhatsApp template variable mapping subsystem has **3 independent stacked defects** that, together, cause every templated message slot to render as the template's default literal text (e.g. "Test") instead of real customer/order data.

The defects span **three layers**:

```
Layer 1 — POS payload arrives at /api/pos/orders (40+ rich fields)
              │
              │   ↓ Bug #3: only 7 of 40 fields forwarded into event_data
              │
Layer 2 — trigger_whatsapp_event(event_data={...truncated subset...})
              │
              │   ↓ Bug #1: resolver query mismatches template_id type (int vs str)
              │           → variable_mappings = {} → body_values = {}
              │
              │   ↓ Bug #2 (latent, surfaces after Bug #1 fix):
              │           data-quality holes in whatsapp_template_variable_map
              │           (mapping values are free-text and contain invalid keys + typos)
              │
Layer 3 — AuthKey gets bodyValues={} → renders literal "Test" template defaults
              │
              ▼
Customer sees: "Namaste Test, We have received your payment of Rs Test for Test via Test on Test..."
```

This CR scopes a holistic fix across all three layers — resolver, registry, and event-data forwarding — applicable to **every event trigger**, not just `send_bill`.

---

## 2. Defects in detail (evidence from live trace, no code edits)

### Bug #1 — Resolver fails on `template_id` type mismatch

**Location**: `backend/core/whatsapp.py:394` (`get_template_config`)

**Code today**:
```python
var_map = await db.whatsapp_template_variable_map.find_one(
    {"user_id": user_id, "template_id": template_id},  # template_id type-dependent
    {"_id": 0}
)
```

**Evidence (live DB probe on R689)**:

| Doc | Field | Type | Value |
|---|---|---|---|
| `whatsapp_event_template_map` (`send_bill` row) | `template_id` | **`int`** | `25140` |
| `whatsapp_event_template_map` (`send_bill_manual` row) | `template_id` | **`str`** | `'26508'` |
| `whatsapp_event_template_map` (`send_bill_auto` row) | `template_id` | **`str`** | `'26508'` |
| `whatsapp_template_variable_map` (template 24871 row) | `template_id` | **`str`** | `'24871'` |
| `whatsapp_template_variable_map` (template 25140 row) | `template_id` | **`str`** | `'25140'` |
| `whatsapp_template_variable_map` (template 26508 row) | `template_id` | **`str`** | `'26508'` |

→ `send_bill` (int) → lookup against `template_id="25140"` returns **None** → variable_mappings empty.
→ `send_bill_manual`/`send_bill_auto` (str) → lookup matches → mappings present.

**Reproduced**:
```python
find_one({"user_id": UID, "template_id": 25140})    # int   → None
find_one({"user_id": UID, "template_id": "25140"})  # str   → FOUND
```

**Impact**: any event trigger whose event_template_map row has `template_id` saved as int will silently render empty body_values. Type drift is per-row, not deterministic — depends on which save path created the row.

**Root cause hypothesis**: two different admin UI / migration code paths created event_template_map rows; one casts the input to int (e.g. via Pydantic int coercion or `int(value)`), the other keeps str. variable_map rows uniformly used str.

### Bug #2 — Data-quality holes in stored `whatsapp_template_variable_map.mappings`

**Location**: `whatsapp_template_variable_map` documents themselves.

**Evidence (R689 template 25140 — `loyality_points_collect_bill`)**:
```json
{
  "template_id": "25140",
  "user_id": "pos_0001_restaurant_689",
  "template_name": "loyality_points_collect_bill",
  "mappings": {
    "{{1}}": "customer_name",
    "{{2}}": "amount",
    "{{3}}": "order_id",
    "{{4}}": "payment method missing ",   // ← invalid var_key + trailing space + free-text note
    "{{5}}": "order dare missing ",       // ← invalid var_key + typo "dare" + trailing space
    "{{6}}": "points_earned",
    "{{7}}": "points_earned"              // ← duplicate of {{6}}; likely intended points_balance
  },
  "modes": {"{{4}}": "text", "{{5}}": "text"}
}
```

**Observations**:
1. Three of seven values are not valid WHATSAPP_VARIABLES keys (`"payment method missing "`, `"order dare missing "`, dup `points_earned`).
2. Admin UI clearly accepts free-text variable keys with no validation → operator-input garbage persists.
3. Trailing whitespace and natural-language placeholders ("missing") suggest the operator typed notes-to-self into the field instead of selecting a registry key.

**Impact**: even with Bug #1 fixed, slots {{4}}, {{5}}, {{7}} would render empty because `resolve_variable("payment method missing ")` finds no registry entry and returns `""`.

### Bug #3 — Event-data forwarding is severely truncated (system-wide)

**Location**: every callsite of `trigger_whatsapp_event(...)`. Most acute at `backend/routers/pos.py:1462`.

**POS contract (per owner's documented sample 2026-05-28) — 40+ fields**:
```
pos_id, restaurant_id, restaurant_name, order_id, restaurant_order_id,
cust_mobile, cust_name, cust_email,
order_amount, order_sub_total_amount, order_discount, self_discount,
coupon_code, coupon_discount, coupon_title, coupon_type,
loyalty_points_used, loyalty_discount, loyalty_idempotency_key,
wallet_used,
tax_amount, gst_tax, vat_tax, service_tax, service_gst_tax_amount,
tip_amount, tip_tax_amount, delivery_charge, round_up,
payment_method, payment_status, payment_type, transaction_id,
order_status, order_type, table_id, waiter_id, employee_id, employee_name,
order_created_at, order_updated_at, order_notes,
items[] (with item_name, qty, price, gst_amount, addons, variants, is_veg, etc.)
```

**Currently forwarded to `send_bill` trigger (only 10 fields)**:
```python
{
    "order_id": order_id,
    "pos_order_id": order_data.order_id,
    "order_amount": order_data.order_amount,
    "points_earned": points_earned,
    "points_balance": new_points,
    "wallet_used": wallet_used,
    "wallet_balance": new_wallet_balance,
    "idempotency_key": ...,
    "reference_type": "order",
    "reference_id": ...,
}
```

**~30 of 40 POS fields are DROPPED at the trigger callsite**, including the very ones the operator clearly intended for slots {{4}} and {{5}} of template 25140 (`payment_method`, `order_created_at`).

**Same problem applies to other trigger callsites in `routers/pos.py`, `routers/customers.py`, scheduled jobs, etc.** — most pass a small ad-hoc dict instead of a structured "order context" object.

---

## 3. Layer 3 — registry coverage gap (downstream of Bug #3)

Even when the trigger DOES forward a field, the registry must have a matching variable entry. Today:

| Field needed for typical bill template | In `WHATSAPP_VARIABLES`? | Forwarded by `send_bill` trigger? |
|---|---|---|
| `customer_name` | ✅ | (from customer doc — n/a) |
| `restaurant_name` | ✅ | (from brand doc — n/a) |
| `amount` (order_amount) | ✅ | ✅ |
| `order_id` | ✅ | ✅ |
| `points_earned` | ✅ | ✅ |
| `points_balance` | ✅ | ✅ |
| `wallet_balance` | ✅ | ✅ |
| `coupon_code` | ✅ | ❌ |
| `coupon_title` | ✅ | ❌ |
| `coupon_discount` | ✅ | ❌ |
| `einvoice_link` (CR-014) | ✅ | ❌ (until CR-014 ships) |
| `payment_method` | ❌ **MISSING** | ❌ |
| `order_date` / `order_created_at` | ❌ **MISSING** | ❌ |
| `restaurant_order_id` (bill number on receipt) | ❌ **MISSING** | ❌ |
| `transaction_id` | ❌ **MISSING** | ❌ |
| `table_id` / table number | ❌ **MISSING** | ❌ |
| `waiter_name` / `employee_name` | ❌ **MISSING** | ❌ |
| `order_type` (dine-in / takeaway / delivery) | ❌ **MISSING** | ❌ |
| `loyalty_points_used` | ❌ **MISSING** | ❌ |
| `loyalty_discount` | ❌ **MISSING** | ❌ |
| `wallet_used` | ❌ **MISSING** (as a variable) | ✅ |
| `tax_amount` | ❌ **MISSING** | ❌ |
| `item_count` (derived) | ❌ **MISSING** | ❌ |
| `order_notes` | ❌ **MISSING** | ❌ |

12 registry entries to add to match common bill-template variable needs.

---

## 4. Scope of this CR

### In scope

| Track | Description |
|---|---|
| T1 | **Resolver hardening** — `get_template_config` lookup is type-agnostic; supports `template_id` as int or str transparently. Defensive change; backwards-compatible. |
| T2 | **One-time DB normalization** — script to migrate all `whatsapp_event_template_map.template_id` and `whatsapp_template_variable_map.template_id` to a single canonical type (string recommended, since AuthKey returns string IDs and admin UI usually saves strings). Idempotent. Logs every change. |
| T3 | **Event-data context expansion (POS)** — `routers/pos.py:1462` forwards full POS order context to `trigger_whatsapp_event` for `send_bill` (and other order-triggered events). Refactor to compute `order_event_context` once, pass it to every triggered event. |
| T4 | **Event-data context expansion (other callsites)** — audit `routers/customers.py`, `routers/loyalty.py`, scheduled jobs, payment-received webhook, etc. for same pattern; pass enriched context. |
| T5 | **Registry expansion** — add 12 new entries to `core/whatsapp_variables.py` (table below). |
| T6 | **Admin UI hardening (data quality)** — variable-mapping page dropdowns SHOULD list only valid WHATSAPP_VARIABLES keys; free-text input replaced with searchable select. Server-side validation rejects unknown keys + trims whitespace. |
| T7 | **One-time data cleanup script** — fix the 3 bad mappings already in `whatsapp_template_variable_map` for R689 template 25140 (owner approval before write). |

### Explicit non-scope

- ❌ Renaming any existing variable keys (breaking change)
- ❌ Removing legacy `field_aliases` shim (other code may depend)
- ❌ Editing Meta-approved template bodies (Meta re-approval cycle)
- ❌ Backfilling historical `whatsapp_message_logs.body_values` (no backfill rule from CR-004)
- ❌ Multi-language variable values
- ❌ CR-014 e-invoice fields (separate CR)
- ❌ Conditional/computed variables (e.g. "if delivery, show delivery_address, else show table_id") — register both, owner picks per template
- ❌ Re-sending historical failed messages

---

## 5. Proposed registry additions (T5 — 12 entries)

Schema same as existing entries: `key`, `description`, `example`, `sources[]`, optional `formatter`.

| key | sources (priority order) | formatter |
|---|---|---|
| `payment_method` | event.payment_method | (none — uppercase first letter?) |
| `order_date` | event.order_created_at, event.order_date | `date` (or new `datetime`) |
| `order_time` | event.order_created_at | `time` (new formatter) |
| `restaurant_order_id` | event.restaurant_order_id, event.pos_order_id, event.order_id | (none) |
| `transaction_id` | event.transaction_id | (none) |
| `table_id` | event.table_id, event.table_no | (none) |
| `waiter_name` | event.employee_name, event.waiter_name | (none) |
| `order_type` | event.order_type | `titlecase` (new) |
| `loyalty_points_used` | event.loyalty_points_used, event.points_redeemed | `integer` |
| `loyalty_discount` | event.loyalty_discount | `currency` |
| `wallet_used` | event.wallet_used | `currency` |
| `tax_amount` | event.tax_amount | `currency` |
| `item_count` | event.item_count | `integer` |
| `order_notes` | event.order_notes | (none) |

Possibly **2 new formatters** needed: `time` (HH:MM AM/PM), `titlecase` ("dine_in" → "Dine-In"). Existing formatters cover the rest.

---

## 6. Risk register

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| T2 DB normalization corrupts mappings | Low | High | Dry-run mode prints proposed changes; owner approves before commit; backup before run |
| T3 expanded event_data breaks downstream consumers | Low | Medium | event_data dict-shape is additive; existing keys unchanged; new keys ignored by old consumers |
| T1 resolver change accidentally matches wrong row across users | Very Low | High | Query still scoped by `user_id`; only `template_id` lookup is type-relaxed |
| T6 UI dropdown forces template re-mapping for all 14 tenants | Medium | Medium | Show existing free-text values as warnings, don't auto-discard; one-time cleanup script (T7) |
| Adding registry entries with conflicting source priorities | Low | Low | Code review + unit tests per entry |
| Admin saves a key absent from registry in future | Low | Medium | Server-side validation (T6) + automated test that walks all `whatsapp_template_variable_map.mappings` weekly and alerts on unknown keys |

---

## 7. Owner-only decisions needed before planning

| # | Question | Recommended default |
|---|---|---|
| Q1 | Canonical type for `template_id` across both collections: **str** or **int**? | **str** — matches AuthKey response (`LogID` is hex string), matches Meta template ID convention, lower risk for future integrations |
| Q2 | T7 cleanup of bad R689 mappings — change in DB directly, or push to admin who fixes via UI? | DB script with dry-run + owner approval; UI alternative is fragile if other tenants have same issue |
| Q3 | T3 expansion strategy — pass a giant `order_event_context` dict to every trigger, OR build per-event projections (only fields that event needs)? | Giant dict for v1 simplicity (additive, low risk); per-event projections in v2 if memory/clarity matters |
| Q4 | T6 admin UI — fully block save on unknown var_key OR allow with warning? | **Block save** with inline error "Unknown variable. Pick from list." Prevents future re-occurrence of bug #2. |
| Q5 | T4 scope — audit ALL trigger callsites this CR, or only POS callsites? | Audit ALL — single CR easier to QA than fragmented |
| Q6 | New formatter `titlecase` — apply to `order_type` values like "dine_in" → "Dine-In", or just pass through? | Title-case for readability |
| Q7 | Should `order_date` show date AND time, or separate variables? | Separate (`order_date` + `order_time`); composability for template designers |
| Q8 | Is it acceptable to add 12 registry entries in one PR, or split for safer rollout? | Single PR — pure additive, no removal, no rename |

---

## 8. Out of scope (future CRs)

| Item | Future CR |
|---|---|
| Per-tenant custom variables (e.g. tenant defines own variable `chef_special`) | Future enhancement |
| Variable type system (string vs number vs date) | Folds into v2 of registry |
| Conditional variables (`{{if delivery}}...`) | Meta-approved templates can't do this anyway |
| Template preview in admin UI | Separate UX CR |
| Variable usage analytics ("which tenants use `tier`?") | Analytics CR |
| AI-suggested mapping ("you mapped {{1}} to customer_name; we recommend {{2}} → amount") | Far future |

---

## 9. Effort estimate (rough, refined in planning)

| Track | LoC | Effort |
|---|---|---|
| T1 — Resolver hardening (`get_template_config`) | ~10 | 0.25 day |
| T2 — DB normalization script | ~80 | 0.5 day |
| T3 — POS callsite event_data expansion | ~40 | 0.5 day |
| T4 — Other callsites audit + fix | ~100 | 1 day |
| T5 — Registry expansion (12 entries + 2 formatters) | ~200 | 0.5 day |
| T6 — Admin UI variable-mapping dropdown + server validation | ~250 | 1.5 days |
| T7 — Data cleanup script (R689 specifically + audit for other tenants) | ~60 | 0.5 day |
| Unit tests | ~300 | 1 day |
| Docs (planning + impl + QA) | — | 1 day |

**Total**: ~6-7 dev-days for v1.

---

## 10. Definition of done

1. T1 + T2 land → live R689 send_bill produces non-empty `body_values` (slots 1, 2, 3, 6 populated; 4, 5, 7 still empty because of Bug #2 / Bug #3)
2. T3 + T5 land → owner re-maps template 25140 via T6 admin UI (or T7 script) → live R689 send_bill produces ALL 7 slots populated
3. WhatsApp received by abhi shows: `"Namaste Rahul, We have received your payment of Rs 1850.00 for KM-1234 via UPI on 25 May 2026. Loyalty Points Used: 200, Updated Loyalty Points Balance: <calc>"` (or equivalent based on actual template body)
4. All unit tests pass
5. Live test artifact at `qa/CR_015_VARIABLE_MAPPING_LIVE_TEST_REPORT.md`
6. Doc trail updated; register row 16 status `cr015_closed_live_test_passed`

---

## 11. Doc trail

- This file: `/app/memory/crm/crm_roi_sprint/discovery/CR_015_WHATSAPP_VARIABLE_MAPPING_FIDELITY_DISCOVERY.md`
- Register: row 16 to be added (CR-015)
- PRD §11 — to mention CR-015 alongside CR-014

---

## 12. CR-015 PARK status (2026-05-28 evening)

**Status code**: `cr015_discovery_phase_0_parked_pending_planning_signoff`

### What's documented
- 3-layer architecture of the bug (Layers 1-2-3)
- All 3 defects with reproducible DB-probe evidence
- Full POS contract reference (Layer 1)
- Trigger callsite leak analysis (Layer 2)
- Registry gap matrix (Layer 3)
- 7-track remediation plan (T1-T7)
- 12 new registry entries proposed
- 2 new formatters proposed
- Risk register
- 8 owner-only decisions with recommended defaults
- Effort estimate (~6-7 dev-days)

### What's blocking unpark
Owner answers to §7 questions Q1–Q8 (Q1 + Q3 + Q4 are the most consequential; rest can default).

### Resume signal
> "Resume CR-015" → re-read this doc, ask owner the §7 questions, then write `planning/CR_015_PHASE_1_PLAN.md`.

---

**End of Phase 0 Discovery. CR-015 PARKED.**
