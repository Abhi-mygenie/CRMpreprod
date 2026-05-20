# CR-001 Restaurant CRM Token Push — Implementation Report

> **Branch:** `30-April`
> **Date:** 2026-05-20
> **Status:** IMPLEMENTED — backend deployed and verified

---

## 1. What Was Implemented

A single helper function `_register_crm_token_with_pos()` was added to `/app/backend/routers/auth.py` and called at two points inside `mygenie_login()`:

1. **Existing-user login path** (line 424–428) — after password/token update, before returning JWT
2. **New-user login path** (line 468–472) — after `insert_one`, before creating loyalty settings

Additionally, **api_key backfill** was added for legacy users (lines 415–422): if an existing user has no `api_key`, one is generated and saved before the push.

---

## 2. File Changed

**Only one file:** `/app/backend/routers/auth.py`

| Change | Lines | Description |
|--------|-------|-------------|
| Helper function | 44–128 | `_register_crm_token_with_pos()` — fire-and-forget push with Mongo status tracking |
| Existing-user path | 415–428 | Backfill `api_key` if missing + call push helper |
| Existing-user pos_config | 442 | Now uses resolved `api_key` variable instead of `existing_user.get("api_key", "")` |
| New-user path | 468–472 | Call push helper after `insert_one` |

**Files NOT changed:** `core/auth.py`, `models/schemas.py`, all frontend files, `.env`, all other routers

---

## 3. Helper Function Behavior

```
_register_crm_token_with_pos(client, mygenie_api_url, restaurant_id, api_key, mygenie_token, user_id)
```

| Behavior | Detail |
|----------|--------|
| **Endpoint** | `POST {MYGENIE_API_URL}/api/v1/auth/restaurant-crm-token` (configurable via `MYGENIE_CRM_TOKEN_ENDPOINT` env) |
| **Payload** | `{ "restaurant_id": "<str>", "crm_token": "<users.api_key>" }` |
| **Auth header** | `Authorization: Bearer {mygenie_token}` (included when available) |
| **Success** | 2xx or 409 → `crm_token_registered_with_pos: true` |
| **Failure** | Any other status → `crm_token_registered_with_pos: false`, login continues |
| **Exception** | Timeout/network/any → caught, logged, status persisted, login continues |
| **Guard** | Skips if `restaurant_id` or `api_key` is falsy |

---

## 4. Mongo Fields Persisted

On `users` collection document after each login:

| Field | Type | Purpose |
|-------|------|---------|
| `crm_token_registered_with_pos` | `bool` | Whether last push succeeded |
| `crm_token_registered_at` | `str` (ISO) | Timestamp of last push attempt |
| `pos_crm_token_response` | `dict` | `{status_code, body, timestamp}` on success/fail or `{error, timestamp}` on exception |

---

## 5. Cases Covered

| Case | Behavior |
|------|----------|
| First-time user | `api_key` generated → user inserted → push to POS → loyalty/templates seeded |
| Returning user with `api_key` | Existing `api_key` reused → push to POS (idempotent) |
| Legacy user without `api_key` | New `api_key` generated → saved to Mongo → push to POS |
| POS returns 2xx | `crm_token_registered_with_pos: true` |
| POS returns 409 | `crm_token_registered_with_pos: true` (treated as success) |
| POS returns 500/other | `crm_token_registered_with_pos: false`, login succeeds normally |
| POS timeout/unreachable | `crm_token_registered_with_pos: false`, login succeeds normally |
| Demo login | **Unchanged** — no POS calls |

---

## 6. Verification Results

| Test | Result |
|------|--------|
| Python lint (`ruff`) | All checks passed |
| Python import (`import routers.auth`) | OK |
| Backend restart | Clean startup, scheduler running |
| `GET /api/health` | `{"status":"healthy","timestamp":"2026-05-20T09:37:21..."}` |
| `POST /api/auth/login` with bad credentials | `401 {"detail":"Invalid credentials"}` — push NOT attempted |
| Backend error logs | Clean — only the expected 401 from MyGenie for the bad-credentials test |

---

## 7. What Was NOT Changed

- No frontend files modified
- No `pos_config` removed — still returned in login response
- No `.env` files modified
- No database cleanup scripts touched
- No other routers modified
- All 30-April branch features preserved: scan.py, expanded pos.py, dual auth, customer JWT, pos_config response, existing docs

---

## 8. Status

```
cr_001_implemented_and_deployed
```

Next step: Test with real MyGenie credentials to verify end-to-end push succeeds and `crm_token_registered_with_pos: true` appears in the user doc.
