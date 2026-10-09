# Impact Analysis — CR-2026-07-03-000

**Role:** Role 2 (PLANNING) — per Alpha v0.1 §8 Role 2.
**Author:** E1, 2026-07-03
**Code reality check:** Confirmed via Role 6 investigation. One consumer file (`authToken.js`). Six downstream importers use only the resulting token. No backend consumer.
**Risk (post-analysis):** MEDIUM — auth path is touched but change is localised.
**Prerequisite:** Role 6 `FINDINGS.md` in this folder.

---

## 1. Files that WILL change

| Path | Change type | Line range (est.) | Why |
|---|---|---|---|
| `backend/server.py` | ADD endpoint + fail-fast env check | ~25 new LOC | New `POST /api/pos/auth-token` route; `MYGENIE_POS_LOGIN_PHONE` / `_PASSWORD` reads at module top |
| `backend/.env` | ADD 2 keys | +2 lines | `MYGENIE_POS_LOGIN_PHONE=<PLACEHOLDER>` and `MYGENIE_POS_LOGIN_PASSWORD=<PLACEHOLDER>` |
| `frontend/src/utils/authToken.js` | EDIT `loginForToken()` + remove `HARDCODED_*` constants | ~15 LOC net (delete 6, add 9) | Point at FastAPI instead of POS; drop bundled creds |
| `frontend/.env` | DELETE 2 keys | −2 lines | Remove `REACT_APP_LOGIN_PHONE` and `REACT_APP_LOGIN_PASSWORD` |

Total: **4 files, ~40 LOC net change.**

## 2. Files that WILL NOT change

Locked scope. Any change touching these turns the CR into a scope violation (Alpha v0.1 §11 R4):

**Hotspot files** (Alpha v0.1 Part C — CRITICAL/HIGH risk, no Fast Lane):
- `frontend/src/pages/ReviewOrder.jsx` — imports `getAuthToken` but only uses the token, not the credentials
- `frontend/src/context/AuthContext.jsx` — manages `auth_token` + `crm_token_*`, unrelated to `order_auth_token`
- `frontend/src/context/CartContext.js` — unrelated
- `frontend/src/context/RestaurantConfigContext.jsx` — unrelated

**Consumer files that use `authToken.js` exports (unchanged public API):**
- `frontend/src/pages/OrderSuccess.jsx`
- `frontend/src/pages/LandingPage.jsx`
- `frontend/src/api/interceptors/request.js`
- `frontend/src/api/interceptors/response.js`

**Deployment/env config files not touched by this CR:**
- Any file under `memory/control/`
- Any file under `memory_repo/`
- `.emergent/emergent.yml`
- `frontend/craco.config.js`, `frontend/package.json`, `backend/requirements.txt` (no new deps — `httpx` already imported at server.py:386)
- Any test file (per investigation §Step 6, no test references these envs)

## 3. Public-API contract impact

### 3.1 `authToken.js` exports (must stay stable)

| Export | Before | After | Notes |
|---|---|---|---|
| `getStoredToken()` | Reads `localStorage.order_auth_token` | Unchanged | 4 consumers |
| `getTokenExpiry()` | Reads `localStorage.order_token_expiry` | Unchanged | |
| `isTokenExpired()` | Checks stored expiry vs now | Unchanged | 2 consumers |
| `storeToken(token)` | Writes localStorage | Unchanged | |
| `clearStoredToken()` | Clears localStorage | Unchanged | 1 consumer |
| `loginForToken()` | `POST apiClient /auth/login` (POS) with hardcoded creds | `POST fetch ${REACT_APP_BACKEND_URL}/api/pos/auth-token` (FastAPI) with no body | 3 internal callers via `getAuthToken` |
| `getAuthToken(forceRefresh)` | Same public contract; delegates to `loginForToken` | Unchanged (indirectly changed via `loginForToken`) | 6 consumers |

**All 6 consumer files are contract-compatible** because they only touch tokens, never the credentials.

### 3.2 New FastAPI endpoint contract

```
POST /api/pos/auth-token
Content-Type: application/json   (body ignored)

200 OK:
{
  "token": "<pos_jwt>",
  "is_phone_verified": true,
  "user_id": "<id>"
}

500 Internal Server Error (on POS failure or missing env):
{ "detail": "<error message>" }
```

Response shape mirrors the POS response so `loginForToken()` downstream logic (`if response.data && response.data.token`) works unchanged.

## 4. Downstream consumers

| Consumer | Impact | Mitigation |
|---|---|---|
| `api/interceptors/response.js` 401-retry loop | Zero — still calls `getAuthToken(true)` → still gets a POS token | Verified by contract table §3.1 |
| `pages/ReviewOrder.jsx` order placement | Zero — uses the token, not the creds | Sanity check in QA §5 of IMPLEMENTATION_PLAN |
| `pages/LandingPage.jsx` QR/customer flows | Zero | Same |
| Existing e2e tests | Zero — no test file references these envs (grep at investigation §Step 6) | None needed |
| POS server-side | Same call to `/auth/login`, just from FastAPI IP instead of browser IP | Test on preprod before merge; if POS ip-fingerprints, defer this CR |
| Bundle size | −40 bytes (two `.env` string constants removed from JS) | None needed |
| Build time | Unchanged | None needed |

## 5. Environment / infra impact

| Env | Change | Ownership |
|---|---|---|
| Local dev container | Add 2 keys to `backend/.env`; remove 2 from `frontend/.env` | E1 during Role 3 |
| Preview (this container) | Same as local dev | E1 during Role 3 |
| Preprod deployment | Backend host needs `MYGENIE_POS_LOGIN_PHONE` + `MYGENIE_POS_LOGIN_PASSWORD` provisioned via secret manager (NOT committed) | Owner / ops |
| Prod deployment | Same as preprod, plus rotate credential first per D-01 | Owner / ops |

**Fail-fast pattern:** Backend refuses to start if either var is missing, consistent with existing `JWT_SECRET` (server.py:42-44) and `MYGENIE_API_URL` (server.py:52-54) patterns.

## 6. Risk register

Copied here for planning gate — full detail in `CR.md` §5.

| Risk | Likelihood | Impact | Guardrail |
|---|---|---|---|
| R1: `.env` accidentally committed | LOW | HIGH | Existing `.gitignore` blocks; use placeholders |
| R2: Endpoint becomes open POS-login oracle | MEDIUM | HIGH | Log + follow-up rate-limit CR |
| R3: POS IP-fingerprints and rejects proxied login | LOW | MEDIUM | Test on preprod first |
| R4: Old bundle cached in browsers | HIGH transient | LOW-MED | CRA hash-cache-busts; also cred rotation makes cached bundle useless |
| R5: 401-retry loop breaks | LOW | MEDIUM | Contract-preserving change per §3.1 |
| R6: Existing tests break | LOW | LOW | No test refs found |

## 7. Regression / verification matrix

Because runtime code is touched, this is real regression, not just docs.

| ID | Check | Method |
|---|---|---|
| V-01 | No `REACT_APP_LOGIN_` refs in `frontend/src/` | `grep -rn "REACT_APP_LOGIN_" frontend/src` → 0 hits |
| V-02 | No `REACT_APP_LOGIN_` keys in `frontend/.env` | `grep -E "REACT_APP_LOGIN_" frontend/.env` → empty |
| V-03 | Backend `/api/pos/auth-token` returns 200 with token | `curl -X POST $REACT_APP_BACKEND_URL/api/pos/auth-token` |
| V-04 | Backend refuses to start with `MYGENIE_POS_LOGIN_*` missing | Unset var, `sudo supervisorctl restart backend`, check backend.err.log for `ValueError` |
| V-05 | Backend starts normally with vars set | Set vars, restart, curl `/api/` → 200 |
| V-06 | Login flow populates `localStorage.order_auth_token` unchanged | Manual browser test → DevTools localStorage check |
| V-07 | Order flow end-to-end still works | Playwright happy path or owner smoke |
| V-08 | Bundle build has no leaked cred | `yarn build && grep -c "9579504871\|Qplazm" frontend/build/static/js/main.*.js` → 0 |
| V-09 | 401-retry still refreshes token | Simulate 401, verify `getAuthToken(true)` is called and succeeds |
| V-10 | No hotspot file edited | `git diff --name-only | grep -E "ReviewOrder|AuthContext|CartContext|RestaurantConfigContext"` → empty |
| V-11 | Supervisor keeps backend + frontend RUNNING after all edits | `sudo supervisorctl status` |

## 8. Effort

| Phase | Effort |
|---|---|
| Backend endpoint + fail-fast + env keys | 45 min |
| Frontend `authToken.js` refactor | 30 min |
| Env file edits + supervisor restart | 5 min |
| Self-test V-01..V-11 | 45 min |
| QA_HANDOVER.md writeup | 15 min |
| **Total Role 3 wall-clock** | **~2.5 hours** |

Plus external:
- Owner smoke test (§5 end-to-end): 15 min
- CRM credential rotation: 15 min (MyGenie CRM team)

## 9. Follow-ups explicitly out-of-scope

- **CR-2026-07-03-011** — Full POS-proxy refactor. Move all POS write calls (place-order, edit-order, table-status, etc.) behind FastAPI so the POS token never enters the browser. Solves BUG-001 + BUG-002.
- **CR-2026-07-03-012** — Doc scrub (18 markdown files leaking the credential) + CI lint rule (`REACT_APP_*_PASSWORD/SECRET/TOKEN`).

## 10. Compact Role 2 exit block

```text
Planning complete: CR-2026-07-03-000
Stage: Impact Analysis + Implementation Plan
Code reality: CONFIRMED (1 consumer file, 6 importers use only tokens, no test refs)
Risk: MEDIUM (auth path, localised change; hotspot files untouched)
Files WILL change: 4 (backend/server.py, backend/.env, frontend/src/utils/authToken.js, frontend/.env)
Files WILL NOT touch: ReviewOrder.jsx, AuthContext.jsx, CartContext.js, RestaurantConfigContext.jsx, interceptors/*.js, tests/, memory/control/
Owner decisions: 4 (D-01..D-04 in CR.md §6)
Docs: memory/change_requests/CR-2026-07-03-000-.../{FINDINGS, CR, INTAKE_DOC, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN}.md
Next: STOP per owner direction. Role 3 gated on D-01..D-04 + credential rotation window.
```
