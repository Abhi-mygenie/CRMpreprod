# CR-004 — Phase 3 · Event Reconciliation — QA Report

**CR:** CR-004 WhatsApp Utility + Marketing Message Integration
**Phase:** P3 — Event Reconciliation
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-28
**Status:** `cr004_phase_3_qa_passed`
**Test user:** `owner@kunafamahal.com` / `Qplazm@10` (R689 Kunafa Mahal)

---

## 1. QA Verdict

```
cr004_phase_3_qa_passed
```

All 18 scenarios passed. 50 unit tests green. No product code changed by QA.

---

## 2. Backend QA (10 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| B1 | `GET /whatsapp/automation/events` returns 27 events | PASS | 11 POS + 16 CRM. All 16 CRM events have descriptions |
| B2 | New CRM events in response | PASS | `send_bill`, `tier_upgrade`, `coupon_earned`, `wallet_credit`, `wallet_debit`, `bonus_points`, `points_redeemed`, `coupon_expiring`, `inactive_customer` — all present |
| B3 | Naming fix: `welcome_message` (not `first_visit`) | PASS | Code grep: `trigger_whatsapp_event(db, user["id"], "welcome_message"` in pos.py |
| B4 | Naming fix: `feedback_request` (not `feedback_received`) | PASS | Code grep: `trigger_whatsapp_event(db, user_id, "feedback_request"` in feedback_service.py |
| B5 | `reset_password` trigger wired in forgot-password OTP | PASS | Code verified: `routers/auth.py` line ~497 fires `trigger_whatsapp_event` with `"reset_password"` event after OTP generation |
| B6 | `coupon_expiring` daily job exists | PASS | `run_coupon_expiry_reminders()` in loyalty_jobs.py — queries coupons with end_date within 3 days, fires trigger per customer (capped 50) |
| B7 | `inactive_customer` daily job exists | PASS | `run_inactive_customer_reminders()` in loyalty_jobs.py — queries customers inactive 30+ days, fires trigger (capped 50/user/day) |
| B8 | New jobs registered in scheduler | PASS | `core/scheduler.py` imports both functions, calls them in `daily_loyalty_jobs()` loop |
| B9 | Resend bug fixed | PASS | `WhatsAppMessage()` constructor no longer receives `template_name` kwarg. Resend endpoint functional |
| B10 | Message-filters URL fixed | PASS | Uses `console.authkey.io/restapi/getAllTemplate.php` (correct URL matching rest of codebase) |

---

## 3. Frontend QA (4 scenarios)

| # | Scenario | Result | Evidence |
|---|---|---|---|
| F1 | CRM Events tab shows "All (16)" | PASS | Screenshot: `All (16)`, `Active (0)`, `Not Configured (16)` |
| F2 | New events visible with labels | PASS | Send Bill, Tier Upgrade, Coupon Earned, Wallet Top-up, Wallet Payment, Bonus Points Awarded, Points Redeemed, Coupon Expiring Reminder, Inactive Customer Win-back — all rendered with "Not Configured" badges |
| F3 | Each new event has Configure button | PASS | All 16 events show gear icon + "Configure" link |
| F4 | POS Events tab unchanged (11 events) | PASS | POS tab still shows original 11 events |

---

## 4. Unit Tests (regression)

| Suite | Tests | Result |
|---|---|---|
| `test_whatsapp_text_mode.py` | 6 | PASS |
| `test_whatsapp_resolver.py` | 19 | PASS |
| `test_whatsapp_p2_5_expansion.py` | 25 | PASS |
| **Total** | **50** | **All passed** |

Key rename verification in tests:
- `fills_on("rating", "feedback_request")` → True (updated from `feedback_received`)
- All P2 regression tests (customer_name, tier_upgrade, restaurant_name) still pass

---

## 5. Event-Level Verification

| Event Key | In Master? | Trigger Wired? | Configurable in UI? |
|---|---|---|---|
| `send_bill` | YES | YES (pos.py) | YES |
| `welcome_message` | YES | YES (pos.py, renamed from first_visit) | YES |
| `tier_upgrade` | YES | YES (pos.py, points.py) | YES |
| `coupon_earned` | YES | YES (coupons.py) | YES |
| `wallet_credit` | YES | YES (wallet.py) | YES |
| `wallet_debit` | YES | YES (wallet.py) | YES |
| `bonus_points` | YES | YES (points.py) | YES |
| `points_redeemed` | YES | YES (loyalty.py) | YES |
| `feedback_request` | YES | YES (feedback_service.py, renamed) | YES |
| `reset_password` | YES | YES (auth.py, NEW trigger) | YES |
| `coupon_expiring` | YES | YES (loyalty_jobs.py, NEW cron) | YES |
| `inactive_customer` | YES | YES (loyalty_jobs.py, NEW cron) | YES |

---

## 6. Scope Guard

| # | Check | Result |
|---|---|---|
| S1 | 27 total events (11 POS + 16 CRM) | PASS |
| S2 | No naming mismatches remaining | PASS |
| S3 | Resend bug fixed | PASS |
| S4 | Message-filters URL fixed | PASS |
| S5 | All 50 unit tests pass | PASS |
| S6 | Segment broadcast (deferred) | NOT included — correct |
| S7 | Opt-in/opt-out (deferred) | NOT included — correct |
| S8 | Product code changed by QA | NO |
| S9 | DB changed | NO |

---

## 7. Issues Found

None.

---

## 8. Status

```
cr004_phase_3_qa_passed
```

CR-004 Phase 3 (Event Reconciliation) is QA-verified. All 27 events reconciled, naming mismatches fixed, Tier 2 triggers implemented, bugs fixed.

End of CR-004 Phase 3 QA.
