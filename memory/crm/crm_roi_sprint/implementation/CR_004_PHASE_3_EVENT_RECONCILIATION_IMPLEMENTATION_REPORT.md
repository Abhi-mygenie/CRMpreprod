# CR-004 — Phase 3 · Event Reconciliation — Implementation Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P3 — Event Reconciliation
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_3_implemented`
**Planning doc:** `../planning/CR_004_PHASE_3_EVENT_RECONCILIATION_PLAN.md`

---

## 1. Summary

P3 resolves the critical **event drift** between the WhatsApp automation master list and the actual code triggers. 9 new events added to CRM_EVENTS, 2 naming mismatches fixed, 3 new Tier 2 triggers implemented (`reset_password`, `coupon_expiring`, `inactive_customer`), 2 bugs fixed (resend TypeError, message-filters wrong URL), and frontend updated to display all 16 CRM events.

---

## 2. Files Changed

| File | Action | Changes |
|---|---|---|
| `models/schemas.py` | Edit | Added 9 events to `CRM_EVENTS`: `send_bill`, `tier_upgrade`, `coupon_earned`, `wallet_credit`, `wallet_debit`, `bonus_points`, `points_redeemed`, `coupon_expiring`, `inactive_customer` |
| `routers/pos.py` | Edit | Renamed `"first_visit"` → `"welcome_message"` at trigger call (line 1478) |
| `services/feedback_service.py` | Edit | Renamed `"feedback_received"` → `"feedback_request"` at trigger call (line 60) |
| `routers/auth.py` | Edit | Added `reset_password` WhatsApp trigger in `request_forgot_password_otp()` — fires after OTP generation with customer lookup by phone. Added `asyncio` import |
| `core/loyalty_jobs.py` | Edit | Added `run_coupon_expiry_reminders(user_id)` — queries coupons expiring within 3 days, notifies active customers (capped 50/coupon). Added `run_inactive_customer_reminders(user_id)` — queries customers inactive 30+ days, fires win-back trigger (capped 50/user/day) |
| `core/scheduler.py` | Edit | Imported new job functions, registered them in `daily_loyalty_jobs()`, added summary tracking |
| `core/whatsapp_variables.py` | Edit | Renamed `FEEDBACK_EVENTS = ["feedback_received"]` → `["feedback_request"]`, updated `fills_on_events` refs: `first_visit` → `welcome_message` |
| `routers/whatsapp.py` | Edit | (1) Fixed resend TypeError: removed invalid `template_name` kwarg from `WhatsAppMessage()`. (2) Fixed message-filters URL: `api.authkey.io/request` → `console.authkey.io/restapi/getAllTemplate.php`. (3) Added 9 new CRM event descriptions to `crm_event_descriptions` dict |
| `frontend/.../WhatsAppAutomationContent.jsx` | Edit | Moved 9 new events from legacy `eventLabels` into `crmEventLabels` — all 16 CRM events now appear in CRM Events tab |
| `tests/test_whatsapp_p2_5_expansion.py` | Edit | Updated `fills_on("rating", "feedback_received")` → `fills_on("rating", "feedback_request")` |

---

## 3. Event Reconciliation Result

### Before P3 (18 events, critical drift)
- Master list: 11 POS + 7 CRM = 18 events
- Code triggers firing 14 event keys — 7 absent from master list (silent no-op)
- 3 naming mismatches

### After P3 (27 events, fully reconciled)
- Master list: 11 POS + 16 CRM = 27 events
- All code triggers now match master list event keys
- 0 naming mismatches
- 2 new Tier 2 daily jobs: `coupon_expiring`, `inactive_customer`
- 1 new Tier 2 inline trigger: `reset_password`

### Event-by-event reconciliation

| Event Key | Before P3 | After P3 |
|---|---|---|
| `send_bill` | Fired but not in master | In CRM_EVENTS, configurable |
| `first_visit` → `welcome_message` | Name mismatch | Renamed in code, matches master |
| `tier_upgrade` | Fired but not in master | In CRM_EVENTS, configurable |
| `coupon_earned` | Fired but not in master | In CRM_EVENTS, configurable |
| `wallet_credit` | Fired but not in master | In CRM_EVENTS, configurable |
| `wallet_debit` | Fired but not in master | In CRM_EVENTS, configurable |
| `bonus_points` | Fired but not in master | In CRM_EVENTS, configurable |
| `feedback_received` → `feedback_request` | Name mismatch | Renamed in code, matches master |
| `points_redeemed` | Fired but not in master | In CRM_EVENTS, configurable |
| `reset_password` | In master, never fired | Now fired in forgot-password OTP flow |
| `coupon_expiring` | Not existed | NEW — daily cron, in CRM_EVENTS |
| `inactive_customer` | Not existed | NEW — daily cron, in CRM_EVENTS |

---

## 4. Bug Fixes

### WI-5a: Resend TypeError
- **Root cause:** `WhatsAppMessage(template_name=...)` — `template_name` not a field on the dataclass (only `template_id`)
- **Fix:** Removed `template_name` kwarg from resend code (line 988)
- **Impact:** Resend endpoint no longer crashes

### WI-5b: Message-filters wrong URL
- **Root cause:** `/whatsapp/message-filters` used `https://api.authkey.io/request` (old API), while rest of codebase uses `https://console.authkey.io/restapi/getAllTemplate.php`
- **Fix:** Updated URL to match rest of codebase
- **Impact:** Template-name filter in Message Status page now works

---

## 5. Validation

| Check | Result |
|---|---|
| Backend lint | Clean |
| Frontend compile | Compiled successfully |
| All 50 unit tests | PASS |
| `GET /whatsapp/automation/events` | 27 events (11 POS + 16 CRM), all with descriptions |
| Frontend CRM Events tab | "All (16)" — all new events visible with Configure buttons |
| Backend health | Healthy |

---

## 6. Status

```
cr004_phase_3_implemented
```

End of CR-004 Phase 3 implementation.
