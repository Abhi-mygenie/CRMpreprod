# Smoke Test Brief — BUG-2026-10-06-001

<div class="meta">MyGenie Customer App · Fix: "QR rule log now shows what it let through" · QA status: PASS 11/11 (2026-10-07) · Tester: ____________ · Date: ____________</div>

## What this is about

Some restaurants have a setting called **"Allow orders without QR"**. When it is switched **off**, a diner who opens the restaurant by typing the web address (instead of scanning the table QR) is stopped with a *"Session Expired — please rescan"* message.

## What was wrong

Until now the app only wrote a log entry when it **stopped** someone. It wrote **nothing** when it **let someone through** — for example a diner who scanned the walk-in QR, a takeaway or delivery order, someone editing an existing order, or restaurant 716 (which is deliberately exempt). So a restaurant looking at the log saw only "blocked" entries and had no way to tell whether the rule was being applied to everyone else or quietly bypassed.

## What the fix does

The app now writes a log entry for **every** decision — both "blocked" and "allowed" — together with the reason (e.g. *valid QR*, *takeaway*, *716 exemption*). This happens only at restaurants that have the setting switched **off**. Restaurants with the setting on (the default) are unaffected and still log nothing.

> **What must NOT have changed:** nobody should be blocked who wasn't blocked before, and nobody should get through who didn't before. If you see any difference in *who can order*, that is a FAIL — stop and report it.

## Before you start

| You need | Notes |
|---|---|
| A test restaurant | One where you can toggle **"Allow orders without QR"** in the admin settings |
| Its **walk-in QR** code or walk-in link | Ask the agent if you don't have it |
| A phone (or browser) | Clear the tab / use a fresh private window between steps |
| The agent on chat | You will ask it to read the log rows for you |

## The test — 3 steps (about 10 minutes)

### Step 1 — Rule OFF, legitimate diner

1. In admin, switch **"Allow orders without QR" → OFF** for the test restaurant.
2. On your phone, scan the **walk-in QR** (or open the walk-in link). Log in if prompted.
3. Tap **Browse Menu** → add any item → go to **Review Order** → place the order (or stop at the payment screen if you don't want a real order).
4. **Expected:** everything works exactly as it always has — no blocking message.
5. Ask the agent: *"show me the new rows for restaurant ___"*.
   **Expected:** **3 entries** (landing · add to cart · place order), each **`valid-qr` / allowed**.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 2 — Rule OFF, diner without QR

1. Keep the setting OFF. Close the tab / open a fresh private window.
2. Type the restaurant's web address directly — no QR, nothing after the address.
3. Tap **Browse Menu**.
4. **Expected:** the *"Session Expired — please rescan"* message appears and you cannot continue.
5. Ask the agent for the new row.
   **Expected:** **1 entry**, **`non-qr-dinein` / blocked**.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Step 3 — Rule ON (normal state)

1. In admin, switch **"Allow orders without QR" → ON** again.
2. Repeat Step 1 (walk-in QR → browse → add → review).
3. **Expected:** works as normal **and** when you ask the agent for new rows there are **none**.

Result: ☐ PASS ☐ FAIL — notes: ______________________________

### Optional extra (2 minutes)

Do Step 1 while **logged in** as a customer and ask the agent to confirm the "add to cart" row shows *logged in = yes*.

Result: ☐ PASS ☐ FAIL ☐ skipped

## Reporting

- All three steps match → reply **"Smoke PASS BUG-2026-10-06-001"**.
- Anything different → reply **"Smoke FAIL BUG-2026-10-06-001 — step N"** with what you saw and a screenshot. Do not try to work around it.

<div class="box"><b>Overall:</b> ☐ PASS &nbsp; ☐ FAIL &nbsp;&nbsp; Signed: ______________________ &nbsp; Date: ____________</div>
