# IMPLEMENTATION PLAN — CR-2026-09-14-001
# Comment out broken OTP SMS path — frontend, backend, admin config

**Role:** Planning (Role 2) — Implementation Plan
**Date:** 2026-09-14
**Risk:** LOW — comment-out only, fully reversible
**Prerequisite gate:** IA approved · Owner "go" received
**Follows Alpha v0.1 §8 Role 2 output contract. No code in this document.**

---

## Ground rules (Role 3 must follow)

- **R1:** Comment-out only — no deletion of any line
- **R2:** Every commented block carries the markup: `# OTP-DEFERRED: CR-2026-09-14-001` (Python) or `// OTP-DEFERRED: CR-2026-09-14-001` (JS) or `{/* OTP-DEFERRED: CR-2026-09-14-001 */}` (JSX)
- **R3:** Execute edits in the exact order below — backend first, then frontend, then tests
- **R4:** Do NOT touch `skipOtp*` fields, `crmSkipOtp`, `otpPolicy.js`, `LandingPage.jsx`
- **R5:** After all edits, run the full verification sequence in §4 before declaring done

---

## 0. Pre-implementation checks (verify before touching any file)

```bash
# Confirm starting state — all 22 tests pass
cd /app && python -m pytest backend/tests/ -q 2>&1 | tail -3
# Expected: 22 passed

# Confirm backend healthy
curl -s http://localhost:8001/api/healthz
# Expected: {"ok":true,"mongo":"up"}

# Confirm send-otp EXISTS right now (will not exist after Edit B3)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8001/api/auth/send-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9579504871","restaurant_id":"478"}'
# Expected: 200
```

---

## 1. Files that WILL change

| # | File | Edits |
|---|---|---|
| A | `backend/server.py` | 7 surgical comment-outs (A1–A7) |
| B | `backend/tests/smoke/test_auth_flows.py` | 1 comment-out (B1) |
| C | `backend/tests/contracts/__snapshots__/test_config_nonexistent_defaults.json` | Snapshot regen after A4 |
| D | `frontend/src/pages/PasswordSetup.jsx` | 8 comment-outs (D1–D8) |
| E | `frontend/src/api/services/crmService.js` | 4 comment-outs (E1–E4) |
| F | `frontend/src/context/AuthContext.jsx` | 1 comment-out (F1) |
| G | `frontend/src/pages/admin/AdminVisibilityPage.jsx` | 1 comment-out (G1) |
| H | `frontend/src/components/AdminSettings/VisibilityTab.jsx` | 1 comment-out (H1) |

## 2. Files that WILL NOT be touched

`crmSkipOtpRetry.js` · `otpPolicy.js` · `LandingPage.jsx` · `RestaurantConfigContext.jsx` ·
`AdminConfigContext.jsx` · all other backend routes · all other snapshots ·
`.env` files · `package.json` · `requirements.txt`

---

## 3. Edit sequence

### ── BACKEND FIRST ──

---

### Edit A1 — `server.py` — Comment out `OTPRequest` model (lines 114–117)

**old_str:**
```python
class OTPRequest(BaseModel):
    phone: str
    restaurant_id: Optional[str] = None  # For scoped OTP sending
    pos_id: Optional[str] = "0001"
```

**new_str:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production
# class OTPRequest(BaseModel):
#     phone: str
#     restaurant_id: Optional[str] = None  # For scoped OTP sending
#     pos_id: Optional[str] = "0001"
```

---

### Edit A2 — `server.py` — Comment out `otp` field in `LoginRequest` (line 102)

**old_str:**
```python
    password: Optional[str] = None
    otp: Optional[str] = None
    restaurant_id: Optional[str] = None  # From POS API response (e.g., "698")
```

**new_str:**
```python
    password: Optional[str] = None
    # OTP-DEFERRED: CR-2026-09-14-001
    # otp: Optional[str] = None
    restaurant_id: Optional[str] = None  # From POS API response (e.g., "698")
```

---

### Edit A3 — `server.py` — Comment out `otp_store`, `generate_otp()`, `verify_otp()` (lines 383–402)

**old_str:**
```python
# OTP Storage (in-memory for demo, use Redis in production)
otp_store = {}

def generate_otp(phone: str) -> str:
    otp = str(secrets.randbelow(900000) + 100000)  # 6-digit OTP
    otp_store[phone] = {"otp": otp, "expires": datetime.now(timezone.utc).timestamp() + 300}  # 5 min expiry
    return otp

def verify_otp(phone: str, otp: str) -> bool:
    stored = otp_store.get(phone)
    if not stored:
        return False
    if datetime.now(timezone.utc).timestamp() > stored["expires"]:
        del otp_store[phone]
        return False
    if stored["otp"] == otp:
        del otp_store[phone]
        return True
    return False
```

**new_str:**
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

---

### Edit A4 — `server.py` — Comment out `/api/auth/send-otp` endpoint (lines 456–486)

**old_str:**
```python
@auth_router.post("/send-otp")
@limiter.limit("10/minute")  # CR-2026-09-12-004: rate-limit
async def send_otp(request: Request, body: OTPRequest):
    """Send OTP to phone number - scoped by restaurant context"""
    phone = body.phone.strip()
    
    # Build user_id for restaurant-scoped lookup
    if body.restaurant_id:
        pos_id = body.pos_id or "0001"
        user_id = f"pos_{pos_id}_restaurant_{body.restaurant_id}"
        
        # Check if customer exists for this restaurant
        customer = await db.customers.find_one({
            "phone": phone,
            "user_id": user_id
        }, {"_id": 0})
    else:
        # Fallback: check by phone only (for restaurant admin login)
        customer = await db.customers.find_one({"phone": phone}, {"_id": 0})
    
    if not customer:
        # Check if it's a restaurant user by phone
        user = await db.users.find_one({"phone": phone}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=404, detail="Phone number not registered for this restaurant")
    
    otp = generate_otp(phone)
    # In production, send OTP via SMS provider (Twilio/MSG91)
    logging.info(f"OTP for {phone}: {otp}")  # For testing
    
    return {"success": True, "message": "OTP sent successfully", "otp_for_testing": otp}
```

**new_str:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/send-otp disabled (CRM SMS not in production)
# Uncomment when CRM production SMS is confirmed live.
# @auth_router.post("/send-otp")
# @limiter.limit("10/minute")
# async def send_otp(request: Request, body: OTPRequest):
#     ...entire body commented...
#     return {"success": True, "message": "OTP sent successfully", "otp_for_testing": otp}
```

---

### Edit A5 — `server.py` — Comment out OTP branch in `unified_login()` (lines 557–568)

**old_str:**
```python
    if customer:
        # Customer found - verify via OTP or password
        if body.otp:
            phone = customer.get("phone")
            if not verify_otp(phone, body.otp):
                raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        elif body.password:
            password_hash = customer.get("password_hash")
            if not password_hash:
                raise HTTPException(status_code=401, detail="No password set. Please use OTP to login.")
            if not verify_password(body.password, password_hash):
                raise HTTPException(status_code=401, detail="Invalid password")
        else:
            raise HTTPException(status_code=400, detail="Password or OTP required for login")
```

**new_str:**
```python
    if customer:
        # Customer found - verify via password
        # OTP-DEFERRED: CR-2026-09-14-001 — OTP branch removed (CRM SMS not in production)
        # if body.otp:
        #     phone = customer.get("phone")
        #     if not verify_otp(phone, body.otp):
        #         raise HTTPException(status_code=401, detail="Invalid or expired OTP")
        # elif body.password:
        if body.password:
            password_hash = customer.get("password_hash")
            if not password_hash:
                raise HTTPException(status_code=401, detail="No password set.")
            if not verify_password(body.password, password_hash):
                raise HTTPException(status_code=401, detail="Invalid password")
        else:
            raise HTTPException(status_code=400, detail="Password required for login")
```

---

### Edit A6 — `server.py` — Comment out `/api/auth/reset-password` endpoint (lines 765–800)

**old_str:**
```python
@auth_router.post("/reset-password")
@limiter.limit("3/minute")  # CR-2026-09-12-004: rate-limit
async def reset_password(request: Request, body: ResetPasswordRequest):
    """Reset password via OTP verification"""
    import bcrypt
    
    if body.new_password != body.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    phone = body.phone.strip()
    
    if not verify_otp(phone, body.otp):
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")
    
    pos_id = body.pos_id or "0001"
    user_id = f"pos_{pos_id}_restaurant_{body.restaurant_id}"
    
    normalized_phone = phone
    if phone.startswith('+91'):
        normalized_phone = phone[3:]
    elif phone.startswith('91') and len(phone) > 10:
        normalized_phone = phone[2:]
    
    password_hash = bcrypt.hashpw(body.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    result = await db.customers.update_one(
        {"$or": [{"phone": phone, "user_id": user_id}, {"phone": normalized_phone, "user_id": user_id}]},
        {"$set": {"password_hash": password_hash, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    return {"success": True, "message": "Password reset successfully"}
```

**new_str:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/reset-password disabled (requires OTP store)
# Uncomment when CRM production SMS + persistent OTP store (CR-003 Parts B+C) are live.
# @auth_router.post("/reset-password")
# @limiter.limit("3/minute")
# async def reset_password(request: Request, body: ResetPasswordRequest):
#     ...entire body commented...
#     return {"success": True, "message": "Password reset successfully"}
```

---

### Edit A7 — `server.py` — Comment out `otpRequired*` fields in config model + defaults

**Part A7a — Config model (lines 252–257):**

**old_str:**
```python
    # OTP Configuration per order type
    otpRequiredDineIn: Optional[bool] = None
    otpRequiredTakeaway: Optional[bool] = None
    otpRequiredDineInWithTable: Optional[bool] = None
    otpRequiredWalkIn: Optional[bool] = None
    otpRequiredRoomOrders: Optional[bool] = None
```

**new_str:**
```python
    # OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* flags are legacy dead flags, removed from model
    # otpRequiredDineIn: Optional[bool] = None
    # otpRequiredTakeaway: Optional[bool] = None
    # otpRequiredDineInWithTable: Optional[bool] = None
    # otpRequiredWalkIn: Optional[bool] = None
    # otpRequiredRoomOrders: Optional[bool] = None
```

**Part A7b — Config defaults dict (lines 1162–1167):**

**old_str:**
```python
            # OTP Configuration per order type
            "otpRequiredDineIn": False,
            "otpRequiredTakeaway": False,
            "otpRequiredDineInWithTable": False,
            "otpRequiredWalkIn": False,
            "otpRequiredRoomOrders": False,
```

**new_str:**
```python
            # OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* removed from defaults
            # "otpRequiredDineIn": False,
            # "otpRequiredTakeaway": False,
            # "otpRequiredDineInWithTable": False,
            # "otpRequiredWalkIn": False,
            # "otpRequiredRoomOrders": False,
```

---

### Post-backend restart + snapshot regen

After all A edits:
```bash
sudo supervisorctl restart backend && sleep 6
tail -5 /var/log/supervisor/backend.err.log
# Expected: Application startup complete. (NO ValueError, NO NameError)

curl -s http://localhost:8001/api/healthz
# Expected: {"ok":true,"mongo":"up"}

# Regen snapshot for test_config_nonexistent_defaults (otpRequired* keys removed)
cd /app && python -m pytest backend/tests/contracts/test_public_config.py::test_config_nonexistent_defaults \
  -n 0 --snapshot-update
# Expected: 1 snapshot updated

# Confirm no other snapshots changed
git -C /app diff --name-only backend/tests/fixtures/snapshots/
# Expected: only test_config_nonexistent_defaults.json
```

---

### Edit B1 — `backend/tests/smoke/test_auth_flows.py` — Comment out `test_smoke_otp_echo_present` (lines 20–37)

**old_str:**
```python
@pytest.mark.smoke
def test_smoke_otp_echo_present(http_client):
    """Smoke 1: POST /api/auth/send-otp returns otp_for_testing.

    NOTE: This test WILL FAIL after CR-003 removes the echo.
    That is the designed signal. Regenerate or remove this test then.
    """
    resp = http_client.post("/api/auth/send-otp", json={
        "phone": TEST_PHONE,
        "restaurant_id": TEST_RID,
    })
    assert resp.status_code == 200, f"send-otp failed: {resp.text}"
    data = resp.json()
    assert "otp_for_testing" in data, (
        "otp_for_testing missing — CR-003 has removed the echo OR phone not registered. "
        "If CR-003 is shipped, update/remove this test."
    )
    assert len(str(data["otp_for_testing"])) >= 4, "OTP value looks too short"
```

**new_str:**
```python
# OTP-DEFERRED: CR-2026-09-14-001 — /api/auth/send-otp endpoint commented out.
# Restore and update this test when CR-003 Parts B+C are implemented.
# @pytest.mark.smoke
# def test_smoke_otp_echo_present(http_client):
#     ...commented...
```

---

### ── FRONTEND ──

---

### Edit D1 — `PasswordSetup.jsx` — Partial comment on import line 5

**old_str:**
```js
import { crmRegister, crmLogin, crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp, crmSkipOtp, buildUserId } from '../api/services/crmService';
```

**new_str:**
```js
// OTP-DEFERRED: CR-2026-09-14-001 — crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp disabled
import { crmRegister, crmLogin, /* crmForgotPassword, crmResetPassword, crmSendOtp, crmVerifyOtp, */ crmSkipOtp, buildUserId } from '../api/services/crmService';
```

---

### Edit D2 — `PasswordSetup.jsx` — Comment out forgot-password + OTP-login state vars (lines 32–46)

**old_str:**
```js
  // Forgot password states
  const [forgotMode, setForgotMode] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [devOtp, setDevOtp] = useState('');

  // OTP login states (Step 2: new state for OTP auth method)
  const [authMethod, setAuthMethod] = useState('choose'); // 'choose' | 'otp' | 'password'
  const [otpDigits, setOtpDigits] = useState('');
  const [otpLoginSent, setOtpLoginSent] = useState(false);
  const [otpLoginSending, setOtpLoginSending] = useState(false);
  const [otpLoginDevOtp, setOtpLoginDevOtp] = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const resendIntervalRef = useRef(null);
```

**new_str:**
```js
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

  // OTP-DEFERRED: authMethod simplified — 'choose' removed (goes straight to password/set-password)
  const [authMethod, setAuthMethod] = useState('password'); // 'password' | 'set-password'
```

> **Note for Role 3:** `authMethod` is kept (used by password + set-password flows). Initial value changed from `'choose'` to `'password'`. UX-GAP-01 useEffect already overrides this on mount for existing customers.

---

### Edit D3 — `PasswordSetup.jsx` — Comment out `startResendTimer` + cleanup effect (lines 84–105)

**old_str:**
```js
  // Step 3: Start resend countdown timer
  const startResendTimer = useCallback(() => {
    setResendTimer(30);
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(resendIntervalRef.current);
          resendIntervalRef.current = null;
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    };
  }, []);
```

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — resend timer disabled
  // const startResendTimer = useCallback(() => { ... }, []);
  // useEffect(() => { return () => { ... }; }, []);
```

---

### Edit D4 — `PasswordSetup.jsx` — Comment out OTP login handlers (lines 121–183)

**old_str:**
```js
  // Step 3: Send OTP for login (existing customer)
  const handleLoginSendOtp = useCallback(async () => {
```

*(through to end of `handleResendOtp` at line 183)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — OTP login handlers disabled
  // const handleLoginSendOtp = useCallback(async () => { ... }, [...]);
  // const handleLoginVerifyOtp = async () => { ... };
  // const handleResendOtp = async () => { ... };
```

> **Note for Role 3:** Use search_replace capturing the full block from line 121 (`// Step 3: Send OTP`) through line 183 (end of `handleResendOtp`).

---

### Edit D5 — `PasswordSetup.jsx` — Comment out forgot-password handlers (lines 243–292)

**old_str:**
```js
  // Forgot password — send OTP → CRM /customer/forgot-password
  const handleSendOtp = async () => {
```

*(through to end of `handleResetPassword` at line 292)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — forgot-password handlers disabled (already dead code)
  // const handleSendOtp = async () => { ... };
  // const handleResetPassword = async () => { ... };
```

---

### Edit D6 — `PasswordSetup.jsx` — Comment out `forgotMode` render block (lines 294–376)

**old_str:**
```js
  // Forgot password flow
  if (forgotMode) {
    return (
```

*(through to closing `}` at line 376)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — forgotMode render block disabled (setForgotMode never called)
  // if (forgotMode) { return ( ... ); }
```

---

### Edit D7 — `PasswordSetup.jsx` — Comment out State A ('choose') render block (lines 447–481)

**old_str:**
```js
  // State A: authMethod = 'choose' (initial)
  if (authMethod === 'choose') {
    return (
      <div className="password-setup-page" data-testid="password-login-page">
```

*(through to closing `}` at line 481)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — 'choose' state removed (showed OTP as primary button)
  // if (authMethod === 'choose') { return ( ... ); }
```

---

### Edit D8 — `PasswordSetup.jsx` — Comment out "Use OTP instead" links + State B OTP render

**Part D8a — "Use OTP instead" in State A2 (lines 545–551):**

**old_str:**
```js
          <button
            className="password-forgot-link"
            onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); setConfirmPassword(''); }}
            data-testid="switch-to-otp-from-set"
          >
            Use OTP instead
          </button>
```

**new_str:**
```js
          {/* OTP-DEFERRED: CR-2026-09-14-001 — "Use OTP instead" disabled */}
          {/* <button ... data-testid="switch-to-otp-from-set">Use OTP instead</button> */}
```

**Part D8b — State B ('otp') full render block (lines 562–640):**

**old_str:**
```js
  // State B: authMethod = 'otp' (OTP sent, waiting for verification)
  if (authMethod === 'otp') {
    return (
```

*(through to closing `}` at line 640)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — OTP entry screen disabled
  // if (authMethod === 'otp') { return ( ... ); }
```

**Part D8c — "Use OTP instead" in State C (lines 694–700):**

**old_str:**
```js
          <button
            className="password-forgot-link"
            onClick={() => { setAuthMethod('choose'); setError(''); setPassword(''); }}
            data-testid="switch-to-otp-btn"
          >
            Use OTP instead
          </button>
```

**new_str:**
```js
          {/* OTP-DEFERRED: CR-2026-09-14-001 — "Use OTP instead" disabled */}
          {/* <button ... data-testid="switch-to-otp-btn">Use OTP instead</button> */}
```

---

### Edit E1–E4 — `crmService.js` — Comment out 4 function bodies

For each of the 4 functions, comment the body and replace with a throwing stub.
Pattern (same for all 4):

**E1 — `crmSendOtp` (lines 291–318):**

**old_str:**
```js
export const crmSendOtp = async (phone, userId, countryCode = '91') => {
  if (isV2()) {
```
*(through to closing `};` at line 318)*

**new_str:**
```js
// OTP-DEFERRED: CR-2026-09-14-001 — CRM SMS not in production. Restore when live.
export const crmSendOtp = async (_phone, _userId, _countryCode = '91') => {
  throw new Error('OTP-DEFERRED: crmSendOtp disabled — CR-2026-09-14-001');
  /* original body:
  if (isV2()) { ... }
  return crmFetch('/customer/send-otp', { ... });
  */
};
```

**E2 — `crmVerifyOtp` (lines 328–357):** Same pattern.

**E3 — `crmForgotPassword` (lines 395–403):** Same pattern.

**E4 — `crmResetPassword` (lines 413–421):** Same pattern.

---

### Edit F1 — `AuthContext.jsx` — Comment out `sendOTP` body + remove from value (lines 213–252)

**Part F1a — Function body (lines 214–239):**

**old_str:**
```js
  // sendOTP kept for backward compat (if anything still calls it)
  const sendOTP = async (phone, restaurantContext = null) => {
    const body = { phone };
```
*(through to closing `};` at line 239)*

**new_str:**
```js
  // OTP-DEFERRED: CR-2026-09-14-001 — sendOTP disabled (backend endpoint commented out)
  // const sendOTP = async (phone, restaurantContext = null) => { ... };
```

**Part F1b — Remove from value object (line 252):**

**old_str:**
```js
    setRestaurantScope,
    sendOTP,
    login,
```

**new_str:**
```js
    setRestaurantScope,
    // OTP-DEFERRED: CR-2026-09-14-001 — sendOTP removed from context value
    // sendOTP,
    login,
```

---

### Edit G1 — `AdminVisibilityPage.jsx` — Comment out skipOtp* admin section (lines 102–117)

**old_str:**
```jsx
      {/* Skip OTP / Password-Setup Screen — CR-2026-05-30-001 Item 1 */}
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
```

**new_str:**
```jsx
      {/* OTP-DEFERRED: CR-2026-09-14-001 — skipOtp admin toggles hidden until SMS is live.
          skipOtp* flags still stored in DB and applied at runtime via crmSkipOtp frictionless path.
      <div className="admin-section" data-testid="admin-section-skip-otp">
        ...6 ToggleSwitch items...
      </div>
      */}
```

---

### Edit H1 — `VisibilityTab.jsx` — Comment out Auth & OTP sub-tab content (lines 122–138)

**old_str:**
```jsx
      {/* Auth & OTP */}
      {activeSubTab === 'auth' && (
        <div className="content-panel" data-testid="panel-auth">
          <h3 className="section-title">
            <IoKeyOutline className="section-icon" />
            Authentication & OTP
          </h3>
          <p className="section-description">Configure OTP verification requirements per order type</p>
          <div className="toggle-list">
            <ToggleRow field="otpRequiredDineIn" label="OTP Required for Dine-In Orders" />
            <ToggleRow field="otpRequiredTakeaway" label="OTP Required for Takeaway Orders" />
            <ToggleRow field="otpRequiredDineInWithTable" label="OTP Required for Dine-In with Table Number" />
            <ToggleRow field="otpRequiredWalkIn" label="OTP Required for Walk-In Dine Orders" />
            <ToggleRow field="otpRequiredRoomOrders" label="OTP Required for Room Orders" />
          </div>
        </div>
      )}
```

**new_str:**
```jsx
      {/* OTP-DEFERRED: CR-2026-09-14-001 — otpRequired* legacy flags hidden from admin UI
      {activeSubTab === 'auth' && (
        <div className="content-panel" data-testid="panel-auth">
          ...5 otpRequired* ToggleRow items...
        </div>
      )}
      */}
```

---

## 4. Post-edit verification sequence (Role 3 executes in this order)

```bash
# Step 1: Confirm backend starts clean
sudo supervisorctl restart backend && sleep 8
tail -5 /var/log/supervisor/backend.err.log
# Expected: Application startup complete.

# Step 2: Healthz
curl -s http://localhost:8001/api/healthz
# Expected: {"ok":true,"mongo":"up"}

# Step 3: send-otp now returns 404/405 (endpoint commented out)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8001/api/auth/send-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9579504871","restaurant_id":"478"}'
# Expected: 404 or 405

# Step 4: reset-password now returns 404/405
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8001/api/auth/reset-password \
  -H 'Content-Type: application/json' -d '{}'
# Expected: 404 or 405

# Step 5: Admin login still works
curl -s -X POST http://localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"phone_or_email":"owner@18march.com","password":"Qplazm@10","restaurant_id":"478"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('login ok:', d.get('user_type'))"
# Expected: login ok: restaurant

# Step 6: Full test suite — 21 passed (otp_echo test commented out)
cd /app && python -m pytest backend/tests/ -v 2>&1 | tail -10
# Expected: 21 passed, 0 failed

# Step 7: Frontend compiles clean
tail -5 /var/log/supervisor/frontend.out.log
# Expected: webpack compiled / No issues found

# Step 8: OTP-DEFERRED marker count — must find entries in all 8 files
grep -rn "OTP-DEFERRED: CR-2026-09-14-001" /app/frontend/src /app/backend
# Expected: multiple matches across all 8 files

# Step 9: Scope lock — only 8 expected files changed
git -C /app diff --name-only
# Expected: exactly the 8 files listed in §1
```

---

## 5. Verification matrix (Role 3 self-test — all 14 must PASS)

| ID | Test | Expected |
|---|---|---|
| VM-1 | Frontend compiles with 0 errors | webpack compiled, No issues found |
| VM-2 | `/password-setup` existing+password → password screen | ✅ |
| VM-3 | `/password-setup` existing+no password → set-password screen | ✅ |
| VM-4 | "Skip for now" → navigates to menu | ✅ |
| VM-5 | No "Login with OTP" button visible | ✅ |
| VM-6 | No "Use OTP instead" / "Forgot Password" link visible | ✅ |
| VM-7 | Backend starts without NameError or ValueError | Application startup complete. |
| VM-8 | `/api/healthz` → 200 | `{"ok":true,"mongo":"up"}` |
| VM-9 | `POST /api/auth/send-otp` → 404/405 | Endpoint gone |
| VM-10 | `POST /api/auth/reset-password` → 404/405 | Endpoint gone |
| VM-11 | Admin login → 200 + JWT | user_type: restaurant |
| VM-12 | `pytest backend/tests/ -v` → 21 passed, 0 failed | — |
| VM-13 | `grep -rn "OTP-DEFERRED"` finds all 8 files | All markers present |
| VM-14 | `git diff --name-only` = exactly 8 files | No scope creep |

---

## 6. Rollback plan

Every change is a comment. Rollback = uncomment.

```bash
grep -rn "OTP-DEFERRED: CR-2026-09-14-001" /app/frontend/src /app/backend
# Uncomment each found block → sudo supervisorctl restart backend → pytest
```

Zero data impact. No DB changes. No env changes.

---

## 7. Code markers

Every commented block must carry: `OTP-DEFERRED: CR-2026-09-14-001`
Grep command to verify: `grep -rn "OTP-DEFERRED: CR-2026-09-14-001" /app/frontend/src /app/backend`

---

## 8. Compact Planning output

```
Planning complete: CR-2026-09-14-001
Stage: Implementation Plan — WRITTEN 2026-09-14
Code reality: FULL (exact line numbers verified)
Risk: LOW (comment-out only, fully reversible)
Files WILL change: 8 (A–H, 20 surgical edits total)
Files WILL NOT touch: crmSkipOtpRetry.js, otpPolicy.js, LandingPage.jsx,
  RestaurantConfigContext.jsx, AdminConfigContext.jsx, skipOtp* backend fields,
  all working customer paths
Owner decisions: ALL supplied
Verification matrix: 14 checks (VM-1..VM-14)
Rollback: uncomment OTP-DEFERRED blocks, restart backend
Next gate: OWNER APPROVAL REQUIRED before Role 3 (Implementation) may start
```

---

## OWNER APPROVAL GATE

```
OWNER APPROVAL REQUIRED
Reason: Implementation Plan complete. 20 surgical comment-outs across 8 files.
Risk: LOW — comment-out only, fully reversible
Proposed next step: Owner says "go" → Role 3 implements edits A1–H1 in exact order,
                   runs 14-check VM matrix, writes QA handover.
Prerequisites: Wave 1a CLOSED (CR-004 QA + owner smoke) OR owner explicitly waives.
I will not proceed until owner approves.
```
