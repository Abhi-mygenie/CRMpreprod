# CR-008 — MyGenie Token Session Management (Option C)

**CR:** CR-008 MyGenie Token Session Management
**Sprint:** ROI Measurement Sprint
**Date:** 2026-05-27
**Status:** `cr008_planning_complete_ready_for_implementation`

---

## 1. Problem Statement

The `mygenie_token` (used for CRM → MyGenie API calls: menu, customer sync, migration) is stored in the DB on login and never refreshed. MyGenie's token expires after a few hours, but CRM's JWT lasts 24 hours. Result: user is "logged in" but menu/sync calls fail with 401 until they manually log out and re-login. Page refresh does NOT fix it.

---

## 2. Solution: Option C — Frontend Session Token

Return `mygenie_token` to frontend on login. Frontend stores it in `sessionStorage` and sends it as `X-MyGenie-Token` header. Backend reads header first, falls back to DB.

---

## 3. Exact Code Changes

### File 1: `/app/backend/models/schemas.py` (line 197-202)

**Current:**
```python
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    pos_config: Optional[dict] = None
    is_demo: bool = False
```

**Change to:**
```python
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
    pos_config: Optional[dict] = None
    is_demo: bool = False
    mygenie_token: Optional[str] = None
```

---

### File 2: `/app/backend/routers/auth.py` — Two return statements in `mygenie_login()`

**Change 1 — Existing user login (line 398-411):**

**Current:**
```python
                token = create_token(existing_user["id"])
                return TokenResponse(
                    access_token=token,
                    user=UserResponse(
                        id=existing_user["id"],
                        email=existing_user.get("email", email),
                        restaurant_name=existing_user.get("restaurant_name", restaurant_name),
                        phone=existing_user.get("phone", phone),
                        pos_id=existing_user.get("pos_id", ""),
                        pos_name=existing_user.get("pos_name", ""),
                        created_at=existing_user["created_at"]
                    ),
                    pos_config=_build_pos_config(api_key),
                    is_demo=False
                )
```

**Change to:**
```python
                token = create_token(existing_user["id"])
                return TokenResponse(
                    access_token=token,
                    user=UserResponse(
                        id=existing_user["id"],
                        email=existing_user.get("email", email),
                        restaurant_name=existing_user.get("restaurant_name", restaurant_name),
                        phone=existing_user.get("phone", phone),
                        pos_id=existing_user.get("pos_id", ""),
                        pos_name=existing_user.get("pos_name", ""),
                        created_at=existing_user["created_at"]
                    ),
                    pos_config=_build_pos_config(api_key),
                    is_demo=False,
                    mygenie_token=mygenie_token
                )
```

**Change 2 — New user login (line 448-462):**

**Current:**
```python
            token = create_token(user_id)
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=user_id,
                    email=email,
                    restaurant_name=restaurant_name,
                    phone=phone,
                    pos_id=pos_id,
                    pos_name=pos_name,
                    created_at=now
                ),
                pos_config=_build_pos_config(api_key),
                is_demo=False
            )
```

**Change to:**
```python
            token = create_token(user_id)
            return TokenResponse(
                access_token=token,
                user=UserResponse(
                    id=user_id,
                    email=email,
                    restaurant_name=restaurant_name,
                    phone=phone,
                    pos_id=pos_id,
                    pos_name=pos_name,
                    created_at=now
                ),
                pos_config=_build_pos_config(api_key),
                is_demo=False,
                mygenie_token=mygenie_token
            )
```

---

### File 3: `/app/backend/routers/menu.py` (lines 19-29, 66)

**Current `_get_mygenie_token` (lines 19-24):**
```python
async def _get_mygenie_token(user: dict) -> str:
    user_record = await db.users.find_one({"id": user["id"]}, {"mygenie_token": 1})
    token = (user_record or {}).get("mygenie_token")
    if not token:
        raise HTTPException(status_code=401, detail="MyGenie token not found. Please re-login.")
    return token
```

**Change to:**
```python
async def _get_mygenie_token(user: dict, request: Request = None) -> str:
    # CR-008: Try session header first (freshest), fall back to DB
    if request:
        header_token = request.headers.get("X-MyGenie-Token")
        if header_token:
            return header_token
    user_record = await db.users.find_one({"id": user["id"]}, {"mygenie_token": 1})
    token = (user_record or {}).get("mygenie_token")
    if not token:
        raise HTTPException(status_code=401, detail="MyGenie token not found. Please re-login.")
    return token
```

Add `Request` import at top:
```python
from fastapi import APIRouter, Depends, HTTPException, Request
```

**Update `get_menu_items` (line 28-29):**

**Current:**
```python
async def get_menu_items(user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user)
```

**Change to:**
```python
async def get_menu_items(request: Request, user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user, request)
```

**Update `get_menu_categories` (line 65-66):**

**Current:**
```python
async def get_menu_categories(user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user)
```

**Change to:**
```python
async def get_menu_categories(request: Request, user: dict = Depends(get_current_user)):
    token = await _get_mygenie_token(user, request)
```

---

### File 4: `/app/backend/routers/customers.py` — 3 locations

**Location 1 — `sync_customers_from_mygenie` (lines 462-464):**

**Current:**
```python
    user_record = await db.users.find_one({"id": user_id})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
```

**Change to:**
```python
    mygenie_token = request.headers.get("X-MyGenie-Token")
    if not mygenie_token:
        user_record = await db.users.find_one({"id": user_id})
        mygenie_token = user_record.get("mygenie_token") if user_record else None
```

Add `request: Request` to function signature. Add `Request` to fastapi imports.

**Location 2 — `create_customer` (lines 520-521):**

**Current:**
```python
    user_record = await db.users.find_one({"id": user["id"]})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
```

**Change to:**
```python
    mygenie_token = request.headers.get("X-MyGenie-Token")
    if not mygenie_token:
        user_record = await db.users.find_one({"id": user["id"]})
        mygenie_token = user_record.get("mygenie_token") if user_record else None
```

Add `request: Request` to function signature.

**Location 3 — `update_customer` (lines 1043-1044):**

**Current:**
```python
    user_record = await db.users.find_one({"id": user["id"]})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
```

**Change to:**
```python
    mygenie_token = request.headers.get("X-MyGenie-Token")
    if not mygenie_token:
        user_record = await db.users.find_one({"id": user["id"]})
        mygenie_token = user_record.get("mygenie_token") if user_record else None
```

Add `request: Request` to function signature.

---

### File 5: `/app/backend/routers/migration.py` (lines 817-819)

**Current:**
```python
    user_record = await db.users.find_one({"id": user_id})
    mygenie_token = user_record.get("mygenie_token") if user_record else None
```

**Change to:**
```python
    mygenie_token = request.headers.get("X-MyGenie-Token")
    if not mygenie_token:
        user_record = await db.users.find_one({"id": user_id})
        mygenie_token = user_record.get("mygenie_token") if user_record else None
```

Add `request: Request` to function signature. Add `Request` to fastapi imports.

---

### File 6: `/app/frontend/src/contexts/AuthContext.jsx`

**Change 1 — `login` function (line 53-61):**

**Current:**
```javascript
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

**Change to:**
```javascript
    const login = async (email, password) => {
        const res = await axios.post(`${API}/auth/login`, { email, password });
        localStorage.setItem("token", res.data.access_token);
        localStorage.setItem("is_demo", res.data.is_demo || false);
        if (res.data.mygenie_token) {
            sessionStorage.setItem("mygenie_token", res.data.mygenie_token);
        }
        setToken(res.data.access_token);
        setUser(res.data.user);
        setIsDemoMode(res.data.is_demo || false);
        return res.data;
    };
```

**Change 2 — `createApiClient` function (line 19-26):**

**Current:**
```javascript
export const createApiClient = (token) => {
    const client = axios.create({
        baseURL: API,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        timeout: 300000
    });
    return client;
};
```

**Change to:**
```javascript
export const createApiClient = (token) => {
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const mygenieToken = sessionStorage.getItem("mygenie_token");
    if (mygenieToken) headers["X-MyGenie-Token"] = mygenieToken;
    const client = axios.create({
        baseURL: API,
        headers,
        timeout: 300000
    });
    return client;
};
```

**Change 3 — `logout` function (line 81-87):**

**Current:**
```javascript
    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("is_demo");
        setToken(null);
        setUser(null);
        setIsDemoMode(false);
    };
```

**Change to:**
```javascript
    const logout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("is_demo");
        sessionStorage.removeItem("mygenie_token");
        setToken(null);
        setUser(null);
        setIsDemoMode(false);
    };
```

---

## 4. Summary of All Changes

| # | File | Lines | What |
|---|---|---|---|
| 1 | `/app/backend/models/schemas.py` | 197-202 | Add `mygenie_token: Optional[str] = None` to `TokenResponse` |
| 2 | `/app/backend/routers/auth.py` | 398-411, 448-462 | Add `mygenie_token=mygenie_token` to both login return statements |
| 3 | `/app/backend/routers/menu.py` | 5, 19-24, 28, 65 | Add `Request` import; read `X-MyGenie-Token` header first in `_get_mygenie_token`; pass `request` to helper |
| 4 | `/app/backend/routers/customers.py` | imports, 462-464, 520-521, 1043-1044 | Add `Request` import; read header first at 3 locations; add `request: Request` to 3 function signatures |
| 5 | `/app/backend/routers/migration.py` | imports, 817-819 | Add `Request` import; read header first; add `request: Request` to function signature |
| 6 | `/app/frontend/src/contexts/AuthContext.jsx` | 19-26, 53-61, 81-87 | Store `mygenie_token` in `sessionStorage` on login; attach as header in api client; clear on logout |

**Total: 6 files, ~30 lines changed**

---

## 5. Backward Compatibility

- If `X-MyGenie-Token` header missing → falls back to DB lookup (same as today)
- DB still stores `mygenie_token` on login (unchanged)
- POS webhook calls use `X-API-Key` (unaffected)
- Demo login returns `mygenie_token: null` (no MyGenie API for demo)

---

## 6. What This Fixes

| Scenario | Before | After |
|---|---|---|
| User logged in, MyGenie token expired, menu fetch | 401 error, menu broken | `sessionStorage` has token from login, works until tab close |
| Page refresh | Token still stale in DB | `sessionStorage` survives refresh, still works |
| Tab close + reopen | Same stale DB token | `sessionStorage` cleared → DB fallback → may be stale → "re-login" message. But user likely re-logins anyway since CRM JWT may also be expiring |

---

## 7. What This Does NOT Fix

- Long-lived single tab (days open) → `sessionStorage` token also expires on MyGenie side
- Full fix for that would need auto-refresh with stored credentials (separate CR)
