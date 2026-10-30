# CR-124 — Impact Analysis: International Phone Number Support (E.164)

**Date**: 2026-10-30
**Role**: PLANNING AGENT
**Risk**: HIGH
**Source**: `discovery/CR_124_INTL_PHONE_E164_INTAKE.md` + `BACKEND_BRIEF_INTL_PHONE_2026_10_24.md`
**Prerequisite reads**: `core/phone.py`, `routers/pos.py`, `routers/scan.py`, `routers/customers.py`, `core/whatsapp.py`, `core/loyalty_jobs.py`, `models/schemas.py`, `CustomersPage.jsx`, `CustomerDetailPage.jsx`, `CustomerRegistrationPage.jsx`

---

## 0. Planning Session Start

```
Project: MyGenie CRM
Role selected: PLANNING
Reason: CR-124 registered at INTAKE; needs Impact Analysis across POS, Scan & Order, and CRM UI before implementation
Risk level: HIGH
Docs read: MYGENIE_CRM_AGENT_SYSTEM_PROMPT_ALPHA_v0_1.md, CR_STATUS_DASHBOARD.md, CR_124 Intake, BACKEND_BRIEF, core/phone.py, all 3 router files, whatsapp.py, loyalty_jobs.py, schemas.py, 3 frontend pages
Blocked by unknowns: Q1-Q5 from Intake (proceeding with recommended defaults per §6.6 urgency)
Next action: Write IA → await owner approval → Implementation Plan
```

---

## 1. Scope & Strategy

**The single source of truth is `core/phone.py::normalize_phone()`** — every phone write/read in the CRM passes through it. The fix strategy is:

> **Change `normalize_phone()` once → all 15 call sites inherit the fix automatically.**

Storage model: **Keep split `phone` (digits) + `country_code` ("+XX")** — same as today, but relax validation for non-Indian country codes. This is the lowest-migration-risk approach (Intake Q1 recommendation = b).

---

## 2. Complete Phone Path Inventory

### Legend
- **🔴 BREAKS** = international numbers rejected or mangled today
- **🟡 PARTIAL** = works but with caveats
- **🟢 OK** = no change needed

---

### DOMAIN A — POS CONTRACT (`routers/pos.py`, 3766 LOC)

| # | Endpoint | Line | CR-085 Tag | Current Behavior | International Impact | Action |
|---|---|---|---|---|---|---|
| **P1** | `POST /pos/customers` (create) | 239 | W3 | `normalize_phone()` → strips cc, stores digits; invalid → flagged not rejected | 🔴 UK `+447911123456` → stored as `447911123456` (12 digits) → flagged `phone_invalid` because India check fails | **FIX in phone.py** — non-+91 cc bypasses India digit[0] check; digits stored without stripping |
| **P2** | `PUT /pos/customers/{id}` (update) | 420 | W4 | Same normalize → flag pattern | 🔴 Same stripping/flagging issue | **FIX in phone.py** — inherited |
| **P3** | `POST /pos/customer-lookup` | 2165 | W5 | `normalize_phone()` → `phone_match()` → filters `phone_invalid:{$ne:True}` | 🔴 Lookup by `+447911123456` → normalizes to `447911123456` → won't match stored mangled value; also `phone_invalid` filter excludes | **FIX in phone.py** — correct normalization + `phone_match()` exact cc |
| **P4** | `POST /pos/orders` (webhook) `_find_or_create_customer()` | 698 | W1 | `normalize_phone(order_data.cust_mobile)` — no cc arg; invalid → guest order | 🔴 International phone without explicit cc → defaults to +91 → fails India check → guest order (no loyalty, no identity) | **FIX in phone.py** — detect embedded cc (`+44...`) before India fallback |
| **P5** | `POST /pos/webhook/payment-received` | 1850 | W2 | Same as P4 — no cc arg; invalid → guest | 🔴 Same — international guest gets no loyalty | **FIX in phone.py** — inherited |
| **P6** | `POST /pos/address-lookup` | 2926 | W6 | `normalize_phone(lookup.phone)[0]` in aggregation `$match` | 🔴 Strips cc → wrong digits → no address match | **FIX in phone.py** — inherited |
| **P7** | `POST /pos/trigger-event` | 2575 | W7 | `normalize_phone(event_data.customer_phone)` → customer lookup | 🔴 International phone → wrong normalization → customer not found → minimal fallback data with **hardcoded `"country_code": "+91"`** (line 2590) | **FIX in phone.py** + **EDIT line 2590**: use `_cc` from normalize instead of hardcoded `"+91"` |
| **P8** | `GET /pos/customers/search` | 2700 | — | `{"phone": {"$regex": search}}` | 🟢 OK — regex search on stored `phone` field works regardless of format (partial match) | No change |
| **P9** | `POST /pos/direct-send` | 3481 | — | Reads phone/cc from customer doc → passes to WhatsApp | 🟡 Depends on stored phone being correct (fixes P1-P6 fix storage) | No direct change |
| **P10** | `POST /pos/webhook` (Freshmarketer) | 3720 | — | Reads phone/cc from customer doc | 🟡 Same as P9 | No direct change |

**POS Contract Summary**: 7 endpoints break (P1-P7). All inherit fix from `phone.py` except P7 which also has a hardcoded `"+91"` fallback. **1 manual edit** in pos.py (line 2590).

---

### DOMAIN B — SCAN & ORDER CONTRACT (`routers/scan.py`, 1000 LOC)

| # | Endpoint | Line | CR-085 Tag | Current Behavior | International Impact | Action |
|---|---|---|---|---|---|---|
| **S1** | `POST /scan/auth/skip-otp` | 187 | W13 | `normalize_phone(req.phone, req.country_code)` → invalid = 400 | 🔴 International phone with correct cc (e.g., `phone:"7911123456", cc:"+44"`) → passes non-India 6-15 digit check ✅ BUT: phone sent as `+447911123456` with no cc → defaults +91 → fails India check → 400 | **FIX in phone.py** — detect embedded cc |
| **S2** | `POST /scan/auth/lookup` | 265 | W14 | Same normalize + phone_match | 🔴 Same embedded-cc issue | **FIX in phone.py** — inherited |
| **S3** | `POST /scan/feedback` | 878 | — | Same normalize; invalid = 400 | 🔴 Same embedded-cc issue | **FIX in phone.py** — inherited |
| **S4** | `GET /scan/auth/me` | 244 | — | Returns customer doc as-is | 🟢 OK — returns stored phone (fixed by correct storage) | No change |
| **S5** | `PUT /scan/profile` | — | — | Profile update — phone not editable via scan | 🟢 OK | No change |
| **S6** | `GET /scan/loyalty-rules/{rid}` | — | — | No phone involved | 🟢 OK | No change |
| **S7** | `GET /scan/coupons` | — | — | No phone involved | 🟢 OK | No change |
| **S8** | `POST /scan/coupons/validate` | — | — | No phone involved | 🟢 OK | No change |
| **S9** | `POST /scan/max-redeemable` | — | — | No phone involved | 🟢 OK | No change |

**Scan & Order Summary**: 3 endpoints break (S1-S3). All inherit fix from `phone.py`. **0 manual edits** in scan.py.

---

### DOMAIN C — CRM UI (`routers/customers.py` 2523 LOC + frontend)

#### C.1 Backend

| # | Endpoint / Function | Line | CR-085 Tag | Current Behavior | International Impact | Action |
|---|---|---|---|---|---|---|
| **C1** | `POST /customers` (CRM create) | 802 | W9 | `normalize_phone()` → invalid = 422 | 🔴 International number with +91 default → fails digit[0] check | **FIX in phone.py** — inherited |
| **C2** | `PUT /customers/{id}` (CRM edit) | 1812 | W10 | Same → 422 "Enter a valid mobile number" | 🔴 **THIS IS THE OWNER'S REPORTED BUG** — `1772654157` with +91 → rejected | **FIX in phone.py** — inherited |
| **C3** | `POST /qr/register/{rid}` (QR registration) | 1923 | W12 | Same → 422 | 🔴 International guest scanning QR → rejected | **FIX in phone.py** — inherited |
| **C4** | `background_customer_sync()` | 371 | W8 | normalize → invalid = flag (POS-like) | 🔴 Synced international customers flagged `phone_invalid` | **FIX in phone.py** — inherited |
| **C5** | `_validate_and_classify_row()` (CSV import) | 100-117 | — | **HARDCODED**: strips `+`, strips `91` prefix, requires exactly 10 digits, requires `.isdigit()` | 🔴 **DOES NOT USE `normalize_phone()`** — completely independent validation. International phones always fail ("Phone must be 10 digits") | **MUST REWRITE** — replace with `normalize_phone()` call |
| **C6** | CSV import storage | 1631 | W11 | Hardcoded `"country_code": "+91"` | 🔴 Even if CSV validation is fixed, all imported customers get forced to +91 | **MUST EDIT** — derive cc from normalize result |
| **C7** | CSV import dedup | 1641-1650 | — | `phone_to_doc[result["phone"]]` — lookup by plain phone digits | 🟡 Dedup key must match new storage format | **EDIT** — use normalized (phone, cc) tuple for dedup |
| **C8** | Customer list search | 1134 | — | `{"phone": {"$regex": search}}` | 🟢 OK — regex on stored `phone` field (partial match works) | No change |
| **C9** | MyGenie sync payload | 829 | — | `"phone": customer_data.phone or ""` — sends raw input to MyGenie API | 🟡 MyGenie API may need full number; currently sends raw input which is fine | No change (passthrough) |

#### C.2 Frontend

| # | Page / Component | Location | Current Behavior | International Impact | Action |
|---|---|---|---|---|---|
| **F1** | `CustomersPage.jsx` — Add Customer modal | line 1889-1915 | Country code `<Select>` + phone input `maxLength={15}` | 🟢 OK — CR-099 already shipped maxLength=15 + cc selector | No change |
| **F2** | `CustomersPage.jsx` — Edit Customer modal (list) | line 2431-2452 | Same: cc select + `maxLength={15}` | 🟢 OK | No change |
| **F3** | `CustomerDetailPage.jsx` — Edit modal | line 1163-1182 | cc select + phone input (no maxLength visible) | 🟡 **Check**: may need `maxLength={15}` added | **VERIFY** — add maxLength if missing |
| **F4** | `CustomerRegistrationPage.jsx` — QR registration | line 74-79 | Plain phone input, **no country code selector**, no maxLength | 🔴 International guest cannot specify country code | **MUST ADD** country code selector |
| **F5** | `CustomersPage.jsx` — Phone display in table | line 1591 | `{customer.phone}` — shows digits only | 🟡 International numbers show without `+cc` prefix — confusing | **SHOULD EDIT** — display `+{cc} {phone}` |
| **F6** | `CustomerDetailPage.jsx` — Phone display in header | line 300 | `{customer.phone}` — digits only | 🟡 Same display issue | **SHOULD EDIT** — display `+{cc} {phone}` |
| **F7** | `CustomersPage.jsx` — CSV import dialog help text | line 2887 | "Required columns: name and phone" | 🟡 Should mention country_code as optional column | **SHOULD EDIT** — add `country_code` to help text |
| **F8** | `CustomersPage.jsx` — Country code options in Select | line 1893 | Options from constants (need to verify range) | 🟡 Must include common international codes | **VERIFY** `lib/constants.js` has intl codes |

**CRM UI Summary**: 4 backend paths break (C1-C4 via phone.py), 2 hardcoded paths break (C5-C6 need manual rewrite), 1 frontend breaks (F4 missing cc selector). Display improvements optional (F5-F8).

---

### DOMAIN D — CORE MODULES

| # | Module / Function | File:Line | Current Behavior | International Impact | Action |
|---|---|---|---|---|---|
| **D1** | `normalize_phone()` | `core/phone.py:9-33` | India: 10 digits, `digit[0] in "6789"`, strips `91` prefix. Non-India: 6-15 digits (already exists!) | 🔴 Embedded cc detection broken (line 16: only detects non-India `+XX` at start); India validation too strict for numbers that aren't Indian | **PRIMARY FIX** — improve embedded cc detection + preserve digits correctly |
| **D2** | `phone_match()` | `core/phone.py:36-43` | +91: `$in ["+91", None, ""]` (CR-100 tolerance). Non-+91: exact `{user_id, phone, cc}` | 🟢 OK — non-+91 already uses exact match. +91 tolerance preserved. | No change needed |
| **D3** | `WhatsAppMessage.phone` / send | `core/whatsapp.py:64` | `message.phone.replace(" ", "").replace("-", "")` | 🟢 OK — sends digits; AuthKey receives `country_code` separately (line 63) | No change (correct phone + correct cc = correct delivery) |
| **D4** | `send_event_message()` phone read | `core/whatsapp.py:835-836` | `customer.get("phone")` + `customer.get("country_code", "+91")` | 🟢 OK — reads from customer doc. Fix storage → correct send. | No change |
| **D5** | `loyalty_jobs.py` filters | `core/loyalty_jobs.py:426-427, 468-469` | `"phone_invalid": {"$ne": True}` | 🟢 OK — correctly stored international phones won't have `phone_invalid` flag | No change (fix storage → fix filter inclusion) |
| **D6** | Pydantic schemas | `models/schemas.py:186,200,234,344,458` | `phone: str` — no validator, no length check | 🟢 OK — plain string, no blocking validation | No change |

---

## 3. The Single Fix: `core/phone.py::normalize_phone()`

### Current logic (lines 9-33):

```python
def normalize_phone(raw, country_code=None):
    raw_s = (raw or "").strip()
    cc_in = (country_code or "").strip() or None
    # 1. Invalid cc format check
    if cc_in and not _CC_RE.fullmatch(cc_in):
        return re.sub(r"\D", "", raw_s), cc_in, "invalid"
    # 2. Detect non-India cc prefix in raw string
    m = _CC_RE.match(raw_s)
    if m and f"+{m.group(1)}" != INDIA_CC:
        cc = f"+{m.group(1)}"
        digits = re.sub(r"\D", "", raw_s[m.end():])
    else:
        # 3. India path — strip 91 prefix, strip leading 0
        digits = re.sub(r"\D", "", raw_s)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        cc = cc_in if cc_in and cc_in != INDIA_CC else INDIA_CC
    # 4. Validation
    if cc == INDIA_CC:
        valid = len(digits) == 10 and digits[0] in "6789" and len(set(digits)) > 1
    else:
        valid = 6 <= len(digits) <= 15
    if not valid:
        return digits, cc, "invalid"
    unchanged = digits == raw_s and (cc_in or INDIA_CC) == cc
    return digits, cc, "ok" if unchanged else "fixed"
```

### Problems identified:

| # | Problem | Line | Example | Fix |
|---|---|---|---|---|
| **BUG-A** | Embedded `+44` in raw string detected at line 16, but `+91` embedded is NOT detected — falls through to India strip path | 16 | `raw="+917911123456"` → strips to `7911123456` (correct for India, but `+447911123456"` → cc=`+44`, digits=`7911123456` ✅) | OK for +44; problem is when `raw="447911123456"` (no `+` prefix) → all-digits → India path → 12 digits starting with `44` ≠ `91` → keeps 12 digits → India check fails (not 10 digits) → `invalid` |
| **BUG-B** | When `cc_in="+91"` is explicitly passed but phone is international (owner's bug: `phone="1772654157", cc="+91"`), India validation runs because `cc == INDIA_CC` → `digits[0]="1"` not in `"6789"` → invalid | 26-27 | `phone="1772654157", cc="+91"` → India check → fails | This is **correct behavior** — the phone IS invalid for +91. The real issue is the data: either the phone is non-Indian (wrong cc sent) or it's a genuinely invalid Indian number. |
| **BUG-C** | POS sends `cust_mobile="+447911123456"` without `country_code` param → line 15-18 correctly detects `+44` → BUT line 20-22 strips `91` from India-format numbers that happen to start with `91` | 20-22 | Edge case: `raw="917911123456"` (no +, 12 digits starting with 91) → stripped to `7911123456` even if it was an international number `+917911123456` (which IS India — correct!) | OK — `91` stripping only fires for 12-digit numbers starting with `91`, which is correct India behavior |

### Proposed fix approach:

The current non-India path (line 16-18) **already works** for `+XX` prefixed international numbers. The main gaps are:

1. **Explicit cc override**: When `cc_in` is non-+91 (e.g., `"+44"`), force non-India validation even if raw digits look India-like
2. **Embedded cc without `+`**: Numbers like `447911123456` (no `+` prefix, no `cc_in`) — need heuristic or require explicit cc
3. **CSV import bypass**: `_validate_and_classify_row()` doesn't use `normalize_phone()` at all

---

## 4. Files WILL Change

| # | File | Changes | Risk | LOC est. |
|---|---|---|---|---|
| **1** | `core/phone.py` | Adjust `normalize_phone()`: when `cc_in` is not +91, skip India-specific strip/validation | HIGH (identity anchor) | ~5-8 lines |
| **2** | `routers/customers.py` | Rewrite `_validate_and_classify_row()` to use `normalize_phone()`; fix CSV import hardcoded `"+91"`; fix dedup key | MEDIUM | ~15-20 lines |
| **3** | `routers/pos.py` | Remove hardcoded `"+91"` at line 2590 (use `_cc` from normalize) | LOW (1 line) | 1 line |
| **4** | `frontend/src/pages/CustomerRegistrationPage.jsx` | Add country code selector for QR registration | LOW (frontend-only) | ~15-20 lines |
| **5** | `frontend/src/pages/CustomerDetailPage.jsx` | Verify/add maxLength on edit phone input | LOW | ~1 line |
| **6** | `frontend/src/pages/CustomersPage.jsx` | Phone display format `+{cc} {phone}` in table; CSV help text | LOW | ~5 lines |

## 5. Files WILL NOT Change

| File | Reason |
|---|---|
| `core/whatsapp.py` | Reads phone/cc from customer doc — fix storage, sends fix themselves |
| `core/loyalty_jobs.py` | Filters `phone_invalid` — correctly stored phones won't be flagged |
| `core/coupon.py` | No phone logic |
| `core/loyalty.py` | No phone logic |
| `core/campaign_jobs.py` | No phone logic |
| `routers/campaigns.py` | Phone passthrough only |
| `routers/whatsapp.py` | Phone passthrough only |
| `routers/scan.py` | All 3 affected paths (S1-S3) inherit fix from phone.py |
| `routers/auth.py` | No phone logic |
| `models/schemas.py` | `phone: str` — no blocking validators |
| `services/invoice_generator.py` | No phone logic |
| `services/analytics_service.py` | No phone logic |

---

## 6. Verification Matrix

| # | Verification | AC | Domain | Method |
|---|---|---|---|---|
| V1 | Indian 10-digit number (`9876543210`, cc=`+91`) creates/updates/looks up correctly — **zero regression** | AC-7 | ALL | curl + DB check |
| V2 | UK number (`7911123456`, cc=`+44`) stored as `phone:"7911123456", country_code:"+44"` — no stripping | AC-1 | POS | curl POST /pos/customers + DB |
| V3 | UK number looked up by same input → found | AC-2 | POS | curl POST /pos/customer-lookup |
| V4 | E.164 raw input (`+447911123456`, no cc param) → auto-detects cc=`+44`, digits=`7911123456` | AC-6 | POS | curl POST /pos/orders (cust_mobile) |
| V5 | Invalid Indian number (`1772654157`, cc=`+91`) → still rejected (TRAI rule) | AC-7 | CRM | curl PUT /customers/{id} |
| V6 | Same number with correct cc (`1772654157`, cc=`+1`) → accepted (US number, 10 digits, valid 6-15 range) | AC-1 | CRM | curl PUT /customers/{id} |
| V7 | CRM search by partial phone (e.g., `7911`) matches international customer | AC-3 | CRM | curl GET /customers?search=7911 |
| V8 | Skip-otp with international phone (`phone:"7911123456", cc:"+44"`) → login succeeds | AC-5 | Scan | curl POST /scan/auth/skip-otp |
| V9 | Scan lookup with same phone → found | AC-5 | Scan | curl POST /scan/auth/lookup |
| V10 | Feedback with international phone → stored correctly, customer linked if exists | AC-5 | Scan | curl POST /scan/feedback |
| V11 | CSV import with international phone in `phone` column + `country_code` column → accepted, stored correctly | AC-1 | CRM | curl POST /customers/import-preview + /import |
| V12 | CSV import with Indian phone (no cc column) → defaults to +91, works as before | AC-7 | CRM | curl POST /customers/import |
| V13 | WhatsApp send to international customer → correct `country_code` + `mobile` in AuthKey payload | AC-8 | Core | Log check or test-send |
| V14 | QR registration page shows country code selector; international guest can register | AC-5 | CRM FE | Screenshot |
| V15 | Customer table displays `+44 7911123456` for international customers | — | CRM FE | Screenshot |
| V16 | POS trigger-event with international customer → no hardcoded `"+91"` in fallback | — | POS | curl + log check |
| V17 | CR-085 regression: `phone_invalid` flag still set for genuinely invalid phones (e.g., `0000000000`) | AC-7 | POS | curl POST /pos/customers with junk phone |
| V18 | CR-100 regression: legacy `country_code:null` Indian customers still found by `phone_match()` | AC-7 | ALL | DB query |
| V19 | CR-099 regression: formatted input (`+91 9876 543210`) still accepted and normalized | AC-7 | CRM | curl POST /customers |
| V20 | Loyalty jobs still exclude `phone_invalid` customers, include valid international customers | AC-7 | Core | pytest or manual |

---

## 7. Dependency & Conflict Check

| Item | Status | Impact on CR-124 |
|---|---|---|
| CR-085 (canonical phone) | 🟢 CLOSED | **EXTENDS** — CR-124 modifies the same `normalize_phone()` function. Must preserve all CR-085 behaviors for Indian numbers. |
| CR-099 (formatted input) | 🟢 CLOSED | **COMPATIBLE** — `maxLength=15` already shipped. No conflict. |
| CR-100 (null-cc tolerance) | 🟢 CLOSED | **COMPATIBLE** — `phone_match()` `$in` pattern for +91 preserved. Non-+91 already uses exact match. |
| CR-102 (skip-otp cc) | 🟢 CLOSED | **COMPATIBLE** — skip-otp already accepts `country_code` param. |
| CR-112 (unique phone index) | 📋 REGISTERED | **MUST COORDINATE** — compound index should be `(user_id, phone, country_code)` to prevent cross-cc duplicates. |
| CR-111 (importer normalize) | 🟡 PLANNING | **SUPERSEDED** — CR-124 C5 rewrites the same `_validate_and_classify_row()`. CR-111 scope folded into CR-124. |
| CR-069 (template buttons) | 🟡 IN QUEUE | **NO CONFLICT** — different files entirely. Can ship in parallel. |

---

## 8. Open Owner Decisions (carried from Intake Q1-Q5)

| # | Decision | Rec | Status |
|---|---|---|---|
| Q1 | Storage format: split `phone` + `country_code` (b) vs E.164 in one field (a) | **(b) Split** — zero migration, backward compat | **PROCEEDING WITH (b)** unless owner overrides |
| Q2 | Backfill existing 7700 Indian customers to E.164? | **(a) Forward-only** | **PROCEEDING WITH (a)** |
| Q3 | Keep `digits[0] in "6789"` for +91? | **(a) Yes, +91 only** | **PROCEEDING WITH (a)** |
| Q4 | CRM-only scope vs include POS backend APIs? | **(a) CRM-only** — POS APIs (place-order, check-in) are MyGenie-side | **PROCEEDING WITH (a)** |
| Q5 | Priority vs CR-069? | Owner decides | **AWAITING** |
| **Q6 (NEW)** | CSV import: add `country_code` as optional column? Default `+91` when absent? | **(a) Yes, optional column, default +91** | **AWAITING** |
| **Q7 (NEW)** | Display format: show `+{cc} {phone}` in customer table/detail, or keep digits-only? | **(a) Show with cc prefix** | **AWAITING** |

---

## 9. Risk Assessment

| Factor | Before CR-124 | After CR-124 |
|---|---|---|
| Indian phone handling | ✅ Works | ✅ Unchanged (V1, V5, V12, V17-V20) |
| International phone CRM create/edit | ❌ Rejected | ✅ Accepted with correct cc (V2, V6) |
| International phone POS create/lookup | ❌ Stripped/flagged | ✅ Stored correctly (V2-V4) |
| International phone Scan & Order | ❌ Rejected | ✅ Accepted (V8-V10) |
| CSV import international | ❌ "Must be 10 digits" | ✅ Accepted with cc column (V11-V12) |
| WhatsApp delivery international | ❌ Wrong number | ✅ Correct cc+phone (V13) |
| Existing data | 7700 Indian customers | Untouched — forward-only (Q2=a) |
| `phone_match()` identity | +91 tolerant | +91 tolerant (unchanged), non-+91 exact (unchanged) |

**Overall: HIGH risk mitigated by single-function fix + 20-point verification matrix + full CR-085/099/100 regression.**

---

## 10. Effort Estimate

| Phase | Scope | Hours |
|---|---|---|
| Phase 1 | `core/phone.py` fix + unit tests | ~1.5h |
| Phase 2 | `routers/customers.py` — CSV import rewrite + hardcoded cc | ~1.5h |
| Phase 3 | `routers/pos.py` — 1 line hardcoded cc | ~15min |
| Phase 4 | Frontend — QR registration cc selector + display format | ~1h |
| Phase 5 | Verification matrix V1-V20 | ~2h |
| Phase 6 | CR-085/099/100/102 regression suite | ~1h |
| **Total** | | **~7-8h** |

---

```
Planning complete: CR-124
Stage: Impact Analysis
Code reality: PARTIAL (normalize_phone exists; non-India 6-15 digit path exists but bypassed by stripping)
Risk: HIGH
Files WILL change: core/phone.py, routers/customers.py, routers/pos.py (1 line), CustomerRegistrationPage.jsx, CustomerDetailPage.jsx (verify), CustomersPage.jsx (display)
Files WILL NOT touch: core/whatsapp.py, core/loyalty.py, core/coupon.py, core/campaign_jobs.py, routers/scan.py, routers/whatsapp.py, routers/campaigns.py, routers/auth.py, models/schemas.py, services/*
Owner decisions: Q1-Q5 (proceeding with recs), Q6-Q7 NEW
Docs: planning/CR_124_IMPACT_ANALYSIS.md
Next: Owner approval → Implementation Plan
```
