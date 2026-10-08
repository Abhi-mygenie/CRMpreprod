# QA Handover — CR-098 Retire customer password routes
**Date**: 2026-10-08 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_098_IMPLEMENTATION_PLAN.md` · **IA**: `planning/CR_098_IMPACT_ANALYSIS.md` · **Risk**: HIGH (auth route removal, security-positive)
**Creds**: `/app/memory/test_credentials.md` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`

## What changed (1 file, deletions only)
`backend/routers/scan.py`: removed `class CustomerRegister`, `class CustomerLogin`, `POST /scan/auth/register`, `POST /scan/auth/login`; trimmed `hash_password`, `verify_password` from the `core.auth` import. Two `# CR-098:` markers where the routes were. `skip-otp`, `/auth/me`, `/profile*` untouched.

## Implementation self-test — 9/9 PASS (2026-10-08, preview)
| # | Check | Result |
|---|---|---|
| P1 | `py_compile` + `pyflakes` | clean ✅ |
| P2 | backend restart, err log | RUNNING, no traceback ✅ |
| P3 | `POST /api/scan/auth/register` · `/login` `{}` | 404, 404 ✅ (pre-change 422) |
| P4 | `POST /api/scan/auth/skip-otp` `{}` | 422 (alive) ✅ |
| P5 | `skip-otp` `{"phone":"1234567890","restaurant_id":"test_restaurant"}` (a password-holder) | 200 + token ✅ — no lock-out |
| P6 | `GET /api/scan/auth/me` with that token | 200, name "Security Researcher", no `password_hash` ✅ |
| P7 | staff `POST /api/auth/login` owner creds | 200 ✅ (`core/auth.py` untouched) |
| P8 | grep `CustomerRegister\|CustomerLogin\|hash_password\|verify_password\|/auth/register\|/auth/login` in `scan.py` | 0 hits ✅ |
| P9 | `GET /api/scan/profile` (customer token) 200 · `GET /api/customers?limit=1` (staff JWT) 200 ✅ |

## QA asks — re-run independently
1. P3–P9 with fresh calls.
2. `GET /api/scan/auth/me` **without** token → 401/403 (auth guard intact).
3. Second password-holder: `skip-otp` `{"phone":"8888888888","restaurant_id":"test_restaurant"}` → 200.
4. Regression: `POST /api/scan/auth/skip-otp` `{"phone":"9876543210","restaurant_id":"689"}` → 200 (known r689 path).
5. Confirm `customers` count unchanged by P3 calls (404s create nothing).
6. Backend err log clean after your run.

## Out of scope / known
- 2 test docs keep a dead `password_hash` field (owner D-2: hygiene CR later).
- CR-093 `lookup` not yet built — `POST /api/scan/auth/lookup` 404 is expected.
