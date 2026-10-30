# CR-015c — Remove Demo Login — IMPLEMENTATION CLOSEOUT

**Status code**: `cr015c_removed_2026_05_29`
**Implemented**: 2026-05-29 (owner-mandated: "there should not be any demo login")
**Discovery**: `../discovery/CR_015C_REMOVE_DEMO_LOGIN_DISCOVERY.md`

---

## Context
`POST /api/auth/demo-login` was already broken (returned 404 because `demo@restaurant.com`
did not exist in the remote DB). Owner directed full removal. Investigation confirmed it was
code-only — no demo user, no persisted `is_demo` field in the database.

## What was removed
**Backend**
- `routers/auth.py`: `POST /demo-login` endpoint, `DEMO_EMAIL`/`DEMO_PASSWORD` constants, both
  `is_demo=False` kwargs in `mygenie_login`.
- `models/schemas.py`: `is_demo` field removed from `TokenResponse`.

**Frontend**
- `pages/LoginPage.jsx`: "Demo Login" button + the "or" divider.
- `contexts/AuthContext.jsx`: `demoLogin()`, `isDemoMode` state, all `is_demo` localStorage handling
  + context exports.
- Deleted `components/shared/DemoModeBanner.jsx`.
- `components/ResponsiveLayout.jsx` + `components/MobileLayout.jsx`: removed import + render.
- `pages/CustomersPage.jsx`: removed `isDemoMode`; "Sync MyGenie" button now shows whenever 0 customers.

**Tests**
- `tests/test_segments_crm.py`: replaced demo-login with a `get_auth_token()` helper using real
  login (`TEST_LOGIN_EMAIL`/`TEST_LOGIN_PASSWORD` env, defaults in `test_credentials.md`).
  `TestDemoLogin` → `TestLogin`.

**Database**: no action (no demo user, no `is_demo` field).

## Verification
- frontend lint clean (AuthContext, LoginPage); webpack compiles; backend ruff clean (auth.py, tests).
- `grep` across frontend/src + backend routers/models for demo symbols → **zero**.
- `POST /api/auth/demo-login` → **404**. Real login (owner@kunafamahal.com) → returns `access_token`.
- `pytest tests/test_segments_crm.py` → **11 passed** (now via real login).
- Visual: login page has no Demo Login button; Customers page has no Demo Mode banner.

**End of CR-015c closeout.**
