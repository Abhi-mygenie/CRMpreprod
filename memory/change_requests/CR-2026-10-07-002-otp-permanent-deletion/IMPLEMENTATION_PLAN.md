# IMPLEMENTATION PLAN — CR-2026-10-07-002
## Permanently delete OTP-DEFERRED dead code (31 markers, 6 files)

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Gate:** Gate 2 accepted (D1 = Option A)  
**Risk:** LOW logic / HIGH process  
**Files changing:** `crmService.js` · `PasswordSetup.jsx` · `AuthContext.jsx` · `AdminVisibilityPage.jsx` · `VisibilityTab.jsx` · `server.py`  
**Files NOT touched:** `LandingPage.jsx` · `ReviewOrder.jsx` · `CartContext.js` · `App.js` · `RestaurantConfigContext.jsx`

---

## Pre-flight checks (Role 3 must run BEFORE any edit)

```bash
# Confirm no live callers of the 4 dead crmService functions
grep -rn "crmSendOtp\|crmVerifyOtp\|crmForgotPassword\|crmResetPassword" frontend/src
# Expected: only PasswordSetup.jsx line 6 (commented import) + crmService.js itself

# Confirm sendOTP not used live in AuthContext
grep -rn "sendOTP" frontend/src
# Expected: only AuthContext.jsx lines 213-214, 227-228 (both comments)
```

If any live caller is found → **STOP, escalate.**

---

## Edits — grouped by file

---

### FILE 1: `crmService.js` — delete 4 dead exported functions (E1–E4)

#### E1 — Delete `crmSendOtp` (lines 283–302)

**Delete from:**
```javascript
/**
 * Send OTP to customer phone
 * Returns: { success, message, expires_in_minutes, debug_otp? }
 *
 * v1 path: POST /customer/send-otp  — body { phone, user_id, country_code }
 * v2 path: POST /scan/auth/request-otp — body { phone, restaurant_id }
 *          response normalized to v1 shape so PasswordSetup.jsx is unaffected.
 */
// OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production. Restore when live.
export const crmSendOtp = async (_phone, _userId, _countryCode = '91') => {
  throw new Error('OTP-DEFERRED: crmSendOtp disabled — CR-2026-09-14-001');
  /* original body preserved as comment:
  if (isV2()) {
    const restaurantId = getRestaurantIdFromUserId(_userId);
    const data = await crmFetch('/scan/auth/request-otp', { method: 'POST', body: JSON.stringify({ phone: stripPhonePrefix(_phone), restaurant_id: restaurantId }), userId: _userId });
    return { success: true, message: 'OTP sent', expires_in_minutes: data?.expires_in_seconds ? Math.ceil(data.expires_in_seconds / 60) : 10, debug_otp: data?.dev_otp, phone: data?.phone };
  }
  return crmFetch('/customer/send-otp', { method: 'POST', body: JSON.stringify({ phone: stripPhonePrefix(_phone), user_id: _userId, country_code: _countryCode }) });
  */
};
```
**Replace with:** *(empty — delete entirely)*

---

#### E2 — Delete `crmVerifyOtp` (lines 304–319)

**Delete:**
```javascript
/**
 * Verify OTP and get token + profile
 * Returns: { success, token, customer, is_new_customer? }
 *
 * v1 path: POST /customer/verify-otp — returns { token, customer: { name, phone, addresses, ... } }
 * v2 path: POST /scan/auth/verify-otp — returns { token, customer_id, is_new_customer, phone }
 *          Synthesized to v1 shape. v2 has no `customer.name` here — caller falls back to displayName.
 */
// OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production. Restore when live.
export const crmVerifyOtp = async (_phone, _otp, _userId, _countryCode = '91') => {
  throw new Error('OTP-DEFERRED: crmVerifyOtp disabled — CR-2026-09-14-001');
  /* original body preserved as comment:
  if (isV2()) { ... crmFetch('/scan/auth/verify-otp', ...) ... }
  return crmFetch('/customer/verify-otp', { method: 'POST', body: JSON.stringify({ phone: stripPhonePrefix(_phone), otp: _otp, user_id: _userId, country_code: _countryCode }) });
  */
};
```
**Replace with:** *(empty)*

---

#### E3 — Delete `crmForgotPassword` (lines 372–384)

**Delete:**
```javascript
/**
 * Send OTP for password reset
 * Returns: { success, message, expires_in_minutes }
 *
 * HELD ON v1 — v2 contract has no /forgot-password endpoint (per SCAN_AND_ORDER_API_v2.md).
 * Deliberate Phase-1 hold (decision 3d). Tracked as UX-GAP-02.
 * Calls continue to hit v1 URL regardless of flag — same (broken) behavior as today.
 */
// OTP-DEFERRED: CR-2026-09-14-001 — CRM v1 forgot-password 404 on v2. Restore when CRM adds v2 endpoint (UX-GAP-02).
export const crmForgotPassword = async (_phone, _userId, _countryCode = '91') => {
  throw new Error('OTP-DEFERRED: crmForgotPassword disabled — CR-2026-09-14-001');
  /* original body: crmFetch('/customer/forgot-password', { method: 'POST', ... }) */
};
```
**Replace with:** *(empty)*

---

#### E4 — Delete `crmResetPassword` (lines 386–398)

**Delete:**
```javascript
/**
 * Reset password with OTP verification
 * Returns: { success, message }
 *
 * HELD ON v1 — v2 contract has no /reset-password endpoint (per SCAN_AND_ORDER_API_v2.md).
 * Deliberate Phase-1 hold (decision 3d). Tracked as UX-GAP-02.
 * Calls continue to hit v1 URL regardless of flag — same (broken) behavior as today.
 */
// OTP-DEFERRED: CR-2026-09-14-001 — CRM v1 reset-password 404 on v2. Restore when CRM adds v2 endpoint (UX-GAP-02).
export const crmResetPassword = async (_phone, _otp, _userId, _newPassword) => {
  throw new Error('OTP-DEFERRED: crmResetPassword disabled — CR-2026-09-14-001');
  /* original body: crmFetch('/customer/reset-password', { method: 'POST', ... }) */
};
```
**Replace with:** *(empty)*

---

### FILE 2: `PasswordSetup.jsx` — delete 10 OTP-DEFERRED blocks (E5–E14)

#### E5 — Clean up import line (line 5–6)

**Before:**
```javascript
// OTP-DEFERRED: CR-2026-09-14-001 — crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp disabled
import { crmRegister, crmLogin, /* crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp, */ crmSkipOtp, buildUserId } from '../api/services/crmService';
```

**After:**
```javascript
// CR-2026-10-07-002: OTP functions removed from crmService; import cleaned
import { crmRegister, crmLogin, crmSkipOtp, buildUserId } from '../api/services/crmService';
```

---

#### E6 — Delete commented state vars (lines 33–44)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — forgot-password + OTP-login states disabled
  // const [forgotMode, setForgotMode] = useState(false);
  // const [otp, setOtp] = useState('');
  // const [otpSent, setOtpSent] = useState(false);
  // const [sendingOtp, setSendingOtp] = useState(false);
  // const [devOtp, setDevOtp] = useState('');
  // const [otpDigits, setOtpDigits] = useState('');
  // const [otpLoginSent, setOtpLoginSent] = useState(false);
  // const [otpLoginSending, setOtpLoginSending] = useState(false);
  // const [otpLoginDevOtp, setOtpLoginDevOtp] = useState('');
  // const [resendTimer, setResendTimer] = useState(0);
  // const resendIntervalRef = useRef(null);
```
**Replace with:** *(empty)*

---

#### E7 — Delete authMethod comment line (line 46)

**Before:**
```javascript
  // OTP-DEFERRED: authMethod simplified — 'choose'/'otp' removed (password/set-password only)
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'set-password'
```

**After:**
```javascript
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'set-password'
```

---

#### E8 — Delete resend timer comment (lines 85–87)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — resend timer disabled
  // const startResendTimer = useCallback(() => { ... }, []);
  // useEffect(() => { return () => { if (resendIntervalRef.current) clearInterval(resendIntervalRef.current); }; }, []);
```
**Replace with:** *(empty)*

---

#### E9 — Delete OTP login handlers comment (lines 103–106)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — OTP login handlers disabled
  // const handleLoginSendOtp = useCallback(async () => { ... crmSendOtp ... }, [...]);
  // const handleLoginVerifyOtp = async () => { ... crmVerifyOtp ... };
  // const handleResendOtp = async () => { ... handleLoginSendOtp ... };
```
**Replace with:** *(empty)*

---

#### E10 — Delete forgot-password handler + forgotMode render block (lines 166–171)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — forgot-password handlers disabled (already dead code)
  // const handleSendOtp = async () => { ... crmForgotPassword ... };
  // const handleResetPassword = async () => { ... crmResetPassword ... };

  // OTP-DEFERRED: CR-2026-09-14-001 — forgotMode render block disabled (setForgotMode never called)
  // if (forgotMode) { return ( ... Reset Password UI ... ); }
```
**Replace with:** *(empty)*

---

#### E11 — Delete 'choose' state comment (lines 241–242)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — 'choose' state removed (showed OTP as primary button)
  // if (authMethod === 'choose') { return ( ... Login with OTP / Login with Password ... ); }
```
**Replace with:** *(empty)*

---

#### E12 — Delete "Use OTP instead" comment in set-password branch (lines 306–307)

**Delete:**
```javascript
          {/* OTP-DEFERRED: CR-2026-09-14-001 — "Use OTP instead" disabled */}
          {/* <button className="password-forgot-link" onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); setConfirmPassword(''); }} data-testid="switch-to-otp-from-set">Use OTP instead</button> */}
```
**Replace with:** *(empty)*

---

#### E13 — Delete OTP entry screen comment (lines 318–319)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — OTP entry screen disabled
  // if (authMethod === 'otp') { return ( ... Enter 6-digit OTP ... ); }
```
**Replace with:** *(empty)*

---

#### E14 — Delete "Use OTP instead" comment in password branch (lines 373–374)

**Delete:**
```javascript
          {/* OTP-DEFERRED: CR-2026-09-14-001 — "Use OTP instead" disabled */}
          {/* <button className="password-forgot-link" onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); }} data-testid="switch-to-otp-btn">Use OTP instead</button> */}
```
**Replace with:** *(empty)*

---

### FILE 3: `AuthContext.jsx` — delete 2 comment lines (E15–E16)

#### E15 — Delete sendOTP comment body (lines 213–214)

**Delete:**
```javascript
  // OTP-DEFERRED: CR-2026-09-14-001 — sendOTP disabled (backend /api/auth/send-otp commented out)
  // const sendOTP = async (phone, restaurantContext = null) => { ... fetchWithTimeout .../api/auth/send-otp ... };
```
**Replace with:** *(empty)*

---

#### E16 — Delete sendOTP context export comment (lines 227–228)

**Delete:**
```javascript
    // OTP-DEFERRED: CR-2026-09-14-001 — sendOTP removed from context value
    // sendOTP,
```
**Replace with:** *(empty)*

---

### FILE 4: `AdminVisibilityPage.jsx` — delete commented skipOtp* section (E17)

#### E17 — Delete commented admin section (lines 102–120, D1=Option A)

**Delete:**
```javascript
      {/* OTP-DEFERRED: CR-2026-09-14-001 — skipOtp admin toggles hidden until SMS is live.
          skipOtp* flags still stored in DB and applied at runtime via crmSkipOtp frictionless path.
      <div className="admin-section" data-testid="admin-section-skip-otp">
        <h2 className="admin-section-title">Skip OTP / Password Setup</h2>
        <p className="admin-section-description">
          When ON, customers for the matching order type skip the password / OTP screen entirely
          and go straight to the menu (CRM identity is attached silently). Default OFF.
        </p>
        <div className="admin-toggle-grid">
          <ToggleSwitch field="skipOtpDineIn" label="Skip OTP for Dine-In Orders" />
          <ToggleSwitch field="skipOtpTakeaway" label="Skip OTP for Takeaway Orders" />
          <ToggleSwitch field="skipOtpDelivery" label="Skip OTP for Delivery Orders" />
          <ToggleSwitch field="skipOtpDineInWithTable" label="Skip OTP for Dine-In with Table Number" />
          <ToggleSwitch field="skipOtpWalkIn" label="Skip OTP for Walk-In Dine Orders" />
          <ToggleSwitch field="skipOtpRoomOrders" label="Skip OTP for Room Orders" />
        </div>
      </div>
      */}
```
**Replace with:** *(empty)*

---

### FILE 5: `VisibilityTab.jsx` — delete commented otpRequired* section (E18)

#### E18 — Delete commented auth sub-tab (lines ~122–132, D1=Option A)

**Delete:**
```javascript
      {/* OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* legacy flags hidden from admin UI
      {activeSubTab === 'auth' && (
        <div className="content-panel" data-testid="panel-auth">
          ...5 otpRequired* ToggleRow items...
        </div>
      )}
      */}
```
**Replace with:** *(empty)*

> Role 3: view the file first to get the exact multi-line text before search_replace.

---

### FILE 6: `server.py` — delete 8 comment sections (E19–E26)

#### E19 — Delete OTP-DEFERRED comment in LoginRequest model (lines 102–103)

**Delete:**
```python
    # OTP-DEFERRED: CR-2026-09-14-001
    # otp: Optional[str] = None
```
**Replace with:** *(empty)*

---

#### E20 — Delete OTPRequest model comment (lines 115–119)

**Delete:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production
# class OTPRequest(BaseModel):
#     phone: str
#     restaurant_id: Optional[str] = None  # For scoped OTP sending
#     pos_id: Optional[str] = "0001"
```
**Replace with:** *(empty)*

---

#### E21 — Delete otpRequired* config model fields (lines 249–254)

**Delete:**
```python
    # OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* legacy flags removed from model
    # otpRequiredDineIn: Optional[bool] = None
    # otpRequiredTakeaway: Optional[bool] = None
    # otpRequiredDineInWithTable: Optional[bool] = None
    # otpRequiredWalkIn: Optional[bool] = None
    # otpRequiredRoomOrders: Optional[bool] = None
```
**Replace with:** *(empty)*

---

#### E22 — Delete otp_store / generate_otp / verify_otp (lines 393–411)

**Delete:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — in-memory OTP store disabled (CRM SMS not in production)
# otp_store = {}
#
# def generate_otp(phone: str) -> str:
#     otp = str(secrets.randbelow(900000) + 100000)
#     otp_store[phone] = {"otp": otp, "expires": datetime.now(timezone.utc).timestamp() + 300}
#     return otp
#
# def verify_otp(phone: str, otp: str) -> bool:
#     stored = otp_store.get(phone)
#     if not stored:
#         return False
#     if datetime.now(timezone.utc).timestamp() > stored["expires"]:
#         del otp_store[phone]
#         return False
#     if stored["otp"] == otp:
#         del otp_store[phone]
#         return True
#     return False
```
**Replace with:** *(empty)*

---

#### E23 — Delete /auth/send-otp route (lines 465–484)

**Delete:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/send-otp disabled (CRM SMS not in production)
# Uncomment when CRM production SMS is confirmed live.
# @auth_router.post("/send-otp")
# @limiter.limit("10/minute")
# async def send_otp(request: Request, body: OTPRequest):
#     """Send OTP to phone number - scoped by restaurant context"""
#     phone = body.phone.strip()
#     if body.restaurant_id:
#         pos_id = body.pos_id or "0001"
#         user_id = f"pos_{pos_id}_restaurant_{body.restaurant_id}"
#         customer = await db.customers.find_one({"phone": phone, "user_id": user_id}, {"_id": 0})
#     else:
#         customer = await db.customers.find_one({"phone": phone}, {"_id": 0})
#     if not customer:
#         user = await db.users.find_one({"phone": phone}, {"_id": 0})
#         if not user:
#             raise HTTPException(status_code=404, detail="Phone number not registered for this restaurant")
#     otp = generate_otp(phone)
#     logging.info(f"OTP for {phone}: {otp}")
#     return {"success": True, "message": "OTP sent successfully", "otp_for_testing": otp}
```
**Replace with:** *(empty)*

---

#### E24 — Delete OTP branch in unified_login (lines 521–526)

**Before:**
```python
        # OTP-DEFERRED: CR-2026-09-14-001 — OTP branch removed (CRM SMS not in production)
        # if body.otp:
        #     phone = customer.get("phone")
        #     if not verify_otp(phone, body.otp):
        #         raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        # elif body.password:
        if body.password:
```

**After:**
```python
        if body.password:
```

---

#### E25 — Delete /auth/reset-password route (lines 731–757)

**Delete:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/reset-password disabled (requires OTP store)
# Uncomment when CRM production SMS + persistent OTP store (CR-003 Parts B+C) are live.
# @auth_router.post("/reset-password")
# @limiter.limit("3/minute")
# async def reset_password(request: Request, body: ResetPasswordRequest):
#     """Reset password via OTP verification"""
#     import bcrypt
#     if body.new_password != body.confirm_password:
#         raise HTTPException(status_code=400, detail="Passwords do not match")
#     if len(body.new_password) < 6:
#         raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
#     phone = body.phone.strip()
#     if not verify_otp(phone, body.otp):
#         raise HTTPException(status_code=401, detail="Invalid or expired OTP")
#     pos_id = body.pos_id or "0001"
#     user_id = f"pos_{pos_id}_restaurant_{body.restaurant_id}"
#     normalized_phone = phone
#     if phone.startswith('+91'): normalized_phone = phone[3:]
#     elif phone.startswith('91') and len(phone) > 10: normalized_phone = phone[2:]
#     password_hash = bcrypt.hashpw(body.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
#     result = await db.customers.update_one(
#         {"$or": [{"phone": phone, "user_id": user_id}, {"phone": normalized_phone, "user_id": user_id}]},
#         {"$set": {"password_hash": password_hash, "updated_at": datetime.now(timezone.utc).isoformat()}}
#     )
#     if result.modified_count == 0:
#         raise HTTPException(status_code=404, detail="Customer not found")
#     return {"success": True, "message": "Password reset successfully"}
```
**Replace with:** *(empty)*

---

#### E26 — Delete otpRequired* config defaults (lines 1119–1124)

**Delete:**
```python
            # OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* removed from defaults
            # "otpRequiredDineIn": False,
            # "otpRequiredTakeaway": False,
            # "otpRequiredDineInWithTable": False,
            # "otpRequiredWalkIn": False,
            # "otpRequiredRoomOrders": False,
```
**Replace with:** *(empty)*

---

## Edit summary

| ID | File | Lines | What |
|---|---|---|---|
| E1 | `crmService.js` | 283–302 | Delete `crmSendOtp` |
| E2 | `crmService.js` | 304–319 | Delete `crmVerifyOtp` |
| E3 | `crmService.js` | 372–384 | Delete `crmForgotPassword` |
| E4 | `crmService.js` | 386–398 | Delete `crmResetPassword` |
| E5 | `PasswordSetup.jsx` | 5–6 | Clean up import line |
| E6 | `PasswordSetup.jsx` | 33–44 | Delete commented state vars |
| E7 | `PasswordSetup.jsx` | 46 | Delete comment line above live useState |
| E8 | `PasswordSetup.jsx` | 85–87 | Delete resend timer comment |
| E9 | `PasswordSetup.jsx` | 103–106 | Delete OTP login handlers comment |
| E10 | `PasswordSetup.jsx` | 166–171 | Delete forgot-password handlers + forgotMode comment |
| E11 | `PasswordSetup.jsx` | 241–242 | Delete 'choose' state comment |
| E12 | `PasswordSetup.jsx` | 306–307 | Delete "Use OTP instead" JSX comment (set-password) |
| E13 | `PasswordSetup.jsx` | 318–319 | Delete OTP entry screen comment |
| E14 | `PasswordSetup.jsx` | 373–374 | Delete "Use OTP instead" JSX comment (password) |
| E15 | `AuthContext.jsx` | 213–214 | Delete sendOTP function comment |
| E16 | `AuthContext.jsx` | 227–228 | Delete sendOTP export comment |
| E17 | `AdminVisibilityPage.jsx` | 102–120 | Delete commented skipOtp* admin section |
| E18 | `VisibilityTab.jsx` | ~122–132 | Delete commented otpRequired* section |
| E19 | `server.py` | 102–103 | Delete otp comment in LoginRequest |
| E20 | `server.py` | 115–119 | Delete OTPRequest model comment |
| E21 | `server.py` | 249–254 | Delete otpRequired* model fields |
| E22 | `server.py` | 393–411 | Delete otp_store/generate_otp/verify_otp |
| E23 | `server.py` | 465–484 | Delete /auth/send-otp route |
| E24 | `server.py` | 521–526 | Delete OTP branch in unified_login |
| E25 | `server.py` | 731–757 | Delete /auth/reset-password route |
| E26 | `server.py` | 1119–1124 | Delete otpRequired* config defaults |

**Net: ~160 lines deleted across 6 files. Zero live code removed.**

---

## Self-test checklist

| ST | Test | Expected |
|---|---|---|
| ST1 | `grep -rn "OTP-DEFERRED" frontend/src backend/` | **0 results** |
| ST2 | `grep -rn "crmSendOtp\|crmVerifyOtp\|crmForgotPassword\|crmResetPassword" frontend/src` | 0 results |
| ST3 | `grep -n "otp_store\|generate_otp\|verify_otp" backend/server.py` | 0 results |
| ST4 | `grep -n "otpRequired" backend/server.py` | 0 results |
| ST5 | `yarn build` | Clean |
| ST6 | Backend restarts clean | RUNNING |
| ST7 | `pytest -m smoke backend/tests/smoke/` | All pass |

---

## CRM confirmation note (deliverable alongside implementation)

File to create: `memory/change_requests/CR-2026-10-07-002-otp-permanent-deletion/CRM_CONFIRMATION_NOTE.md`

```
To: CRM team  
Re: CR-084 closure — OTP-DEFERRED code permanently deleted  
Date: 2026-10-08

All OTP-DEFERRED code has been deleted from the MyGenie Customer App codebase:

Frontend:
- crmSendOtp, crmVerifyOtp, crmForgotPassword, crmResetPassword deleted from crmService.js
- All OTP handler, state, and UI comment blocks deleted from PasswordSetup.jsx
- sendOTP deleted from AuthContext.jsx
- Admin OTP toggle sections deleted from AdminVisibilityPage.jsx and VisibilityTab.jsx

Backend:
- OTPRequest model deleted from server.py
- otp_store, generate_otp, verify_otp helpers deleted
- POST /api/auth/send-otp route deleted
- POST /api/auth/reset-password route deleted
- OTP branch in unified_login deleted
- otpRequired* model fields and config defaults deleted

Verification: grep -rn "OTP-DEFERRED" returns 0 results.
CR-2026-09-14-001 "restore when live" condition permanently voided.
Our side of CR-084: CLOSED.
```

---

```
Planning complete: CR-2026-10-07-002
Stage: Implementation Plan
Code reality: FULL — exact before/after text for all 26 edits
Risk: LOW logic / HIGH process
Files WILL change (6): crmService.js · PasswordSetup.jsx · AuthContext.jsx · AdminVisibilityPage.jsx · VisibilityTab.jsx · server.py
Files WILL NOT touch: LandingPage.jsx · ReviewOrder.jsx · CartContext.js · App.js · RestaurantConfigContext.jsx
Docs: memory/change_requests/CR-2026-10-07-002-otp-permanent-deletion/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-10-07-002" → Role 3 Implementation
```
