# CR-2026-02-XX-001 — Wrap ReviewOrder.jsx + LandingPage.jsx Raw Fetches

**Status:** REGISTERED — Planning stage (Role 2)
**Raised:** 2026-02
**Author:** E1 (RE-INVESTIGATION → PLANNING handoff)
**Priority:** P1 (customer-critical residual exposure from PROD-INCIDENT-2026-07-02-001)
**Severity:** MEDIUM (only manifests under upstream slowness — but upstream slowness IS a real risk)
**Risk of change:** MEDIUM
**Fast Lane:** ❌ NOT eligible (touches CRITICAL hotspot `ReviewOrder.jsx` per Alpha v0.1 Part C)

Related:
  - `PROD-INCIDENT-2026-07-02-001` re-investigation report (2026-02, this session)
  - `CR-2026-07-03-004` frontend fetch timeouts (plumbing done, some call sites deferred)
  - `CR-2026-07-04-003` residual scope (menu empty-state UI + admin CRUD — DISTINCT from this CR)

---

## 1. Background

`CR-2026-07-03-004` shipped the plumbing (`fetchWithTimeout` helper, axios split, QueryClient retries) but explicitly scope-locked out the following two customer-critical files per Alpha v0.1 R4:

- `frontend/src/pages/ReviewOrder.jsx` — ⚠ CRITICAL hotspot (Part C §1)
- `frontend/src/pages/LandingPage.jsx` — customer entry point (Part C mentions LandingPage refactor in ROADMAP P1-1)

Between them they hold **5 raw `fetch()` calls to `REACT_APP_BACKEND_URL`** (and one to POS via `ENDPOINTS.RAZORPAY_CREATE_ORDER()`), all with **no client-side timeout**. During the next Atlas hiccup, backend fails in 5 s (CR-003) but the customer browser will still wait ~90 s on these paths → the exact "frozen tab" symptom CR-004 was meant to eliminate.

## 2. Enumerated call sites

### 2.1 `frontend/src/pages/LandingPage.jsx` — 2 calls

| # | Line | URL | HTTP | Purpose | Timeout class |
|---|---|---|---|---|---|
| L1 | 82 | `${API_URL}/api/auth/check-customer` | POST | Called when captured phone is first typed → checks if customer exists at this restaurant | **8 s (read-ish, no side effect)** |
| L2 | 596 | `${API_URL}/api/auth/check-customer` | POST | Same call, second code path (auto-redirect flow) | **8 s** |

Both go to **own-backend**. Both are functionally identical.

### 2.2 `frontend/src/pages/ReviewOrder.jsx` — 3 calls

| # | Line | URL | HTTP | Purpose | Timeout class |
|---|---|---|---|---|---|
| R1 | 139 | `${REACT_APP_BACKEND_URL}/api/loyalty-settings/{rid}` | GET | Loads loyalty rules for the restaurant | **8 s** |
| R2 | 410 | `${REACT_APP_BACKEND_URL}/api/customer-lookup/{rid}?phone={p}` | GET | Looks up customer points/wallet/profile (own-backend → CRM v2) | **8 s** |
| R3 | 953 | `ENDPOINTS.RAZORPAY_CREATE_ORDER()` = `${API_BASE_URL}/razor-pay/create-razor-order` | POST | **POS** — creates Razorpay order server-side. On the critical order-write path. | **15 s (write)** |

⚠ **R3 quirk:** this one goes to **POS**, not own-backend. It's a raw `fetch()` that bypassed the axios `apiWriteClient` (15 s) that the rest of `orderService.ts` uses. Wrapping with `fetchWithTimeout(url, opts, 15000)` gives it parity with the axios `apiWriteClient` used by `placeOrder`/`updateCustomerOrder`.

## 3. Proposed change

**Pattern:** identical to the pattern established by CR-004 in `RestaurantConfigContext.jsx:239, 276` and `AuthContext.jsx`.

### 3.1 Add one import per file

```javascript
// top of both files
import fetchWithTimeout, { DEFAULT_WRITE_TIMEOUT_MS } from '../utils/fetchWithTimeout';
// (LandingPage.jsx uses the default 8 s read, so DEFAULT_WRITE_TIMEOUT_MS only imported in ReviewOrder.jsx for R3)
```

### 3.2 Swap 5 call sites

Illustrative for L1 (identical pattern for L2, R1, R2):

```diff
- const res = await fetch(`${API_URL}/api/auth/check-customer`, {
+ const res = await fetchWithTimeout(`${API_URL}/api/auth/check-customer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ... }),
- });
+ }); // CR-2026-02-XX-001 — 8 s read
```

For R3 (POS, write class, 15 s cap):

```diff
- const createOrderResponse = await fetch(ENDPOINTS.RAZORPAY_CREATE_ORDER(), {
+ const createOrderResponse = await fetchWithTimeout(ENDPOINTS.RAZORPAY_CREATE_ORDER(), {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: String(orderResponse.order_id) })
- });
+ }, DEFAULT_WRITE_TIMEOUT_MS); // CR-2026-02-XX-001 — 15 s write (POS)
```

### 3.3 No new error-UI wiring in this CR

- Existing `try/catch` handlers stay untouched.
- `fetchWithTimeout` throws a `DOMException` with `name === 'TimeoutError'`. The existing `.catch` blocks in both files already call `logger.error(...)` and either fall through, show a `toast.error(...)`, or set an error state. **This CR does NOT alter that behavior** — a timeout will now cleanly hit the same catch block instead of hanging.
- Empty-state UI on menu-load timeout is a **separate deferred CR** (CR-2026-07-04-003) and out of scope here.

## 4. Files WILL change / WILL NOT touch

**WILL change (2 files, exact lines):**

| File | Lines touched | Nature |
|---|---|---|
| `frontend/src/pages/LandingPage.jsx` | 1 new import at top + 2 fetch swaps (lines 82, 596) | Additive |
| `frontend/src/pages/ReviewOrder.jsx` | 1 new import at top + 3 fetch swaps (lines 139, 410, 953) | Additive |

**Estimated diff:** +7 / −5 lines net across 2 files. All `CR-2026-02-XX-001` code markers.

**WILL NOT touch:**

- Backend (`server.py`) — nothing to change.
- Any other frontend file — `Login.jsx`, `FeedbackPage.jsx`, `dietaryTagsService.js`, `AdminSettings.jsx`, `AdminConfigContext.jsx`, admin pages, `crmService.js` — all remain untouched. Their exposure is documented in the re-investigation report and can be closed by follow-up CRs.
- `frontend/src/utils/fetchWithTimeout.js` — the utility itself is unchanged (already shipped in CR-004).
- `frontend/src/api/config/axios.js`, `App.js`, `orderService.ts` — no change.
- Any error-UI component / `NonQrBlockModal` / toast copy.
- `CartContext.js`, `AuthContext.jsx`, `RestaurantConfigContext.jsx` — already have their fetches wrapped by CR-004.
- Test scaffolding, `.env`, dependencies, supervisor config.
- Restaurant 716 hardcoded branch in `ReviewOrder.jsx` (BUG-006, parked). Confirmed still present at line 977, not touched.

## 5. Impact analysis

### 5.1 Steady-state (backends healthy)

| Metric | Before | After |
|---|---|---|
| L1/L2 latency (customer check) | ~50-150 ms | same |
| R1 latency (loyalty settings) | ~50-100 ms | same |
| R2 latency (customer lookup via CRM v2) | ~200-500 ms | same |
| R3 latency (Razorpay create-order via POS) | ~500-2000 ms | same |
| Error rate | baseline | baseline |
| Bundle size | baseline | +0 bytes (helper already imported by other files) |

**Zero user-visible change on happy path.**

### 5.2 Under upstream slowness (Atlas hiccup, POS slow, CRM slow)

| Scenario | Before | After |
|---|---|---|
| Customer enters phone on Landing → Mongo hangs | 30-90 s spinner then unknown | 8 s → catch block → phone submit silently fails → user can retry |
| Customer opens ReviewOrder → Mongo hangs on loyalty-settings | 30-90 s spinner, loyalty section never renders | 8 s → catch block → loyalty section defaults to no-loyalty UI |
| Customer opens ReviewOrder → CRM v2 hangs on customer-lookup | 30-90 s spinner, customer-name field stays empty for 90 s | 8 s → catch block → name field defaults to "", user types their name manually |
| Customer taps "Place Order" (Razorpay path) → POS hangs on create-razor-order | 30-90 s frozen "processing" state | 15 s → thrown → existing catch block shows toast + closes checkout gracefully |

**All four scenarios now fail fast, hitting existing catch handlers instead of hanging the UI.**

### 5.3 Under a "false positive" timeout (slow but legitimate response)

| Scenario | Before | After | Mitigation |
|---|---|---|---|
| Legit CRM lookup takes 8.2 s on a very cold cache | success | timeout error, name field stays empty | User can still complete flow — name is optional pre-populate. Not order-blocking. |
| Legit Razorpay create-order takes >15 s | success | timeout error, checkout doesn't open | Owner-visible on tab. Same behavior as any Razorpay API failure — user retries. Matches `apiWriteClient` behavior already in use by every other order write. |

### 5.4 Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | 8 s timeout on `customer-lookup` is too aggressive → some users on very cold caches see empty name field | LOW-MED | Name field is optional; user can type it. Not order-blocking. Baseline latency ~200-500 ms, so 8 s = 16-40× headroom. |
| R2 | 15 s timeout on Razorpay create-order is too aggressive → user sees "checkout failed" but order was created on POS side | LOW | Razorpay create-order is idempotent per D-02 owner assertion (INV-2026-07-03-001 resolved). Retries will not double-charge. |
| R3 | The `try/catch` in ReviewOrder.jsx line 137-146 (loyalty) silently swallows the error — user sees no toast | LOW | Existing behavior — this CR doesn't change it. If owner wants a toast, that's a separate follow-up. |
| R4 | Timeout DOMException doesn't match existing `error.response` shape used by some catch blocks | LOW | `fetchWithTimeout` throws a `DOMException` with `name: 'TimeoutError'`. All 5 existing catch blocks use `logger.error(...)` first — will log correctly. None dereference `error.response` on these paths. |
| R5 | Race condition: user submits phone twice quickly, second submit hits new timeout logic → double-abort | ZERO | `fetchWithTimeout`'s `AbortController` is per-call, no shared state. |
| R6 | `ReviewOrder.jsx` is a CRITICAL hotspot — regression could break the entire order flow | MED | (a) Diff is 5 lines + 1 import; nothing structural changes. (b) Testing agent verification required per protocol. (c) Restaurant 716 branch untouched — verified at line 977. (d) BUG-007 payment_method hardcoding untouched. |

## 6. Verification matrix

| Test | Method | Expected |
|---|---|---|
| V-01 | Static: `grep -c "await fetch(" LandingPage.jsx ReviewOrder.jsx` | ≤ 0 raw fetches remain to REACT_APP_BACKEND_URL or POS Razorpay in these 2 files (only allowed: `fetchWithTimeout`, `apiClient`, `crmFetch`) |
| V-02 | Static: `grep -c "fetchWithTimeout" LandingPage.jsx ReviewOrder.jsx` | 3 hits in LandingPage (1 import + 2 calls), 4 hits in ReviewOrder (1 import + 3 calls) |
| V-03 | Static: `grep "716" ReviewOrder.jsx` | Hardcoded 716 branch still present (unchanged) |
| V-04 | Static: `grep "payment_method: 'cash_on_delivery'"` on orderService.ts | Still hardcoded (unchanged — BUG-007 not touched) |
| V-05 | ESLint | Clean on both files |
| V-06 | `yarn build` with `CI=false` | Succeeds |
| V-07 | Supervisor restart | Clean, backend + frontend RUNNING |
| V-08 | testing_agent_v3: Happy-path — enter phone on Landing → BROWSE MENU works → cart → ReviewOrder loads loyalty + customer name → place cash order | PASS |
| V-09 | testing_agent_v3: Happy-path Razorpay — user picks Razorpay → checkout opens → payment success → OrderSuccess loads | PASS |
| V-10 | testing_agent_v3: Timeout simulation — block `/api/auth/check-customer` at browser network tab → verify Landing page recovers within 8 s and shows retry-able state (not infinite spinner) | PASS |
| V-11 | testing_agent_v3: Timeout simulation — block `/api/loyalty-settings/{rid}` → verify ReviewOrder renders without loyalty section within 8 s | PASS |
| V-12 | testing_agent_v3: Regression — ReviewOrder still renders correctly for Restaurant 716 (room selection required per BUG-006) | PASS |

⚠ V-10, V-11 require testing_agent to simulate a fetch block (browser DevTools Network → Block URL). Testing agent has this capability via Playwright's `page.route(url, r => r.abort())`.

## 7. Owner decisions needed

| # | Question | Recommended answer |
|---|---|---|
| D-01 | Approve touching `ReviewOrder.jsx` (Part C CRITICAL hotspot)? | **Required per Owner Approval Matrix §R5.** Change is 4 lines (1 import + 3 fetch swaps), no structural change, hotspot flags in Part C are about business logic (payment payload, Restaurant 716 branch), none of which are touched. |
| D-02 | Approve 8 s / 15 s timeout values? | Yes — reuses the same D-01 values from CR-004 for consistency. |
| D-03 | Approve testing_agent as sole verification agent (no manual QA before merge)? | Yes — matches CR-003 pattern where self-test + automated verification sufficed. Owner smoke can happen post-merge on preview URL. |
| D-04 | Any concern about R3 (Razorpay create-order) being a raw `fetch` instead of routed through a new `orderService.razorpayCreateOrder(...)` method? | Recommendation: raw-fetch-with-timeout is fine for this CR. Migrating to a service method is a separate refactor and would expand scope. Can be filed as follow-up if desired. |

## 8. Rollout & rollback

- **Rollout:** single commit, 2 files, ~7/−5 LOC. Frontend hot-reload picks it up. No backend/env/schema change.
- **Feature flag:** none — the change is intrinsically bounded (timeouts only manifest under real slowness).
- **Rollback:** `git revert <sha>`; frontend hot-reloads. <60 s from decision to reverted. No data migration.

## 9. Effort estimate

| Task | Time |
|---|---|
| Role 3 (Implementation) — 2 imports + 5 fetch swaps + code markers | 15 min |
| Self-test — grep verification (V-01, V-02, V-03, V-04), lint (V-05), build (V-06), supervisor (V-07) | 10 min |
| testing_agent_v3 — 5 test cases (V-08 through V-12) | ~10 min agent runtime, ~15 min my review of report |
| Fix any testing_agent findings, re-run | 15-30 min buffer |
| QA_HANDOVER write-up | 10 min |
| **Total** | **~60-75 min** |

## 10. Non-goals

Explicitly OUT of scope for this CR:

- Any other frontend file (Login.jsx, FeedbackPage.jsx, dietaryTagsService.js, AdminSettings.jsx, AdminQRPage.jsx, ContentTab.jsx, AdminConfigContext.jsx CRUD ops) — filed as CR-2026-07-04-003 residual scope.
- **CRM `crmFetch` wrapping** — owner explicitly declined this session (2026-02).
- Empty-state UI on menu-load timeout — CR-2026-07-04-003.
- Client telemetry — CR-2026-07-04-004.
- LB probe wiring — CR-2026-07-03-009 (ops team).
- Migrating R3 (Razorpay create-order) into `orderService.ts` as a service method — optional follow-up refactor.
- Any change to `payment_method` / `payment_type` semantics (BUG-007, parked).
- Any change to Restaurant 716 branch (BUG-006, parked).
- Any change to backend, `.env`, requirements.txt, supervisor.

## 11. Gate summary (Role 2 output — Alpha v0.1 §8)

```text
Planning complete: CR-2026-02-XX-001-reviewOrder-landing-fetch-timeouts
Stage: Impact Analysis + Implementation Plan
Code reality: PARTIAL (fetchWithTimeout util exists; 5 call sites unwrapped in target files)
Risk: MEDIUM
Files WILL change: 2
  - frontend/src/pages/LandingPage.jsx    (1 import + swap lines 82, 596)
  - frontend/src/pages/ReviewOrder.jsx    (1 import + swap lines 139, 410, 953)
Files WILL NOT touch:
  - backend/server.py
  - all other frontend files
  - .env, requirements.txt, supervisor
  - Restaurant 716 branch, payment_method/type semantics (BUG-006/007 parked)
  - fetchWithTimeout.js (unchanged)
Owner decisions:
  D-01 Approve hotspot touch on ReviewOrder.jsx? (REQUIRED — R5 of Owner Approval Matrix)
  D-02 Approve 8 s / 15 s timeouts? (default: yes, mirrors CR-004 D-01)
  D-03 Approve testing_agent as sole pre-merge QA? (default: yes)
  D-04 Approve R3 as raw-fetch-with-timeout vs. service-method refactor? (default: raw-fetch-with-timeout, in scope)
Prerequisites:
  - CR-2026-07-03-004 fetchWithTimeout util shipped ✓
Next: Owner approval → Role 3 (Implementation) → self-test → testing_agent_v3 → QA_HANDOVER
```

---

*End of Impact Analysis + Implementation Plan.*
