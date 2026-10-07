# CR-084 (expanded) + CR-097 — Impact Analysis
## Remove Customer OTP flow (`scan.py`) · Remove Staff password management (`auth.py` + CRM UI)

**Date**: 2026-10-08
**Role**: Planning Agent — Impact Analysis stage. **No implementation plan executed, no code changed.**
**Risk**: **HIGH** (auth-adjacent, API contract removal, two public route blocks). Not CRITICAL: no money, no customer data write, all removals are of dead/disabled paths.
**Owner rulings this session** (verbatim intent):
1. "we want to remove otp flow entirely" → CR-084 scope expanded from *hide `dev_otp`* to *delete customer OTP routes*.
2. "CRM user logs in from pos creds" → confirmed by code (§2.1). Staff forgot-password OTP is dead.
3. "we dont need change password in UI or backend any where in CRM" → `PUT /auth/reset-password` + Dashboard modal also removed.
4. WhatsApp "Reset Password (OTP)" automation option → remove in same CR (owner picked option a).
**Status**: ✅ **IMPACT ANALYSIS GATE CLOSED 2026-10-08 (owner).** Next gate: Implementation Plan (not yet opened). D-1/D-2/D-3 carried forward to Implementation Plan stage.

---

## 1. Registration

| Item | Status |
|---|---|
| CR-084 | ✅ Registered 2026-09-15 (P1/HIGH). Scope **superseded** by owner ruling #1 — original "gate behind `OTP_DEV_MODE`" is moot when the route is deleted. |
| CR-097 | 🆕 Registered in this analysis (`CR_STATUS_DASHBOARD.md` row 097). P1/HIGH. Source: owner ruling #2/#3 during CR-084 scoping. |
| CR-090 (customer OTP delivery provider) | ⚠️ Becomes **OBSOLETE** — no OTP flow left to deliver for. Recommend owner closes it (see §8 D-1). |
| CR-029 (Forgot Password link disabled) | Fully resolved by CR-097; the "re-enable later" note is retired. |

---

## 2. Code reality — **FULL (dead code exists; must be removed)**

### 2.1 Why staff password management is dead — login is POS-only
`routers/auth.py`
- `POST /auth/login` (L154-160) → calls `mygenie_login`.
- `POST /auth/mygenie-login` (L360-568) → `httpx` POST to `MYGENIE_API_URL + MYGENIE_LOGIN_ENDPOINT`. Local `db.users.password_hash` is **written** (L446, L509) as a cache but **never read** at login. The only reader of `password_hash` is `PUT /auth/reset-password` (L348) itself.
- DB: `users` = 40 docs, **40/40 have `pos_id`** → every CRM user was provisioned via POS login. Zero locally-registered users.
- Conclusion: changing a local password has no effect on the ability to log in. The feature is misleading to owners.

### 2.2 Inventory of what exists today

| # | Artefact | Location | State | DB touched |
|---|---|---|---|---|
| A1 | `import random` | `scan.py:10` | only used by A4 | — |
| A2 | `class OTPRequest` | `scan.py:52-55` | only used by A4 | — |
| A3 | `class OTPVerify` | `scan.py:57-60` | only used by A5 | — |
| A4 | `POST /scan/auth/request-otp` | `scan.py:186-227` | **LIVE, returns `dev_otp` plaintext** (GAP-05) | `customer_otps` R/W |
| A5 | `POST /scan/auth/verify-otp` | `scan.py:230-295` | LIVE; mints 24h customer JWT; auto-creates customer | `customer_otps` R/W, `customers` W |
| B1 | `import random` | `auth.py:6` | only used by B3 | — |
| B2 | `OTP_EXPIRY_MINUTES`, `generate_otp()` | `auth.py:108-114` | only used by B5 | — |
| B3 | `POST /auth/register` | `auth.py:117-152` | LIVE; creates local user POS can't log in | `users` W, `loyalty_settings` W |
| B4 | `PUT /auth/reset-password` | `auth.py:328-358` | LIVE; UI-reachable from Dashboard menu | `users` W |
| B5 | `POST /auth/forgot-password/request-otp` | `auth.py:573-656` | LIVE; **returns `otp` in body in both branches** (L644, L653) | `otp_tokens` W, `users` R |
| B6 | `POST /auth/forgot-password/verify-otp` | `auth.py:659-705` | LIVE | `otp_tokens` R/W |
| B7 | `POST /auth/forgot-password/reset` | `auth.py:708-780` | LIVE; auto-login on success | `otp_tokens` R/D, `users` W |
| C1 | `"reset_password"` in `CRM_EVENTS` | `models/schemas.py:1255` | listed as selectable automation | — |
| C2 | `reset_password` description | `routers/whatsapp.py:108` | feeds `GET /whatsapp/events` (L130-133) and `GET /whatsapp/message-filters` (L2011) | — |
| D1 | Forgot-password modal + 3 handlers + 7 state vars | `LoginPage.jsx:19-31, 66-150, 216-226 (commented btn), 241-~385` | button **commented out since CR-029**; modal unreachable | — |
| D2 | "Reset Password" menu item + modal + handler + 5 state vars | `DashboardPage.jsx:37-71, 251-256, 273-325` | **LIVE in UI** | calls B4 |
| D3 | `RegisterPage.jsx` + route `/register` | `pages/RegisterPage.jsx` (122 LOC), `App.js:8,46` | LIVE by URL only — **no link to it anywhere** (grep: 0 `to="/register"`) | calls B3 via `AuthContext.register` |
| D4 | `register()`, `setUserAndToken()` | `AuthContext.jsx:69-72, 85-90, 100` | `register` used only by D3; `setUserAndToken` used only by D1 | — |
| D5 | `LOGIN.forgotPasswordLink`, `LOGIN.registerLink`, `REGISTER.*` | `constants/testIds/auth.js` | **0 imports anywhere** (dead constants) | — |
| D6 | `"reset_password"` label + description | `WhatsAppAutomationContent.jsx:370, 411` | renders dead option in automation picker | — |

### 2.3 DB state (preprod, 2026-10-08, read-only)
| Collection | Docs | Notes |
|---|---|---|
| `customer_otps` | **5** | last write 2026-09-14 (Customer App test). Drop candidate after cutover. |
| `otp_tokens` | **0** | never used in preprod. Drop candidate. |
| `whatsapp_event_template_map` | 0 rows with `event_key: reset_password` | no tenant ever mapped a template to it → safe to remove the event. |
| `customers.password_hash` | 2 docs | from `POST /scan/auth/register` (customer, **stays**). Unaffected. |

---

## 3. Data-flow trace — what the removals sever

```
Customer App ──► POST /scan/auth/request-otp ──► customer_otps ──► POST /scan/auth/verify-otp ──► customers(create) + JWT
                 [REMOVED A4]                                      [REMOVED A5]
Customer App ──► POST /scan/auth/skip-otp  ──► customers(find/create) + JWT         ◄── STAYS (only live login per CR-089)
Customer App ──► POST /scan/auth/register  ──► customers(password_hash)             ◄── STAYS
Customer App ──► POST /scan/auth/lookup                                              ◄── CR-093 (not yet built)

CRM UI Login ──► POST /auth/login ──► mygenie_login ──► POS                          ◄── STAYS (untouched)
CRM UI Login ──► [commented btn] ──► forgot-password/* ──► otp_tokens ──► users.password_hash   [REMOVED B5-B7, D1]
CRM Dashboard ─► Reset Password modal ──► PUT /auth/reset-password ──► users.password_hash      [REMOVED B4, D2]
/register URL ─► RegisterPage ──► POST /auth/register ──► users + loyalty_settings              [REMOVED B3, D3]
WhatsApp Automation picker ──► "Reset Password (OTP)" ──► trigger_whatsapp_event("reset_password") called ONLY from B5  [REMOVED C1, C2, D6]
```

**No remaining caller** for any removed artefact after the full set is deleted (verified by grep across `backend/`, `frontend/src/`; see §2.2 "state" column).

---

## 4. Downstream consumers / external contracts

| Consumer | Impact | Evidence |
|---|---|---|
| **Customer App** | Must not call `request-otp` / `verify-otp`. | Owner: "we don't have any otp validation in customer app". INV-022/Contract v1.0: Customer App auths against POS (C1 option a); CRM customer identity via `skip-otp` today → `lookup` (CR-093). **Action: notify Customer App agent of 404 date** (handoff note, §8 D-2). |
| **POS** | None. POS uses `/api/pos/*` with `X-API-Key`; no OTP or password routes. | `pos.py` grep: 0 refs. |
| **CRM staff users** | Lose a non-functional "Reset Password" menu item. No functional loss (POS owns the password). | §2.1 |
| **WhatsApp automation tenants** | Lose a never-configured option. | 0 template mappings (§2.3) |
| **QA / qabot** | `data-testid`s removed: `reset-password-btn`, `current-password-input`, `new-password-input`, `confirm-password-input`, `submit-reset-password`, `forgot-password-btn`, `register-*`. | Any existing QA scripts referencing them must be updated. `tests/` folder: 0 refs. |
| **Docs** | `Old API doc/API_DOC_CRM_APP.md`, `SCAN_ORDER_API.md`, `WHATSAPP_EVENT_TRIGGERS_COMPLETE_REFERENCE.md`, `SECURITY_AUDIT_2026-09-08.md`, INV-017 contract docs list these routes. | Mark as REMOVED in CLOSURE, not during implementation. |

---

## 5. Risk assessment

| Dimension | Rating | Why |
|---|---|---|
| Auth-adjacent | HIGH | Touching `auth.py` and `scan.py` auth blocks. Mitigation: deletions only; `mygenie_login`, `get_current_user`, `skip-otp`, customer `register` untouched. |
| API contract | HIGH | 7 routes → 404. Mitigation: all are dead or owner-declared unwanted; Customer App notified. |
| Data | LOW | No prod data modified. Collections `customer_otps`/`otp_tokens` left in place (drop is a separate, reversible owner decision — §8 D-3). |
| Security | **POSITIVE** | Closes GAP-05 (customer `dev_otp` leak) **and** the staff `otp`-in-response leak (CR-029 root cause). Removes an unauthenticated user-creation route (`/auth/register`). |
| Regression surface | MEDIUM | Frontend: `LoginPage`, `DashboardPage`, `App.js`, `AuthContext` all edited. Mitigation: E2E — POS login, dashboard menu, logout, WhatsApp automation page render. |
| Rollback | LOW | Pure deletions; git revert restores. |

**Overall: HIGH → full gate flow + regression checklist (per system prompt §risk table).** Owner approval already given for scope; implementation gate still needs explicit "go".

---

## 6. Files WILL change / WILL NOT touch

**WILL change (10)**
| File | Change |
|---|---|
| `backend/routers/scan.py` | delete A1-A5 |
| `backend/routers/auth.py` | delete B1-B7 (keep `string` import only if still used elsewhere — verify at impl) |
| `backend/models/schemas.py` | remove `"reset_password"` from `CRM_EVENTS` |
| `backend/routers/whatsapp.py` | remove `reset_password` description entry |
| `frontend/src/pages/LoginPage.jsx` | delete D1 (modal, handlers, state, commented button, `setUserAndToken` import) |
| `frontend/src/pages/DashboardPage.jsx` | delete D2 |
| `frontend/src/pages/RegisterPage.jsx` | **delete file** |
| `frontend/src/App.js` | remove `RegisterPage` import + `/register` route (keep `/register-customer/:restaurantId`) |
| `frontend/src/contexts/AuthContext.jsx` | remove `register`, `setUserAndToken` + provider exports |
| `frontend/src/components/shared/WhatsAppAutomationContent.jsx` | remove `reset_password` label + description |
| `frontend/src/constants/testIds/auth.js` | remove `forgotPasswordLink`, `registerLink`, `REGISTER` block |

**WILL NOT touch**
- `auth.py`: `mygenie_login`, `/me`, `/logout`, `register_crm_token_with_pos`, `password_hash` caching lines (L446, L509)
- `core/auth.py` (`hash_password`, `verify_password` still used by `scan.py` customer register/login)
- `scan.py`: `skip-otp`, customer `/auth/register`, customer password login, everything after L298
- `core/whatsapp.py` `trigger_whatsapp_event` (generic)
- `pages/CustomerRegistrationPage.jsx` + its route (customer-facing, different feature)
- MongoDB collections (no drop in this CR)
- `.env`, `server.py`, `requirements.txt`, `package.json`

---

## 7. Verification matrix (to be executed at IMPLEMENTATION, backend testing agent + screenshot)

| # | Check | Expected |
|---|---|---|
| V1 | `POST /api/auth/login` with `owner@thegoankitchen.com` | 200 + JWT (POS login unaffected) |
| V2 | `GET /api/auth/me` with JWT | 200 |
| V3 | `POST /api/scan/auth/request-otp`, `verify-otp` | 404 |
| V4 | `POST /api/auth/forgot-password/request-otp`, `verify-otp`, `reset`; `PUT /api/auth/reset-password`; `POST /api/auth/register` | 404 (or 405) |
| V5 | `POST /api/scan/auth/skip-otp` `{phone, restaurant_id}` | 200 + token (unchanged) |
| V6 | `GET /api/whatsapp/events` | `crm_events` has no `reset_password` |
| V7 | Dashboard profile menu | no "Reset Password" item; Logout still works |
| V8 | `/register` URL | falls to app's default route (no crash) |
| V9 | `/login` page renders, no console errors; WhatsApp Automation page renders event list without `reset_password` |
| V10 | `grep -rn "request-otp\|verify-otp\|forgot-password\|reset-password\|otp_tokens\|customer_otps\|RegisterPage\|setUserAndToken" backend frontend/src` | 0 hits (except `skip-otp`) |
| V11 | Backend boots clean (`supervisorctl status`, no import errors from removed `random`/`string`) | RUNNING |

---

## 8. Owner decisions — surfaced, **not assumed**

| # | Decision | Recommendation | Status |
|---|---|---|---|
| D-1 | Close **CR-090** (customer OTP delivery provider) as OBSOLETE? | Yes — nothing left to deliver OTPs for. | ⏸ |
| D-2 | Send Customer App agent a one-line change notice ("`request-otp`/`verify-otp` → 404 on preprod from <date>; use `skip-otp` now, `lookup` after CR-093")? | Yes, at implementation. | ⏸ |
| D-3 | Drop `customer_otps` (5 docs) and `otp_tokens` (0 docs) collections? | Defer to a later hygiene CR; no value, no risk either way. | ⏸ |
| D-4 | Approve **Implementation Plan** writing + execution for CR-084 + CR-097 as scoped in §6? | — | ⏸ **GATE** |

---

## 9. Planning output

```text
Planning complete: CR-084 (expanded) + CR-097
Stage: Impact Analysis
Code reality: FULL (dead code present, to be removed)
Risk: HIGH (auth-adjacent, contract removal; security-positive)
Files WILL change: scan.py, auth.py, schemas.py, whatsapp.py, LoginPage.jsx, DashboardPage.jsx, RegisterPage.jsx (delete), App.js, AuthContext.jsx, WhatsAppAutomationContent.jsx, testIds/auth.js
Files WILL NOT touch: mygenie_login block, core/auth.py, skip-otp, customer register/login, CustomerRegistrationPage, DB collections, .env
Owner decisions: D-1 (close CR-090), D-2 (notify Customer App), D-3 (drop collections — defer), D-4 (implementation gate)
Docs: planning/CR_084_CR_097_IMPACT_ANALYSIS.md · CR_STATUS_DASHBOARD.md rows 084/097 + transitions
Next: Gate approval (D-4) → Implementation Plan → Implementation
```
