# CR-015c — Remove Demo Login (full mapping + removal plan)

**Sprint**: ROI Measurement / CRM
**Type**: Cleanup CR (remove demo-login feature entirely)
**Requested**: 2026-05-29 — owner: *"there should not be any demo login. Investigate where all demo login is mapped including DB and come back with analysis."*
**Lifecycle stage**: `removal_DONE` (owner-approved full removal, 2026-05-29)
**Access used**: read-only static analysis + DB read → removal executed

---

## ✅ REMOVAL COMPLETED — 2026-05-29

Owner approved **full removal**. Executed:

**Backend:**
- `routers/auth.py`: deleted `POST /demo-login` endpoint, `DEMO_EMAIL`/`DEMO_PASSWORD`
  constants, and both `is_demo=False` kwargs in `mygenie_login`.
- `models/schemas.py`: removed `is_demo` field from `TokenResponse`.

**Frontend:**
- `pages/LoginPage.jsx`: removed the "Demo Login" button + the "or" divider above it.
- `contexts/AuthContext.jsx`: removed `demoLogin()`, `isDemoMode` state, and all `is_demo`
  localStorage handling + context exports.
- Deleted `components/shared/DemoModeBanner.jsx`.
- `components/ResponsiveLayout.jsx` + `components/MobileLayout.jsx`: removed import + render.
- `pages/CustomersPage.jsx`: removed `isDemoMode`; "Sync MyGenie" now shows whenever 0 customers.

**Tests:**
- `tests/test_segments_crm.py`: replaced demo-login with real login via a `get_auth_token()`
  helper (creds from env or defaults in `test_credentials.md`). `TestDemoLogin` → `TestLogin`.

**Database:** no action (no demo user, no persisted `is_demo`).

**Verification (2026-05-29):**
- frontend lint clean (AuthContext, LoginPage) · webpack compiles · backend ruff clean (auth.py, tests).
- `grep` for `demo-login/demoLogin/isDemoMode/is_demo/DemoModeBanner/DEMO_EMAIL/DEMO_PASSWORD`
  across frontend/src + backend routers/models → **zero**.
- `POST /api/auth/demo-login` → **404** (route gone). Real login → returns `access_token`.
- Visual: login page has **no Demo Login button**; Customers page has **no Demo Mode banner**;
  WhatsApp Automation + Customers pages render with no JS errors.
- `pytest tests/test_segments_crm.py` → **11 passed** (now via real login). Core suite 75 passed.

---

## 1. Why "Demo Login" is currently broken (404)

`POST /api/auth/demo-login` looks up a user with email `demo@restaurant.com` in
`db.users`. **That user does not exist in the remote MongoDB** → the endpoint raises
`404 "Demo user not found. Please run setup first."` So the Demo Login button has been
non-functional on this database the whole time.

DB verification (2026-05-29):
- `demo@restaurant.com` user → **None**
- users with `is_demo: true` → **0**
- user docs containing an `is_demo` field → **0**  → `is_demo` is a transient response flag, never persisted.

**Conclusion: nothing to clean in the database.** Removal is code-only.

---

## 2. Complete demo-login map

### Backend — `routers/auth.py`
| Item | Lines | Notes |
|---|---|---|
| `DEMO_EMAIL = "demo@restaurant.com"` | 133 | only used by demo-login |
| `DEMO_PASSWORD = "demo123"` | 134 | **never referenced anywhere** (demo_login does not verify a password) |
| `POST /demo-login` endpoint | 245–272 | the ONLY place `is_demo=True` is set |
| `is_demo=False` in `mygenie_login` returns | 394, 443 | real-login responses |

### Backend — `models/schemas.py`
| Item | Line | Notes |
|---|---|---|
| `TokenResponse.is_demo: bool = False` | 202 | transient response field, defaults False |

### Backend — tests `tests/test_segments_crm.py`
Authenticates via `POST /api/auth/demo-login` in 5 places (L18, 36, 102, 170, 208).
**These will skip/fail after removal** → must switch to real login.

### Frontend
| File | Lines | What |
|---|---|---|
| `contexts/AuthContext.jsx` | 38, 61, 68, 72–80, 92, 97, 103, 106, 110 | `demoLogin()` fn, `isDemoMode` state, localStorage `is_demo`, context exports |
| `pages/LoginPage.jsx` | 244–264 | the **"Demo Login"** button → calls `/api/auth/demo-login` |
| `components/shared/DemoModeBanner.jsx` | whole file | purple "Demo Mode" banner, shown when `isDemoMode` |
| `components/ResponsiveLayout.jsx` | 9 (import), 78 (render) | renders `<DemoModeBanner/>` |
| `components/MobileLayout.jsx` | 3 (import), 19 (render) | renders `<DemoModeBanner/>` |
| `pages/CustomersPage.jsx` | 63, 571–572 | uses `isDemoMode` to hide "Sync MyGenie" button when in demo mode |

### Database
Nothing — no demo user, no persisted `is_demo` field.

---

## 3. Removal plan

### Backend
- Delete `POST /demo-login` endpoint (auth.py 245–272).
- Delete `DEMO_EMAIL` / `DEMO_PASSWORD` constants (132–134).
- Remove `is_demo` from `TokenResponse` (schemas.py 202) and drop the two `is_demo=False`
  kwargs in `mygenie_login` (394, 443). *(Optional: could keep the field harmlessly; recommend removing for cleanliness.)*

### Frontend
- `LoginPage.jsx`: remove the Demo Login button block (and the "or" divider above it).
- `AuthContext.jsx`: remove `demoLogin`, `isDemoMode` state, all `is_demo` localStorage
  handling, and the two context exports.
- Delete `components/shared/DemoModeBanner.jsx`.
- `ResponsiveLayout.jsx` + `MobileLayout.jsx`: remove the import + `<DemoModeBanner/>` render.
- `CustomersPage.jsx`: remove `isDemoMode` from `useAuth()` and the `!isDemoMode` condition
  (sync button then shows whenever `customers.length === 0`, which is the desired behavior).

### Tests
- `tests/test_segments_crm.py`: replace demo-login auth with real login
  (`owner@kunafamahal.com` / `Qplazm@10`) so those tests run.

### Database
- No action.

---

## 4. Impact / risk

| Area | Impact | Risk |
|---|---|---|
| "Sync MyGenie" button (CustomersPage) | Shows whenever there are 0 customers (previously hidden in demo) | Low — desired |
| `is_demo` removal from schema | Frontend stops reading it; harmless | Low |
| `test_segments_crm.py` | Must switch to real login or it skips | Low |
| Live users | None — demo login was already 404/broken | None |

---

## 5. Acceptance criteria (post-removal)

| # | Check | Method |
|---|---|---|
| 1 | No "Demo Login" button on login page | screenshot |
| 2 | `grep -ri demo` frontend/src → no demo-login / DemoMode references | grep |
| 3 | `POST /api/auth/demo-login` → 404/Not Found (route gone) | curl |
| 4 | Real login still works; app loads; CustomersPage renders | login + screenshot |
| 5 | Backend + frontend compile/lint clean | lint |
| 6 | `test_segments_crm.py` authenticates via real login | pytest |

---

**End of CR-015c discovery. Awaiting owner approval to remove demo login.**
