# Implementation Plan — CR-2026-07-03-000

**Companion docs:** `FINDINGS.md`, `CR.md`, `INTAKE_DOC.md`, `IMPACT_ANALYSIS.md` (same folder).
**Role gate:** Role 3 (IMPLEMENTATION) — **BLOCKED** until owner answers D-01..D-04 in `CR.md` §6.
**Author:** E1, 2026-07-03 (planning only — no code executed here, per owner direction).
**Risk:** MEDIUM.
**Prerequisite:** MyGenie CRM credential rotation coordinated (per D-01).

---

## Precondition: owner decisions must be recorded first

Copy into a comment / PR / message once decided. Implementation cannot start until every row has a value.

| ID | Question | Decision | Recorded by | Date |
|---|---|---|---|---|
| D-01 | Credential rotation timing | `_____` | | |
| D-02 | New endpoint auth requirement | `_____` | | |
| D-03 | Backend env var naming | `_____` | | |
| D-04 | POS token issuance logging | `_____` | | |

---

## Step 1 — Backend endpoint

### 1.1 Add fail-fast env checks at module top

Location: `backend/server.py` immediately after existing `MYGENIE_API_URL` block (~line 52-54).

```python
# CR-2026-07-03-000: POS service credentials for token-issuance proxy.
# These live server-side so they never enter the frontend bundle.
POS_LOGIN_PHONE = os.environ.get("MYGENIE_POS_LOGIN_PHONE")
if not POS_LOGIN_PHONE:
    raise ValueError("CRITICAL: MYGENIE_POS_LOGIN_PHONE environment variable must be set")

POS_LOGIN_PASSWORD = os.environ.get("MYGENIE_POS_LOGIN_PASSWORD")
if not POS_LOGIN_PASSWORD:
    raise ValueError("CRITICAL: MYGENIE_POS_LOGIN_PASSWORD environment variable must be set")
```

### 1.2 Add the endpoint

Location: near existing POS-proxy routes (~server.py:386 `import httpx` neighborhood). Recommended: place under a `# --- POS proxy endpoints ---` header block.

```python
# CR-2026-07-03-000: Proxy endpoint so the frontend does not need to bundle POS creds.
@api_router.post("/pos/auth-token")
async def get_pos_auth_token(request: Request):
    """Issue a short-lived POS auth token.

    Frontend calls this instead of POS /auth/login directly, so the service
    credential never enters the shipped JS bundle.
    """
    import httpx
    client_ip = request.client.host if request.client else "unknown"
    logger.info(f"[pos-auth-token] issuance requested from {client_ip}")  # D-04(b)
    try:
        async with httpx.AsyncClient(timeout=15.0) as http_client:
            resp = await http_client.post(
                f"{MYGENIE_API_URL}/auth/login",
                json={"phone": POS_LOGIN_PHONE, "password": POS_LOGIN_PASSWORD},
            )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("token"):
            raise HTTPException(status_code=502, detail="POS returned no token")
        return data
    except httpx.RequestError as exc:
        logger.error(f"[pos-auth-token] POS unreachable: {exc}")
        raise HTTPException(status_code=502, detail="POS auth service unreachable")
    except httpx.HTTPStatusError as exc:
        logger.error(f"[pos-auth-token] POS rejected login: {exc.response.status_code}")
        raise HTTPException(status_code=502, detail="POS auth service rejected credentials")
```

Notes:
- `Request` is FastAPI's `starlette.requests.Request`; import already exists in server.py (verify at implementation).
- `HTTPException` and `logger` are already in scope (server.py uses them widely).
- Timeout 15 s matches other POS-proxy calls in server.py (search `timeout=30.0` and align — this is a write, so 15 s is a deliberate choice; owner can override to 30 s if flakiness observed).
- No auth on the endpoint per D-02(a) recommendation. If D-02 → b or c, add the header/origin check here before the `try`.

### 1.3 Backend .env

Add to `/app/backend/.env`:

```
MYGENIE_POS_LOGIN_PHONE=<PLACEHOLDER_ROTATE_IN_CRM>
MYGENIE_POS_LOGIN_PASSWORD=<PLACEHOLDER_ROTATE_IN_CRM>
```

**Do NOT commit real values.** Owner injects real creds via the container secret pathway (same pathway used for `MONGO_URL`).

### 1.4 Verify backend starts

```bash
sudo supervisorctl restart backend
sleep 3
sudo supervisorctl status backend
tail -n 20 /var/log/supervisor/backend.err.log
# Expected: RUNNING, Application startup complete
```

## Step 2 — Frontend refactor

### 2.1 Edit `frontend/src/utils/authToken.js`

**Delete** lines 13-21 (the `HARDCODED_*` constants and env-missing warning):

```js
// DELETE:
// Auth credentials from environment variables (CA-001 fix)
// IMPORTANT: These must be set in .env file - no hardcoded fallbacks for security
const HARDCODED_PHONE = process.env.REACT_APP_LOGIN_PHONE;
const HARDCODED_PASSWORD = process.env.REACT_APP_LOGIN_PASSWORD;

// Validate credentials are configured
if (!HARDCODED_PHONE || !HARDCODED_PASSWORD) {
  logger.error('auth', 'CRITICAL: Missing REACT_APP_LOGIN_PHONE or REACT_APP_LOGIN_PASSWORD in environment');
}
```

**Replace** `loginForToken` body (lines 93-124):

```js
/**
 * Call FastAPI to get a fresh POS token.
 * CR-2026-07-03-000: creds no longer bundled — server-side proxy issues the token.
 */
export const loginForToken = async () => {
  const BACKEND = process.env.REACT_APP_BACKEND_URL;
  if (!BACKEND) {
    logger.error('auth', 'CRITICAL: REACT_APP_BACKEND_URL is not set — cannot obtain POS token');
    throw new Error('Backend URL not configured');
  }
  try {
    console.log('[Auth] Requesting POS token via backend proxy...');
    const response = await fetch(`${BACKEND}/api/pos/auth-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`Backend token proxy returned ${response.status}`);
    }
    const data = await response.json();
    if (data && data.token) {
      storeToken(data.token);
      console.log('[Auth] POS token received via proxy', {
        tokenReceived: true,
        isPhoneVerified: data.is_phone_verified,
        userId: data.user_id,
      });
      return data.token;
    }
    throw new Error('No token in response');
  } catch (error) {
    console.error('[Auth] Token proxy failed:', error);
    clearStoredToken();
    const errorMessage = error.message || 'Login failed';
    throw new Error(`Failed to get authentication token: ${errorMessage}`);
  }
};
```

Notes:
- Switched from `apiClient.post` (axios pointed at POS) to `fetch` against `REACT_APP_BACKEND_URL` — because `apiClient.baseURL === REACT_APP_API_BASE_URL === preprod POS URL`, not our FastAPI.
- `import apiClient from '../api/config/axios';` on line 3 can now be **removed** (verify no other usage in this file — it's not used elsewhere per Role 6 findings).
- `import logger from './logger';` stays.
- Public API of `loginForToken()` is preserved (still returns `Promise<string>` resolving to the token, still calls `storeToken` on success, still calls `clearStoredToken` on failure, still throws with a similar error shape).

### 2.2 Edit `frontend/.env`

Delete these two lines:

```
REACT_APP_LOGIN_PHONE=REPLACE_WITH_LOGIN_PHONE
REACT_APP_LOGIN_PASSWORD=REPLACE_WITH_LOGIN_PASSWORD
```

### 2.3 Restart frontend (env change requires restart, not hot-reload)

```bash
sudo supervisorctl restart frontend
sleep 8
sudo supervisorctl status frontend
```

## Step 3 — Verification (V-01..V-11)

Run all 11 checks from `IMPACT_ANALYSIS.md` §7. All must pass before declaring Role 3 complete.

```bash
# V-01 no REACT_APP_LOGIN_ in frontend/src
grep -rn "REACT_APP_LOGIN_" /app/frontend/src && echo "❌ FAIL" || echo "✅ V-01"

# V-02 not in frontend/.env
grep -E "REACT_APP_LOGIN_" /app/frontend/.env && echo "❌ FAIL" || echo "✅ V-02"

# V-03 endpoint responds
curl -s -o /dev/null -w "V-03 status: %{http_code}\n" -X POST \
  "$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)/api/pos/auth-token"
# Expected 200 with real creds; 502 with placeholder creds (rotation not done yet)

# V-04 fail-fast on missing env (destructive — comment out lines temporarily)
# Not run in normal Role 3 execution; owner-verified separately.

# V-05 backend running
sudo supervisorctl status backend | grep -q RUNNING && echo "✅ V-05" || echo "❌ FAIL"

# V-06 manual — DevTools localStorage.order_auth_token populated after any authenticated action
# Documented in QA_HANDOVER.md owner steps.

# V-07 end-to-end order flow — Playwright script or owner smoke, see QA_HANDOVER.md.

# V-08 bundle has no cred
cd /app/frontend && CI=false yarn build 2>&1 | tail -5
grep -c "9579504871\|Qplazm" /app/frontend/build/static/js/main.*.js && echo "❌ FAIL" || echo "✅ V-08"

# V-09 401-retry — hand-simulated via DevTools; see QA_HANDOVER.md

# V-10 no hotspot file edited
git diff --name-only | grep -E "ReviewOrder|AuthContext|CartContext|RestaurantConfigContext" \
  && echo "❌ FAIL" || echo "✅ V-10"

# V-11 services still running
sudo supervisorctl status | grep -E "backend|frontend" | grep -c RUNNING
# Expected 2
```

## Step 4 — Commit shape

One atomic commit. Suggested message:

```
CR-2026-07-03-000: proxy POS token issuance through FastAPI

- Add POST /api/pos/auth-token endpoint (server.py) that logs into MyGenie POS
  with server-side credentials from backend/.env
- Add MYGENIE_POS_LOGIN_PHONE + MYGENIE_POS_LOGIN_PASSWORD env vars (fail-fast)
- Refactor frontend/src/utils/authToken.js loginForToken() to call FastAPI
  instead of POS directly
- Remove REACT_APP_LOGIN_PHONE + REACT_APP_LOGIN_PASSWORD from frontend/.env
- No hotspot files touched (ReviewOrder, AuthContext, contexts unchanged)
- Follows Option 1 from FINDINGS.md; Option 2 (full POS proxy) filed as CR-011
- Doc scrub of leaked credential filed as CR-012
- Credential rotation coordinated separately with MyGenie CRM team (D-01)
```

## Step 5 — Exit Gate (Alpha v0.1 §8 Role 3)

| # | Check | Status target |
|---|---|---|
| 1 | Registry updated (`README.md` row flipped to ✅ SHIPPED) | ☐ |
| 2 | Issue tracker updated (CR.md status → SHIPPED) | ☐ |
| 3 | File ownership updated (this CR's docs mention which files it edited) | ☐ |
| 4 | Code markers added (`// CR-2026-07-03-000:` in the 2 code files) | ☐ |
| 5 | Build/compile clean (`yarn build` succeeds; backend supervisor RUNNING) | ☐ |
| 6 | Self-test complete (V-01..V-11 pass) | ☐ |
| 7 | QA handover written (`QA_HANDOVER.md` in this folder — owner smoke steps) | ☐ |

## Step 6 — Compact Role 3 exit block (to fill on execution)

```text
Code complete: CR-2026-07-03-000
Risk: MEDIUM (auth-adjacent, but localised)
Self-test: <N>/11 PASS
Build/compile: PASS / FAIL
Registry sync: YES
Exit Gate: <N>/7 PASS
Docs: memory/change_requests/CR-2026-07-03-000-.../{FINDINGS, CR, INTAKE_DOC, IMPACT_ANALYSIS, IMPLEMENTATION_PLAN, QA_HANDOVER}.md
Next: QA (owner smoke — see QA_HANDOVER.md §Owner steps)
```

---

## What this plan explicitly does NOT do

- Does not proxy any POS call other than `/auth/login` — that's CR-011.
- Does not scrub the 18 markdown files that leaked the credential — that's CR-012.
- Does not add rate-limit, captcha, IP allow-list on the new endpoint (deferred to a hardening CR if needed post-rollout).
- Does not touch any hotspot file (ReviewOrder.jsx, AuthContext.jsx, etc.).
- Does not touch React Query, error boundaries, or any UX surface.
- Does not restart Mongo or edit any DB schema.
- Does not rotate the credential in CRM (external — owner-coordinated with MyGenie CRM team).

If any of the above becomes tempting mid-execution, **stop** per Alpha v0.1 §11 R4 (scope lock) and open a new CR.
