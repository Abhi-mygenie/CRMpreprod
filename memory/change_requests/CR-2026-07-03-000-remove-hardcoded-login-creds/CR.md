# CR-2026-07-03-000 — Remove Hardcoded Login Credentials from Frontend Bundle

**Status:** 🚧 IMPLEMENTED, QA-pending (Role 6 investigation, Role 2 planning, Role 3 implementation all complete on 2026-07-04 UTC; owner smoke pending)
**Session:** 2026-07-03
**Priority:** P1 (Security)
**Severity:** P1
**Risk of change:** MEDIUM (touches auth path — one FE function + one BE endpoint)
**Fast Lane:** ❌ Not eligible (auth-adjacent per Alpha v0.1 §6)

**Related items:**
- Blocks / depends on: MyGenie CRM credential rotation (external, must happen in parallel)
- Follow-up: CR-2026-07-03-011 (full POS proxy — the correct architectural fix)
- Follow-up: CR-2026-07-03-012 (18-doc credential scrub + CI lint rule)
- Investigation basis: [`FINDINGS.md`](./FINDINGS.md) (Role 6 audit, 2026-07-03)

---

## 1. Background (corrected from Role 6 investigation)

The customer-app frontend `.env` currently reads two variables that are **injected into the client JS bundle at build time**:

```
REACT_APP_LOGIN_PHONE=+919579504871
REACT_APP_LOGIN_PASSWORD=Qplazm@10
```

Role 6 audit (`FINDINGS.md`) established that these are **NOT customer credentials**. They are a **POS service account** used by `frontend/src/utils/authToken.js` `loginForToken()` to obtain `order_auth_token` from `preprod.mygenie.online/api/v1/auth/login`. This token is stored in `localStorage.order_auth_token` (30-min TTL) and attached as `Authorization: Bearer <token>` to every POS-facing request by `api/interceptors/request.js`.

Because the credential is `REACT_APP_*`, CRA/CRACO substitutes it into the shipped `main.js` at build time. Anyone loading the site can extract both values from the bundle. See `DEPLOYMENT_HANDOVER.md` §5.2 line 142.

## 2. Chosen refactor path

**Option 1 (Minimum viable — approved 2026-07-03):**

Move the credential to `backend/.env`. Add a FastAPI endpoint `POST /api/pos/auth-token` that logs into POS server-side and returns a short-lived POS token. Refactor `frontend/src/utils/authToken.js` `loginForToken()` to call FastAPI instead of POS directly. Remove `REACT_APP_LOGIN_PHONE`/`REACT_APP_LOGIN_PASSWORD` from `frontend/.env`.

Options 2 (full POS proxy) and 3 (doc scrub + CI lint) are filed as separate CRs (CR-011 and CR-012).

## 3. Scope

**IN scope:**
- New FastAPI endpoint: `POST /api/pos/auth-token` (auth: none — it's the app's own gateway) that:
  - reads `MYGENIE_POS_LOGIN_PHONE` and `MYGENIE_POS_LOGIN_PASSWORD` from `backend/.env`
  - proxies a `POST` to `${MYGENIE_API_URL}/auth/login` with those credentials via `httpx.AsyncClient`
  - returns `{ "token": "...", "expires_in": ... }` verbatim from POS response
  - fails-fast with 500 if creds missing (same pattern as existing `MYGENIE_API_URL` fail-fast at server.py:52-54)
- Refactor `frontend/src/utils/authToken.js`:
  - Delete the two `HARDCODED_*` constants and the missing-env `logger.error` block.
  - Change `loginForToken()` to `POST ${REACT_APP_BACKEND_URL}/api/pos/auth-token` with no body.
  - Response handling identical to today (extract `token`, `storeToken`, return).
- Env changes:
  - `backend/.env` — add `MYGENIE_POS_LOGIN_PHONE=...` and `MYGENIE_POS_LOGIN_PASSWORD=...` (placeholders for owner).
  - `frontend/.env` — delete `REACT_APP_LOGIN_PHONE` and `REACT_APP_LOGIN_PASSWORD` lines entirely.

**OUT of scope (deferred to CR-011 or CR-012):**
- Proxying place-order / edit-order / table-status / any other POS write call through FastAPI.
- Moving `order_auth_token` out of `localStorage` (it stays where it is; only its source is changed).
- Refactoring the 6 downstream consumers (`LandingPage.jsx`, `ReviewOrder.jsx`, `OrderSuccess.jsx`, `interceptors/*.js`).
- Scrubbing the 18 markdown files that leak the credential.
- Adding a CI lint rule for `REACT_APP_*_PASSWORD/SECRET/TOKEN`.
- Rotating the credential in MyGenie CRM (parallel activity, external — this CR's code does not depend on rotation completing).

## 4. Success criteria

| # | Criterion | How verified |
|---|---|---|
| S-01 | `grep -rn "REACT_APP_LOGIN_" /app/frontend/src` returns **zero** matches | grep after implementation |
| S-02 | `grep -E "REACT_APP_LOGIN_" /app/frontend/.env` returns **zero** matches | grep after implementation |
| S-03 | `curl -X POST $REACT_APP_BACKEND_URL/api/pos/auth-token` returns 200 with `token` field | curl smoke test |
| S-04 | `loginForToken()` flow still populates `localStorage.order_auth_token` unchanged | manual login + `localStorage.getItem('order_auth_token')` in DevTools |
| S-05 | End-to-end order flow still works on preprod (customer scans QR → menu → cart → review → place order → success) | Owner smoke or Playwright happy path |
| S-06 | Built bundle (`yarn build` output in `frontend/build/static/js/main.*.js`) does NOT contain the phone number `9579504871` or password `Qplazm` | `grep -c "9579504871\|Qplazm" frontend/build/static/js/main.*.js` → 0 |
| S-07 | Backend refuses to start if `MYGENIE_POS_LOGIN_*` env vars missing (fail-fast consistent with `JWT_SECRET` / `MYGENIE_API_URL` pattern) | Test with vars unset — expect `ValueError` on startup |
| S-08 | Alpha v0.1 hotspot files (`ReviewOrder.jsx`, `AuthContext.jsx`) NOT edited | `git diff` scope check |

## 5. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | Backend `.env` gets committed with real creds by accident | LOW | HIGH (leak re-appears in git) | `.gitignore` already excludes `backend/.env` (verified in existing `.gitignore` at line 79 pattern `.env`). Use placeholders in `backend/.env` and pass real creds via secret injection / owner-owned secret store. |
| R2 | New `/api/pos/auth-token` endpoint becomes an open oracle for POS login | MEDIUM | HIGH (attacker gets free tokens) | Add rate-limit (deferred to a separate hardening CR — this endpoint is functionally equivalent to what the frontend does today from every browser). Log every issuance with client IP for later audit. |
| R3 | POS rejects our proxied login due to unexpected client-ip / user-agent change | LOW | MEDIUM (breaks token flow) | Test on preprod before merging. Confirm POS doesn't fingerprint incoming IPs. |
| R4 | Bundle-cache in user browsers still contains the old `main.<hash>.js` with credentials | HIGH (transient) | LOW-MEDIUM | Cache-busted by CRA hash in filename. Users pick up new bundle on next visit. Also — credential MUST be rotated in CRM per §6 D-01, so a cached bundle referencing the old cred becomes useless. |
| R5 | Refactor breaks the 401-retry loop in `api/interceptors/response.js` because token now comes from FastAPI instead of POS | LOW | MEDIUM | Interceptor calls `getAuthToken(true)` which calls `loginForToken()` — response contract is unchanged (still returns a POS token). No interceptor change needed. |
| R6 | Existing e2e tests fail because they mock `preprod.mygenie.online/api/v1/auth/login` and now the call goes to FastAPI | LOW | LOW | Existing tests (per grep at investigation §Step 6) reference these envs zero times. No test file needs updating. |

## 6. Owner decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D-01 | Credential rotation timing | (a) rotate before merge (b) rotate at merge (c) rotate within 24 h of merge | **(b)** — do the code change and rotation in the same maintenance window so old cached bundles reference an already-dead credential |
| D-02 | New endpoint auth requirement | (a) no auth (public gateway) (b) require `X-App-Version` header (c) require `Origin` allow-list | **(a) for MVP** — matches today's threat model where anyone with the bundle URL has the same access. Add rate-limit + logging as a follow-up. |
| D-03 | Backend env var naming | (a) `MYGENIE_POS_LOGIN_PHONE` / `_PASSWORD` (b) `POS_SERVICE_PHONE` / `_PASSWORD` (c) inherit `MYGENIE_API_*` prefix | **(a)** — matches existing `MYGENIE_API_URL` convention |
| D-04 | Do we log POS token issuance? | (a) log full request incl. IP + UA (b) log count + IP only (c) no log | **(b)** — enough for abuse detection, no PII |

## 7. Effort & phasing

| Phase | Effort | Owner |
|---|---|---|
| Role 2 planning (this doc) | 45 min | E1 — **done** |
| Owner decisions D-01..D-04 | 5 min | Owner — **not yet answered** |
| Role 3 implementation | 2-3 hrs | E1 — **NOT started per owner direction** |
| Role 4 self-QA + owner smoke | 1 hr | E1 + Owner |
| Credential rotation in CRM | 15 min | MyGenie CRM team — external |
| Closure | 15 min | E1 |

**Total wall-clock:** ~4 hrs code + external rotation coordination.

## 8. Non-goals (explicit)

- Not a full POS-proxy refactor. That is `CR-2026-07-03-011`.
- Not a doc-scrub + CI lint. That is `CR-2026-07-03-012`.
- Not a customer-auth change. Customer OTP/JWT flow via `/api/auth/*` is untouched.
- Not a change to `order_auth_token` storage location or TTL.
- Not adding rate-limit / captcha / anti-abuse on the new endpoint (deferred).
