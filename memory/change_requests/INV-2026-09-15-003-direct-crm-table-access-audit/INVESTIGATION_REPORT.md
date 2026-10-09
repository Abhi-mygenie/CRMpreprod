# INVESTIGATION REPORT — INV-2026-09-15-003
## Direct access to CRM-owned tables (bypassing CRM API) — full audit

**Date:** 2026-09-15 (session continued)
**Role:** 6 — INVESTIGATION (read-only, no code)
**Owner rule under test:** *"We should not be touching any table written by CRM."*
**Status:** COMPLETE — 8 CRM-owned collections touched directly; 5 live call sites, 10 dead

### Classification (added 2026-10-03 during registry-sync audit — §5 requires a risk label on every item)

| Field | Value |
|---|---|
| **Severity** | **P1** — no outage, but it establishes a live architecture-boundary violation and one wrong-schema write into a CRM-owned collection |
| **Risk** | **CRITICAL** — §5 triggers: *database*, *shared state*, *integration*, *customer-impacting data*. Findings touch auth, a shared production-grade DB, and a live write into another team's collection |
| **Duplicate check** | **DISTINCT.** Parent of CR-2026-10-03-001…005; related to INV-2026-09-15-002 (ownership map) and INV-2026-09-12-001 (legacy route trace), neither of which audited direct table access |
| **Evidence** | **captured** — 20 call sites enumerated with file:line, each classified live/dead by frontend-caller grep; re-verified against branch `3oct` on 2026-10-03 |
| **Blast radius** | **LARGE** — findings span `server.py` plus 4 frontend pages, and set the scope of five downstream CRs |
| **Outcome** | Fully discharged: all 20 sites are now covered by a registered item, and the agreed target state is frozen in `control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md` v1.0 Part 1 |

```text
Intake complete: INV-2026-09-15-003
Classification: INVESTIGATION (architecture boundary audit)
Severity: P1 · Risk: CRITICAL · Duplicate check: DISTINCT · Evidence: captured · Blast radius: LARGE
Docs updated: this file, ../README.md, ../../PRD.md, ../../control/CONTRACT_CUSTOMER_APP_CRM_v1.0.md
Next: CLOSED — superseded by CR-2026-10-03-001..005 and the frozen contract
Note: classification block added 2026-10-03 during registry-sync audit; it was absent from the original report
```

---

## 1. Method

| Step | Evidence |
|---|---|
| Every `db.<collection>.<op>` in `backend/server.py` (31 calls) | `grep -n "db\.[a-z_]*\.(find|insert|update|delete...)"` |
| Mapped each call to its route + line | route decorator scan lines 340–1720 |
| Live vs dead: does any frontend file call the route? | `grep -rn "<route>" frontend/src` excluding `crmService.js` |
| Ownership | INV-2026-09-15-002 OWNERSHIP_MAP + live doc shapes |
| CRM replacement | `INV_017_openapi_scan_v2.json` (21 paths) |

**Live** = a frontend file calls the route today. **Dead** = no caller in `frontend/src` (the frontend already uses CRM's `crmService.js` for that function).

---

## 2. Collections we own (allowed — listed for completeness)

| Collection | Lines | Ops | Verdict |
|---|---|---|---|
| `customer_app_config` | 1054, 1205, 1211, 1228, 1253, 1271, 1344, 1361, 1375 | R + 7×W | OURS (OD-7). Not in scope of this rule. |
| `dietary_tags_mapping` | 1591, 1626 | R + W | OURS (owner decision O2 = A). |
| `status_checks` | 1477, 1482 | R + W | OURS. |
| `non_qr_blocks` | 1660–1716 | R + W | OURS. |

---

## 3. CRM-owned collections we touch directly — THE VIOLATION LIST

### 3A. `customers` — 11 call sites (2 live, 9 dead)

| # | Line | Route | Op | Live? | Frontend caller | CRM API that should replace it |
|---|---|---|---|---|---|---|
| C1 | 365 | `get_current_user` (customer token branch) | R | **DEAD** | our customer tokens are never issued (login customer branch is dead, see C3) | `GET /api/scan/auth/me` |
| C2 | 494 | `POST /api/auth/check-customer` | R (projection: name, phone, id, password_hash) | **LIVE** | `LandingPage.jsx:86, :607` — "does this phone exist? show name" | **GAP** — CRM has no "lookup by phone without token". Nearest: `POST /scan/auth/skip-otp` (but that *creates* the customer — side effect) |
| C3 | 531, 539 | `POST /api/auth/login` — Step 1 customer branch | R | **DEAD** | `Login.jsx` sends email+password only → always falls to Step 2 (admin). `AuthContext.login()` is defined but never called. | `POST /scan/auth/verify-otp` / `skip-otp` (already used by frontend) |
| C4 | 663 | `POST /api/auth/set-password` | R | **DEAD** | 0 callers | n/a — CRM customers have no password |
| C5 | 674 | same | **W** `update_one` (password_hash) | **DEAD** | 0 callers | n/a |
| C6 | 703 | same | **W** `insert_one` (new customer) | **DEAD** | 0 callers | `POST /scan/auth/register` |
| C7 | 728 | `POST /api/auth/verify-password` | R | **DEAD** | 0 callers | n/a |
| C8 | 1042 | `PUT /api/customer/profile` | **W** `update_one` | **DEAD** | 0 callers (frontend uses `crmService` → `PUT /scan/profile`) | `PUT /scan/profile` |
| C9 | 1044 | same | R | **DEAD** | — | — |
| C10 | 1539 | `GET /api/customer-lookup/{rid}?phone=` | R (name, points, tier, wallet) | **LIVE** | `ReviewOrder.jsx:418` — pre-fills name + shows points/tier at checkout before login | **GAP** — same as C2; `GET /scan/loyalty` requires customer token |

### 3B. `users` — 2 call sites (both live, admin only)

| # | Line | Route | Op | Live? | Caller | CRM API |
|---|---|---|---|---|---|---|
| U1 | 587 | `POST /api/auth/login` Step 2 (admin) | R — **no projection → loads `api_key`, `authkey_api_key`, `mygenie_token`** | **LIVE** | `Login.jsx:42` | **NONE** — CRM exposes no admin-login API for us |
| U2 | 367 | `get_current_user` (admin branch) → every admin request | R — no projection | **LIVE** | `AuthContext.jsx:41` (`/api/auth/me`) + every admin save | NONE |

### 3C. `orders`, `points_transactions`, `wallet_transactions`, `coupons` — 4 call sites (all dead)

| # | Line | Route | Op | Live? | CRM API |
|---|---|---|---|---|---|
| O1 | 820 | `GET /api/customer/orders` | R | **DEAD** (frontend uses `crmService.crmGetOrders`) | `GET /scan/orders` |
| P1 | 973 | `GET /api/customer/points` | R | **DEAD** | `GET /scan/points/history` |
| W1 | 997 | `GET /api/customer/wallet` | R | **DEAD** | `GET /scan/wallet/history` |
| K1 | 1016 | `GET /api/customer/coupons` | R | **DEAD** | `GET /scan/coupons` |

### 3D. `loyalty_settings` — 1 call site (live)

| # | Line | Route | Op | Live? | Caller | CRM API |
|---|---|---|---|---|---|---|
| L1 | 1496 | `GET /api/loyalty-settings/{rid}` | R (earn %, redemption value, min order, first-visit bonus) | **LIVE** | `ReviewOrder.jsx:145` — "you will earn N points" calculator at checkout, **before login** | **GAP** — `GET /scan/loyalty` returns the *customer's* balance (needs token), not the restaurant's *rules*. No public settings endpoint. |

### 3E. `feedback` — 2 call sites (1 live write, 1 dead read)

| # | Line | Route | Op | Live? | Caller | CRM API |
|---|---|---|---|---|---|---|
| F1 | 1303 | `POST /api/config/feedback` | **W** `insert_one` — **our schema** `{restaurant_id,name,email,rating,message}` into a collection whose only doc is CRM-shaped `{user_id,customer_id,customer_name,customer_phone,rating,message,status}` | **LIVE** | `FeedbackPage.jsx:34` | `POST /scan/feedback` |
| F2 | 1308 | `GET /api/config/feedback/{rid}` | R | **DEAD** — no admin page reads it | — |

---

## 4. Scorecard

| Collection (CRM-owned) | Call sites | Live | Dead | Writes | Live writes |
|---|---|---|---|---|---|
| `customers` | 11 | 2 | 9 | 3 | 0 |
| `users` | 2 | 2 | 0 | 0 | 0 |
| `orders` | 1 | 0 | 1 | 0 | 0 |
| `points_transactions` | 1 | 0 | 1 | 0 | 0 |
| `wallet_transactions` | 1 | 0 | 1 | 0 | 0 |
| `coupons` | 1 | 0 | 1 | 0 | 0 |
| `loyalty_settings` | 1 | 1 | 0 | 0 | 0 |
| `feedback` | 2 | 1 | 1 | 1 | **1** |
| **Total** | **20** | **6** | **14** | **4** | **1** |

Plus 11 call sites on our own 4 collections (allowed).

---

## 5. Classification of the 6 live violations

| Class | Items | What it takes to comply |
|---|---|---|
| **A — Wrong, fix now** | F1 `feedback` write | Switch `FeedbackPage.jsx` to `POST /scan/feedback` (CRM body: `customer_name, customer_phone, rating, message` + full-format `user_id`). Delete F1 + F2. Only need CRM to confirm request body. |
| **B — Acceptable exception, harden** | U1, U2 `users` reads | No CRM API exists for admin login. Keep the read, add a 6-field projection, get CRM's stable-interface promise (B4). |
| **C — Needs a CRM API that doesn't exist yet** | C2 `check-customer`, C10 `customer-lookup`, L1 `loyalty-settings` | All three run on the **pre-login** path (landing page phone capture, checkout points preview). CRM `/scan/*` is token-gated. Options: (i) ask CRM for 2 public endpoints — `GET /scan/customer/exists?phone=` and `GET /scan/loyalty/settings/{rid}`; (ii) fold the loyalty rules into `GET /scan/config/{rid}`; (iii) drop the pre-login name/points preview features. **Owner decision required.** |

## 6. The 14 dead call sites — delete

All routes in 3A (except C2, C10), 3C, and F2 have **zero frontend callers**. They are the "Customer API shim" from before the CRM `/scan/*` migration. Deleting them removes 12 of the 20 direct CRM-table touches with no user-visible change. This is the concrete scope of **CR-2026-09-12-006** (dead-route deletion) and no longer needs the ownership map to proceed — the map question is settled for these: CRM owns, we have no business reading.

Routes to delete: `/api/auth/set-password`, `/api/auth/verify-password`, customer branch of `/api/auth/login` (lines 531–585), customer branch of `get_current_user` (line 364–365), `GET/PUT /api/customer/profile`, `GET /api/customer/orders`, `/points`, `/wallet`, `/coupons`, `GET /api/config/feedback/{rid}`.

---

## 7. Questions raised

**For Owner**
- **O6** — Pre-login lookups (C2, C10, L1): ask CRM for public endpoints, fold into `/scan/config`, or drop the feature?
- **O7** — Approve deletion of the 14 dead call sites now (independent of the ownership map)?

**For CRM**
- **A5** — Exact request body of `POST /scan/feedback` (does it accept `email`? is `customer_phone` required? how is restaurant identified?).
- **A6** — Would CRM add `GET /scan/customer/exists?phone=&restaurant_id=` (no token, returns `{exists, name}` only) and `GET /scan/loyalty/settings/{rid}` (public rules)? Or include loyalty earn rules in `GET /scan/config/{rid}`?

---

```
Investigation complete: INV-2026-09-15-003
Root cause: LEGACY — pre-/scan/* "customer API shim" left in server.py; 14/20 CRM-table touches are dead code, 6 live (1 write with wrong schema, 2 admin-auth reads w/o projection, 3 pre-login reads with no CRM equivalent)
Classification: ARCHITECTURE / DATA-OWNERSHIP
Confidence: HIGH (code-grep + frontend caller trace + live doc shape)
Steps used: 6/10
Recommendation: (1) delete 14 dead sites (CR-006 scope, unblockable now) · (2) feedback → /scan/feedback (new CR) · (3) users projection (P0) · (4) owner O6 on pre-login lookups
```
