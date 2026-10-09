# IMPACT ANALYSIS — CR-2026-10-07-002
## Permanently delete OTP-DEFERRED dead code (31 markers, 6 files)

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Based on:** INTAKE_DOC.md · grep of all 31 markers confirmed this session · exact line numbers verified  
**Owner decisions:** D1 = Option A (delete admin auth sub-tab entirely)

---

## 1. Why now

CR-2026-09-14-001 quarantined the OTP code with the label "OTP-DEFERRED: Restore when live."  
CRM has since confirmed (wave log 2026-10-07, CR-084 + CR-090 CLOSED):  
- `POST /scan/auth/request-otp` → 404  
- `POST /scan/auth/verify-otp` → 404  
- CRM will never build OTP delivery or password reset  

The "restore when live" condition can never be met. Every block behind these markers is permanently dead.

---

## 2. Confirmed marker locations — all 31

### 2a. `crmService.js` — 8 markers (4 exported functions, each throws)

| Lines | What | Action |
|---|---|---|
| 291–301 | `crmSendOtp` — exported function, throws `OTP-DEFERRED` error | **Delete entire function** |
| 312–319 | `crmVerifyOtp` — exported function, throws `OTP-DEFERRED` error | **Delete entire function** |
| 380–383 | `crmForgotPassword` — exported function, throws `OTP-DEFERRED` error | **Delete entire function** |
| 394–397 | `crmResetPassword` — exported function, throws `OTP-DEFERRED` error | **Delete entire function** |

Each function body is a single `throw new Error(...)` with the original implementation preserved as a comment block. Delete the function definition, the preceding JSDoc, and the OTP-DEFERRED comment line entirely.

**Consumer check:** `PasswordSetup.jsx` line 5 imports these 4 functions — that import line is also an OTP-DEFERRED comment (already dead). Delete both together.

---

### 2b. `PasswordSetup.jsx` — 11 markers

| Lines | What | Action |
|---|---|---|
| 5 | Import of 4 dead functions: `crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp` (commented out) | **Delete import comment line** |
| 33–44 | Commented state: `forgotMode`, `otp`, `otpSent`, `sendingOtp`, `devOtp`, `otpDigits`, `otpLoginSent`, `otpLoginSending`, `otpLoginDevOtp`, `resendTimer`, `resendIntervalRef` | **Delete all commented state lines** |
| 46 | Comment: `authMethod simplified — 'choose'/'otp' removed` + `useState('password')` note | **Delete comment line** (keep the live `const [authMethod, setAuthMethod] = useState('password')`) |
| 85 | Comment: `resend timer disabled` (useEffect comment) | **Delete comment line** |
| 103–105 | Commented `handleLoginVerifyOtp` handler | **Delete** |
| 166–171 | Commented `handleSendOtp` + `forgotMode` render block | **Delete** |
| 241–242 | Commented `authMethod === 'choose'` render block | **Delete** |
| 306 | Commented `{/* "Use OTP instead" disabled */}` JSX comment | **Delete** |
| 318–319 | Commented `authMethod === 'otp'` OTP entry screen | **Delete** |
| 373 | Commented `{/* "Use OTP instead" disabled */}` JSX comment | **Delete** |

**Important:** `PasswordSetup.jsx` still exists and still works (handleSkip, password submit, navigation). Only the commented OTP blocks are removed. The file is NOT deleted — that is Step 2 of CR-2026-10-08-001.

---

### 2c. `AuthContext.jsx` — 2 markers

| Lines | What | Action |
|---|---|---|
| 213–214 | Commented `sendOTP` function body | **Delete** |
| 227–228 | Commented `sendOTP,` context export | **Delete** |

No live code changed. The `sendOTP` identifier is not referenced anywhere in live code (confirmed: only appears in these two comment lines in AuthContext).

---

### 2d. `AdminVisibilityPage.jsx` — 1 marker (D1: delete)

| Lines | What | Action |
|---|---|---|
| 102–120 | Entire commented `<div>` block: "Skip OTP / Password Setup" admin section with 6 `ToggleSwitch` components for `skipOtp*` flags | **Delete entire comment block** (D1 = Option A) |

Note: the `skipOtp*` toggle fields here are for the admin UI to control per-order OTP behaviour. Step 1 already removed the flag-reading gate from `LandingPage.jsx`. Step 2 will retire the DB fields. This CR removes the already-commented admin UI block.

---

### 2e. `VisibilityTab.jsx` — 1 marker (D1: delete)

| Lines | What | Action |
|---|---|---|
| 122–132 | Commented `{activeSubTab === 'auth' && ...}` block containing `otpRequired*` flag toggles | **Delete entire comment block** |

`otpRequired*` are legacy dead flags (predating `skipOtp*`). Never restored after CR-2026-05-30-001.

---

### 2f. `server.py` — 8 markers

| Lines | What | Action |
|---|---|---|
| 102 | OTP-DEFERRED comment block (above model section) | **Delete comment** |
| 115–116 | Commented `OTPRequest` model class | **Delete** |
| 249–254 | Commented `otpRequired*` fields in config model (5 lines) | **Delete** |
| 393–409 | Commented `otp_store`, `generate_otp`, `verify_otp` (17 lines) | **Delete** |
| 465–489 | Commented `POST /auth/send-otp` route (25 lines) | **Delete** |
| 521–524 | Commented OTP branch inside `unified_login` | **Delete** |
| 731–743 | Commented `POST /auth/reset-password` route (13 lines) | **Delete** |
| 1119–1122 | Commented `otpRequired*` config defaults (4 lines) | **Delete** |

**Risk note for server.py:** these are all commented-out blocks. The live `unified_login` route at line 525 is NOT touched — only the OTP branch comment within it (lines 521–524) is removed.

---

## 3. Files WILL change

| File | Markers | Risk |
|---|---|---|
| `frontend/src/api/services/crmService.js` | 8 | MEDIUM — deleting exported functions; confirm 0 live callers |
| `frontend/src/pages/PasswordSetup.jsx` | 11 | HIGH — hotspot-adjacent; live code in same file must not change |
| `frontend/src/context/AuthContext.jsx` | 2 | HIGH — hotspot; only comment lines touched |
| `frontend/src/pages/admin/AdminVisibilityPage.jsx` | 1 | LOW — commented block only |
| `frontend/src/components/AdminSettings/VisibilityTab.jsx` | 1 | LOW — commented block only |
| `backend/server.py` | 8 | CRITICAL (file) — all deletions are commented lines; live routes untouched |

---

## 4. Files WILL NOT touch

`LandingPage.jsx` · `ReviewOrder.jsx` · `CartContext.js` · `RestaurantConfigContext.jsx` · `App.js` · `OrderSuccess.jsx` · `MenuItems.jsx` · any `.css` file

---

## 5. Consumer check — crmService exports being deleted

Before deleting, Role 3 must verify:

```bash
grep -rn "crmSendOtp\|crmVerifyOtp\|crmForgotPassword\|crmResetPassword" frontend/src
```

Expected: only inside `PasswordSetup.jsx` line 5 comment + `crmService.js` itself. Zero live call sites.

If any live call site is found → **stop and escalate**. Do not delete.

---

## 6. sendOTP in AuthContext — consumer check

```bash
grep -rn "sendOTP" frontend/src
```

Expected: only AuthContext.jsx lines 213–214 and 227–228 (both comments). Zero live usage.

---

## 7. Risk summary

| Area | Rating | Reason |
|---|---|---|
| Logic risk | **LOW** | Every block is already commented out or throws |
| Process risk | **HIGH** | server.py and AuthContext.jsx are CRITICAL/HIGH hotspots; PasswordSetup.jsx is hotspot-adjacent |
| Build risk | LOW | Removing commented code cannot break ESLint or TypeScript |
| Regression risk | LOW | Nothing live is removed; `yarn build` + pytest smoke are the safety net |

No Fast Lane — hotspot files involved.

---

## 8. Exit condition (from intake)

Owner sends a confirmation note to CRM for CR-084: *"no residual OTP calls; OTP-DEFERRED code deleted from our codebase; evidence: grep returns 0."*

Agent drafts this note as a deliverable alongside the implementation.

---

## 9. Verification matrix

| T | Test | Expected |
|---|---|---|
| T1 | `grep -rn "OTP-DEFERRED" frontend/src backend/` | 0 results |
| T2 | `grep -rn "crmSendOtp\|crmVerifyOtp\|crmForgotPassword\|crmResetPassword" frontend/src` | 0 results |
| T3 | `grep -rn "otp_store\|generate_otp\|verify_otp\|send-otp\|reset-password" backend/server.py` | 0 results |
| T4 | `grep -rn "otpRequired" backend/server.py` | 0 results |
| T5 | `yarn build` | Clean |
| T6 | `pytest -m smoke backend/tests/smoke/ -v` | All pass |
| T7 | Landing page → sign in → menu (§5.1 regression) | Unaffected |
| T8 | Admin Visibility page renders | Unchanged — deleted sections were invisible |
| T9 | PasswordSetup.jsx handleSkip still works | Unaffected — only comment lines deleted |

---

## 10. CRM confirmation note (draft — Role 3 writes final)

```
To: CRM team
Re: CR-084 closure confirmation — OTP code deleted

All OTP-DEFERRED code has been permanently deleted from the Customer App codebase:
- crmSendOtp, crmVerifyOtp, crmForgotPassword, crmResetPassword removed from crmService.js
- OTP handlers and states removed from PasswordSetup.jsx
- sendOTP removed from AuthContext.jsx
- Backend /auth/send-otp, /auth/reset-password, otp_store, generate_otp, verify_otp deleted
- otpRequired* model fields and defaults deleted
- Admin OTP toggle UI blocks deleted

grep -rn "OTP-DEFERRED" returns 0 results.
CR-2026-09-14-001 exit condition met. CR-084 on our side: CLOSED.
```

---

```
Planning complete: CR-2026-10-07-002
Stage: Impact Analysis
Code reality: FULL — all 31 markers located with exact line numbers
Risk: LOW logic / HIGH process
Files WILL change: crmService.js · PasswordSetup.jsx · AuthContext.jsx · AdminVisibilityPage.jsx · VisibilityTab.jsx · server.py
Files WILL NOT touch: LandingPage.jsx · ReviewOrder.jsx · CartContext.js · RestaurantConfigContext.jsx · App.js
Owner decisions: D1 = Option A (delete admin auth sub-tab) ✅
Docs: memory/change_requests/CR-2026-10-07-002-otp-permanent-deletion/IMPACT_ANALYSIS.md
Next: "Gate 2 accepted for CR-2026-10-07-002" → Implementation Plan
```
