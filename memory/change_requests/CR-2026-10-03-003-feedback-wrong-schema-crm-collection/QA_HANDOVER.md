# QA HANDOVER — CR-2026-10-03-003

**From:** Role 3 (E1) · **To:** Role 4 (QA) · **Date:** 2026-10-07
**Plan:** `IMPLEMENTATION_PLAN.md` · **Self-test:** `SELF_TEST.md` (T1, T3, T5, T7–T12 PASS; T2 partial — known; T4, T6 deferred to QA)

## What changed
| File | Change |
|---|---|
| `frontend/src/api/services/crmService.js` | + `crmSubmitFeedback(token, {rating, message, orderId, restaurantId})` → `POST /scan/feedback` |
| `frontend/src/pages/FeedbackPage.jsx` | Posts to CRM; Name/Email removed; no-token → sign-in card; `setRestaurantScope` restore + `Loading…` gate; newest-order lookup (silent) |
| `frontend/src/pages/FeedbackPage.css` | `.feedback-input` dropped, `.feedback-signin` added |
| `backend/server.py:1293-1297` | `FeedbackCreate`, `POST /config/feedback`, `GET /config/feedback/{rid}` deleted |
| `backend/tests/smoke/test_cr_2026_10_03_003.py` | new, 4 tests |
| `backend/tests/contracts/test_public_config.py` | `test_config_feedback_478` now asserts route gone; snapshot removed |

## Invariants QA must try to break
1. Our backend never writes feedback anywhere. 2. No "Thank you" unless CRM returned 2xx. 3. Page never calls `skip-otp`/`register`/`lookup`. 4. Logged-in diner on hard refresh still sees the form (not the sign-in card).

## How to get a diner session (no UI login needed)
`curl -X POST {REACT_APP_CRM_URL}/scan/auth/skip-otp -H 'Content-Type: application/json' -d '{"phone":"<TEST_PHONE>","restaurant_id":"478"}'` → `data.token`. In the browser: `localStorage.setItem('crm_token_478', '<token>')` then load `/478/feedback`. Clear storage for the no-token case.

## Test-ids
`feedback-page` · `feedback-loading` · `feedback-signin-required` · `feedback-signin-btn` · `feedback-form` · `feedback-stars` · `feedback-star-N` · `feedback-message` · `feedback-submit-btn` · `feedback-success` · `feedback-back-btn`. **Removed:** `feedback-name`, `feedback-email`.

## QA cases
| # | Case | Expected |
|---|---|---|
| Q1 | Token set → `/478/feedback` → 4 stars + message → Submit | exactly one `POST …/scan/feedback` with Bearer, body `{rating:4, restaurant_id:"478", message}`; `feedback-success` visible; success toast |
| Q2 | Token set → hard refresh `/478/feedback` | brief `feedback-loading`, then **form** (not sign-in card) |
| Q3 | Storage cleared → `/478/feedback` | sign-in card; **0** requests to `scan/feedback` or `orders`; "Sign in" → `/478` |
| Q4 | Token set; intercept `POST **/scan/feedback` → 500 (or abort) → Submit | error toast "Failed to submit. Please try again."; form stays; **no** success panel |
| Q5 | Token set; Submit with no stars / empty message | toast "Please add a rating and a message"; **0** POSTs |
| Q6 | Token set; double-click Submit | one POST only; button disabled while submitting |
| Q7 | Intercept `GET /api/config/478` → set `feedbackEnabled:false`; open `/478` landing | Feedback entry hidden in landing menu (pre-existing behaviour, confirm unchanged) |
| Q8 | Backend: `POST /api/config/feedback` and `GET /api/config/feedback/478` | 404 or 405 |
| Q9 | Backend: `GET /api/config/478` | 200 |
| Q10 | `pytest -m smoke backend/tests/smoke/ -v` · `pytest -m contract backend/tests/ -v` | 19 + 14 pass |
| Q11 | Known: `GET /customer/me/orders?limit=1` fires on open and returns 404 | page unaffected (silent) — report as NOTE, not defect (CR-2026-09-15-001) |
| Q12 | Regression: `/478` landing, `/478/menu`, `/478/review-order` render; no console errors mentioning FeedbackPage/crmSubmitFeedback | pass |

## Known NOTE
`order_id` is never attached until CR-2026-09-15-001 fixes `crmGetOrders` (v1 path on v2 CRM). Writes to CRM staging are real — use the test phone only.
