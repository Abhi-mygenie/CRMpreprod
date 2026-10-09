# IMPACT OF CRM REPLY (2026-10-08) ON CUSTOMER APP ITEMS — read-only analysis, 2026-10-07/08

Source: `inbox/CRM_REPLY_IDENTITY_RULINGS_2026-10-08.md`. Author: E1 (Role 1 lens — no planning, no code, no registry mutation; proposals only).

## 1. The one hard deadline

**w/c 13 Oct 2026 — CRM CR-098 deletes `POST /scan/auth/register` and `POST /scan/auth/login`.**
Our `/password-setup` page calls exactly those two (`PasswordSetup.jsx:122` `crmRegister`, `:149` `crmLogin`). From that week, every diner routed to the password page (any restaurant with a `skipOtp*` flag **off** — 478 is one) hits a 404 and **cannot sign in**. This is the only item in the reply that turns into a production break on our side if we do nothing.

Verified footprint of the password page: `App.js` route · `LandingPage.jsx` (8 refs) · `RestaurantConfigContext.jsx` (3) · `AdminConfigContext.jsx` (1) · `crmSkipOtpRetry.js` (2) · `utils/otpPolicy.js` (4) · `PasswordSetup.jsx` itself. `skipOtp*` flags live in `server.py` model + defaults, `RestaurantConfigContext`, `AdminConfigContext`, `AdminVisibilityPage`, `LandingPage`, `otpPolicy.js`.

## 2. What it blocks / unblocks / changes — item by item

| Our item | Before the reply | After the reply | Blocked? |
|---|---|---|---|
| **CR-2026-10-07-002** OTP permanent deletion (INTAKE) | scope = 31 OTP-DEFERRED markers; `skipOtp*` + password page explicitly OUT ("ask CRM first") | CRM answered: **drop the password page, retire `skipOtp*`**. The exclusion reason is gone. Either widen this CR or register a sibling (see §3 proposal A). CR-084 confirmation to CRM still after our deletion | **Not blocked** — can start Planning now |
| **CR-2026-09-15-002** remove dead skip-otp 409/429 branches (INTAKE) | 409 = "phone locked to OTP → fall to password page" | With password page gone, the **409 fallback target disappears**; 429 now *is* real (CRM-089 abuse limiter → 429 + Retry-After). Scope flips: delete 409 path, **keep/handle 429** | Not blocked, but **must be re-scoped** before Planning |
| **CR-2026-10-03-004** pre-login reads → `lookup` + `loyalty-rules` (INTAKE) | lookup contract unknown | **Contract frozen** (body, response, 400/429, `null` name, oldest-dup rule). Must send `phone` digits + `country_code` separately | **Blocked until w/c 13 Oct** (CR-093 ships). Planning can start now against the frozen contract; Role 3 waits for 2xx on preview |
| **CR-2026-10-07-001** feedback guests hybrid (INTAKE) | blocked on CR-096, date unknown | Date **w/c 27 Oct**. Body must carry `phone` digits + `country_code` | **Blocked until w/c 27 Oct** |
| **CR-2026-10-03-003** feedback token path (SMOKE) | — | No change to shipped code. `crmSubmitFeedback` sends no phone (token path) — fine. Invariant 3 ("never call skip-otp from feedback") now matters more: skip-otp **creates** customers | **Not blocked** — owner smoke proceeds |
| **CR-2026-09-15-003** canonical phone POS↔CRM↔App (PARKED) | parked pending CRM normalisation | CRM owns normalisation (CR-085, before 27 Oct). Our part shrinks to "send digits + country_code separately"; `isPhoneValid` India-only (L6) means foreign diners still can't sign in via us — owner choice whether L6 stands | Stays PARKED; re-open after CR-085 |
| **CR-2026-09-15-001** Profile v2 adapter (INTAKE) | — | Unchanged; still the fix for `crmGetOrders` 404 (feedback `order_id`) | Not blocked |
| **CR-2026-09-14-001** OTP quarantine (SMOKE) | "restore when live" | Void (already annotated). Superseded by -002 | — |
| **BUG-2026-10-06-001** (SMOKE) | — | None | — |
| **Contract v1.0** | L4 "skip-otp logs in password-protected customers" · §4 rows for register/login/request-otp/verify-otp · L6 India-only | L4 becomes moot, 4 rows become "removed both sides", L6 needs an owner re-ruling given 143 foreign diners at 541. CRM will issue **v2** after waves — we annotate, not rewrite | — |

## 3. Proposals for the owner (not actioned)

**A. Register one identity CR (recommended) or widen -002.**
"Single identity path = skip-otp: remove `/password-setup`, `PasswordSetup.jsx`, `crmRegister`/`crmLogin`, `otpPolicy.js`, `crmSkipOtpRetry` 409 branch; retire `skipOtp*` flags (model, defaults, admin toggles, landing gate) → landing: phone → `lookup` (greet) → `skip-otp` → token."
- **Priority P1, deadline-driven (w/c 13 Oct).** Risk HIGH: `LandingPage.jsx` + `server.py` + `AuthContext` hotspots, config-key retirement (13 restaurants), customer-facing flow change.
- Recommend keeping -002 (dead OTP code, LOW) separate and shipping it first — it's the CRM-084 confirmation and has no deadline risk; the identity CR is the one that must land before 13 Oct.
- Sequencing option: ship **minimal** first (landing always takes the skip-otp branch regardless of flag; route `/password-setup` → redirect to `/<rid>`), retire flags/admin UI in a second step after 13 Oct.

**B. Re-scope CR-2026-09-15-002** to "delete 409 fallback, keep 429 handling with Retry-After toast" — one line in its intake.

**C. Owner re-ruling on L6 (India-only)** — now or defer to contract v2 review. If deferred, `lookup`/`skip-otp` keep `country_code: "+91"` hard-coded.

**D. Confirm the sequence CRM recommends — `lookup` then `skip-otp` on landing.** Our landing already does a lookup via our backend (`/api/auth/check-customer`, CR-2026-10-03-004 swaps it to CRM `lookup`). So the only new behaviour is "skip-otp always" — which is the identity CR.

## 4. Nothing in the reply touches shipped code today

Both items at SMOKE (BUG-2026-10-06-001, CR-2026-10-03-003) are unaffected. No action is required before the owner's smoke results.

```text
Impact read complete (no gate moved)
Hard deadline: w/c 13 Oct 2026 — password page breaks (CR-098)
Blocked now: CR-2026-10-03-004 (until CR-093, 13 Oct) · CR-2026-10-07-001 (until CR-096, 27 Oct)
Unblocked / re-scope: CR-2026-10-07-002 (skipOtp exclusion void) · CR-2026-09-15-002 (409→drop, 429→keep)
New item needed: identity CR (single path = skip-otp) — owner to say "register"
Owner decisions: A (register vs widen) · B · C (L6) · D
```
