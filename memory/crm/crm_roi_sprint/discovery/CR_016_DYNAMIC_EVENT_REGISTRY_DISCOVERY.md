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

**Plain-language definition**: A "Condition" is a rule that says **"only fire this event when X is true"**. Without conditions, the event fires every time its source signal happens. With conditions, the event becomes selective.

**Example owner scenario**: R689 wants `vip_thank_you` to fire only when the order is over Rs.1000 AND the customer is on Gold tier. They open the event, click "+ Add Condition" twice:

| Field | Operator | Value |
|---|---|---|
| `order_amount` | greater than or equal | `1000` |
| `customer.tier` | equals | `Gold` |

The dispatcher checks both rules against the order data. If both are true → event fires. If either is false → event does NOT fire.

**Conditions are joined by AND only in v1** — all rules must be true. No "OR" in v1.

**Allowed operators (10)**:
`equals`, `not equals`, `greater than`, `greater than or equal`, `less than`, `less than or equal`, `is one of`, `is not one of`, `contains text`, `field exists`.

**Where the conditions live**: stored in the event's `conditions` array (see §3.1 schema). Edited in the event modal's "Trigger" tab as a list of rows with three dropdowns each (field / operator / value).

**Zero conditions** = event fires on every occurrence of the source signal (matches today's hardcoded behaviour).

### 3.4 Frequency control — handled by the source signal itself, NOT by cooldown

**Decision (owner 2026-05-28 evening)**: Events are inherently event-driven — the source signal already controls firing cadence. There is **no separate cooldown mechanism in CR-016**.

Examples of how each signal naturally controls frequency without needing cooldown:

| Signal | Natural cadence | Why no cooldown needed |
|---|---|---|
| `pos.order.received` | Once per order placed | Every order legitimately needs its bill / thank-you |
| `customer.registered` | Once per customer (lifetime) | Customer cannot re-register; signal fires once |
| `daily.birthday` | Once per customer per year | Daily cron + birthday-match filter inherently produces once-a-year cadence |
| `daily.anniversary` | Once per customer per year | Same as birthday |
| `customer.tier_changed` | Only when tier actually changes | Tier change is a discrete event |
| `daily.points_expiring_in_N_days` | Once per N-day window | Window-based daily cron |
| `daily.inactive_customer` | Once when inactivity threshold crossed | Threshold-based; doesn't re-trigger until customer becomes active then inactive again |
| `coupon.issued` | Once per coupon | Coupon issuance is discrete |

**Implication for tenant-created custom events**: If a tenant builds a custom event listening to a frequent signal (e.g. `pos.order.received`), they have **conditions** to narrow the firing — not a cooldown. If they want "only fire on the customer's 5th order", they add a condition like `customer.total_visits == 5`.

### 3.5 Per-tenant override of built-in events

Built-in events (the 27 hardcoded) are seeded as `is_builtin=true, user_id=null`. Tenant who wants to customize creates an override doc `is_builtin=false, user_id=<tenant>, event_key=<same as builtin>` — the resolver picks tenant doc first, falls back to builtin. Built-in event_key + display_name + source_signal are NOT editable by tenant (UI shows them as readonly); only `is_enabled` and `conditions` are editable.

Tenant-only fields (no built-in counterpart) are fully editable.

### 3.6 New event dispatcher

Code change: every system-signal emitter calls a new `dispatch_signal(signal_key, event_data, user_id, customer_id)` instead of `trigger_whatsapp_event(event_key, ...)` directly. Dispatcher:
1. Loads all `events` rows where `source_signal == signal_key` (tenant + global)
2. Evaluates each event's `conditions` against `event_data`
3. For each matching enabled event:
   - Calls `trigger_whatsapp_event(event_key=event.event_key, event_data, user_id, ...)` (same downstream path as today)

Existing trigger_whatsapp_event signature unchanged → CR-015 work (variable resolution) drops in cleanly.

---

## 4. Admin UI changes — reuse existing page, add "New Event" modal

**No new sidebar item, no new page.** Owner already has the WhatsApp Automation page at `frontend/src/components/shared/WhatsAppAutomationContent.jsx` (1831 LoC) which today lists events grouped by category, lets owner toggle enabled/disabled, map to template, and test-send. We extend that same page:

### 4.1 Changes to the existing Events list (`WhatsAppAutomationContent.jsx`)

1. Add a **"+ New Event"** button at the top right.
2. Add **2 new columns** to each row:
   - **Source Signal** (read for built-ins; shown for clarity)
   - **Conditions** (small chip like "2 conditions" → click to view/edit)
3. Built-in row Edit action stays as today (map template, toggle).
4. Custom row Edit action opens the **New/Edit Event modal** (below) with full editing.

### 4.2 New Event modal — 4 tabs in a single Dialog

Modal is opened by:
- "+ New Event" button → blank form
- Custom event row → "Edit" → pre-filled
- Built-in event row → "Edit" → pre-filled, fields locked except Conditions / Cooldown / Enable

| Tab | Fields |
|---|---|
| **1. Basics** | Display Name (text), Event Key (auto-slug, editable for custom), Description, Category (dropdown), Enable toggle |
| **2. Trigger** | Source Signal (dropdown of 16, see §3.2), Conditions list (rows of `field` / `operator` / `value` with **+ Add Condition** button), Zero-condition note ("Fires every time the signal occurs") |
| **3. Variables** | Multi-select chips of `WHATSAPP_VARIABLES` keys this event will provide via event_data — informs the template-mapping UI later. Read-only for built-ins. |
| **4. Template** | Inline reuse of the existing template-mapping UI — pick approved template, set `{{N}}` mappings. Optional: "Skip — I'll map later" button. (When skipped, event still saves; can map from list row later.) |

### 4.3 Built-in event constraints in the modal

For `is_builtin=true` rows: Tab 1 fields except Enable are readonly; Tab 2 Source Signal is readonly (Conditions editable); Tab 3 is readonly; Tab 4 is fully editable. UI shows a small lock icon next to readonly fields with a tooltip "Built-in — metadata managed by system".

---

## 5. Out of scope (this CR) — what we are NOT doing

Each row says **"what someone might expect us to do here"** and **"why we're not doing it in CR-016"**.

| What someone might want | Why deferred / future home |
|---|---|
| **"OR" conditions** — fire if `tier=Gold` OR `tier=Platinum` | v1 only supports AND between conditions. Workaround: use `is one of` operator with `[Gold, Platinum]`. True OR (mixing different fields) lands in CR-016b. |
| **Multi-channel events** — fire same event over SMS + email + push, not just WhatsApp | Today the trigger path is WhatsApp-only. Adding SMS/email touches send-side, billing, opt-out — too big for this CR. Separate channel CR per provider. |
| **Custom webhook signals** — tenant defines their own external webhook URL that fires a custom signal | Security (auth/HMAC), rate-limiting, abuse prevention need careful design. Folds into CR-016c. |
| **Editing the source signal of a built-in event** — e.g. change `send_bill` to listen to `payment.received` instead of `pos.order.received` | Built-in source_signals are wired to specific code emitters. Changing them would break expectations for other tenants. Tenant CAN create a custom event with a different signal instead. |
| **Per-customer event mute / unsubscribe** — customer opts out of `birthday` messages | Different abstraction (channel-level opt-out, not event-level). Privacy / DPDP compliance CR. |
| **Event firing analytics** — dashboard showing "this event fired 1,243 times this month, 12 cooldown_blocked, 8 condition_filtered" | Read-side analytics dashboard, separate effort. v1 just logs to `whatsapp_message_logs` with normal status field. |
| **Custom variables not in the registry** — tenant defines own variable like `{{chef_recommendation}}` | CR-015 fixes the existing registry; per-tenant custom vars is a separate scope. |
| **AI-suggested conditions** — "you mapped `vip_thank_you`; we suggest adding condition `order_amount >= 1000`" | Far future, not v1. |
| **A/B testing events** — fire variant A 50% of the time, B 50% | Marketing optimization CR, not v1. |
| **Backfilling event firings for past orders** — re-fire `vip_thank_you` for last month's qualifying orders | Same no-backfill rule as CR-004. |
| **Multiple templates per event** — randomize among 3 different `welcome_message` templates | v1 = 1 event ↔ 1 template. Multi-template selection (e.g. round-robin or by tier) is a future CR. |

---

## 6. Risks

| Risk | P | Impact | Mitigation |
|---|---|---|---|
| Migration of 27 built-in events to `events` collection drops/misfires WhatsApp in production | Low (preview-first) | High | One-time seed script with idempotency; staged rollout; dispatcher falls back to old direct-trigger if `events` collection empty for a signal |
| Condition evaluator allows injection (e.g. `field` containing dotted path traverses prototype) | Med | Med | Whitelist allowed field paths per source_signal; reject unknown paths |
| Cooldown lookup adds latency to every send | ~~Low~~ | ~~Low~~ | **N/A — cooldown removed from scope per owner direction 2026-05-28 evening; frequency is controlled by source signal cadence + conditions only** |
| Tenant creates infinite cascading events | Low | Med | Hard cap: ≤ 50 events per tenant, ≤ 10 conditions per event |
| Built-in events become out-of-sync with hardcoded callsites | Med | High | Tests that walk every `trigger_whatsapp_event` callsite + assert event_key exists as a builtin |
| Removing direct `trigger_whatsapp_event` calls breaks existing flows | Med | High | v1 keeps direct calls (additive); dispatcher complements rather than replaces; switch to dispatcher-only in v2 |

---

## 7. Owner-only decisions before planning

| # | Question | Recommended default |
|---|---|---|
| Q1 | Built-in events policy: locked metadata + editable conditions, OR fully editable (rename, change source_signal)? | **Locked metadata, editable conditions + enable** (prevents tenant from breaking the link to system emitter) |
| Q2 | Event-key namespacing: per-tenant unique only, OR globally unique? | **Per-tenant unique** (tenant can call their custom event `big_order` even if another tenant uses same key) |
| Q3 | Custom event creation by tenant — allow free editing OR admin-of-admins approval? | **Free editing** — restaurant CRM is per-tenant SaaS, owner is sole admin |
| Q4 | v1 condition operator set | `eq, neq, gt, gte, lt, lte, in, not_in, contains, exists` (10 ops). Owner: keep / trim? |
| Q5 | Event hard cap per tenant | 50 events / 10 conditions per event — owner: agree / adjust? |
| Q6 | Should daily-cron source signals (birthday, anniversary, etc.) be eligible for tenant-created custom events too? E.g. tenant creates `vip_birthday` that listens to `daily.birthday` + filters `tier == "Platinum"` | **Yes** — that's the killer use case |
| Q7 | When tenant deletes a custom event with templates mapped, what happens? | **Soft-delete + warn** (mark `deleted_at`; mapping stays but won't fire; restorable for 30 days) |
| Q8 | UI placement — extend existing WhatsApp Automation page vs new sidebar entry | **Extend existing page** (per owner direction 2026-05-28 evening — reuse `WhatsAppAutomationContent.jsx`, add "+ New Event" button + 4-tab create/edit modal) |

---

## 8. Effort estimate (rough)

| Track | LoC | Effort |
|---|---|---|
| `events` collection schema + Pydantic models | ~60 | 0.25 day |
| Seed script for 27 built-in events | ~120 | 0.5 day |
| `dispatch_signal(...)` dispatcher + condition evaluator | ~220 | 1 day |
| Refactor 15 callsites to emit signals (additive, not replacing) | ~150 | 1 day |
| API endpoints — `GET/POST/PUT/DELETE /api/events` + `/api/signals` | ~180 | 1 day |
| Admin UI — Extend `WhatsAppAutomationContent.jsx` (list columns + "+ New Event" button) | ~200 | 1 day |
| Admin UI — Create/Edit modal (4 tabs) | ~500 | 2 days |
| Unit tests (condition evaluator, dispatcher routing) | ~350 | 1 day |
| Integration test (synthetic POS order → custom event → WhatsApp) | ~150 | 0.5 day |
| Docs (planning + impl + QA) | — | 1 day |

**Total**: ~9-10 dev-days for v1.

---

## 9. Definition of done

1. New `events` collection seeded with all 27 built-ins
2. Admin Events list (extended `WhatsAppAutomationContent.jsx`) CRUD works for built-in (limited) + custom (full)
3. Dispatcher fires custom events on matching signals + conditions
4. Existing 27 events continue firing identically (zero regression)
5. Live test: R689 owner creates custom event `vip_thank_you` (signal: `pos.order.received`, condition: `order_amount > 1000`), maps it to a template, places synthetic Rs.1500 order → WhatsApp arrives. Places Rs.500 order → no extra event WhatsApp.
6. QA report at `qa/CR_016_DYNAMIC_EVENT_REGISTRY_QA_REPORT.md`
7. Register row 17 status → `cr016_closed_live_test_passed`

---

## 10. Doc trail

- This file: `/app/memory/crm/crm_roi_sprint/discovery/CR_016_DYNAMIC_EVENT_REGISTRY_DISCOVERY.md`
- Register: row 17 to be added (CR-016)
- PRD §11 — to mention CR-016

---

## 11. CR-016 PARK status (2026-05-28 evening) — superseded by 2026-05-29 deferral

**Current status**: `cr016_discovery_phase_0_deferred_next_sprint`

**Deferral note (2026-05-29)**: Owner deferred CR-016 to the next sprint. Quote: *"actually it will come very complex we have almost definate event we used need to ensure they map and fire correctly for now we can mark cr to be taken in next spirint"*. Sprint focus pivots to making the existing 27 hardcoded events fire + render reliably (CR-015). When CR-016 resumes next sprint, §7 Q1–Q8 are still open and the recommended defaults above remain the starting point.

### What's documented (preserved for next sprint pickup)
- Current hardcoded state + all 15 trigger callsites
- 16 predefined source signals (the system-detectable hooks)
- New `events` collection schema
- Per-tenant override model for built-in events
- Condition evaluator design (AND-only, 10 operators, whitelisted paths)
- Frequency control via source signal cadence (no cooldown layer — events are inherently event-driven, per owner direction 2026-05-28 evening)
- Admin UI plan (extend existing `WhatsAppAutomationContent.jsx` + 4-tab create/edit modal)
- 7 risks with mitigations
- 8 owner decisions with recommended defaults (Q8 = UI placement already locked to "reuse existing page")
- ~9-10 dev-day estimate

### What's blocking unpark
Owner answers to §7 (most have defaults; Q1, Q4, Q6 are the consequential ones).

### Resume signal
> **Deferred to next sprint.** When owner says "Resume CR-016" in the next sprint → re-read this doc, ask owner the §7 Q1–Q8 questions, then write `planning/CR_016_PHASE_1_PLAN.md`.

---

**End of Phase 0 Discovery. CR-016 DEFERRED to next sprint (2026-05-29).**
