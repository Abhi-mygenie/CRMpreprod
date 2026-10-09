# Smoke Test Brief — CR-2026-10-03-001

<div class="meta">MyGenie Customer App · Change: "Old customer API code removed from the backend" · QA status: PASS — verified 2026-10-09 (test_reports/iteration_8.json, 28/28 + 61/61 regression) · Tester: ____________ · Date: ____________</div>

## What this is about

Before the CRM existed, our own backend handled diner sign-in, passwords, and the Profile page's orders/points/wallet. The CRM took all of that over months ago, but the old backend code was never removed. It was still there — nine endpoints, about 380 lines — reaching into database tables that now belong to the CRM, with nothing in the app calling it.

## What the change does

That old code is **deleted**. Nothing a diner or an admin does today used it, so **nothing should look or behave differently**. The one incidental fix: admin login now checks only the admin table (previously it looked in the customer table first, which could have handed an admin the wrong kind of token).

> **What must NOT have changed:** diner sign-in, menu, cart, ordering, Profile tabs, admin login, every admin page. If anything differs from yesterday, that is a FAIL.

## Before you start

| You need | Notes |
|---|---|
| Restaurant **478** | Standard test restaurant |
| Test phone **9579504871** | Known customer |
| Admin login | Credentials in `memory/test_credentials.md` |
| A browser | A fresh tab is fine |

## The test — 3 steps (about 6 minutes)

### Step 1 — Admin login and pages

1. Open `/login` and sign in as admin.
2. **Expected:** you land in the admin panel. No error.
3. From the admin menu (not by typing URLs), open **Visibility**, then **Settings**, then **Branding**. Each should load with its usual content.
4. In **Settings**, change one harmless thing (e.g. toggle a popup off and back on) and **Save**. **Expected:** success toast, no error.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Diner: sign-in → menu → cart → Review Order

1. Open the restaurant 478 home page.
2. Type **9579504871**, wait a second for the name to auto-fill, tap **Browse Menu**.
3. **Expected:** menu page, no error toast, no password/OTP screen.
4. Add one item, open the cart, go to **Review Order**.
5. **Expected:** page renders with your item and totals.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Profile tabs

1. From the menu, open **Profile** (hamburger menu).
2. Tap **Orders**, then **Points**. If the restaurant has Wallet enabled, tap **Wallet** too.
3. **Expected:** each tab shows data or an empty state — never a red error or a blank screen.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-03-001"**.
- Anything different → reply **"Smoke FAIL CR-2026-10-03-001 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
