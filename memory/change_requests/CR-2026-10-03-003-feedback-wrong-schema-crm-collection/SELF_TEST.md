# SELF-TEST — CR-2026-10-03-003 (Role 3, 2026-10-07)

Environment: preview pod; CRM = `REACT_APP_CRM_URL` (preprod CRM staging); diner session via `POST /scan/auth/skip-otp` for `TEST_PHONE` @ 478 (same call the landing page makes). Two real feedback rows were written to CRM staging for the test customer (curl + E2E) — tagged "CR-2026-10-03-003 self-test".

| # | Plan ref | Result | Evidence |
|---|---|---|---|
| T1 | Acc. 1 | **PASS** | E2E: token in `crm_token_478` → form (stars + message only) → Submit → `POST /api/scan/feedback` body `{"rating":4,"restaurant_id":"478","message":"…"}` → "Thank You" panel. curl: `{"success":true,"data":{"feedback_id":"71e8650e-…"}}` HTTP 200 |
| T2 | D7-i | **PARTIAL — see Deviation 1** | `GET /customer/me/orders?limit=1` fired on open; CRM v2 returns **404** for that v1 path → silent, `order_id` omitted, submit still 2xx |
| T3 | Acc. 2 / D2 | **PASS** | cleared storage → sign-in card (`feedback-signin-required`), no form, **0** feedback/orders requests; "Sign in" → `/478` |
| T4 | Acc. 4 | **DEFERRED → QA** | CRM-down / 500 path (intercept) |
| T5 | Acc. 3 | **PASS** | `grep "db.feedback\|FeedbackCreate\|config/feedback"` → only the marker comment |
| T6 | Acc. 5 | **DEFERRED → QA** | `feedbackEnabled:false` hides entry (unchanged code path) |
| T7 | build | **PASS** | webpack compiled; only pre-existing warnings in untouched files |
| T8 | adjacent | **PASS** | `GET /api/config/478` → 200 (pytest); `/api/config/banners/478` → 405 as before (POST-only route) |
| T9 | tests | **PASS** | smoke new 4/4 · smoke all 19/19 · contract 14/14 (see Deviation 2) |
| T10 | UX | **PASS (by code)** | `disabled={submitting}` unchanged |
| T11 | validation | **PASS** | empty submit → toast, **0** POSTs |
| T12 | CRM-side | **PASS (API)** | CRM returned `feedback_id`; row-level check via CRM team at smoke |

## Deviations from plan (Role 3 → owner)

1. **D7-i cannot deliver `order_id` today.** `crmGetOrders` (`crmService.js:399`) calls the **v1** path `/customer/me/orders`; CRM v2 serves `GET /scan/orders` (contract §4b line 111) — verified: v1 → 404, v2 → 200 `{orders:[],total:0}`. This is the pre-existing defect that **CR-2026-09-15-001** (Profile → CRM v2 adapter, INTAKE) fixes; the Profile "Orders" tab is broken by the same cause. **Not fixed here** — out of scope; the feedback code is already correct for the unwrapped v2 shape (`d.orders[0].id`) and will start attaching `order_id` the moment CR-2026-09-15-001 ships. Failure is silent by design; feedback works without it.
2. **Contract test updated.** `backend/tests/contracts/test_public_config.py::test_config_feedback_478` asserted the deleted `GET /config/feedback/478` → 200 + snapshot. Changed to assert 404/405 and removed `__snapshots__/test_public_config/test_config_feedback_478.json`. This is the intended contract change of D9, not a regression.
3. **One addition not in the plan: `setRestaurantScope(restaurantId)` + `scopeReady` gate.** Without it, a deep-link / hard refresh of `/478/feedback` never restores the stored CRM token (AuthContext only loads it when a page calls `setRestaurantScope`, as Landing/ReviewOrder/DeliveryAddress do) — the first E2E attempt showed the sign-in card to a logged-in diner. Same pattern as `LandingPage.jsx:213`; a "Loading…" line (`feedback-loading`) prevents the sign-in card flashing while the token is validated. Invariant 4 holds (read-only use of the existing hook).

Code markers: `grep -rc "CR-2026-10-03-003"` → FeedbackPage.jsx 4 · FeedbackPage.css 1 · crmService.js 1 · server.py 1 · test_cr_2026_10_03_003.py 1 · test_public_config.py 1.
