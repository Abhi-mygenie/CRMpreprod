# CR-014 Phase 1 — Profile Page Expansion: Planning Doc

**Sprint**: ROI Measurement / CRM
**CR**: CR-014, Phase 1
**Status**: `cr014_phase_1_planning_complete`
**Date**: 2026-06-05
**Prerequisite reads**: `discovery/CR_014_PHASE_1_PROFILE_PAGE_EXPANSION_DISCOVERY.md`
**Locked decisions**: C1=a, C2=a, return all fields, Indian 36 only, re-fetch /me after save, remove legacy address

---

## 0. Owner Answers (locked 2026-06-05)

| # | Answer |
|---|---|
| C1 | **a** — Replace single-line `address` with 4-field split (Line1/Line2/City/Pincode) |
| C2 | **a** — Allow blank GSTIN/FSSAI/PAN. No blocking validation. |
| PUT response | Return ALL fields including new 9 |
| Sections | 3 grouped sections: Tax & Compliance, Address, Additional Compliance |
| State dropdown | Indian 36 only (28 states + 8 UTs) |
| After save | Re-fetch `/auth/me` to update context immediately |
| Legacy `address` | Remove from whitelist — clean break (only used in auth.py + ProfilePage.jsx, empty for all 19 tenants) |

---

## 1. Trace of Legacy `address` Field (proof of safe removal)

The `address` field on the `users` collection (restaurant profile) is referenced in **exactly 3 places**:

| File | Line | Reference | What it does |
|---|---|---|---|
| `backend/routers/auth.py` | 200 | `allowed = {"phone", "address"}` | PUT whitelist — accepts address saves |
| `backend/routers/auth.py` | 206 | `updated.get("address", "")` | PUT response — returns address |
| `frontend/src/pages/ProfilePage.jsx` | 13,17,73 | `profile.address` | Form state + input field |

**All other `address` references** in the codebase (`customers.py:254-256,346,649-650,1261-1262`, `pos.py:99,185,307-308,763-764,1777-1778,2422,2451`, `scan.py:602,627`, `CustomersPage.jsx`, `CustomerDetailPage.jsx`) are **customer addresses on the `customers` collection** — completely separate from restaurant profile.

**DB state**: All 19 tenants have `address: ""` (empty). Zero data loss.

---

## 2. Data Flow Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │              MongoDB users doc               │
                    │                                             │
                    │  existing:  restaurant_name, email, phone,  │
                    │             pos_id, pos_name, ...           │
                    │                                             │
                    │  NEW:       gstin, legal_name, state,       │
                    │             address_line1, address_line2,   │
                    │             city, pincode,                  │
                    │             fssai_license, pan              │
                    │                                             │
                    │  REMOVED:   address (from whitelist only;   │
                    │             field stays in DB untouched)    │
                    └──────────┬──────────────┬───────────────────┘
                               │              │
                    ┌──────────▼──────┐  ┌────▼─────────────┐
                    │ GET /api/auth/me│  │PUT /api/auth/    │
                    │                 │  │    profile        │
                    │ Returns:        │  │                   │
                    │  UserResponse   │  │ Accepts:          │
                    │  (+ 9 new       │  │  phone + 9 new   │
                    │   optional      │  │  fields           │
                    │   fields)       │  │                   │
                    │                 │  │ Validates:        │
                    │                 │  │  gstin, pincode,  │
                    │                 │  │  fssai, pan regex │
                    │                 │  │  (only if non-    │
                    │                 │  │   empty)          │
                    │                 │  │                   │
                    │                 │  │ Returns:          │
                    │                 │  │  all fields       │
                    └──────────┬──────┘  └────┬─────────────┘
                               │              │
                    ┌──────────▼──────────────▼───────────────┐
                    │          AuthContext.jsx                 │
                    │                                         │
                    │  On login:  setUser(res.data.user)      │
                    │  On reload: GET /me → setUser(res.data) │
                    │  After save: re-fetch /me → setUser()   │
                    │                                         │
                    │  user.gstin, user.legal_name, etc.      │
                    │  now available throughout app            │
                    └──────────┬──────────────────────────────┘
                               │
                    ┌──────────▼──────────────────────────────┐
                    │          ProfilePage.jsx                 │
                    │                                         │
                    │  Reads: user.* → populates form         │
                    │  Edits: phone + 9 new fields            │
                    │  Saves: PUT /auth/profile                │
                    │  After save: re-fetches /me              │
                    └─────────────────────────────────────────┘
```

---

## 3. File-by-File Change Plan

### 3.1 FILE B1: `backend/models/schemas.py` (lines 187-195)

**Action**: Edit `UserResponse` class — add 10 optional string fields.

**Current** (line 187-195):
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

**New**:
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
    # CR-014 Phase 1: profile expansion fields (invoice branding + tax)
    gstin: str = ""
    legal_name: str = ""
    state: str = ""
    address_line1: str = ""
    address_line2: str = ""
    city: str = ""
    pincode: str = ""
    fssai_license: str = ""
    pan: str = ""
```

**Why**: `extra="ignore"` drops any field not declared. Without these, `/me` and login silently strip the new fields even though they exist in the DB doc.

**Impact on other code using UserResponse**:
- `auth.py:168-175` (register) — no impact, new fields default to ""
- `auth.py:188-196` (GET /me) — NEEDS EDIT (see B2 §3.2.1)
- `auth.py:349-361` (login existing user) — no impact, new fields default to ""
- `auth.py:397-409` (login new user) — no impact, new fields default to ""
- `auth.py:622-630` (forgot password reset) — no impact

---

### 3.2 FILE B2: `backend/routers/auth.py`

#### 3.2.1 `GET /api/auth/me` (line 186-196) — pass new fields from DB doc

**Current** (line 186-196):
```python
@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        restaurant_name=user["restaurant_name"],
        phone=user["phone"],
        pos_id=user.get("pos_id", ""),
        pos_name=user.get("pos_name", ""),
        created_at=user["created_at"]
    )
```

**New**:
```python
@router.get("/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        restaurant_name=user["restaurant_name"],
        phone=user["phone"],
        pos_id=user.get("pos_id", ""),
        pos_name=user.get("pos_name", ""),
        created_at=user["created_at"],
        # CR-014 Phase 1: profile expansion fields
        gstin=user.get("gstin", ""),
        legal_name=user.get("legal_name", ""),
        state=user.get("state", ""),
        address_line1=user.get("address_line1", ""),
        address_line2=user.get("address_line2", ""),
        city=user.get("city", ""),
        pincode=user.get("pincode", ""),
        fssai_license=user.get("fssai_license", ""),
        pan=user.get("pan", ""),
    )
```

**Mapping**: each `user.get("field", "")` reads from the MongoDB `users` doc. If the field doesn't exist yet (first time), returns "". After owner saves from Profile page, the field is populated.

---

#### 3.2.2 `PUT /api/auth/profile` (line 198-206) — expand whitelist, add validation, update response

**Current** (line 198-206):
```python
@router.put("/profile")
async def update_profile(updates: dict, user: dict = Depends(get_current_user)):
    allowed = {"phone", "address"}
    filtered = {k: v for k, v in updates.items() if k in allowed and v is not None}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    await db.users.update_one({"id": user["id"]}, {"$set": filtered})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {"business_name": updated.get("restaurant_name", ""), "phone": updated.get("phone", ""), "address": updated.get("address", ""), "email": updated.get("email", ""), "pos_id": updated.get("pos_id", ""), "pos_name": updated.get("restaurant_name", "")}
```

**New**:
```python
import re

# CR-014 Phase 1: regex validators (only applied when value is non-empty)
_PROFILE_VALIDATORS = {
    "gstin": (re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"), "Invalid GSTIN format (expected 15-char alphanumeric, e.g. 29ABCDE1234F1Z5)"),
    "pincode": (re.compile(r"^[1-9][0-9]{5}$"), "Pincode must be 6 digits (e.g. 560001)"),
    "fssai_license": (re.compile(r"^[0-9]{14}$"), "FSSAI license must be 14 digits"),
    "pan": (re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$"), "Invalid PAN format (e.g. ABCDE1234F)"),
}

@router.put("/profile")
async def update_profile(updates: dict, user: dict = Depends(get_current_user)):
    allowed = {
        "phone",
        "gstin", "legal_name", "state",
        "address_line1", "address_line2", "city", "pincode",
        "fssai_license", "pan",
    }
    filtered = {k: v for k, v in updates.items() if k in allowed}
    # Allow empty string values (C2=a: blank is OK, clears the field)
    filtered = {k: (v if v is not None else "") for k, v in filtered.items()}
    if not filtered:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    # Validate regex fields (only when non-empty)
    for field_key, (regex, error_msg) in _PROFILE_VALIDATORS.items():
        value = filtered.get(field_key, "")
        if value and not regex.match(value):
            raise HTTPException(status_code=400, detail=f"{field_key}: {error_msg}")

    await db.users.update_one({"id": user["id"]}, {"$set": filtered})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return {
        "business_name": updated.get("restaurant_name", ""),
        "email": updated.get("email", ""),
        "phone": updated.get("phone", ""),
        "pos_id": updated.get("pos_id", ""),
        "pos_name": updated.get("restaurant_name", ""),
        # CR-014 Phase 1: new fields
        "gstin": updated.get("gstin", ""),
        "legal_name": updated.get("legal_name", ""),
        "state": updated.get("state", ""),
        "address_line1": updated.get("address_line1", ""),
        "address_line2": updated.get("address_line2", ""),
        "city": updated.get("city", ""),
        "pincode": updated.get("pincode", ""),
        "fssai_license": updated.get("fssai_license", ""),
        "pan": updated.get("pan", ""),
    }
```

**Key changes**:
1. `allowed` set: `address` REMOVED, 9 new keys ADDED
2. `v is not None` filter changed to allow empty strings (so owner can clear a field)
3. Regex validation block added — only validates non-empty values
4. Response payload expanded to include all 9 new fields
5. `import re` added at top of file

---

### 3.3 FILE F1: `frontend/src/pages/ProfilePage.jsx` — full rewrite

**Current**: 85 lines, single card, 6 fields (2 editable: phone, address)

**New**: ~220 lines, 3 sections, 15 fields (11 editable)

#### 3.3.1 State shape

```js
const [profile, setProfile] = useState({
    phone: "",
    gstin: "", legal_name: "", state: "",
    address_line1: "", address_line2: "", city: "", pincode: "",
    fssai_license: "", pan: "",
});
const [errors, setErrors] = useState({});   // { gstin: "Invalid format", ... }
const [savingProfile, setSavingProfile] = useState(false);
```

#### 3.3.2 Initialization from user context

```js
useEffect(() => {
    if (!user) return;
    setProfile({
        phone: user.phone || "",
        gstin: user.gstin || "",
        legal_name: user.legal_name || "",
        state: user.state || "",
        address_line1: user.address_line1 || "",
        address_line2: user.address_line2 || "",
        city: user.city || "",
        pincode: user.pincode || "",
        fssai_license: user.fssai_license || "",
        pan: user.pan || "",
    });
}, [user]);
```

**Mapping**: each `user.X` field comes from `GET /api/auth/me` → `UserResponse.X`.

#### 3.3.3 GSTIN → State auto-derivation

```js
const GSTIN_STATE_MAP = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
    "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
    "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
    "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
    "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "25": "Daman & Diu", "26": "Dadra & Nagar Haveli & Daman & Diu",
    "27": "Maharashtra", "28": "Andhra Pradesh (old)",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
    "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
    "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh", "38": "Ladakh",
};

const INDIAN_STATES = Object.values(GSTIN_STATE_MAP); // for dropdown
```

On GSTIN field `onBlur`:
```js
const handleGstinBlur = () => {
    const gstin = profile.gstin.trim().toUpperCase();
    // Validate format
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
        setErrors(e => ({...e, gstin: "Invalid GSTIN format"}));
        return;
    }
    setErrors(e => ({...e, gstin: undefined}));
    // Auto-derive state
    if (gstin.length >= 2) {
        const stateCode = gstin.substring(0, 2);
        const stateName = GSTIN_STATE_MAP[stateCode];
        if (stateName) {
            setProfile(p => ({...p, state: stateName, gstin}));
            return;
        }
    }
    setProfile(p => ({...p, gstin}));
};
```

#### 3.3.4 Client-side validators (on blur)

| Field | Regex | Error message |
|---|---|---|
| `gstin` | `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$` | "Invalid GSTIN format" |
| `pincode` | `^[1-9][0-9]{5}$` | "Pincode must be 6 digits" |
| `fssai_license` | `^[0-9]{14}$` | "FSSAI must be 14 digits" |
| `pan` | `^[A-Z]{5}[0-9]{4}[A-Z]$` | "Invalid PAN format" |

Validation runs on blur. Empty values are always valid (C2=a). Error shown as red text below the field.

#### 3.3.5 Save handler

```js
const handleSaveProfile = async () => {
    // Client-side validation check
    const validationErrors = {};
    if (profile.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(profile.gstin.toUpperCase()))
        validationErrors.gstin = "Invalid GSTIN format";
    if (profile.pincode && !/^[1-9][0-9]{5}$/.test(profile.pincode))
        validationErrors.pincode = "Must be 6 digits";
    if (profile.fssai_license && !/^[0-9]{14}$/.test(profile.fssai_license))
        validationErrors.fssai_license = "Must be 14 digits";
    if (profile.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(profile.pan.toUpperCase()))
        validationErrors.pan = "Invalid PAN format";

    if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        toast.error("Please fix validation errors before saving");
        return;
    }

    setSavingProfile(true);
    try {
        // Uppercase GSTIN and PAN before sending
        const payload = {
            ...profile,
            gstin: profile.gstin.toUpperCase(),
            pan: profile.pan.toUpperCase(),
        };
        await api.put("/auth/profile", payload);
        // Re-fetch /me to update context
        const meRes = await api.get("/auth/me");
        // Update user in AuthContext (need setUser exposed — see §3.4)
        // For now: force page context refresh
        toast.success("Profile updated!");
    } catch (err) {
        const detail = err.response?.data?.detail || "Failed to update profile";
        toast.error(detail);
    } finally {
        setSavingProfile(false);
    }
};
```

#### 3.3.6 Re-fetch /me after save — AuthContext integration

**Current AuthContext** exposes: `{ user, token, api, login, register, logout, loading, setUserAndToken }`

**Approach**: After save, call `api.get("/auth/me")` and use `setUserAndToken` or add a new `refreshUser` function.

**Simplest approach** (no AuthContext change): call `api.get("/auth/me")` → update `user` state directly.

But ProfilePage doesn't have `setUser` — it only has `user` (read) and `api`. We need a `refreshUser` method.

**Option**: Add `refreshUser` to AuthContext:
```js
const refreshUser = async () => {
    try {
        const res = await api.get("/auth/me");
        setUser(res.data);
    } catch {}
};
```

Then ProfilePage calls `refreshUser()` after save.

#### 3.3.7 Layout spec (sections + fields → exact mapping)

```
┌─ Card: Business Profile ──────────────────────────────────────────────┐
│  [User icon] Business Profile / Manage your business details          │
│                                                                       │
│  ┌─ Readonly section ──────────────────────────────────────────────┐  │
│  │  Business Name     [user.restaurant_name]     DISABLED          │  │
│  │  Email             [user.email]               DISABLED          │  │
│  │  POS ID            [user.pos_id]     POS Name [user.pos_name]  │  │
│  │  Phone             [profile.phone]            EDITABLE          │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Section: Tax & Compliance ─────────────────────────────────────┐  │
│  │  GSTIN             [profile.gstin]            EDITABLE          │  │
│  │                    → onBlur: validate regex + auto-fill state   │  │
│  │                    → error: "Invalid GSTIN format"              │  │
│  │  Legal Business    [profile.legal_name]       EDITABLE          │  │
│  │  Name                                                           │  │
│  │  State             [profile.state]            DROPDOWN (36)     │  │
│  │                    → populated from GSTIN or manual selection   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Section: Address ──────────────────────────────────────────────┐  │
│  │  Address Line 1    [profile.address_line1]    EDITABLE          │  │
│  │  Address Line 2    [profile.address_line2]    EDITABLE          │  │
│  │  City              [profile.city]    Pincode [profile.pincode]  │  │
│  │                                      → onBlur: validate regex  │  │
│  │                                      → error: "Must be 6 digits│  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌─ Section: Additional Compliance ────────────────────────────────┐  │
│  │  FSSAI License #   [profile.fssai_license]    EDITABLE          │  │
│  │                    → onBlur: validate regex                     │  │
│  │  PAN               [profile.pan]              EDITABLE          │  │
│  │                    → onBlur: validate regex                     │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  [━━━━━━━━━━━━━━━━ Save Profile ━━━━━━━━━━━━━━━━]                    │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

#### 3.3.8 Field → API → DB → response mapping table

| UI Label | Form key | PUT payload key | DB field on `users` | GET /me response key | Validation |
|---|---|---|---|---|---|
| Phone | `profile.phone` | `phone` | `phone` | `user.phone` | none |
| GSTIN | `profile.gstin` | `gstin` | `gstin` | `user.gstin` | regex (if non-empty) |
| Legal Business Name | `profile.legal_name` | `legal_name` | `legal_name` | `user.legal_name` | none |
| State | `profile.state` | `state` | `state` | `user.state` | dropdown (36 values) |
| Address Line 1 | `profile.address_line1` | `address_line1` | `address_line1` | `user.address_line1` | none |
| Address Line 2 | `profile.address_line2` | `address_line2` | `address_line2` | `user.address_line2` | none |
| City | `profile.city` | `city` | `city` | `user.city` | none |
| Pincode | `profile.pincode` | `pincode` | `pincode` | `user.pincode` | regex (if non-empty) |
| FSSAI License # | `profile.fssai_license` | `fssai_license` | `fssai_license` | `user.fssai_license` | regex (if non-empty) |
| PAN | `profile.pan` | `pan` | `pan` | `user.pan` | regex (if non-empty) |

#### 3.3.9 data-testid assignments

| Element | data-testid |
|---|---|
| Page title | `profile-title` (existing) |
| Card container | `profile-card` (existing) |
| Phone input | `profile-phone-input` (existing) |
| GSTIN input | `profile-gstin-input` |
| GSTIN error | `profile-gstin-error` |
| Legal Name input | `profile-legal-name-input` |
| State dropdown | `profile-state-select` |
| Address Line 1 input | `profile-address-line1-input` |
| Address Line 2 input | `profile-address-line2-input` |
| City input | `profile-city-input` |
| Pincode input | `profile-pincode-input` |
| Pincode error | `profile-pincode-error` |
| FSSAI input | `profile-fssai-input` |
| FSSAI error | `profile-fssai-error` |
| PAN input | `profile-pan-input` |
| PAN error | `profile-pan-error` |
| Save button | `save-profile-btn` (existing) |
| Tax section header | `profile-section-tax` |
| Address section header | `profile-section-address` |
| Compliance section header | `profile-section-compliance` |

---

### 3.4 FILE F2: `frontend/src/contexts/AuthContext.jsx` — add refreshUser

**Current exports**: `{ user, token, api, login, register, logout, loading, setUserAndToken }`

**Add** `refreshUser`:
```js
const refreshUser = async () => {
    try {
        const res = await api.get("/auth/me");
        setUser(res.data);
    } catch {}
};
```

**Expose in Provider**: add `refreshUser` to the value object.

**Impact**: ProfilePage calls `refreshUser()` after successful save. No other component affected (additive change).

---

## 4. Implementation Sequence

| Step | File | What | Validation |
|---|---|---|---|
| 1 | `backend/models/schemas.py` | Add 9 optional fields to `UserResponse` | lint |
| 2 | `backend/routers/auth.py` | Update `GET /me` to pass 9 new fields from user doc | curl: `GET /api/auth/me` returns 9 new fields (all "") |
| 3 | `backend/routers/auth.py` | Expand `PUT /profile` whitelist, add regex validators, update response | curl: save gstin → persists; save bad gstin → 400 |
| 4 | `frontend/src/contexts/AuthContext.jsx` | Add `refreshUser` method | — |
| 5 | `frontend/src/pages/ProfilePage.jsx` | Full rewrite with 3 sections, 10 editable fields, validation, GSTIN→State | screenshot: page renders correctly |
| 6 | Verify full round-trip | Save profile → reload → values persist | curl + screenshot |

---

## 5. Acceptance Criteria

| # | Criterion | Method |
|---|---|---|
| AC-1 | `GET /api/auth/me` returns all 9 new fields (empty strings for unset) | curl |
| AC-2 | `PUT /api/auth/profile` accepts and persists all 9 new fields | curl |
| AC-3 | `PUT /api/auth/profile` rejects malformed GSTIN with 400 + clear error | curl |
| AC-4 | `PUT /api/auth/profile` rejects malformed Pincode with 400 | curl |
| AC-5 | `PUT /api/auth/profile` rejects malformed FSSAI with 400 | curl |
| AC-6 | `PUT /api/auth/profile` rejects malformed PAN with 400 | curl |
| AC-7 | `PUT /api/auth/profile` accepts empty GSTIN/FSSAI/PAN without error (C2=a) | curl |
| AC-8 | `PUT /api/auth/profile` response includes all 9 new fields | curl |
| AC-9 | Legacy `address` field rejected by PUT (removed from whitelist) | curl |
| AC-10 | Profile page renders 3 sections: Tax & Compliance, Address, Additional Compliance | screenshot |
| AC-11 | GSTIN input auto-fills State dropdown on blur (valid GSTIN) | screenshot |
| AC-12 | Client-side validation shows inline red error for malformed values | screenshot |
| AC-13 | Save persists data; page reload shows saved values (re-fetch /me) | screenshot |
| AC-14 | State dropdown contains exactly 36 Indian states/UTs (no "Other") | screenshot |
| AC-15 | Old single "Address" field removed from UI | screenshot |

---

## 6. Files Changed Summary

| # | File | Action | Lines affected |
|---|---|---|---|
| B1 | `backend/models/schemas.py` | Edit | ~187-195 (+9 lines) |
| B2 | `backend/routers/auth.py` | Edit | ~186-206 (expand /me + rewrite /profile) |
| F1 | `frontend/src/pages/ProfilePage.jsx` | Rewrite | Full file (85 → ~220 lines) |
| F2 | `frontend/src/contexts/AuthContext.jsx` | Edit | +5 lines (refreshUser method) |

**4 files. No new files. No new collections. No new routes.**

---

**End of Phase 1 Planning Doc. Ready for implementation on owner go-ahead.**
