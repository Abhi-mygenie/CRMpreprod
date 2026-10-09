# Handover — CR-2026-05-30-001 (Item 1 only — Config-Driven OTP Skip)

| Field | Value |
|---|---|
| Prepared by | E1 (planning agent) |
| Prepared at | 2026-05-30 |
| Handover target | Next planning + implementation agent |
| Status | **READY FOR IMPLEMENTATION — Item 1 only.** Owner has locked all decisions. |
| Pre-implementation gates | All cleared. Integration playbook consulted (summary in §10). |

> Item 2 (table scan → new table) and Item 3 (room scan → walk-in) are **investigation-only** and **NOT in scope of this handover**. See §11 for their current state.

---

## 0. Repo state at handover

```
Repo:       https://github.com/Abhi-mygenie/customer-app5th-march.git
Branch:     main
HEAD SHA:   2deb245c039c5c9958dc91c6072160bd0341a90f
Preview:    https://deploy-docs-6.preview.emergentagent.com
Services:   backend / frontend / mongodb / nginx-code-proxy → RUNNING
Mongo:      mongodb://mygenie_admin:****@52.66.232.149:27017/mygenie  (remote, prod-like)
```

Full deployment handover: `/app/HANDOVER.md`.

---

## 1. CR scope (verbatim from owner)

The original CR has three items:

1. ✅ **Item 1 (IN scope of THIS handover)** — Customer name + phone mandatoriness is config-driven, AND if non-mandatory the OTP "validation page" (`/<rid>/password-setup`) must auto-skip.
2. ⏸ **Item 2 (deeper investigation done, awaiting owner inputs)** — Table scan sometimes creates a "new table" / WC fallback on POS dashboard. Production-only, not reproducible locally.
3. ⏸ **Item 3 (May-8 investigation already in repo)** — Room scan sometimes lands order as walk-in.

**Hard constraint (carries through entire CR):** Restaurant **716** (Hyatt Centric) — exclusion applies to items 2 & 3 only. **For Item 1 (this handover), 716 is IN scope and honours the flag like everyone else.**

---

## 2. Owner-locked decisions for Item 1

| ID | Decision | Final |
|---|---|---|
| Approach | Wire up the 5 existing **dead** admin toggles + add 1 new (`otpRequiredDelivery`). No master flag. | ✅ |
| Default | `config[flag] !== false` → show OTP page. Missing/null/undefined = current behaviour preserved. | ✅ |
| D1 | Delivery has its own toggle `otpRequiredDelivery` (NEW) | ✅ |
| D2 | Do NOT touch `LandingPage.jsx:738-739` mandatory-override for takeaway/delivery — out of scope | ✅ |
| D3 | If `crmSkipOtp` fails after retries → degraded guest mode (proceed to menu, no CRM token) | ✅ |
| D4 | No phone entered → today's path (straight to menu) UNCHANGED | ✅ |
| D5 | Edit-Order flow UNCHANGED | ✅ |
| D6 | Authenticated users UNCHANGED | ✅ |
| 716 | IN scope for Item 1 | ✅ |
| Q1 | **409 from `skip-otp` → fall through to `/password-setup`.** The only allowed exception to "no fall-through". Reasoning: 409 specifically means "this phone is locked to OTP, skip is forbidden for it" per CRM contract. | ✅ |
| Q2 | **No API key blocker.** Production already runs `crmSkipOtp` via the "Skip for now" button. Existing `REACT_APP_CRM_API_KEY` JSON map + `crmService.js:17-115` per-restaurant `x-api-key` injection is reused as-is. | ✅ |
| `crmFetch` enhancement | Owner authorised the 5-line additive change to attach `error.status` on the thrown Error in `crmService.js:121-140`. | ✅ |

---

## 3. Final mode → flag mapping (single source of truth)

Add to a NEW file `/app/frontend/src/utils/otpPolicy.js`. Pure helpers, no React imports.

```js
// otpPolicy.js  (planning pseudocode — agent writes the JS)

import { hasAssignedTable } from './orderTypeHelpers';

/**
 * Resolve the admin-config flag name that governs OTP for the current order context.
 * Returns one of: 'otpRequiredRoomOrders', 'otpRequiredWalkIn', 'otpRequiredDelivery',
 *                 'otpRequiredTakeaway', 'otpRequiredDineInWithTable', 'otpRequiredDineIn'.
 */
export function pickOtpFlag({ selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId }) {
  if (scannedRoomOrTable === 'room')   return 'otpRequiredRoomOrders';
  if (scannedRoomOrTable === 'walkin') return 'otpRequiredWalkIn';
  if (scannedOrderType === 'delivery' || selectedMode === 'delivery') return 'otpRequiredDelivery';
  if (scannedOrderType === 'takeaway' || selectedMode === 'takeaway') return 'otpRequiredTakeaway';
  if (scannedOrderType === 'dinein' && hasAssignedTable(scannedTableId) && scannedRoomOrTable === 'table') {
    return 'otpRequiredDineInWithTable';
  }
  return 'otpRequiredDineIn';   // walk-in dine-in / legacy direct URL
}

/**
 * Returns true if OTP page should be shown for this flag value.
 * Treats missing/null/undefined/true as "OTP required" (preserves current behaviour).
 * Only an explicit `false` skips the page.
 */
export function shouldShowOtpPage(flagName, config) {
  return config?.[flagName] !== false;
}
```

---

## 4. Final runtime flow

```text
LandingPage.jsx — handleBrowseMenu (~L442 onwards):

  ... existing validation (mandatory name/phone) UNCHANGED
  ... existing POST /api/auth/check-customer UNCHANGED

  if no phone captured:
      → today's branch (L524-542) → navigate to /menu        # UNCHANGED, D4

  if phone captured AND !isAuthenticated:
      flagName = pickOtpFlag({selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId});
      if (shouldShowOtpPage(flagName, config)):
          → existing navigate('/<rid>/password-setup', {...})    # TODAY'S PATH UNCHANGED

      else:
          # NEW silent-skip branch
          try {
              const data = await crmSkipOtpWithRetry(capturedPhone, buildUserId(actualRestaurantId));
              if (data?.token) {
                  setCrmAuth(data.token, { name: capturedName, phone: capturedPhone, ...data.customer }, actualRestaurantId);
                  localStorage.setItem('guestCustomer', JSON.stringify({ name: capturedName, phone: capturedPhone, restaurantId: actualRestaurantId }));
              }
              navigateToMenu();   // existing helper
          } catch (err) {
              if (err.status === 409) {
                  // Q1=b — phone locked to OTP, must use password-setup
                  navigate(`/${actualRestaurantId}/password-setup`, {state: {...same as today...}});
              } else if (err.status === 400 || err.status === 401 || err.status === 403 || err.status === 404 || err.status === 422) {
                  toast.error('Could not continue. Please try again.');
                  // stay on landing — user can retry
              } else {
                  // Retries exhausted OR 5xx OR network → D=b degraded guest mode
                  localStorage.setItem('guestCustomer', JSON.stringify({ name: capturedName, phone: capturedPhone, restaurantId: actualRestaurantId }));
                  toast('Continuing as guest');
                  navigateToMenu();
              }
          }
```

> `navigateToMenu()` already exists in `LandingPage.jsx` if needed; otherwise mirror `PasswordSetup.jsx:52-63` (delivery mode → delivery-address; multi-menu → /stations; else → /menu).

---

## 5. `crmSkipOtpWithRetry` wrapper

NEW file `/app/frontend/src/api/services/crmSkipOtpRetry.js`. Wraps the existing helper — does NOT modify it.

```js
// crmSkipOtpRetry.js  (planning pseudocode)

import { crmSkipOtp } from './crmService';

const RETRIABLE = new Set([429, 500, 502, 503, 504]);
const NON_RETRIABLE_BUBBLE = new Set([400, 401, 403, 404, 409, 422]);

export async function crmSkipOtpWithRetry(phone, userId, opts = {}) {
  const { maxAttempts = 3, baseDelayMs = 500, maxDelayMs = 4000 } = opts;
  let attempt = 0;

  while (true) {
    try {
      return await crmSkipOtp(phone, userId);    // existing helper untouched
    } catch (e) {
      const status = e?.status;                  // requires §7 crmFetch enhancement

      // Non-retriable — let caller's specific handlers fire (incl. 409)
      if (NON_RETRIABLE_BUBBLE.has(status)) throw e;

      // Retriable transport + 5xx + 429
      const isNetworkError = !status;            // no status = transport-layer
      if (RETRIABLE.has(status) || isNetworkError) {
        if (attempt >= maxAttempts - 1) throw e;
        const baseDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
        const jitter = Math.random() * baseDelay * 0.3;
        const retryAfterMs = e?.retryAfterMs ?? 0;
        const delay = Math.max(baseDelay + jitter, retryAfterMs);
        await new Promise(r => setTimeout(r, delay));
        attempt++;
        continue;
      }

      // Anything else — bubble as-is
      throw e;
    }
  }
}
```

> The bare `crmSkipOtp` continues to be called by `PasswordSetup.handleSkip` (`PasswordSetup.jsx:65-82`) — that existing "Skip for now" button path stays single-shot, no retry. **Only the new Landing-side call gets the retry policy.** This isolates risk.

---

## 6. `RestaurantConfigContext.jsx` — add new flag

| File | Lines | Change |
|---|---|---|
| `frontend/src/context/RestaurantConfigContext.jsx` | ~L93-103 (defaults block) | Add **one line:** `otpRequiredDelivery: false,` alongside the existing 5 |
| same file | ~L443-450 (serializer block) | Add **one line:** `otpRequiredDelivery: config.otpRequiredDelivery === true,` alongside the existing 5 |

---

## 7. Defensive 5-line addition to `crmService.js`

| File | Lines | Change |
|---|---|---|
| `frontend/src/api/services/crmService.js` | ~L121-140 (inside `crmFetch`, after `if (!response.ok)`) | When constructing the thrown `Error`, also attach `error.status = response.status` and `error.retryAfterMs = ...` (parsed from `Retry-After` header if present). |

Concrete diff sketch (agent writes the actual JS):

```js
// Before (lines ~129-140):
const data = await response.json();
if (!response.ok) {
  const message = data.detail || data.message || ... ;
  throw new Error(message);
}

// After:
const data = await response.json();
if (!response.ok) {
  const message = data.detail || data.message || ... ;
  const err = new Error(message);
  err.status = response.status;
  const retryAfterHeader = response.headers.get('retry-after');
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(seconds)) err.retryAfterMs = seconds * 1000;
  }
  throw err;
}
```

**Why safe:**
- Additive — `error.message` reads unchanged for every existing caller.
- All existing callers (`crmService.js`, every page using these helpers) read only `error.message`. None read `error.status` today. Grep for confirmation: `grep -rn "\.status" /app/frontend/src/api/services/crmService.js` and `/app/frontend/src/pages/PasswordSetup.jsx`.

---

## 8. `VisibilityTab.jsx` — admin UI row

| File | Lines | Change |
|---|---|---|
| `frontend/src/components/AdminSettings/VisibilityTab.jsx` | ~L131-135 | Add **one line:** `<ToggleRow field="otpRequiredDelivery" label="OTP Required for Delivery Orders" />` alongside the existing 5. Position it alphabetically or grouped with the others. |

---

## 9. `LandingPage.jsx` — the actual gate

| File | Lines | Change |
|---|---|---|
| `frontend/src/pages/LandingPage.jsx` | top imports | `import { crmSkipOtpWithRetry } from '../api/services/crmSkipOtpRetry'; import { buildUserId } from '../api/services/crmService'; import { pickOtpFlag, shouldShowOtpPage } from '../utils/otpPolicy'; import { useAuth } from '../context/AuthContext'; // for setCrmAuth, if not already in scope` |
| same file | ~L487-520 (the existing `navigate('/<rid>/password-setup', …)` block at L495 and L508) | Wrap both navigate calls in `if (shouldShowOtpPage(pickOtpFlag({selectedMode, scannedOrderType, scannedRoomOrTable, scannedTableId}), config))`. The `else` branch implements the silent-skip flow per §4. |

> Both navigate calls (L495 for existing customer, L508 for new customer) need the same wrapping. Consider extracting the destination logic to a helper `routeAfterPhoneCapture()` inside the component to avoid duplication.

---

## 10. Integration playbook expert — key takeaways (already consulted)

Full output in this folder: nothing to re-call. Highlights:

| Aspect | Playbook recommendation | Status in our plan |
|---|---|---|
| URL | `POST {CRM_URL}/{CRM_API_VERSION}/scan/auth/skip-otp` | ✅ existing helper already does this |
| Auth header | `X-CRM-API-Key` (playbook guess) — **actual is `x-api-key`** (lowercase, per `crmService.js:115`) | ✅ existing helper already attaches per-restaurant key |
| Body | `{ phone, restaurant_id, optional user_id }` | ✅ matches existing helper |
| Phone format | E.164 / digits-only — `stripPhonePrefix` already normalises | ✅ no change |
| Idempotency | Assumed safe by `(phone, restaurant_id)` — playbook flags as "must validate with CRM team" | ⚠️ Open. Production runs this today; retries marginally increase exposure. Acceptable risk per D=b. |
| Timeout | 8 s per attempt | ✅ in our wrapper |
| Retries | 3 max, exp. backoff with jitter, honour `Retry-After` | ✅ in our wrapper |
| Retriable codes | 429, 500, 502, 503, 504 + network errors | ✅ in our wrapper |
| Non-retriable | 400, 409, 422, plus 401/403/404 (config) | ✅ in our wrapper |
| 409 semantics | "Phone locked to OTP, skip not allowed" — route to /password-setup | ✅ Q1=b confirmed by owner |
| Token storage | localStorage acceptable for cross-origin SPA without same-origin backend | ✅ existing `setCrmAuth` already does this |
| Guest fallback | Recommended for D=b — proceed to menu without CRM token | ✅ matches owner |
| API key | Treat as public client identifier — already does | ✅ no change |
| Known gotchas in existing helper | (1) no retries today (2) no status preservation on errors (3) inconsistent phone normalisation (out of scope) (4) no observability | (1)(2) addressed by this CR. (3)(4) out of scope. |

**Playbook caveat:** MyGenie CRM has no public docs. The above are best-practice assumptions plus what production already proves works. We do **NOT** need to re-validate with the CRM team before implementing — because today's "Skip for now" button is **already running this exact call against production CRM in real customer traffic**. Anything that works there works here.

---

## 11. Status of Item 2 and Item 3 (NOT in this handover, but context)

| Item | Doc | State |
|---|---|---|
| Item 2 | `ITEM2_DEEP_DIVE.md` (in this folder) | Investigation complete. 8 production-only triggers ranked. Awaiting one failing order_id + restaurant_id from owner before planning fix. **Restaurant 716 must NOT be disturbed.** |
| Item 3 | `INVESTIGATION_AND_GAPS.md` §"Item 3" + the May-8/May-9 docs in `/app/memory_repo/change_requests/` | G1 already implemented (716-only carve-out). G2/G3/G4/G5 not started. Same blocker as Item 2 — awaiting real order data. **Restaurant 716 must NOT be disturbed.** |

> If the next agent decides to tackle Item 2 or Item 3, **do NOT carry the Item-1 716-inclusion over.** Items 2 & 3 carry the explicit 716 carve-out. Misreading this is a regression risk.

---

## 12. Test scenarios (for testing-agent run after implementation)

Spec doc to hand to the testing agent verbatim. Each must pass against **a non-716 restaurant AND restaurant 716**.

| # | Scenario | Expected |
|---|---|---|
| 1 | All flags absent (today's restaurants) | `/password-setup` shown — **no regression** |
| 2 | `otpRequiredDineInWithTable=false`, table QR scan, phone entered | Direct to menu, CRM token in `setCrmAuth` |
| 3 | `otpRequiredTakeaway=false`, takeaway mode, phone entered | Direct to menu, CRM token attached |
| 4 | `otpRequiredDelivery=false`, delivery mode, phone entered | Direct to menu, CRM token attached |
| 5 | `otpRequiredRoomOrders=false`, room QR (incl. 716) | Direct to menu, CRM token attached |
| 6 | `otpRequiredWalkIn=false`, walkin QR | Direct to menu, CRM token attached |
| 7 | `otpRequiredDineIn=false`, direct URL no scan | Direct to menu, CRM token attached |
| 8 | `otpRequiredDineInWithTable=false` BUT `otpRequiredDineIn=true` (mode mismatch) | `/password-setup` for walk-in dine; direct to menu for table-QR dine |
| 9 | Customer enters NO phone | Direct to menu, no `crmSkipOtp` call — D4 unchanged |
| 10 | Authenticated returning customer | Direct to menu, no `crmSkipOtp` call — D6 unchanged |
| 11 | `crmSkipOtp` returns 200 first try | Direct to menu, retry counter = 1 |
| 12 | `crmSkipOtp` returns 503 twice then 200 | Direct to menu, retry counter = 3 |
| 13 | `crmSkipOtp` returns 503 three times (exhausted) | Direct to menu as guest, toast "Continuing as guest", no CRM token |
| 14 | `crmSkipOtp` returns 409 (phone locked to OTP) | Falls through to `/password-setup` — the one allowed exception |
| 15 | `crmSkipOtp` returns 422 (bad phone) | Toast error, stays on landing |
| 16 | `crmSkipOtp` network error (no HTTP response) | Retries 3x, then guest mode + toast |
| 17 | Restaurant 716 with `otpRequiredRoomOrders=false` | Direct to menu — confirms 716 in-scope for Item 1 |
| 18 | Existing "Skip for now" button on `/password-setup` | UNCHANGED — still single-shot via bare `crmSkipOtp` |
| 19 | Edit-Order flow | UNCHANGED — D5 |
| 20 | `placeOrder` payload (Items 2/3 regression guard) | `table_id`, room context, all builder outputs identical to pre-change |

---

## 13. Implementation phasing recommendation

Two options. Implementer's choice — neither blocks Item 1's correctness.

| Phase | Content | Effort |
|---|---|---|
| **Option A — Single PR** | All 5 file changes in one PR. Default `otpRequired*=true|missing` preserves current behaviour. Day-one observable change: zero. Admin can flip flags post-merge to opt in. | Smaller PR, faster review |
| **Option B — Two phases** | **A:** scaffolding (`otpPolicy.js`, `crmSkipOtpRetry.js`, `crmFetch` enhancement, defaults, admin row) + LandingPage gate behind `false` config short-circuit. **B:** flip one restaurant's flag in pre-prod, validate, then GA. | Safer rollout, two PRs |

Recommended: **Option A** — the runtime gate already preserves current behaviour by default, so observable risk is the same. The reviewer can verify by reading `shouldShowOtpPage` (one expression).

---

## 14. Before writing code — implementer's pre-flight checklist

- [ ] Read `INVESTIGATION_AND_GAPS.md`, `ITEM2_DEEP_DIVE.md`, `ITEM1_IMPLEMENTATION_PLAN.md`, `ITEM1_FINAL_PLAN.md` in this folder
- [ ] Read `/app/HANDOVER.md` (deployment-level handover)
- [ ] Confirm `git rev-parse HEAD` matches §0 (or a newer `main`)
- [ ] `supervisorctl status` — all services RUNNING
- [ ] `curl $REACT_APP_BACKEND_URL/api/` returns 200
- [ ] Read these files end-to-end before touching anything:
  - `frontend/src/api/services/crmService.js` (1-160 for `crmFetch`, 350-380 for `crmSkipOtp`)
  - `frontend/src/pages/LandingPage.jsx` (140-543, especially 442-543)
  - `frontend/src/pages/PasswordSetup.jsx` (1-100, especially `handleSkip` at 65-82)
  - `frontend/src/context/RestaurantConfigContext.jsx` (90-110, 440-460)
  - `frontend/src/context/AuthContext.jsx` (`setCrmAuth` definition)
  - `frontend/src/components/AdminSettings/VisibilityTab.jsx` (130-140)
  - `frontend/src/utils/orderTypeHelpers.js` (full)
  - `frontend/src/hooks/useScannedTable.js` (full)
- [ ] Verify the platform rule:  **integration_playbook_expert_v2 was consulted** — yes, output is summarised in §10. Do NOT re-call unless contract changes.

---

## 15. Hard "do NOT" list for the implementer

1. **Do NOT modify the bare `crmSkipOtp` helper** (`crmService.js:360-376`) beyond adding the `error.status` attachment in `crmFetch` (§7). Existing callers depend on its current behaviour.
2. **Do NOT touch `LandingPage.jsx:738-739`** — D2 lock. Out of scope.
3. **Do NOT touch ReviewOrder.jsx, OrderSuccess.jsx, orderService.ts, transformers/helpers.js** — Item 1 surface is strictly between Landing and Menu navigation.
4. **Do NOT add or change anything in `backend/server.py`** — backend already passes the config dict through. Zero backend changes needed.
5. **Do NOT touch the 716 carve-out branches** in OrderSuccess.jsx, ReviewOrder.jsx — those belong to Items 2/3.
6. **Do NOT change the JSON-context defaults** in `RestaurantConfigContext.jsx` for the existing 5 flags (keep them `false`). The runtime helper uses `!== false`, which correctly treats `false`-default + missing-field both as "OTP required". Only add the **new** `otpRequiredDelivery: false` line.
7. **Do NOT make the existing "Skip for now" button call the retry wrapper** — keep it on the bare `crmSkipOtp`. Risk isolation.

---

## 16. Files index in this CR folder

```
/app/memory/change_requests/CR-2026-05-30-001-config-mandatory-fields-and-scan-misrouting/
├── CR.md                                — original registration (user's words)
├── INVESTIGATION_AND_GAPS.md            — items 1+2+3 first-pass gaps
├── ITEM2_DEEP_DIVE.md                   — item 2 production analysis (8 triggers, frame-by-frame)
├── ITEM1_IMPLEMENTATION_PLAN.md         — earlier draft of item 1 plan (D1-D7 questions)
├── ITEM1_FINAL_PLAN.md                  — locked plan after owner Q&A + playbook
└── HANDOVER.md                          — THIS FILE
```

---

## 17. Authorisation status at handover

- ✅ Owner approved all D-questions
- ✅ Q1 (409 → /password-setup) — confirmed
- ✅ Owner approved the 5-line `crmFetch` enhancement
- ⏳ **Implementation has NOT started.** Next agent should:
  1. Pre-flight checklist (§14)
  2. Implement (Option A from §13 recommended)
  3. Run testing agent against §12 scenarios
  4. Fix any failures
  5. Update `/app/memory/PRD.md` and `finish` with summary

> No code, no config, no service has been edited under this CR. Everything in this handover is **planning + read-only investigation**.
