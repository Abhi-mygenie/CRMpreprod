# CR-098 — Implementation Plan (ships FIRST, before CR-093)
## Retire customer password routes `POST /scan/auth/register` + `POST /scan/auth/login`

**Date**: 2026-10-08 · **Role**: Planning Agent · **Risk**: HIGH (auth route removal; security-positive) · **Effort**: ~30 min impl + 15 min QA
**Impact Analysis**: `planning/CR_098_IMPACT_ANALYSIS.md` (gate closed 2026-10-08)
**Owner rulings**: D-1 **separate plans, 098 then 093** · D-2 leave the 2 test `password_hash` fields (hygiene CR later) · D-3 plan gate open
**Gate**: ⏸ OWNER APPROVAL REQUIRED before implementation.

## 0. Pre-flight
```bash
cd /app/backend
grep -n "class CustomerRegister\|class CustomerLogin" routers/scan.py        # 51, 59
grep -n '@router.post("/auth/register")\|@router.post("/auth/login")' routers/scan.py   # 242, 292
grep -n "hash_password, verify_password" routers/scan.py                     # 15
grep -n "^# C2 - Customer Profile" routers/scan.py                            # 312
API=$(grep REACT_APP_BACKEND_URL /app/frontend/.env | cut -d= -f2)
for r in register login skip-otp; do printf "%-10s %s\n" $r $(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/scan/auth/$r" -H 'Content-Type: application/json' -d '{}'); done   # 422 422 422
```
Stop if anchors differ by more than a few lines.

## 1. Files WILL change / WILL NOT touch
**WILL change (1)**: `backend/routers/scan.py`
**WILL NOT touch**: `skip-otp` (L181-226), `/auth/me` (L229-239), `/profile*`, `core/auth.py`, `server.py`, frontend, DB documents, `.env`

## 2. Edits (all in `scan.py`)
| # | Range (pre-edit) | Action |
|---|---|---|
| E1 | L292-308 `@router.post("/auth/login")` … `return _resp(True, "Login successful", …)` + trailing blank lines up to `# ====` of C2 | delete; leave one marker line: `# CR-098: customer password login removed 2026-10 — skip-otp is the only diner identity path.` |
| E2 | L242-289 `@router.post("/auth/register")` … `return _resp(True, "Registration successful", …)` | delete; marker: `# CR-098: customer password register removed 2026-10 (could set a password on any existing customer by phone).` |
| E3 | L59-62 `class CustomerLogin` | delete |
| E4 | L51-56 `class CustomerRegister` | delete |
| E5 | L15 import | `get_current_user, hash_password, verify_password` → `get_current_user` (both only used by E1/E2; confirm `grep -c "hash_password\|verify_password" routers/scan.py` → 0 before trimming) |
Order: E1 → E2 → E3 → E4 → E5 (bottom-up keeps line anchors valid). Keep `{"password_hash": 0}` projections at `/auth/me` and `/profile` (harmless, field still on 2 docs).

## 3. Self-test (Implementation Agent)
| # | Check | Expected |
|---|---|---|
| P1 | `python3 -m py_compile routers/scan.py` · `python3 -m pyflakes routers/scan.py` | clean, no unused import |
| P2 | `sudo supervisorctl restart backend` → err log | no traceback |
| P3 | `POST /api/scan/auth/register` · `POST /api/scan/auth/login` `{}` | **404** |
| P4 | `POST /api/scan/auth/skip-otp` `{}` | 422 (alive) |
| P5 | `POST /api/scan/auth/skip-otp` `{"phone":"1234567890","restaurant_id":"test_restaurant"}` (one of the 2 password-holders) | 200 + `data.token` → proves no lock-out |
| P6 | `GET /api/scan/auth/me` with that token | 200, body has no `password_hash` |
| P7 | `POST /api/auth/login` owner creds (staff) | 200 — proves `core/auth.py` untouched |
| P8 | grep `CustomerRegister\|CustomerLogin\|hash_password\|verify_password\|/auth/register\|/auth/login` in `routers/scan.py` | 0 hits besides CR-098 markers |
| P9 | Regression: `GET /api/scan/profile` with P5 token → 200; `GET /api/customers?limit=1` staff JWT → 200 | PASS |

## 4. Rollback
Deletions only → `git revert`. No data change.

## 5. Exit-gate deliverables
1. Dashboard row 098 → 🟢 IMPLEMENTED + transition row
2. `CR-098` markers grep-able
3. QA handover `qa/CR_098_QA_HANDOVER.md` (P1-P9 + "re-run independently")
4. **Amend** `handoff/WAVE_CHANGE_LOG_FOR_SCAN_ORDER_AND_POS_AGENTS.md` → Wave 2 row "CR-098 — 2 routes → 404" CONFIRMED with date + evidence
5. Dashboard row 089: note "Q2 password-holder handling moot"
6. Session handover

## 6. Then
QA → owner smoke → Closure for 098 → **open CR-093 Implementation Plan** (`planning/CR_093_IMPLEMENTATION_PLAN.md`, already drafted, re-anchor line numbers after 098 lands).

```text
OWNER APPROVAL REQUIRED
Reason: start implementation after planning; auth-adjacent; 2 public API routes removed (contract change)
Risk: HIGH
Proposed next step: Implementation role — E1–E5, self-test P1–P9, QA handover
I will not proceed until owner approves.
```
