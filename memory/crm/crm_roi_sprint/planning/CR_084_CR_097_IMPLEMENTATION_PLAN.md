# CR-084 + CR-097 — Implementation Plan (Wave 1 — Security cleanup)
## Delete customer OTP flow · Delete staff password management · Retire WA `reset_password` event

**Date**: 2026-10-08
**Role**: Planning Agent (Implementation Plan stage). **No code in this session.**
**Risk**: HIGH (auth-adjacent, 7 routes removed; security-positive). Full gate flow + regression checklist.
**Effort**: ~1.5 h (impl ~50 min · self-test ~15 min · QA ~25 min)
**Impact Analysis**: `planning/CR_084_CR_097_IMPACT_ANALYSIS.md` (gate CLOSED 2026-10-08)
**Gate**: ⏸ **OWNER APPROVAL REQUIRED to start implementation** (approval matrix: "starting implementation after planning", "changing auth logic", "changing API contracts").
**Companion note**: every removal below is mirrored in `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` (DRAFT rows → CONFIRMED at implementation exit gate).

---

## 0. Pre-flight (Implementation Agent runs before Edit 1)

```bash
cd /app/backend
# Anchors still where the plan says
grep -n "^import random" routers/scan.py routers/auth.py          # scan.py:10, auth.py:6
grep -n "class OTPRequest\|class OTPVerify\|class SkipOTPRequest" routers/scan.py   # 52, 57, 298
grep -n '@router.post("/auth/request-otp")\|@router.post("/auth/verify-otp")\|@router.post("/auth/skip-otp")' routers/scan.py  # 186, 230, 303
grep -n '@router.post("/register")\|@router.put("/reset-password")\|forgot-password' routers/auth.py   # 117, 328, 573/659/708
grep -n '"reset_password"' models/schemas.py routers/whatsapp.py   # schemas:1255, whatsapp:108
cd /app/frontend
grep -n "RegisterPage" src/App.js                                  # 8, 46
grep -n "setUserAndToken\|const register" src/contexts/AuthContext.jsx   # 69, 86, 100
grep -n "showResetPassword\|handleResetPassword" src/pages/DashboardPage.jsx | head -3   # 37, 44
grep -n '"reset_password"' src/components/shared/WhatsAppAutomationContent.jsx   # 370, 411
# Baseline: POS login works BEFORE touching anything
API=$(grep REACT_APP_BACKEND_URL .env | cut -d= -f2)
curl -s -X POST "$API/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"owner@thegoankitchen.com","password":"Qplazm@10"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print('BASELINE LOGIN', 'PASS' if d.get('access_token') else 'FAIL')"
```
If any anchor is off by more than a few lines → stop, re-verify against the Impact Analysis, do not improvise.
**Planning-time baseline (2026-10-08, Impact Analysis §2.4)**: all 7 target routes LIVE (422/400/403), `skip-otp` LIVE, login 200, `reset_password` present in WA events. Implementation Agent re-runs the same set pre- and post-edit; the post-edit expectation is 404 for the 7 routes and unchanged for the rest.

---

## 1. Files WILL change (11) / WILL NOT touch

| # | File | Edit |
|---|---|---|
| E1 | `backend/routers/scan.py` | delete OTP models + 2 routes + `import random` |
| E2 | `backend/routers/auth.py` | delete 5 routes + OTP helpers + unused imports |
| E3 | `backend/models/schemas.py` | drop `"reset_password"` from `CRM_EVENTS` |
| E4 | `backend/routers/whatsapp.py` | drop `reset_password` description |
| E5 | `frontend/src/pages/LoginPage.jsx` | delete forgot-password state/handlers/modal/commented button |
| E6 | `frontend/src/pages/DashboardPage.jsx` | delete Reset Password menu item + modal + handler + state |
| E7 | `frontend/src/pages/RegisterPage.jsx` | **delete file** |
| E8 | `frontend/src/App.js` | remove import + `/register` route |
| E9 | `frontend/src/contexts/AuthContext.jsx` | remove `register`, `setUserAndToken` |
| E10 | `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | drop `reset_password` label + description |
| E11 | `frontend/src/constants/testIds/auth.js` | drop `forgotPasswordLink`, `registerLink`, `REGISTER` |

**WILL NOT touch**: `auth.py` `mygenie_login` block (L360-568 incl. `password_hash` cache writes), `/me`, `/logout`, `core/auth.py`, `scan.py` L298 onward (`skip-otp`, customer `/auth/register`, customer password login, profile, orders, loyalty), `core/whatsapp.py`, `pages/CustomerRegistrationPage.jsx`, `server.py`, `.env`, `requirements.txt`, `package.json`, MongoDB collections.

---

## 2. Backend edits

### E1 — `backend/routers/scan.py`
**E1.1** L10: delete `import random`. Keep `timedelta` (used L192/203 → both deleted; verify no other use with `grep -n timedelta routers/scan.py`; if zero hits remain, trim it from L8 import).
**E1.2** L52-60: delete `class OTPRequest` and `class OTPVerify` (both models). Leave `# Request Schemas` header; next class after deletion is whatever follows L61.
**E1.3** L186-295: delete from `@router.post("/auth/request-otp")` through the closing `})` of `verify_otp` (line before `class SkipOTPRequest`). Keep the `# C1 - Customer Authentication` section header.
**E1.4** Add one marker comment where the routes were:
```python
# CR-084: customer OTP routes (request-otp / verify-otp) removed 2026-10. Login = skip-otp (CR-089) → lookup (CR-093).
```
**Self-test**: `python3 -c "import routers.scan"` · `grep -c "customer_otps\|OTPRequest\|OTPVerify\|random\." routers/scan.py` → 0.

### E2 — `backend/routers/auth.py`
**E2.1** L108-114: delete `OTP_EXPIRY_MINUTES` + `generate_otp()`.
**E2.2** L117-152: delete `POST /register` (`register`). Add marker:
```python
# CR-097: local /register removed 2026-10 — users are provisioned only via POS login (mygenie_login).
```
**E2.3** L328-358: delete `PUT /reset-password`. Add marker at same spot:
```python
# CR-097: /reset-password removed 2026-10 — password is owned by MyGenie POS; CRM never validates it locally.
```
**E2.4** L572-780: delete from `# Forgot Password OTP Endpoints` through end of `reset_password_with_token` (end of file). Add marker:
```python
# CR-097: forgot-password OTP routes removed 2026-10 (otp returned in response body — CR-029 root cause).
```
**E2.5** Imports — after E2.1-E2.4 these become unused, remove each **only after confirming 0 hits**:
- L6 `import random`, L7 `import string`
- L3 `import asyncio` (only used by `asyncio.create_task` in forgot-password)
- L4 `import uuid` (only `register` + forgot-password used it)
- L2 `timedelta` (only forgot-password used it) → `from datetime import datetime, timezone`
- L10 `verify_password` (only `/reset-password` used it) → keep `hash_password` (mygenie_login L446/509 still caches)
- L12 `UserCreate` (only `/register` used it) → `from models.schemas import UserLogin, UserResponse, TokenResponse`
- Keep `default_loyalty_settings` (mygenie_login L532), `generate_api_key`, `create_token`, `get_current_user`, `register_crm_token_with_pos`.
**Self-test**: `python3 -c "import routers.auth"` · `pyflakes routers/auth.py` (or `python3 -m py_compile`) · `grep -c "otp_tokens\|generate_otp\|verify_password\|UserCreate" routers/auth.py` → 0.

### E3 — `backend/models/schemas.py` L1255
Delete the line `"reset_password",          # OTP for forgot password`. Add trailing comment on `CRM_EVENTS = [` line: `# CR-097: reset_password removed`.
**Self-test**: `python3 -c "from models.schemas import CRM_EVENTS; assert 'reset_password' not in CRM_EVENTS; print(len(CRM_EVENTS))"` → prints 15.

### E4 — `backend/routers/whatsapp.py` L108
Delete `"reset_password": "Send OTP for forgot password verification",`.
**Self-test**: `GET /api/whatsapp/automation/events` (with staff JWT) → `crm_events` and `crm_descriptions` have no `reset_password`; `GET /api/whatsapp/message-filters` → no `reset_password` in event list.

**Backend gate**: `sudo supervisorctl restart backend` → `tail -n 30 /var/log/supervisor/backend.err.log` clean → V1/V2/V5 curl PASS (see §5).

---

## 3. Frontend edits

### E5 — `frontend/src/pages/LoginPage.jsx`
- L4: `import { Eye, EyeOff, X, ArrowLeft }` → `import { Eye, EyeOff }` (X/ArrowLeft only used in modal).
- L9 `import axios` + L11 `const API_URL` → delete (only forgot-password used them).
- L19: `const { login, setUserAndToken } = useAuth();` → `const { login } = useAuth();`
- L22-32: delete the entire "Forgot Password State" block (11 `useState`s).
- L66-154: delete `handleRequestOtp`, `handleVerifyOtp`, `handleResetPassword`, `closeForgotPassword`.
- L216-226: delete the CR-029 comment and the commented-out button. The `flex items-center justify-between` div (L205) then contains only the Remember-me label → change to `className="flex items-center"`.
- L241-388: delete the whole `{showForgotPassword && (...)}` modal.
- Add marker above `return (`: `{/* CR-097: forgot-password flow removed — password owned by MyGenie POS */}` (as a JS comment `// CR-097 ...`).

### E6 — `frontend/src/pages/DashboardPage.jsx`
- L37-41: delete 5 state vars (`showResetPassword`, `currentPassword`, `newPassword`, `confirmPassword`, `resetLoading`).
- L44-72: delete `handleResetPassword`.
- L250-257: delete the Reset Password `<button>` (menu item). Logout button stays.
- L273-326: delete `{/* Reset Password Modal */}` block.
- L4 lucide import: remove `KeyRound`; remove `X` **only if** `grep -c "<X " DashboardPage.jsx` → 0 after edit; keep `Button` if used elsewhere (`grep -c "<Button" `).
- Marker near menu: `{/* CR-097: Reset Password menu item removed — password owned by MyGenie POS */}`.

### E7 — delete `frontend/src/pages/RegisterPage.jsx`
`git rm frontend/src/pages/RegisterPage.jsx` (or `rm`). No other importer (verified: only `App.js:8`).

### E8 — `frontend/src/App.js`
- L8: delete `import RegisterPage from "@/pages/RegisterPage";`
- L46: delete `<Route path="/register" element={<RegisterPage />} />`. **Keep** L47 `/register-customer/:restaurantId`.
- Marker on L45 comment: `{/* Public Routes — CR-097: /register removed, staff accounts come from POS */}`.

### E9 — `frontend/src/contexts/AuthContext.jsx`
- L69-75: delete `register`.
- L85-90: delete `setUserAndToken` + its comment.
- L100: provider value → `{{ user, token, api, login, logout, loading, refreshUser }}`.
- Self-test: `grep -rn "register(\|setUserAndToken" src/` → only `CustomerRegistrationPage`/`register-customer` hits that are unrelated (they call `/scan` or `/customers` APIs, not `useAuth().register`). Confirm 0 `useAuth` destructures of `register`/`setUserAndToken`.

### E10 — `frontend/src/components/shared/WhatsAppAutomationContent.jsx`
- L370: delete `"reset_password": "Reset Password (OTP)",`
- L411: delete `"reset_password": "Send OTP for forgot password verification",`
- Marker on `crmEventLabels` line: `// CR-097: reset_password removed`.

### E11 — `frontend/src/constants/testIds/auth.js`
- Remove `forgotPasswordLink`, `registerLink` from `LOGIN`; remove whole `REGISTER` export. Update header comment to "(login, logout)". 0 importers today, so no ripple.

**Frontend gate**: hot reload compiles with 0 warnings about unused imports (`tail -n 40 /var/log/supervisor/frontend.err.log`) → screenshot `/login` + `/` dashboard menu open (1920×800 and 390×844).

---

## 4. Edit order (do backend first so UI never points at a live route it shouldn't)

E3 → E4 → E2 → E1 → restart backend → V1-V6 curl → E9 → E8 → E7 → E5 → E6 → E10 → E11 → compile check → V7-V9 screenshot → V10 grep sweep → V11.

---

## 5. Verification matrix (Implementation self-test → QA agent re-runs all)

| # | Check | Expected | Who |
|---|---|---|---|
| V1 | `POST /api/auth/login` owner creds | 200, `access_token` + `mygenie_token` | impl + QA |
| V2 | `GET /api/auth/me` with JWT | 200, `email` matches | impl + QA |
| V3 | `POST /api/scan/auth/request-otp` · `POST /api/scan/auth/verify-otp` | 404 | impl + QA |
| V4 | `POST /api/auth/forgot-password/request-otp` · `/verify-otp` · `/reset` · `PUT /api/auth/reset-password` (with JWT) · `POST /api/auth/register` | 404 / 405 | impl + QA |
| V5 | `POST /api/scan/auth/skip-otp` `{"phone":"9999900001","restaurant_id":"689"}` | 200, `data.token` present | impl + QA |
| V6 | `GET /api/whatsapp/automation/events` (`crm_events` + `crm_descriptions`) + `GET /api/whatsapp/message-filters` | no `reset_password` (pre-change: present, 16 crm_events → expect 15) | impl + QA |
| V7 | Dashboard profile menu (desktop + mobile) | only Logout; Logout works | screenshot + QA |
| V8 | Navigate to `/register` | redirects to `/` (fallback route), no crash | QA |
| V9 | `/login` renders; WhatsApp Automation page CRM-events list has no "Reset Password (OTP)" | PASS | screenshot + QA |
| V10 | `grep -rn "request-otp\|verify-otp\|forgot-password\|reset-password\|otp_tokens\|customer_otps\|RegisterPage\|setUserAndToken\|generate_otp\|OTPRequest\|OTPVerify" backend frontend/src` | 0 hits (only `skip-otp` and `CustomerRegistrationPage` remain, both unrelated) | impl |
| V11 | `supervisorctl status` backend+frontend RUNNING; backend/frontend err logs clean | PASS | impl |
| V12 | Regression: `/customers`, `/coupons`, `/whatsapp-automation`, `/profile` load with JWT; `POST /api/pos/customer-lookup` with POS key still 200 | PASS | QA |

Acceptance = V1-V12 all PASS. Any FAIL → Bug Fix role, not improvisation.

---

## 6. Rollback
Pure deletions; `git revert <commit>` restores everything. No data migration, no env change.

---

## 7. Exit-gate deliverables (Implementation Agent)
1. Registry (`CR_STATUS_DASHBOARD.md` rows 084/097 → 🟢 IMPLEMENTED, transitions row)
2. Code markers `CR-084` / `CR-097` present at every deletion site (grep-able)
3. QA handover `qa/CR_084_CR_097_QA_HANDOVER.md` with V1-V12 + creds pointer
4. **Amend** `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md`: flip Wave-1 rows DRAFT → CONFIRMED, fill the actual deploy date and verified 404 evidence
5. Session handover

---

## 8. Owner decisions carried from Impact Analysis
| # | Decision | Owner ruling |
|---|---|---|
| D-1 | Close CR-090 as OBSOLETE | ✅ Owner: "CR-090 → close as obsolete" (2026-10-08). Closure note: `planning/CR_090_CLOSURE_OBSOLETE.md` |
| D-2 | Change notice to Customer App / POS agents | ✅ Owner: running note per wave, consolidated into new contract after all waves → `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` |
| D-3 | Drop `customer_otps` / `otp_tokens` | Deferred (not in this CR) |
| D-4 | **Open implementation gate** | ⏸ **PENDING** |

```text
OWNER APPROVAL REQUIRED
Reason: start implementation after planning; auth-adjacent logic; 7 API routes removed (contract change)
Risk: HIGH
Proposed next step: Implementation Agent executes E1-E11 in §4 order, then self-test V1-V12
I will not proceed until owner approves.
```
