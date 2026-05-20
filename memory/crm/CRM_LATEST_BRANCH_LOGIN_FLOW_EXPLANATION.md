# CRM Latest Branch Login Flow Explanation

> **Branch:** `30-April` (commit `7c1d280`)
> **Date:** 2026-05-20
> **Scope:** Read-only investigation — no code changes made

---

## 1. Executive Summary

| Question | Answer |
|----------|--------|
| Does CRM call POS during login? | **YES** — CRM calls MyGenie POS login + profile on every login (real login, not demo). |
| Does CRM create/update local user? | **YES** — creates on first login, updates `password_hash`, `mygenie_token`, `last_login` on subsequent logins. |
| Does CRM generate `api_key`? | **YES** — generates `dp_live_xxx` key on first-time login only. Reuses on subsequent logins. |
| Does CRM send CRM token/api_key to POS? | **NO** — `POST /api/v1/auth/restaurant-crm-token` is documented in `CR_001_PUSH_CRM_TOKEN.md` as **PLANNED (Not Implemented)**. The code does NOT call it. |
| Does frontend receive CRM JWT? | **YES** — `access_token` in response, stored in `localStorage("token")`. |
| Does frontend receive or use `pos_config`? | **NO** — backend returns `pos_config` in `TokenResponse`, but frontend ignores it entirely. Zero references to `pos_config` in frontend code. |

---

## 2. Frontend Login Flow

### Login UI
- **File:** `/app/frontend/src/pages/LoginPage.jsx`
- User enters `email` + `password`, clicks "Sign In" (line 167–233)
- On submit → calls `login(email, password)` from AuthContext (line 56)

### Auth Context
- **File:** `/app/frontend/src/contexts/AuthContext.jsx`
- `login()` function (line 53–61):
  ```js
  const login = async (email, password) => {
      const res = await axios.post(`${API}/auth/login`, { email, password });
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("is_demo", res.data.is_demo || false);
      setToken(res.data.access_token);
      setUser(res.data.user);
      setIsDemoMode(res.data.is_demo || false);
      return res.data;
  };
  ```

### API Caller
- `axios.post` directly — no separate API service file
- Base URL: `process.env.REACT_APP_BACKEND_URL + "/api"`

### Endpoint Called
- `POST /api/auth/login`

### Payload Sent
```json
{ "email": "user@example.com", "password": "secret" }
```

### Frontend Storage After Success
| localStorage Key | Value | Source |
|------------------|-------|--------|
| `token` | CRM JWT string | `res.data.access_token` |
| `is_demo` | `false` (string) | `res.data.is_demo` |
| `remembered_email` | email (if "Remember me" checked) | User input |
| `remembered_password` | password (if "Remember me" checked) | User input |

### Post-Login Navigation
- `navigate("/")` → Dashboard (line 58 in LoginPage)
- `AuthProvider` hydrates user via `GET /api/auth/me` on next render (line 41 in AuthContext)

---

## 3. Backend Login Entry Point

### Route
- **File:** `/app/backend/routers/auth.py`
- **Line 144–150:** `POST /api/auth/login`

```python
@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """Unified login endpoint - routes to MyGenie authentication"""
    return await mygenie_login(credentials)
```

### Actual Handler
- **Line 236–429:** `mygenie_login()` — the real logic

### Request Schema
- `UserLogin` (from `/app/backend/models/schemas.py`, line 81–83):
  ```python
  class UserLogin(BaseModel):
      email: str
      password: str
  ```

### Response Schema
- `TokenResponse` (line 95–100):
  ```python
  class TokenResponse(BaseModel):
      access_token: str
      token_type: str = "bearer"
      user: UserResponse
      pos_config: Optional[dict] = None
      is_demo: bool = False
  ```

- `UserResponse` (line 85–93):
  ```python
  class UserResponse(BaseModel):
      id: str
      email: str
      restaurant_name: str
      phone: str
      pos_id: str = ""
      pos_name: str = ""
      created_at: str
  ```

---

## 4. MyGenie POS Calls During Login

| Step | Endpoint | Method | Payload/Header | Purpose |
|------|----------|--------|----------------|---------|
| 1 | `{MYGENIE_API_URL}/api/v1/auth/vendoremployee/login` | POST | `{"email": "...", "password": "..."}` + `Content-Type: application/json` | Authenticate user against MyGenie, get `mygenie_token` |
| 2 | `{MYGENIE_API_URL}/api/v1/vendoremployee/profile` | GET | `Authorization: Bearer {mygenie_token}` + `Content-Type: application/json` | Fetch employee profile with restaurant details |

- **`MYGENIE_API_URL`** defaults to `https://preprod.mygenie.online` (env `MYGENIE_API_URL`, line 249)
- **`MYGENIE_LOGIN_ENDPOINT`** defaults to `/api/v1/auth/vendoremployee/login` (env `MYGENIE_LOGIN_ENDPOINT`, line 250)
- **`MYGENIE_PROFILE_ENDPOINT`** defaults to `/api/v1/vendoremployee/profile` (env `MYGENIE_PROFILE_ENDPOINT`, line 251)
- **None of these env vars are set in `/app/backend/.env`** — all use defaults

---

## 5. POS Profile Extraction

Fields extracted from MyGenie profile response (lines 294–308):

| Profile Field | Local Variable | Where Used |
|---------------|---------------|------------|
| `emp_email` | `email` (fallback: `credentials.email`) | `users.email` |
| `emp_f_name` | `first_name` | `users.first_name` (first-time only) |
| `emp_l_name` | `last_name` | `users.last_name` (first-time only) |
| `restaurants[0].name` | `restaurant_name` | `users.restaurant_name` |
| `restaurants[0].phone` | `phone` | `users.phone` |
| `restaurants[0].id` | `restaurant_id` (cast to str) | `users.restaurant_id`, part of `user_id` |

### Hardcoded Values (line 308–309)
```python
pos_id = "0001"       # Hardcoded — not from profile
pos_name = "MyGenie"  # Hardcoded — not from profile
```

### Composite user_id (line 310)
```python
user_id = f"pos_{pos_id}_restaurant_{restaurant_id}"
# Example: "pos_0001_restaurant_478"
```

---

## 6. First-Time User Flow

When `existing_user` is None (no user found by `pos_id + restaurant_id` OR by `email`):

1. **Generate `api_key`** — `generate_api_key()` → format `dp_live_xxxx` (line 344)
2. **Build user document** with all POS profile fields + `api_key` + `mygenie_token` + hashed password (lines 346–362)
3. **Insert user** into `db.users` (line 363)
4. **Create default `loyalty_settings`** document (lines 366–401)
5. **Create default WhatsApp templates and automation rules** via `create_default_whatsapp_templates(user_id)` (line 404)
6. **Generate CRM JWT** via `create_token(user_id)` (line 406)
7. **Return `TokenResponse`** with:
   - `access_token`: CRM JWT
   - `user`: `UserResponse` with id, email, restaurant_name, phone, pos_id, pos_name
   - `pos_config`: `{ api_key, api_base_url, webhook_endpoints }` (line 418)
   - `is_demo`: `false`

### What is NOT done on first-time login:
- **No push of `crm_token`/`api_key` to MyGenie** — this is documented as planned but **not implemented** (see CR-001)

---

## 7. Existing User Flow

When `existing_user` is found (by `pos_id + restaurant_id` first, then fallback to email):

1. **Update existing user** (lines 319–326):
   - `password_hash` → re-hashed from current credentials
   - `mygenie_token` → fresh token from POS login
   - `last_login` → current UTC timestamp
2. **Generate CRM JWT** via `create_token(existing_user["id"])` (line 327)
3. **Return `TokenResponse`** with:
   - `access_token`: CRM JWT
   - `user`: `UserResponse` from existing user data
   - `pos_config`: built from `existing_user.get("api_key", "")` (line 339)
   - `is_demo`: `false`

### What is NOT updated on existing login:
- `api_key` — reused from original creation, never regenerated during login
- `email`, `restaurant_name`, `phone` — NOT updated from POS profile (existing values preserved)
- No push to MyGenie POS

---

## 8. CRM api_key / crm_token Handling

| Aspect | Details |
|--------|---------|
| **Where generated** | `generate_api_key()` in `/app/backend/core/auth.py` line 44–46 |
| **Format** | `dp_live_{secrets.token_urlsafe(32)}` |
| **When generated** | First-time login only (inside `if not existing_user` block, line 344) |
| **Where stored** | `users.api_key` field in MongoDB |
| **Reused on subsequent login?** | YES — `existing_user.get("api_key", "")` passed to `_build_pos_config` (line 339) |
| **Backfilled if missing?** | NO — if an old user has no `api_key`, it returns `""` in `pos_config` |
| **Sent to POS?** | NO — CR-001 documents this as PLANNED but NOT IMPLEMENTED |
| **Exposed in login response?** | YES — inside `pos_config.api_key` field, but frontend ignores it |
| **Used by POS for webhooks?** | YES — POS systems use it as `X-API-Key` header to call `/api/pos/*` endpoints |
| **CRM JWT used as crm_token?** | NO — CRM JWT is separate; `api_key` is intended as `crm_token` per CR-001 |

---

## 9. restaurant-crm-token Endpoint Check

| Question | Answer |
|----------|--------|
| **Endpoint present in code?** | NO — not implemented in any backend file |
| **Called during login?** | NO |
| **First login only or every login?** | N/A |
| **Request payload** | N/A (per CR-001 plan: `{ restaurant_id, crm_token }`) |
| **Auth header** | N/A (per CR-001: none — public endpoint) |
| **Success handling** | N/A |
| **Failure handling** | N/A (per CR-001 plan: fire-and-forget with `try/except pass`) |

### Evidence
- `grep -rn "restaurant-crm-token\|crm_token" /app/backend/` returns zero matches
- `CR_001_PUSH_CRM_TOKEN.md` status is **PLANNED (Not Implemented)**
- The `mygenie_login()` function (lines 236–429) has no call to any push endpoint

---

## 10. pos_config Login Handshake Check

### Does login response include `pos_config`?
**YES** — on both first-time and existing-user paths.

### What `pos_config` contains (built by `_build_pos_config()`, lines 35–42):
```python
{
    "api_key": "dp_live_xxxx",          # The CRM API key for POS auth
    "api_base_url": "{base_url}/api/pos", # CRM's POS endpoint base
    "webhook_endpoints": {               # Map of all 15 webhook endpoints
        "orders": "/pos/orders",
        "customer_lookup": "/pos/customer-lookup",
        "events": "/pos/events",
        "max_redeemable": "/pos/max-redeemable",
        "customers_create": "/pos/customers",
        "customers_search": "/pos/customers?search=",
        "customers_detail": "/pos/customers/{customer_id}",
        "addresses": "/pos/customers/{customer_id}/addresses",
        "address_lookup": "/pos/address-lookup",
        "coupon_validate": "/pos/coupons/validate",
        "coupon_apply": "/pos/coupons/apply",
        "loyalty": "/pos/customers/{customer_id}/loyalty",
        "order_history": "/pos/customers/{customer_id}/orders",
        "notes_items": "/pos/customers/{customer_id}/notes/items",
        "notes_orders": "/pos/customers/{customer_id}/notes/orders"
    }
}
```

### `api_base_url` Construction (line 37):
```python
base_url = os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("CRM_EXTERNAL_URL", "")
```
- **Neither `REACT_APP_BACKEND_URL` nor `CRM_EXTERNAL_URL` is in backend `.env`** → `base_url` = `""` → `api_base_url` = `/api/pos` (relative, not a full URL)

### Frontend usage of `pos_config`:
- **NONE** — `grep -rn "pos_config\|posConfig" /app/frontend/src/` returns zero matches
- `AuthContext.login()` stores only `access_token`, `is_demo`, and `user` from the response
- `pos_config` is returned but completely discarded by the frontend

### How this differs from restaurant-crm-token push:
- `pos_config` is a **passive handshake** — backend includes the data in the response, but it's the POS/frontend's job to read it
- `restaurant-crm-token` push would be an **active handshake** — CRM proactively sends the key to MyGenie
- Currently, **only the passive handshake exists**, and even that is unused by the frontend

---

## 11. Frontend Post-login State

### localStorage keys after successful login:
| Key | Value | Set By |
|-----|-------|--------|
| `token` | CRM JWT string | `AuthContext.login()` line 55 |
| `is_demo` | `"false"` | `AuthContext.login()` line 56 |
| `remembered_email` | email string | `LoginPage` line 50 (if "Remember me" checked) |
| `remembered_password` | password string (PLAINTEXT) | `LoginPage` line 51 (if "Remember me" checked) |

### Auth state (React context):
| State | Value |
|-------|-------|
| `user` | `UserResponse` object from `res.data.user` |
| `token` | CRM JWT string |
| `isDemoMode` | `false` |

### Dashboard navigation:
- `navigate("/")` → `DashboardPage` (protected route)
- `ProtectedRoute` checks for `token` in context; redirects to `/login` if absent

### `/api/auth/me` hydration:
- **YES** — `AuthContext` calls `api.get("/auth/me")` on mount when `token` exists (line 41)
- This re-fetches the full `UserResponse` and sets `user` state
- If `/api/auth/me` fails → token is removed from localStorage and state

---

## 12. Demo Login Flow

### Separate from real login?
**YES** — completely separate path.

### Frontend trigger:
- "Demo Login" button in `LoginPage.jsx` (lines 246–258)
- Calls `POST /api/auth/demo-login` directly via `axios.post`
- Sets `localStorage("is_demo", "true")`

### Backend handler:
- `POST /api/auth/demo-login` (lines 207–234 in `auth.py`)
- Looks up user by `email = "demo@restaurant.com"` in local DB
- **Does NOT call MyGenie POS** — purely local lookup
- Returns `TokenResponse` with `is_demo=True`, no `pos_config`
- Requires demo user to exist in DB (seeded separately)

### Key difference from real login:
| Aspect | Real Login | Demo Login |
|--------|-----------|------------|
| Calls MyGenie POS | YES (login + profile) | NO |
| Creates user | YES (first-time) | NO (must pre-exist) |
| Returns `pos_config` | YES | NO (not in response) |
| `is_demo` flag | `false` | `true` |
| Password check | Via MyGenie API | None (no password needed) |

---

## 13. Risk / Gap Analysis

### 1. `restaurant-crm-token` NOT IMPLEMENTED (P0 gap)
- **CR-001** documents this as P0 planned change
- MyGenie POS cannot automatically know the CRM `api_key` without manual copy or reading the login response
- This means POS-to-CRM webhook integration (orders, events) requires **manual key setup**

### 2. `pos_config` returned but unused by frontend
- Backend builds and returns `pos_config` containing the `api_key` and webhook URLs
- Frontend completely ignores it — no storage, no display, no forwarding
- If the intent was for MyGenie POS to read it from the login response, there's no mechanism for that (POS doesn't see frontend responses)

### 3. `api_key` exposed in login response
- `pos_config.api_key` (the POS authentication key) is included in the login HTTP response
- While HTTPS encrypts in transit, this is a sensitive credential in the response body
- If frontend ever logs or captures responses, this key could leak

### 4. `api_key` NOT backfilled for old users
- If a user was created without `api_key` (e.g., via old `/register` endpoint), subsequent logins via `mygenie_login` will return `pos_config.api_key = ""`
- No backfill logic exists in the existing-user path (lines 319–326)

### 5. `api_base_url` is relative (broken for POS)
- `_build_pos_config()` reads `REACT_APP_BACKEND_URL` or `CRM_EXTERNAL_URL` from env
- Neither is set in backend `.env` → `api_base_url = "/api/pos"` (relative)
- A POS system receiving this can't construct full URLs without knowing the CRM domain

### 6. First restaurant only (multi-restaurant employee)
- `restaurants[0]` is hardcoded (line 301) — only the first restaurant in the profile is used
- An employee managing multiple restaurants will always get the first one
- No restaurant selection UI exists

### 7. `pos_id` hardcoded to "0001"
- `pos_id = "0001"` is hardcoded (line 308), not derived from profile
- Comments say "will be dynamic later" — currently static

### 8. Remember Me stores plaintext password
- `LoginPage.jsx` lines 50–51 store the password in `localStorage` as plaintext
- This is a security risk — anyone with browser access can read the password

### 9. User identity matching is fragile
- First check: `pos_id + restaurant_id` (line 313)
- Fallback: email match from pre-query (line 314)
- If a user registered via `/register` (no pos_id/restaurant_id) and later logs in via MyGenie, they'll match by email — but the `id` will remain the old one (not `pos_0001_restaurant_xxx`)

### 10. `password_hash` re-hashed on every login
- Even for existing users, `password_hash` is updated on every login (line 321)
- This is redundant but harmless — ensures local hash matches current MyGenie password

---

## 14. Plain English Flow

Here is what happens step-by-step when a restaurant owner logs into CRM:

1. **Owner opens CRM** and enters their email and password on the login page.

2. **CRM sends credentials to MyGenie POS** (the main restaurant management system) to verify the identity.

3. **MyGenie checks the password** and returns a temporary access token if correct.

4. **CRM uses that token to ask MyGenie for the owner's profile** — their name, email, restaurant name, restaurant ID, and phone number.

5. **CRM checks its own database** to see if this restaurant owner already has a CRM account.

6. **If this is a FIRST-TIME login:**
   - CRM creates a new user account in its database
   - Generates a unique API key (like a password for POS systems to talk to CRM)
   - Sets up default loyalty program settings (earn rates, tiers, etc.)
   - Creates default WhatsApp message templates

7. **If the owner has logged in before:**
   - CRM updates the MyGenie access token (keeps it fresh)
   - Updates the password hash
   - Records the login time

8. **CRM generates its own login token** (separate from MyGenie's) and sends it back to the browser.

9. **The browser stores this token** and redirects the owner to the Dashboard.

10. **CRM does NOT send anything back to MyGenie** about the API key — this is a known gap. The restaurant owner would need to manually copy the API key from CRM Settings to their POS system.

---

## 15. Final Verdict

```
latest_login_flow_confirmed_with_gaps
```

### Gaps:
1. **`restaurant-crm-token` push NOT implemented** — documented as P0 in CR-001 but missing from code
2. **`pos_config` returned but unused** by frontend — dead data in the response
3. **`api_base_url` is relative** — broken for any POS trying to use it
4. **No `api_key` backfill** for users created before the api_key feature
5. **No multi-restaurant support** — hardcoded to `restaurants[0]`
6. **Plaintext password in localStorage** — security risk from "Remember me" feature
