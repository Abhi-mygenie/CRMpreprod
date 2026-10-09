# INTAKE DOC — CR-2026-10-07-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-07-001 |
| **Title** | Feedback for diners without a CRM session — hybrid `{phone, restaurant_id}` path to `POST /scan/feedback` (depends on CRM CR-096) |
| **Classification** | **CR** — follow-up to CR-2026-10-03-003, option D10=a |
| **Date Registered** | 2026-10-07 |
| **Reported By** | Owner ruling on D10 (CR-2026-10-03-003 §9): "go with option A" — ship token-only now, close the guest gap when CRM's no-token path ships |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Priority** | P2 (becomes P1 the day CRM confirms CR-096 live) |
| **Risk** | MEDIUM — new input (phone) on a diner page; external dependency; no customer creation by contract |
| **Status** | 📝 REGISTERED — **BLOCKED on CRM CR-096** (Wave 3 per `inbox/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS_2026-10-07.md`) |
| **Blast radius** | Every diner who reaches Feedback without a token — gaps G1–G4 in CR-2026-10-03-003 §9 |

## 1. The gap in one sentence

After CR-2026-10-03-003, feedback works only for diners holding a CRM token; diners on paths G1–G4
(no phone box shown, phone left blank, abandoned password page, guest fallback) see a sign-in card
and — for G1 — have no way to sign in.

## 2. What this CR does (frozen by contract §4c, CRM A9-b)

1. No token → send `{phone, restaurant_id, rating, message?, order_id?}` to `POST /scan/feedback`.
2. Phone source: `localStorage.guestCustomer.phone` if present (G4), else a **single phone input** on the feedback page (G1–G3). No name, no email, no OTP, no password.
3. CRM resolves to an **existing** customer by canonical phone or stores **unlinked** (`customer_id: null`). **Never creates a customer** — contract clause; Customer App must not call `skip-otp` from this page.
4. Sign-in card from CR-2026-10-03-003 is replaced by the phone input; token path unchanged.

## 3. Preconditions

- CRM CR-096 CONFIRMED in the wave change log with evidence (no-token POST → 2xx, not 403). Re-probe before planning: `curl -X POST {CRM}/scan/feedback -d '{"phone":"0000000000","restaurant_id":"478","rating":5}'` must not be 403.
- CR-2026-10-03-003 CLOSED (this CR edits the same page).

## 4. Files (expected)

`frontend/src/pages/FeedbackPage.jsx` · `frontend/src/api/services/crmService.js` (`crmSubmitFeedback` gains a no-token branch via `crmFetch`) · no backend change.

## 5. Open questions for owner (at Planning)

- Q1 Phone validation = Indian 10-digit as on landing (`isPhoneValid`)? (rec: yes, reuse)
- Q2 Should a guest's submitted phone be saved to `guestCustomer` for the rest of the session? (rec: no — single-purpose)

```text
Intake complete: CR-2026-10-07-001
Classification: CR · P2 · MEDIUM
Blocked on: CRM CR-096 (Wave 3)
Related: CR-2026-10-03-003 (parent), CR-2026-09-14-001 (OTP quarantine)
Next: wait for CRM CONFIRMED row → Planning
```
