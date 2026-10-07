# CR-004 — Phase 3 · Event Reconciliation — Planning Doc

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P3 — Event Reconciliation
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_3_planning_complete`
**Depends on:** P1 (done), P2 (done), P2.5 (done), P2.5-B (done)
**Discovery basis:** `../discovery/CR_004_WHATSAPP_DISCOVERY_AGENT_REPORT.md` §4 (Declared vs Emitted)

---

## 1. Problem Statement

The WhatsApp automation module has **critical event drift**: 7+ events fired by CRM code are absent from the master list (UI dropdown), so owners cannot map templates to them — they silently no-op. Conversely, 14 events declared in the master list are never fired by CRM. Three naming mismatches make it worse.

---

## 2. Scope

### In Scope
1. **Tier 1** — Add 7 missing events to master list + fix 2 naming mismatches
2. **Tier 2** — Add new trigger code for `reset_password`, `coupon_expiring`, `inactive_customer`
3. **Bug fixes** — Resend TypeError, message-filters wrong URL
4. **Variable registry updates** — Update `fills_on_events` for renamed events + new events

### Out of Scope (deferred)
- Segment broadcast send (separate CR)
- Opt-in / opt-out enforcement
- Quiet hours / frequency cap
- POS gateway internal_event mapping audit

---

## 3. Work Items

### WI-1: Master List Reconciliation (`schemas.py`)

Add 9 events to `CRM_EVENTS`:

| Event Key | Description | Already Fired By |
|---|---|---|
| `send_bill` | Bill sent to customer | `pos.py` (every order) |
| `tier_upgrade` | Customer tier upgraded | `pos.py`, `points.py` (on tier change) |
| `coupon_earned` | Customer earned a coupon | `coupons.py` (coupon apply) |
| `wallet_credit` | Wallet credited | `wallet.py` (wallet top-up) |
| `wallet_debit` | Wallet debited | `wallet.py` (wallet debit) |
| `bonus_points` | Bonus points awarded manually | `points.py` (manual award) |
| `points_redeemed` | Points redeemed on order | `loyalty.py` (redemption) |
| `coupon_expiring` | Coupon about to expire | NEW — daily cron job |
| `inactive_customer` | Customer inactive 30+ days | NEW — daily cron job |

Note: `send_bill_manual`/`send_bill_auto` stay in POS_EVENTS (for external POS gateway). CRM's own order flow fires `send_bill`.

### WI-2: Naming Mismatches — Rename Code Triggers

| Current (code) | Rename To (match master) | Files |
|---|---|---|
| `first_visit` | `welcome_message` | `pos.py:1478` (trigger call), `whatsapp_variables.py` (fills_on_events) |
| `feedback_received` | `feedback_request` | `feedback_service.py:60`, `whatsapp_variables.py` (FEEDBACK_EVENTS), `test_whatsapp_p2_5_expansion.py` |

### WI-3: New Trigger Code (Tier 2)

**WI-3a: `reset_password` trigger** — `routers/auth.py`
- In `request_forgot_password_otp()` (line ~458), after generating OTP, fire `trigger_whatsapp_event` with event_data containing `otp` value
- Requires customer lookup by email to get phone

**WI-3b: `coupon_expiring` daily job** — `core/loyalty_jobs.py`
- New function `run_coupon_expiry_reminders(user_id)`
- Query coupons with `end_date` within next 3 days + `is_active=True`
- For each expiring coupon, find customers with orders in last 90 days
- Fire `trigger_whatsapp_event` per customer with coupon details
- Register in scheduler alongside existing daily jobs

**WI-3c: `inactive_customer` daily job** — `core/loyalty_jobs.py`
- New function `run_inactive_customer_reminders(user_id)`
- Query customers with `last_order_at` or `updated_at` > 30 days ago
- Fire `trigger_whatsapp_event` per customer
- Cap: max 50 per user per day (avoid spam)
- Register in scheduler

### WI-4: Variable Registry Updates (`whatsapp_variables.py`)

- Rename `FEEDBACK_EVENTS = ["feedback_received"]` → `["feedback_request"]`
- Update all `fills_on_events` that reference `"first_visit"` → `"welcome_message"`
- Add new events to relevant `fills_on_events` where applicable

### WI-5: Bug Fixes

**WI-5a: Resend TypeError** — `routers/whatsapp.py`
- `WhatsAppMessage(template_name=...)` — `template_name` not in dataclass
- Fix: use correct field name from `WhatsAppMessage` dataclass

**WI-5b: Message-filters wrong URL** — `routers/whatsapp.py`
- Current: `https://api.authkey.io/request?type=getAllTemplate&authkey=...`
- Fix: use `https://console.authkey.io/restapi/getAllTemplate.php` (same as rest of codebase)

### WI-6: Test Updates

- Update `test_whatsapp_p2_5_expansion.py` — `feedback_received` → `feedback_request`
- Add test for new events in fills_on
- Verify all 50 existing tests still pass after renames

---

## 4. Acceptance Criteria

| # | Criterion |
|---|---|
| AC-1 | `GET /whatsapp/automation/events` returns all new events (send_bill, tier_upgrade, coupon_earned, wallet_credit, wallet_debit, bonus_points, points_redeemed, coupon_expiring, inactive_customer) |
| AC-2 | Code triggers fire `welcome_message` (not `first_visit`) and `feedback_request` (not `feedback_received`) |
| AC-3 | `reset_password` trigger fires in forgot-password OTP flow |
| AC-4 | `coupon_expiring` daily job runs and fires WhatsApp for expiring coupons |
| AC-5 | `inactive_customer` daily job runs and fires WhatsApp for inactive customers |
| AC-6 | Resend endpoint no longer raises TypeError |
| AC-7 | Message-filters endpoint uses correct AuthKey URL |
| AC-8 | Variable registry `fills_on_events` updated for all renamed events |
| AC-9 | All 50+ existing unit tests pass |
| AC-10 | Frontend Automation page shows all new events in POS/CRM tabs |

---

## 5. Files to Change

| File | Changes |
|---|---|
| `models/schemas.py` | Add 9 events to CRM_EVENTS |
| `routers/pos.py` | Rename `first_visit` → `welcome_message` (line 1478) |
| `services/feedback_service.py` | Rename `feedback_received` → `feedback_request` (line 60) |
| `routers/auth.py` | Add `reset_password` WhatsApp trigger in forgot-password OTP |
| `core/loyalty_jobs.py` | Add `run_coupon_expiry_reminders()` + `run_inactive_customer_reminders()` |
| `core/scheduler.py` | Register new daily jobs |
| `core/whatsapp_variables.py` | Update FEEDBACK_EVENTS, fills_on_events refs |
| `core/whatsapp.py` | Fix resend bug (if dataclass issue is here) |
| `routers/whatsapp.py` | Fix resend TypeError, fix message-filters URL |
| `tests/test_whatsapp_p2_5_expansion.py` | Update `feedback_received` → `feedback_request` |

---

## 6. Status

```
cr004_phase_3_planning_complete
```

End of CR-004 Phase 3 planning.
