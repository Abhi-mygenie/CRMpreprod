# FINDINGS — CR-2026-07-03-000

**Role:** Role 6 (INVESTIGATION) — read-only, 10 investigation steps used, budget respected.
**Date:** 2026-07-03
**Author:** E1
**Scope:** Size the real footprint of removing `REACT_APP_LOGIN_PHONE` / `REACT_APP_LOGIN_PASSWORD` from the frontend.

---

## 1. Executive summary

The refactor is **smaller in surface area than the CR title suggests, but structurally bigger than the plan in CR.md §3.1 anticipated**. Only **one file** consumes the env vars, but that file is a **service-account login for the POS API — not a customer login**, so none of the three refactor options in CR.md §3.1 apply as-written.

Verdict: **outcome type "B" — architectural refactor, not a delete-4-lines fix.**

## 2. Code footprint

### 2.1 Where the env vars are read (only place)

**`frontend/src/utils/authToken.js`** — three references on lines 15, 16, 20:

```js
// line 13-21
// Auth credentials from environment variables (CA-001 fix)
// IMPORTANT: These must be set in .env file - no hardcoded fallbacks for security
const HARDCODED_PHONE = process.env.REACT_APP_LOGIN_PHONE;
const HARDCODED_PASSWORD = process.env.REACT_APP_LOGIN_PASSWORD;

if (!HARDCODED_PHONE || !HARDCODED_PASSWORD) {
  logger.error('auth', 'CRITICAL: Missing REACT_APP_LOGIN_PHONE or REACT_APP_LOGIN_PASSWORD in environment');
}
```

They are used exactly once, inside `loginForToken()`:

```js
// line 93-100
export const loginForToken = async () => {
  ...
  const response = await apiClient.post('/auth/login', {
    phone: HARDCODED_PHONE,
    password: HARDCODED_PASSWORD
  });
```

### 2.2 What that token IS

It is **`order_auth_token`** — stored in `localStorage.order_auth_token` with a 30-minute TTL, attached as `Authorization: Bearer <token>` header by `api/interceptors/request.js` on every axios call, and refreshed by `api/interceptors/response.js` on 401.

Cross-referenced from the DEPLOYMENT_HANDOVER's addendum (Alpha v0.1 §5): this token is **used against the MyGenie POS API** (`preprod.mygenie.online/api/v1`), not against our own FastAPI. It is a **machine-to-machine service credential**, not per-user identity.

That's confirmed by `CR.md`'s own reference to `Addendum §5.4 / §7`: three parallel auth systems (`auth_token` = admin JWT, `crm_token_<id>` = per-customer, `order_auth_token` = per-app POS access).

### 2.3 Who imports `authToken.js` (6 consumers)

| File | Imports | What it does with them |
|---|---|---|
| `pages/OrderSuccess.jsx` line 11 | `getStoredToken` | Read-only token access for order status polling |
| `pages/LandingPage.jsx` line 15, 276, 280 | `getAuthToken` (×2) | Fetch token before customer-capture / QR flows |
| `pages/ReviewOrder.jsx` line 14, 737, 929, 1357 | `getAuthToken`, `isTokenExpired` (×3) | Attach token to place-order/edit-order/table-check calls |
| `api/interceptors/request.js` line 6, 13, 30 | `getStoredToken`, `isTokenExpired` | Attach `Bearer` header if valid |
| `api/interceptors/response.js` line 7, 60 | `getAuthToken`, `clearStoredToken` | 401 → force-refresh token then retry |

**Key insight:** None of the 6 consumers reference the phone or password directly. They only use the *token* the credentials produce. That means the credential can be moved anywhere (backend, another service) without touching any of the 6 files — provided the token still gets into `localStorage.order_auth_token`.

## 3. Why CR.md §3.1's options don't apply as-written

Recap of the three options in the current CR.md:

| Option | Applies? | Why not |
|---|---|---|
| (a) **User input / normal login form** | ❌ | This is not a customer login. There is no user to prompt. The credential is the app's own POS service account. |
| (b) **Backend proxy — move to `backend/.env`, expose an endpoint** | ✅ | **Only architecturally correct fix.** Server-side FastAPI holds the credential; frontend calls an unauthenticated FastAPI endpoint to receive the short-lived POS token. |
| (c) **OTP/JWT flow** | ❌ | `/api/auth/send-otp` + `/api/auth/login` are for **customer** authentication (returns a customer JWT), not the POS service account. Using them here would break the entire order flow. |

## 4. Bundle-leak scope (secondary problem)

`grep -rl "9579504871\|Qplazm" /app` returns **18 markdown files** containing the leaked credential in plaintext:

| Category | Count | Examples |
|---|---|---|
| CR / QA handover docs (in-branch history) | 11 | `CR-2026-05-30-001-.../QA_HANDOVER_ITEM1.md`, `CR-2026-06-17-*/QA_HANDOVER.md`, `CR-2026-04-11-001-.../QA_HANDOVER.md` |
| Deployment docs (in-branch) | 3 | `DEPLOYMENT_HANDOVER.md` (§5.2 lines 133–134, 189), `memory_repo/DEPLOYMENT_HANDOVER_CUSTOMER_APP.md`, `memory_repo/DEPLOYMENT_RUN_ISSUES.md` |
| Session / audit docs (memory_repo) | 3 | `QA_HANDOVER_SESSION_2026-05-03.md`, `QA_HANDOVER_SESSION_2026-05-04.md`, `CUSTOMER_ENDPOINTS_v2.md` |
| Investigation reports | 1 | `DELIVERY_PHONE_AND_ADDRESS_FLOW_INVESTIGATION_2026-02-XX.md` |

Bonus: the phone number `9579504871` also appears in a **comment example** at `frontend/src/pages/PasswordSetup.jsx` line 442:

```js
// Mask phone for display: +919579504871 → +91 •••••04871
```

Cosmetic but should also be scrubbed to a placeholder like `+919999999999`.

## 5. Sizing options (per-outcome estimate)

### Option 1 — Minimum viable: FastAPI proxy for token issuance only
**Scope:**
- Add `MYGENIE_POS_LOGIN_PHONE` / `MYGENIE_POS_LOGIN_PASSWORD` to `backend/.env`.
- Add new FastAPI endpoint: `POST /api/pos/auth-token` that logs into POS server-side and returns the token (still short-lived, still stored in `localStorage.order_auth_token` on the client).
- Refactor `frontend/src/utils/authToken.js` `loginForToken()` to call the new FastAPI endpoint instead of POS directly.
- Remove `REACT_APP_LOGIN_PHONE` / `REACT_APP_LOGIN_PASSWORD` from `frontend/.env`.

**Effort:** ~2–3 hrs (1 backend endpoint + 1 frontend function refactor + smoke test).
**Files changed:** 3 (`backend/server.py`, `frontend/src/utils/authToken.js`, `frontend/.env`).
**Risk:** LOW-MEDIUM (touches auth path but the change is localised to one function).
**Bundle-leak fix:** ✅ credentials no longer in shipped JS.
**Doesn't fix:** the token itself is still in `localStorage` and any XSS still gets it; but that's a different threat class from "in the bundle for everyone."

### Option 2 — Correct architectural fix: full POS proxy
**Scope:**
- Everything from Option 1, plus:
- Proxy every POS write call (place-order, edit-order, table-status, etc.) through FastAPI so the token never enters the browser.
- Frontend uses only customer JWT + CRM token; POS token stays server-side.
- Aligns with `BUG-001` (hybrid auth ownership) and `BUG-002` (POS/CRM/backend contract drift) which have been flagged P0 in `memory_repo/BUG_TRACKER_ARCHITECTURAL_AUDIT_2026-05.md`.

**Effort:** 2–3 dev-days (touches `ReviewOrder.jsx`, `OrderSuccess.jsx`, `LandingPage.jsx`, all POS-facing services, plus new FastAPI endpoints for every proxied POS call).
**Risk:** HIGH per Alpha v0.1 Part C (touches CRITICAL files: `ReviewOrder.jsx`, `AuthContext.jsx`).
**Bundle-leak fix:** ✅ + also fixes token-in-localStorage exposure.

### Option 3 — Defer + doc-scrub only
**Scope:**
- Keep `REACT_APP_LOGIN_PHONE/PASSWORD` in `.env` as placeholders (already done in this branch).
- Rotate the credential in CRM immediately (assume it's already public — 18 markdown files leaked it).
- Scrub all 18 docs to `<REDACTED-CRED>` placeholders.
- Add CI lint rule to fail build if `REACT_APP_*_PASSWORD` / `REACT_APP_*_SECRET` present in `.env`.
- File Option 1 or Option 2 as a follow-up P1 CR.

**Effort:** ~1 hr (docs scrub + CI rule + rotation coordination).
**Files changed:** 18 markdown + 1 CI config.
**Risk:** LOW.
**Bundle-leak fix:** ⚠️ only if new dev env doesn't accidentally set the vars again. Not a code fix.

## 6. Hypotheses tested and evidence

| # | Hypothesis | Test | Result |
|---|---|---|---|
| H1 | Multiple frontend files reference these env vars | `grep -rn "REACT_APP_LOGIN_" frontend/src` | ❌ **Falsified** — only `authToken.js` |
| H2 | Backend also reads them | `grep -rn "REACT_APP_LOGIN_\|LOGIN_PHONE\|LOGIN_PASSWORD" backend/` | ❌ **Falsified** — backend does not read frontend REACT_APP vars |
| H3 | This is a customer-login credential | Inspect `loginForToken` payload + downstream `order_auth_token` semantics | ❌ **Falsified** — it's a POS service account; call goes to `apiClient` which points at `preprod.mygenie.online/api/v1/auth/login` |
| H4 | Removing them would break customer login flow | Check whether customer OTP/JWT flow uses `HARDCODED_*` | ✅ **Confirmed independent** — customer flow uses `/api/auth/send-otp` + `/api/auth/login` on our FastAPI, unrelated to `loginForToken()` |
| H5 | Docs leak the same credential too | `grep -rl "9579504871\|Qplazm" /app --include="*.md"` | ✅ **Confirmed** — 18 markdown files leak it |

## 7. Confidence

**HIGH** on code footprint (1 consumer file, 6 downstream importers, 0 tests).
**HIGH** on architectural nature (POS service credential, not customer credential).
**MEDIUM** on choice between Options 1 / 2 — depends on owner's tolerance for the token still being in `localStorage` after Option 1.
**HIGH** on the doc-leak inventory (grep is exhaustive).

## 8. Recommendation

**Take Option 1 (FastAPI proxy for token issuance) as CR-000's Role 3 implementation.** It closes the bundle-leak (the stated CR title goal), is 2–3 hrs of work, one backend endpoint + one frontend function.

Do NOT expand into Option 2 during this CR — that's a much larger architectural change worth its own dedicated CR with owner review of the whole POS-proxy design. File it as **CR-followup-E: Full POS-proxy refactor (BUG-001 + BUG-002 remediation)** for a future sprint.

Also raise **CR-followup-F: Scrub leaked credential from 18 markdown files + add CI lint rule for `REACT_APP_*_PASSWORD/SECRET/TOKEN`** — this is Option 3's residual work and shouldn't block CR-000's code fix.

**Non-negotiable prerequisite:** the credential `+919579504871 / Qplazm@10` must be **rotated in the MyGenie CRM before or immediately after the code lands**. Even if code fixes the bundle-leak, the credential is already public (in git history, in 18 committed markdown docs). Rotation is the only true fix for that exposure.

## 9. Compact Role 6 exit block

```text
Investigation complete: CR-2026-07-03-000
Root cause: architectural — hardcoded POS service credential injected into frontend bundle at build time; only 1 consumer file, but no user-facing login path can replace it (it's not a customer credential)
Classification: FE (single file: authToken.js) + FE-BE (needs new backend endpoint)
Confidence: HIGH
Steps used: 10/10
Evidence: memory/change_requests/CR-2026-07-03-000-remove-hardcoded-login-creds/FINDINGS.md (this file)
Recommendation: Option 1 (FastAPI proxy for token issuance) — 2-3 hrs, 3 files, LOW-MEDIUM risk. File follow-up CRs for Option 2 (full proxy) and doc-scrub (Option 3 residual).
Blocker for Role 3: owner sign-off on Option 1 + credential rotation started in CRM
```
