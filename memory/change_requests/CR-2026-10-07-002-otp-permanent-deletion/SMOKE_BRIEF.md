# Smoke Test Brief — CR-2026-10-07-002

<div class="meta">MyGenie Customer App · Change: "Old OTP code permanently deleted" · QA status: PASS 9/9 — verified 2026-10-08 (test_reports/iteration_6.json) · Tester: ____________ · Date: ____________</div>

## What this is about

Back in September the app's SMS-OTP login path was switched off because CRM's SMS service was never going live. Rather than delete the code then, we **commented it out** and tagged every piece with an `OTP-DEFERRED` marker — "restore when live".

On 8 Oct CRM confirmed in writing that OTP will **never** be implemented. The "restore when live" condition is void, so this change removes the dead code for good.

## What was wrong

Nothing was broken for the diner. The problem was hygiene: ~160 lines of commented-out code across 6 files (4 frontend, 1 admin, 1 backend), dead admin toggles for OTP settings, and two server routes (`/api/auth/send-otp`, `/api/auth/reset-password`) that existed only as comments. Dead code like this misleads future work and was blocking CRM from closing their CR-084.

## What the change does

All 31 `OTP-DEFERRED` markers and the code behind them are **deleted** — not commented, gone. Four OTP helper functions removed from the CRM service layer, the OTP helpers and routes removed from the server, and the hidden "Skip OTP" / "OTP Required" admin sections removed.

**No live code was touched.** The diner-facing flow (phone → name → Browse Menu → order) and the admin panel are byte-for-byte the same behaviour as before.

> **What must NOT have changed:** landing page sign-in, menu browsing, ordering, Profile tabs, and every admin page. If anything looks different from yesterday, that is a FAIL.

## Before you start

| You need | Notes |
|---|---|
| Restaurant **478** | Standard test restaurant |
| Test phone **9579504871** | Known customer |
| Admin login | Phone **+919579504871** / password in `memory/test_credentials.md` |
| A browser | A fresh tab is fine |

## The test — 4 steps (about 6 minutes)

### Step 1 — Diner sign-in still works

1. Open the restaurant 478 home page.
2. Type phone **9579504871**, wait 1 second for the name to auto-fill.
3. Tap **Browse Menu**.
4. **Expected:** you land on the menu page. No error toast, no blank screen, no password/OTP screen in between.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Add to cart and reach Review Order

1. Add any one item to the cart.
2. Tap the cart and proceed to **Review Order**.
3. **Expected:** Review Order page renders with your item and totals. No errors.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Admin panel unchanged, OTP section gone

1. Open `/login` and sign in as admin.
2. From the admin menu, go to **Visibility** (do not type the URL — use the menu, a hard reload loses the admin session).
3. **Expected:** you see the **Landing Page**, **Menu Page** and **Review Order Page** sections as usual.
4. **Expected:** there is **no** section titled "Skip OTP / Password Setup" and **no** "Auth" sub-tab with "OTP Required" toggles anywhere on the page.
5. Click through **Settings**, **Branding** and **Banners** — each should load normally.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 4 — Old server routes are gone (technical check, 1 minute)

Open a new tab and visit each URL below (replace `<app>` with the app domain):

- `https://<app>/api/auth/send-otp`
- `https://<app>/api/auth/reset-password`

**Expected:** both return **404 / "Not Found"** (a 405 "Method Not Allowed" is also acceptable — it means the route exists for a different method; for these two it must be 404).

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-07-002"**. This also unblocks sending `CRM_CONFIRMATION_NOTE.md` to CRM to close their CR-084.
- Anything different → reply **"Smoke FAIL CR-2026-10-07-002 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
