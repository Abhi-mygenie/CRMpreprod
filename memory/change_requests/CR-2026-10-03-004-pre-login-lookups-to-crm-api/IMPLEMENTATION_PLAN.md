# IMPLEMENTATION PLAN — CR-2026-10-03-004 Part A
## `check-customer` → CRM `lookup` swap

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Gate:** Gate 2 accepted (D1=adapter, D2=delete)  
**Risk:** CRITICAL  
**Files changing:** `frontend/src/api/services/crmService.js` · `frontend/src/pages/LandingPage.jsx` · `backend/server.py`  
**Files NOT touched:** `ReviewOrder.jsx` · `AuthContext.jsx` · `CartContext.js` · `App.js`

---

## Decisions locked

| D | Decision |
|---|---|
| D1 | Option A — adapter in `crmLookupCustomer` normalises CRM flat `{ exists, name }` to `{ exists, customer: { name } }`. LandingPage reads unchanged. |
| D2 | Delete `POST /api/auth/check-customer` route + `CheckCustomerRequest` model from `server.py`. |

---

## Edits — exact and ordered

### E1 · `crmService.js` — add `crmLookupCustomer` after `crmSkipOtp` (after line 347)

Insert after the closing `};` of `crmSkipOtp` (after `is_new_customer: data?.is_new_customer,` block ends at line 347):

**Add:**
```javascript
/**
 * CR-2026-10-03-004 Part A: Pre-login customer lookup via CRM.
 * Replaces POST /api/auth/check-customer (which read db.customers directly).
 *
 * v2 path: POST /scan/auth/lookup — body { phone (digits only), restaurant_id }
 * Response normalised to { exists, customer: { name } | null } (D1=adapter)
 * so LandingPage call sites require no changes to their reads.
 * No auth token required — lookup is a public endpoint.
 */
export const crmLookupCustomer = async (phone, restaurantId) => {
  const data = await crmFetch('/scan/auth/lookup', {
    method: 'POST',
    body: JSON.stringify({
      phone: stripPhonePrefix(phone),
      restaurant_id: String(restaurantId),
    }),
  });
  return {
    exists: data?.exists ?? false,
    customer: data?.exists ? { name: data.name || '' } : null,
  };
};
```

---

### E2 · `LandingPage.jsx` line 19 — add `crmLookupCustomer` to import

**Before:**
```javascript
import { buildUserId } from '../api/services/crmService';
```

**After:**
```javascript
import { buildUserId, crmLookupCustomer } from '../api/services/crmService';
```

---

### E3 · `LandingPage.jsx` lines 85–95 — replace Call Site 1 (debounced auto-lookup)

**Before:**
```javascript
        const API_URL = process.env.REACT_APP_BACKEND_URL || '';
        const res = await fetchWithTimeout(`${API_URL}/api/auth/check-customer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: capturedPhone,
            restaurant_id: String(restaurantId),
            pos_id: '0001',
          }),
        }); // CR-2026-02-XX-001 — 8 s read
        const data = await res.json();
```

**After:**
```javascript
        // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
        const data = await crmLookupCustomer(capturedPhone, restaurantId);
```

---

### E4 · `LandingPage.jsx` lines 607–618 — replace Call Site 2 (Browse Menu tap)

**Before:**
```javascript
          const API_URL = process.env.REACT_APP_BACKEND_URL || '';
          const res = await fetchWithTimeout(`${API_URL}/api/auth/check-customer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              phone: capturedPhone,
              restaurant_id: String(restaurantId),
              pos_id: '0001',
            }),
          }); // CR-2026-02-XX-001 — 8 s read
          data = await res.json();
```

**After:**
```javascript
          // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
          data = await crmLookupCustomer(capturedPhone, restaurantId);
```

---

### E5 · `server.py` lines 121–124 — delete `CheckCustomerRequest` model

**Before:**
```python
class CheckCustomerRequest(BaseModel):
    phone: str
    restaurant_id: str
    pos_id: Optional[str] = "0001"
```

**After:** *(delete entirely)*

> **Check first:** `grep -n "CheckCustomerRequest" backend/server.py` must return only lines 121 (model) and 492 (route). If any other line references it, stop and escalate.

---

### E6 · `server.py` lines 491–523 — delete `check_customer` route

**Before:**
```python
@auth_router.post("/check-customer")
async def check_customer(request: CheckCustomerRequest):
    """Check if customer exists for this restaurant - used for landing page capture flow"""
    phone = request.phone.strip()
    pos_id = request.pos_id or "0001"
    user_id = f"pos_{pos_id}_restaurant_{request.restaurant_id}"
    
    # Normalize phone - remove +91 prefix if present for matching
    normalized_phone = phone
    if phone.startswith('+91'):
        normalized_phone = phone[3:]  # Remove +91
    elif phone.startswith('91') and len(phone) > 10:
        normalized_phone = phone[2:]  # Remove 91
    
    # Check if customer exists for this restaurant (try both formats)
    customer = await db.customers.find_one({
        "$or": [
            {"phone": phone, "user_id": user_id},
            {"phone": normalized_phone, "user_id": user_id}
        ]
    }, {"_id": 0, "name": 1, "phone": 1, "id": 1, "password_hash": 1})
    
    if customer:
        return {
            "exists": True,
            "customer": {
                "name": customer.get("name", ""),
                "phone": customer.get("phone", ""),
                "has_password": bool(customer.get("password_hash"))
            }
        }
    
    return {"exists": False, "customer": None}
```

**After:** *(delete entirely)*

---

## Edit summary

| ID | File | What |
|---|---|---|
| E1 | `crmService.js` | Add `crmLookupCustomer` (~20 lines) after `crmSkipOtp` |
| E2 | `LandingPage.jsx` | Add `crmLookupCustomer` to crmService import |
| E3 | `LandingPage.jsx` | Replace Call Site 1 (debounced auto-lookup, lines 85–95) |
| E4 | `LandingPage.jsx` | Replace Call Site 2 (Browse Menu tap, lines 607–618) |
| E5 | `server.py` | Delete `CheckCustomerRequest` model (lines 121–124) |
| E6 | `server.py` | Delete `check_customer` route (lines 491–523) |

**Net: ~40 lines removed, ~25 lines added across 3 files.**

---

## Self-test checklist (Role 3 must complete before QA handover)

| ST | Test | How | Expected |
|---|---|---|---|
| ST1 | CheckCustomerRequest gone | `grep -n "CheckCustomerRequest" backend/server.py` | 0 results |
| ST2 | check-customer gone | `grep -n "check-customer\|check_customer" backend/server.py` | 0 results |
| ST3 | fetchWithTimeout check-customer gone | `grep -n "check-customer" frontend/src/pages/LandingPage.jsx` | 0 results |
| ST4 | Import present | `grep -n "crmLookupCustomer" frontend/src/pages/LandingPage.jsx` | line 19 import + 2 call sites |
| ST5 | Backend starts | `sudo supervisorctl status backend` after restart | RUNNING |
| ST6 | `curl POST /api/auth/check-customer` | curl after restart | 404 or 405 — route gone |
| ST7 | `yarn build` | `cd /app/frontend && yarn build` | Clean — 0 errors |

---

## Code markers

Every changed block must carry:
```javascript
// CR-2026-10-03-004 Part A: <brief reason>
```
```python
# CR-2026-10-03-004 Part A: <brief reason>
```

---

## QA test cases

| T | Scenario | Expected |
|---|---|---|
| T1 | Type known phone (9579504871) on restaurant 689 landing — wait 500ms | Name "MYGENieT" auto-fills. Network tab shows call to CRM `/scan/auth/lookup`, **not** to `/api/auth/check-customer` |
| T2 | Type unknown phone — wait 500ms | No name fill, no error toast |
| T3 | Tap Browse Menu with known phone (cached lookup) | Uses cached result, proceeds to skip-otp → menu |
| T4 | Tap Browse Menu with known phone (no cache) | Lookup fires, name populated, skip-otp → menu |
| T5 | Tap Browse Menu with no phone | Straight to menu (unchanged) |
| T6 | `curl -X POST $BACKEND_URL/api/auth/check-customer` | 404 or 405 |
| T7 | Backend smoke tests | All pass |
| T8 | `yarn build` | Clean |
| T9 | Full landing → skip-otp → menu flow | Unaffected |

---

```
Planning complete: CR-2026-10-03-004 Part A
Stage: Implementation Plan
Code reality: FULL — exact before/after with line numbers
Risk: CRITICAL
Files WILL change: crmService.js (E1) · LandingPage.jsx (E2–E4) · server.py (E5–E6)
Files WILL NOT touch: ReviewOrder.jsx · AuthContext.jsx · App.js
Decisions: D1=adapter · D2=delete
Docs: memory/change_requests/CR-2026-10-03-004-pre-login-lookups-to-crm-api/IMPLEMENTATION_PLAN.md
Next: "Gate 3 accepted for CR-2026-10-03-004" → Role 3 Implementation
```
