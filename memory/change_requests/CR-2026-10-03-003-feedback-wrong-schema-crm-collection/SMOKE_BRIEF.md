# Smoke Test Brief — CR-2026-10-03-003

<div class="meta">MyGenie Customer App · Change: "Diner feedback now goes to CRM" · QA status: PASS 11/11 (2026-10-07) · Tester: ____________ · Date: ____________</div>

## What this is about

Diners can leave **Feedback** (stars + a message) from the restaurant's menu in the app. That feedback is meant to show up in the **CRM** so the restaurant can read it.

## What was wrong

The app sent feedback to **our own server**, which wrote it straight into the CRM's database in a format the CRM couldn't read. Nobody ever saw it — but the diner still got a "Thank you!" message. Feedback was going into a black hole.

## What the change does

- The app now sends feedback **directly to the CRM** using the diner's sign-in, so it appears in the CRM properly, linked to the right customer.
- The **Name** and **Email** boxes are gone — the CRM already knows who the diner is.
- Diners who are **not signed in** see a message asking them to sign in (from the home page, by entering their phone number). They cannot submit until they do. *(A later change will let guests leave feedback with just a phone number, once the CRM supports it.)*
- If the CRM is unavailable, the diner sees an honest "Failed to submit, please try again" — never a false "Thank you".

> **What must NOT have changed:** the rest of the app — home page, menu, cart, ordering — behaves exactly as before. The Feedback entry still appears/disappears according to the restaurant's "Feedback" setting in admin.

## Before you start

| You need | Notes |
|---|---|
| Test restaurant **478** (Feedback is enabled there) | Ask the agent if you'd like a different one |
| A phone number the CRM knows — the usual test number works | Entering it on the home page signs you in |
| A phone or browser, plus a **private/incognito window** | For the "not signed in" step |
| Someone with CRM access (or the agent) | To confirm the feedback arrived |

## The test — 3 steps (about 10 minutes)

### Step 1 — Signed-in diner leaves feedback

1. Open the restaurant's home page, enter your phone number (and name if asked), tap **Browse Menu**. If a password page appears, complete it or use the "skip" path.
2. Open the menu (☰) and tap **Feedback**.
3. **Expected:** you see **stars** and a **message box** only — **no Name or Email boxes**.
4. Pick 4 stars, type "Smoke test CR-003", tap **Submit Feedback**.
5. **Expected:** green tick **"Thank You!"** screen.
6. Ask CRM (or the agent) to confirm the feedback for your phone number is there, with rating 4 and your message.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Not signed in

1. Open a **private/incognito window** (so you are not signed in).
2. Go directly to `…/478/feedback`.
3. **Expected:** no form. A message — *"Feedback is available to signed-in diners. Sign in from the home page by entering your phone number."* — and a **Sign in** button.
4. Tap **Sign in**. **Expected:** you land on the restaurant's **home page**.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Nothing else moved

1. Back in your signed-in window: open the menu, add an item to the cart, open Review Order. **Expected:** all as usual.
2. Ask the agent: *"Did our server store any feedback today?"* **Expected answer:** "No — our server no longer stores feedback; it all went to CRM."

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Optional extra (2 minutes)

In admin, switch **Feedback** off for restaurant 478 and reload the home page. **Expected:** the Feedback entry disappears from the menu. Switch it back on afterwards.

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All steps match → reply **"Smoke PASS CR-2026-10-03-003"**.
- Anything different → reply **"Smoke FAIL CR-2026-10-03-003 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
