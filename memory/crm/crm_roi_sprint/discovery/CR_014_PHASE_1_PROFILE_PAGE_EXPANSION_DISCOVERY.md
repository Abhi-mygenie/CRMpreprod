# CR-014 Phase 1 — Profile Page Expansion: Detailed Discovery

**Sprint**: ROI Measurement / CRM
**CR**: CR-014
**Phase**: 1 — Profile Page Expansion
**Status**: `cr014_phase_1_discovery_complete`
**Date**: 2026-06-05
**Prerequisite reads**: `discovery/CR_014_E_INVOICE_PDF_LINK_DISCOVERY.md` (§5, §15)
**Locked decisions**: C1=a (replace address), C2=a (allow blank)

---

## 1. Objective

Expand the Profile page with 9 new fields (tax, address, compliance) so restaurant owners can populate the data needed for invoice generation (Phase 2). All fields live on the `users` collection — no new collection. On first login the API returns existing data; missing values are filled by the owner from the Profile page.

---

## 2. Current State (evidence from code)

### 2.1 Backend: `PUT /api/auth/profile` (auth.py:198-206)

```python
allowed = {"phone", "address"}
filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
await db.users.update_one({"id": user["id"]}, {"$set": filtered})
# Returns: business_name, phone, address, email, pos_id, pos_name
```

**Issues**:
- Whitelist only allows `phone` and `address` — all new fields will be rejected
- Return payload is hardcoded to 6 fields — new fields won't come back
- No validation (regex) on any field
- No `GET /api/auth/profile` endpoint — frontend uses `GET /api/auth/me` instead

### 2.2 Backend: `GET /api/auth/me` (auth.py:186-196)

```python
return UserResponse(id, email, restaurant_name, phone, pos_id, pos_name, created_at)
```

**Issues**:
- `UserResponse` Pydantic model has `extra="ignore"` — all new DB fields are silently dropped
- Model only returns: `id, email, restaurant_name, phone, pos_id, pos_name, created_at`
- The new profile fields (gstin, address_line1, etc.) would never reach the frontend

### 2.3 Backend: `UserResponse` schema (schemas.py:187-195)

```python
class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    restaurant_name: str
    phone: str
    pos_id: str = ""
    pos_name: str = ""
    created_at: str
```

**Issue**: Missing all new fields. Needs expansion.

### 2.4 Frontend: `ProfilePage.jsx` (85 lines)

- State: `{ restaurant_name, phone, address }` — only 3 fields
- Reads from `user` context (which comes from `GET /api/auth/me` → `UserResponse`)
- Sends `PUT /api/auth/profile` with `{ phone, address }`
- Single "Address" text input, no sections, no validation

### 2.5 Frontend: `AuthContext.jsx`

- On login: stores `res.data.user` (which is `UserResponse`) → `setUser(res.data.user)`
- On reload: calls `GET /api/auth/me` → sets user
- The `user` object in context only has what `UserResponse` returns
- **Key gap**: new fields won't appear in `user` until `UserResponse` and `/me` are updated

### 2.6 DB: actual `users` doc for R689 (Kunafa Mahal)

```
brand_number: '917666859544'
created_at: '2026-05-25T04:01:01.329128+00:00'
email: 'owner@kunafamahal.com'
first_name: 'Owner'
id: 'pos_0001_restaurant_689'
phone: '7307097771'
pos_id: '0001'
pos_name: 'MyGenie'
restaurant_id: '689'
restaurant_name: 'Kunafa Mahal'
```

**No existing data** for: gstin, legal_name, state, address_line1, address_line2, city, pincode, fssai_license, pan. All will be empty on first load — owner fills them.

---

## 3. Fields to Add

### 3.1 Field spec (9 new fields)

| # | UI Label | DB Key | Type | Regex (if provided) | Required? | Section |
|---|---|---|---|---|---|---|
| 1 | GSTIN | `gstin` | string, 15 chars | `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$` | No (C2=a) | Tax & Compliance |
| 2 | Legal Business Name | `legal_name` | string, max 200 | — | No | Tax & Compliance |
| 3 | State | `state` | string (dropdown) | — | No (auto-derived from GSTIN) | Tax & Compliance |
| 4 | Address Line 1 | `address_line1` | string, max 200 | — | No | Address |
| 5 | Address Line 2 | `address_line2` | string, max 200 | — | No | Address |
| 6 | City | `city` | string, max 100 | — | No | Address |
| 7 | Pincode | `pincode` | string, 6 digits | `^[1-9][0-9]{5}$` | No | Address |
| 8 | FSSAI License # | `fssai_license` | string, 14 digits | `^[0-9]{14}$` | No | Compliance |
| 9 | PAN | `pan` | string, 10 chars | `^[A-Z]{5}[0-9]{4}[A-Z]$` | No | Compliance |

### 3.2 GSTIN → State auto-derivation

First 2 digits of a valid GSTIN map to an Indian state code:

```
01=Jammu & Kashmir, 02=Himachal Pradesh, 03=Punjab, 04=Chandigarh,
05=Uttarakhand, 06=Haryana, 07=Delhi, 08=Rajasthan, 09=Uttar Pradesh,
10=Bihar, 11=Sikkim, 12=Arunachal Pradesh, 13=Nagaland, 14=Manipur,
15=Mizoram, 16=Tripura, 17=Meghalaya, 18=Assam, 19=West Bengal,
20=Jharkhand, 21=Odisha, 22=Chhattisgarh, 23=Madhya Pradesh,
24=Gujarat, 25=Daman & Diu, 26=Dadra & Nagar Haveli, 27=Maharashtra,
28=Andhra Pradesh, 29=Karnataka, 30=Goa, 31=Lakshadweep,
32=Kerala, 33=Tamil Nadu, 34=Puducherry, 35=Andaman & Nicobar,
36=Telangana, 37=Andhra Pradesh (new), 38=Ladakh
```

When `gstin` changes on blur, if valid regex → auto-populate `state` dropdown.

---

## 4. Backend Changes Required

### 4.1 `PUT /api/auth/profile` (auth.py:198-206) — expand whitelist + add validation

**Current**:
```python
allowed = {"phone", "address"}
```

**New**:
```python
allowed = {
    "phone", "address",
    "gstin", "legal_name", "state",
    "address_line1", "address_line2", "city", "pincode",
    "fssai_license", "pan",
}
```

Add regex validation BEFORE the DB write:
```python
VALIDATORS = {
    "gstin": (r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", "Invalid GSTIN format"),
    "pincode": (r"^[1-9][0-9]{5}$", "Pincode must be 6 digits"),
    "fssai_license": (r"^[0-9]{14}$", "FSSAI license must be 14 digits"),
    "pan": (r"^[A-Z]{5}[0-9]{4}[A-Z]$", "Invalid PAN format"),
}
```

Only validate when the value is non-empty (C2=a allows blank).

**Also**: update the return payload to include all new fields.

### 4.2 `GET /api/auth/me` (auth.py:186-196) — return new fields

Option A: Expand `UserResponse` model with optional fields.
Option B: Return raw user doc (minus sensitive fields) instead of the Pydantic model.

**Recommendation**: Option A — add 9 optional fields to `UserResponse`. Keeps backward compat.

```python
class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    restaurant_name: str
    phone: str
    pos_id: str = ""
    pos_name: str = ""
    created_at: str
    # CR-014 Phase 1: profile expansion fields
    gstin: str = ""
    legal_name: str = ""
    state: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    pincode: str = ""
    fssai_license: str = ""
    pan: str = ""
    address: str = ""  # legacy field, kept for compat
```

**Also**: update the `return UserResponse(...)` call in `/me` to pass through the new fields from the user doc.

### 4.3 Login response (`mygenie_login`) — no change needed

Login returns `UserResponse` which will auto-include the new fields once the model is updated. The `user` doc is fetched from DB, so existing fields come through.

---

## 5. Frontend Changes Required

### 5.1 `ProfilePage.jsx` — full rewrite

**From**: 85-line single-card form with 6 fields (2 editable)
**To**: Sectioned form with 3 groups + 15 fields (11 editable)

**Layout**:
```
┌─ Business Profile (readonly header) ──────────────┐
│  Business Name    Email    POS ID / POS Name       │
│  Phone (editable)                                   │
├─ Tax & Compliance ─────────────────────────────────┤
│  GSTIN (→ auto-fills State)                        │
│  Legal Business Name                               │
│  State (dropdown)                                  │
├─ Address ──────────────────────────────────────────┤
│  Address Line 1                                    │
│  Address Line 2                                    │
│  City          Pincode                             │
├─ Additional Compliance ────────────────────────────┤
│  FSSAI License #       PAN                         │
├────────────────────────────────────────────────────┤
│  [Save Profile]                                    │
└────────────────────────────────────────────────────┘
```

**State management**:
```js
const [profile, setProfile] = useState({
    phone: "",
    gstin: "", legal_name: "", state: "",
    address_line1: "", address_line2: "", city: "", pincode: "",
    fssai_license: "", pan: "",
});
```

Initialized from `user` context (which now carries these fields from `/me`).

**Validation**:
- Client-side regex on blur for GSTIN, Pincode, FSSAI, PAN
- Show inline error message (red text below field) when format is wrong
- Save button NOT blocked by empty fields (C2=a)
- Save button blocked only if a field HAS a value but it's malformed

**GSTIN auto-derive**:
- On GSTIN field blur, if valid regex → look up state from first 2 digits → auto-set State dropdown
- State dropdown still manually editable (override allowed)

### 5.2 `AuthContext.jsx` — no change needed

Already calls `/api/auth/me` and sets `user` from response. Once `UserResponse` includes new fields, they'll appear in `user` automatically.

---

## 6. File-by-file change summary

| # | File | Action | What changes |
|---|---|---|---|
| B1 | `backend/models/schemas.py` | Edit | Add 10 optional fields to `UserResponse` |
| B2 | `backend/routers/auth.py` | Edit | Expand `/profile` whitelist (9 new keys), add regex validators, update return payload, update `/me` to pass new fields |
| F1 | `frontend/src/pages/ProfilePage.jsx` | Rewrite | Sectioned form, 9 new fields, client validation, GSTIN→State auto-fill |

**3 files total. No new files. No new collections. No new routes.**

---

## 7. Acceptance Criteria

| # | Criterion | Validation |
|---|---|---|
| AC-1 | `GET /api/auth/me` returns all 9 new fields (empty strings for unset) | curl |
| AC-2 | `PUT /api/auth/profile` accepts and persists all 9 new fields | curl |
| AC-3 | `PUT /api/auth/profile` rejects malformed GSTIN with 400 | curl |
| AC-4 | `PUT /api/auth/profile` rejects malformed Pincode with 400 | curl |
| AC-5 | `PUT /api/auth/profile` rejects malformed FSSAI with 400 | curl |
| AC-6 | `PUT /api/auth/profile` rejects malformed PAN with 400 | curl |
| AC-7 | `PUT /api/auth/profile` accepts empty GSTIN/FSSAI/PAN (C2=a) | curl |
| AC-8 | Profile page renders 3 sections: Tax & Compliance, Address, Compliance | screenshot |
| AC-9 | GSTIN input auto-fills State dropdown on blur | screenshot |
| AC-10 | Client-side validation shows inline errors for malformed values | screenshot |
| AC-11 | Save persists data; page reload shows saved values | screenshot + curl |
| AC-12 | Old `address` field removed from UI (C1=a); replaced by 4-field split | screenshot |

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| Frontend `user` object doesn't carry new fields after login | `UserResponse` model expansion + `/me` update handles this |
| Old address field data lost | All 14 tenants have empty `address` — no data loss |
| GSTIN regex too strict (edge cases) | Standard GST regex, widely used; can relax later |
| `extra="ignore"` on UserResponse drops unknown fields | Explicitly add all fields to the model |

---

## 9. Effort estimate

| Component | Effort |
|---|---|
| B1: Schema update (UserResponse) | 15 min |
| B2: auth.py whitelist + validation + return | 30 min |
| F1: ProfilePage.jsx rewrite | 1.5 hours |
| Curl verification | 15 min |
| Screenshot verification | 15 min |
| **Total** | **~2.5 hours** |

---

**End of Phase 1 Discovery. Ready for implementation on owner go-ahead.**
