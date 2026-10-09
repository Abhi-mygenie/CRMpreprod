# CR-2026-07-03-004 — Frontend Fetch Timeouts + AbortController

**Status:** 🚧 IMPLEMENTED, QA-pending (Role 3 shipped 2026-07-04; plumbing scope only — AlertDialog + empty-state UI deferred to follow-up CR per Scope Lock)
**Raised:** 2026-07-03
**Author:** E1 (INVESTIGATION → PLANNING role handoff)
**Priority:** P2 (recommended follow-up to CR-2026-07-03-003)
**Severity:** MEDIUM (user-visible only during upstream slowness — but that upstream slowness IS a real risk based on 2026-07-02 incident)
**Risk of change:** MEDIUM (touches provider files marked HIGH-risk in the operating prompt PART C: `AuthContext.jsx`, `RestaurantConfigContext.jsx`, and `useMenuData.js`)
**Fast Lane:** NOT eligible

Related:
  - CR-2026-07-03-003 (backend timeouts) — this CR complements it on the client side.
  - Incident PROD-INCIDENT-2026-07-02-001 where `manage.mygenie.online` also hung; A1+A2 do not cover this path.

---

## 1. Background

The customer-app frontend calls **five** independent backends:

| # | Env var | Base URL | Owned by | Timeout today |
|---|---|---|---|---|
| 1 | `REACT_APP_BACKEND_URL` | Local FastAPI | Us | none (browser default ~90 s) |
| 2 | `REACT_APP_API_BASE_URL` | `preprod.mygenie.online/api/v1` (POS) | MyGenie | axios default (none) |
| 3 | `REACT_APP_IMAGE_BASE_URL` | `manage.mygenie.online` (storage + distance-api) | MyGenie | none |
| 4 | `REACT_APP_CRM_URL` | CRM | MyGenie | none |
| 5 | `REACT_APP_GOOGLE_MAPS_API_KEY` | maps.googleapis.com | Google | none |

Every one of these can hang. CR-2026-07-03-003 fixes only backend #1. This CR
fixes the client-side experience regardless of which backend hangs.

## 2. Observation from the 2026-07-02 incident

At 21:30 IST, `manage.mygenie.online` was upstream-stuck (see nginx premature-close log). Every customer-facing page opened at that moment:

- Called `POST /web/menu-master` (POS) → hung indefinitely
- Called `POST /web/restaurant-info` (POS) → hung indefinitely
- Called `GET /storage/<logo>.png` → hung indefinitely
- Tab showed a spinner for 60-90 s with no error UI

CR-2026-07-03-003 would NOT have helped that scenario because our
FastAPI is not in the request path for these calls.

## 3. Proposed change

Add three primitives, wire them in **at the boundary**, do NOT rewrite consumer code:

### 3.1 A `fetchWithTimeout(url, opts, timeoutMs=8000)` helper
- Wraps native `fetch()` with an `AbortController`.
- Aborts with a typed error `TimeoutError` when the deadline passes.
- Ignore `AbortError` in downstream `.catch()` — treated as expected.

### 3.2 Axios global timeout on `apiClient` (already exists in `api/config/axios.js`)
- Set `timeout: 15000` for order-write operations (which need more time).
- Set `timeout: 8000` for reads.
- Achievable via two axios instances (`apiReadClient`, `apiWriteClient`) OR
  via per-call overrides in each service.

### 3.3 React Query defaults
- `queryClient` default `queryFn` gets a signal-aware wrapper so React Query
  cancels in-flight requests when the component unmounts.
- Retry policy: `retry: 2, retryDelay: (i) => Math.min(1000 * 2 ** i, 5000)` (exponential up to 5 s).
- `staleTime` unchanged.

## 4. Files WILL change / WILL NOT touch

**WILL change (estimate — final list confirmed at implementation):**

| File | Purpose | LOC |
|---|---|---|
| `frontend/src/api/config/axios.js` | add timeouts, split read/write client | ~15 |
| `frontend/src/utils/fetchWithTimeout.js` | **new** helper | ~30 |
| `frontend/src/context/AuthContext.jsx` | replace 4 raw `fetch()` calls with `fetchWithTimeout` | ~8 |
| `frontend/src/context/RestaurantConfigContext.jsx` | replace 3 raw `fetch()` calls | ~6 |
| `frontend/src/context/AdminConfigContext.jsx` | replace 1 raw `fetch()` call (after CR-2026-07-03-002 lands) | ~4 |
| `frontend/src/hooks/useMenuData.js` | React Query default retry / signal | ~10 |
| `frontend/src/App.js` | `QueryClient` defaults | ~5 |

**WILL NOT touch:**
- Any customer-facing component's JSX / render logic
- Any admin form / order flow business logic
- Backend routes, envs, .env values
- `RestaurantConfigContext.jsx` cache-first logic delivered in CR-2026-07-03-001
- POS API contract on MyGenie side
- Any test / seed data
- Design tokens, Tailwind config, brand assets

## 5. Impact analysis

### 5.1 Steady state (all backends healthy)

| Concern | Impact |
|---|---|
| p50 latency | unchanged (timeouts don't fire) |
| p99 latency | unchanged for normal traffic |
| Bundle size | +~1 KB (helper + axios options) |
| Existing consumer contracts | unchanged (same return values, same errors — `TimeoutError` is a NEW error type consumers can ignore or handle) |
| CPU / memory | negligible |

### 5.2 During a real backend slowness (like 21:30 IST)

| Concern | Today | After |
|---|---|---|
| User waits per stuck call | up to browser default (~90 s) | 8 s (reads) / 15 s (writes) |
| Skeleton / spinner behavior | infinite | resolves to error UI at cap |
| React Query cache | never receives resolve/reject → app stuck | receives rejection → retry with backoff → eventually surfaces error toast |
| Concurrent stuck fetches | pile up in JS event loop, browser tab becomes janky | bounded parallelism, GC'd predictably |

### 5.3 Downsides / risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Legit slow endpoint (e.g., large image upload) trips 8-15 s timeout | LOW | Uploads use `apiWriteClient` (15 s) or per-call override. Chunk large uploads or raise cap for that specific endpoint. |
| R2 | Poor mobile networks hit timeout more often | MED | Exponential retry + user-visible "Retry" button. Same experience as any modern app. |
| R3 | React Query cache stampede on retry after outage | LOW | `queryClient` has `staleTime` and dedup by key — no stampede |
| R4 | AbortError leaking into UI as generic "Something went wrong" | LOW-MED | Error boundary handles `AbortError` specifically → silent |
| R5 | Backwards compat with `.catch(() => null)` sites | LOW | AbortError is a subclass of DOMException — same catch clause catches it |
| R6 | Touches HIGH-risk provider files (per operating prompt PART C) | MED (procedural) | Full CR planning + owner approval + QA cycle before merge |
| R7 | Order-create timeout too short → double-order risk | LOW-MED | Order create uses `apiWriteClient` with 15 s and server idempotency key (verify at implementation time) |

### 5.4 Order-critical safety

The order-create path DESERVES special attention. If the client times out but the server actually completed the order, we get double-orders.

**Pre-requisite before implementing:**
1. Audit the order-create path (`ReviewOrder.jsx` → order service) for idempotency.
2. If server does not enforce idempotency, EITHER:
   - Add server-side idempotency (owner decision, separate CR)
   - OR set order-create timeout very high (30 s) and never retry on 5xx / timeout

## 6. Verification matrix

| # | Test | Pre-CR | Post-CR expected |
|---|---|---|---|
| 1 | Happy-path `/698` load | works | works |
| 2 | Happy-path admin login | works | works |
| 3 | Happy-path order create | works | works |
| 4 | Simulate `preprod.mygenie.online` 30 s hang (mock server) — customer app `/698` | spinner 90 s | error UI at 8 s |
| 5 | Simulate FastAPI hang (block Mongo) — admin login | spinner 30-90 s | error UI at 8 s |
| 6 | Same as 5, but on order-create | risky (double-order risk if user retries) | error UI at 15 s, "Retry" gated on idempotency verified |
| 7 | Component unmount while fetch is in-flight | fetch continues (memory waste) | fetch aborted, no memory leak |
| 8 | Slow 3G throttle in DevTools | pages barely load | pages load slower but do load; some non-critical requests may hit 8 s cap. Assess acceptable. |
| 9 | Existing e2e Playwright tests | pass | pass |
| 10 | Login → menu → order-review → order flow | pass | pass |

## 7. Owner decisions needed

1. **Approve timeouts: 8 s read / 15 s write?** Owner may override.
2. **Confirm order-create idempotency** before touching that path. If unknown, EXCLUDE order-create from this CR and file a separate one.
3. **Approve React Query retry policy** (`retry: 2, exponential backoff up to 5 s`)? Owner may override.
4. **Approve introduction of `fetchWithTimeout` as project-wide utility**? Alternative: use only axios, migrate every `fetch()` to axios.
5. **Approve error UI treatment** — silent retry vs. toast vs. blocking error state? Design agent may need to weigh in.

## 8. Rollout & rollback

- **Rollout:** Requires design agent review for the error UI. Recommended:
  1. Land `fetchWithTimeout` + axios timeouts + Query retry defaults FIRST (invisible to users on happy path).
  2. Land component-level error UI as a follow-up (visible during outage).
- **Feature flag:** if uncertain, put timeouts behind `REACT_APP_ENABLE_FETCH_TIMEOUTS` env for the first 48 h.
- **Rollback:** `git revert`; frontend hot-reloads. Estimated < 60 s.

## 9. Effort estimate

- Implementation: 3-4 hours (multiple files, careful).
- Self-test: 1-2 hours (need to simulate slow backends).
- QA: half-day.
- Total: 1 dev-day.

## 10. Registration

- ID: `CR-2026-07-03-004-frontend-fetch-timeouts`
- Folder: `/app/memory/change_requests/CR-2026-07-03-004-frontend-fetch-timeouts/`
- Companion: `IMPLEMENTATION_PLAN.md` (same folder).
- To be added on implementation: `QA_HANDOVER.md`.

---

## 11. Gate summary (Role 2 output)

```text
Planning complete: CR-2026-07-03-004
Stage: Impact Analysis + Implementation Plan
Code reality: EMPTY (no client-side timeouts anywhere today)
Risk: MEDIUM (touches HIGH-risk provider files; requires owner + design input)
Files WILL change (estimate 7):
  - frontend/src/api/config/axios.js
  - frontend/src/utils/fetchWithTimeout.js (new)
  - frontend/src/context/AuthContext.jsx
  - frontend/src/context/RestaurantConfigContext.jsx
  - frontend/src/context/AdminConfigContext.jsx
  - frontend/src/hooks/useMenuData.js
  - frontend/src/App.js
Files WILL NOT touch: any customer-facing JSX, order business logic,
  backend, design tokens, POS contract
Owner decisions:
  1. Approve 8 s / 15 s timeouts?
  2. Confirm order-create idempotency BEFORE touching that path
  3. Approve React Query retry policy (retry:2, exp backoff)
  4. fetchWithTimeout utility vs. all-axios refactor?
  5. Approve error UI treatment (needs design agent for the UI part)
Prerequisite: CR-2026-07-03-003 SHOULD be merged first (reduces the
              scope of failure modes this CR has to cover).
Next: Owner approval → design agent for error UI → IMPLEMENTATION role
```
