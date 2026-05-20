# CR-001 Restaurant CRM Token Push Implementation Plan

> **Branch:** `30-April` (commit `7c1d280`)
> **Date:** 2026-05-20
> **Status:** implementation_plan_ready_for_owner_approval
> **Prerequisite:** [CRM_LATEST_BRANCH_LOGIN_FLOW_EXPLANATION.md](./CRM_LATEST_BRANCH_LOGIN_FLOW_EXPLANATION.md)

---

## 1. Objective

When a restaurant owner logs into CRM Light via the MyGenie flow (`mygenie_login`), the CRM backend must **automatically push** the CRM API key (`users.api_key`) to MyGenie POS so that MyGenie can call CRM webhook endpoints (`/api/pos/*`) without any manual key copying by the restaurant owner.

This must happen:
- On **every** real login (first-time and returning)
- **Idempotently** — re-pushing the same key is safe
- **Fire-and-forget** — POS push failure must never block CRM login
- **From the backend only** — no frontend involvement

---

## 2. Current Login Flow Summary (30-April branch)

File: `/app/backend/routers/auth.py`, function `mygenie_login()` (lines 236–429)

```
Step 1: Frontend → POST /api/auth/login { email, password }
Step 2: /api/auth/login delegates to mygenie_login()
Step 3: CRM → MyGenie POST /api/v1/auth/vendoremployee/login → gets mygenie_token
Step 4: CRM → MyGenie GET  /api/v1/vendoremployee/profile   → gets restaurant_id, name, etc.
Step 5: CRM checks local DB for existing user (by pos_id+restaurant_id, then by email)
Step 6a: EXISTING USER → update password_hash, mygenie_token, last_login → return JWT + pos_config
Step 6b: NEW USER → generate api_key → insert user → create loyalty settings + templates → return JWT + pos_config
Step 7: *** MISSING *** → push api_key to MyGenie as crm_token  ← THIS IS CR-001
```

What is NOT happening today:
- No call to `POST /api/v1/auth/restaurant-crm-token`
- No backfill of `api_key` for legacy users that don't have one
- No tracking of whether the push succeeded

---

## 3. Required Endpoint

| Property | Value |
|----------|-------|
| **URL** | `{MYGENIE_API_URL}/api/v1/auth/restaurant-crm-token` |
| **Default base** | `https://preprod.mygenie.online` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Auth header** | `Authorization: Bearer {mygenie_token}` (include if available — unclear if required; safe to send) |
| **Payload** | `{ "restaurant_id": "<str>", "crm_token": "<users.api_key>" }` |
| **Success** | `2xx` — token stored by MyGenie |
| **Conflict** | `409` — token already exists for this restaurant; treat as success |
| **Failure** | Any other status / timeout / network error — log and continue |

---

## 4. User Cases Covered

| Case | Current Behavior (30-April) | Required Behavior (CR-001) |
|------|---------------------------|---------------------------|
| **First-time user** | `api_key` generated (line 344), stored in user doc (line 351), NOT pushed to POS | Generate `api_key` → insert user → **push `api_key` to MyGenie** → track result |
| **Returning user WITH `api_key`** | `api_key` reused from existing doc (line 339), NOT pushed to POS | Reuse existing `api_key` → **push `api_key` to MyGenie** (idempotent) → track result |
| **Legacy user WITHOUT `api_key`** | `existing_user.get("api_key", "")` → empty string passed to `pos_config` | **Generate `api_key`** → save to user doc → **push to MyGenie** → track result |
| **POS returns 409** | N/A — no push exists | Treat as success — POS already has the key |
| **POS returns 500 / timeout / error** | N/A — no push exists | Log error, record failure on user doc, **do NOT fail CRM login** |
| **Demo login** | No POS calls at all (line 207–234) | **No change** — demo login stays purely local |

---

## 5. Exact Code Insertion Points

### File: `/app/backend/routers/auth.py`

#### A. New helper function — insert near top, after `_build_pos_config()` (after line 42)

```
NEW: async def _register_crm_token_with_pos(client, mygenie_api_url, restaurant_id, api_key, mygenie_token, user_id)
```

This is the fire-and-forget push function. Details in Section 6.

#### B. EXISTING USER path — after the `update_one` at line 326, BEFORE the `return TokenResponse` at line 328

Current code (lines 317–341):
```python
if existing_user:
    # Update password_hash and mygenie_token for existing user
    await db.users.update_one(...)                          # line 319-326
    token = create_token(existing_user["id"])                # line 327
    return TokenResponse(...)                                # line 328-341
```

Insert between line 326 and line 327:
```
# --- CR-001: Backfill api_key if missing ---
api_key = existing_user.get("api_key")
if not api_key:
    api_key = generate_api_key()
    await db.users.update_one({"id": existing_user["id"]}, {"$set": {"api_key": api_key}})

# --- CR-001: Push CRM token to MyGenie POS ---
await _register_crm_token_with_pos(
    client, mygenie_api_url, restaurant_id, api_key, mygenie_token, existing_user["id"]
)
```

Also update line 339 to use the resolved `api_key` variable instead of `existing_user.get("api_key", "")`.

#### C. FIRST-TIME USER path — after `insert_one` at line 363, BEFORE loyalty settings at line 366

Current code (lines 363–404):
```python
await db.users.insert_one(user_doc)                        # line 363
                                                            # ← INSERT HERE
# Create default loyalty settings                          # line 365
settings_doc = {...}                                        # line 366
```

Insert after line 363:
```
# --- CR-001: Push CRM token to MyGenie POS ---
await _register_crm_token_with_pos(
    client, mygenie_api_url, restaurant_id, api_key, mygenie_token, user_id
)
```

### File: `/app/backend/core/auth.py`
- **No changes needed.** `generate_api_key()` already exists at line 44–46.

### File: `/app/backend/models/schemas.py`
- **No changes needed.** `TokenResponse` already includes `pos_config: Optional[dict]`.

---

## 6. Proposed Helper Function

**Location:** `/app/backend/routers/auth.py`, after `_build_pos_config()` (after line 42)

```python
async def _register_crm_token_with_pos(
    client: "httpx.AsyncClient",
    mygenie_api_url: str,
    restaurant_id: str,
    api_key: str,
    mygenie_token: str,
    user_id: str
):
    """
    Push CRM API key to MyGenie POS as crm_token.
    Fire-and-forget — never raises, never blocks login.
    Treats 2xx and 409 as success.
    Persists registration status on users doc.
    """
    import logging
    logger = logging.getLogger("cr001")

    if not restaurant_id or not api_key:
        logger.warning(f"CR-001 skip: missing restaurant_id={restaurant_id} or api_key for user={user_id}")
        return

    crm_token_endpoint = os.getenv(
        "MYGENIE_CRM_TOKEN_ENDPOINT",
        "/api/v1/auth/restaurant-crm-token"
    )
    now = datetime.now(timezone.utc).isoformat()

    try:
        headers = {"Content-Type": "application/json"}
        if mygenie_token:
            headers["Authorization"] = f"Bearer {mygenie_token}"

        resp = await client.post(
            f"{mygenie_api_url}{crm_token_endpoint}",
            json={
                "restaurant_id": restaurant_id,
                "crm_token": api_key
            },
            headers=headers,
            timeout=10.0
        )

        success = resp.status_code in range(200, 300) or resp.status_code == 409

        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "crm_token_registered_with_pos": success,
                "crm_token_registered_at": now,
                "pos_crm_token_response": {
                    "status_code": resp.status_code,
                    "body": resp.text[:500],
                    "timestamp": now
                }
            }}
        )

        if success:
            logger.info(f"CR-001 OK: crm_token pushed for user={user_id} restaurant={restaurant_id} status={resp.status_code}")
        else:
            logger.warning(f"CR-001 FAIL: status={resp.status_code} body={resp.text[:200]} user={user_id}")

    except Exception as e:
        logger.error(f"CR-001 ERROR: {type(e).__name__}: {e} user={user_id}")
        try:
            await db.users.update_one(
                {"id": user_id},
                {"$set": {
                    "crm_token_registered_with_pos": False,
                    "crm_token_registered_at": now,
                    "pos_crm_token_response": {
                        "error": f"{type(e).__name__}: {str(e)[:300]}",
                        "timestamp": now
                    }
                }}
            )
        except Exception:
            pass  # Absolute last resort — never crash login
```

### Key design decisions:

| Decision | Rationale |
|----------|-----------|
| **`await` not `asyncio.create_task`** | We want the Mongo status update to complete before login returns. The 10s timeout caps the delay. |
| **Accept `client` as parameter** | Reuses the existing `httpx.AsyncClient` from `mygenie_login`'s `async with` block — no new connection overhead. |
| **Include `Authorization: Bearer mygenie_token`** | CR-001 doc says "No auth header needed," but it's unclear. Sending the token is safe and avoids 401 if POS requires it. |
| **409 = success** | POS already has a token for this restaurant. Idempotent — no action needed. |
| **Persist status to Mongo** | Enables debugging via `db.users.find({"crm_token_registered_with_pos": false})` without checking logs. |
| **Configurable endpoint via env** | `MYGENIE_CRM_TOKEN_ENDPOINT` allows override without code change. |

---

## 7. Mongo Fields To Persist

Added to `users` collection document:

| Field | Type | Example | Purpose |
|-------|------|---------|---------|
| `crm_token_registered_with_pos` | `bool` | `true` | Quick query: which restaurants have working POS integration |
| `crm_token_registered_at` | `str` (ISO datetime) | `"2026-05-20T09:30:00+00:00"` | When the last push attempt happened |
| `pos_crm_token_response` | `dict` | `{"status_code": 200, "body": "...", "timestamp": "..."}` | Debug info for failed pushes |

### Query examples for ops:
```js
// Find all users where push failed
db.users.find({ crm_token_registered_with_pos: false })

// Find users never pushed (legacy, pre-CR-001)
db.users.find({ crm_token_registered_with_pos: { $exists: false } })

// Find users missing api_key entirely
db.users.find({ api_key: { $exists: false } })
```

---

## 8. Conflict With Existing pos_config

| Aspect | pos_config (existing) | CR-001 push (new) |
|--------|----------------------|-------------------|
| **Direction** | Backend → Frontend (in HTTP response) | Backend → MyGenie POS (server-to-server) |
| **Contains api_key?** | Yes (`pos_config.api_key`) | Yes (`crm_token` = same `api_key`) |
| **Who receives it?** | Browser (frontend ignores it) | MyGenie POS backend |
| **Actionable?** | No — frontend does nothing with it | Yes — POS stores it and uses it for webhook calls |
| **Remove in CR-001?** | **NO** — out of scope | N/A |

### Why keep both:
- `pos_config` may be used by future frontend features (Settings page showing api_key)
- Removing it is a separate cleanup task
- CR-001 scope is strictly: "add the push, don't break anything else"

---

## 9. Risks

| # | Risk | Impact | Mitigation |
|---|------|--------|-----------|
| 1 | **MyGenie POS endpoint requires auth header we don't know about** | Push returns 401/403 on every login | Include `Authorization: Bearer {mygenie_token}` preemptively; log response for debugging |
| 2 | **Multi-restaurant employee** — only `restaurants[0]` is used (line 301) | Token pushed for wrong/first restaurant only | Out of scope for CR-001; document as known limitation. Fix in separate multi-restaurant CR |
| 3 | **api_key exposed in `pos_config`** in login HTTP response | Browser can see the POS auth key | Out of scope for CR-001; `pos_config` removal is a separate task |
| 4 | **Legacy users missing `api_key`** | Push would send empty string as `crm_token` | CR-001 includes backfill: generate `api_key` → save to Mongo → then push |
| 5 | **POS endpoint is down during login** | Push fails | Fire-and-forget; login succeeds; failure recorded in Mongo; next login retries |
| 6 | **Push adds ~0-10s latency to login** | User waits longer for dashboard | 10s httpx timeout caps the worst case. Accept this tradeoff for guaranteed POS sync |
| 7 | **Idempotency** — pushing same key repeatedly | POS may reject with 409 | 409 treated as success |
| 8 | **`restaurant_id` is None** (no restaurants in profile) | Push called with `None` | Guard clause at top of helper: skip if `restaurant_id` is falsy |

---

## 10. QA Plan

### Pre-requisite
- Use the 30-April branch codebase
- Backend connected to external MongoDB (`mygenie` DB)
- `MYGENIE_API_URL` defaults to `https://preprod.mygenie.online`

### Test Cases

| # | Test | Method | Expected Result |
|---|------|--------|-----------------|
| 1 | **Bad credentials** | `POST /api/auth/login` with wrong password | 401 Unauthorized — no push attempted, no user created |
| 2 | **First-time login (new user)** | Login with valid MyGenie credentials; no CRM user exists | User created with `api_key`, `crm_token_registered_with_pos`, `crm_token_registered_at` all set. POS receives `crm_token` |
| 3 | **Returning login (user has api_key)** | Login again with same credentials | Same `api_key` reused, pushed again. `crm_token_registered_at` updated. POS receives same key |
| 4 | **Legacy user (no api_key)** | Manually remove `api_key` from user doc in Mongo, then login | New `api_key` generated, saved, pushed. `crm_token_registered_with_pos` set |
| 5 | **POS returns 200** | Normal flow | `crm_token_registered_with_pos: true`, `pos_crm_token_response.status_code: 200` |
| 6 | **POS returns 409** | Push same key twice (or POS already has token) | `crm_token_registered_with_pos: true`, `pos_crm_token_response.status_code: 409` |
| 7 | **POS returns 500** | Simulate POS failure (or wrong endpoint) | `crm_token_registered_with_pos: false`, login still succeeds, CRM JWT returned |
| 8 | **POS timeout** | Set endpoint to unreachable host | `crm_token_registered_with_pos: false`, login completes within timeout, CRM JWT returned |
| 9 | **CRM JWT is NOT used as crm_token** | Inspect `pos_crm_token_response.body` or POS logs | Payload `crm_token` starts with `dp_live_`, NOT a JWT (`eyJ...`) |
| 10 | **Demo login unchanged** | Click Demo Login | No POS calls at all. No `crm_token_registered_*` fields |
| 11 | **pos_config still in response** | Check login response body | `pos_config.api_key` still present (unchanged) |
| 12 | **Existing 30-April features intact** | Hit scan, POS, dual-auth endpoints | All work as before — no regressions |

### Verification Mongo query after test:
```js
db.users.find(
  { email: "test@example.com" },
  { api_key: 1, crm_token_registered_with_pos: 1, crm_token_registered_at: 1, pos_crm_token_response: 1 }
)
```

---

## 11. Final Recommendation

**Implement now.** Rationale:

1. **It's 5–10 lines of real logic** plus a ~40 line helper function. Minimal code change surface.
2. **It closes the #1 gap** identified in the login flow investigation — POS can't call CRM webhooks without this.
3. **It's fire-and-forget** — zero risk to existing login flow. If POS is down, login still works.
4. **It's idempotent** — safe to push on every login. No "only first time" fragility.
5. **It covers legacy users** — backfills missing `api_key` automatically.
6. **It adds observability** — `crm_token_registered_with_pos` field enables ops queries.
7. **All existing 30-April features are preserved** — no removals, no schema changes, no frontend changes.

### Files modified: 1
- `/app/backend/routers/auth.py` — add helper function + two insertion points

### Files NOT modified:
- `/app/backend/core/auth.py` — no changes
- `/app/backend/models/schemas.py` — no changes
- `/app/frontend/` — no changes
- `/app/backend/.env` — no changes (uses defaults + optional env override)

---

## Status

```
implementation_plan_ready_for_owner_approval
```
