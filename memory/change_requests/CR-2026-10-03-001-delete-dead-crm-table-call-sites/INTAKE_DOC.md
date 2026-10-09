# INTAKE DOC — CR-2026-10-03-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-03-001 |
| **Title** | Delete the 14 dead CRM-table call sites in `server.py` (legacy pre-`/scan/*` customer API shim) |
| **Classification** | CR — CLEANUP (dead code / architecture boundary) |
| **Date Registered** | 2026-10-03 |
| **Reported By** | INV-2026-09-15-003 §6 · owner question **O7** — **approved by owner 2026-10-03** |
| **Severity** | **P3** (no user impact) — but it is the single largest reduction of CRM-boundary violations |
| **Risk** | **HIGH by file** — `backend/server.py` is a Part C CRITICAL hotspot (whole backend in one file). Removal only, no behaviour change. **No Fast Lane.** |
| **Status** | 📝 REGISTERED (Role 1 done) — owner approved scope, awaiting Planning |
| **Parent** | INV-2026-09-15-003 · scope carved out of CR-2026-09-12-006 (which stays blocked behind CR-005) |
| **Blast radius** | **MEDIUM** — 1 backend file, ~10 routes, 0 frontend files |

## 1. Problem (code truth, verified on `3oct` 2026-10-03)

`server.py` still contains the "Customer API shim" that predates the CRM `/scan/*` migration.
14 of the 20 direct touches on CRM-owned collections have **zero callers** in `frontend/src`
(verified by grep; the frontend uses `crmService.js` for all of these functions).

| # | Line | Route / branch | Collection | Op |
|---|---|---|---|---|
| C1 | 365 | `get_current_user` — `user_type == "customer"` branch | `customers` | R |
| C3 | 531, 539 | `POST /api/auth/login` — Step 1 customer branch | `customers` | R ×2 |
| C4 | 663 | `POST /api/auth/set-password` | `customers` | R |
| C5 | 674 | same | `customers` | **W** |
| C6 | 703 | same | `customers` | **W** insert |
| C7 | 728 | `POST /api/auth/verify-password` | `customers` | R |
| C8 | 1042 | `PUT /api/customer/profile` | `customers` | **W** |
| C9 | 1044 | same | `customers` | R |
| O1 | 820 | `GET /api/customer/orders` | `orders` | R |
| P1 | 973 | `GET /api/customer/points` | `points_transactions` | R |
| W1 | 997 | `GET /api/customer/wallet` | `wallet_transactions` | R |
| K1 | 1016 | `GET /api/customer/coupons` | `coupons` | R |
| F2 | 1308 | `GET /api/config/feedback/{rid}` | `feedback` | R |

Why dead: `Login.jsx` sends email+password only → always falls through to Step 2 (admin), so no
customer token is ever minted by our backend → C1 unreachable. `AuthContext.login()` is defined
but never called. Profile tabs read CRM via `crmService`. No admin page reads `feedback`.

## 2. Scope

**IN** — delete the routes and their branches:
`POST /api/auth/set-password`, `POST /api/auth/verify-password`, the customer branch of
`POST /api/auth/login` (≈L531–585), the customer branch of `get_current_user` (≈L364–365),
`GET`/`PUT /api/customer/profile`, `GET /api/customer/orders`, `/points`, `/wallet`, `/coupons`,
`GET /api/config/feedback/{rid}`. Delete now-unused Pydantic models and helpers left orphaned.

**OUT** — the 6 **live** sites: `check-customer` (C2 L494), `customer-lookup` (C10 L1539),
`loyalty-settings` (L1496) → **CR-2026-10-03-004**; `feedback` write (F1 L1303) →
**CR-2026-10-03-003**; the two `users` reads (L367, L587) → **CR-2026-10-03-002** + CR-2026-09-15-004.
Also OUT: the modular split itself (CR-2026-09-12-006), `/api/status`, any frontend file.

**GREY ZONE (Planning decides)** — whether to delete outright or quarantine with `# CR-2026-10-03-001:`
comment markers first (the pattern CR-2026-09-14-001 used for OTP). Owner preference needed.

## 3. Duplicate check

| Item | Relationship | Verdict |
|---|---|---|
| CR-2026-09-12-006 (backend modular split) | Originally held this scope; it is blocked behind CR-005 and is a *restructure*, not a deletion | **DISTINCT** — this CR is carved out so it can ship independently |
| INV-2026-09-12-001 (legacy `customer/*` route trace) | Confirmed FE does not call `/api/customer/*`; deletion wording was withdrawn pending owner decision — **owner has now decided (O7)** | RELATED — evidence source |
| CR-2026-09-15-004 | Touches the *same two functions* (`get_current_user`, `/api/auth/login`) for the admin branch | **RELATED — must be sequenced**, not merged |
| CR-2026-07-03-002 (remove dead restaurant-info fetch) | Same category, different code | DISTINCT |

## 4. Code exists? **FULL** — removal only.

## 5. Files

| Will change | Will NOT touch |
|---|---|
| `backend/server.py` (only) | any frontend file · `.env` · `customer_app_config` · DB documents |

## 6. Acceptance criteria

1. `grep -n "db.customers\|db.orders\|db.points_transactions\|db.wallet_transactions\|db.coupons" server.py` returns **only** C2 (L494), C10 (L1539).
2. `grep -c "db.feedback" server.py` = 1 (the write, pending CR-003).
3. Admin login, `/api/auth/me`, config save for rid 689 unaffected (UAT creds in `memory/test_credentials.md`).
4. Customer flows unaffected end-to-end: QR scan → landing → menu → cart → place order → order success → Profile tabs.
5. Backend starts clean; `/api/healthz` 200; no `NameError` from orphaned models/helpers.
6. No route listed in §2 OUT is removed or altered.

## 7. Prerequisites
- Owner approval of the Implementation Plan (hotspot file — Part C, no Fast Lane).
- Decision on delete-vs-quarantine (§2 grey zone).
- Sequence note: land **before** CR-2026-09-15-004 (which rewrites the admin branches of the same two functions).

```text
Intake complete: CR-2026-10-03-001
Classification: CR — CLEANUP
Severity: P3
Risk: HIGH (hotspot file backend/server.py; removal only)
Duplicate check: DISTINCT (related: CR-2026-09-12-006, INV-2026-09-12-001, CR-2026-09-15-004)
Evidence: captured (line-verified on 3oct 2026-10-03; frontend caller grep)
Blast radius: MEDIUM
Docs updated: this file, ../README.md, ../../PRD.md
Next: Planning (Impact Analysis + Implementation Plan)
```
