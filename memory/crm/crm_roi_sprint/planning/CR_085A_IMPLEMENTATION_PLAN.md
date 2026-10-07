# CR-085-A — Implementation Plan
## Canonical phone + country_code on every CRM write/match path (forward-fix; NO data change)

**Date**: 2026-10-09 · **Role**: Planning Agent · **Risk**: **CRITICAL** (edits `routers/pos.py` `_find_or_create_customer` + order webhook — addendum §14 "do NOT change customer identity/merge rules / POS order ingestion without owner approval"). Full gate + full regression.
**Impact Analysis**: `planning/CR_085_IMPACT_ANALYSIS.md` (gate closed 2026-10-09; live W13 reproduction appended)
**Frozen decisions**: Q1 international · **Q2 Option A** · Q3 moot · **Q4 forward-only — no backfill, no merge, no `$unset`** · Q5 default `+91`
**Effort**: ~4 h impl + 1.5 h QA (incl. full POS order regression)
**Gate**: ⏸ OWNER APPROVAL REQUIRED before implementation.

---

## 1. The one helper — `core/phone.py` (NEW)
```python
import re
from typing import Optional, Tuple

INDIA_CC = "+91"
_CC_RE = re.compile(r"^\+(\d{1,4})")

def normalize_phone(raw: Optional[str], country_code: Optional[str] = None) -> Tuple[str, str, str]:
    """CR-085. Returns (phone_digits, country_code, status) where status ∈ ok | fixed | invalid.
    Q1: foreign '+cc' kept. Q5: default +91. Never raises."""
    raw_s = (raw or "").strip()
    cc = (country_code or "").strip() or None
    m = _CC_RE.match(raw_s)
    if m and f"+{m.group(1)}" != INDIA_CC:          # Q1: leading +61 / +44 … wins
        cc = f"+{m.group(1)}"
        digits = re.sub(r"\D", "", raw_s[m.end():])
    else:
        digits = re.sub(r"\D", "", raw_s)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        cc = cc if cc and _CC_RE.fullmatch(cc) else INDIA_CC   # Q5
    if cc == INDIA_CC:
        valid = len(digits) == 10 and digits[0] in "6789" and len(set(digits)) > 1
    else:
        valid = 6 <= len(digits) <= 15
    if not valid:
        return digits, cc, "invalid"
    return digits, cc, ("ok" if digits == raw_s and (country_code or INDIA_CC) == cc else "fixed")

def phone_match(user_id: str, phone: str, cc: str) -> dict:
    """Unified identity key (same as sync F11 / lookup)."""
    return {"user_id": user_id, "phone": phone, "country_code": cc}
```
Unit tests (`backend/tests/test_phone_normalize.py`, pure, no DB): `"9876543210"`→ok · `"+91 98765 43210"`→fixed `9876543210/+91` · `"09876543210"`→fixed · `"919876543210"`→fixed · `"+61 404668073"`→`404668073/+61` ok · `"0000000000"`→invalid · `"123456789"`→invalid · `""`→invalid · `"98387 77712"`→fixed.

## 2. Apply at each point — behaviour per Q2 Option A
Legend: **N** = normalise before match & write; **G** = guest on invalid (no customer create/match by phone; `pos_customer_id` path first); **F** = store with `phone_invalid: true`, excluded; **R** = reject 400/422 with clear message.

| # | Point | File:line (pre-edit) | Edit | Invalid → |
|---|---|---|---|---|
| W1 | `_find_or_create_customer` | `pos.py:661-712` | N on `cust_mobile`; phone match → `phone_match(...)`; write `phone`, `country_code` from helper; `phone_raw` if fixed | **G**: skip phone match & create; return `(None, False, 0)` → caller stores order with `customer_id: None` (same as today's no-phone orders). `pos_customer_id` match still runs first. |
| W2 | order/payment webhook | `pos.py:1737-1757` | N; `phone_match`; on create write normalised + `+cc`; `phone_raw` | **G** (also fixes blank-phone create, G3). Loyalty/points block only when a customer exists. |
| W3 | `POST /pos/customers` | `pos.py:224-247` | N; uniqueness via `phone_match` | **F** (POS path never blocks): create with `phone_invalid: true`, `success:true`, message notes invalid phone |
| W4 | `PUT /pos/customers/{id}` | `pos.py:398-406` | N; uniqueness via `phone_match` | **F** |
| W5 | `POST /pos/customer-lookup` | `pos.py:2051` | N; `phone_match` | not found |
| W6 | `POST /pos/customer-addresses` | `pos.py:2780` | N; add `user_id` + cc to `$match` | not found |
| W7 | `/pos/events` recipient | `pos.py:2429` | N; `phone_match` | fall through to minimal data (today's behaviour) |
| W8 | MyGenie sync | `customers.py:373, 453-460` | N on `mygenie_customer.phone`+`country_code`; F11 key uses normalised pair; write normalised | **F** |
| W9 | CRM Add Customer | `customers.py:799-870` | N; `phone_match`; write normalised | **R** 422 "Enter a valid mobile number" |
| W10 | CRM Update Customer | `customers.py:1807` | N; uniqueness via `phone_match` | **R** |
| W11 | CSV import | `customers.py:1600-1663` | reuse helper in `_validate_and_classify_row`; **write `country_code`** (G2); dedup set updated per row (G1) | **R** per row (already) |
| W12 | `/register-customer/{rid}` | `customers.py:1911-1932` | N; `phone_match` | **R** |
| W13 | `skip-otp` | `scan.py:~205-230` | N; `phone_match`; write normalised; `phone_raw` | **R** 400 (diner is present; same shape as lookup) |
| W14 | `lookup` | — | already normalised; switch to helper for one source of truth | — |
| W15 | migration order link | `migration.py:220` | N; `phone_match` | no link (unchanged: migration never creates) |
Reads unchanged: WhatsApp send (`country_code + phone` — now cleaner), loyalty jobs, search regex, intelligence.
**Exclusions for `phone_invalid: true`**: add `"phone_invalid": {"$ne": True}` to the WhatsApp recipient queries in `core/whatsapp.py send_bulk_messages` recipient selection and `core/loyalty_jobs.py:426,467` **only** (read filters; send logic untouched), and to `lookup`'s `find_one`.

## 3. Files WILL change / WILL NOT touch
**WILL change (7)**: `core/phone.py` (new) · `routers/pos.py` (W1–W7) · `routers/customers.py` (W8–W12) · `routers/scan.py` (W13, W14) · `routers/migration.py` (W15) · `core/loyalty_jobs.py` (2 read filters) · `core/whatsapp.py` (1 recipient filter) · `backend/tests/test_phone_normalize.py` (new)
**WILL NOT touch**: `core/loyalty.py` point math · `core/coupon.py` · WhatsApp send/resend logic · token logic · frontend (CRM UI already surfaces `detail` in toasts — verify) · **any stored document** (no backfill, no merge, no `$unset`) · indexes (`idx_customers_user_phone` exists)

## 4. Edit order
T0 helper + unit tests (green) → W14 lookup (lowest risk, proves helper) → W13 skip-otp → W9/W10/W12 CRM → W11 import → W8 sync → W3–W7 POS CRUD → **W2 webhook → W1 realtime** (highest risk last, after everything else is green) → W15 → read filters → restart → full matrix.

## 5. Verification matrix (preview; QA re-runs; POS flows need `X-API-Key` from `users.api_key`)
| # | Check | Expected |
|---|---|---|
| A1 | unit tests | 9/9 |
| A2 | `skip-otp` `"98387 77712"` r689 (QA's exact repro) | 200, **same** customer as `9838777712`, count unchanged |
| A3 | `skip-otp` `"0000000000"` | 400 |
| A4 | `lookup` `"+91 7505242126"` r689 | Found "Abhishek Jain" |
| A5 | POS `POST /pos/customers` `"+91 90000 00123"` | created `phone:"9000000123"`, cc `+91`, `phone_raw` set |
| A6 | POS `POST /pos/customers` `"0000000000"` | 200 `success:true`, doc `phone_invalid:true` |
| A7 | POS `customer-lookup` `"98387-77712"` | finds `9838777712` |
| A8 | **webhook** valid new phone `"+91 90000 00124"` | order stored, customer created normalised, points per settings |
| A9 | **webhook** `customer_phone:""` and `"0000000000"`, no `pos_customer_id` | order stored, `customer_id: null`, **no customer created**, no points |
| A10 | **realtime order** (`/pos/orders`) existing phone with spaces | matches existing customer; visit/points accrue to it |
| A11 | realtime order invalid phone, `pos_customer_id` present | matches by `pos_customer_id` (unchanged) |
| A12 | realtime order invalid phone, no `pos_customer_id` | order stored, `customer_id: null` |
| A13 | CRM Add Customer `"12345"` | 422 with message; UI toast shows it |
| A14 | CSV import 2 rows same phone + 1 row `+91` form | 1 customer, `country_code:"+91"` written |
| A15 | MyGenie sync (dry: call sync endpoint on test tenant) | no duplicate for phones already present in any format |
| A16 | WhatsApp recipient query excludes `phone_invalid:true` (count via Mongo on test tenant) | excluded |
| A17 | regression suites `test_cr084_cr097`, `test_cr098`, `test_cr093_lookup`, `test_cr089_skip_otp` (S4b re-enabled) | green |
| A18 | `customers` count delta across the run | = exactly the test customers we deliberately created (A5, A6, A8) |
| A19 | err log clean, services RUNNING |
Full POS order regression on 3 tenants (689, 635, 541) by QA.

## 6. Rollback
Code-only; `git revert`. No document changed by this CR → nothing to restore. `phone_raw`/`phone_invalid` fields written going forward are additive.

## 7. Exit-gate deliverables
Dashboard 085 → 🟢 (085-A) + transition · `# CR-085` markers at W1–W15 · `qa/CR_085A_QA_HANDOVER.md` · change-log Wave 3 rows → CONFIRMED (POS informational: placeholder bills → guest orders; Customer App: skip-otp/lookup normalise + 400 on invalid) · consumer validation notes to **both** Scan & Order and POS agents · re-enable `test_S4b` · session handover · 085-B remains deferred.

## 8. Plain-English risk
| Risk | Level | Mitigation |
|---|---|---|
| Wrong identity match on a live bill (points to wrong diner) | **CRITICAL** | key is stricter, never looser (adds `country_code`); W1 edited last after all else green; A10–A12 on 3 tenants |
| Bill with placeholder phone stops crediting the ghost | Intended (Q2 A) | POS note; `pos_customer_id` path preserved |
| A legit diner typed with `+91` by POS matched a *different* record than before | Low | before: no match → new ghost; after: matches canonical → **history unified**, not split |
| CRM staff see new validation errors | Low | clear message; toast already shows `detail` |
| WhatsApp recipient count drops for tenants with junk | Intended | only `phone_invalid:true` excluded; count reported in QA |
| Rollback | Trivial | code-only |

```text
OWNER APPROVAL REQUIRED
Reason: start implementation of CR-085-A; changes customer identity/merge rules and POS order ingestion (addendum §14); 7 files; new 400/422 on CRM + skip-otp paths (contract change)
Risk: CRITICAL
Proposed next step: Implementation role — T0 → W14 → W13 → CRM → import → sync → POS CRUD → W2 → W1 → W15 → filters; self-test A1–A19; QA full POS regression on 3 tenants; consumer notes to Scan & Order + POS
I will not proceed until owner approves.
```


## Amendment 085-A2 (owner ruling 2026-10-09)
- **W1/W2 invalid phone → G (guest order)** is FINAL. Implementation shipped **F** (deviation, see `SESSION_2026_10_09_HANDOVER_CR089_CR085A.md` §085-A2). A separate **085-A2 Implementation Plan** must be written and owner-approved before code: make `customer` optional across the realtime order/loyalty path (`pos.py` §14 files), `_find_or_create_customer` returns `(None, False, 0)` on invalid phone when no `pos_customer_id` match, webhook W2 skips create + loyalty block when no customer.
- W3/W4 (POS create/update) + `customer_sync` keep **F**. R paths unchanged.
- Open sub-question: W5 POS `customer-lookup` hide `phone_invalid` records — not ruled.
- 085-B (data cleanup) re-confirmed as **last CR of the batch**.
