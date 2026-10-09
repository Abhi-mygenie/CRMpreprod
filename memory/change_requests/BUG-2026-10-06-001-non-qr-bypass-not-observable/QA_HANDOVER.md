# QA HANDOVER — BUG-2026-10-06-001

**From:** Role 3 (E1) · **To:** Role 4 (QA) · **Date:** 2026-10-07
**Plan:** `IMPLEMENTATION_PLAN.md` · **Self-test:** `SELF_TEST.md` (T1-C1, T5, T6, T8–T12, T14–T16 PASS; T1-C2/C3, T2–T4, T7, T13 deferred to QA)

## What changed (6 files)
| File | Change |
|---|---|
| `frontend/src/utils/orderAccessPolicy.js` | `buildNonQrBlockPayload(ctx, checkpoint, policy)` adds `decision`, `allowed` |
| `frontend/src/pages/LandingPage.jsx` | C1: event fires on allow **and** block when `allowNonQrOrders === false`; console.log → `logger.order` |
| `frontend/src/pages/MenuItems.jsx` | C2: same; now sends `is_authenticated` (D6) |
| `frontend/src/pages/ReviewOrder.jsx` | C3: same |
| `backend/server.py` | `NonQrBlockEvent` + `decision` (≤40 chars), `allowed`; two rolling caps (200 blocked / 1000 allowed per rid) |
| `backend/tests/smoke/test_bug_2026_10_06_001.py` | new, 4 tests |

## Invariant QA must break if it can
**No order outcome changes.** Allowed stays allowed, blocked stays blocked, in both flag states.

## How to enforce the flag WITHOUT writing to the shared DB
Intercept `GET /api/config/<rid>` in the browser automation and set `allowNonQrOrders: false` in the JSON before it reaches the app. Clear `localStorage`/`sessionStorage` first (config is cache-first). Do **not** PUT `/api/config/` — the collection is shared with CRM.

## Test accounts (aliases — values in backend/tests/conftest.py env defaults / memory/test_credentials.md)
- `preprod-customer-default` — phone in `TEST_PHONE`, skip-otp login
- test restaurant `TEST_RESTAURANT_ID` (478) — has orderable items; 689 is all sold out in preview
- restaurant 716 — carve-out check (T2)

## QA cases
| # | Case | Expected |
|---|---|---|
| Q1 | Flag off (intercepted) · walk-in URL `?type=walkin&tableId=0` · Browse → add item → Review → Place | Order flow identical to flag-on; 3 POSTs to `/api/diagnostics/non-qr-block` with `checkpoint` landing / add_to_cart / place_order, `decision: valid-qr`, `allowed: true` |
| Q2 | Flag off · rid 716 · direct URL · Browse | Allowed; POST `decision: rid-716-carveout, allowed: true` |
| Q3 | Flag off · `?orderType=takeaway` · Browse → add → place | Allowed; `decision: non-dinein-mode` |
| Q4 | Flag off · direct URL, no params · Browse | Blocked: "Session Expired" modal, cart empty; POST `decision: non-qr-dinein, allowed: false` |
| Q5 | Flag off · direct URL · deep-link `/<rid>/menu` → add item (first add) | Blocked at C2 with modal; POST `checkpoint: add_to_cart, allowed: false` |
| Q6 | Flag **on/absent** (no interception) · repeat Q1 and Q4 | Allowed; **zero** diagnostics POSTs |
| Q7 | Logged-in diner (skip-otp) · flag off · first add-to-cart | `is_authenticated: true` on the `add_to_cart` POST |
| Q8 | Regression (hotspot): dine-in table QR `?tableId=<id>&type=table`, takeaway, delivery, edit-order — flag on | Every outcome identical to pre-change; payment payload unchanged (`payment_type` carries selection, `payment_method` hardcoded) |
| Q9 | Backend API: `POST /api/diagnostics/non-qr-block` legacy body (no new fields) | 204 |
| Q10 | Backend API: `decision` 41 chars | 422 |
| Q11 | `pytest -m smoke backend/tests/smoke/ -v` and `pytest -m contract backend/tests/ -v` | all pass, snapshots unchanged |

## Known NOTE (not a defect)
Rolling cap is count-then-delete (pre-existing, non-atomic). Under heavy concurrency a bucket can read limit+1 momentarily.

## Owner smoke (Role 8) — after QA PASS
1. Switch off → scan walk-in QR → order normally → ask agent for the 3 new rows (`valid-qr / allowed`).
2. Type the URL with no QR → Browse → blocked → ask for the row (`non-qr-dinein / blocked`).
3. Switch on → repeat 1 → ask for rows → none.
