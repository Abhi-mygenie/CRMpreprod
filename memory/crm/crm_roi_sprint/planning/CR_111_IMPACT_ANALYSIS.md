# CR-111 — Impact Analysis: CSV importer phone validation via `normalize_phone` (fixes BUG-036)
**Date**: 2026-10-10 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_10_BATCH_INTAKE_DQ1_CR111_CR117_BUG035_BUG037.md` §1 · **Group**: Wave A / Group 1 (CR-111 + BUG-036) · **Status**: 🟡 IA complete — 1 owner question · **No code changed.**

---

## 1. Code reality (confirmed 2026-10-10, preprod branch)

### `routers/customers.py:100-150` — `_validate_and_classify_row`
```python
111|    clean_phone = phone.replace(" ", "").replace("-", "").lstrip("+")
112|    if clean_phone.startswith("91") and len(clean_phone) == 12:
113|        clean_phone = clean_phone[2:]
114|    if not clean_phone.isdigit():                      # ← accepts 0000000000, 1111111111, 5555555555
115|        return {"status": "error", ... "Invalid phone format"}
116|    if len(clean_phone) != 10:                         # ← rejects 11-digit "0"-prefixed (normalize_phone would FIX it)
117|        return {"status": "error", ... "Phone must be 10 digits"}
119|    status = "update" if clean_phone in existing_phones else "new"   # ← raw string set, not phone_match
```
- Own validator. **Does not import or call `normalize_phone`** (imported at top of file for other paths — `from core.phone import normalize_phone, phone_match` exists at module level, so no new import needed).
- No `first digit 6–9` rule, no `all-same-digit` rule → **G-1 confirmed**: `9999999999 Noname` @ Jeh's Nest came through here.
- `country_code` column in the file is **ignored** (`+91` hard-coded at write, line 1631). A UK number in the file is rejected as "not 10 digits".

### `routers/customers.py:1523-1583` — `preview_import` · `:1586-1703` — `import_customers`
- Both build `existing_phones` / `phone_to_doc` keyed on **raw stored `phone` string** (`{"phone": 1}` projection) — any `country_code` is ignored for the new/update decision.
- Update op: `UpdateOne({"user_id", "phone": result["phone"]}, {"$set": ...})` — phone-only key. Would also update a `+44` customer with the same 10 digits (edge, no prod case known).
- Insert op (`new_doc`, line 1655) writes `country_code: "+91"` via `payload` (CR-085 W11 G2 ✅). **No `phone_invalid`, no `phone_raw`** written — not needed once invalid rows are rejected.
- `_find_duplicate_phones(classified)` (BUG-013) de-dups on `r["phone"]` = the cleaned digits — compatible with switching to `normalize_phone` output.
- Preview returns `reason` per error row (`ImportPreviewRow.reason`, `all_errors[]`) → **the rejection reason is already surfaced**; only the wording changes.

### Tests touching the importer
- `tests/test_cr085a_normalization.py::test_A14_csv_import_dup_format` — asserts `+91XXXXXXXXXX` vs `XXXXXXXXXX` in the same file → 400 dup.
- `tests/test_iter6_phase_b.py::test_I6_csv_import_dedup` — in-file dedup.
- Both use valid phones → unaffected; they become regression checks.

**Code reality: PARTIAL** — importer validates, but with a weaker rule than every other door.

---

## 2. Data flow after the change

```
file row.phone (+ optional row.country_code)
  → normalize_phone(phone, country_code)  → (digits, cc, status)
      status == "invalid"  → row error  "Invalid phone or country_code"   (same wording as UI/scan 400)
      status in ok|fixed   → digits, cc used downstream
  → new/update decision: digits in existing set  (set built from stored phone; cc-tolerant via phone_match semantics — see Q1)
  → payload = {"name", "phone": digits, "country_code": cc}            (replaces hard-coded "+91")
  → UpdateOne(phone_match(user_id, digits, cc), {$set})  |  InsertOne(new_doc)
```

Behavioural deltas (operator-visible):

| Input in file | Today | After CR-111 |
|---|---|---|
| `0000000000`, `1111111111`, `5555555555` | accepted → junk customer | **row error** |
| `1234567890` (starts with 1) | accepted | row error (first digit must be 6–9) |
| `09876543210` (11 digits, leading 0) | row error "must be 10 digits" | **accepted → `9876543210`** (`fixed`) |
| `+91 98765 43210`, `919876543210` | accepted | accepted (unchanged) |
| `+44 7911 123456` | row error | accepted **only if** `country_code` column honoured (Q1); else row error |
| blank | row error | row error (unchanged) |

---

## 3. Owner question

| # | Question | Recommendation |
|---|---|---|
| **Q1** | Should the importer honour an optional `country_code` column (so foreign diners can be imported), or stay `+91`-only and reject anything non-Indian? | **`+91`-only this CR** (reject foreign). Reason: the sample template has no `country_code` column; adding it widens scope (template, preview columns, docs). Foreign import can be a later P3. The `cc` returned by `normalize_phone(phone)` with no cc argument is always `+91`, so the write stays identical to today for valid rows. |

No other decisions: wording reuse, `phone_match` for the update key, and rejecting invalid rows were all ruled by the owner on 2026-10-10 ("validate at our side").

---

## 4. Risk

| Area | Assessment |
|---|---|
| Risk label | **LOW** (intake) — confirmed. Operator-facing path, 2 tenants have ever used it, no POS/financial logic. |
| Data write change | Only *fewer* rows are written (invalid rejected). Valid-row documents are byte-identical to today. |
| Schema | None. |
| Index | None. |
| Backward compat | Files that imported fine before still import, except rows with junk phones (desired) — and 11-digit `0`-prefixed rows now succeed instead of failing. |
| Hotspot files | `routers/customers.py` is 2,523 LOC but not on the addendum hotspot list; the importer block is self-contained (lines 100-150, 1523-1703). |

---

## 5. Blast radius

- **Files WILL change**: `routers/customers.py` — `_validate_and_classify_row` (~10 lines), `import_customers` payload + `UpdateOne` key (~4 lines); new `tests/test_cr111_import_phone.py` (+4 cases: junk rejected · 11-digit fixed · valid unchanged · update path via phone_match).
- **Files WILL NOT touch**: `core/phone.py` · `models/schemas.py` (`ImportPreviewRow`/`ImportRowError` unchanged) · `CustomersPage.jsx` (preview already renders `reason`) · sample template endpoint · `import_logs` shape · DB / indexes.

---

## 6. Conflict check

- **CR-113 (Group 2)** edits `customers.py` in the **sync** region (lines 340-610) and `list_customers` (1087+). CR-111 edits lines 100-150 and 1586-1703. **No overlapping hunks**; safe to implement in parallel sessions if both agents rebase before writing.
- **CR-115 (Group 3)** edits `customers.py` sync loop (lines 296-320, 528-530) — no overlap.
- **CR-112** (Wave D) will wrap the importer's `InsertOne` in DuplicateKey handling — lands on top of this change; no conflict now.
- **BUG-013 / BUG-014** importer fixes already in the same function — preserved as-is.

---

## 7. Downstream consumers

| Consumer | Impact |
|---|---|
| `import_logs.errors[]` | Reasons change wording for junk rows; count of rejected rows goes up. ✅ |
| Import preview modal (`CustomersPage.jsx` importStep 2) | Shows new reasons; no code change. ✅ |
| `_find_duplicate_phones` | Operates on normalised digits — a file with `09876543210` and `9876543210` now correctly 400s as in-file dup (was: first row rejected by length). ✅ |
| CR-114 DQ snapshot | "new unflagged invalid phones" metric stops counting importer leaks after deploy. ✅ |
| Existing tests A14 / I6 | Pass unchanged. ✅ |

---

## 8. Verification matrix (for the Implementation Plan)

| # | Case | Expected |
|---|---|---|
| V1 | preview + import file with `0000000000` | preview `error_count=1`, reason "Invalid phone or country_code"; import writes 0 docs for that row |
| V2 | `09876543210` | preview `new`, stored `phone:"9876543210"`, `country_code:"+91"` |
| V3 | existing customer `9876543210` with legacy `country_code:null`; file row `+919876543210` | status `update` (phone_match tolerant), 1 doc updated, 0 inserted |
| V4 | `1234567890` | row error |
| V5 | regression `test_A14_csv_import_dup_format`, `test_I6_csv_import_dedup` | PASS |

---

```text
Planning complete: CR-111 (+BUG-036)
Stage: Impact Analysis
Code reality: PARTIAL (own 10-digit validator; normalize_phone not called; update key is raw phone)
Risk: LOW
Files WILL change: routers/customers.py (_validate_and_classify_row, import_customers payload/UpdateOne) · tests/test_cr111_import_phone.py (new)
Files WILL NOT touch: core/phone.py · models/schemas.py · CustomersPage.jsx · sample template · DB/indexes
Owner decisions: Q1 — honour country_code column? (recommend +91-only this CR)
Docs: planning/CR_111_IMPACT_ANALYSIS.md
Next: Implementation Plan gate — opens on owner answer to Q1 + "choose planning role for implementation planning of CR-111"
```
