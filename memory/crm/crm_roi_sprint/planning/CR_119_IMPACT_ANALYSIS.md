# CR-119 — Impact Analysis: `skip-otp` accept `name` ("Set name at first login")
**Date**: 2026-10-11 · **Role**: Planning Agent · **Risk**: LOW · **No code changed. No data written.**

---

## 1. CR summary

| Field | Value |
|---|---|
| **ID** | CR-119 |
| **Title** | `skip-otp` accept `name` in request body — Set name at first login |
| **Source** | INV-023 candidate CR (a) · Owner ruling 2026-10-11 |
| **Priority** | P2 (upgraded from P3 — skip-otp at Browse Menu confirmed intentional) |
| **Risk** | LOW |
| **Intake doc** | `discovery/CR_119_SKIP_OTP_ACCEPT_NAME_INTAKE.md` |

---

## 2. Code reality (confirmed from live `routers/scan.py`)

### 2.1 `SkipOTPRequest` model — lines 163–167

```python
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"  # CR-102: mirror LookupRequest
    # name is NOT declared — Pydantic extra="ignore" drops it silently
```

### 2.2 New-customer create block — lines 199–225

```python
is_new = False
if not customer:
    customer_id = str(uuid.uuid4())
    customer_doc = {
        "id": customer_id,
        "user_id": full_restaurant_id,
        "name": "",          # <-- hardcoded blank; never reads from request
        ...
    }
    await db.customers.insert_one(customer_doc)
    is_new = True
else:
    customer_id = customer["id"]
```

### 2.3 Existing-customer fetch — lines 194–197

```python
customer = await db.customers.find_one(
    phone_match(full_restaurant_id, phone, cc),
    {"_id": 0, "id": 1, "name": 1}   # <-- name already fetched; costs nothing extra
)
```

### 2.4 Response — lines 229–235

```python
token = create_customer_token(customer_id, full_restaurant_id, phone)
return _resp(True, "Login successful", {
    "token": token,
    "customer_id": customer_id,
    "is_new_customer": is_new,
    "phone": req.phone
    # name NOT returned
})
```

---

## 3. Affected files

### Files WILL change

| File | Lines touched | Nature of change |
|---|---|---|
| `routers/scan.py` | 163–167 (model) · 205 (name store) · 230–235 (response) | Additive only — new Optional field + name store + response passthrough |

### Files WILL NOT change

| File | Reason |
|---|---|
| `models/schemas.py` | `SkipOTPRequest` is defined inline in `scan.py`, not in schemas |
| `core/auth.py` | Token creation unchanged |
| `core/phone.py` | Phone normalisation unchanged |
| `core/database.py` | No collection or index change |
| `routers/pos.py` | POS order path unchanged |
| `routers/customers.py` | Customer list/detail unchanged |
| All frontend files | No frontend change required |
| All other routers | No impact |
| MongoDB schema | `name` field already exists on all customer documents (was stored as `""`) — no migration needed |

---

## 4. Data-flow trace

```
POST /scan/auth/skip-otp
  body: { phone, restaurant_id, country_code?, name? }   ← name NEW optional field

  → rate-limit checks (unchanged)
  → normalize_phone (unchanged)
  → db.customers.find_one (unchanged; projection already fetches name)

  [new customer path]
  → insert customer_doc with name = req.name.strip() if provided & non-blank else ""
                                                          ← ONLY CHANGE in this path

  [existing customer path]
  → customer_id = customer["id"]                         ← unchanged; name not overwritten

  → create_customer_token (unchanged)
  → return { token, customer_id, is_new_customer, phone, name }
                                                          ← name NEW in response
```

**Key invariant preserved:** existing customers' names are **never overwritten** by a skip-otp call. Only new-customer create is affected.

---

## 5. Risk assessment

| Area | Risk | Reasoning |
|---|---|---|
| Existing callers (no `name` field) | **NONE** — `Optional[str] = None` default | Callers that don't send `name` get exactly the same behaviour as before |
| New-customer name store | **NONE** | Simple conditional assignment; blank guard prevents empty-string contamination |
| Existing-customer path | **NONE** | No change; name is not updated on existing customers |
| Response shape | **NONE** — additive field | Adding `name` to response is backward compatible; existing callers that ignore unknown fields are unaffected |
| Rate limits | **NONE** | No change to limiter logic |
| Phone validation | **NONE** | No change |
| Auth / JWT | **NONE** | Token creation unchanged |
| Financial / loyalty / coupons | **NONE** | Completely separate codepath |
| Database | **NONE** | `name` field already exists on customer documents |
| §14 hotspot files | **NOT TOUCHED** | `routers/pos.py`, `core/coupon.py`, `core/loyalty.py` etc. untouched |

**Overall risk: LOW. No §14 hotspot file touched. No financial, auth, or data-destructive change.**

---

## 6. Conflict check

| Active item | Conflict? | Reason |
|---|---|---|
| CR-111 (importer validation) | **None** — different file (`routers/migration.py`) | |
| CR-113 (data-quality logging) | **None** — different files (`routers/customers.py`, `routers/pos.py`, sync loops) | |
| CR-114 (DQ snapshot script) | **None** — new standalone script | |
| CR-115 (sync resilience) | **None** — `routers/migration.py` + `routers/pos.py`; no overlap with `scan.py` | |
| CR-110 amend (token script) | **None** — OPS script only | |
| BUG-038/039/040 | **None** — `routers/customers.py` + scripts | |

**CR-119 can be implemented independently of Wave A, before or after, without conflict.**

---

## 7. Owner decisions required before implementation

**None.** All decisions are unambiguous:
- Add `name` as Optional field: only correct option
- Blank guard on store: obvious (do not persist whitespace-only name)
- Response passthrough: included (low cost; existing-customer `name` already fetched at line 196)
- Existing customers: NOT updated (name is only set on create — by design)

---

```
Planning complete: CR-119
Stage: Impact Analysis
Code reality: FULL (confirmed from live scan.py)
Risk: LOW
Files WILL change: routers/scan.py (3 edits, ~5 lines)
Files WILL NOT touch: everything else
Owner decisions: none required
Conflict: none with Wave A items
Docs: planning/CR_119_IMPACT_ANALYSIS.md
Next: Implementation Plan (approved by default — no owner decisions needed)
```
