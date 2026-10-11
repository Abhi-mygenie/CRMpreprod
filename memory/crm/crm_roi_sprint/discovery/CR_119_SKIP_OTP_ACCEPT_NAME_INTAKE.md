# CR-119 — Intake: `skip-otp` accept `name` in request body
**Date**: 2026-10-11 · **Role**: Intake Agent · **Source**: INV-023 candidate CR (a) · **No code changed. No data written.**

---

## 1. Owner Request

> "Register the gap for accepting `name` in `skip-otp`." — Owner 2026-10-11, following INV-023 investigation.

---

## 2. Problem

`POST /scan/auth/skip-otp` is the **only** diner identity path (CR-084/CR-098 removed OTP and password routes). When a new customer is created by this route, `name` is hardcoded to `""` (`scan.py:205`). The `SkipOTPRequest` model (`scan.py:163–166`) does not declare a `name` field — Pydantic's default `extra="ignore"` silently drops any `name` the Customer App sends.

This means the Customer App must always make **two calls** for a new diner:
1. `POST /scan/auth/skip-otp` → get token + `customer_id`
2. `PUT /scan/profile { "name": "..." }` → store the name

The two-call workaround is **fully functional today** and was confirmed by INV-023. This CR is a **convenience improvement** — collapse to one call for new diners by accepting `name` in the skip-otp body.

---

## 3. Code reality (read-only, confirmed 2026-10-11 from live `scan.py`)

### `SkipOTPRequest` model — `scan.py:163–166`

```python
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"
    # ← name is NOT here; any name key in request body is silently dropped
```

### New-customer creation block — `scan.py:200–224`

```python
customer_doc = {
    "id": customer_id,
    "user_id": full_restaurant_id,
    "name": "",          # ← hardcoded blank; never reads from request
    ...
}
```

### skip-otp response — `scan.py:230–235`

```python
return _resp(True, "Login successful", {
    "token": token,
    "customer_id": customer_id,
    "is_new_customer": is_new,
    "phone": req.phone
    # ← name not returned (existing customers' name not in response either)
})
```

### `PUT /scan/profile` (existing workaround) — `scan.py:331–343`

`ProfileUpdate` model (line 123–134) already accepts `name: Optional[str] = None`.
Route does `$set` of provided fields. Works today. No change needed here.

---

## 4. Classification

| Field | Value |
|---|---|
| **Type** | CR — additive API contract extension |
| **Severity** | **P3** — two-call workaround fully functional; `PUT /scan/profile` exists and works; this is a convenience improvement only |
| **Risk** | **LOW** — additive to one model and one handler; no financial logic; no auth change; no DB schema change; no existing callers broken |
| **Duplicate check** | **DISTINCT** — no prior CR touches `name` in `SkipOTPRequest`. CR-102 added `country_code` to the same model (same pattern, LOW risk, shipped). CR-089 added rate limits. CR-098 removed password routes. None overlap. |
| **Blast radius** | **SMALL** — 1 file (`routers/scan.py`), 2 edits (model + handler), 0 schema change, 0 DB migration, 0 index change |
| **Related** | INV-023 (source) · CR-102 (precedent: same model, same additive pattern) · `PUT /scan/profile` (workaround stays; complementary) |

---

## 5. Fix sketch (for Planning — do not implement now)

```python
# Edit 1 — SkipOTPRequest model (scan.py ~line 163)
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"
    name: Optional[str] = None          # CR-119: Customer App sends name at login

# Edit 2 — new-customer create block (scan.py ~line 205)
# Change:  "name": "",
# To:
"name": req.name.strip() if req.name and req.name.strip() else "",
# Guard: strip whitespace; never store blank from an explicit "" send

# Edit 3 (optional, owner decision) — response passthrough
# Add "name" to the return dict so Customer App confirms what was stored:
return _resp(True, "Login successful", {
    "token": token,
    "customer_id": customer_id,
    "is_new_customer": is_new,
    "phone": req.phone,
    "name": customer.get("name", "") if not is_new else (req.name.strip() if req.name and req.name.strip() else ""),
})
```

**Notes for Planning:**
- Returning existing customer's name in the response requires the existing-customer path to fetch it — already fetched at `scan.py:194–197` with `{"_id": 0, "id": 1, "name": 1}` projection. No extra DB call.
- `PUT /scan/profile` remains the correct path for name *updates* (after initial login). This CR only fills the name *at create time*.
- Backward compatible: existing callers that do not send `name` are unaffected (`Optional[str] = None` → no change in behaviour).

---

## 6. Verification sketch

| V | Check | Expected |
|---|---|---|
| V1 | `POST /scan/auth/skip-otp` new phone + `name: "Alok"` | `is_new_customer:true`; DB `name="Alok"` |
| V2 | `POST /scan/auth/skip-otp` existing phone + `name: "anything"` | `is_new_customer:false`; DB `name` unchanged |
| V3 | `POST /scan/auth/skip-otp` new phone + `name: "  "` (whitespace only) | `name=""` stored (blank guard) |
| V4 | `POST /scan/auth/skip-otp` new phone, no `name` key | `name=""` (backward-compatible; no 422) |
| V5 | `POST /scan/auth/skip-otp` new phone + `name: ""` explicit blank | `name=""` stored (blank guard) |
| V6 | Existing test suites (`test_cr089_skip_otp.py`, `test_cr093_lookup.py`, `test_cr084_cr097.py`, `test_cr085a_normalization.py`) | 100% PASS — no regression |

---

## 7. Owner questions

**None required** — all decisions are clear:
- Fix approach and blank-name guard are unambiguous.
- Backward compatible: existing callers unaffected.
- The only optional element (response passthrough) can be decided at Planning with no owner question needed (LOW-risk additive field).

---

```
Intake complete: CR-119
Classification: CR — additive API contract extension (scan.py, 2 edits)
Severity: P3 (two-call workaround fully functional; convenience improvement only)
Risk: LOW
Duplicate check: DISTINCT (CR-102 precedent: same model, same pattern, same risk)
Evidence: scan.py:163–166 (model), scan.py:205 (hardcoded name:""), scan.py:230–235 (response); INV-023 §0 + §4
Blast radius: SMALL (1 file, 2 edits; no schema/DB/index/auth change)
Owner decisions: none required
Docs: discovery/CR_119_SKIP_OTP_ACCEPT_NAME_INTAKE.md
Next: Planning gate opens on "choose planning role for CR-119"
```
