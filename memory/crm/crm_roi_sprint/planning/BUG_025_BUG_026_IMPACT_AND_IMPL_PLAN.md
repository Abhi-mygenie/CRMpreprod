# BUG-025 + BUG-026 — Impact Analysis & Implementation Plan
**Date**: 2026-10-09 · **Role**: Planning Agent · **Intake**: `discovery/SESSION_2026_10_09_BATCH_INTAKE_BUG025_BUG028_CR099.md` · **Status**: ✅ OWNER APPROVED 2026-10-09 (Q1 = A · Q2 = Yes · Q3 = Yes · Q4 → CR-100, IA only) — implementation gate opens on "choose implementation role" · **No code changed.**

---
## PART 1 — BUG-025: skip-otp per-phone limiter bucket not canonical

### 1.1 Code reality (read-only, 2026-10-09)
| Fact | Evidence |
|---|---|
| Limiter runs **before** normalisation; key = `so-ph:{rid}:{re.sub(r"\D","",req.phone)}` | `routers/scan.py:208-215` |
| Canonical phone computed **after** the limiter: `normalize_phone(req.phone)` → 400 on invalid | `scan.py:219-221` |
| `lookup` (CR-093) already keys its bucket on canonical `{cc}{phone}` — but normalises (and 400s) **before** both limiters | `scan.py:283-293` |
| Limiter helper shared, Mongo TTL sliding window | `scan.py:60-74` |
| Live repro: 5× `9838777712` → 200; `+91 9838777712` → 200; `09838777712` → 200; plain → 429 `Retry-After 292` | `test_reports/iteration_6.json` I1 |
| Identity unaffected: all three variants match the same r689 doc (`country_code:+91`) — no duplicate | same |
| `SkipOTPRequest` has no `country_code` field (lookup does) | `scan.py:192-194` |

### 1.2 Root cause
CR-089 (limiter) was written before CR-085-A (canonical phone). 085-A moved identity matching to `normalize_phone()` but did not touch the limiter key (explicitly out of 085-A scope: "stored value untouched"). Result: three bucket keys for one diner.

### 1.3 Impact / blast radius
- Abuse: per-phone cap 5/5 min can be stretched to ~15/5 min (`+91`, `0`, plain; also `91…` 12-digit, `+91-…` etc.). IP cap 30/min still applies. No data impact.
- Who's affected: `/scan/auth/skip-otp` callers only (Customer App). No POS, no CRM UI, no stored data. **Not a §14 file.**
- Risk: **LOW**.

### 1.4 Design decision — order of operations (Q1)
| Option | Order | Pros | Cons |
|---|---|---|---|
| **A (recommended)** | IP bucket → `normalize_phone` → 400 if invalid → phone bucket on `{cc}{digits}` | invalid-phone spam still consumes the IP bucket (can't probe for free); phone bucket never polluted by junk keys; one normalisation call | differs slightly from lookup's order |
| B | `normalize_phone` → 400 → IP bucket → phone bucket | identical to lookup (`scan.py:283-293`) | invalid-phone requests bypass **both** buckets (free 400s; no DB write — cheap, but a probe vector) |
Recommendation: **A**. (Optional follow-up, not in this bug: align lookup to A too.)

### 1.5 Edit (E1) — `routers/scan.py:206-221` (one block)
```python
full_restaurant_id = _normalize_restaurant_id(req.restaurant_id)
# CR-089 + BUG-025: IP bucket first (invalid phones still count), then canonical phone bucket.
retry = await _lookup_rate_limited(f"so-ip:{_client_ip(request)}", *_SKIP_OTP_IP_LIMIT)
if retry:
    raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(retry)})
# CR-085 W13: canonical phone; diner is present → reject invalid (Option A).
phone, cc, pstatus = normalize_phone(req.phone)
if pstatus == "invalid":
    raise HTTPException(status_code=400, detail="Enter a valid mobile number")
retry = await _lookup_rate_limited(f"so-ph:{full_restaurant_id}:{cc}{phone}", *_SKIP_OTP_PHONE_LIMIT)  # BUG-025: key = canonical {cc}{digits}
if retry:
    raise HTTPException(status_code=429, detail="Too many login attempts", headers={"Retry-After": str(retry)})
now = ...
```
Removes the `phone_key = re.sub(...)` line and the 2-tuple loop; `re` import stays if used elsewhere (check; drop if unused). Limits, window, messages, `Retry-After` unchanged. Bucket key format changes `so-ph:{rid}:{digits}` → `so-ph:{rid}:+91{digits}` — old keys expire via TTL within 5 min; no migration.

### 1.6 Tests (E2) — `tests/test_cr089_skip_otp.py`
- New `test_S4c_phone_bucket_canonical`: clear buckets; 5× `9838777712` (distinct IPs) → 200; 6th `+91 9838777712` → **429** with `Retry-After`; 7th `09838777712` → 429; 8th `98387 77712` → 429. Assert no new r689 customer.
- New `test_S4d_invalid_counts_toward_ip`: 1× `0000000000` from fresh IP → 400; Mongo has `so-ip:<ip>` row and **no** `so-ph:` row for it.
- `test_S6_mongo_keys_present`: regex `^so-ph:.*:\+\d` to assert canonical form.
- Existing S1–S10 unchanged.

### 1.7 Verification matrix
| V | Case | Expected |
|---|---|---|
| V1 | 5 plain + prefixed variants (S4c) | 429 on 6th regardless of format |
| V2 | invalid phone | 400; IP bucket consumed; no phone bucket |
| V3 | S3 IP limiter 30 → 429, S3b recovery | unchanged |
| V4 | S4 phone limiter plain 5 → 429 | unchanged |
| V5 | S5 lookup separate bucket (`ph:` vs `so-ph:`) | unchanged |
| V6 | `test_cr085a_normalization.py` A2/A3 (skip-otp) + `test_cr093_lookup.py` | PASS |
| V7 | customers count 7700 before/after | unchanged |

### 1.8 Files · rollback · risks
**WILL change**: `backend/routers/scan.py` (one block, ~12 lines), `backend/tests/test_cr089_skip_otp.py`.
**WILL NOT touch**: `core/phone.py`, `pos.py`, `customers.py`, lookup route, limits/constants, frontend, stored data.
Rollback: `git revert`; TTL purges new-format keys.
Risk: LOW. Only behavioural change: a diner alternating formats is now throttled as one — intended.

---
## PART 2 — BUG-026: `tests/test_cr098.py` fixtures use phones that are now invalid

### 2.1 Code reality
| Fact | Evidence |
|---|---|
| `customer_token` fixture (P5/P6/P9) → skip-otp `1234567890` @ `test_restaurant` | `test_cr098.py:38-46` |
| `test_p5_skip_otp_second_phone` → `8888888888` @ `test_restaurant` | `:77-81` |
| Both numbers **invalid** under 085-A rule (`1234567890` first digit not 6-9; `8888888888` all-same) → 400 → fixture ERROR ×3 + FAIL ×1 | `iteration_6.json` I9 |
| Those two docs are the **only** customers of tenant `pos_0001_restaurant_test_restaurant` (no `users` doc exists for it) and the only 2 customers with a dead `password_hash` | Mongo probe; `DECISIONS_LOG` 2026-10-08 D-2 "leave it" |
| `test_p9b_skip_otp_689` uses `9876543210` r689 — legacy doc has **no `country_code`** → `phone_match(…,"+91")` misses → **creates a new doc every run** (this is BUG-027's root cause; same for `test_cr084_cr097.py:64`) | Mongo: doc `a38df87d…` lacks `country_code`; 53 such docs DB-wide (CR-085 IA "53 missing cc") |

### 2.2 Impact
- Product behaviour is **correct**: the two password-holding test records are unreachable by design (invalid phones + skip-otp is the only path). Consequence worth recording: CR-098's "password-holder still logs in via skip-otp" guarantee is now moot for these two records — nothing to preserve.
- Test intent to keep: (P5) skip-otp works; (P6) `/auth/me` body never contains `password_hash`; (P9) profile + customers list 200.
- The missing-`country_code` legacy docs are a **product data gap** (identity miss → silent duplicate on skip-otp). Fix path = CR-085-B (data; deferred, report-first). Tests must not depend on such docs meanwhile.

### 2.3 Edits (tests only)
**E3** `tests/test_cr098.py`
- `customer_token` fixture → skip-otp `{"phone": "9838777712", "restaurant_id": "689"}` (existing r689 doc **with** `country_code:+91`, name `binit`). Docstring updated: "P5 — skip-otp sole path; password-holder test records are unreachable by design (invalid phones)."
- `test_p5_skip_otp_second_phone` → phone `9876543210`→ **no**: use a second r689 doc that has `country_code` (pick from `EXISTING_PHONES` list already used by `test_cr089_skip_otp.py`, e.g. index 35) — assert 200 + token, and assert r689 customer count unchanged before/after.
- `test_p6_me_with_token`: drop `name == "Security Researcher"`; assert `data["id"]` present and `"password_hash" not in r.text`.
- `test_p9b_skip_otp_689`: switch `9876543210` → same cc-bearing phone as fixture; add count-unchanged assertion.
- Add module-scoped `baseline` fixture + `test_zz_count_unchanged` (pattern from `test_cr085a_normalization.py`).
**E4** `tests/test_cr084_cr097.py:64` (`test_v5a_skip_otp_valid`): same phone swap `9876543210` → `9838777712` + count assertion. *(This is the BUG-027 half that lives in the same two files — included here so the suites stop leaking; the ad-hoc r478 leak has no test owner → closed as cleaned.)*

### 2.4 Verification
| V | Case | Expected |
|---|---|---|
| V8 | `pytest tests/test_cr098.py -n 1` | 13/13 PASS, 0 errors |
| V9 | `pytest tests/test_cr084_cr097.py -n 1` | 15/15 PASS |
| V10 | customers count before/after each suite | 7700 → 7700 |
| V11 | grep tests for `1234567890`, `8888888888`, `9876543210` | 0 hits in skip-otp calls (404-route probes with `9876543210` body at `test_cr084_cr097.py:43` are fine — route is dead) |

### 2.5 Files · risk
**WILL change**: `backend/tests/test_cr098.py`, `backend/tests/test_cr084_cr097.py`. **WILL NOT touch**: any application code, any stored document (the two password-holder docs stay until the D-3 hygiene CR).
Risk: LOW (tests only).

---
## Owner decisions
| Q | Question | Recommendation |
|---|---|---|
| **Q1** (BUG-025) | Limiter order: **A** IP bucket → normalise/400 → canonical phone bucket, or **B** normalise/400 first (mirror lookup) | **A** |
| **Q2** (BUG-026) | Fold the BUG-027 test-leak fix (E4 + count assertions) into this pass since it's the same two files? | **Yes** |
| **Q3** (record only) | Note in DECISIONS_LOG that the 2 `test_restaurant` password-holders are unreachable by design (invalid phones) and will go with the D-3 hygiene CR — no action now | **Yes** |
| **Q4** (info) | Legacy docs without `country_code` (53) cause silent duplicates on skip-otp today — stays CR-085-B scope (data, end of batch), or do you want a tiny forward-fix CR (match `country_code: {$in:[cc, null]}` when cc=+91) sooner? **§14 identity rule → needs your call; not in this plan.** | raise at 085-B; flag for CR-085-B report priority |

## Edit order
E3 + E4 (tests red/green against current code) → E1 → E2 → run 089 suite, 098 suite, 084/097 suite, 085a A2/A3, 093 suite (one at a time, clear `scan_lookup_attempts` between) → QA handover.

```
Planning complete: BUG-025 · BUG-026 (+ BUG-027 test half, Q2)
Stage: Both (Impact Analysis + Implementation Plan)
Code reality: BUG-025 PARTIAL (limiter live, key stale) · BUG-026 FULL (tests exist, data stale)
Risk: LOW
Files WILL change: backend/routers/scan.py (skip-otp block) · tests/test_cr089_skip_otp.py · tests/test_cr098.py · tests/test_cr084_cr097.py
Files WILL NOT touch: core/phone.py · routers/pos.py · routers/customers.py · lookup route · frontend · stored data
Owner decisions: Q1 (order A/B) · Q2 (fold 027 tests) · Q3 (record) · Q4 (info — 085-B)
Docs: planning/BUG_025_BUG_026_IMPACT_AND_IMPL_PLAN.md
Next: Gate approval → Implementation
```

**OWNER APPROVAL REQUIRED**
Reason: changes request handling on the only diner identity path (`/scan/auth/skip-otp`) — limiter key + order; plus test-suite edits.
Risk: LOW
Proposed next step: answer Q1–Q3 (Q4 info) → "choose implementation role for BUG-025 + BUG-026".
I will not proceed until owner approves.


## Owner rulings (2026-10-09)
Q1 **A** · Q2 **Yes** (E4 + count assertions in scope) · Q3 **Yes** (recorded in `DECISIONS_LOG.md`) · Q4 **alternative** → `CR-100` registered, `planning/CR_100_IMPACT_ANALYSIS.md`, plan gate closed. Owner rule: full validation test on production DB after all data changes.
