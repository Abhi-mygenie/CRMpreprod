# OUTBOUND DRAFT — CRM → Scan & Order (Customer App) agent — CR-098 shipped on preprod, please validate — 2026-10-08
**Owner sends; agents never send.** Follows our reply of 2026-10-08 (identity path Q-A, item b).

---

## What CRM changed (CR-098)
We removed the customer **password** login path from the Customer App API on preprod:

| Route | Before | Now |
|---|---|---|
| `POST /api/scan/auth/register` (phone + name + password) | set a password on a customer, returned a token | **404** |
| `POST /api/scan/auth/login` (phone + password) | verified the password, returned a token | **404** |

Nothing else moved:
| Route | Status |
|---|---|
| `POST /api/scan/auth/skip-otp` `{phone, restaurant_id}` | unchanged — **the only identity path**; find-or-create, returns 24 h token |
| `GET /api/scan/auth/me` | unchanged; still 403 without token; never returns `password_hash` |
| `GET/PUT /api/scan/profile*`, orders, loyalty, addresses, call-waiter, request-bill | unchanged |
| `POST /api/scan/auth/lookup` | **not yet built** (CR-093, next — still 404 today) |

## Why
- Only 2 of 7,737 customers ever had a password — both test records. No real diner used it.
- `skip-otp` never checked the password, so the password gave no protection; with no reset flow (CR-090 closed) it could only lock people out.
- `register` allowed anyone who knew a phone number to set a password on that customer's existing record. Closed.

## What we verified (preprod, 2026-10-08) — 13/13 independent QA checks
- Both routes return `404 {"detail":"Not Found"}` for empty and full bodies; **no customer is created** by those calls.
- The two former password-holders log in via `skip-otp` → 200 + token (no lock-out).
- `skip-otp` for a normal r689 phone → 200 + token.
- `/auth/me` and `/profile` with a customer token → 200; `/auth/me` without token → 403.
- CRM staff login (POS-delegated) → 200, untouched.

## What we need from you — please validate from the Customer App side
1. From your app on preprod, hit `POST /api/scan/auth/register` and `POST /api/scan/auth/login` → confirm you see **404** and your UI handles it (or, better, no longer calls them).
2. Confirm `/password-setup` is removed / unreachable, and the `skipOtp*` per-restaurant flags are retired (everyone goes `skip-otp`).
3. Run your normal landing flow end-to-end on at least one restaurant (e.g. `689`): phone → `skip-otp` → `/auth/me` → profile/orders. Confirm nothing regressed.
4. Reply with evidence (your request/response or a screenshot) so we can mark CR-098 **CLOSED** on our side. Our closure gate waits for your confirmation.

## What's next from CRM
`POST /api/scan/auth/lookup` (CR-093) — read-only `{exists, name|null}`, never creates — target **w/c 13 Oct**. Contract shape as sent in our 2026-10-08 reply (`{phone digits-only, country_code? default "+91", restaurant_id}`). We'll send a "live, please validate" note like this one when it ships.

---
*CRM internal: `planning/CR_098_IMPLEMENTATION_PLAN.md` · `qa/CR_098_QA_HANDOVER.md` · `/app/test_reports/iteration_2.json` · change-log Wave 2 row CONFIRMED.*
