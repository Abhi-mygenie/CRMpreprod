# CR-124 — Implementation Plan: International Phone Number Support

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: HIGH
**Prerequisite**: Impact Analysis CLOSED (`planning/CR_124_IMPACT_ANALYSIS.md`)
**Decisions locked**: Q1(b) split storage · Q2(a) forward-only · Q3(a) keep digit[0] for +91 · Q4(a) CRM-only · Q6(a) CSV cc column · Q7(a) display +cc phone

---

## Edit Summary

| Phase | File | Edits | LOC | Risk |
|---|---|---|---|---|
| 1 | `core/phone.py` | 1 edit (normalize_phone logic) | ~8 | HIGH |
| 2 | `routers/customers.py` | 7 edits (CSV import + export + dedup) | ~35 | MEDIUM |
| 3 | `routers/pos.py` | 1 edit (hardcoded "+91") | 1 | LOW |
| 4 | Frontend (3 files) | 5 edits (QR page + display + help text) | ~30 | LOW |
| **Total** | **6 files** | **14 edits** | **~74** | |

---

## PHASE 1 — `core/phone.py` (HIGH risk — identity anchor)

### Edit E1: Adjust `normalize_phone()` to respect explicit non-India `cc_in`

**File**: `core/phone.py`
**Lines**: 15-25 (the cc-detection + India-strip block)
**Marker**: `# CR-124`

**Current code** (lines 15-25):
```python
    m = _CC_RE.match(raw_s)
    if m and f"+{m.group(1)}" != INDIA_CC:
        cc = f"+{m.group(1)}"
        digits = re.sub(r"\D", "", raw_s[m.end():])
    else:
        digits = re.sub(r"\D", "", raw_s)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        cc = cc_in if cc_in and cc_in != INDIA_CC else INDIA_CC
```

**New code**:
```python
    m = _CC_RE.match(raw_s)
    if m and f"+{m.group(1)}" != INDIA_CC:
        # Raw string starts with non-India cc prefix (e.g. "+447911123456")
        cc = f"+{m.group(1)}"
        digits = re.sub(r"\D", "", raw_s[m.end():])
    elif cc_in and cc_in != INDIA_CC:
        # CR-124: explicit non-India cc_in — skip India strip logic entirely
        digits = re.sub(r"\D", "", raw_s)
        cc = cc_in
    else:
        # India path — unchanged from CR-085
        digits = re.sub(r"\D", "", raw_s)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        cc = cc_in if cc_in and cc_in != INDIA_CC else INDIA_CC
```

**What changes**: One new `elif` branch (3 lines). When caller passes `country_code="+44"` (or any non-+91), we skip all India-specific stripping (91-prefix removal, leading-0 removal) and go straight to the non-India validation (`6 <= len(digits) <= 15`).

**What does NOT change**: 
- India path (`cc_in` is None, "", or "+91") → identical behavior, same line numbers
- Embedded `+XX` detection (line 16) → identical
- Validation block (lines 26-33) → untouched
- `phone_match()` → untouched

**Backward compatibility proof**:
- `normalize_phone("9876543210")` → cc_in=None → old else branch → `("+91", "9876543210", "ok")` ✅
- `normalize_phone("9876543210", "+91")` → cc_in="+91" → `cc_in != INDIA_CC` is False → old else branch → same ✅
- `normalize_phone("7911123456", "+44")` → cc_in="+44" → NEW elif → digits="7911123456", cc="+44" → non-India valid (10 digits, 6-15 ✅) → `("7911123456", "+44", "fixed")` ✅
- `normalize_phone("+447911123456")` → m matches +44 → existing if branch → same as today ✅

**Self-test**: After edit, run:
```bash
python3 -c "
from core.phone import normalize_phone
# T1: Indian unchanged
assert normalize_phone('9876543210') == ('9876543210', '+91', 'ok'), 'T1 fail'
# T2: Indian with +91 unchanged  
assert normalize_phone('9876543210', '+91') == ('9876543210', '+91', 'ok'), 'T2 fail'
# T3: Indian invalid (digit[0]=1) with +91 still rejected
assert normalize_phone('1772654157', '+91')[2] == 'invalid', 'T3 fail'
# T4: Same number with +1 (US) — now accepted
ph, cc, st = normalize_phone('1772654157', '+1')
assert st != 'invalid' and cc == '+1', f'T4 fail: {ph},{cc},{st}'
# T5: UK with explicit cc
ph, cc, st = normalize_phone('7911123456', '+44')
assert ph == '7911123456' and cc == '+44' and st != 'invalid', f'T5 fail: {ph},{cc},{st}'
# T6: E.164 raw string (no cc_in)
ph, cc, st = normalize_phone('+447911123456')
assert ph == '7911123456' and cc == '+44' and st != 'invalid', f'T6 fail: {ph},{cc},{st}'
# T7: India 91-prefix strip still works
ph, cc, st = normalize_phone('919876543210')
assert ph == '9876543210' and cc == '+91', f'T7 fail: {ph},{cc},{st}'
# T8: Invalid for +44 (too short)
assert normalize_phone('123', '+44')[2] == 'invalid', 'T8 fail'
# T9: UAE number
ph, cc, st = normalize_phone('501234567', '+971')
assert ph == '501234567' and cc == '+971' and st != 'invalid', f'T9 fail: {ph},{cc},{st}'
# T10: Junk phone still invalid for India
assert normalize_phone('0000000000', '+91')[2] == 'invalid', 'T10 fail'
print('ALL 10 PASS')
"
```

---

## PHASE 2 — `routers/customers.py` (MEDIUM risk — CSV import + export)

### Edit E2: Rewrite `_validate_and_classify_row()` to use `normalize_phone()`

**File**: `routers/customers.py`
**Lines**: 100-144
**Marker**: `# CR-124: international phone via normalize_phone`

**Current code** (lines 108-117):
```python
    if not phone:
        return {"status": "error", "row": row_num, "reason": "Missing phone number"}

    clean_phone = phone.replace(" ", "").replace("-", "").lstrip("+")
    if clean_phone.startswith("91") and len(clean_phone) == 12:
        clean_phone = clean_phone[2:]
    if not clean_phone.isdigit():
        return {"status": "error", "row": row_num, "reason": f"Invalid phone format: '{phone}'"}
    if len(clean_phone) != 10:
        return {"status": "error", "row": row_num, "reason": f"Phone must be 10 digits, got {len(clean_phone)}"}
```

**New code**:
```python
    if not phone:
        return {"status": "error", "row": row_num, "reason": "Missing phone number"}

    # CR-124: use normalize_phone for international support (Q6=a: optional country_code column, default +91)
    row_cc = row.get("country_code", "").strip() or None
    clean_phone, clean_cc, ph_status = normalize_phone(phone, row_cc)
    if ph_status == "invalid":
        return {"status": "error", "row": row_num, "reason": f"Invalid phone number: '{phone}'" + (f" for {row_cc}" if row_cc else "")}
```

**Also update return dict** (line 136):

**Current**: `"phone": clean_phone,`
**New**: `"phone": clean_phone, "country_code": clean_cc,`

**Dedup key**: Line 119 uses `clean_phone in existing_phones`. After this edit, dedup needs `(phone, cc)` tuple. Change to:
```python
    dedup_key = f"{clean_cc}:{clean_phone}"
    status = "update" if dedup_key in existing_phones else "new"
```

This requires the `existing_phones` set to also be built as `{f"{cc}:{ph}"}` tuples — see Edit E5.

---

### Edit E3: Add `country_code` to CSV import sample template

**File**: `routers/customers.py`
**Lines**: 1479-1483

**Current**:
```python
    IMPORT_HEADERS = ["name", "phone", "email", "dob", "city", "address", "tags", "whatsapp_opt_in"]
    SAMPLE_ROWS = [
        ["Priya Sharma",  "9876543210", "priya@example.com", "1990-05-15", "Mumbai", "123 Main St", "VIP, Regular", "Yes"],
        ["Rahul Verma",   "9123456789", "rahul@example.com", "",           "Delhi",  "",             "",             ""],
    ]
```

**New**:
```python
    # CR-124: country_code optional column (Q6=a); default +91 when absent
    IMPORT_HEADERS = ["name", "phone", "country_code", "email", "dob", "city", "address", "tags", "whatsapp_opt_in"]
    SAMPLE_ROWS = [
        ["Priya Sharma",  "9876543210", "+91", "priya@example.com", "1990-05-15", "Mumbai", "123 Main St", "VIP, Regular", "Yes"],
        ["Rahul Verma",   "9123456789", "",    "rahul@example.com", "",           "Delhi",  "",             "",             ""],
        ["John Smith",    "7911123456", "+44", "john@example.com",  "",           "",       "",             "",             ""],
    ]
```

---

### Edit E4: Add `Country Code` to export fields

**File**: `routers/customers.py`
**Line**: After line 46 (`("Phone", "phone"),`)

**Insert after line 46**:
```python
    ("Country Code",    "country_code"),
```

---

### Edit E5: Build dedup key with `(cc, phone)` tuple in import-preview and import

**File**: `routers/customers.py`

**import-preview** (lines 1541-1544):

**Current**:
```python
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "_id": 0}
    ).to_list(length=None)
    existing_phones = {doc["phone"] for doc in existing_docs if doc.get("phone")}
```

**New**:
```python
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "country_code": 1, "_id": 0}
    ).to_list(length=None)
    existing_phones = {f"{doc.get('country_code', '+91')}:{doc['phone']}" for doc in existing_docs if doc.get("phone")}
```

**import** (lines 1604-1607):

**Current**:
```python
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "id": 1, "tags": 1, "_id": 0}
    ).to_list(length=None)
    phone_to_doc = {doc["phone"]: doc for doc in existing_docs if doc.get("phone")}
```

**New**:
```python
    existing_docs = await db.customers.find(
        {"user_id": user["id"]}, {"phone": 1, "country_code": 1, "id": 1, "tags": 1, "_id": 0}
    ).to_list(length=None)
    phone_to_doc = {f"{doc.get('country_code', '+91')}:{doc['phone']}": doc for doc in existing_docs if doc.get("phone")}
```

---

### Edit E6: CSV import storage — derive cc from normalize result

**File**: `routers/customers.py`
**Line**: 1631

**Current**:
```python
        payload = {"name": result["name"], "phone": result["phone"], "country_code": "+91"}  # CR-085 W11 (G2)
```

**New**:
```python
        payload = {"name": result["name"], "phone": result["phone"], "country_code": result.get("country_code", "+91")}  # CR-124 (was CR-085 W11)
```

---

### Edit E7: CSV import update matcher — use `(cc, phone)` dedup key

**File**: `routers/customers.py`
**Lines**: 1640-1641, 1649-1650

**Current** (line 1640-1641):
```python
        if result["status"] == "update":
            existing_doc  = phone_to_doc[result["phone"]]
```

**New**:
```python
        if result["status"] == "update":
            dedup_key = f"{result.get('country_code', '+91')}:{result['phone']}"
            existing_doc  = phone_to_doc[dedup_key]
```

**Current** (line 1649-1650):
```python
            ops.append(UpdateOne(
                {"user_id": user["id"], "phone": result["phone"]},
```

**New**:
```python
            ops.append(UpdateOne(
                {**phone_match(user["id"], result["phone"], result.get("country_code", "+91"))},
```

### Edit E8: `_find_duplicate_phones()` — use `(cc, phone)` key

**File**: `routers/customers.py`
**Line**: 153

**Current**:
```python
        seen.setdefault(r["phone"], []).append(r["row"])
```

**New**:
```python
        seen.setdefault(f"{r.get('country_code', '+91')}:{r['phone']}", []).append(r["row"])
```

---

## PHASE 3 — `routers/pos.py` (LOW risk — 1 line)

### Edit E9: Remove hardcoded `"+91"` in trigger-event fallback

**File**: `routers/pos.py`
**Line**: 2590

**Current**:
```python
                "country_code": "+91",
```

**New**:
```python
                "country_code": _cc,  # CR-124: use cc from normalize_phone, not hardcoded
```

**Prerequisite**: Verify `_cc` is in scope. At line 2575:
```python
        _ph, _cc, _ = normalize_phone(event_data.customer_phone)  # CR-085 W7
```
✅ `_cc` is in scope at line 2590 (same function block).

---

## PHASE 4 — Frontend (LOW risk)

### Edit E10: `CustomerRegistrationPage.jsx` — add country code selector

**File**: `frontend/src/pages/CustomerRegistrationPage.jsx`
**Lines**: 13, 70-80

**E10a**: Add state and imports (line 1-9):

Add to imports:
```jsx
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
```

**E10b**: Add `country_code` to formData (line 13):

**Current**: `const [formData, setFormData] = useState({ name: "", phone: "", email: "" });`
**New**: `const [formData, setFormData] = useState({ name: "", phone: "", country_code: "+91", email: "" });`

**E10c**: Replace plain phone input (lines 70-80) with cc selector + input:

**Current**:
```jsx
                    <div>
                        <Label className="form-label">Phone Number *</Label>
                        <Input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({...formData, phone: e.target.value})}
                            placeholder="9876543210"
                            className="h-12 rounded-xl"
                            required
                            data-testid="public-reg-phone"
                        />
                    </div>
```

**New**:
```jsx
                    <div>
                        <Label className="form-label">Phone Number *</Label>
                        <div className="flex gap-2">
                            <Select
                                value={formData.country_code}
                                onValueChange={(v) => setFormData({...formData, country_code: v})}
                            >
                                <SelectTrigger className="w-24 h-12 rounded-xl" data-testid="public-reg-cc-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="+91">+91</SelectItem>
                                    <SelectItem value="+1">+1</SelectItem>
                                    <SelectItem value="+44">+44</SelectItem>
                                    <SelectItem value="+971">+971</SelectItem>
                                    <SelectItem value="+65">+65</SelectItem>
                                    <SelectItem value="+61">+61</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input
                                type="tel"
                                value={formData.phone}
                                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                                placeholder="9876543210"
                                className="flex-1 h-12 rounded-xl"
                                required
                                maxLength={15}
                                data-testid="public-reg-phone"
                            />
                        </div>
                    </div>
```

---

### Edit E11: `CustomersPage.jsx` — display `+{cc} {phone}` in table

**File**: `frontend/src/pages/CustomersPage.jsx`
**Line**: 1591

**Current**:
```jsx
<td className="px-4 py-3 text-sm text-gray-600">{customer.phone}</td>
```

**New**:
```jsx
<td className="px-4 py-3 text-sm text-gray-600">{customer.country_code && customer.country_code !== "+91" ? `${customer.country_code} ` : ""}{customer.phone}</td>
```

**Note**: Only shows cc prefix for non-Indian numbers to avoid cluttering the table for the 99% Indian customer base. Indian customers still show `9876543210` as today.

---

### Edit E12: `CustomerDetailPage.jsx` — display `+{cc} {phone}` in header

**File**: `frontend/src/pages/CustomerDetailPage.jsx`
**Line**: 300

**Current**:
```jsx
                                    <span>{customer.phone}</span>
```

**New**:
```jsx
                                    <span>{customer.country_code && customer.country_code !== "+91" ? `${customer.country_code} ` : ""}{customer.phone}</span>
```

---

### Edit E13: `CustomerDetailPage.jsx` — add maxLength to edit phone input

**File**: `frontend/src/pages/CustomerDetailPage.jsx`
**Line**: 1180-1182

**Current**:
```jsx
                                            placeholder="9876543210"
                                            className="flex-1 h-11 rounded-xl"
                                            required
                                            data-testid="edit-phone-input"
```

**New** (add maxLength):
```jsx
                                            placeholder="9876543210"
                                            className="flex-1 h-11 rounded-xl"
                                            required
                                            maxLength={15}
                                            data-testid="edit-phone-input"
```

---

### Edit E14: `CustomersPage.jsx` — update CSV import help text

**File**: `frontend/src/pages/CustomersPage.jsx`
**Line**: 2887

**Current**:
```jsx
<span className="font-semibold">Required columns:</span> <code className="bg-amber-100 px-1 rounded">name</code> and <code className="bg-amber-100 px-1 rounded">phone</code>. Optional: email, dob, city, address, tags (comma-separated). Duplicate phone → update existing customer.
```

**New**:
```jsx
<span className="font-semibold">Required columns:</span> <code className="bg-amber-100 px-1 rounded">name</code> and <code className="bg-amber-100 px-1 rounded">phone</code>. Optional: country_code (default +91), email, dob, city, address, tags (comma-separated). Duplicate phone → update existing customer.
```

---

## PHASE 5 — Verification Matrix (from IA)

Run V1-V20 per `planning/CR_124_IMPACT_ANALYSIS.md` §6. Critical path:

| Priority | Tests | Method |
|---|---|---|
| **P0** | V1 (India unchanged), V2 (UK store), V3 (UK lookup), V5 (India invalid still rejected), V17 (phone_invalid regression), V18 (null-cc legacy) | curl + DB |
| **P1** | V4 (E.164 raw), V6 (US number), V7 (search), V8-V10 (Scan), V11-V12 (CSV) | curl |
| **P2** | V13 (WhatsApp), V14-V15 (FE screenshots), V16 (trigger-event), V19-V20 (CR-099/loyalty) | curl + screenshot + pytest |

---

## PHASE 6 — Regression

| Suite | Command | Expected |
|---|---|---|
| CR-085 normalization | `pytest tests/test_cr085a_normalization.py -v` | All PASS (India paths unchanged) |
| CR-100 tolerant match | `pytest tests/test_cr100_tolerant_match.py -v` | All PASS (phone_match unchanged) |
| CR-089 skip-otp | `pytest tests/test_cr089_skip_otp.py -v` | All PASS (scan paths inherit fix) |
| CR-093 lookup | `pytest tests/test_cr093_lookup.py -v` | All PASS |
| CR-096 feedback | `pytest tests/test_cr096_feedback.py -v` | All PASS |

---

## File Change Summary

| File | Edits | Lines touched | Marker |
|---|---|---|---|
| `core/phone.py` | E1 | 15-25 (+3 lines) | `# CR-124` |
| `routers/customers.py` | E2, E3, E4, E5, E6, E7, E8 | 46, 108-117, 136, 153, 1479-1483, 1541-1544, 1604-1607, 1631, 1640-1641, 1649-1650 | `# CR-124` |
| `routers/pos.py` | E9 | 2590 (1 line) | `# CR-124` |
| `CustomerRegistrationPage.jsx` | E10a/b/c | 1-13, 70-80 | `CR-124` |
| `CustomerDetailPage.jsx` | E12, E13 | 300, 1182 | `CR-124` |
| `CustomersPage.jsx` | E11, E14 | 1591, 2887 | `CR-124` |

**Files NOT touched**: `routers/scan.py`, `routers/whatsapp.py`, `routers/campaigns.py`, `routers/auth.py`, `core/whatsapp.py`, `core/loyalty.py`, `core/coupon.py`, `core/campaign_jobs.py`, `models/schemas.py`, `services/*`

---

```
Planning complete: CR-124
Stage: Implementation Plan
Code reality: PARTIAL → fully mapped
Risk: HIGH (mitigated by single-function fix + 20-point verification + 5-suite regression)
Files WILL change: core/phone.py, routers/customers.py, routers/pos.py, CustomerRegistrationPage.jsx, CustomerDetailPage.jsx, CustomersPage.jsx
Files WILL NOT touch: 12 files listed above
Owner decisions: All locked (Q1-Q4 recs, Q6-Q7 owner 2026-10-30, Q5 open)
Docs: planning/CR_124_IMPLEMENTATION_PLAN.md
Next: Owner approval ("choose implementation role") → execute E1-E14
```
