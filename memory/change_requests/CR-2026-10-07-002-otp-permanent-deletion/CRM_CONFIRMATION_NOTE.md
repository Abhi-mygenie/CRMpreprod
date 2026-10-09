# CRM Confirmation Note — CR-084 Closure

**To:** CRM team
**Re:** CR-084 closure — OTP-DEFERRED code permanently deleted from Customer App
**Date:** 2026-10-08

All OTP-DEFERRED code has been permanently deleted from the MyGenie Customer App codebase.

## Frontend (React)

- `crmSendOtp`, `crmVerifyOtp`, `crmForgotPassword`, `crmResetPassword` deleted from `crmService.js`
- All OTP handler, state, and UI comment blocks deleted from `PasswordSetup.jsx`
- `sendOTP` helper and its context export deleted from `AuthContext.jsx`
- Admin OTP toggle section deleted from `AdminVisibilityPage.jsx` and `VisibilityTab.jsx`

## Backend (FastAPI / server.py)

- `OTPRequest` model deleted
- `otp_store`, `generate_otp`, `verify_otp` helpers deleted
- `POST /api/auth/send-otp` route deleted
- `POST /api/auth/reset-password` route deleted
- OTP branch inside `unified_login` deleted
- `otpRequired*` model fields and config defaults deleted

## Verification

```
grep -rn "OTP-DEFERRED" frontend/src backend/server.py → 0 results ✅
grep -rn "crmSendOtp|crmVerifyOtp|crmForgotPassword|crmResetPassword" frontend/src → 0 results ✅
grep -n "otp_store|generate_otp|verify_otp" backend/server.py → 0 results ✅
```

Build: clean. Backend: running.

CR-2026-09-14-001 "restore when live" condition permanently voided.
**Our side of CR-084: CLOSED.**
