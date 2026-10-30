# CR-124 — International Phone Number Support (E.164 Storage & Validation)

**Date Registered**: 2026-10-30
**Reporter**: Owner (via `BACKEND_BRIEF_INTL_PHONE_2026_10_24.md`)
**Brief ID**: BACKEND_BRIEF_INTL_PHONE_2026_10_24
**Related External CR**: CR-473 (POS frontend — international phone inputs)
**Environment**: https://mygenie-crm-app-1--1mjjz4pi.preview.emergentagent.com
**Classification**: CONTRACT_MISMATCH + FEATURE_REQUEST
**Severity**: P1
**Risk**: HIGH
**Duplicate check**: DISTINCT (related: CR-085 canonical phone, CR-099 formatted input, CR-100 legacy null-cc tolerance, CR-102 skip-otp country_code — all CLOSED, all assume Indian 10-digit numbers; none support E.164 international storage)

---

## 1. Problem Statement

POS restaurants — especially hotels — serve international guests. The CRM is hardcoded to 10-digit Indian mobile numbers at every write, lookup, and validation point. International phone numbers are either **rejected** (CRM UI edit) or **silently mangled** (POS create strips country code).

**Live reproduction (2026-10-30):**

| Action | Input | Result | Expected |
|---|---|---|---|
| CRM UI: Edit customer phone | `phone: "1772654157"`, `country_code: "+91"` | ❌ 422 "Enter a valid mobile number" | Should accept if correct country_code provided |
| POS API: Create customer | `phone: "+447911123456"` | ✅ 200 — but stored as `"11123456"` (stripped) | Store `+447911123456` (E.164) |
| POS API: Lookup by original | `phone: "+447911123456"` | ✅ Found (by accident — fragile) | Match on stored E.164 |

---

## 2. Root Cause (Investigation INV-013)

**File**: `core/phone.py:26-27` — India-specific validation:

```python
if cc == INDIA_CC:  # "+91"
    valid = len(digits) == 10 and digits[0] in "6789" and len(set(digits)) > 1
```

This rejects any phone not starting with 6/7/8/9 when `country_code="+91"`. International numbers sent with wrong country code (or default `+91`) always fail.

**File**: `core/phone.py:20-23` — Country code stripping:

```python
digits = re.sub(r"\D", "", raw_s)
if len(digits) == 12 and digits.startswith("91"):
    digits = digits[2:]
```

A UK number `+447911123456` → digits `447911123456` → doesn't match `91` prefix → stored as `447911123456` (12 digits) → fails India validation → flagged `phone_invalid`.

---

## 3. Blast Radius

**LARGE** — Phone identity is the CRM's anchor (addendum §6.6). Affects:

| Surface | File(s) | Impact |
|---|---|---|
| CRM customer create (UI) | `routers/customers.py` (add modal) | Rejects international numbers |
| CRM customer edit (UI) | `routers/customers.py:1811` (PUT) | Rejects international numbers (owner's bug report) |
| POS customer create | `routers/pos.py:238` | Strips country code on storage |
| POS customer lookup | `routers/pos.py` (customer-lookup) | Match may fail on stored mangled number |
| POS order webhook | `routers/pos.py:1800+` | Customer identity resolution fails |
| Scan & Order (skip-otp) | `routers/scan.py:186` | Rejects non-Indian phones |
| Scan feedback | `routers/scan.py` (feedback) | Phone match fails |
| CSV import | `routers/customers.py:100` (`_validate_and_classify_row`) | Hardcoded 10-digit check |
| Customer sync | `routers/customers.py:371` (background sync) | Strips country code |
| WhatsApp send | `core/whatsapp.py` | Sends to mangled number → delivery failure |
| Loyalty jobs | `core/loyalty_jobs.py:427,469` | Filters on `phone_invalid` — international = excluded |
| `phone_match()` identity key | `core/phone.py:36` | `$in ["+91", None, ""]` only for India; international needs exact cc match |

### Files WILL change:
- `core/phone.py` (normalize_phone + phone_match)
- `routers/customers.py` (UI create/edit + CSV import + sync)
- `routers/pos.py` (POS create/lookup/order)
- `routers/scan.py` (skip-otp + feedback)
- `models/schemas.py` (phone field validators if any)

### Files WILL NOT change:
- `core/coupon.py`, `core/loyalty.py` (no phone logic)
- `core/campaign_jobs.py`, `routers/campaigns.py` (phone passthrough)
- `services/invoice_generator.py`, `services/analytics_service.py`
- `routers/whatsapp.py` (uses phone as stored — fix storage, sends fix themselves)

---

## 4. Acceptance Criteria (from Brief)

| # | Criterion | Priority |
|---|---|---|
| AC-1 | CRM stores phone in E.164 format (`+447911123456`) — no stripping | P0 |
| AC-2 | CRM lookup by E.164 returns exact match | P0 |
| AC-3 | CRM search by partial phone (e.g., `7911`) matches against full stored number | P1 |
| AC-4 | POS backend place-order / check-in / booking APIs accept E.164 phone (7-15 digits, optional `+` prefix) | P0 |
| AC-5 | Scan & Order flow passes customer phone to CRM in E.164 format | P1 |
| AC-6 | `normalize_phone()` preserves E.164 — returns `(full_number, country_code, status)` without stripping | P0 |
| AC-7 | Indian numbers continue to work exactly as today (backward compatible) | P0 |
| AC-8 | WhatsApp sends use full E.164 number (delivery works for international) | P1 |

---

## 5. Evidence

- **Investigation INV-013** (this session): `core/phone.py:27` rejects `1772654157` with `+91` because `digits[0]="1"` not in `"6789"`
- **Brief probes (2026-10-24)**: UK `+447911123456` created via POS → stored as `"11123456"` (country code stripped)
- **Brief document**: `BACKEND_BRIEF_INTL_PHONE_2026_10_24.md` (owner-provided)

---

## 6. Effort Estimate

~6-8 hours (HIGH risk, 5+ files, identity system change, backward compatibility required)

- Phase 1 (~3h): `core/phone.py` rewrite + `routers/customers.py` (UI paths) + basic tests
- Phase 2 (~2h): `routers/pos.py` (POS create/lookup/order) + `routers/scan.py` (skip-otp/feedback)
- Phase 3 (~1h): CSV import + customer sync + WhatsApp delivery verification
- Phase 4 (~1h): Regression on CR-085/CR-099/CR-100/CR-102 test suites

---

## 7. Open Questions for Owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| Q1 | **Storage format**: Store as E.164 string in `phone` field (e.g., `+447911123456`) or keep separate `phone` (digits only) + `country_code`? | (a) E.164 in `phone` field · (b) Keep split `phone` + `country_code` but accept international digit lengths | (b) — less migration risk, backward compatible with existing CR-085 `phone_match` pattern |
| Q2 | **Existing data migration**: ~7700 customers have 10-digit Indian phones without `+91` prefix. Backfill to E.164? | (a) Forward-only (new records E.164, old stay as-is) · (b) Backfill all to E.164 | (a) — backfill is CRITICAL risk on live data; handle in separate CR |
| Q3 | **India validation relaxation**: For `+91`, keep `digits[0] in "6789"` check (TRAI rule) or remove it? | (a) Keep for +91 only · (b) Remove entirely | (a) — TRAI rule is correct; only relax for non-Indian codes |
| Q4 | **POS backend APIs** (place-order, check-in, reservations): These are on the MyGenie POS side, not CRM. Confirm CRM-only scope? | (a) CRM-only this CR · (b) Include POS API changes | (a) — POS is external; CRM brief covers AC-1/2/3/5/6/7 |
| Q5 | **Priority vs active queue**: Ship before or after CR-069 (template buttons, currently in queue)? | (a) Before CR-069 · (b) After CR-069 | Owner decides |

---

## 8. Dependencies & Conflicts

| Dependency | Status | Impact |
|---|---|---|
| CR-085 (canonical phone) | 🟢 CLOSED | CR-124 extends its `normalize_phone()` — must preserve backward compat |
| CR-099 (formatted input) | 🟢 CLOSED | Frontend `maxLength=15` already shipped — compatible |
| CR-100 (legacy null-cc tolerance) | 🟢 CLOSED | `phone_match()` `$in` pattern needs extension for international |
| CR-102 (skip-otp country_code) | 🟢 CLOSED | Skip-otp already accepts `country_code` — needs validation relaxation |
| CR-112 (unique phone index) | 📋 REGISTERED | Must coordinate — index definition may need `country_code` in compound key |
| CR-473 (POS frontend) | EXTERNAL | POS FE will send E.164 after their changes — CRM must be ready to receive |

---

## 9. Risk Assessment

| Factor | Rating | Reason |
|---|---|---|
| **Overall risk** | **HIGH** | Phone identity is the CRM's anchor (§6.6). Wrong change → duplicate customers, broken loyalty, failed WhatsApp delivery |
| Financial impact | MEDIUM | Loyalty points tied to customer identity; wrong merge/split = incorrect balances |
| Data integrity | HIGH | ~7700 existing customers must continue to match correctly |
| Blast radius | LARGE | 12+ surfaces across 5 files |
| Rollback complexity | MEDIUM | Forward-compatible if split storage (Q1=b); E.164 storage (Q1=a) harder to roll back |
| Testing burden | HIGH | Must re-run CR-085/099/100/102 regression suites + new international cases |

**No Fast Lane allowed** (addendum Part C: customer identity is CRITICAL by default).

---

*Intake complete. Next: Owner answers Q1-Q5 → Planning (Impact Analysis + Implementation Plan).*
