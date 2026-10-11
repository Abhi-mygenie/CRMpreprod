# CR-102 — Impact Analysis & Implementation Plan
## `POST /scan/auth/skip-otp` must accept `country_code` (default `+91`)
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_INTAKE_CR102.md` · **Owner Q-B = yes** (plan separately, implement with BUG-025) · **Status**: ⏸ OWNER APPROVAL REQUIRED · **No code changed.**

## 1. Code reality (read-only, 2026-10-09)
| Fact | Evidence |
|---|---|
| `SkipOTPRequest{phone, restaurant_id}` — no `country_code`; Pydantic default config ignores unknown fields silently | `scan.py:192-194`; no `extra="forbid"` anywhere in `scan.py` |
| `normalize_phone(req.phone)` → cc defaults to `+91` | `scan.py:219`; `core/phone.py` signature `normalize_phone(raw, country_code="+91")` |
| `LookupRequest` **has** `country_code: Optional[str] = "+91"` and passes it | `scan.py:197-200, 283` |
| Downstream of skip-otp already uses `cc`: match key `phone_match(rid, phone, cc)`, stored `country_code: cc`, (after BUG-025 E1) limiter key `{cc}{phone}` | `:224, :236`, plan E1 |
| JWT `create_customer_token(customer_id, rid, phone)` — no cc claim | `core/auth.py:33-39` |
| Customer App sends `country_code:"+91"` on every skip-otp since 2026-10-09 (their reply §4/§5) | validated |
| DB: 0 customers with a non-+91 code (10 have `""`, 53 `null` → CR-100) | probe |
| Contract v1.0 Part 1 lists skip-otp request as `{phone, restaurant_id}` | `investigations/CONTRACT_CUSTOMER_APP_CRM_v1.0_CRM_SIGNOFF.md` → needs **v1.1 additive note** |

## 2. Root cause
CR-085-A W13 normalised skip-otp but kept the 2-field schema (India-only assumption); CR-093 added `country_code` to lookup only. The two halves of the identity path now disagree on inputs.

## 3. Impact / blast radius
- Today: none functionally (all diners +91). Contract-level defect: a `+61` diner would be found by lookup under `+61…` but created/matched by skip-otp under `+91…` → **two identities, wrong match key**, token issued for the wrong record.
- Who's affected: Customer App (already sending the field — zero change for them), any future international tenant.
- Files: `scan.py` only. Not a §14 file; **but** it is the identity path → full skip-otp/lookup regression. Risk **LOW** (default preserves today's behaviour byte-for-byte).

## 4. Options
| Option | Change | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | add `country_code: Optional[str] = "+91"`; pass to `normalize_phone`; rest unchanged | backwards compatible; mirrors lookup; 3 lines | none material |
| B | A + add `country_code` claim to JWT | token self-describing | touches `core/auth.py` + every consumer of `verify_customer_token`; not needed (customer_id is the key) — defer |
| C | reject unknown fields (`extra="forbid"`) | surfaces future contract drift loudly | would 422 any client sending extra keys today — breaking; no |

## 5. Fix — E6
```python
class SkipOTPRequest(BaseModel):
    phone: str
    restaurant_id: str
    country_code: Optional[str] = "+91"   # CR-102: mirror LookupRequest
…
phone, cc, pstatus = normalize_phone(req.phone, req.country_code)   # CR-102 (was normalize_phone(req.phone))
```
`normalize_phone` already returns `invalid` for a malformed cc (lookup relies on this) → existing 400 "Enter a valid mobile number" covers it. Response unchanged (`phone: req.phone` echo stays).

## 6. Tests — `tests/test_cr089_skip_otp.py`
- `test_C102a_cc_omitted_defaults_91`: `{"phone":"9838777712","restaurant_id":"689"}` → 200, same r689 doc, count unchanged.
- `test_C102b_foreign_cc_stored_idempotent`: `{"phone":"412345678","country_code":"+61","restaurant_id":"689"}` → 200 `is_new_customer:true`; doc `phone:"412345678"`, `country_code:"+61"`; second identical call → `is_new_customer:false`, no duplicate; **cleanup deletes the doc**; count back to snapshot.
- `test_C102c_cc_mismatch_distinct`: after C102b (before cleanup) `{"phone":"412345678","country_code":"+91",…}` → 400 (9 digits invalid for +91) — proves cc is honoured, not ignored.
- `test_C102d_bad_cc_400`: `country_code:"abc"` → 400.

## 7. Verification matrix
| V | Case | Expected |
|---|---|---|
| V1 | cc omitted | identical to today (+91) |
| V2 | cc `+91` explicit (Customer App's current body) | identical to today |
| V3 | cc `+61` valid AU mobile | stored `+61`, idempotent, lookup with `+61` → `exists:true` |
| V4 | cc malformed | 400 |
| V5 | limiter key after E1 uses `{cc}{digits}` → `+61` and `+91` same digits are **different** buckets and different identities | by design |
| V6 | suites 089 · 093 · 085a (A2/A3) · 098 | PASS |
| V7 | customers snapshot before/after | equal |

## 8. Files · rollback · contract
**WILL change**: `backend/routers/scan.py` (`SkipOTPRequest` + 1 arg), `backend/tests/test_cr089_skip_otp.py`.
**WILL NOT touch**: `core/phone.py`, `core/auth.py` (JWT), lookup, `pos.py`, frontend, stored data.
Rollback: `git revert`; any `+61` test doc deleted by test teardown.
**Contract**: additive field → `CONTRACT_CUSTOMER_APP_CRM` v1.1 note "skip-otp accepts optional `country_code` (default +91)"; change-log entry for Customer App (informational — they already send it). **CR-096** schema must include `country_code` (noted in its IA).

## 9. Sequencing
Implemented in the **same pass as BUG-025/026/027 + BUG-029** (owner Q-B), inside E1's block (cc must be computed before the canonical limiter key).

```
Planning complete: CR-102
Stage: Impact Analysis + Implementation Plan
Code reality: NONE (field absent, silently dropped)
Risk: LOW
Files WILL change: backend/routers/scan.py (SkipOTPRequest + normalize_phone arg) · backend/tests/test_cr089_skip_otp.py
Files WILL NOT touch: core/phone.py · core/auth.py · lookup block · routers/pos.py · frontend · stored data
Owner decisions: Option A vs B (JWT cc claim) — recommend A
Docs: planning/CR_102_IMPACT_AND_IMPL_PLAN.md
Next: Gate approval → Implementation (bundled with BUG-025/026/029)
```
**OWNER APPROVAL REQUIRED** — Risk LOW. Approve Option **A** (no JWT change)?
