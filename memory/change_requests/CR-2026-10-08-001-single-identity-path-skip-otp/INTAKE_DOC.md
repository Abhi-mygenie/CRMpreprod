# INTAKE DOC — CR-2026-10-08-001

## Item Identity

| Field | Value |
|-------|-------|
| **CR ID** | CR-2026-10-08-001 |
| **Title** | Single diner identity path = `skip-otp`: remove `/password-setup`, retire `skipOtp*` flags, landing = phone → (lookup) → `skip-otp` → token |
| **Classification** | **CR** — upstream-forced flow change with a hard deadline |
| **Date Registered** | 2026-10-08 |
| **Reported By** | CRM reply 2026-10-08 (owner-FINAL rulings a/b): "skip-otp is the ONLY path … drop the password page … `skipOtp*` flags can be retired"; CRM **CR-098** deletes `POST /scan/auth/register` + `POST /scan/auth/login` **w/c 13 Oct 2026** |
| **Intake by** | E1 (Role 1 — Intake, read-only) |
| **Priority** | **P1 — deadline-driven.** After w/c 13 Oct any restaurant with a `skipOtp*` flag **off** (e.g. 478) routes diners to a page that 404s → **cannot sign in** |
| **Risk** | **HIGH** — hotspots `LandingPage.jsx`, `AuthContext.jsx`, `server.py`; retires 6 live config keys at 13 restaurants; customer-visible flow change; §5.1 (identity) + §5.2 (order placement) regression mandatory |
| **Status** | 📝 REGISTERED (Role 1 done) — needs Planning **now** |
| **Blast radius** | Every diner sign-in at every restaurant; admin "Visibility/Auth" settings; 3 contexts; 1 route |

## 1. In one sentence

CRM is deleting password register/login the week of 13 Oct; our password page depends on both, so the
app must make the silent `skip-otp` login the only path before then and stop reading the per-restaurant
flags that still send diners to that page.

## 2. Evidence — from source this session

| Where | What |
|---|---|
| `PasswordSetup.jsx:122, :149` | `crmRegister` / `crmLogin` — the two calls that go 404 under CR-098. `:66-70 handleSkip` already does `crmSkipOtp` (the surviving path) |
| `LandingPage.jsx` (8 refs to `password-setup`) `:631-700` | `pickOtpFlag` → `shouldShowOtpPage(flag, {skipOtp*})` → `navigate('/password-setup')` **or** `silentSkipOtpAndNavigate` |
| `utils/otpPolicy.js:33, :61` | `pickOtpFlag`, `shouldShowOtpPage` — the gate |
| `crmSkipOtpRetry.js` (2 refs) | 409 → "fall through to password-setup" (OD-3 exception) — target disappears |
| `server.py:261-266`, `:1158±` | `skipOtpDineIn/Takeaway/Delivery/DineInWithTable/WalkIn/RoomOrders` model fields + defaults |
| `RestaurantConfigContext.jsx` (3), `AdminConfigContext.jsx` (1), `AdminVisibilityPage.jsx` | flags read / admin toggles |
| `App.js` | `<Route path="/:restaurantId/password-setup">` |
| CRM facts | 2 of 7,737 customers have a password, both test records → zero real diners lose anything |
| UAT config (read-only) | 478: `skipOtpDineIn:false, skipOtpWalkIn:false` → **478 breaks on 13 Oct** without this CR |

## 3. Scope (for Planning)

**Step 1 — must land before w/c 13 Oct (minimal, LOW-MEDIUM):**
- Landing: always take the `silentSkipOtpAndNavigate` branch (ignore `skipOtp*`); keep `lookup`-then-`skip-otp` order (today via `/api/auth/check-customer`; CR-2026-10-03-004 swaps to CRM `lookup`).
- `/password-setup` route → redirect to `/<rid>` (no dead page reachable from old links).
- `crmSkipOtpRetry.js`: 409 branch → treat as error toast (no fallback target); **keep 429 + `Retry-After`** (CRM-089 makes it real).

**Step 2 — after 13 Oct (cleanup, HIGH process):**
- Delete `PasswordSetup.jsx`, route, `otpPolicy.js`, `crmRegister`, `crmLogin`.
- Retire `skipOtp*`: remove from `server.py` model + defaults, contexts, admin toggles. **Config-key retirement at 13 restaurants** — needs the config write-lock note (OD-7) and a one-time DB field drop *proposed to CRM/DevOps* (shared DB; we don't run it).
- Phone payload: `skip-otp` sends `phone` **digits only** + `country_code` (default `+91`) separately (CRM ruling, phone-format section).

**Out:** OTP-DEFERRED dead code (CR-2026-10-07-002) · `lookup` adapter (CR-2026-10-03-004) · L6 India-only re-ruling (owner, contract v2) · any customer-record cleanup (CRM).

## 4. Acceptance (draft)

1. With `skipOtp*` all **false** at a test restaurant, phone + Browse Menu → menu, CRM token present, **no** `/password-setup` navigation.
2. Old link `/<rid>/password-setup` → lands on `/<rid>`.
3. `grep -rn "password-setup\|crmRegister\|crmLogin\b\|skipOtp" frontend/src backend/server.py` → 0 after Step 2.
4. `skip-otp` 429 → toast with wait time; 409 → generic error, no crash.
5. §5.1 + §5.2 regression; admin Visibility page renders without the auth toggles; public-config contract snapshot updated deliberately (flags removed).
6. CRM CR-098 CONFIRMED row observed before Step 2 deletes `crmRegister`/`crmLogin` (so nothing is deleted on our side while CRM still serves it — optional ordering, owner call).

## 5. Owner decisions at Planning

- D1 Two steps (minimal before 13 Oct, cleanup after) vs one shot? (rec: two steps)
- D2 Keep `skipOtp*` keys in the DB documents (ignored) or propose a field drop to CRM/DevOps? (rec: ignore now, drop with contract v2)
- D3 Delivery path today requires explicit login (`navigateAfterSkip`: "Please login to use delivery") — with skip-otp always, is the token enough for delivery? (rec: yes)

```text
Intake complete: CR-2026-10-08-001
Classification: CR · P1 (deadline w/c 13 Oct 2026) · HIGH
Blocked on: none for Step 1 · Step 2 after CRM CR-098 CONFIRMED
Related: CR-2026-10-07-002 · CR-2026-09-15-002 · CR-2026-10-03-004 · CR-2026-09-14-001 · CRM CR-098/093/089
Next: Planning (Role 2) — owner to say "Planning for CR-2026-10-08-001"
```
