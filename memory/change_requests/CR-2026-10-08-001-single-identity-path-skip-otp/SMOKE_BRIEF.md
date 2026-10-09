# Smoke Test Brief — CR-2026-10-08-001 Step 1

<div class="meta">MyGenie Customer App · Change: "Password page removed — everyone goes straight to the menu" · QA status: PASS 9/10 (2026-10-08) · Tester: ____________ · Date: ____________</div>

## What this is about

When a diner opens the app and taps **Browse Menu**, they were sometimes sent to a **password page** before they could see the menu. This depended on a per-restaurant setting called "Skip OTP". Most restaurants had it switched off — meaning almost every diner hit the password page.

## What was wrong

The password page let diners register or log in with a password. The CRM (our identity provider) has now **removed that feature entirely** — the register and login routes no longer exist. Any diner routed to the password page would be completely stuck, with no way to get to the menu.

## What the change does

- Every diner now goes straight through **sign-in silently** (called "skip-otp") when they tap Browse Menu — no password page, no extra step. The per-restaurant "Skip OTP" settings are ignored. This was already the path for restaurants that had the setting switched on; it is now the path for everyone.
- The password page URL (`/password-setup`) now **redirects** to the restaurant's home page, so old bookmarks or back-button navigations land safely.
- If sign-in returns a rare error (the diner's account needs special handling), the diner continues as a **guest** and can still browse and order — they are never blocked.
- If too many sign-in attempts are made in a short time, the app shows a clear **"Please try again in X seconds"** message instead of silently failing.

> **What must NOT have changed:** the menu, cart, ordering, payment, feedback — everything else — behaves exactly as before. Diners should notice no difference except that the password screen no longer appears.

## Before you start

| You need | Notes |
|---|---|
| Restaurant **478** | This restaurant had the Skip OTP setting switched **off** — it is the exact case this change fixes |
| Test phone number **9579504871** | Or any phone the CRM knows for restaurant 478 |
| A phone or browser | Use a fresh private/incognito window for steps that require a "not signed in" state |

## The test — 3 steps (about 10 minutes)

### Step 1 — Phone + Browse Menu goes straight to the menu

1. Open a **private/incognito window** and go to the restaurant's home page (restaurant 478).
2. Enter phone number **9579504871** (and a name if asked). Tap **Browse Menu**.
3. **Expected:** you land on the **menu page** directly. The password / OTP page does **not** appear at any point.
4. Check the browser address bar — it should end with `/menu` or `/stations`, **not** `/password-setup`.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Old password page URL redirects safely

1. In the same or a new window, manually type (or paste) the restaurant's password page address:
   `…/478/password-setup`
2. **Expected:** you are **redirected** to the restaurant's home page (`/478`). You never see a password form.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Ordering still works end to end

1. From the home page (restaurant 478), enter the test phone and tap **Browse Menu**.
2. Add any item to the cart.
3. Tap **Review Order** → confirm the cart is correct.
4. **Expected:** the full flow works exactly as usual. No errors, no password prompts anywhere.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Optional extra (2 minutes)

On a restaurant that previously had "Skip OTP" switched **on** (e.g. restaurant 689), enter a phone and tap Browse Menu. **Expected:** behaves identically to Step 1 — no password page, lands on menu. The change should make no visible difference here since it was already working.

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-08-001"**.
- Anything different → reply **"Smoke FAIL CR-2026-10-08-001 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
