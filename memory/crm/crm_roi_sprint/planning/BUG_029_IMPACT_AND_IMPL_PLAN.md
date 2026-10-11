# BUG-029 — Impact Analysis & Implementation Plan
## `/scan/auth/lookup` rejects invalid phones **before** its IP bucket → probes are free
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_INTAKE_CR101_BUG029_BUG030_PROC001.md` · **Owner Q-A = yes** (plan separately, implement with BUG-025) · **Status**: ⏸ OWNER APPROVAL REQUIRED · **No code changed.**

## 1. Code reality (read-only, 2026-10-09)
| Fact | Evidence |
|---|---|
| Lookup order today: `normalize_phone` → **400** on invalid → `_normalize_restaurant_id` → `ip:` bucket (10/60 s) → `ph:` bucket (5/300 s, canonical `{cc}{phone}`) | `scan.py:283-293`, limits `:49-50` |
| An invalid-phone request returns 400 **without** touching `scan_lookup_attempts` (no DB write, no counter) | `:284-285` precede both limiter calls |
| skip-otp (after BUG-025 E1) will be: `ip` bucket → normalise/400 → `ph` bucket — owner Q1 = **A** | `planning/BUG_025_BUG_026_IMPACT_AND_IMPL_PLAN.md` §1.4 |
| Lookup is public (no auth), read-only, never creates (CR-093 Q2) | `:281-282` |
| Customer App calls lookup on blur/submit only (debounced) — their 2026-10-09 reply §3 | validated |

## 2. Root cause
CR-093 placed validation first for a clean 400 path; CR-089's limiter design (later refined by owner Q1 = A) chose "IP bucket first so junk still counts". Lookup was never revisited → inconsistent with skip-otp.

## 3. Impact / blast radius
- Abuse: unlimited invalid-phone requests to lookup are never counted → cheap noise/probe vector (each is a 400 with no DB access, so **cost to us is minimal**; value to an attacker is nil — invalid phones can't enumerate anything). Severity stays **P3**.
- Who's affected: `/scan/auth/lookup` callers only (Customer App). No POS, no CRM UI, no data.
- Not a §14 file/rule. Risk **LOW**.

## 4. Fix — E5 (`scan.py:283-293`, one block)
```python
full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
# BUG-029: IP bucket first so invalid phones still count (same order as skip-otp, BUG-025 Q1=A)
retry = await _lookup_rate_limited(f"ip:{_client_ip(request)}", *_LOOKUP_IP_LIMIT)
if retry:
    raise HTTPException(status_code=429, detail="Too many lookups", headers={"Retry-After": str(retry)})
phone, cc, pstatus = normalize_phone(req.phone, req.country_code)  # CR-085 W14
if pstatus == "invalid":
    raise HTTPException(status_code=400, detail="Invalid phone or country_code")
retry = await _lookup_rate_limited(f"ph:{full_restaurant_id}:{cc}{phone}", *_LOOKUP_PHONE_LIMIT)
if retry:
    raise HTTPException(status_code=429, detail="Too many lookups", headers={"Retry-After": str(retry)})
```
Limits, keys, messages, `Retry-After`, response shapes unchanged. Only the order of the IP check vs. validation moves.

## 5. Tests — `tests/test_cr093_lookup.py`
- New `test_L11_invalid_consumes_ip_bucket`: fresh `X-Forwarded-For`; POST junk phone → 400; Mongo has `ip:<ip>` row, no `ph:` row for it.
- New `test_L12_ip_429_precedes_validation`: 10 valid-shape lookups from one IP → 11th **invalid** phone from same IP → **429** (not 400) — proves IP bucket is now first.
- Existing L1–L10 (18 tests) unchanged.

## 6. Verification matrix
| V | Case | Expected |
|---|---|---|
| V1 | invalid phone, fresh IP | 400 + `ip:` row written |
| V2 | 11th request (invalid) after 10 from same IP | 429 `Retry-After` |
| V3 | valid known phone (`9579504871`/689) | `exists:true, name:"MYGENieT"` unchanged |
| V4 | phone bucket 5/300 s on canonical key | 429 on 6th (unchanged) |
| V5 | `test_cr093_lookup.py` 18 + 2 new | PASS |
| V6 | `test_cr089_skip_otp.py` S5 (separate buckets `ph:` vs `so-ph:`) | PASS |
| V7 | customers count unchanged (lookup never creates) | snapshot == snapshot |

## 7. Files · rollback · risks
**WILL change**: `backend/routers/scan.py` lookup block (~10 lines reordered), `backend/tests/test_cr093_lookup.py`.
**WILL NOT touch**: skip-otp block (BUG-025's), `core/phone.py`, limits, frontend, stored data.
Rollback: `git revert`. Risk LOW. Behaviour change for a legit diner: none (valid lookups counted exactly as before).
Customer App: no change needed; informational line in the next change-log entry.

## 8. Dependencies / sequencing
Implemented in the **same pass as BUG-025/026/027** (owner Q-A), after E1 so both identity endpoints share one pattern. Independent of CR-102.

```
Planning complete: BUG-029
Stage: Impact Analysis + Implementation Plan
Code reality: PARTIAL (limiter live; order inconsistent with skip-otp)
Risk: LOW
Files WILL change: backend/routers/scan.py (lookup block) · backend/tests/test_cr093_lookup.py
Files WILL NOT touch: skip-otp block · core/phone.py · routers/pos.py · frontend · stored data
Owner decisions: none new (Q-A answered: yes, same pass)
Docs: planning/BUG_029_IMPACT_AND_IMPL_PLAN.md
Next: Gate approval → Implementation (bundled with BUG-025/026)
```
**OWNER APPROVAL REQUIRED** — Risk LOW. Approve E5 as written?
