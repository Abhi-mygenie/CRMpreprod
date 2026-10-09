# IMPACT ANALYSIS — CR-2026-10-03-001
## Delete the dead CRM-table call sites in `server.py` (legacy customer API shim)

**Written by:** Role 2 — Planning Agent · **Date:** 2026-10-09 · **Risk:** HIGH by file (Part C hotspot `backend/server.py`) · **Priority:** P3 · **No Fast Lane**
**Owner rulings 2026-10-09:** D1 = (a) delete outright · D2 = (a) trim login models · D3 = (a) backend-only, `AuthContext.login()` → CR-2026-09-15-004
**Code reality re-verified today** on the live `server.py` (1,741 lines) — intake line numbers from 3 Oct are stale and replaced below.

---

## 1. What is being removed — current line numbers

| # | Lines | Route / branch | CRM collection | Op | Why dead (verified today) |
|---|---|---|---|---|---|
| C1 | 357–358 | `get_current_user` — `user_type == "customer"` branch | `customers` | R | No customer JWT is ever minted after this CR (C3/C4/C7 gone) → branch unreachable |
| C3 | 440–496 | `POST /api/auth/login` Step 1 — customer lookup + customer `LoginResponse` | `customers` | R×2 | `Login.jsx:42` sends `phone_or_email`+`password` only — admin flow. The only caller that sent `restaurant_id` is `AuthContext.login()` (L146), which **nothing calls** (grep: defined L146, exported L224, zero invocations) |
| C4–C6 | 553–622 | `POST /api/auth/set-password` | `customers` | R, W, insert | 0 frontend callers (`PasswordSetup.jsx` only has a *UI state* named `'set-password'`, it calls CRM `crmSkipOtp`) |
| C7 | 624–668 | `POST /api/auth/verify-password` | `customers` | R | 0 frontend callers |
| — | 674–692 | `GET /api/customer/profile` | (reads `user` dict) | — | Profile reads CRM `/scan/auth/me` (`crmService.js:353`) |
| O1 | 694–716 | `GET /api/customer/orders` | `orders` | R | Profile reads CRM `/scan/orders` (CR-2026-09-15-001) |
| P1 | 847–869 | `GET /api/customer/points` | `points_transactions` | R | Profile reads CRM `/scan/points/history` |
| W1 | 871–889 | `GET /api/customer/wallet` | `wallet_transactions` | R | Profile reads CRM `/scan/wallet/history` |
| K1 | 891–907 | `GET /api/customer/coupons` | `coupons` | R | 0 frontend callers |
| C8–C9 | 909–929 | `PUT /api/customer/profile` | `customers` | W, R | 0 frontend callers |
| F2 | — | `GET /api/config/feedback/{rid}` | `feedback` | R | **already gone** (CR-2026-10-03-003, 7 Oct) |

**13 collection touches** across **9 routes/branches** → matches the registry note (14 → 13).

**Orphans that fall out with them**
- Router: `customer_router` (L89) becomes empty → delete definition + `include_router` (L1590) + "Customer Routes" header (L670–672).
- Models with zero remaining uses after deletion: `CustomerProfile` (L113), `OrderSummary` (L127), `PointsTransaction` (L136), `SetPasswordRequest` (L276), `VerifyPasswordRequest` (L284), **`ResetPasswordRequest` (L290 — already orphaned by CR-2026-10-07-002, 0 uses today)**.
- Model fields used only by the customer branch: `LoginRequest.restaurant_id` / `.pos_id`, `LoginResponse.restaurant_context`.
- Helpers: `verify_password()` (L374) **stays** — admin branch L515 uses it. `uuid` **stays** — 7 other uses. `bcrypt` imports inside deleted functions go with them.

## 2. What stays — the live CRM-boundary sites (OUT of scope, must not move)

| Lines | Route | Owned by |
|---|---|---|
| 360, 499 | `db.users` reads (admin auth, with projection) | CR-2026-09-15-004 |
| 1343–1376 | `GET /api/loyalty-settings/{rid}` → `db.loyalty_settings` | CR-2026-10-03-004 B+C |
| 1378–1400 | `GET /api/customer-lookup/{rid}` → `db.customers` | CR-2026-10-03-004 (ReviewOrder.jsx:418 still calls it) |

After this CR the grep `db.customers|db.orders|db.points_transactions|db.wallet_transactions|db.coupons` returns **exactly one** hit — L1390 (`customer-lookup`).

## 3. Data-flow trace — before / after

```
Admin browser  Login.jsx ─► POST /api/auth/login ─► [Step 1 customers ✂] ─► Step 2 db.users ─► JWT(restaurant)
                           AuthContext ─► GET /api/auth/me ─► get_current_user ─► [customer branch ✂] ─► db.users

Diner browser  LandingPage ─► CRM /scan/auth/lookup + /scan/auth/skip-otp   (untouched)
               Profile     ─► CRM /scan/auth/me, /scan/orders, /scan/loyalty… (untouched)
               ReviewOrder ─► GET /api/customer-lookup/{rid}                  (untouched, OUT)
```
Nothing a diner or admin does today passes through any ✂ block.

## 4. Behaviour change for a real user

| Actor | Before | After |
|---|---|---|
| Admin | login → JWT, `/me` works | **identical** — Step 2 path byte-for-byte unchanged |
| Diner | never touched these routes | **identical** |
| Anyone hitting a deleted URL | 200/4xx | **404** (routes gone) |

## 5. Risks

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| R1 | Deleting the Step 1 block changes admin login behaviour (e.g. an admin whose email also exists in `customers` previously got a *customer* token) | Low | That was a latent bug, not a feature — admins must get a restaurant token. Smoke test: admin login → `user_type == "restaurant"` (already in `test_auth_flows.py`, `test_cr_2026_10_03_002.py`) |
| R2 | Orphaned name left behind → `NameError` at import | Low | E-last: `python -c "import server"` + `/api/healthz`; AST pass for unused classes |
| R3 | Hotspot file edit collides with CR-2026-09-15-004 (same two functions) | Medium | **Sequence: this CR lands first.** 09-15-004 is INTAKE — no concurrent edit |
| R4 | A hidden external caller (e.g. an old test script, QA tool) uses `/api/customer/*` | Very low | None in `backend/tests`, `frontend/src`; CRM/POS do not call our `/api/*`. Acceptable — routes return 404, no data risk |
| R5 | Line-number drift between plan and execution | Certain | Role 3 locates by **function name**, not line |

## 6. Conflicts with active items

| Item | Relationship | Conflict? |
|---|---|---|
| CR-2026-10-03-004 Parts B+C | touches `loyalty-settings` + `customer-lookup` (L1343–1400) | **No** — disjoint lines; those are OUT here |
| CR-2026-09-15-004 | rewrites admin branch of `get_current_user` + `unified_login` | **Sequenced** — this first |
| CR-2026-10-08-001 Step 2 | deletes `PasswordSetup.jsx` (frontend) | No — frontend is OUT here |
| CR-2026-09-12-006 (modular split) | blocked on CR-005 | No — fewer lines to split later |
| Contract snapshots `backend/tests/contracts/*` | none cover `/api/customer/*` or set/verify-password | No snapshot update |

## 7. Files

**WILL change:** `backend/server.py` · `backend/tests/smoke/test_cr_2026_10_03_001.py` (new)
**WILL NOT touch:** any `frontend/` file (incl. the dead `AuthContext.login()` — see D3) · `.env` · `customer-lookup` · `loyalty-settings` · `db.users` reads · contract snapshot fixtures · DB documents

## 8. Owner decisions

| ID | Decision | Options | Ruling (2026-10-09) |
|---|---|---|---|
| **D1** | Delete outright vs quarantine with `# CR-2026-10-03-001:` markers | (a) delete · (b) quarantine | **RULED (a) delete** — precedent CR-2026-10-07-002: quarantine produced 31 dead markers that needed a second CR to remove |
| **D2** | Trim `LoginRequest.restaurant_id/pos_id` and `LoginResponse.restaurant_context` (only the dead branch used them) | (a) trim · (b) leave | **RULED (a) trim** — Pydantic ignores extra fields, so `Login.jsx` is unaffected either way |
| **D3** | Frontend dead `AuthContext.login()` (L146–~200) | (a) leave, fold into CR-2026-09-15-004 which already owns `AuthContext.jsx` · (b) widen this CR to frontend | **RULED (a) leave** — keep this CR backend-only as intaken; deletion folded into CR-2026-09-15-004 scope |

```text
Planning complete: CR-2026-10-03-001
Stage: Impact Analysis
Code reality: FULL (removal only) — 13 touches / 9 routes+branches verified by name on live server.py; 0 frontend callers
Risk: HIGH by file (Part C hotspot), LOW by behaviour
Files WILL change: backend/server.py · backend/tests/smoke/test_cr_2026_10_03_001.py (new)
Files WILL NOT touch: frontend/* · .env · customer-lookup · loyalty-settings · db.users reads · contract snapshots
Owner decisions: D1 (a) delete · D2 (a) trim · D3 (a) backend-only — ALL RULED 2026-10-09
Docs: memory/change_requests/CR-2026-10-03-001-delete-dead-crm-table-call-sites/IMPACT_ANALYSIS.md
Next: Implementation Plan (same session)
```
