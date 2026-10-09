# QA Handover — CR-2026-02-XX-001

**Title:** Wrap 5 raw fetch() calls in LandingPage.jsx + ReviewOrder.jsx with fetchWithTimeout
**CR:** `/app/memory/change_requests/CR-2026-02-XX-001-reviewOrder-landing-fetch-timeouts/CR.md`
**Status:** ✅ IMPLEMENTED + testing_agent VERIFIED — awaiting owner smoke sign-off
**Testing report:** `/app/test_reports/iteration_1.json` (5/5 PASS, 100%)
**Owner approvals honored:** D-01, D-02, D-03, D-04 all approved 2026-02

---

## 1. What shipped

| File | Change | Lines |
|---|---|---|
| `frontend/src/pages/LandingPage.jsx` | +1 import (`fetchWithTimeout`) + 2 fetch→fetchWithTimeout swaps | 23, 82, 596 |
| `frontend/src/pages/ReviewOrder.jsx` | +1 import (`fetchWithTimeout, DEFAULT_WRITE_TIMEOUT_MS`) + 3 fetch→fetchWithTimeout swaps | 34, 139, 410, 953 |

Net diff: `+11 / −9` LOC across 2 files. Every touched line carries a `// CR-2026-02-XX-001` marker.

## 2. What testing_agent verified (5/5 PASS)

| # | Test case | Result |
|---|---|---|
| TC1 | Happy path: Landing check-customer succeeds under normal network | ✅ PASS — no hang, no JS error |
| TC2 | Happy path: `/478/review-order` renders | ✅ PASS — empty-cart auto-redirect (existing behavior) preserved |
| TC3 | Timeout simulation: `/api/auth/check-customer` hung via `page.route(url, r => new Promise())` | ✅ **PASS — console logs `TimeoutError: fetch to .../api/auth/check-customer exceeded 8000 ms` at exactly 8 s. UI remained responsive throughout.** |
| TC4 | Timeout simulation: `/api/loyalty-settings/**` + `/api/customer-lookup/**` hung | ✅ PASS — TimeoutError fires at 8 s, page renders, no crash |
| TC5 | Static verification | ✅ PASS — 0 bare `fetch(` to REACT_APP_BACKEND_URL or POS Razorpay in target files; imports present; Restaurant 716 branch preserved (11 refs); BUG-007 hardcode preserved (2 refs in orderService.ts) |

## 3. Verification matrix status (from CR §6)

| # | Test | Method | Actual | Verdict |
|---|---|---|---|---|
| V-01 | Bare fetch remaining | `grep -cE '\bfetch\s*\(' ...` filtered `-v fetchWithTimeout` | 0 hits | ✅ |
| V-02 | fetchWithTimeout usage | grep count | LandingPage 3, ReviewOrder 4 | ✅ |
| V-03 | Restaurant 716 branch | `grep -c "'716'" ReviewOrder.jsx` | 11 | ✅ |
| V-04 | payment_method hardcode | `grep` on orderService.ts | 2 | ✅ |
| V-05 | ESLint on both files | `mcp_lint_javascript` | LandingPage clean; ReviewOrder: 6 pre-existing errors at lines 1338-1511 (`response is not defined` in a catch block, unrelated to this CR — confirmed via `git diff`) | ✅ (new = 0) |
| V-06 | Frontend build | Hot-reload picked up cleanly | RUNNING (uptime > 1h through edits) | ✅ |
| V-07 | Supervisor state | `sudo supervisorctl status` | backend + frontend RUNNING | ✅ |
| V-08 | Happy-path menu → cart → review | testing_agent TC2 | PASS | ✅ |
| V-09 | Razorpay happy path | testing_agent (skipped — requires POS token + Razorpay checkout; static verified R3 correctly uses DEFAULT_WRITE_TIMEOUT_MS) | Static PASS; runtime deferred to owner smoke | ⚠ Owner-smoke |
| V-10 | Landing timeout recovery | testing_agent TC3 | PASS | ✅ |
| V-11 | ReviewOrder loyalty timeout recovery | testing_agent TC4 | PASS | ✅ |
| V-12 | Restaurant 716 behavior regression | Static (grep 716 preserved) + testing_agent TC2 (page renders) | PASS static; runtime for 716-specific flow deferred to owner smoke | ⚠ Owner-smoke |

## 4. Landmines confirmed still intact

- ⚠ Restaurant 716 hardcoded branch (BUG-006, parked) — 11 references still in `ReviewOrder.jsx` (lines 202, 555, 568, 870, 879, 980, 1030, 1156, 1298, 1367, 1472)
- ⚠ `payment_method: 'cash_on_delivery'` hardcode (BUG-007, parked) — 2 references in `orderService.ts` (lines 386, 523)
- ⚠ Provider stack order in `App.js` — untouched
- ⚠ localStorage key names — untouched
- ⚠ `fetchWithTimeout.js` utility — untouched (unchanged since CR-004)

## 5. Owner smoke checklist (5 minutes)

Please spot-check on the preview URL to close V-09 and V-12:

1. Open `https://mygenie-fullstack.preview.emergentagent.com/478?tableId=1` (with QR context so non-QR block doesn't fire)
2. Enter phone + name → BROWSE MENU → verify menu loads
3. Add 1 item to cart → open ReviewOrder
4. Select **Razorpay** payment mode → Place Order → verify Razorpay checkout opens (or a proper error toast if POS creds are still placeholder — placeholder POS creds are a separate open issue)
5. Try `/716/menu` briefly → open ReviewOrder → verify room selection UI still enforces per Restaurant 716 branch

If all 5 look normal, this CR is fully closed.

## 6. Rollback

`git revert <sha>` on the two-file diff → frontend hot-reloads → done in <60 s. No env, no schema, no dep change.

## 7. Post-merge action items (out of scope for this CR)

- CR-2026-07-04-003 (residual scope): wrap the remaining 8 files (`Login.jsx`, `FeedbackPage.jsx`, `dietaryTagsService.js`, `AdminSettings.jsx`, `AdminQRPage.jsx`, `ContentTab.jsx`, `AdminConfigContext.jsx` CRUD ops) + menu-load empty-state UI.
- CR-2026-07-04-004 (client telemetry): so the next timeout event is visible in the DB.
- CR-2026-07-03-009 (OPS): wire LB probe to `/api/healthz`.
- Pre-existing lint bug in `ReviewOrder.jsx` (`response is not defined` in catch block at lines 1343/1503-1511) — file as a separate INV.
- CRM `crmFetch` wrapping — explicitly declined this session (owner decision 2026-02).

---

*End of QA Handover. This CR is ready for owner smoke (§5) → then close.*
