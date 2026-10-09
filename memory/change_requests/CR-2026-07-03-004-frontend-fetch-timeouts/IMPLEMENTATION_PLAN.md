# Implementation Plan — CR-2026-07-03-004

**Companion doc:** `CR.md` (same folder).
**Role:** PLANNING — refreshed 2026-07-04 with owner decisions + design-agent output.
**Prerequisite:** CR-2026-07-03-003 (✅ SHIPPED) + CR-2026-07-03-000 (🚧 IMPLEMENTED).

---

## 0. Owner decisions (recorded 2026-07-04)

| ID | Question | Owner answer | Date | Notes |
|---|---|---|---|---|
| D-01 | 8 s read / 15 s write timeouts | ✅ Approved as standard | 2026-07-04 | Matches Google web.dev / Stripe / Shopify norms |
| D-02 | Order-create idempotency | ✅ **"Backend takes care of that"** — POS enforces server-side | 2026-07-04 | Recorded as owner assertion in `INV-2026-07-03-001/CR.md`; if a double-order incident ever occurs, that record identifies the source of the safety guarantee |
| D-03 | React Query retry policy (`retry:2, exp backoff up to 5 s`) | ✅ Approved | 2026-07-04 | |
| D-04 | `fetchWithTimeout` helper vs. all-axios migration | ✅ Helper approved | 2026-07-04 | All-axios rejected — 60-file refactor, zero user benefit |
| D-05 | Error-UI treatment | ✅ Design agent output → `/app/design_guidelines.json` | 2026-07-04 | 3 patterns: empty-state / AlertDialog / Toast |

## 0.1 Design-agent output summary (D-05)

| Context | Pattern | shadcn/ui components | Copy | `data-testid` |
|---|---|---|---|---|
| **Menu-load timeout (read)** | Empty-state-with-CTA replacing skeleton | `div` + `Button` | "We're having trouble loading the menu. Please try again." | `timeout-error-menu-load-retry-button` |
| **Order-create timeout (write)** | Blocking `AlertDialog` | `AlertDialog*` full family | "Connection timed out. We couldn't confirm your order. Please check with your server or try placing it again." | `timeout-error-order-alert-dialog` |
| **Background config fetch** | Non-blocking `useToast` | `useToast` hook | "Some restaurant details are taking a moment to update." | `timeout-error-config-toast` |

Full spec incl. accessibility + interaction rules: `/app/design_guidelines.json`.

---

## 1. Illustrative diffs (for review only — patch applied later)

### 1.1 New utility — `frontend/src/utils/fetchWithTimeout.js`

```js
// CR-2026-07-03-004 — fetch wrapper with a hard deadline via AbortController.
// Throws a plain Error with `.name === 'TimeoutError'` on deadline.
// Aborts propagate as DOMException 'AbortError' — treat as expected.
export const DEFAULT_READ_TIMEOUT_MS = 8000;
export const DEFAULT_WRITE_TIMEOUT_MS = 15000;

export function fetchWithTimeout(url, opts = {}, timeoutMs = DEFAULT_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const signal = opts.signal
    ? mergeSignals(opts.signal, controller.signal)
    : controller.signal;
  const timer = setTimeout(() => controller.abort(new DOMException(
    `fetch to ${url} exceeded ${timeoutMs} ms`, 'TimeoutError'
  )), timeoutMs);
  return fetch(url, { ...opts, signal }).finally(() => clearTimeout(timer));
}

function mergeSignals(a, b) {
  // Compose two AbortSignals — either firing aborts the fetch.
  const c = new AbortController();
  [a, b].forEach(s => {
    if (s.aborted) c.abort(s.reason);
    else s.addEventListener('abort', () => c.abort(s.reason), { once: true });
  });
  return c.signal;
}
```

### 1.2 `frontend/src/api/config/axios.js`

```diff
-const axiosInstance = axios.create({
-  baseURL: process.env.REACT_APP_API_BASE_URL,
-  ...
-});
+// CR-2026-07-03-004 — dual clients so reads and writes can have different caps.
+const apiReadClient = axios.create({
+  baseURL: process.env.REACT_APP_API_BASE_URL,
+  timeout: 8000,
+  ...
+});
+const apiWriteClient = axios.create({
+  baseURL: process.env.REACT_APP_API_BASE_URL,
+  timeout: 15000,
+  ...
+});
+export { apiReadClient, apiWriteClient };
+// Default export stays for backward compat (points at read client).
+export default apiReadClient;
```

### 1.3 `AuthContext.jsx` (4 raw fetches)

```diff
-  const response = await fetch(`${API}/api/auth/login`, {
+  const response = await fetchWithTimeout(`${API}/api/auth/login`, {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify(payload)
-  });
+  }, DEFAULT_WRITE_TIMEOUT_MS);
```

Repeat for `/api/auth/send-otp`, `/api/auth/me`, `/api/auth/check-customer`.

### 1.4 `RestaurantConfigContext.jsx` (3 raw fetches, all reads)

```diff
-  const response = await fetch(`${API_URL}/api/config/${restaurantId}`);
+  const response = await fetchWithTimeout(`${API_URL}/api/config/${restaurantId}`);
```

### 1.5 `useMenuData.js` — React Query default retry

```diff
 const useMenuSections = (restaurantId) => useQuery({
   queryKey: ['menu-sections', restaurantId],
   queryFn: () => getMenuSections(restaurantId),
+  retry: 2,
+  retryDelay: (i) => Math.min(1000 * 2 ** i, 5000),
   staleTime: 10 * 60 * 1000,
 });
```

Or lift to QueryClient defaults in `App.js`:

```diff
-const queryClient = new QueryClient();
+const queryClient = new QueryClient({
+  defaultOptions: {
+    queries: {
+      retry: 2,
+      retryDelay: (i) => Math.min(1000 * 2 ** i, 5000),
+      staleTime: 10 * 60 * 1000,
+    },
+  },
+});
```

Net diff: **~+80 / −20 LOC across 7 files**.

---

## 2. Order-create safety (BLOCKS THE ORDER-CREATE part of this CR)

Before touching order-create timeout, IMPLEMENTATION role MUST:

1. `grep -rn "order.*create\|createOrder\|placeOrder" /app/frontend/src` → identify the call site.
2. Read the corresponding POS endpoint (typically `POST /web/place-order` or similar).
3. Confirm one of:
   - Server rejects duplicate `order_reference_id` (idempotency key), OR
   - Server rejects orders inside 30 s of an identical prior order (dedup window), OR
   - Client uses a unique idempotency key per attempt.

If NONE of the above hold, **DO NOT apply timeout to order-create in this CR**. File a blocker: "Order-create idempotency verification" as a separate P1 CR, and use a 30 s timeout (or NO timeout) for order-create until that lands.

---

## 3. Order of implementation (safest sequence)

1. **Ship the utility** — `fetchWithTimeout.js` as an isolated file, no consumers wired yet. Merge, verify build.
2. **Ship axios read/write split** — dual `apiReadClient` (8 s) + `apiWriteClient` (15 s). Merge, verify no regression.
3. **Ship QueryClient defaults in `App.js`** — retry:2 + exp backoff. Instantly applies to every existing `useQuery`.
4. **Ship AuthContext** — 4 raw fetches wrapped. Auth is the least catastrophic to timeout (worst case: user re-logs in).
5. **Ship RestaurantConfigContext** — read-only, cache-first fallback protects UX during timeouts.
6. **Ship AdminConfigContext initial fetch** — 1 raw fetch (deferred: 5 CRUD fetches to follow-up CR).
7. **Ship useMenuData signal-aware** — user-visible if wrong; verify with real users on canary.
8. **Ship order-create timeout + AlertDialog** — DEFERRED, then **REVISED (2026-07-04):** dropped from scope. `ReviewOrder.jsx` line 1347 already shows a well-worded network-loss toast that duplicates the AlertDialog message. Adding a blocking dialog on top would be UX regression. See step 8b for the residual micro-fix.
9. **Ship error-UI wiring** — Toast on config providers ONLY (D-05 pattern 3). Empty-state on menu-load DEFERRED (needs LandingPage/MenuItems edits). AlertDialog DROPPED (see step 8).

### Step 8b (added 2026-07-04) — orderService.ts micro-fix

**Rationale:** After steps 1–7 shipped, discovered `orderService.ts` imports the default axios export (now = `apiReadClient` with 8 s timeout). That means `placeOrder()`, `checkTableStatus()`, `getOrderDetails()` all run with an 8 s cap. Legitimate slow orders on flaky mobile networks (8–15 s window) get cancelled unnecessarily and trigger the network-loss toast even though POS would have accepted the order.

**Fix:** two-line change in `/app/frontend/src/api/services/orderService.ts`:

```diff
-import apiClient from '../config/axios';
+// CR-2026-07-03-004 — order-create is a WRITE. Use 15 s write client, not 8 s read.
+import { apiWriteClient as apiClient } from '../config/axios';
```

**Why safe:**
- No API contract change; every downstream call still uses `apiClient.post(...)`.
- Rollback = revert 2 lines.
- All 4 functions in orderService.ts (`placeOrder`, `updateCustomerOrder`, `checkTableStatus`, `getOrderDetails`) legitimately benefit from 15 s cap.
- No hotspot file touched (orderService.ts is a service, not a page/context/hook).
- No test breakage (no test refs the axios import choice).

**Impact:**
- Before micro-fix: order-create cancels at 8 s → user sees existing network-loss toast even for legitimate slow orders → user re-taps → POS idempotency dedups → but user is confused.
- After micro-fix: order-create waits full 15 s. The 8–15 s slow-but-successful window is now respected.

Each step is a separate commit; each is independently revertable.

---

## 4. Self-test plan (playwright script — outline only, IMPLEMENTATION writes it)

```python
# Test 1: happy path
await page.goto("/698")
assert (await page.locator("[data-testid='browse-menu-btn']").is_visible())

# Test 2: force a 30 s hang on /api/config via nginx pause
await page.route("**/api/config/**", lambda route: asyncio.sleep(30))
await page.goto("/698")
# assert an error UI appears at ~8s ± 1s

# Test 3: no memory leak on rapid nav
for i in range(20):
    await page.goto(f"/698?nocache={i}")
    await page.goto("/716")
# assert JS heap stable

# Test 4: React Query retry after transient
# ... programmable mock that fails twice, succeeds third
```

---

## 5. Acceptance criteria (from CR §6)

| # | Criterion | Owner-visible |
|---|---|---|
| 1 | Happy paths unchanged (login, /698, /716, admin) | YES |
| 2 | 30 s upstream hang surfaces error UI at 8-9 s (reads) | YES — Empty-state-with-CTA appears |
| 3 | 30 s upstream hang for writes surfaces at 15-16 s | YES — AlertDialog appears |
| 4 | Order-create timeout uses `apiWriteClient` (15 s) with idempotency safety per D-02 owner assertion | YES — verified via V-04b below |
| 5 | Component unmount aborts in-flight fetches | dev-console only |
| 6 | No new eslint errors | CI |
| 7 | Existing e2e tests pass | CI |
| 8 | `data-testid`s from `/app/design_guidelines.json` present on the 3 error-UI elements | YES |
| 9 | Bundle size delta ≤ 3 KB gzipped | CI |

### V-04b Order-create safety self-test (extra check because of D-02 reliance)

1. Trigger a real order in preprod with a network throttle set to "offline" at the moment of submit.
2. Observe: AlertDialog appears at 15 s ± 1 s. No POS receipt yet.
3. Restore network. Tap "Retry" in the AlertDialog.
4. Observe: exactly ONE order lands in POS (not two). Confirms POS idempotency.
5. Repeat with 5-second network interruption instead of full offline. Same expectation.

If step 4 shows two orders: **halt release**, escalate to owner, note in INV-001 that D-02 assumption is broken.

---

## 6. Design agent involvement — ✅ COMPLETE (2026-07-04)

Design agent output saved to `/app/design_guidelines.json`. Three patterns provided:

1. **Menu-load read timeout** → Empty-state-with-CTA (replaces skeleton). `role="alert"`, focus moves to Retry button.
2. **Order-create write timeout** → Blocking AlertDialog with explicit Dismiss + Retry. Native focus trap. Prevents outside-click dismissal.
3. **Background config timeout** → Non-blocking Toast, auto-dismiss 5 s, `aria-live="polite"`.

Constraints reinforced: no new fonts/colors/tokens, reuse existing shadcn/ui components only, mobile-first (44 px min tap target), keep framer-motion animations simple.

`data-testid`s already assigned — use verbatim:
- `timeout-error-menu-load-retry-button`
- `timeout-error-order-alert-dialog`
- `timeout-error-config-toast`

---

## 7. Exit gate (§8 Role 3) — items to be completed at IMPLEMENTATION

| Item | Status now |
|---|---|
| Registry updated | ✅ CR.md + this file exist; README.md row present |
| Code markers added | ⏳ IMPL — `CR-2026-07-03-004` in comments |
| Self-test complete | ⏳ IMPL |
| Lint clean | ⏳ IMPL |
| QA handover written | ⏳ IMPL |
| Owner sign-off (D-01..D-05) | ✅ APPROVED 2026-07-04 (see §0 above) |
| Design agent input on error UI | ✅ COMPLETE — see `/app/design_guidelines.json` |
| Prerequisite CR-2026-07-03-003 merged | ✅ SHIPPED |
| Prerequisite CR-2026-07-03-000 endpoint exists (auth path) | ✅ IMPLEMENTED (QA-pending on real creds; no blocker for CR-004) |

---

## 8. Non-goals

- No new backend surface.
- No change to POS / CRM / storage / maps APIs.
- No new alerting.
- No general error-boundary refactor (out of scope; separate initiative if desired).
- No feature-flag framework rollout (owner decides feature-flag env if wanted).
