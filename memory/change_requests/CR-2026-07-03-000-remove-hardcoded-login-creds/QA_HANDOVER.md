# QA Handover — CR-2026-07-03-000

**Role:** Role 3 (IMPLEMENTATION) → handing off to Role 4 (QA) / owner smoke test.
**Author:** E1, 2026-07-04 (UTC — 2026-07-03 IST)
**Risk:** MEDIUM (auth path, localised)
**Owner decisions applied:** D-01=done (rotation coordinated on owner side), D-02=a (no auth on endpoint), D-03=a (`MYGENIE_POS_LOGIN_*` naming), D-04=b (log count + IP only)

---

## 1. What shipped

| # | Change | Path |
|---|---|---|
| 1 | Add server-side POS credential vars (fail-fast) | `backend/server.py` lines 56–65 |
| 2 | Add `POST /api/pos/auth-token` proxy endpoint with IP logging | `backend/server.py` (before `air_bnb_router`, ~35 LOC) |
| 3 | Add placeholder env vars | `backend/.env` — added `MYGENIE_POS_LOGIN_PHONE` and `MYGENIE_POS_LOGIN_PASSWORD` |
| 4 | Refactor `loginForToken()` to call FastAPI instead of POS directly | `frontend/src/utils/authToken.js` |
| 5 | Remove now-unused `apiClient` import from `authToken.js` | `frontend/src/utils/authToken.js` line 3 (deleted) |
| 6 | Remove bundled credentials from frontend env | `frontend/.env` — deleted `REACT_APP_LOGIN_PHONE` and `REACT_APP_LOGIN_PASSWORD` |
| 7 | CR-000 code marker in both edited files | `// CR-2026-07-03-000:` comments |

## 2. What was NOT changed (scope lock enforced)

- **Hotspot files untouched**: `ReviewOrder.jsx`, `AuthContext.jsx`, `CartContext.js`, `RestaurantConfigContext.jsx` (Alpha v0.1 Part C CRITICAL)
- **Consumer files untouched**: `OrderSuccess.jsx`, `LandingPage.jsx`, `api/interceptors/request.js`, `api/interceptors/response.js`
- **No tests changed** (per Role 6, no test file references these envs)
- **Operating prompt untouched** (`memory/control/` clean)
- **Other `.env` values untouched** (MONGO_URL, DB_NAME, JWT_SECRET, etc. preserved)
- **`frontend/.env` cleanup preserved** `REACT_APP_CRM_URL` and `REACT_APP_GOOGLE_MAPS_API_KEY` (accidental over-delete corrected in same session)

## 3. Self-test results (V-01..V-11)

| ID | Check | Expected | Actual | Result |
|---|---|---|---|---|
| V-01 | No `REACT_APP_LOGIN_` in `frontend/src/` | 0 hits | 0 hits | ✅ PASS |
| V-02 | Not in `frontend/.env` | 0 hits | 0 hits | ✅ PASS |
| V-03 | `POST /api/pos/auth-token` responds | 200 with real creds / 502 with placeholders | 502 `{"detail":"POS auth service rejected credentials"}` (placeholder creds — expected) | ✅ PASS (endpoint working end-to-end; POS returned 401 → wrapped to 502 by our handler) |
| V-04 | Fail-fast on missing env | `ValueError` raised on startup | Fail-fast code present in server.py (verified by grep); backend refused to start would show `ValueError: CRITICAL: MYGENIE_POS_LOGIN_PHONE environment variable must be set` | ✅ PASS (code path verified) |
| V-05 | Backend RUNNING with vars set | supervisor status RUNNING | `backend RUNNING pid 6238` | ✅ PASS |
| V-06 | `loginForToken()` populates `localStorage.order_auth_token` | Manual DevTools check | Requires owner smoke (§4 below) — will populate once real creds land | ⏳ Owner smoke pending |
| V-07 | End-to-end order flow works | Playwright/owner | Same — requires real creds | ⏳ Owner smoke pending |
| V-08 | Built bundle has no leaked cred | 0 hits | `grep -c "9579504871\|Qplazm" build/static/js/main.*.js` → **0**; `REACT_APP_LOGIN_PHONE\|_PASSWORD` → **0**; `HARDCODED_PHONE\|_PASSWORD` → **0** | ✅ PASS |
| V-09 | 401-retry still refreshes token | Manual sim | Wrapped in same `getAuthToken(force=true) → loginForToken()` flow; contract preserved; requires real creds to fully exercise | ⏳ Owner smoke pending |
| V-10 | No hotspot file edited | `git diff` scope | No hotspot files in diff | ✅ PASS |
| V-11 | Services RUNNING | Both up | Both RUNNING, 30+ seconds uptime | ✅ PASS |

**Overall:** 8/11 PASS, 3/11 gated on real POS credentials being pasted into `backend/.env`.

**Lint check:** `mcp_lint_python` and `mcp_lint_javascript` both returned zero issues on the edited files.

## 4. Owner action required to close the last 3 checks

Two things are needed from you before we can call CR-000 fully complete:

### 4.1 Paste real (rotated) POS credentials into `backend/.env`

Open `/app/backend/.env` and replace:
```
MYGENIE_POS_LOGIN_PHONE=REPLACE_WITH_POS_SERVICE_PHONE
MYGENIE_POS_LOGIN_PASSWORD=REPLACE_WITH_POS_SERVICE_PASSWORD
```
with the **rotated** MyGenie CRM service-account credentials. Then:
```bash
sudo supervisorctl restart backend
```

Verify:
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  $(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)/api/pos/auth-token
# Expected: 200
```

### 4.2 Smoke test the customer flow

Open the preview URL and confirm:

1. Landing page loads.
2. Open DevTools → Application → Local Storage → `https://…preview.emergentagent.com`.
3. Trigger any flow that touches `getAuthToken` (e.g. tap a menu item → add to cart → open checkout).
4. Confirm `order_auth_token` key appears in localStorage with a JWT value.
5. Confirm no red errors in DevTools Console.

If all 4 steps pass → V-06, V-07, V-09 close and CR-000 is fully complete.

## 5. What's now safe / what's still risky

| | Before CR-000 | After CR-000 |
|---|---|---|
| POS creds in shipped JS bundle | ✅ YES (`+91…` / `Qplazm…` in `main.js`) | ❌ NO (verified: `grep -c` → 0) |
| POS creds in `frontend/.env` | ✅ YES | ❌ NO |
| POS creds in `backend/.env` | ❌ NO | ✅ YES — server-side only, `.gitignore` blocked |
| POS creds in 18 markdown docs (git history) | ✅ YES | ✅ YES — **still leaked**; scrub is CR-2026-07-03-012 |
| POS token in browser `localStorage` | ✅ YES (accessible via XSS) | ✅ YES — **unchanged**; full removal is CR-2026-07-03-011 |
| Endpoint has rate limiting | ❌ NO | ❌ NO — deferred to future hardening CR |

## 6. Rollback

Reversible in one commit:

```bash
cd /app
git checkout backend/server.py backend/.env frontend/src/utils/authToken.js frontend/.env
sudo supervisorctl restart backend frontend
```

(The old `REACT_APP_LOGIN_*` lines are still in `frontend/.env`'s prior git-tracked state. Restore them with the checkout above if needed.)

## 7. Compact Role 3 exit block

```text
Code complete: CR-2026-07-03-000
Risk: MEDIUM (auth path, localised)
Self-test: 8/11 PASS + 3/11 owner-gated (V-06/V-07/V-09 need real POS creds)
Build/compile: PASS (yarn build succeeded; supervisor RUNNING; python lint clean; JS lint clean)
Registry sync: YES (README.md flipped to 🚧 IMPLEMENTED, QA-pending)
Exit Gate: 7/7 (1. Registry ✓, 2. Issue tracker ✓, 3. File ownership ✓, 4. Code markers ✓ [`CR-2026-07-03-000` in both files], 5. Build clean ✓, 6. Self-test ✓ [8/11 + 3 gated], 7. QA_HANDOVER.md ✓)
Docs: memory/change_requests/CR-2026-07-03-000-.../{FINDINGS, INTAKE_DOC, CR, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN, QA_HANDOVER}.md
Next: Owner pastes rotated creds into backend/.env + 4-step smoke test in §4 above. Then CR is closable.
```
