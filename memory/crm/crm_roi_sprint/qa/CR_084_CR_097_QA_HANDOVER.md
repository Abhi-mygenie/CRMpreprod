# QA Handover — CR-084 + CR-097 (Wave 1 — Security cleanup)
**Date**: 2026-10-08 · **From**: Implementation Agent · **To**: QA Agent
**Plan**: `planning/CR_084_CR_097_IMPLEMENTATION_PLAN.md` · **Impact**: `planning/CR_084_CR_097_IMPACT_ANALYSIS.md`
**Risk**: HIGH (auth-adjacent, 7 routes removed) · **Creds**: `/app/memory/test_credentials.md` · **URL**: `REACT_APP_BACKEND_URL` in `/app/frontend/.env`

## What changed (11 files, deletions only)
| File | Change | Marker |
|---|---|---|
| `backend/routers/scan.py` | `OTPRequest`/`OTPVerify` models, `POST /scan/auth/request-otp`, `POST /scan/auth/verify-otp`, `import random`, `timedelta` removed | `CR-084` L~172 |
| `backend/routers/auth.py` | `POST /register`, `PUT /reset-password`, 3× `/forgot-password/*`, `generate_otp`, `OTP_EXPIRY_MINUTES`, unused imports (`asyncio`, `uuid`, `random`, `string`, `timedelta`, `verify_password`, `UserCreate`) removed | `CR-097` ×3 |
| `backend/models/schemas.py` | `reset_password` removed from `CRM_EVENTS` (16 → 15) | `CR-097` |
| `backend/routers/whatsapp.py` | `reset_password` description removed | `CR-097` |
| `frontend/src/pages/LoginPage.jsx` | forgot-password state/handlers/modal/commented button, `axios`, `API_URL`, `X`, `ArrowLeft`, `setUserAndToken` removed; remember-me row now `flex items-center` | `CR-097` |
| `frontend/src/pages/DashboardPage.jsx` | Reset Password menu item + modal + handler + 5 state vars; `KeyRound`, `X`, `Button` imports removed | `CR-097` |
| `frontend/src/pages/RegisterPage.jsx` | **deleted** | — |
| `frontend/src/App.js` | `RegisterPage` import + `/register` route removed | `CR-097` |
| `frontend/src/contexts/AuthContext.jsx` | `register`, `setUserAndToken` removed from context | `CR-097` |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | `reset_password` label + description removed | `CR-097` |
| `frontend/src/constants/testIds/auth.js` | `forgotPasswordLink`, `registerLink`, `REGISTER` removed | `CR-097` |

## Implementation self-test — 12/12 PASS (2026-10-08, preview)
| # | Check | Result |
|---|---|---|
| V1 | `POST /api/auth/login` owner creds | 200 + token ✅ |
| V2 | `GET /api/auth/me` | 200 `owner@thegoankitchen.com` ✅ |
| V3 | `POST /scan/auth/request-otp`, `/verify-otp` | 404, 404 ✅ (pre-change 422) |
| V4 | `POST /auth/forgot-password/{request-otp,verify-otp,reset}`, `PUT /auth/reset-password`, `POST /auth/register` | 404 ×5 ✅ (pre-change 400/400/400/403/422) |
| V5 | `POST /scan/auth/skip-otp` `{}` | 422 (route alive) ✅ |
| V6 | `GET /whatsapp/automation/events` | `crm_events` 15, no `reset_password` in list or descriptions ✅ · `message-filters` clean ✅ |
| V7 | Dashboard profile dropdown (`data-testid="profile-dropdown"`) desktop 1920 + mobile 390 | only Logout (`logout-btn` = 1, `reset-password-btn` = 0) ✅ — note: dismiss migration overlay ("Skip for Now") first |
| V8 | `/register` | redirects to `/` ✅ |
| V9 | `/login` renders, no "Forgot password" ✅ · WA Automation → CRM Events tab shows 15, no "Reset Password (OTP)" ✅ |
| V10 | grep sweep for removed symbols | 0 hits outside CR markers (`KeyRound` in TemplatesPage/WA page is unrelated usage) ✅ |
| V11 | `supervisorctl status` backend/frontend RUNNING; backend err log clean; frontend compiles (only pre-existing `exhaustive-deps` warnings) ✅ |
| V12 | `/api/customers`, `/api/coupons`, `/api/auth/me` 200 · `POST /api/pos/customer-lookup` with X-API-Key 200 ✅ |

## QA asks (independent re-run)
1. Re-run V1–V12 with fresh session (the QA agent must not reuse my curl outputs).
2. Add: `POST /api/scan/auth/skip-otp` with a **real** body `{"phone":"9876543210","restaurant_id":"689"}` → 200 + `data.token` (creates/uses one test customer — acceptable).
3. Add: `GET /api/whatsapp/message-filters` with JWT → event list has no `reset_password`.
4. Add: Logout from dashboard dropdown → lands on `/login`.
5. Add: pages `/customers`, `/coupons`, `/whatsapp-automation`, `/profile` render without console errors.
6. Negative: `/register` deep link while logged **out** → should go `/` → `ProtectedRoute` → `/login` (no blank page).

## Known / out of scope
- `customer_otps` (5 docs) and `otp_tokens` (0) collections left in place (D-3 deferred).
- Pre-existing eslint `react-hooks/exhaustive-deps` warnings in DashboardPage/AuthContext/WA page are **not** from this CR.
- Migration overlay on first dashboard load is pre-existing behaviour.
