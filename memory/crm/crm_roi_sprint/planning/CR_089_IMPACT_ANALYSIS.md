# CR-089 — Impact Analysis
## `skip-otp` guard rails — rate-limit the only diner identity path

**Date**: 2026-10-09 · **Role**: Planning Agent (Impact Analysis; no code)
**Risk**: **HIGH** (auth-adjacent; the Customer App's only live login; behaviour change on a public route = contract change). Intake said MEDIUM — upgraded because since CR-084/098 this route is the *sole* identity path.
**Owner rulings**: Q1 **(a) implement** · Q2 **moot** after CR-098 · D-1 **30/min/IP, 5/5min/phone** · D-2 **separate counters** · D-3 **hold at IA** (all 2026-10-09). **IMPACT ANALYSIS GATE CLOSED 2026-10-09.**
**Source**: GAP-06 (INV-017) · intake `discovery/SESSION_2026_09_15_BATCH_INTAKE_CR084_CR090.md` §6

---

## 1. Code reality — FULL (route live, no guard)
| Item | Location | Fact |
|---|---|---|
| `POST /scan/auth/skip-otp` | `scan.py:186-222` | find `{phone, user_id}` exact string → else **insert** customer (`name:""`, `country_code:"+91"`, Bronze) → `create_customer_token` 24 h |
| Rate limit | — | **none** |
| Phone validation | — | **none** — `req.phone` stored verbatim (CR-085 scope) |
| Limiter already in file | `scan.py:48-75` `_client_ip`, `_lookup_rate_limited` (CR-093) | Mongo `scan_lookup_attempts`, TTL, keys `ip:` / `ph:` — **directly reusable**; route signature just needs `request: Request` |
| Live probe (read-only) | `{}` → **422** | alive; no 429 path exists |
| Callers | Customer App landing (silent login); 3 CRM test files (`test_cr084_cr097`, `test_cr098`, `test_cr093_lookup`) | tests send ≤2 calls each — unaffected by limits |

## 2. Data reality (preprod, read-only, 2026-10-09)
| Fact | Value |
|---|---|
| Blank-name customers (auto-created by skip-otp/OTP) | 21, spread over 5+ restaurants, max 4 per restaurant |
| Creation bursts (≥3 blank-name in one minute) | **0** — no abuse observed yet |
| `scan_lookup_attempts` rows | 0 (TTL working; lookup limiter idle) |
Conclusion: the hole is real (anyone can mass-create customers for any restaurant with a loop) but **unexploited so far** — this is preventive.

## 3. Threat → control
| Threat | Today | After CR-089 |
|---|---|---|
| Script creates 10k junk customers for restaurant X | unlimited | ≤ IP limit/min; each phone also capped |
| Token-mint for any known phone (impersonation) | 1 call, unlimited retries | still 1 call (by design — Q-A (c) ruling: skip-otp *is* login); but enumeration is throttled |
| Brute-force phone space | unlimited | IP limit makes it impractical |
| Legit diner retries (bad network) | fine | fine — 5 per 5 min per phone is far above real use |

## 4. Design (reuse CR-093)
- Add `request: Request` to `skip_otp_login`; before the DB read, run the **same two keys** through `_lookup_rate_limited`:
  `ip:{client_ip}` and `ph:{full_restaurant_id}:+91{phone_digits}` — **shared counters with `lookup`?** → see D-2.
- 429 → `{"detail":"Too many login attempts"}` + `Retry-After` (same shape as lookup → Customer App handles both identically).
- No change to find-or-create, token TTL, response body.
- No phone normalisation in this CR (CR-085); but the limiter key should use digits-only so `"98765 43210"` and `"9876543210"` share a bucket — key-only normalisation, stored value untouched.

## 5. Downstream consumers
| Consumer | Impact | Action |
|---|---|---|
| Customer App | new 429 possible on landing flow; must back off per `Retry-After`. Their `lookup`→`skip-otp` sequence = 2 calls per visit → well under limits. | consumer validation note (rule 2026-10-08) |
| POS | none | — |
| CRM UI / tests | none; tests ≤2 calls | — |
| Contract v1.0 §4a `skip-otp` | add 429 row | change-log |

## 6. Risk
| Dimension | Rating | Mitigation |
|---|---|---|
| Lock out real diners | **Main risk** | limits generous (D-1); per-phone key means one diner can't starve another; IP key shared behind a restaurant Wi-Fi NAT → see D-1 note |
| Shared-NAT false positives | Medium | a full restaurant on one Wi-Fi = one IP. 10/min/IP could trip at a busy counter. Recommend IP limit **30/min** for skip-otp (vs 10 for lookup) |
| Regression on find-or-create | Low | limiter runs before, logic untouched |
| Rollback | trivial | remove 6 lines |

## 7. Files WILL change / WILL NOT touch
**WILL change (1)**: `backend/routers/scan.py` — `skip_otp_login` signature + limiter block + constants.
**WILL NOT touch**: `_lookup_rate_limited`, `lookup`, `/auth/me`, token creation, `server.py` (indexes already exist), frontend, DB docs.

## 8. Verification (preview; to be matrix in plan)
S1 `{}` 422 · S2 valid → 200 token (unchanged) · S3 31 calls same IP → 429 at 31 with `Retry-After` · S4 6 calls same phone, different IPs → 429 at 6 · S5 limits independent of `lookup` counters (or shared — per D-2) · S6 customers count +1 only for the one genuinely new phone used · S7 regression: lookup, `/auth/me`, staff login · S8 tests `test_cr084_cr097`, `test_cr098`, `test_cr093_lookup` still green.

## 9a. D-2 walk-through — separate vs shared counters (plain English)
The limiter is just a tally: *"how many times has key K been seen in the last N seconds?"* Each route decides what K is.

**Shared** — both routes use the same keys (`ip:1.2.3.4`, `ph:689:+919876543210`). The Customer App's normal flow is `lookup` then `skip-otp` for the same phone from the same device → **2 ticks on the same key per visit**. With a 5-per-5-min phone budget a diner gets 2½ visits before 429, and a busy counter on one Wi-Fi IP spends its IP budget twice as fast. One misbehaving route also starves the other.

**Separate** — skip-otp uses its own prefixes (`so-ip:`, `so-ph:`). Each route has its own budget: lookup 10/min/IP + 5/5min/phone, skip-otp 30/min/IP + 5/5min/phone. A normal visit costs 1 tick on each, independently. Abuse of one route cannot lock a diner out of the other; tuning one limit never changes the other. Cost: zero — same collection, same TTL, just a different string prefix.

**Why separate wins here:** the two routes have different jobs (question vs login) and different legitimate call patterns, so they deserve different budgets; and the Customer App must never be told "too many logins" because it asked a few questions first.

## 9. Owner decisions
| # | Decision | Recommendation |
|---|---|---|
| D-1 | Limits for skip-otp | **FINAL 2026-10-09: IP 30/min, phone+restaurant 5 per 5 min** |
| D-2 | Share counters with `lookup` or separate? | **FINAL 2026-10-09: Separate** (prefix `so-ip:` / `so-ph:` vs lookup's `ip:` / `ph:`). Walk-through in §9a. |
| D-3 | Open Implementation Plan gate | Owner 2026-10-09: **hold — Impact Analysis only**. IA gate CLOSED; plan not written. |

```text
Planning complete: CR-089
Stage: Impact Analysis
Code reality: FULL (route live, zero guard; limiter from CR-093 reusable)
Risk: HIGH (sole identity path; new 429 on public route)
Files WILL change: backend/routers/scan.py (skip_otp_login only)
Files WILL NOT touch: lookup, limiter helper, token logic, server.py, frontend, DB
Owner decisions: D-1 FINAL (30/min/IP, 5/5min/phone) · D-2 FINAL separate counters · D-3 HOLD (IA only)
Docs: planning/CR_089_IMPACT_ANALYSIS.md
Next: owner opens Implementation Plan gate when ready
```
