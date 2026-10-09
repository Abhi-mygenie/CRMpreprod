# IMPACT ANALYSIS — CR-2026-10-03-004 Part A
## `check-customer` → CRM `lookup` swap (LandingPage only)

**Written by:** Role 2 — Planning Agent  
**Date:** 2026-10-08  
**Based on:** INTAKE_DOC.md · LandingPage.jsx exact lines · crmService.js exact lines · server.py exact lines · CRM lookup live probe (this session)  
**Scope:** Part A only — LandingPage `check-customer` → `POST /scan/auth/lookup`. Parts B/C (ReviewOrder loyalty-rules + customer-lookup retirement) remain BLOCKED on CRM CR-094.

---

## 1. What Part A does

Replaces two direct-to-backend fetch calls in `LandingPage.jsx` (`POST /api/auth/check-customer`) with a new `crmLookupCustomer` function in `crmService.js` that calls `POST /scan/auth/lookup` directly on CRM. Deletes the backend route that reads `db.customers` directly.

---

## 2. Call sites — exact locations confirmed

### Call Site 1 — debounced auto-lookup (LandingPage.jsx lines 85–95)

Fires 500ms after the user stops typing a valid phone. Auto-fills the customer name if found.

```javascript
const res = await fetchWithTimeout(`${API_URL}/api/auth/check-customer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: capturedPhone,
    restaurant_id: String(restaurantId),
    pos_id: '0001',        // ← pos_id sent to backend; NOT needed by CRM lookup
  }),
});
const data = await res.json();
setCustomerLookup({ ...data, phone: capturedPhone });
if (data.exists && data.customer?.name) { ... }   // ← reads data.customer?.name
```

### Call Site 2 — Browse Menu tap (LandingPage.jsx lines 607–618)

Fires when user taps Browse Menu and phone is valid, and no cached lookup exists.

```javascript
const res = await fetchWithTimeout(`${API_URL}/api/auth/check-customer`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: capturedPhone,
    restaurant_id: String(restaurantId),
    pos_id: '0001',
  }),
});
data = await res.json();
// ... then:
if (data.exists) {
  const customerName = data.customer?.name || '';  // ← reads data.customer?.name
```

**Both call sites:** use `fetchWithTimeout` directly to our own backend, send `pos_id`, read `data.exists` and `data.customer?.name`.

---

## 3. Current backend endpoint (to be deleted)

`server.py` lines 491–523 — `POST /auth/check-customer`:

- Normalises phone (strips `+91` / `91` prefix)
- Queries `db.customers` (CRM's collection — shared DB, our read)
- Returns `{ exists: true, customer: { name, phone, has_password } }` or `{ exists: false, customer: None }`

The `has_password` field was previously used by `silentSkipOtpAndNavigate`'s 409 handler to populate the password-setup navigation state. After CR-2026-10-08-001 Step 1, the 409 handler no longer navigates to the password page — it degrades to guest mode. **`has_password` is no longer read anywhere.** Confirmed by grep.

---

## 4. CRM `lookup` response shape — confirmed live (2026-10-08 probe)

```
POST /scan/auth/lookup
{ "phone": "9579504871", "restaurant_id": "689" }

→ HTTP 200
{ "success": true, "message": "Found", "data": { "exists": true, "name": "MYGENieT" } }
```

After `crmFetch` envelope unwrap: **`{ exists: true, name: "MYGENieT" }`**

**Shape difference vs current backend:**

| Field | Our backend returns | CRM lookup returns | Impact |
|---|---|---|---|
| `exists` | `data.exists` | `data.exists` | ✅ same |
| `data.customer?.name` | `data.customer.name` | `data.name` (flat, no `customer` wrapper) | ❌ must adapt |
| `data.customer?.has_password` | `data.customer.has_password` | not present | ✅ no longer read (Step 1) |
| `pos_id` sent | required | **NOT accepted** | must drop from body |

**Adapter strategy:** normalise in `crmLookupCustomer` to return `{ exists, customer: { name } | null }`. LandingPage code then requires ZERO changes to how it reads the result — `data.exists` and `data.customer?.name` work identically to today.

---

## 5. New function — `crmLookupCustomer` in `crmService.js`

Pattern follows `crmSkipOtp`: uses `crmFetch` (handles CRM base URL), `stripPhonePrefix` (already defined in module), passes `restaurant_id` as short form string.

No auth header needed — confirmed live: lookup is a public endpoint (no `Authorization: Bearer` required).

```javascript
/**
 * CR-2026-10-03-004 Part A: Pre-login customer lookup via CRM.
 * Replaces POST /api/auth/check-customer (which reads db.customers directly).
 *
 * v2 path: POST /scan/auth/lookup — body { phone, restaurant_id }
 * Response normalised to { exists, customer: { name } | null } to match
 * the existing backend shape so LandingPage call sites are unchanged.
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

`stripPhonePrefix` is a module-private function already defined at line 272. The adapter wraps the flat `data.name` into `customer.name` so existing reads (`data.customer?.name`) need no change.

---

## 6. LandingPage.jsx changes — both call sites

Both call sites replace the `fetchWithTimeout(…/api/auth/check-customer…)` block with a single `crmLookupCustomer` call. The surrounding code (debounce logic, error handling, state setting, name auto-fill) is **unchanged**.

### Call Site 1 (lines 82–114) — before / after

**Remove:**
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

**Replace with:**
```javascript
        // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
        const data = await crmLookupCustomer(capturedPhone, restaurantId);
```

### Call Site 2 (lines 605–618) — before / after

**Remove:**
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

**Replace with:**
```javascript
          // CR-2026-10-03-004 Part A: CRM lookup replaces backend check-customer
          data = await crmLookupCustomer(capturedPhone, restaurantId);
```

---

## 7. Backend deletion — `server.py`

### Route to delete (lines 491–523):
```python
@auth_router.post("/check-customer")
async def check_customer(request: CheckCustomerRequest):
    ...
```

### Model to delete — `CheckCustomerRequest`:

Search for the model definition before deleting the route.

### Other consumers — confirmed none:
```bash
grep -rn "check-customer\|check_customer\|CheckCustomerRequest" frontend/src backend/ → only LandingPage + server.py
```

### Backend tests — must check:
Any smoke/contract test that calls `/api/auth/check-customer` must be updated to expect 404 (route deleted) or removed.

---

## 8. Phone normalisation — confirmed correct

`stripPhonePrefix` in `crmService.js` lines 272–281:
- `+919579504871` → `9579504871` ✅
- `919579504871` → `9579504871` ✅
- `9579504871` → `9579504871` ✅

CRM contract confirms: send 10-digit national digits only (no `+`, no `91`). `stripPhonePrefix` already does exactly this for Indian numbers. No change needed.

---

## 9. Files WILL change

| File | What changes |
|---|---|
| `frontend/src/api/services/crmService.js` | Add `crmLookupCustomer` function (~15 lines) |
| `frontend/src/pages/LandingPage.jsx` | Replace 2 `fetchWithTimeout` blocks with `crmLookupCustomer` calls; add import |
| `backend/server.py` | Delete `POST /auth/check-customer` route + `CheckCustomerRequest` model (D2 confirmed) |

---

## 10. Files WILL NOT touch — Part A

| File | Why |
|---|---|
| `ReviewOrder.jsx` | Part B/C scope — blocked on CR-094 |
| `AuthContext.jsx` | Not involved |
| `CartContext.js` | Not involved |
| `RestaurantConfigContext.jsx` | Not involved |
| `App.js` | Not involved |
| `backend/server.py` routes other than `check-customer` | Not involved |

---

## 11. Risk

| Area | Rating | Reason |
|---|---|---|
| Overall | **CRITICAL** | LandingPage.jsx is Part C hotspot; every diner sign-in path passes through this |
| `crmService.js` | MEDIUM | New function; `crmFetch` pattern already established |
| LandingPage.jsx — call site replacements | HIGH | Hotspot; 2 independent call sites must both be updated correctly |
| Backend deletion | HIGH | Irreversible; must confirm 0 other consumers before deleting |
| Phone normalisation | LOW | `stripPhonePrefix` already correct for +91 |
| `data.customer?.name` reads | LOW | Adapter handles shape difference; LandingPage reads unchanged |

No Fast Lane. Part C CRITICAL — owner approval required before Gate 3.

---

## 12. Owner decisions — confirm before Gate 3

| D | Question | Recommendation |
|---|---|---|
| D1 | Proceed with normalisation adapter in `crmLookupCustomer` (return `{ exists, customer: { name } }`) rather than updating LandingPage to read the new flat shape? | **Option A confirmed** — adapter wraps response; LandingPage reads unchanged |
| D2 | Delete `POST /api/auth/check-customer` from backend immediately, or deprecate it first? | **Delete confirmed** — 0 other consumers; direct DB read closed immediately |

---

## 13. Verification matrix

| T | Scenario | Expected |
|---|---|---|
| T1 | Type known phone on landing (restaurant 689) | Name auto-fills from CRM lookup — no backend call to `/api/auth/check-customer` (verify in network tab) |
| T2 | Type unknown phone | No name auto-fill, no error toast |
| T3 | Tap Browse Menu with known phone | Uses cached lookup if typed recently; proceeds to skip-otp and menu |
| T4 | Tap Browse Menu with no phone | Goes straight to menu (unchanged) |
| T5 | `curl /api/auth/check-customer` after deploy | 404 — route deleted |
| T6 | Backend pytest smoke + contract | All pass; no reference to `check-customer` |
| T7 | `yarn build` | Clean |
| T8 | Landing → skip-otp → menu (full flow) | Unaffected by this change |

---

## 14. Separately or together?

**Part A alone.** Reasons:

1. **CRITICAL risk file — just modified.** `LandingPage.jsx` was changed 2 days ago by Step 1. A fresh careful read and isolated change is safer.
2. **Backend deletion is irreversible.** Running it solo means if something is wrong, the rollback is clean.
3. **Part B still blocked** (CR-094 404) — nothing to combine with.
4. **CR-2026-10-07-002** also touches `server.py` for deletions. Running them together risks a conflict on that file. Better to run sequentially.

---

```
Planning complete: CR-2026-10-03-004 Part A
Stage: Impact Analysis
Code reality: FULL — 2 call sites confirmed, backend route confirmed, CRM shape confirmed live
Risk: CRITICAL
Files WILL change: crmService.js · LandingPage.jsx · backend/server.py
Files WILL NOT touch: ReviewOrder.jsx · AuthContext.jsx · CartContext.js · App.js
Owner decisions: D1 (adapter strategy) · D2 (delete vs deprecate backend route)
Docs: memory/change_requests/CR-2026-10-03-004-pre-login-lookups-to-crm-api/IMPACT_ANALYSIS.md
Next: confirm D1 + D2 → "Gate 2 accepted for CR-2026-10-03-004" → Implementation Plan
```
