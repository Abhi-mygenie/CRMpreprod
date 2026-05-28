# CR-016 — Dynamic Event Registry + Trigger Configuration UI — Discovery (Phase 0)

**Sprint**: ROI Measurement / CRM
**CR code**: CR-016
**Lifecycle stage**: `cr016_discovery_phase_0_parked_pending_planning_signoff`
**Date**: 2026-05-28 (evening, after CR-004 P3.5 closure)
**Linked CRs**:
- CR-015 (sibling — variable mapping fidelity; complementary, no functional dependency)
- CR-004 P3.5 (parent — provides event_template_map + trigger infrastructure)
- CR-014 (sibling — e-invoice link, independent)

---

## 1. Problem statement

Today the WhatsApp **event registry** and **trigger logic** are entirely hardcoded:

- **Event catalog** lives in `backend/models/schemas.py:1172-1207` as two Python lists (`POS_EVENTS`, `CRM_EVENTS`, 27 entries total). Adding a new event requires a backend code change + deploy.
- **Trigger logic** (when does an event fire?) is scattered across ~15 `trigger_whatsapp_event(event_key=...)` callsites in routers, services, and cron jobs. Editing a trigger condition requires a code change.

**Owner pain**: Tenants cannot:
- Add new event types (e.g. "VIP table reservation thank-you", "first-order milestone", "5th-visit gift")
- Edit when an existing event fires (e.g. "only fire send_bill for orders > Rs.500")
- Tune trigger conditions per-tenant (e.g. R689 wants `tier_upgrade` only on Gold+, but another tenant wants on every tier change)
- See what events are configured + what is mapped to what templates from a single UI

**Scope of this CR**: Move event registry + trigger configuration from code to data, surfaced through admin UI, while preserving existing system-signal hooks. Template-mapping flow remains unchanged (mapping is **optional at create-time**, can be added later like today).

---

## 2. Current state (evidence)

### 2.1 Hardcoded event registry — `backend/models/schemas.py`

```python
POS_EVENTS = [                    # 11 entries
    "new_order_customer", "new_order_outlet", "order_confirmed",
    "order_ready_customer", "item_ready", "order_served", "item_served",
    "order_ready_delivery", "order_dispatched",
    "send_bill_manual", "send_bill_auto",
]

CRM_EVENTS = [                    # 16 entries
    "reset_password", "welcome_message", "birthday", "anniversary",
    "points_earned", "points_expiring", "feedback_request",
    "send_bill", "tier_upgrade", "coupon_earned",
    "wallet_credit", "wallet_debit", "bonus_points", "points_redeemed",
    "coupon_expiring", "inactive_customer",
]
AUTOMATION_EVENTS = POS_EVENTS + CRM_EVENTS   # 27 total
```

### 2.2 Trigger callsites (hardcoded)

15 distinct `trigger_whatsapp_event(...)` callsites found:

| File:line | Event fired | When |
|---|---|---|
| `routers/pos.py:1462` | `send_bill` | POS order received |
| `routers/pos.py:1481` | `points_earned` / `bonus_points` | After points calc, conditional |
| `routers/pos.py:1497` | `coupon_earned` | When coupon auto-issued post-order |
| `routers/pos.py:2194` | (via webhook) | Payment received |
| `routers/wallet.py:55` | `wallet_credit` | Wallet top-up |
| `routers/wallet.py:77` | `wallet_debit` | Wallet spend |
| `routers/auth.py:505` | `reset_password` | OTP request |
| `routers/auth.py:515` | `welcome_message` | New customer registration |
| `routers/coupons.py:258` | `coupon_earned` | Manual coupon issue |
| `services/feedback_service.py:59` | `feedback_request` | Post-feedback scheduling |
| `core/loyalty.py:456` | `tier_upgrade` | Tier crossing |
| `core/loyalty_jobs.py:105` | `birthday` | Daily 00:00 UTC job |
| `core/loyalty_jobs.py:212` | `anniversary` | Daily 00:00 UTC job |
| `core/loyalty_jobs.py:302` | `points_expiring` | Daily 00:00 UTC job |
| `core/loyalty_jobs.py:436` | `inactive_customer` | Daily 00:00 UTC job |
| `core/loyalty_jobs.py:479` | `coupon_expiring` | Daily 00:00 UTC job |

These callsites are the **system-signal hooks** — they fire on real-world events the platform can detect. They will remain in code as "signal emitters"; what becomes data-driven is **which custom events listen for each signal + what condition filters them**.

### 2.3 Current event-template mapping (unchanged by this CR)

`whatsapp_event_template_map` already supports per-tenant overrides — owner UI lets each tenant map any event to any approved template, enable/disable, etc. This CR **does not change** that UI; it only adds an upstream UI for managing event definitions + trigger conditions.

---

## 3. Proposed model

### 3.1 New collection — `events` (per-tenant + global)

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | |
| `user_id` | str | tenant scope; `null` for global/built-in events |
| `event_key` | str | unique per `user_id`; auto-slugged from name (e.g. "Big Order Thanks" → `big_order_thanks`) |
| `display_name` | str | shown in UI |
| `description` | str | "Thank-you message for orders over Rs.1000" |
| `category` | enum | `pos` / `crm` / `custom` / `recurring` |
| `is_builtin` | bool | true for the 27 hardcoded events; UI shows as locked metadata |
| `is_enabled` | bool | tenant can toggle off |
| `source_signal` | enum | which system signal triggers this event (see §3.2) |
| `conditions` | array | filter list (see §3.3) |
| `cooldown_seconds` | int, optional | rate-limit per customer (e.g. don't send same event > 1×/day) |
| `available_variables` | array | which `WHATSAPP_VARIABLES` keys this event provides via its event_data (informs admin UI when mapping templates) |
| `created_at`, `updated_at`, `created_by` | | |

### 3.2 Source signals (predefined hooks)

A short, owner-curated list of "what the system can detect". User-defined events choose ONE of these to listen for. v1 list:

| Source signal | Emitter location (existing) | Real-time? | Event_data shape |
|---|---|---|---|
| `pos.order.received` | `routers/pos.py:1274` | yes | full POS payload |
| `pos.payment.received` | `routers/pos.py:2194` | yes | payment payload |
| `customer.registered` | `routers/auth.py:515` | yes | customer doc |
| `customer.tier_changed` | `core/loyalty.py:456` | yes | old_tier, new_tier, customer |
| `customer.points_earned` | `routers/pos.py:1481` | yes | points_earned, balance, customer |
| `customer.points_redeemed` | `core/loyalty.py` | yes | redeemed, balance, customer |
| `customer.wallet_credited` | `routers/wallet.py:55` | yes | amount, balance, customer |
| `customer.wallet_debited` | `routers/wallet.py:77` | yes | amount, balance, customer |
| `coupon.issued` | `routers/coupons.py:258` | yes | coupon, customer |
| `daily.birthday` | `core/loyalty_jobs.py:105` | cron | customers matching today |
| `daily.anniversary` | `core/loyalty_jobs.py:212` | cron | customers matching today |
| `daily.points_expiring_in_N_days` | `core/loyalty_jobs.py:302` | cron | customers + expiring points |
| `daily.coupons_expiring_in_N_days` | `core/loyalty_jobs.py:479` | cron | customers + coupons |
| `daily.inactive_customer` | `core/loyalty_jobs.py:436` | cron | customers inactive ≥ N days |
| `feedback.requested` | `services/feedback_service.py:59` | scheduled | customer + order |
| `auth.password_reset_requested` | `routers/auth.py:505` | yes | customer + OTP |

User-defined events **subscribe** to one of these signals + add filters. New signals require backend change (add emitter + register in this list).

### 3.3 Conditions (filter expressions)

Simple AND-list of field/operator/value tuples, evaluated against the source signal's event_data:

```json
"conditions": [
  {"field": "order_amount",    "op": "gte", "value": 1000},
  {"field": "customer.tier",   "op": "eq",  "value": "Gold"},
  {"field": "order_type",      "op": "in",  "value": ["dinein","takeaway"]}
]
```

Operators v1: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `not_in`, `contains`, `exists`. No OR / no nested logic in v1 — keep simple.

### 3.4 Per-tenant override of built-in events

Built-in events (the 27 hardcoded) are seeded as `is_builtin=true, user_id=null`. Tenant who wants to customize creates an override doc `is_builtin=false, user_id=<tenant>, event_key=<same as builtin>` — the resolver picks tenant doc first, falls back to builtin. Built-in event_key + display_name + source_signal are NOT editable by tenant (UI shows them as readonly); only `is_enabled`, `conditions`, `cooldown_seconds` are editable.

Tenant-only fields (no built-in counterpart) are fully editable.

### 3.5 New event dispatcher

Code change: every system-signal emitter calls a new `dispatch_signal(signal_key, event_data, user_id, customer_id)` instead of `trigger_whatsapp_event(event_key, ...)` directly. Dispatcher:
1. Loads all `events` rows where `source_signal == signal_key` (tenant + global)
2. Evaluates each event's `conditions` against `event_data`
3. For each matching enabled event:
   - Checks cooldown (lookback in `whatsapp_message_logs` for same `event_key + customer_id`)
   - Calls `trigger_whatsapp_event(event_key=event.event_key, event_data, user_id, ...)` (same downstream path as today)

Existing trigger_whatsapp_event signature unchanged → CR-015 work (variable resolution) drops in cleanly.

---

## 4. Admin UI changes

### 4.1 New page: **Events** (sidebar)

List view:
- Table of all events visible to this tenant (built-in + custom)
- Columns: Name, Event Key, Category, Source Signal, Conditions count, Mapped Template, Enabled toggle
- Filters: category, source signal, builtin/custom, enabled/disabled
- Actions per row: Edit, Duplicate, Map to template, Delete (custom only)

### 4.2 Create / Edit Event modal

Tabs:
1. **Basics** — display_name (text), event_key (auto-slug + editable for custom), description, category, cooldown_seconds, is_enabled
2. **Trigger** — source_signal (dropdown), conditions (key/op/value rows with + Add Condition)
3. **Variables** — multi-select from `WHATSAPP_VARIABLES` keys (what this event provides)
4. **Template** — optional: choose Meta-approved template + variable mapping (reuses existing variable-mapping UI from CR-015 / current admin). Skip for now is allowed.

### 4.3 Built-in event constraints in UI

For `is_builtin=true` rows:
- Name, key, source_signal greyed out (readonly)
- Conditions editable
- Description editable (tenant adds notes)
- Variables list readonly (built-in events have curated set)
- Cooldown editable
- Enable/Disable editable

---

## 5. Out of scope (this CR)

| Item | Reason | Future CR |
|---|---|---|
| OR / nested condition logic | Complexity gap; v1 covers 90% | CR-016b |
| Multi-channel events (SMS, email, push) | Single-channel WhatsApp only today | Future channel CRs |
| Event analytics (fire-count, success rate) | Read-side concern, separate dashboard | Future analytics CR |
| Webhook-based custom signals (tenant defines own webhook → custom signal) | Security + scoping needs careful design | CR-016c |
| Editing built-in event source_signal | Would break existing emitters | Never |
| Per-customer event mute/unsubscribe | Different abstraction; opt-out per channel | Future privacy CR |
| Custom variables (tenant defines own variables, not from registry) | CR-015 fixes registry; per-tenant vars later | CR-015b |

---

## 6. Risks

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| Migration of 27 built-in events to `events` collection drops/misfires WhatsApp in production | Low (preview-first) | High | One-time seed script with idempotency; staged rollout; dispatcher falls back to old direct-trigger if `events` collection empty for a signal |
| Condition evaluator allows injection (e.g. `field` containing dotted path traverses prototype) | Med | Med | Whitelist allowed field paths per source_signal; reject unknown paths |
| Cooldown lookup adds latency to every send | Low | Low | Index on `whatsapp_message_logs.(user_id, event_type, customer_id, created_at)`; lookback bounded (e.g. 30 days max) |
| Tenant creates infinite cascading events | Low | Med | Hard cap: ≤ 50 events per tenant, ≤ 10 conditions per event |
| Built-in events become out-of-sync with hardcoded callsites | Med | High | Tests that walk every `trigger_whatsapp_event` callsite + assert event_key exists as a builtin |
| Removing direct `trigger_whatsapp_event` calls breaks existing flows | Med | High | v1 keeps direct calls (additive); dispatcher complements rather than replaces; switch to dispatcher-only in v2 |

---

## 7. Owner-only decisions before planning

| # | Question | Recommended default |
|---|---|---|
| Q1 | Built-in events policy: locked metadata + editable conditions, OR fully editable (rename, change source_signal)? | **Locked metadata, editable conditions + cooldown + enable** (prevents tenant from breaking the link to system emitter) |
| Q2 | Event-key namespacing: per-tenant unique only, OR globally unique? | **Per-tenant unique** (tenant can call their custom event `big_order` even if another tenant uses same key) |
| Q3 | Custom event creation by tenant — allow free editing OR admin-of-admins approval? | **Free editing** — restaurant CRM is per-tenant SaaS, owner is sole admin |
| Q4 | v1 condition operator set | `eq, neq, gt, gte, lt, lte, in, not_in, contains, exists` (10 ops). Owner: keep / trim? |
| Q5 | Cooldown: per-customer or per-tenant? | **Per-customer** (don't send same event to same customer twice in cooldown window) |
| Q6 | Cooldown max value | 30 days |
| Q7 | Event hard cap per tenant | 50 events / 10 conditions per event — owner: agree / adjust? |
| Q8 | Should daily-cron source signals (birthday, anniversary, etc.) be eligible for tenant-created custom events too? E.g. tenant creates `vip_birthday` that listens to `daily.birthday` + filters `tier == "Platinum"` | **Yes** — that's the killer use case |
| Q9 | When tenant deletes a custom event with templates mapped, what happens? | **Soft-delete + warn** (mark `deleted_at`; mapping stays but won't fire; restorable for 30 days) |
| Q10 | UI placement of new Events page | New sidebar item between "Templates" and "Automations" — owner approve? |

---

## 8. Effort estimate (rough)

| Track | LoC | Effort |
|---|---|---|
| `events` collection schema + Pydantic models | ~60 | 0.25 day |
| Seed script for 27 built-in events | ~120 | 0.5 day |
| `dispatch_signal(...)` dispatcher + condition evaluator | ~250 | 1.5 days |
| Refactor 15 callsites to emit signals (additive, not replacing) | ~150 | 1 day |
| API endpoints — `GET/POST/PUT/DELETE /api/events` + `/api/signals` | ~180 | 1 day |
| Admin UI — Events list page | ~300 | 1.5 days |
| Admin UI — Create/Edit modal (4 tabs) | ~500 | 2 days |
| Cooldown indexer + lookup | ~50 | 0.5 day |
| Unit tests (condition evaluator, dispatcher routing, cooldown) | ~400 | 1.5 days |
| Integration test (synthetic POS order → custom event → WhatsApp) | ~150 | 0.5 day |
| Docs (planning + impl + QA) | — | 1 day |

**Total**: ~11-12 dev-days for v1.

---

## 9. Definition of done

1. New `events` collection seeded with all 27 built-ins
2. Admin Events page CRUD works for built-in (limited) + custom (full)
3. Dispatcher fires custom events on matching signals + conditions
4. Cooldown prevents duplicate sends within window
5. Existing 27 events continue firing identically (zero regression)
6. Live test: R689 owner creates custom event `vip_thank_you` (signal: `pos.order.received`, condition: `order_amount > 1000`), maps it to a template, places synthetic Rs.1500 order → WhatsApp arrives. Places Rs.500 order → no extra event WhatsApp.
7. QA report at `qa/CR_016_DYNAMIC_EVENT_REGISTRY_QA_REPORT.md`
8. Register row 17 status → `cr016_closed_live_test_passed`

---

## 10. Doc trail

- This file: `/app/memory/crm/crm_roi_sprint/discovery/CR_016_DYNAMIC_EVENT_REGISTRY_DISCOVERY.md`
- Register: row 17 to be added (CR-016)
- PRD §11 — to mention CR-016

---

## 11. CR-016 PARK status (2026-05-28 evening)

**Status**: `cr016_discovery_phase_0_parked_pending_planning_signoff`

### What's documented
- Current hardcoded state + all 15 trigger callsites
- 16 predefined source signals (the system-detectable hooks)
- New `events` collection schema
- Per-tenant override model for built-in events
- Condition evaluator design (AND-only, 10 operators, whitelisted paths)
- Cooldown design
- Admin UI plan (list page + 4-tab create/edit modal)
- 7 risks with mitigations
- 10 owner decisions with recommended defaults
- ~11-12 dev-day estimate

### What's blocking unpark
Owner answers to §7 (most have defaults; Q1, Q4, Q8 are the consequential ones).

### Resume signal
> "Resume CR-016" → re-read this doc, ask owner the §7 questions, then write `planning/CR_016_PHASE_1_PLAN.md`.

---

**End of Phase 0 Discovery. CR-016 PARKED.**
