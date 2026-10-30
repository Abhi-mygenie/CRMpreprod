# CR-119 — Implementation Plan: `skip-otp` accept `name` ("Set name at first login")
**Date**: 2026-10-11 · **Role**: Planning Agent · **Risk**: LOW · **No code changed. No data written.**
**Impact Analysis**: `planning/CR_119_IMPACT_ANALYSIS.md`

---

## 1. Scope lock

**File that WILL change:** `routers/scan.py` — 3 targeted edits, ~5 lines total.

**Everything else is out of scope.** If any edit requires touching a second file, stop and raise to owner.

---

## 2. Pre-implementation checklist

- [ ] Confirm backend is running and `/api/health` returns 200
- [ ] Confirm `backend/.env` points at **preprod** (`52.66.232.149:27017/mygenie`)
- [ ] Read `routers/scan.py` lines 163–235 before making any edit (code is truth)
- [ ] Have `tests/test_cr089_skip_otp.py`, `tests/test_cr093_lookup.py`, `tests/test_cr084_cr097.py`, `tests/test_cr085a_normalization.py` ready to run after edits

---

## 3. Edits — in order

### Edit 1 — `SkipOTPRequest` model: add `name` field

**File:** `routers/scan.py`
**Location:** lines 163–167 (the `SkipOTPRequest` class)

**Before:**
```python
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"  # CR-102: mirror LookupRequest (Customer App sends it)
```

**After:**
```python
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"  # CR-102: mirror LookupRequest (Customer App sends it)
    name: Optional[str] = None           # CR-119: Customer App sends name at Browse-Menu login
```

**Why:** Declares the field so Pydantic accepts it instead of silently dropping it. Default `None` preserves full backward compatibility — callers that don't send `name` are unaffected.

---

### Edit 2 — new-customer create block: store name with blank guard

**File:** `routers/scan.py`
**Location:** line 205 inside the `if not customer:` block

**Before:**
```python
        customer_doc = {
            "id": customer_id,
            "user_id": full_restaurant_id,
            "name": "",
            "phone": phone,
```

**After:**
```python
        customer_doc = {
            "id": customer_id,
            "user_id": full_restaurant_id,
            "name": req.name.strip() if req.name and req.name.strip() else "",  # CR-119
            "phone": phone,
```

**Why:**
- `req.name.strip()` — removes accidental leading/trailing whitespace
- `if req.name and req.name.strip()` — guards against `None`, `""`, or whitespace-only strings; all fall through to `""` (same as before)
- Existing customers are **not touched** — this block only runs for new customers

---

### Edit 3 — response: include `name` passthrough

**File:** `routers/scan.py`
**Location:** lines 230–235 (the final `return _resp(...)`)

**Before:**
```python
    token = create_customer_token(customer_id, full_restaurant_id, phone)
    return _resp(True, "Login successful", {
        "token": token,
        "customer_id": customer_id,
        "is_new_customer": is_new,
        "phone": req.phone
    })
```

**After:**
```python
    token = create_customer_token(customer_id, full_restaurant_id, phone)
    # CR-119: return name so Customer App confirms what was stored without a GET /scan/auth/me call.
    # New customer: name we just stored. Existing customer: name already fetched at line 196.
    stored_name = (req.name.strip() if req.name and req.name.strip() else "") if is_new else customer.get("name", "")
    return _resp(True, "Login successful", {
        "token": token,
        "customer_id": customer_id,
        "is_new_customer": is_new,
        "phone": req.phone,
        "name": stored_name
    })
```

**Why:**
- New customer: mirrors exactly what Edit 2 stored — no extra DB call
- Existing customer: `customer["name"]` was already fetched by the `find_one` at line 194–197 (projection `{"_id": 0, "id": 1, "name": 1}`) — no extra DB call
- Additive response field — existing callers that don't read it are unaffected

---

## 4. Self-test sequence (run after all 3 edits)

Run in order. Each test is a curl against the preprod preview URL.

```bash
API_URL=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d '=' -f2)

# T1 — new customer with name
PHONE="9$(shuf -i 100000000-999999999 -n1)"   # random valid phone
R=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"restaurant_id\":\"689\",\"name\":\"Alok Test\"}")
echo "T1 response: $R"
# Expected: success:true, is_new_customer:true, name:"Alok Test"

# T2 — existing customer: name must NOT be overwritten
R2=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE\",\"restaurant_id\":\"689\",\"name\":\"Should Not Overwrite\"}")
echo "T2 response: $R2"
# Expected: success:true, is_new_customer:false, name:"Alok Test" (original, not overwritten)

# T3 — blank guard: whitespace-only name
PHONE2="9$(shuf -i 100000000-999999999 -n1)"
R3=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE2\",\"restaurant_id\":\"689\",\"name\":\"   \"}")
echo "T3 response: $R3"
# Expected: success:true, is_new_customer:true, name:""

# T4 — backward compat: no name field
PHONE3="9$(shuf -i 100000000-999999999 -n1)"
R4=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE3\",\"restaurant_id\":\"689\"}")
echo "T4 response: $R4"
# Expected: success:true, is_new_customer:true, name:"" (no 422, backward compatible)

# T5 — explicit empty string
PHONE4="9$(shuf -i 100000000-999999999 -n1)"
R5=$(curl -s -X POST "$API_URL/api/scan/auth/skip-otp" \
  -H "Content-Type: application/json" \
  -d "{\"phone\":\"$PHONE4\",\"restaurant_id\":\"689\",\"name\":\"\"}")
echo "T5 response: $R5"
# Expected: success:true, is_new_customer:true, name:""
```

**Pytest regression (run after self-test T1–T5 pass):**
```bash
cd /app/backend
pytest tests/test_cr089_skip_otp.py tests/test_cr093_lookup.py \
       tests/test_cr084_cr097.py tests/test_cr085a_normalization.py \
       -v 2>&1 | tail -20
```
Expected: 100% PASS — no existing test should break (all are phone/rate-limit focused; none assert on `name` field absence).

---

## 5. Verification matrix

| V# | Input | Expected DB state | Expected response |
|---|---|---|---|
| V1 | New phone + `name:"Alok"` | `customers.name = "Alok"` | `success:true, is_new:true, name:"Alok"` |
| V2 | Existing phone + `name:"X"` | `customers.name` unchanged | `success:true, is_new:false, name:<original>` |
| V3 | New phone + `name:"  "` | `customers.name = ""` | `name:""` |
| V4 | New phone, no `name` key | `customers.name = ""` | `name:""`, no 422 |
| V5 | New phone + `name:""` | `customers.name = ""` | `name:""` |
| V6 | `test_cr089_skip_otp.py` suite | — | 100% PASS |
| V7 | `test_cr093_lookup.py` suite | — | 100% PASS |
| V8 | `test_cr084_cr097.py` suite | — | 100% PASS |
| V8 | `test_cr085a_normalization.py` suite | — | 100% PASS |

---

## 6. QA handover criteria

Implementation is ready for QA when:
- [ ] All 5 self-test curls pass
- [ ] All 4 pytest suites pass with 0 failures
- [ ] DB spot-check: `db.customers.find_one({name:"Alok Test"})` returns the T1 customer
- [ ] Code markers `# CR-119` present on all 3 edit lines

---

## 7. Rollback

If any test fails: revert the 3 edits in `scan.py`. No DB migration was performed — all existing customer documents with `name:""` are unaffected. No rollback of data is needed.

---

## 8. Files changed / not changed (final declaration)

**WILL change:**
- `routers/scan.py` — Edit 1 (line ~166), Edit 2 (line ~205), Edit 3 (lines ~229–235)

**WILL NOT change:**
- `models/schemas.py`, `core/auth.py`, `core/phone.py`, `core/database.py`
- `routers/pos.py`, `routers/customers.py`, `routers/migration.py`
- All frontend files
- MongoDB collections / indexes
- `.env` files

---

```
Planning complete: CR-119
Stage: Impact Analysis + Implementation Plan
Code reality: FULL (confirmed from live scan.py lines 163–235)
Risk: LOW
Edits: 3 edits in routers/scan.py (~5 lines total)
Files WILL change: routers/scan.py only
Files WILL NOT touch: everything else
Owner decisions required: NONE
Conflict: NONE with Wave A (CR-111/113/114/115/110-amend)
Self-test: T1–T5 curl + 4 pytest suites
Docs: planning/CR_119_IMPACT_ANALYSIS.md · planning/CR_119_IMPLEMENTATION_PLAN.md
Next: "choose implementation role for CR-119" when owner approves
```
