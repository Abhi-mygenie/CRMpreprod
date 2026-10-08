# CR-098 — Impact Analysis
## Retire customer password routes `POST /scan/auth/register` + `POST /scan/auth/login` (password)

**Date**: 2026-10-08 · **Role**: Planning Agent (Impact Analysis only — no code)
**Risk**: **HIGH** (auth route removal, API contract change) — security-positive, deletions only
**Registered**: dashboard row 098, 2026-10-08, P1. Source: Scan & Order Q-A (b); owner ruling "skip-otp is the ONLY path — Customer App drops the password page entirely"
**Also answers owner's question**: single plan with CR-093, or one after another? → **§6**

---

## 1. Code reality — FULL (both routes live)
| Artefact | Location | Live probe 2026-10-08 (`{}` body, read-only) |
|---|---|---|
| `class CustomerRegister` (phone, name, password, restaurant_id, email) | `scan.py:51-56` | — |
| `class CustomerLogin` (phone, password, restaurant_id) | `scan.py:59-62` | — |
| `POST /scan/auth/register` — sets `password_hash` on existing customer or creates one | `scan.py:242-289` | **422** (live) |
| `POST /scan/auth/login` — verifies `password_hash`, mints customer token | `scan.py:292-308` | **422** (live) |
| `hash_password`, `verify_password` imports | `scan.py:15` | only used by the two routes above → become dead |
| `{"password_hash": 0}` projections | `scan.py:234, 320` | harmless field exclusions in `/auth/me` and `/profile`; keep (field still exists on 2 docs) |
| Control: `POST /scan/auth/lookup` | — | **404** (CR-093 not built — confirms what "removed" looks like) |

## 2. Data reality (preprod, read-only)
| Fact | Value |
|---|---|
| Customers total | 7,737 |
| With `password_hash` | **2** — both `pos_0001_restaurant_test_restaurant`, created 2026-08-11 (security tester: "Security Researcher", "TestUser") |
| Real diners using password path | **0** |
| Writes outside scan.py to `customers.password_hash` | **0** (`customers.py`, `pos.py`, `core/*` — no refs) |

## 3. Data-flow trace — what is severed
```
Customer App /password-setup ──► POST /scan/auth/register ──► customers.password_hash   [REMOVED]
Customer App /password-setup ──► POST /scan/auth/login    ──► verify → token             [REMOVED]
Customer App landing          ──► POST /scan/auth/skip-otp ──► find-or-create → token    [STAYS — the only path]
Customer App landing          ──► POST /scan/auth/lookup   ──► read-only {exists,name}   [CR-093 — to be built]
```
After removal: `skip-otp` still logs the 2 password-holders in (it never read the hash). No diner is locked out.

## 4. Downstream consumers
| Consumer | Impact | Evidence / action |
|---|---|---|
| Customer App | `/password-setup` page calls both routes → 404 after ship | Owner ruling (a): they drop the page. Reply sent 2026-10-08 (`handoff/CRM_REPLY_TO_SCAN_ORDER_QA_IDENTITY_PATH_2026_10_08.md` §b) |
| POS | none | no `/scan/*` usage |
| CRM UI | none | no frontend file calls these routes (grep 0) |
| Contract v1.0 §4a | lists 1.2 register / 1.3 login (INV-017 contract v2 §1.2–1.3) | mark REMOVED in change-log row → consolidated contract v2 |
| CR-089 skip-otp guard rails | Q2 "block password-holders" becomes **moot** | note on dashboard row 089 at closure |
| DB | 2 docs keep a now-meaningless `password_hash` field | leave; optional `$unset` in a later hygiene CR (with D-3 collections) |

## 5. Risk
| Dimension | Rating | Note |
|---|---|---|
| Auth-adjacent | HIGH | deletions only; `skip-otp`, `verify_customer_token`, `create_customer_token` untouched |
| Contract | HIGH | 2 public routes → 404; Customer App already instructed |
| Data | LOW | no writes |
| Security | POSITIVE | removes an unauthenticated route that can set a password on any existing customer by phone (`register` on existing record, `scan.py:258-263`) |
| Rollback | LOW | git revert |

## 6. Dependency check — one plan with CR-093, or sequential?
| Question | Finding |
|---|---|
| Do 093 and 098 touch the same file? | Yes — both edit `scan.py` "C1 – Customer Authentication" block (098 deletes L242-308; 093 inserts a new route in the same block + a `LookupRequest` model in Request Schemas). Same-file edits in one session = **no merge conflict**; sequential sessions would re-anchor line numbers. |
| Does 093 depend on 098's code? | **No.** `lookup` reads `customers` only; doesn't care whether `password_hash` exists. |
| Does 098 depend on 093? | **No.** Removing password routes is safe today (skip-otp still logs everyone in). |
| Shared verification? | Yes — same QA session: login baseline, `skip-otp` alive, `/auth/me`, `/profile`. One QA pass instead of two. |
| Shared external notice? | Yes — one change-log entry to Customer App ("two routes gone, one route new"). One cut-over for them instead of two. |
| Risk of combining? | Only size: 093 is a **new** public route (rate-limit, index, normalisation ≈ 2 h); 098 is deletion (≈ 30 min). Combined plan still < half a day. If 093 QA fails, 098 is trivially separable (independent commits). |
| Owner promise | Both w/c 13 Oct, "ships with 093" — already communicated to Scan & Order. |

**Recommendation: ONE Implementation Plan, TWO independent commits, ONE QA pass.**
Order inside the plan: **098 first** (delete, shrink the auth block), **then 093** (add `lookup` into the clean block). Reason: writing the new route after the deletions means the final file reads as "C1: skip-otp · me · lookup" with no dead code between; and if 093 slips, 098 is already done and verifiable alone.

## 7. Files WILL change / WILL NOT touch (CR-098 only; 093 adds its own in the plan)
**WILL change (1)**: `backend/routers/scan.py` — delete `CustomerRegister`, `CustomerLogin`, both routes; trim `hash_password`, `verify_password` from import; `CR-098` marker.
**WILL NOT touch**: `skip-otp`, `/auth/me`, `/profile*`, `core/auth.py` (`hash_password`/`verify_password` still used by `auth.py` mygenie_login), frontend, DB.

## 8. Verification matrix (CR-098 part; to be merged into the combined plan)
| # | Check | Expected |
|---|---|---|
| P1 | `POST /api/scan/auth/register` · `POST /api/scan/auth/login` | 404 (pre-change 422) |
| P2 | `POST /api/scan/auth/skip-otp` `{}` | 422 (alive) |
| P3 | `skip-otp` with phone `1234567890` on `restaurant_id: test_restaurant` (one of the 2 password-holders) | 200 + token — proves no lock-out |
| P4 | `GET /api/scan/auth/me` with that token | 200, no `password_hash` in body |
| P5 | `python3 -m pyflakes routers/scan.py` | no unused `hash_password`/`verify_password` |
| P6 | grep `CustomerRegister\|CustomerLogin\|hash_password\|verify_password` in `scan.py` | 0 hits (except CR-098 marker) |

## 9. Owner decisions
| # | Decision | Status |
|---|---|---|
| D-1 | Combine with CR-093 in one Implementation Plan (two commits, one QA) — §6 | ⏸ |
| D-2 | `$unset password_hash` on the 2 test docs now, or defer with D-3 hygiene | recommend defer | ⏸ |
| D-3 | Open Implementation Plan gate for 093 + 098 | ⏸ **GATE** |

```text
Planning complete: CR-098
Stage: Impact Analysis
Code reality: FULL (2 live routes, 2 test-only password holders)
Risk: HIGH (auth route removal; security-positive)
Files WILL change: backend/routers/scan.py
Files WILL NOT touch: skip-otp, /auth/me, /profile, core/auth.py, frontend, DB
Owner decisions: D-1 combine with 093 · D-2 unset test hashes (defer) · D-3 open Impl Plan gate
Dependency verdict: 093 ⟂ 098 (independent); same file → one plan, two commits, 098 first
Docs: planning/CR_098_IMPACT_ANALYSIS.md
Next: Gate approval → combined Implementation Plan 093+098
```
